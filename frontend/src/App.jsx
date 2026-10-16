import React, { useState, useRef, useCallback, useEffect } from 'react'
import ReportPanel from './components/ReportPanel'
import LoadingOverlay from './components/LoadingOverlay'
import HomePage from './components/HomePage'
import AboutPage from './components/AboutPage'
import UploadPage from './components/UploadPage'
import ROVSimulator from './components/ROVSimulator'
import CleanupOptimizer from './components/CleanupOptimizer'
import HistoryPage from './components/HistoryPage'
import { addHistoryRecord } from './hooks/useHistory'
import { API_BASE_URL } from './config'

const PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#ea580c']

function App() {
  // pages: 'home' | 'about' | 'dashboard' | 'rov' | 'optimizer' | 'history'
  const [page, setPage] = useState(() => {
    try {
      const saved = sessionStorage.getItem('bluesentinel_session_page')
      return saved === 'batch' ? 'home' : (saved || 'home')
    } catch {
      return 'home'
    }
  })

  // Sync active page to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('bluesentinel_session_page', page)
    } catch {}
  }, [page])

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
    // Record search query into history immediately
    try {
      addHistoryRecord({
        type: 'image',
        label: file.name || 'Image Upload Search',
        summary: { totalObjects: 0, debrisCount: 0, highestSeverity: 'low', uniqueTypes: 0 },
        location: 'Single Frame Search & Ingestion',
      })
    } catch {}
    setPage('dashboard')
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return
    setIsAnalyzing(true)
    setErrorMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      const response = await fetch(`${API_BASE_URL}/detect`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) throw new Error('Server returned ' + response.status)
      const data = await response.json()

      // Annotated image (server draws bounding boxes)
      if (data.image) setAnnotatedSrc('data:image/jpeg;base64,' + data.image)

      // Exclude ROV equipment from cleanup items
      const rawDetections = (data.detections || []).filter((d) => d.class !== 'rov')
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

      // Persist scan to history
      try {
        const thumb = data.image ? ('data:image/jpeg;base64,' + data.image) : imageSrc
        const harmfulItems = items.filter((i) => i.severity && i.severity !== 'low')
        addHistoryRecord({
          type: 'image',
          label: selectedFile.name || 'Single Image Scan',
          summary: {
            totalObjects: totalCount,
            debrisCount: harmfulItems.length,
            highestSeverity,
            uniqueTypes,
          },
          thumbnailDataUrl: thumb,
          inventory: harmfulItems.map((i) => ({ class: i.rawClass, count: 1 })),
          location: 'Single Frame Ingestion',
        })
      } catch (logErr) {
        console.warn('Failed to record scan to history:', logErr)
      }
    } catch (err) {
      setErrorMessage(
        'Backend error: ' + err.message +
        `. Make sure the FastAPI server is running on ${API_BASE_URL}`
      )
    } finally {
      setIsAnalyzing(false)
    }
  }, [selectedFile, imageSrc])

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

  const [cleanupTarget, setCleanupTarget] = useState(null)

  const handleNavigate = useCallback((targetPage, targetData = null) => {
    if (targetData) {
      setCleanupTarget(targetData)
    }
    // If navigating to home but an active image scan exists, show the active dashboard
    if (targetPage === 'home' && imageSrc) {
      setPage('dashboard')
    } else {
      setPage(targetPage)
    }
  }, [imageSrc])

  // ── Persistent Route Rendering ──────────────────────────────────────────
  // All pages remain mounted in memory for the duration of the session.
  // Switching between pages never destroys simulation state, maps, or scan results.
  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 1. Home Landing Page */}
      <div style={{ display: page === 'home' ? 'block' : 'none', width: '100%' }}>
        <HomePage onFileSelect={handleFileSelect} onNavigate={handleNavigate} />
      </div>

      {/* 2. Single Image Scan Dashboard */}
      <div style={{ display: page === 'dashboard' ? 'block' : 'none', width: '100%' }}>
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
          onNavigate={handleNavigate}
        />
        <ReportPanel
          results={results}
          annotatedSrc={annotatedSrc}
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
        />
        <LoadingOverlay active={isAnalyzing} />
      </div>

      {/* 3. ROV Edge Simulator */}
      <div style={{ display: page === 'rov' ? 'block' : 'none', width: '100%' }}>
        <ROVSimulator onNavigate={handleNavigate} />
      </div>

      {/* 4. Cleanup Optimizer */}
      <div style={{ display: page === 'optimizer' ? 'block' : 'none', width: '100%' }}>
        <CleanupOptimizer
          target={cleanupTarget}
          onNavigate={handleNavigate}
          onClearTarget={() => setCleanupTarget(null)}
        />
      </div>

      {/* 6. Scan History */}
      <div style={{ display: page === 'history' ? 'block' : 'none', width: '100%' }}>
        <HistoryPage onNavigate={handleNavigate} />
      </div>

      {/* 7. About Page */}
      <div style={{ display: page === 'about' ? 'block' : 'none', width: '100%' }}>
        <AboutPage onNavigate={handleNavigate} />
      </div>
    </div>
  )
}

export default App
