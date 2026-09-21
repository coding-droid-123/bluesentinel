import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  Play,
  RotateCcw,
  ShieldCheck,
  Cpu,
  Layers,
  FileText,
  AlertCircle,
  Database,
  Waves,
  CheckCircle2,
  Sparkles,
  ArrowLeft
} from 'lucide-react'
import ImageUploader from './components/ImageUploader'
import DetectionPanel from './components/DetectionPanel'
import ReportPanel from './components/ReportPanel'
import LoadingOverlay from './components/LoadingOverlay'
import HomePage from './components/HomePage'
import AuthModal from './components/AuthModal'
import AboutPage from './components/AboutPage'
import UploadPage from './components/UploadPage'

// Curated high-contrast palette for detection bounding boxes & item tags
const PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#ea580c']

function App() {
  const [page, setPage] = useState('home')  // 'home' | 'about' | 'dashboard'
  const [user, setUser] = useState(null)    // null = logged out
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [imageSrc, setImageSrc] = useState(null)       // original image
  const [annotatedSrc, setAnnotatedSrc] = useState(null) // backend-annotated with bboxes
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileMeta, setFileMeta] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [backendOnline, setBackendOnline] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const handleShowAuth = (mode = 'login') => { setAuthMode(mode); setShowAuth(true) }
  const handleAuthSuccess = (u) => { setUser(u); setShowAuth(false) }
  const handleLogout = () => { setUser(null); setPage('home') }
  const handleGoToUpload = () => { setPage('dashboard') }

  const fileInputRef = useRef(null)

  // Check backend health periodically
  useEffect(() => {
    let isMounted = true
    const checkHealth = async () => {
      try {
        const res = await fetch('http://localhost:8000/docs', { method: 'HEAD', mode: 'no-cors' })
        if (isMounted) setBackendOnline(true)
      } catch {
        if (isMounted) setBackendOnline(false)
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 10000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  // Handle file selection — also navigate to dashboard
  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file)
    setFileMeta({
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
    })
    setErrorMessage(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      setImageSrc(e.target.result)
    }
    reader.readAsDataURL(file)
    setPage('dashboard')
  }, [])

  // Trigger debris detection inference
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

      if (!response.ok) {
        throw new Error(`Inference returned status ${response.status}`)
      }

      const data = await response.json()

      // Store annotated image separately — original stays in left panel
      if (data.image) {
        setAnnotatedSrc(`data:image/jpeg;base64,${data.image}`)
      }

      // Format detection items from backend
      const rawDetections = data.detections || []
      const items = rawDetections.map((d, index) => ({
        name: d.class.replace(/^trash_|^animal_/, '').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        confidence: Math.round(d.confidence * 1000) / 10,
        color: PALETTE[index % PALETTE.length],
        box: d.box || null,
      }))

      const totalCount = items.length
      const avgConf = totalCount
        ? (items.reduce((acc, curr) => acc + curr.confidence, 0) / totalCount).toFixed(1)
        : 0
      const uniqueTypes = new Set(items.map((i) => i.name)).size

      setResults({
        batchId: data.batch_id || 'LOCAL-SCAN',
        items,
        totalCount,
        avgConfidence: `${avgConf}%`,
        debrisTypes: uniqueTypes,
        severity: totalCount > 5 ? 'critical' : totalCount > 2 ? 'high' : totalCount > 0 ? 'medium' : 'low',
      })
    } catch (err) {
      console.warn('Backend inference failed, falling back to local simulation demonstration:', err)

      // Graceful local demo mode if backend is still spinning up weights
      const demoItems = [
        { name: 'Plastic Bottle', confidence: 94.2, color: '#2563eb' },
        { name: 'Fishing Net', confidence: 89.5, color: '#059669' },
        { name: 'Plastic Container', confidence: 86.1, color: '#d97706' },
      ]

      setResults({
        batchId: 'DEMO-PREVIEW',
        items: demoItems,
        totalCount: demoItems.length,
        avgConfidence: '89.9%',
        debrisTypes: 3,
        severity: 'high',
      })

      setErrorMessage(
        'FastAPI backend is initializing or offline. Rendered simulation results for demonstration.'
      )
    } finally {
      setIsAnalyzing(false)
    }
  }, [selectedFile])

  // Clear workspace and return to home
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

  // ── Page routing ──
  const authOverlay = showAuth && (
    <AuthModal
      mode={authMode}
      onClose={() => setShowAuth(false)}
      onSuccess={handleAuthSuccess}
    />
  )

  if (page === 'about') {
    return (
      <>
        <AboutPage
          user={user}
          onNavigate={setPage}
          onShowAuth={handleShowAuth}
          onLogout={handleLogout}
          onGoToUpload={handleGoToUpload}
        />
        {authOverlay}
      </>
    )
  }

  if (page === 'home') {
    return (
      <>
        <HomePage
          onFileSelect={handleFileSelect}
          user={user}
          onShowAuth={handleShowAuth}
          onNavigate={setPage}
          onLogout={handleLogout}
        />
        {authOverlay}
      </>
    )
  }

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
        user={user}
        onNavigate={setPage}
        onLogout={handleLogout}
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
