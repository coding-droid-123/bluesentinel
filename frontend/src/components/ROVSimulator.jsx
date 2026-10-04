import React, { useState, useRef, useEffect, useCallback } from 'react'
import logo from '../assets/logo.png'

// ── Alert logic ────────────────────────────────────────────────────────────
const ALERT_PILE_THRESHOLD = 5
const CLASS_WEIGHT = {
  trash_net: 3, trash_rope: 3, trash_tarp: 2.5, trash_pipe: 2,
  trash_wreckage: 2, trash_bag: 1.5, trash_bottle: 1, trash_cup: 1,
  trash_can: 1.5, trash_container: 1.5, trash_clothing: 1,
  trash_branch: 0.8, trash_snack_wrapper: 0.8, trash_unknown_instance: 1,
}
const GHOST_GEAR = new Set(['trash_net', 'trash_rope', 'trash_tarp'])
const ANIMALS    = new Set(['animal_fish', 'animal_eel', 'animal_crab', 'animal_starfish', 'animal_etc', 'animal_shells'])

const SEVERITY_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#10b981' }
const SEVERITY_BG    = { critical: '#fef2f2', high: '#fff7ed', medium: '#fefce8', low: '#f0fdf4' }

// Map class → colour for bbox stroke
const CLASS_COLORS = {
  trash_net:'#ef4444', trash_rope:'#ef4444', trash_tarp:'#ef4444',
  trash_wreckage:'#f97316', trash_pipe:'#f97316',
  trash_bag:'#eab308', trash_bottle:'#eab308', trash_cup:'#eab308',
  trash_can:'#eab308', trash_container:'#eab308',
  trash_clothing:'#a855f7', trash_branch:'#a855f7', trash_snack_wrapper:'#a855f7',
  animal_fish:'#10b981', animal_crab:'#10b981', animal_eel:'#10b981',
  animal_starfish:'#10b981', animal_shells:'#10b981', animal_etc:'#10b981',
  plant:'#22c55e', rov:'#3b82f6',
}

function getColor(cls) {
  return CLASS_COLORS[cls] || '#60a5fa'
}

function evaluateAlerts(detections, frameNum) {
  const alerts = []
  const classes = detections.map((d) => d.class)
  const hasAnimal = classes.some((c) => ANIMALS.has(c))
  const gearFound = classes.filter((c) => GHOST_GEAR.has(c))

  if (hasAnimal && gearFound.length > 0) {
    const animal = classes.find((c) => ANIMALS.has(c))
    alerts.push({
      id: `entangle-${frameNum}-${Date.now()}`, type: 'ENTANGLEMENT',
      message: `${animal.replace('animal_', '')} detected near ${gearFound[0].replace('trash_', '')} — possible entanglement`,
      severity: 'critical', frame: frameNum, ts: new Date().toLocaleTimeString(),
    })
  } else if (gearFound.length > 0) {
    gearFound.forEach((g) => alerts.push({
      id: `gear-${frameNum}-${g}-${Date.now()}`, type: 'GHOST GEAR',
      message: `${g.replace('trash_', '').toUpperCase()} detected — possible ghost gear`,
      severity: 'critical', frame: frameNum, ts: new Date().toLocaleTimeString(),
    }))
  }
  if (detections.length >= ALERT_PILE_THRESHOLD) {
    alerts.push({
      id: `pile-${frameNum}-${Date.now()}`, type: 'LARGE PILE',
      message: `High debris density: ${detections.length} objects in frame ${frameNum}`,
      severity: 'high', frame: frameNum, ts: new Date().toLocaleTimeString(),
    })
  }
  return alerts
}

function weightedScore(detections) {
  return detections.reduce((sum, d) => sum + (CLASS_WEIGHT[d.class] ?? 1) * (d.confidence ?? 0.8), 0)
}

// Draw bounding boxes on a canvas element from a detections array
// detections: [{class, confidence, severity, box:[x1,y1,x2,y2]}]
// box coords are in the natural video resolution; canvas is displayed at CSS size
function drawBoxes(canvas, video, detections) {
  if (!canvas || !video) return

  const rect = video.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  const dpr = window.devicePixelRatio || 1
  canvas.width  = rect.width  * dpr
  canvas.height = rect.height * dpr
  canvas.style.width  = rect.width  + 'px'
  canvas.style.height = rect.height + 'px'

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, rect.width, rect.height)

  if (!detections || !detections.length) return
  if (!video.videoWidth || !video.videoHeight) return

  // Exact scale factors from natural video coordinates to displayed canvas pixels
  const scaleX = rect.width  / video.videoWidth
  const scaleY = rect.height / video.videoHeight

  for (const det of detections) {
    if (!det.box || det.box.length < 4) continue
    const [x1, y1, x2, y2] = det.box
    const sx  = x1 * scaleX
    const sy  = y1 * scaleY
    const sw  = (x2 - x1) * scaleX
    const sh  = (y2 - y1) * scaleY

    if (sw <= 0 || sh <= 0) continue

    const col = getColor(det.class)
    const label = `${det.class.replace(/^(trash_|animal_)/, '')} ${(det.confidence * 100).toFixed(0)}%`
    const fontSize = Math.max(11, Math.min(14, Math.round(sw / 8)))

    // Box stroke
    ctx.strokeStyle = col
    ctx.lineWidth   = 2.5
    ctx.strokeRect(sx, sy, sw, sh)

    // Semi-transparent fill
    ctx.fillStyle = col + '22'
    ctx.fillRect(sx, sy, sw, sh)

    // Corner accents for high-precision HUD look
    const corner = Math.min(10, sw / 4, sh / 4)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx, sy + corner); ctx.lineTo(sx, sy); ctx.lineTo(sx + corner, sy)
    ctx.moveTo(sx + sw - corner, sy); ctx.lineTo(sx + sw, sy); ctx.lineTo(sx + sw, sy + corner)
    ctx.moveTo(sx, sy + sh - corner); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx + corner, sy + sh)
    ctx.moveTo(sx + sw - corner, sy + sh); ctx.lineTo(sx + sw, sy + sh); ctx.lineTo(sx + sw, sy + corner)
    ctx.stroke()

    // Label background
    ctx.font = `bold ${fontSize}px 'Inter', sans-serif`
    const textW = ctx.measureText(label).width + 8
    const labelH = fontSize + 8
    const labelY = sy > labelH ? sy - labelH : sy

    ctx.fillStyle = col
    ctx.fillRect(sx, labelY, textW, labelH)

    // Label text
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, sx + 4, labelY + labelH - 4)
  }
}

export default function ROVSimulator({ onNavigate }) {
  const [videoFile, setVideoFile]               = useState(null)
  const [videoUrl, setVideoUrl]                 = useState(null)
  const [isRunning, setIsRunning]               = useState(false)
  const [isPaused, setIsPaused]                 = useState(false)
  const [frameCount, setFrameCount]             = useState(0)
  const [currentDetections, setCurrentDetections] = useState([])
  const [alerts, setAlerts]                     = useState([])
  const [pileRanking, setPileRanking]           = useState([])
  const [totalObjects, setTotalObjects]         = useState(0)
  const [fps, setFps]                           = useState(null)
  const [latency, setLatency]                   = useState(null)
  const [status, setStatus]                     = useState('idle')
  const [errorMsg, setErrorMsg]                 = useState('')
  const [backendOnline, setBackendOnline]       = useState(null)
  const [modelFormat, setModelFormat]           = useState('ONNX')
  const [playMode, setPlayMode]                 = useState('step') // 'step' (Synchronized Step-Through) | 'continuous' (Continuous Video)
  const [playbackSpeed, setPlaybackSpeed]       = useState(0.25)  // default slow speed
  const [frameStep, setFrameStep]               = useState(0.5)   // how many seconds to advance per detection step
  const [boxHoldTime, setBoxHoldTime]            = useState(800)   // how long (ms) to display boxes before advancing
  const [frameInterval, setFrameInterval]       = useState(0)     // continuous detection pace (0 = auto)

  const videoRef         = useRef(null)
  const canvasRef        = useRef(null) // hidden extraction canvas
  const overlayRef       = useRef(null) // visible overlay on video
  const fileInputRef     = useRef(null)
  const loopTimerRef     = useRef(null)
  const isRunningRef     = useRef(false)
  const isPausedRef      = useRef(false)
  const isProcessingRef  = useRef(false)
  const abortRef         = useRef(null) // AbortController for in-flight request
  const frameNumRef      = useRef(0)
  const startTimeRef     = useRef(null)
  const framesSentRef    = useRef(0)
  const pileAccRef       = useRef([])
  const latestDetsRef    = useRef([]) // keeps latest detections for overlay redraws
  const playModeRef      = useRef('step')
  const playbackSpeedRef = useRef(0.25)
  const frameStepRef     = useRef(0.5)
  const boxHoldRef       = useRef(800)
  const frameIntervalRef = useRef(0)

  useEffect(() => { playModeRef.current = playMode }, [playMode])
  useEffect(() => { playbackSpeedRef.current = playbackSpeed }, [playbackSpeed])
  useEffect(() => { frameStepRef.current = frameStep }, [frameStep])
  useEffect(() => { boxHoldRef.current = boxHoldTime }, [boxHoldTime])
  useEffect(() => { frameIntervalRef.current = frameInterval }, [frameInterval])

  // Backend health check
  useEffect(() => {
    fetch('http://localhost:8000/docs', { method: 'HEAD', mode: 'no-cors' })
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false))
  }, [])

  // Keep overlay in sync whenever detections or video size change
  useEffect(() => {
    latestDetsRef.current = currentDetections
    drawBoxes(overlayRef.current, videoRef.current, currentDetections)
  }, [currentDetections])

  // Redraw on window resize
  useEffect(() => {
    const onResize = () => {
      drawBoxes(overlayRef.current, videoRef.current, latestDetsRef.current)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Video file selection ───────────────────────────────────────────────
  const handleVideoSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setErrorMsg('Please select a video file (MP4, WebM, MOV).')
      return
    }
    setVideoFile(file)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    const newUrl = URL.createObjectURL(file)
    setVideoUrl(newUrl)
    handleReset()
    setErrorMsg('')
    setTimeout(() => {
      if (videoRef.current) videoRef.current.load()
    }, 50)
  }

  // ── Extract current video frame as JPEG blob ───────────────────────────
  const extractFrame = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return null
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 360
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  }, [])

  // ── Send one frame to backend, draw boxes on response ─────────────────
  const sendFrame = useCallback(async () => {
    if (isProcessingRef.current) return
    const blob = await extractFrame()
    if (!blob) return

    isProcessingRef.current = true
    const ctrl = new AbortController()
    abortRef.current = ctrl

    frameNumRef.current += 1
    const fNum = frameNumRef.current
    const t0 = Date.now()

    try {
      const fd = new FormData()
      fd.append('file', blob, `frame_${fNum}.jpg`)
      const res = await fetch('http://localhost:8000/detect?stream=true', {
        method: 'POST', body: fd, signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const ms = Date.now() - t0
      setLatency(ms)
      setBackendOnline(true)

      // ── Parse detections ──────────────────────────────────────────────
      const detections = (data.detections || []).map((d) => ({
        class: d.class,
        confidence: d.confidence,
        severity: d.severity || 'medium',
        box: d.box,  // [x1, y1, x2, y2] in natural image pixels
      }))

      // Update overlay canvas with new boxes
      setCurrentDetections(detections)

      // Stats
      setFrameCount(fNum)
      setTotalObjects((t) => t + detections.length)

      framesSentRef.current += 1
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      if (elapsed > 0) setFps((framesSentRef.current / elapsed).toFixed(1))

      // Alerts
      const newAlerts = evaluateAlerts(detections, fNum)
      if (newAlerts.length > 0) setAlerts((a) => [...newAlerts, ...a].slice(0, 80))

      // Pile ranking
      if (detections.length > 0) {
        const entry = {
          frameId: `F${fNum}`,
          count: detections.length,
          score: weightedScore(detections),
          topClass: detections[0]?.class,
          severity: detections.reduce((max, d) => {
            const R = { critical: 4, high: 3, medium: 2, low: 1 }
            return (R[d.severity] ?? 1) > (R[max] ?? 1) ? d.severity : max
          }, 'low'),
        }
        pileAccRef.current = [...pileAccRef.current, entry]
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
        setPileRanking([...pileAccRef.current])
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setBackendOnline(false)
      setErrorMsg(`Frame ${fNum}: ${err.message}`)
    } finally {
      isProcessingRef.current = false
    }
  }, [extractFrame])

  // Internal stop helper
  const handleStopInternal = useCallback(() => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
    isRunningRef.current = false
    isPausedRef.current = false
    abortRef.current?.abort()
    videoRef.current?.pause()
    setIsRunning(false)
    setIsPaused(false)
    setStatus('done')
  }, [])

  // ── Step-through detection loop ───────────────────────────────────────
  // Video is PAUSED at current position, runs inference, draws boxes directly
  // on that frozen frame, holds for boxHoldTime ms, then advances by frameStep
  const stepDetectLoop = useCallback(async () => {
    const video = videoRef.current
    if (!video || !isRunningRef.current || isPausedRef.current) return

    if (video.duration && video.currentTime >= video.duration - 0.1) {
      handleStopInternal()
      return
    }

    // Freeze video at current frame
    video.pause()
    await new Promise((r) => setTimeout(r, 50))
    if (!isRunningRef.current || isPausedRef.current) return

    // Run inference on exact frozen frame
    await sendFrame()
    if (!isRunningRef.current || isPausedRef.current) return

    // Hold boxes on the frozen frame so user can inspect
    await new Promise((r) => {
      loopTimerRef.current = setTimeout(r, boxHoldRef.current)
    })
    if (!isRunningRef.current || isPausedRef.current) return

    // Seek forward by step
    const nextTime = Math.min(video.currentTime + frameStepRef.current, video.duration || 999999)
    video.currentTime = nextTime

    await new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }
      video.addEventListener('seeked', onSeeked)
      setTimeout(() => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }, 1500)
    })

    if (!isRunningRef.current || isPausedRef.current) return
    loopTimerRef.current = setTimeout(() => stepDetectLoop(), 20)
  }, [sendFrame, handleStopInternal])

  // ── Continuous detection loop ─────────────────────────────────────────
  const continuousDetectLoop = useCallback(async () => {
    const video = videoRef.current
    if (!video || !isRunningRef.current || isPausedRef.current) return

    if (video.duration && video.currentTime >= video.duration - 0.1) {
      handleStopInternal()
      return
    }

    await sendFrame()
    if (!isRunningRef.current || isPausedRef.current) return

    const delay = frameIntervalRef.current > 0 ? frameIntervalRef.current : 60
    loopTimerRef.current = setTimeout(() => continuousDetectLoop(), delay)
  }, [sendFrame, handleStopInternal])

  // ── Playback controls ─────────────────────────────────────────────────
  const handleStart = async () => {
    if (!videoRef.current || !videoFile) return
    setErrorMsg('')

    if (videoRef.current.readyState < 2) {
      try {
        const playPromise = videoRef.current.play()
        if (playPromise) {
          await playPromise
          videoRef.current.pause()
        }
      } catch (e) {
        console.warn('Video play interrupted:', e)
        setErrorMsg(
          'Your browser cannot play this video codec (e.g. MPEG-4 Part 2 / FMP4). Chrome and Edge require standard H.264 (AVC) or WebM video.'
        )
        setStatus('idle')
        setIsRunning(false)
        isRunningRef.current = false
        return
      }
    }

    setStatus('running')
    setIsRunning(true)
    setIsPaused(false)
    isRunningRef.current = true
    isPausedRef.current = false

    startTimeRef.current = Date.now()
    framesSentRef.current = 0

    if (playModeRef.current === 'step') {
      videoRef.current.pause()
      stepDetectLoop()
    } else {
      videoRef.current.playbackRate = playbackSpeedRef.current
      videoRef.current.play().catch((e) => console.warn(e))
      continuousDetectLoop()
    }
  }

  const handlePause = () => {
    if (isPaused) {
      setIsPaused(false)
      isPausedRef.current = false
      setStatus('running')
      if (playModeRef.current === 'step') {
        stepDetectLoop()
      } else {
        if (videoRef.current) {
          videoRef.current.playbackRate = playbackSpeedRef.current
          videoRef.current.play().catch((e) => console.warn(e))
        }
        continuousDetectLoop()
      }
    } else {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
      videoRef.current?.pause()
      setIsPaused(true)
      isPausedRef.current = true
      setStatus('paused')
    }
  }

  const handleStop = () => {
    handleStopInternal()
  }

  const handleReset = () => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
    isRunningRef.current = false
    isPausedRef.current = false
    abortRef.current?.abort()
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
    // Clear overlay
    if (overlayRef.current) {
      const ctx = overlayRef.current.getContext('2d')
      ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
    }
    setIsRunning(false)
    setIsPaused(false)
    setFrameCount(0)
    setCurrentDetections([])
    latestDetsRef.current = []
    setAlerts([])
    setPileRanking([])
    setTotalObjects(0)
    setFps(null)
    setLatency(null)
    frameNumRef.current = 0
    framesSentRef.current = 0
    pileAccRef.current = []
    setStatus('idle')
  }

  // Auto-stop when video ends
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onEnded = () => handleStopInternal()
    video.addEventListener('ended', onEnded)
    return () => video.removeEventListener('ended', onEnded)
  }, [handleStopInternal])

  useEffect(() => () => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
    abortRef.current?.abort()
  }, [])

  return (
    <div className="home-page">
      {/* NAV */}
      <nav className="home-nav">
        <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
          <button className="home-logo" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => onNavigate('home')}>
            <img src={logo} alt="Blue Sentinel" className="home-logo-img" />
            <span className="home-logo-text">Blue Sentinel</span>
          </button>
          <div className="home-nav-links">
            <button className="home-nav-link" onClick={() => onNavigate('home')}>Home</button>
            <button className="home-nav-link home-nav-link-active">ROV Simulator</button>
            <button className="home-nav-link" onClick={() => onNavigate('optimizer')}>Optimizer</button>
            <button className="home-nav-link" onClick={() => onNavigate('about')}>About</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="upload-hero" style={{ background: 'linear-gradient(135deg,#0a1f3a 0%,#0d3260 40%,#0e5e48 100%)' }}>
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" style={{ background: isRunning ? '#4ade80' : '#94a3b8' }} />
            ROV EDGE SIMULATOR &nbsp;&middot;&nbsp; {modelFormat} &nbsp;&middot;&nbsp;
            {status === 'running' ? 'LIVE' : status === 'paused' ? 'PAUSED' : status === 'done' ? 'DONE' : 'STANDBY'}
          </div>
          <h1 className="home-hero-title" style={{ fontSize: 'clamp(24px,4vw,38px)', marginBottom: 8 }}>
            ROV Simulator<br /><em className="home-hero-italic">Live Bounding Box Overlay</em>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 16, maxWidth: 580 }}>
            Upload a video — as it plays, each frame is sent to the backend for RT-DETRv4 inference.
            Bounding boxes, class names, and confidence scores are drawn directly on the video in real time.
          </p>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* File picker */}
            <button onClick={() => fileInputRef.current?.click()} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontWeight: 600, fontSize: 12, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {videoFile ? `📹 ${videoFile.name.slice(0, 24)}…` : '📁 Select Video'}
            </button>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" style={{ display: 'none' }} onChange={handleVideoSelect} />

            {/* Start */}
            <button onClick={handleStart} disabled={!videoFile || isRunning} style={{ background: (!videoFile || isRunning) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#10b981,#059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 20px', borderRadius: 8, cursor: (!videoFile || isRunning) ? 'not-allowed' : 'pointer', opacity: (!videoFile || isRunning) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isRunning && !isPaused ? <><span className="upload-spinner" /> Running…</> : '▶ Start'}
            </button>

            {/* Pause / Resume */}
            <button onClick={handlePause} disabled={!isRunning && !isPaused} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600, fontSize: 12, padding: '8px 16px', borderRadius: 8, cursor: (!isRunning && !isPaused) ? 'not-allowed' : 'pointer', opacity: (!isRunning && !isPaused) ? 0.45 : 1 }}>
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>

            {/* Stop */}
            <button onClick={handleStop} disabled={!isRunning && !isPaused} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600, fontSize: 12, padding: '8px 14px', borderRadius: 8, cursor: (!isRunning && !isPaused) ? 'not-allowed' : 'pointer', opacity: (!isRunning && !isPaused) ? 0.45 : 1 }}>
              ⏹ Stop
            </button>

            {/* Reset */}
            <button onClick={handleReset} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>
              ↺ Reset
            </button>

            {/* Mode Selector */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 3, border: '1px solid rgba(255,255,255,0.2)' }}>
              <button
                type="button"
                onClick={() => setPlayMode('step')}
                disabled={isRunning}
                style={{
                  background: playMode === 'step' ? '#10b981' : 'transparent',
                  color: playMode === 'step' ? '#fff' : 'rgba(255,255,255,0.7)',
                  border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700,
                  cursor: isRunning ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                }}
              >
                🎯 Sync Step (Precise)
              </button>
              <button
                type="button"
                onClick={() => setPlayMode('continuous')}
                disabled={isRunning}
                style={{
                  background: playMode === 'continuous' ? '#3b82f6' : 'transparent',
                  color: playMode === 'continuous' ? '#fff' : 'rgba(255,255,255,0.7)',
                  border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700,
                  cursor: isRunning ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                }}
              >
                ▶ Continuous Slow-Mo
              </button>
            </div>

            {/* Mode-specific settings */}
            {playMode === 'step' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <label style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>⏩ Step</label>
                  <select
                    value={frameStep}
                    onChange={(e) => setFrameStep(Number(e.target.value))}
                    disabled={isRunning}
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 12, padding: '6px 8px', borderRadius: 6, outline: 'none', fontWeight: 600, cursor: 'pointer' }}
                  >
                    <option value={0.2} style={{ color: '#000' }}>0.2s (Micro-step)</option>
                    <option value={0.5} style={{ color: '#000' }}>0.5s (Recommended)</option>
                    <option value={1.0} style={{ color: '#000' }}>1.0s (Fast walk)</option>
                    <option value={2.0} style={{ color: '#000' }}>2.0s (Quick survey)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <label style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>👁 Hold</label>
                  <select
                    value={boxHoldTime}
                    onChange={(e) => setBoxHoldTime(Number(e.target.value))}
                    disabled={isRunning}
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 12, padding: '6px 8px', borderRadius: 6, outline: 'none', fontWeight: 600, cursor: 'pointer' }}
                  >
                    <option value={400} style={{ color: '#000' }}>400ms (Fast)</option>
                    <option value={800} style={{ color: '#000' }}>800ms (Balanced)</option>
                    <option value={1200} style={{ color: '#000' }}>1.2s (Detailed)</option>
                    <option value={2000} style={{ color: '#000' }}>2.0s (Inspect)</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <label style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>⏱ Speed</label>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => {
                      const spd = Number(e.target.value)
                      setPlaybackSpeed(spd)
                      if (videoRef.current) videoRef.current.playbackRate = spd
                    }}
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 12, padding: '6px 8px', borderRadius: 6, outline: 'none', fontWeight: 600, cursor: 'pointer' }}
                  >
                    <option value={0.1} style={{ color: '#000' }}>0.10x (Ultra Slow)</option>
                    <option value={0.25} style={{ color: '#000' }}>0.25x (Slow - Recommended)</option>
                    <option value={0.5} style={{ color: '#000' }}>0.50x (Medium)</option>
                    <option value={1.0} style={{ color: '#000' }}>1.0x (Normal)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <label style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, whiteSpace: 'nowrap' }}>Detect pace</label>
                  <select
                    value={frameInterval}
                    onChange={(e) => setFrameInterval(Number(e.target.value))}
                    disabled={isRunning}
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, padding: '6px 8px', borderRadius: 6, outline: 'none' }}
                  >
                    <option value={0} style={{ color: '#000' }}>Continuous (Auto CPU)</option>
                    <option value={1000} style={{ color: '#000' }}>Every 1s</option>
                    <option value={2000} style={{ color: '#000' }}>Every 2s</option>
                  </select>
                </div>
              </>
            )}

            {/* Model format */}
            <select
              value={modelFormat}
              onChange={(e) => setModelFormat(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, padding: '6px 8px', borderRadius: 6, outline: 'none' }}
            >
              <option value="ONNX" style={{ color: '#000' }}>ONNX</option>
              <option value="TorchScript" style={{ color: '#000' }}>TorchScript</option>
              <option value="TensorRT" style={{ color: '#000' }}>TensorRT (GPU)</option>
            </select>
          </div>

          {/* Error / backend status */}
          {backendOnline === false && (
            <p style={{ marginTop: 10, fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '7px 14px', borderRadius: 8, display: 'inline-block' }}>
              ⚠️ Backend offline — start FastAPI on port 8000 before running
            </p>
          )}
          {errorMsg && <p style={{ marginTop: 8, fontSize: 12, color: '#fde68a' }}>⚠️ {errorMsg}</p>}
        </div>
      </section>

      {/* STAT ROW */}
      <section style={{ background: '#e4eff5', padding: '20px 32px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="upload-stats-row" style={{ marginBottom: 0 }}>
            {[
              { label: 'FRAMES SENT', value: frameCount, sub: fps ? `${fps} sends/sec` : 'waiting…' },
              { label: 'OBJECTS DETECTED', value: totalObjects, sub: 'cumulative across frames' },
              { label: 'ALERTS', value: alerts.length, sub: 'critical events only', color: alerts.length > 0 ? '#ef4444' : undefined },
              { label: 'INFERENCE LATENCY', value: latency ? `${latency} ms` : '—', sub: `${modelFormat} · Port 8000`, color: latency && latency < 800 ? '#10b981' : latency ? '#f97316' : undefined },
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

      {/* MAIN */}
      <section style={{ background: '#e4eff5', padding: '16px 32px 48px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* LEFT: Video with bbox overlay */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── VIDEO + OVERLAY CANVAS ── */}
            <div className="home-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p className="home-card-num" style={{ margin: 0 }}>LIVE DETECTION FEED</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isRunning && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#10b981', fontWeight: 700 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'status-pulse 1.5s infinite' }} />
                      LIVE
                    </span>
                  )}
                  {latency && <span style={{ fontSize: 11, color: '#6a9ab0', fontFamily: 'monospace' }}>{latency}ms latency</span>}
                </div>
              </div>

              {videoUrl ? (
                /* Container: video + canvas stacked */
                <div style={{ position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden', lineHeight: 0 }}>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    muted
                    playsInline
                    style={{ width: '100%', display: 'block', borderRadius: 10 }}
                    onLoadedMetadata={() => {
                      if (videoRef.current) videoRef.current.playbackRate = playbackSpeed
                    }}
                    onError={() => {
                      setErrorMsg('Browser video decoder error: This video format/codec is not supported by your browser (e.g. MPEG-4 Part 2 / FMP4). Chrome and Edge require standard H.264 (AVC) or WebM.')
                      handleStop()
                    }}
                    onPlay={() => {
                      if (videoRef.current) videoRef.current.playbackRate = playbackSpeed
                      // Draw immediately on first play frame
                      drawBoxes(overlayRef.current, videoRef.current, latestDetsRef.current)
                    }}
                  />
                  {/* Transparent canvas overlaid exactly on the video */}
                  <canvas
                    ref={overlayRef}
                    style={{
                      position: 'absolute', top: 0, left: 0,
                      width: '100%', height: '100%',
                      pointerEvents: 'none', borderRadius: 10,
                    }}
                  />
                  {/* REC badge */}
                  {isRunning && (
                    <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(239,68,68,0.88)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.04em' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'status-pulse 1s infinite' }} />
                      REC
                    </div>
                  )}
                  {/* Frame counter */}
                  {frameCount > 0 && (
                    <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
                      FRAME {frameCount}
                    </div>
                  )}
                </div>
              ) : (
                /* Empty state */
                <div onClick={() => fileInputRef.current?.click()} style={{ background: '#0a1520', borderRadius: 10, height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px dashed #1a4a6a' }}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#3a8aaa" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <p style={{ color: '#4a8aaa', fontSize: 15, fontWeight: 600 }}>Click to select video</p>
                  <p style={{ color: '#3a6a8a', fontSize: 12, marginTop: 6 }}>MP4 · WebM · MOV</p>
                </div>
              )}

              {/* Legend */}
              {currentDetections.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {currentDetections.map((d, i) => (
                    <span key={i} style={{ background: getColor(d.class) + '22', color: getColor(d.class), border: `1px solid ${getColor(d.class)}55`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                      {d.class.replace(/^(trash_|animal_)/, '')} &nbsp;{(d.confidence * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Detailed detection list for current frame */}
            {currentDetections.length > 0 && (
              <div className="home-card" style={{ padding: 18 }}>
                <p className="home-card-num" style={{ marginBottom: 12 }}>FRAME {frameCount} &mdash; DETECTIONS ({currentDetections.length})</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {currentDetections.map((d, i) => (
                    <div key={i} className="upload-detection-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: getColor(d.class), flexShrink: 0, display: 'inline-block' }} />
                        <span className="upload-detection-name" style={{ fontSize: 12 }}>{d.class.replace(/_/g, ' ')}</span>
                        <span style={{ background: SEVERITY_BG[d.severity], color: SEVERITY_COLOR[d.severity], border: `1px solid ${SEVERITY_COLOR[d.severity]}40`, borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{d.severity}</span>
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
                  Minor items (single bottle, cloth) are logged but do not trigger an alert.
                </p>
              </div>
            )}

            {/* Hidden extraction canvas */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>

          {/* RIGHT: Alerts + Pile Ranking */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Alert log */}
            <div className="home-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p className="home-card-num" style={{ margin: 0 }}>⚡ ALERT LOG</p>
                {alerts.length > 0 && (
                  <span style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                    {alerts.length} ACTIVE
                  </span>
                )}
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '28px 0', color: '#6a9ab0', fontSize: 13 }}>
                    {isRunning ? '🔍 Monitoring for critical events…' : '✅ No alerts — start the simulator'}
                  </div>
                ) : alerts.map((alert) => (
                  <div key={alert.id} style={{ background: alert.severity === 'critical' ? '#fef2f2' : '#fff7ed', border: `1px solid ${SEVERITY_COLOR[alert.severity]}40`, borderLeft: `3px solid ${SEVERITY_COLOR[alert.severity]}`, borderRadius: 8, padding: '9px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: SEVERITY_COLOR[alert.severity] }}>🚨 {alert.type}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{alert.ts} &middot; F{alert.frame}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#1a3a4a', marginTop: 4, lineHeight: 1.4 }}>{alert.message}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pile ranking */}
            <div className="home-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p className="home-card-num" style={{ margin: 0 }}>📊 PILE RANKING</p>
                <span style={{ fontSize: 11, color: '#6a9ab0' }}>Weighted by class hazard</span>
              </div>
              {pileRanking.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6a9ab0', fontSize: 13, padding: '20px 0' }}>
                  Ranking builds as frames are processed…
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pileRanking.map((pile, rank) => (
                    <div key={pile.frameId + rank} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: rank === 0 ? '#fffbeb' : '#f8fbfd', border: `1px solid ${rank === 0 ? '#fcd34d40' : '#e0eef5'}`, borderRadius: 10 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: rank === 0 ? '#fbbf24' : rank === 1 ? '#94a3b8' : '#cd7c3a', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{rank + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f2030' }}>{pile.frameId}</span>
                          <span style={{ background: SEVERITY_BG[pile.severity], color: SEVERITY_COLOR[pile.severity], border: `1px solid ${SEVERITY_COLOR[pile.severity]}40`, borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{pile.severity}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                          <span style={{ fontSize: 11, color: '#6a9ab0' }}>{pile.count} obj &middot; score {pile.score.toFixed(1)}</span>
                          <span style={{ fontSize: 11, color: '#6a9ab0' }}>{(pile.topClass || '').replace(/^(trash_|animal_)/, '')}</span>
                        </div>
                        <div style={{ height: 3, background: '#e0eef5', borderRadius: 999, overflow: 'hidden', marginTop: 5 }}>
                          <div style={{ height: '100%', background: SEVERITY_COLOR[pile.severity], width: `${Math.min(100, (pile.score / 12) * 100)}%`, borderRadius: 999, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pileRanking.length > 0 && (
                <p style={{ fontSize: 11, color: '#6a9ab0', marginTop: 10, fontStyle: 'italic' }}>
                  Net/rope = 3x weight, bottles = 1x. Cleanup should prioritize Rank #1.
                </p>
              )}
            </div>

            {/* Limitations */}
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: '#92400e', fontWeight: 700, marginBottom: 4 }}>⚠️ Stated Limitations</p>
              <p style={{ fontSize: 11, color: '#78350f', lineHeight: 1.55 }}>
                Entanglement is approximated from bounding-box co-occurrence, not confirmed overlap.
                Pile size is a count only (no scale reference). TensorRT requires an NVIDIA GPU.
                Inference latency depends on hardware &mdash; reduce &quot;Detect every&quot; if boxes lag.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinel &mdash; ROV Edge Simulator</p>
        <p className="home-footer-sub">RT-DETRv4 &middot; Live bbox overlay via Canvas API &middot; FastAPI port 8000</p>
      </footer>
    </div>
  )
}
