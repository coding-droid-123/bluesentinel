import React, { useState, useRef, useCallback } from 'react'
import ReportPanel from './components/ReportPanel'
import LoadingOverlay from './components/LoadingOverlay'
import HomePage from './components/HomePage'
import AboutPage from './components/AboutPage'
import UploadPage from './components/UploadPage'
import ROVSimulator from './components/ROVSimulator'
import CleanupOptimizer from './components/CleanupOptimizer'

const PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#ea580c']

function App() {
  // pages: 'home' | 'about' | 'dashboard' | 'rov' | 'optimizer'
  const [page, setPage] = useState('home')
  const [imageSrc, setImageSrc] = useState(null)
  const [annotatedSrc, setAnnotatedSrc] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileMeta, setFileMeta] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const fileInputRef = useRef(null)

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file)
    setFileMeta({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB' })
    setErrorMessage(null)
    setResults(null)
    setAnnotatedSrc(null)
    const reader = new FileReader()
    reader.onload = (e) => setImageSrc(e.target.result)
    reader.readAsDataURL(file)
    setPage('dashboard')
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return
    setIsAnalyzing(true)
    setErrorMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      const response = await fetch('http://localhost:8000/detect', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) throw new Error('Server returned ' + response.status)
      const data = await response.json()

      // Annotated image (server draws bounding boxes)
      if (data.image) setAnnotatedSrc('data:image/jpeg;base64,' + data.image)

      const rawDetections = data.detections || []
      const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 }
      const items = rawDetections.map((d, idx) => ({
        name: d.class
          .replace(/^trash_|^animal_/, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        confidence: Math.round(d.confidence * 1000) / 10,
        color: PALETTE[idx % PALETTE.length],
        box: d.box || null,
        severity: d.severity || 'medium',
        rawClass: d.class,
      }))

      const totalCount = items.length
      const avgConf = totalCount
        ? (items.reduce((a, c) => a + c.confidence, 0) / totalCount).toFixed(1)
        : 0
      const uniqueTypes = new Set(items.map((i) => i.name)).size
      const highestSeverity = items.length > 0
        ? items.reduce((maxSev, item) =>
            (SEVERITY_RANK[item.severity] || 1) > (SEVERITY_RANK[maxSev] || 1)
              ? item.severity
              : maxSev,
          'low')
        : 'low'

      setResults({
        batchId: data.batch_id || ('SCAN-' + Date.now()),
        items,
        totalCount,
        avgConfidence: avgConf + '%',
        debrisTypes: uniqueTypes,
        severity: highestSeverity,
      })
    } catch (err) {
      setErrorMessage(
        'Backend error: ' + err.message +
        '. Make sure the FastAPI server is running on http://localhost:8000'
      )
    } finally {
      setIsAnalyzing(false)
    }
  }, [selectedFile])

  const handleClear = useCallback(() => {
    setImageSrc(null)
    setAnnotatedSrc(null)
    setSelectedFile(null)
    setFileMeta(null)
    setResults(null)
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPage('home')
  }, [])

  // ── Route rendering ────────────────────────────────────────────────────
  if (page === 'rov')       return <ROVSimulator onNavigate={setPage} />
  if (page === 'optimizer') return <CleanupOptimizer onNavigate={setPage} />
  if (page === 'about')     return <AboutPage onNavigate={setPage} />
  if (page === 'home')      return <HomePage onFileSelect={handleFileSelect} onNavigate={setPage} />

  // Dashboard (image detection)
  return (
    <>
      <UploadPage
        imageSrc={imageSrc}
        annotatedSrc={annotatedSrc}
        fileMeta={fileMeta}
        isAnalyzing={isAnalyzing}
        results={results}
        errorMessage={errorMessage}
        onAnalyze={handleAnalyze}
        onClear={handleClear}
        onFileSelect={handleFileSelect}
        onFileReplace={handleFileSelect}
        onOpenReport={() => setIsReportOpen(true)}
        onDismissError={() => setErrorMessage(null)}
        onNavigate={setPage}
      />
      <ReportPanel
        results={results}
        annotatedSrc={annotatedSrc}
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
      />
      <LoadingOverlay active={isAnalyzing} />
    </>
  )
}

export default App
