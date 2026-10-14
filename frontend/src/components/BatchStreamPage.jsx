import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import NavBar from './NavBar'
import useBatchStream from '../hooks/useBatchStream'
import { addHistoryRecord } from '../hooks/useHistory'

import {
  SEVERITY_COLOR,
  SEVERITY_BG,
  CLASS_COLORS,
  getColor,
  drawBoxes,
} from '../utils/drawing'

export default function BatchStreamPage({ onNavigate }) {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [confidence, setConfidence] = useState(0.4)
  const [gapThreshold, setGapThreshold] = useState(10)
  const [inspectedFile, setInspectedFile] = useState(null)
  const [fileUrls, setFileUrls] = useState({})

  const fileInputRef = useRef(null)
  const imgRef = useRef(null)
  const overlayRef = useRef(null)

  const {
    isStreaming,
    isFinished,
    progress,
    fps,
    frames,
    currentFrame,
    alerts,
    hotspots,
    zones,
    summary,
    error,
    windowSize,
    start,
    stop,
    setWindowSize,
  } = useBatchStream()

  // Register image files and create URLs
  const registerFiles = useCallback((files) => {
    const urls = {}
    files.forEach((f) => {
      urls[f.name] = URL.createObjectURL(f)
    })
    setFileUrls((prev) => {
      Object.values(prev).forEach((u) => URL.revokeObjectURL(u))
      return urls
    })
    setSelectedFiles(files)
    if (files.length > 0) {
      setInspectedFile({ filename: files[0].name })
    }
  }, [])

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) registerFiles(files)
  }

  // Load sample test batch (20 frames across 2 zones)
  const handleLoadTestBatch = async () => {
    const testFiles = []
    const zonesToGen = [
      { id: 'vid_00001', frames: [10, 11, 12, 13, 14, 15, 28, 29, 30, 31] },
      { id: 'vid_00002', frames: [1, 2, 3, 4, 5, 22, 23, 24, 25, 26] },
    ]

    const c = document.createElement('canvas')
    c.width = 640
    c.height = 480
    const ctx = c.getContext('2d')

    for (const z of zonesToGen) {
      for (const f of z.frames) {
        const grad = ctx.createLinearGradient(0, 0, 0, 480)
        grad.addColorStop(0, '#0a1f3a')
        grad.addColorStop(0.5, '#0d3260')
        grad.addColorStop(1, '#0e5e48')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 640, 480)

        // Water caustic circle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.beginPath()
        ctx.arc(320 + (f % 4) * 20, 240, 170, 0, Math.PI * 2)
        ctx.fill()

        // Marine text HUD
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 22px Inter, sans-serif'
        ctx.fillText(`Blue Sentinel ROV ${z.id.toUpperCase()}`, 36, 50)
        ctx.font = '14px Inter, sans-serif'
        ctx.fillStyle = '#93c5fd'
        ctx.fillText(`Transect Frame #${String(f).padStart(6, '0')}`, 36, 78)

        // Simulated underwater reef
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)'
        ctx.beginPath()
        ctx.ellipse(320, 400, 200, 50, 0, 0, Math.PI * 2)
        ctx.fill()

        const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88))
        const file = new File([blob], `${z.id}_${String(f).padStart(6, '0')}.jpg`, {
          type: 'image/jpeg',
        })
        testFiles.push(file)
      }
    }
    registerFiles(testFiles)
  }

  // Determine active frame currently inspected
  const activeFrameData = useMemo(() => {
    if (currentFrame) return currentFrame
    if (inspectedFile) {
      const match = frames.find((f) => f.filename === inspectedFile.filename)
      if (match) return match
      return { filename: inspectedFile.filename, tracks: [], alerts: [], zone: 'vid_00001', frame: 0 }
    }
    return frames[0] || null
  }, [currentFrame, inspectedFile, frames])

  const activeImageUrl = activeFrameData ? fileUrls[activeFrameData.filename] : null

  // Redraw boxes on overlay canvas whenever frame changes
  useEffect(() => {
    if (overlayRef.current && imgRef.current && activeFrameData) {
      drawBoxes(overlayRef.current, imgRef.current, activeFrameData.tracks || [])
    }
  }, [activeFrameData, activeImageUrl])

  const handleStart = () => {
    if (selectedFiles.length === 0) return
    try {
      addHistoryRecord({
        type: 'batch',
        label: `Batch Stream Analysis (${selectedFiles.length} files)`,
        summary: { totalObjects: 0, debrisCount: 0, highestSeverity: 'medium', uniqueTypes: 0 },
        location: `${selectedFiles.length} Ingested Frames`,
      })
    } catch {}
    start(selectedFiles, {
      confidence,
      gapThreshold,
      windowSize,
    })
  }

  const handleReset = () => {
    stop()
    setSelectedFiles([])
    setInspectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (overlayRef.current) {
      const ctx = overlayRef.current.getContext('2d')
      ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
    }
  }

  // Aggregate unique objects
  const totalUniqueObjects = Object.values(hotspots).reduce(
    (acc, z) => acc + (z.hotspots || []).reduce((s, h) => s + h.object_count, 0),
    0
  )

  // Auto-record completed batch survey into history
  const recordedBatchRef = useRef(false)
  useEffect(() => {
    if (isStreaming) {
      recordedBatchRef.current = false
    }
    if (isFinished && summary && !recordedBatchRef.current) {
      recordedBatchRef.current = true
      try {
        addHistoryRecord({
          type: 'batch',
          label: `Batch Stream (${summary.total_frames || selectedFiles.length} frames)`,
          summary: {
            totalObjects: summary.total_unique_objects || 0,
            debrisCount: summary.total_unique_objects || 0,
            highestSeverity: alerts.length > 0 ? 'critical' : 'high',
            uniqueTypes: summary.zones_count || 1,
          },
          thumbnailDataUrl: activeImageUrl || null,
          location: `${summary.zones_count || 1} Survey Transect(s)`,
        })
      } catch (err) {
        console.warn('Failed to record batch history:', err)
      }
    }
  }, [isFinished, summary, isStreaming, selectedFiles.length, alerts.length, activeImageUrl])

  const statusText = isStreaming ? 'STREAMING' : isFinished ? 'DONE' : selectedFiles.length > 0 ? 'READY' : 'STANDBY'

  return (
    <div className="home-page">
      <NavBar page="batch" onNavigate={onNavigate} />

      {/* ── HERO BANNER (Identical to ROVSimulator.jsx) ── */}
      <section className="upload-hero" style={{ background: 'linear-gradient(135deg,#0a1f3a 0%,#0d3260 40%,#0e5e48 100%)' }}>
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" style={{ background: isStreaming ? '#4ade80' : '#94a3b8' }} />
            ROV BATCH STREAMER &nbsp;&middot;&nbsp; ONNX / PyTorch &nbsp;&middot;&nbsp; {statusText}
          </div>
          <h1 className="home-hero-title" style={{ fontSize: 'clamp(24px,4vw,38px)', marginBottom: 8 }}>
            Batch Image Stream<br /><em className="home-hero-italic">Live Bounding Box Overlay &amp; Schematic Map</em>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 16, maxWidth: 640 }}>
            Feed a batch of underwater image frames — as each frame streams through the backend WebSocket, detections, multi-object tracks, and live schematic transects are computed without GPS telemetry.
          </p>

          {/* Controls Bar (Matching ROVSimulator button styling) */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* File picker */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 12,
                padding: '8px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedFiles.length > 0 ? `📁 ${selectedFiles.length} Frames Queued` : '📁 Select Images / Folder'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {/* Quick 20-frame Sample Loader */}
            <button
              onClick={handleLoadTestBatch}
              disabled={isStreaming}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 12,
                padding: '8px 16px',
                borderRadius: 8,
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ✨ Load Sample Batch (20 frames)
            </button>

            {/* Start Stream */}
            <button
              onClick={handleStart}
              disabled={selectedFiles.length === 0 || isStreaming}
              style={{
                background: (selectedFiles.length === 0 || isStreaming)
                  ? 'rgba(255,255,255,0.1)'
                  : 'linear-gradient(135deg,#10b981,#059669)',
                border: 'none',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                padding: '8px 20px',
                borderRadius: 8,
                cursor: (selectedFiles.length === 0 || isStreaming) ? 'not-allowed' : 'pointer',
                opacity: (selectedFiles.length === 0 || isStreaming) ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {isStreaming ? (
                <><span className="upload-spinner" /> Streaming ({progress.processed}/{progress.total})</>
              ) : (
                '▶ Start Batch'
              )}
            </button>

            {/* Stop Stream */}
            <button
              onClick={stop}
              disabled={!isStreaming}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 12,
                padding: '8px 14px',
                borderRadius: 8,
                cursor: !isStreaming ? 'not-allowed' : 'pointer',
                opacity: !isStreaming ? 0.45 : 1,
              }}
            >
              ⏹ Stop
            </button>

            {/* Reset */}
            <button
              onClick={handleReset}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.7)',
                fontWeight: 600,
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              ↺ Reset
            </button>

            {/* Confidence Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.25)', padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)' }}>
              <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600 }}>Confidence</label>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
                style={{ width: 64, cursor: 'pointer' }}
              />
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, width: 28 }}>{Math.round(confidence * 100)}%</span>
            </div>

            {/* Gap Threshold */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.25)', padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)' }}>
              <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600 }}>Gap Reset</label>
              <input
                type="number"
                min="3"
                max="50"
                value={gapThreshold}
                onChange={(e) => setGapThreshold(parseInt(e.target.value, 10) || 10)}
                style={{ width: 40, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 5, padding: '2px 4px', fontSize: 11, fontWeight: 700, textAlign: 'center' }}
              />
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>f</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <p style={{ marginTop: 10, fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '7px 14px', borderRadius: 8, display: 'inline-block' }}>
              ⚠️ {error}
            </p>
          )}
        </div>
      </section>

      {/* ── STATS ROW (Identical to ROVSimulator.jsx with #e4eff5 background) ── */}
      <section style={{ background: '#e4eff5', padding: '20px 32px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="upload-stats-row" style={{ marginBottom: 0 }}>
            {[
              {
                label: 'FRAMES PROCESSED',
                value: `${progress.processed} / ${progress.total}`,
                sub: fps ? `${fps} sends/sec (${progress.percent}%)` : (isStreaming ? 'streaming…' : 'ready'),
              },
              {
                label: 'OBJECTS DETECTED',
                value: totalUniqueObjects,
                sub: 'unique tracked objects (IoU MOT)',
              },
              {
                label: 'ALERTS',
                value: alerts.length,
                sub: 'critical events only',
                color: alerts.length > 0 ? '#ef4444' : undefined,
              },
              {
                label: 'SURVEY TRANSECTS',
                value: zones.length,
                sub: `${zones.length} active schematic zones`,
                color: zones.length > 0 ? '#10b981' : undefined,
              },
            ].map((s) => (
              <div key={s.label} className="home-card upload-stat-card">
                <p className="home-card-num">{s.label}</p>
                <p className="upload-stat-val" style={s.color ? { color: s.color } : {}}>{s.value}</p>
                <p className="home-card-desc" style={{ marginTop: 4, fontSize: 12 }}>{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MAIN WORKSPACE (1.4fr Left : 1fr Right Split identical to ROVSimulator) ── */}
      <section style={{ background: '#e4eff5', padding: '16px 32px 48px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* ════ LEFT COLUMN: Live Detection Feed & Current Detections ════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* LIVE DETECTION FEED CARD */}
            <div className="home-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p className="home-card-num" style={{ margin: 0 }}>LIVE DETECTION FEED</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isStreaming && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#10b981', fontWeight: 700 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'status-pulse 1.5s infinite' }} />
                      STREAMING
                    </span>
                  )}
                  {fps > 0 && <span style={{ fontSize: 11, color: '#6a9ab0', fontFamily: 'monospace' }}>{fps} FPS</span>}
                </div>
              </div>

              {activeImageUrl ? (
                /* Stacked container matching ROVSimulator (Image + Overlay Canvas) */
                <div style={{ position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden', lineHeight: 0 }}>
                  <img
                    ref={imgRef}
                    src={activeImageUrl}
                    alt="Active Frame"
                    style={{ width: '100%', display: 'block', borderRadius: 10, maxHeight: 460, objectFit: 'contain' }}
                    onLoad={() => {
                      if (overlayRef.current && imgRef.current && activeFrameData) {
                        drawBoxes(overlayRef.current, imgRef.current, activeFrameData.tracks || [])
                      }
                    }}
                  />

                  {/* Transparent overlay canvas */}
                  <canvas
                    ref={overlayRef}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      borderRadius: 10,
                    }}
                  />

                  {/* REC Badge */}
                  {isStreaming && (
                    <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(239,68,68,0.88)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.04em' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'status-pulse 1s infinite' }} />
                      REC
                    </div>
                  )}

                  {/* Zone & Frame counter */}
                  {activeFrameData && (
                    <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.65)', color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
                      {activeFrameData.zone ? `${activeFrameData.zone.toUpperCase()} · ` : ''}FRAME {activeFrameData.frame ?? 0}
                    </div>
                  )}
                </div>
              ) : (
                /* Empty state matching ROVSimulator */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: '#0a1520', borderRadius: 10, height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed #1a4a6a' }}
                >
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#3a8aaa" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <p style={{ color: '#4a8aaa', fontSize: 15, fontWeight: 600 }}>Click to select images</p>
                  <p style={{ color: '#3a6a8a', fontSize: 12, marginTop: 6 }}>JPG · PNG · Named like vid_00001_000123.jpg</p>
                </div>
              )}

              {/* Legend matching ROVSimulator */}
              {activeFrameData && activeFrameData.tracks && activeFrameData.tracks.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {activeFrameData.tracks.map((d, i) => (
                    <span
                      key={i}
                      style={{
                        background: getColor(d.class) + '22',
                        color: getColor(d.class),
                        border: `1px solid ${getColor(d.class)}55`,
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {d.trackId ? `#${d.trackId} ` : ''}{d.class.replace(/^(trash_|animal_)/, '')} &nbsp;{(d.confidence * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* DETAILED DETECTIONS FOR CURRENT FRAME (Exact ROVSimulator structure) */}
            {activeFrameData && activeFrameData.tracks && activeFrameData.tracks.length > 0 && (
              <div className="home-card" style={{ padding: 18 }}>
                <p className="home-card-num" style={{ marginBottom: 12 }}>
                  FRAME {activeFrameData.frame} &mdash; DETECTIONS ({activeFrameData.tracks.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {activeFrameData.tracks.map((d, i) => (
                    <div key={i} className="upload-detection-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: getColor(d.class), flexShrink: 0, display: 'inline-block' }} />
                        <span className="upload-detection-name" style={{ fontSize: 12 }}>
                          {d.trackId ? `#${d.trackId} ` : ''}{d.class.replace(/_/g, ' ')}
                        </span>
                        <span style={{ background: SEVERITY_BG[d.severity || 'low'], color: SEVERITY_COLOR[d.severity || 'low'], border: `1px solid ${SEVERITY_COLOR[d.severity || 'low']}40`, borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                          {d.severity || 'low'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <div className="upload-conf-bar-bg" style={{ width: 60 }}>
                          <div className="upload-conf-bar-fill" style={{ width: `${d.confidence * 100}%`, background: getColor(d.class) }} />
                        </div>
                        <span className="upload-conf-text">{(d.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: '#6a9ab0', marginTop: 10, fontStyle: 'italic' }}>
                  Multi-object tracking deduplicates targets across contiguous frames.
                </p>
              </div>
            )}

            {/* BATCH FRAME FILMSTRIP / GALLERY */}
            {selectedFiles.length > 0 && (
              <div className="home-card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <p className="home-card-num" style={{ margin: 0 }}>
                    BATCH FILMSTRIP ({selectedFiles.length} FRAMES)
                  </p>
                  <span style={{ fontSize: 11, color: '#6a9ab0' }}>Click thumbnail to inspect</span>
                </div>

                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                  {selectedFiles.map((file, idx) => {
                    const url = fileUrls[file.name]
                    const isSelected = activeFrameData?.filename === file.name
                    const frameData = frames.find((f) => f.filename === file.name)
                    const tracksCount = frameData?.tracks?.length || 0
                    const hasAlert = frameData?.alerts && frameData.alerts.length > 0

                    return (
                      <div
                        key={file.name || idx}
                        onClick={() => setInspectedFile({ filename: file.name })}
                        style={{
                          flexShrink: 0,
                          width: 88,
                          cursor: 'pointer',
                          borderRadius: 8,
                          border: isSelected ? '2px solid #2563eb' : '1px solid #d1e3ec',
                          background: isSelected ? '#eff6ff' : '#fff',
                          padding: 4,
                          textAlign: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ position: 'relative', width: '100%', height: 56, background: '#0f2030', borderRadius: 6, overflow: 'hidden' }}>
                          {url ? (
                            <img src={url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ color: '#64748b', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Frame</div>
                          )}
                          {hasAlert && (
                            <span style={{ position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
                          )}
                          {tracksCount > 0 && (
                            <span style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>
                              {tracksCount}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 10, color: '#1a3a4a', fontWeight: 600, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ════ RIGHT COLUMN: Schematic Map, Alert Log & Pile Ranking ════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 1. NAVIGATE TO ROV SIMULATOR FOR SCHEMATIC MAP */}
            <div
              onClick={() => onNavigate('rov')}
              style={{
                background: 'linear-gradient(135deg, #0d3260 0%, #0e5e48 100%)',
                border: '1px solid rgba(16,185,129,0.35)',
                borderRadius: 14,
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,185,129,0.18)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🗺️</span>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>SCHEMATIC HOTSPOT MAP</p>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                Live transect mapping is available in the <strong style={{ color: '#4ade80' }}>ROV Simulator</strong>.
                Upload a video to see debris hotspots plotted along a real-time schematic transect.
              </p>
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#4ade80' }}>
                → Open ROV Simulator
              </div>
            </div>



            {/* 4. STATED LIMITATIONS (Identical to ROVSimulator.jsx) */}
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: '#92400e', fontWeight: 700, marginBottom: 4 }}>⚠️ Stated Limitations</p>
              <p style={{ fontSize: 11, color: '#78350f', lineHeight: 1.55 }}>
                Transect positions are derived from sequence frame numbers rather than GPS sensors.
                Discontinuity gaps exceeding {gapThreshold} frames trigger tracker resets to prevent ID drift.
                Hotspot records feed directly into the Cleanup Optimizer for diver crew logistics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── BATCH COMPLETION MODAL ── */}
      {isFinished && summary && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,40,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 520, width: '100%', padding: 28, boxShadow: '0 24px 64px rgba(10,20,40,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                ✅
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Batch Survey Logged
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
                  Mission record persisted to database with hotspot inventory.
                </p>
              </div>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Total Frames:</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{summary.total_frames}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Unique Debris:</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{summary.total_unique_objects}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Transects:</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{summary.zones_count}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Throughput:</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{summary.fps} FPS</span>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: 22 }}>
              The survey findings and hotspot coordinates are now loaded into the <strong>Cleanup Optimizer</strong>. You can inspect diver crew requirements and cost projections for these transects.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => onNavigate('optimizer')}
                style={{
                  background: 'linear-gradient(135deg,#10b981,#059669)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '10px 20px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
                }}
              >
                📊 Open in Cleanup Optimizer &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER (Matching ROVSimulator.jsx) ── */}
      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinel &mdash; ROV Batch Image Stream</p>
        <p className="home-footer-sub">D-FINE HGNetV2-L &middot; WebSocket /ws/batch &middot; FastAPI port 8000</p>
      </footer>
    </div>
  )
}
