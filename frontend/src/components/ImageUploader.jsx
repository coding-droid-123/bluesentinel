import React, { useState, useCallback } from 'react'
import { Upload, Image as ImageIcon, X, RefreshCw, FileText, CheckCircle2 } from 'lucide-react'

// Lightweight sample underwater debris images (embedded data URIs for instant 1-click demo)
const SAMPLE_PRESETS = [
  {
    name: 'Sample 1: Reef Bottles',
    tag: 'Plastic Bottles',
    color: '#2563eb',
    // A clean underwater gradient SVG demo data URI
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0284c7" />
          <stop offset="50%" stop-color="#0369a1" />
          <stop offset="100%" stop-color="#0c4a6e" />
        </linearGradient>
        <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ca8a04" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#78350f" stop-opacity="0.6" />
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#bg)" />
      <!-- seabed -->
      <path d="M0,380 Q160,340 320,370 T640,360 L640,480 L0,480 Z" fill="url(#sand)" />
      <!-- coral / rocks -->
      <circle cx="90" cy="400" r="50" fill="#047857" opacity="0.7"/>
      <circle cx="560" cy="390" r="65" fill="#b45309" opacity="0.6"/>
      <!-- plastic bottles -->
      <rect x="220" y="320" width="35" height="90" rx="6" fill="#e0f2fe" opacity="0.85" stroke="#38bdf8" stroke-width="2" transform="rotate(25 220 320)"/>
      <rect x="360" y="340" width="40" height="110" rx="8" fill="#e0f2fe" opacity="0.8" stroke="#38bdf8" stroke-width="2" transform="rotate(-35 360 340)"/>
      <rect x="460" y="310" width="28" height="75" rx="5" fill="#fef08a" opacity="0.75" stroke="#eab308" stroke-width="2" transform="rotate(15 460 310)"/>
      <text x="320" y="70" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle" opacity="0.9">BlueSentinel Marine Sample: Reef Plastic Debris</text>
    </svg>`
  },
  {
    name: 'Sample 2: Ghost Net',
    tag: 'Fishing Net',
    color: '#059669',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <defs>
        <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0e7490" />
          <stop offset="70%" stop-color="#155e75" />
          <stop offset="100%" stop-color="#083344" />
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#bg2)" />
      <!-- net mesh -->
      <path d="M120,180 L480,240 M140,240 L460,300 M160,300 L440,360 M180,160 L240,400 M260,170 L320,410 M340,180 L400,420" stroke="#a7f3d0" stroke-width="3" opacity="0.7" fill="none"/>
      <circle cx="280" cy="270" r="30" fill="#f43f5e" opacity="0.6"/>
      <text x="320" y="70" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle" opacity="0.9">BlueSentinel Marine Sample: Discarded Net</text>
    </svg>`
  }
]

export default function ImageUploader({
  imageSrc,
  fileMeta,
  onFileSelect,
  onClear,
  fileInputRef,
  isAnalyzing
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      onFileSelect(file)
    }
  }, [onFileSelect])

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
  }, [onFileSelect])

  const handleLoadSample = (sample) => {
    const blob = new Blob([sample.svg], { type: 'image/svg+xml' })
    const file = new File([blob], `${sample.tag.toLowerCase().replace(/\s+/g, '_')}_sample.svg`, {
      type: 'image/svg+xml'
    })
    onFileSelect(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Upload Zone Card */}
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''} ${imageSrc ? 'has-image' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !imageSrc && fileInputRef.current?.click()}
      >
        {!imageSrc ? (
          <div className="flex flex-col items-center justify-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-accentBlue mb-3 transition-transform group-hover:scale-105">
              <Upload className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              Drop marine imagery here
            </h3>
            <p className="text-xs text-slate-500 mb-4 text-center max-w-[240px]">
              Supports underwater JPG, PNG, and WebP captures from ROVs or divers
            </p>
            <button
              type="button"
              className="px-5 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-semibold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              <ImageIcon className="w-4 h-4 text-accentBlue" />
              Browse Local File
            </button>
          </div>
        ) : (
          <div className="relative group w-full flex flex-col items-center">
            <div className="relative w-full overflow-hidden rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center max-h-[260px]">
              <img
                src={imageSrc}
                alt="Selected debris preview"
                className="max-w-full max-h-[250px] object-contain rounded-lg shadow-sm"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClear()
                }}
                disabled={isAnalyzing}
                className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 text-slate-700 hover:text-red-600 hover:bg-white border border-slate-200 shadow-sm flex items-center justify-center cursor-pointer transition-all disabled:opacity-50"
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File metadata info bar */}
            <div className="w-full mt-3 px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
              <span className="truncate max-w-[190px] font-medium text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-accentBlue" />
                {fileMeta?.name || 'Selected Image'}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="text-accentBlue hover:text-blue-700 font-medium hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" /> Replace
              </button>
            </div>
          </div>
        )}

        <input
          type="file"
          id="fileInput"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Quick Test Samples */}
      {!imageSrc && (
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-subtle">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Quick Test Samples</span>
            <span className="text-[10px] text-blue-600 font-medium">1-Click Try</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SAMPLE_PRESETS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleLoadSample(sample)}
                className="p-2 text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50/70 hover:border-blue-200 transition-all cursor-pointer group"
              >
                <div className="text-xs font-semibold text-slate-700 group-hover:text-blue-700 truncate">
                  {sample.tag}
                </div>
                <div className="text-[10px] text-slate-500">Demo image</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
