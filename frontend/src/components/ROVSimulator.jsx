import React, { useState, useRef, useEffect, useCallback } from 'react'
import NavBar from './NavBar'
import SchematicMap from './SchematicMap'
import { API_BASE_URL } from '../config'
import { addHistoryRecord } from '../hooks/useHistory'
import {
  ALERT_PILE_THRESHOLD,
  CLASS_WEIGHT,
  GHOST_GEAR,
  ANIMALS,
  SEVERITY_COLOR,
  SEVERITY_BG,
  CLASS_COLORS,
  getColor,
  boxIoU,
  drawBoxes,
} from '../utils/drawing'
import { evaluateAlerts, weightedScore } from '../utils/alerts'

export default function ROVSimulator({ onNavigate }) {
  const [videoFile, setVideoFile]               = useState(null)
  const [videoUrl, setVideoUrl]                 = useState(null)
  const [isRunning, setIsRunning]               = useState(false)
  const [isPaused, setIsPaused]                 = useState(false)
  const [frameCount, setFrameCount]             = useState(0)
  const [currentDetections, setCurrentDetections] = useState([])
  const [alerts, setAlerts]                     = useState([])
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
  const videoUrlRef      = useRef(null)
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

  // ── Multi-Object Tracking (MOT) state & refs ─────────────────────────────
  const activeTracksRef   = useRef([]) // [{ id, box, class, lastFrame, lostFrames }]
  const nextTrackIdRef    = useRef(1)
  const uniqueCountRef    = useRef(0)
  const classTallyRef     = useRef({})
  const lastAlertFrameRef = useRef({})
  const missionIdRef      = useRef(null)  // Active mission UUID from /missions/start
  const entanglePersRef   = useRef({})    // Persistence gate for entanglement
  const [missionLogStatus, setMissionLogStatus] = useState(null)

  // ── Schematic Hotspot Map state ──────────────────────────────────────────
  const [hotspotsData, setHotspotsData]   = useState({})
  const [hotspotWindowSize, setHotspotWindowSize] = useState(10) // 10-frame evaluation window as requested
  const hotspotWindowsRef = useRef({})  // { windowIdx: { uniqueObjects: Set, classesCount: {}, frameStart, frameEnd, frameDataUrl } }
  const hotspotMinFrameRef = useRef(Infinity)
  const hotspotMaxFrameRef = useRef(0)
  const hotspotFrameCountRef = useRef(0)

  useEffect(() => { playModeRef.current = playMode }, [playMode])
  useEffect(() => { playbackSpeedRef.current = playbackSpeed }, [playbackSpeed])
  useEffect(() => { frameStepRef.current = frameStep }, [frameStep])
  useEffect(() => { boxHoldRef.current = boxHoldTime }, [boxHoldTime])
  useEffect(() => { frameIntervalRef.current = frameInterval }, [frameInterval])

  // Backend health check
  useEffect(() => {
    fetch(`${API_BASE_URL}/docs`, { method: 'HEAD', mode: 'no-cors' })
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
    videoUrlRef.current = newUrl
    setVideoUrl(newUrl)
    handleReset()
    setErrorMsg('')
    try {
      addHistoryRecord({
        type: 'rov',
        label: file.name ? `ROV Survey — ${file.name}` : 'ROV Video Transect',
        summary: { totalObjects: 0, debrisCount: 0, highestSeverity: 'medium', uniqueTypes: 0 },
        location: 'ROV Underwater Transect',
      })
    } catch {}
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

  // ── Capture frame as data URL (for thumbnails in piles/alerts) ───────────
  const captureFrameDataUrl = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return null
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 360
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.6)  // compact data URL
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
      const res = await fetch(`${API_BASE_URL}/detect?stream=true`, {
        method: 'POST', body: fd, signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const ms = Date.now() - t0
      setLatency(ms)
      setBackendOnline(true)

      // ── Parse detections ──────────────────────────────────────────────
      const rawDetections = (data.detections || []).map((d) => ({
        class: d.class,
        confidence: d.confidence,
        severity: d.severity || 'medium',
        box: d.box,  // [x1, y1, x2, y2] in natural image pixels
      }))

      // ── Multi-Object Tracking via IoU matching (eliminates duplicates) ───
      const prevTracks = activeTracksRef.current
      const matchedIndices = new Set()
      const trackedDetections = []

      for (const det of rawDetections) {
        let bestIoU = 0
        let bestIdx = -1

        for (let i = 0; i < prevTracks.length; i++) {
          if (matchedIndices.has(i)) continue
          if (prevTracks[i].class === det.class) {
            const iou = boxIoU(prevTracks[i].box, det.box)
            if (iou > bestIoU && iou >= 0.35) {
              bestIoU = iou
              bestIdx = i
            }
          }
        }

        let trackId
        if (bestIdx >= 0) {
          // Matched an existing object track
          matchedIndices.add(bestIdx)
          trackId = prevTracks[bestIdx].id
          prevTracks[bestIdx].box = det.box
          prevTracks[bestIdx].lastFrame = fNum
          prevTracks[bestIdx].lostFrames = 0
        } else {
          // New unique object detected
          trackId = nextTrackIdRef.current++
          // Stop counting ROV vehicle or machinery as cleanup debris
          if (det.class !== 'rov') {
            uniqueCountRef.current += 1
            classTallyRef.current[det.class] = (classTallyRef.current[det.class] || 0) + 1
          }
          prevTracks.push({
            id: trackId,
            box: det.box,
            class: det.class,
            lastFrame: fNum,
            lostFrames: 0,
          })
        }
        trackedDetections.push({ ...det, trackId })
      }

      // Evict lost tracks if not seen for > 8 frames
      for (let i = prevTracks.length - 1; i >= 0; i--) {
        if (!matchedIndices.has(i) && prevTracks[i].lastFrame !== fNum) {
          prevTracks[i].lostFrames += 1
          if (prevTracks[i].lostFrames > 8) {
            prevTracks.splice(i, 1)
          }
        }
      }
      activeTracksRef.current = prevTracks

      // Update overlay canvas with tracked boxes
      setCurrentDetections(trackedDetections)

      // Stats: Cumulative count is strictly UNIQUE tracked objects
      setFrameCount(fNum)
      setTotalObjects(uniqueCountRef.current)

      framesSentRef.current += 1
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      if (elapsed > 0) setFps((framesSentRef.current / elapsed).toFixed(1))

      // Alerts & automatic triage incident dispatch
      const alertFrameDataUrl = captureFrameDataUrl()
      const newAlerts = evaluateAlerts(trackedDetections, fNum, entanglePersRef)
      if (newAlerts.length > 0) {
        // Attach frame snapshot and detection list to each alert
        const alertsWithFrame = newAlerts.map((alt) => ({
          ...alt,
          frameDataUrl: alertFrameDataUrl,
          detections: trackedDetections.map((d) => ({ class: d.class, confidence: d.confidence, severity: d.severity })),
        }))
        setAlerts((a) => [...alertsWithFrame, ...a].slice(0, 80))

        // Auto-post critical emergencies to database /incidents
        for (const alt of newAlerts) {
          if (alt.severity === 'critical') {
            const lastSeen = lastAlertFrameRef.current[alt.type] || 0
            if (fNum - lastSeen >= 6) {
              lastAlertFrameRef.current[alt.type] = fNum
              try {
                const incFd = new FormData()
                if (missionIdRef.current) incFd.append('mission_id', missionIdRef.current)
                incFd.append('incident_type', alt.type)
                incFd.append('severity', alt.severity)
                incFd.append('frame_number', fNum)
                incFd.append('timestamp_sec', videoRef.current?.currentTime || 0)
                incFd.append('description', alt.message)
                if (alt.animal) incFd.append('animal_species', alt.animal)
                if (alt.gear) incFd.append('gear_type', alt.gear)
                if (blob) incFd.append('snapshot', blob, `incident_f${fNum}.jpg`)

                fetch(`${API_BASE_URL}/incidents`, {
                  method: 'POST',
                  body: incFd,
                }).catch((e) => console.warn('Incident log warning:', e))
              } catch (e) {
                console.warn('Failed to upload incident snapshot:', e)
              }
            }
          }
        }
      }

      // ── Schematic Hotspot & Debris Pile Aggregation (10-frame windows) ──
      // Look at 10-frame increments and create distinct piles with frame thumbnails
      // ONLY count harmful objects (critical, high, medium severity; strictly ignore low severity / biota)
      const ws = hotspotWindowSize || 10
      const windowIdx = Math.floor((fNum - 1) / ws)

      if (!hotspotWindowsRef.current[windowIdx]) {
        hotspotWindowsRef.current[windowIdx] = {
          uniqueObjects: new Set(),
          classesCount: {},
          frameStart: windowIdx * ws + 1,
          frameEnd: (windowIdx + 1) * ws,
          frameDataUrl: null,
          hasHazard: false,
        }
      }
      const win = hotspotWindowsRef.current[windowIdx]

      for (const det of trackedDetections) {
        // Only count harmful debris objects (strictly exclude ROV, plant, and marine fauna)
        if (det.class === 'rov' || det.class === 'plant' || det.class.startsWith('animal_')) continue
        if (!det.severity || det.severity === 'low') continue
        const objKey = `${det.trackId}::${det.class}`
        if (!win.uniqueObjects.has(objKey)) {
          win.uniqueObjects.add(objKey)
          win.classesCount[det.class] = (win.classesCount[det.class] || 0) + 1
        }
        win.hasHazard = true
      }

      // Capture frame thumbnail for this 10-frame pile if not yet captured and harmful debris is present
      const harmfulDets = trackedDetections.filter((d) => d.severity && d.severity !== 'low')
      if (harmfulDets.length > 0 && !win.frameDataUrl) {
        win.frameDataUrl = captureFrameDataUrl()
      }

      hotspotMinFrameRef.current = Math.min(hotspotMinFrameRef.current, fNum)
      hotspotMaxFrameRef.current = Math.max(hotspotMaxFrameRef.current, fNum)
      hotspotFrameCountRef.current += 1

      // Rebuild pile list for SchematicMap
      const zoneName = videoFile?.name
        ? (videoFile.name.match(/(vid_\d+)/i)?.[1]?.toLowerCase() || 'rov_dive')
        : 'rov_dive'
      const minF = hotspotMinFrameRef.current
      const maxF = hotspotMaxFrameRef.current

      // Filter to 10-frame windows that contain detections / debris
      const spotList = Object.entries(hotspotWindowsRef.current)
        .sort(([a], [b]) => Number(a) - Number(b))
        .filter(([, w]) => w.uniqueObjects.size > 0)
        .map(([wIdx, w], pileSeqIdx) => {
          let score = 0
          let dominantCls = null
          let maxCount = 0
          let debrisCount = 0
          for (const [cls, cnt] of Object.entries(w.classesCount)) {
            const isTrash = cls.startsWith('trash_') || GHOST_GEAR.has(cls)
            if (isTrash) debrisCount += cnt
            score += (CLASS_WEIGHT[cls] ?? 1) * cnt
            if (cnt > maxCount) { maxCount = cnt; dominantCls = cls }
          }
          score = Math.round(score * 100) / 100

          // Determine severity tier
          let severity = 'low'
          const hasGhostGear = Object.keys(w.classesCount).some((c) => GHOST_GEAR.has(c))
          if (hasGhostGear || score >= 12) severity = 'critical'
          else if (score >= 6 || w.hasHazard) severity = 'high'
          else if (score >= 2) severity = 'medium'

          return {
            zone: zoneName,
            pile_id: `pile_${Number(wIdx) + 1}`,
            pile_number: pileSeqIdx + 1,
            window_index: Number(wIdx),
            frame_start: w.frameStart,
            frame_end: w.frameEnd,
            score,
            severity,
            object_count: debrisCount > 0 ? debrisCount : w.uniqueObjects.size,
            debris_count: debrisCount,
            dominant_class: dominantCls || 'trash_debris',
            classes: { ...w.classesCount },
            frameDataUrl: w.frameDataUrl || null,
          }
        })

      setHotspotsData({
        [zoneName]: {
          min_frame: minF,
          max_frame: maxF,
          total_frames_processed: hotspotFrameCountRef.current,
          hotspots: spotList,
        },
      })
    } catch (err) {
      if (err.name === 'AbortError') return
      if (err.message?.includes('HTTP') || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setBackendOnline(false)
      }
      setErrorMsg(`Frame ${fNum}: ${err.message}`)
    } finally {
      isProcessingRef.current = false
    }
  }, [extractFrame])

  // Internal stop helper with automated survey mission database logging
  const handleStopInternal = useCallback(async () => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
    isRunningRef.current = false
    isPausedRef.current = false
    abortRef.current?.abort()
    videoRef.current?.pause()
    setIsRunning(false)
    setIsPaused(false)
    setStatus('done')

    // Persist completed mission summary to backend /missions/finish
    if (frameNumRef.current > 0) {
      const elapsedSec = startTimeRef.current
        ? Math.max(0.1, (Date.now() - startTimeRef.current) / 1000)
        : 0.1
      const currentFps = framesSentRef.current > 0
        ? parseFloat((framesSentRef.current / elapsedSec).toFixed(1))
        : 0

      const payload = {
        name: videoFile ? `ROV Survey - ${videoFile.name}` : `ROV Survey ${new Date().toLocaleTimeString()}`,
        video_source: videoFile ? videoFile.name : 'rov_stream',
        duration_sec: parseFloat(elapsedSec.toFixed(1)),
        total_frames: frameNumRef.current,
        total_unique_objects: uniqueCountRef.current,
        fps: currentFps,
        model_format: modelFormat,
        avg_latency_ms: latency || 0,
        summary_by_class: classTallyRef.current,
        hotspots: Object.entries(hotspotWindowsRef.current)
          .filter(([, w]) => w.uniqueObjects.size > 0)
          .map(([wIdx, w]) => ({
            frame_number: w.frameStart,
            debris_count: w.uniqueObjects.size,
            weighted_score: w.hasHazard ? 10 : 2,
            dominant_class: Object.keys(w.classesCount)[0] || 'trash_debris',
          })),
        schematic_hotspots: Object.entries(hotspotWindowsRef.current)
          .map(([wIdx, w]) => ({
            window_index: Number(wIdx),
            frame_start: w.frameStart,
            frame_end: w.frameEnd,
            object_count: w.uniqueObjects.size,
            classes: { ...w.classesCount },
          })),
      }

      try {
        const res = await fetch(`${API_BASE_URL}/missions/finish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const resData = await res.json()
          setMissionLogStatus({ success: true, missionId: resData.mission_id })
        }
      } catch (err) {
        console.warn('Failed to save survey mission:', err)
        setMissionLogStatus({ success: false, error: err.message })
      }

      // Record survey mission in persistent history
      try {
        const allWindows = Object.values(hotspotWindowsRef.current || {})
        let totalHarmful = 0
        let highestSev = 'low'
        const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }
        allWindows.forEach((w) => {
          totalHarmful += w.uniqueObjects.size
          if (w.hasHazard && (sevRank[highestSev] < 3)) highestSev = 'high'
        })
        if (alerts.some((a) => a.severity === 'critical')) highestSev = 'critical'

        const sampleThumb = allWindows.find((w) => w.frameDataUrl)?.frameDataUrl || captureFrameDataUrl()

        addHistoryRecord({
          type: 'rov',
          label: videoFile ? videoFile.name : `ROV Survey (${frameNumRef.current} frames)`,
          summary: {
            totalObjects: uniqueCountRef.current,
            debrisCount: totalHarmful,
            highestSeverity: highestSev,
            uniqueTypes: Object.keys(classTallyRef.current || {}).length,
          },
          thumbnailDataUrl: sampleThumb,
          inventory: Object.entries(classTallyRef.current || {})
            .filter(([cls]) => cls.startsWith('trash_'))
            .map(([cls, cnt]) => ({ class: cls, count: cnt })),
          location: 'ROV Underwater Transect',
        })
      } catch (histErr) {
        console.warn('Failed to record ROV mission to history:', histErr)
      }
    }
  }, [videoFile, modelFormat, latency, alerts])

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

    // Register mission in background (fire-and-forget) — never blocks detection start
    fetch(`${API_BASE_URL}/missions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: videoFile ? `ROV Survey - ${videoFile.name}` : `ROV Survey ${new Date().toLocaleTimeString()}`,
        video_source: videoFile ? videoFile.name : 'rov_stream',
        model_format: modelFormat,
      }),
    })
      .then((res) => res.ok ? res.json() : null)
      .then((d) => { if (d?.mission_id) missionIdRef.current = d.mission_id })
      .catch(() => { missionIdRef.current = null })

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
    setTotalObjects(0)
    setFps(null)
    setLatency(null)
    frameNumRef.current = 0
    framesSentRef.current = 0
    pileAccRef.current = []
    activeTracksRef.current = []
    nextTrackIdRef.current = 1
    uniqueCountRef.current = 0
    classTallyRef.current = {}
    lastAlertFrameRef.current = {}
    entanglePersRef.current = {}
    missionIdRef.current = null
    setMissionLogStatus(null)
    hotspotWindowsRef.current = {}
    hotspotMinFrameRef.current = Infinity
    hotspotMaxFrameRef.current = 0
    hotspotFrameCountRef.current = 0
    setHotspotsData({})
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
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current)
    }
  }, [])

  return (
    <div className="home-page">
      <NavBar page="rov" onNavigate={onNavigate} />

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
              {videoFile?.name ? `📹 ${videoFile.name.slice(0, 24)}…` : '📁 Select Video'}
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
          {missionLogStatus && (
            <div style={{ marginTop: 10, fontSize: 12, background: missionLogStatus.success ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)', border: `1px solid ${missionLogStatus.success ? '#10b981' : '#ef4444'}`, color: '#fff', padding: '8px 14px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span>{missionLogStatus.success ? '✅' : '⚠️'}</span>
              <span>
                {missionLogStatus.success
                  ? `Survey Mission Logged to Database (ID: ${missionLogStatus.missionId ? missionLogStatus.missionId.slice(0, 8) : ''}…)`
                  : `Failed to save mission to DB: ${missionLogStatus.error}`}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* STAT ROW */}
      <section style={{ background: '#e4eff5', padding: '20px 32px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="upload-stats-row" style={{ marginBottom: 0 }}>
            {[
              { label: 'FRAMES SENT', value: frameCount, sub: fps ? `${fps} sends/sec` : 'waiting…' },
              { label: 'DEBRIS DETECTED', value: totalObjects, sub: 'unique tracked debris (excluding ROV)' },
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

          {/* RIGHT: Schematic Hotspot Map, Alerts + Pile Ranking */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Schematic Transect Hotspot Map */}
            <div className="home-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p className="home-card-num" style={{ margin: 0 }}>🗺️ SCHEMATIC HOTSPOT MAP</p>
                <span style={{ fontSize: 11, color: '#6a9ab0' }}>No GPS Required · Transect Windows</span>
              </div>
              <SchematicMap
                hotspots={hotspotsData}
                windowSize={hotspotWindowSize}
                onWindowSizeChange={setHotspotWindowSize}
                onNavigate={onNavigate}
              />
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
