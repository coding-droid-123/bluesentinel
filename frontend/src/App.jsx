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
  Sparkles
} from 'lucide-react'
import ImageUploader from './components/ImageUploader'
import DetectionPanel from './components/DetectionPanel'
import ReportPanel from './components/ReportPanel'
import LoadingOverlay from './components/LoadingOverlay'

// Curated high-contrast palette for detection bounding boxes & item tags
const PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#ea580c']

function App() {
  const [imageSrc, setImageSrc] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileMeta, setFileMeta] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [backendOnline, setBackendOnline] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

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

  // Handle file selection from local upload or drag-and-drop
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

      // If backend returns annotated base64 image, display it
      if (data.image) {
        setImageSrc(`data:image/jpeg;base64,${data.image}`)
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

  // Clear workspace
  const handleClear = useCallback(() => {
    setImageSrc(null)
    setSelectedFile(null)
    setFileMeta(null)
    setResults(null)
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* 30% Marine Ocean Blue Header */}
      <header className="bg-gradient-to-r from-[#0c2340] via-[#112d4e] to-[#0f2e5a] text-white border-b border-blue-900/50 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-xl shadow-inner">
            🌊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
                Blue Sentinel
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-blue-200/80 font-medium tracking-wide">
              Automated Marine Debris Detection & Ecological Audit System
            </p>
          </div>
        </div>

        {/* Status Indicators & 10% Green Accent Pulse */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-white/10 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-white/15 text-xs text-blue-100">
            <Cpu className="w-3.5 h-3.5 text-blue-300" />
            <span className="font-semibold">D-FINE (HGNetV2-L)</span>
            <span className="text-blue-300/70 font-mono">FP16</span>
          </div>

          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 pulse-green" />
            <span className="text-xs font-semibold text-white">System Active</span>
          </div>
        </div>
      </header>

      {/* Optional Notification Banner */}
      {errorMessage && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-amber-700 hover:text-amber-900 font-bold ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace (60% White / Light Canvas) */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Input, Controls & Model Info (4 Cols) */}
        <aside className="lg:col-span-4 flex flex-col gap-5">
          {/* 1. Upload Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-subtle p-5">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-accentBlue" />
                Image Input
              </span>
              <span className="text-[11px] text-slate-400">Step 1</span>
            </div>

            <ImageUploader
              imageSrc={imageSrc}
              fileMeta={fileMeta}
              onFileSelect={handleFileSelect}
              onClear={handleClear}
              fileInputRef={fileInputRef}
              isAnalyzing={isAnalyzing}
            />

            {/* Action Buttons (10% Emerald Green Primary CTA!) */}
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!imageSrc || isAnalyzing}
                className="btn-primary-green flex-1 py-3 px-4 text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Analyzing Debris...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Detection</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleClear}
                disabled={isAnalyzing || (!imageSrc && !results)}
                className="btn-outline px-4 py-3 text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Reset workspace"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* 2. Model & Pipeline Specifications Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-subtle p-5">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-accentBlue" />
                Pipeline Metadata
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Verified
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Detector</span>
                <span className="font-semibold text-slate-700">D-FINE HGNetV2-L</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Precision</span>
                <span className="font-semibold text-emerald-700">FP16 Accelerated</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Dataset</span>
                <span className="font-semibold text-slate-700">TrashCan Underwater</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Categories</span>
                <span className="font-semibold text-blue-700">22 Marine Classes</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Database Storage</span>
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Database className="w-3 h-3 text-accentBlue" /> PostgreSQL 18 + pgvector
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Column: Active Results & Visual Inspection (8 Cols) */}
        <main className="lg:col-span-8 flex flex-col gap-6">
          <DetectionPanel
            results={results}
            imageSrc={imageSrc}
            isAnalyzing={isAnalyzing}
            onOpenReport={() => setIsReportOpen(true)}
          />
        </main>
      </div>

      {/* Environmental Audit Report Modal */}
      <ReportPanel
        results={results}
        imageSrc={imageSrc}
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
      />

      {/* Loading Overlay */}
      <LoadingOverlay active={isAnalyzing} />
    </div>
  )
}

export default App
