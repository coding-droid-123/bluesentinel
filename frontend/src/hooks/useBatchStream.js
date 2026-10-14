import { useState, useRef, useCallback, useEffect } from 'react'
import { WS_BATCH_URL } from '../config'

/**
 * Natural filename parser matching regex: (vid_\d+)_(\d+)
 * Returns { zone: string, frame: number, isUnknown: boolean }
 */
export function parseFilename(filename) {
  if (!filename) return { zone: 'vid_unknown', frame: 0, isUnknown: true }
  const match = filename.match(/(vid_\d+)_(\d+)/i)
  if (match) {
    return {
      zone: match[1].toLowerCase(),
      frame: parseInt(match[2], 10),
      isUnknown: false,
    }
  }
  return { zone: 'vid_unknown', frame: 0, isUnknown: true }
}

/**
 * Sort files in natural/numeric order: by zone first, then by numeric frame number.
 */
export function sortFiles(files) {
  return [...files].sort((a, b) => {
    const metaA = parseFilename(a.name)
    const metaB = parseFilename(b.name)
    if (metaA.zone !== metaB.zone) {
      return metaA.zone.localeCompare(metaB.zone)
    }
    return metaA.frame - metaB.frame
  })
}

/**
 * Custom React hook for high-performance streaming of batch images over WebSocket.
 */
export default function useBatchStream({ wsUrl = WS_BATCH_URL } = {}) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [progress, setProgress] = useState({ processed: 0, total: 0, percent: 0, currentFile: '' })
  const [fps, setFps] = useState(0)
  const [frames, setFrames] = useState([])
  const [currentFrame, setCurrentFrame] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [hotspots, setHotspots] = useState({})
  const [zones, setZones] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [windowSize, setWindowSizeState] = useState(30)

  const wsRef = useRef(null)
  const isAbortedRef = useRef(false)
  const startTimeRef = useRef(null)
  const processedCountRef = useRef(0)
  const pendingFilesRef = useRef([])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isAbortedRef.current = true
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
    }
  }, [])

  const stop = useCallback(() => {
    isAbortedRef.current = true
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'finish' }))
      } catch (e) {
        // ignore
      }
    }
    setIsStreaming(false)
  }, [])

  const setWindowSize = useCallback((size) => {
    setWindowSizeState(size)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'set_window_size', window_size: size }))
      } catch (e) {
        console.error('Failed to update window size over WS:', e)
      }
    }
  }, [])

  const start = useCallback(async (files, options = {}) => {
    if (!files || files.length === 0) return

    // 1. Natural sort files by zone then numeric frame
    const sortedFiles = sortFiles(files)
    const confThreshold = options.confidence ?? 0.4
    const gapThreshold = options.gapThreshold ?? 10
    const wSize = options.windowSize ?? windowSize

    // Reset state
    setError(null)
    setFrames([])
    setCurrentFrame(null)
    setAlerts([])
    setHotspots({})
    setZones([])
    setSummary(null)
    setIsFinished(false)
    setIsStreaming(true)
    isAbortedRef.current = false
    processedCountRef.current = 0
    startTimeRef.current = Date.now()
    pendingFilesRef.current = sortedFiles

    setProgress({
      processed: 0,
      total: sortedFiles.length,
      percent: 0,
      currentFile: sortedFiles[0].name,
    })

    // Establish WebSocket connection
    let ws
    try {
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws
    } catch (err) {
      setError(`Could not open WebSocket: ${err.message}`)
      setIsStreaming(false)
      return
    }

    await new Promise((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = (e) => reject(new Error('WebSocket connection failed to ' + wsUrl))
    }).catch((err) => {
      setError(err.message)
      setIsStreaming(false)
      return
    })

    // Helper promise for single-frame server acknowledgment
    let frameResolver = null

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'frame') {
          processedCountRef.current += 1
          const count = processedCountRef.current
          const elapsed = (Date.now() - startTimeRef.current) / 1000
          const currentFps = elapsed > 0 ? (count / elapsed).toFixed(1) : 0
          setFps(parseFloat(currentFps))

          setProgress({
            processed: count,
            total: sortedFiles.length,
            percent: Math.min(100, Math.round((count / sortedFiles.length) * 100)),
            currentFile: msg.filename,
          })

          // Save current frame for live rendering
          setCurrentFrame(msg)
          setFrames((prev) => [msg, ...prev.slice(0, 50)])

          // Update alerts
          if (msg.alerts && msg.alerts.length > 0) {
            setAlerts((prev) => [...msg.alerts, ...prev].slice(0, 100))
          }

          // Update hotspots map data
          if (msg.hotspots) {
            setHotspots(msg.hotspots)
            setZones(Object.keys(msg.hotspots))
          }

          if (frameResolver) {
            frameResolver()
            frameResolver = null
          }
        } else if (msg.type === 'window_size_updated') {
          if (msg.hotspots) {
            setHotspots(msg.hotspots)
            setZones(Object.keys(msg.hotspots))
          }
        } else if (msg.type === 'error') {
          console.warn(`Frame error for ${msg.filename}:`, msg.message)
          if (frameResolver) {
            frameResolver()
            frameResolver = null
          }
        } else if (msg.type === 'done') {
          setSummary(msg.summary)
          setIsFinished(true)
          setIsStreaming(false)
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err)
        if (frameResolver) {
          frameResolver()
          frameResolver = null
        }
      }
    }

    ws.onerror = (e) => {
      console.error('WebSocket error:', e)
      setError('WebSocket connection error.')
      setIsStreaming(false)
      if (frameResolver) {
        frameResolver()
        frameResolver = null
      }
    }

    ws.onclose = () => {
      setIsStreaming(false)
      if (frameResolver) {
        frameResolver()
        frameResolver = null
      }
    }

    // 2. Stream files sequentially with backpressure check
    try {
      for (let i = 0; i < sortedFiles.length; i++) {
        if (isAbortedRef.current || ws.readyState !== WebSocket.OPEN) {
          break
        }

        const file = sortedFiles[i]

        // Apply backpressure: wait while buffer is congested (> 128 KB)
        while (ws.bufferedAmount > 128 * 1024 && !isAbortedRef.current) {
          await new Promise((r) => setTimeout(r, 20))
        }

        // Read file bytes
        const buffer = await file.arrayBuffer()

        // Send JSON header
        ws.send(JSON.stringify({
          filename: file.name,
          conf: confThreshold,
          gap_threshold: gapThreshold,
          window_size: wSize,
        }))

        // Send binary payload
        ws.send(buffer)

        // Await server acknowledgment before sending next frame
        await new Promise((resolve) => {
          frameResolver = resolve
          // Timeout fallback in case of frame drop
          setTimeout(() => {
            if (frameResolver) {
              frameResolver()
              frameResolver = null
            }
          }, 4000)
        })
      }

      // 3. Send finish signal when all files are transmitted
      if (ws.readyState === WebSocket.OPEN && !isAbortedRef.current) {
        ws.send(JSON.stringify({ type: 'finish' }))
      }
    } catch (sendErr) {
      console.error('Error during batch transmission:', sendErr)
      setError(`Transmission error: ${sendErr.message}`)
      setIsStreaming(false)
    }
  }, [windowSize, wsUrl])

  return {
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
  }
}
