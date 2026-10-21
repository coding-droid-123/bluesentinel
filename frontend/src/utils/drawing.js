/**
 * Shared Visual & Drawing Utilities for Blue Sentinel
 * Centralizes bounding box rendering, marine ontology palettes, and spatial metrics.
 */

export const ALERT_PILE_THRESHOLD = 5
export const TRACKING_IOU_THRESHOLD = 0.20

export const CLASS_WEIGHT = {
  trash_net: 3,
  trash_rope: 3,
  trash_tarp: 2.5,
  trash_pipe: 2,
  trash_wreckage: 2,
  trash_bag: 1.5,
  trash_bottle: 1,
  trash_cup: 1,
  trash_can: 1.5,
  trash_container: 1.5,
  trash_clothing: 1,
  trash_branch: 0.8,
  trash_snack_wrapper: 0.8,
  trash_unknown_instance: 0.8,
}

export const GHOST_GEAR = new Set(['trash_net', 'trash_rope', 'trash_tarp'])

export const ANIMALS = new Set([
  'animal_fish',
  'animal_eel',
  'animal_crab',
  'animal_starfish',
  'animal_shells',
  'animal_etc',
])

export const SEVERITY_COLOR = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#10b981',
}

export const SEVERITY_BG = {
  critical: '#fef2f2',
  high: '#fff7ed',
  medium: '#fefce8',
  low: '#f0fdf4',
}

// Map class → colour for bbox stroke and labels
export const CLASS_COLORS = {
  trash_net: '#ef4444',
  trash_rope: '#ef4444',
  trash_tarp: '#ef4444',
  trash_wreckage: '#f97316',
  trash_pipe: '#f97316',
  trash_bag: '#eab308',
  trash_bottle: '#eab308',
  trash_cup: '#eab308',
  trash_can: '#eab308',
  trash_container: '#eab308',
  trash_clothing: '#a855f7',
  trash_branch: '#a855f7',
  trash_snack_wrapper: '#a855f7',
  animal_fish: '#10b981',
  animal_crab: '#10b981',
  animal_eel: '#10b981',
  animal_starfish: '#10b981',
  animal_shells: '#10b981',
  animal_etc: '#10b981',
  plant: '#22c55e',
  rov: '#3b82f6',
}

/**
 * Returns hex color assigned to a debris or fauna class.
 */
export function getColor(cls) {
  return CLASS_COLORS[cls] || '#60a5fa'
}

/**
 * Calculates Intersection over Union (IoU) between two bounding boxes.
 * Format: [x1, y1, x2, y2]
 */
export function boxIoU(boxA, boxB) {
  if (!boxA || !boxB) return 0
  const [x1A, y1A, x2A, y2A] = boxA
  const [x1B, y1B, x2B, y2B] = boxB

  const xA = Math.max(x1A, x1B)
  const yA = Math.max(y1A, y1B)
  const xB = Math.min(x2A, x2B)
  const yB = Math.min(y2A, y2B)

  const interW = Math.max(0, xB - xA)
  const interH = Math.max(0, yB - yA)
  const interArea = interW * interH
  if (interArea === 0) return 0

  const areaA = Math.max(0, x2A - x1A) * Math.max(0, y2A - y1A)
  const areaB = Math.max(0, x2B - x1B) * Math.max(0, y2B - y1B)
  const union = areaA + areaB - interArea
  return union > 0 ? interArea / union : 0
}

/**
 * Universal bounding box renderer on HTML5 Canvas.
 * Supports both HTMLVideoElement and HTMLImageElement.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLVideoElement | HTMLImageElement} mediaElement
 * @param {Array<{box: number[], class: string, confidence: number, trackId?: number}>} detections
 */
export function drawBoxes(canvas, mediaElement, detections) {
  if (!canvas || !mediaElement) return

  const rect = mediaElement.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  canvas.style.width = rect.width + 'px'
  canvas.style.height = rect.height + 'px'

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, rect.width, rect.height)

  if (!detections || !detections.length) return

  const mediaW = mediaElement.videoWidth || mediaElement.naturalWidth || mediaElement.width
  const mediaH = mediaElement.videoHeight || mediaElement.naturalHeight || mediaElement.height
  if (!mediaW || !mediaH) return

  // Exact scale factors from natural coordinates to displayed canvas pixels
  const scaleX = rect.width / mediaW
  const scaleY = rect.height / mediaH

  for (const det of detections) {
    if (!det.box || det.box.length < 4) continue
    const [x1, y1, x2, y2] = det.box
    const sx = x1 * scaleX
    const sy = y1 * scaleY
    const sw = (x2 - x1) * scaleX
    const sh = (y2 - y1) * scaleY

    if (sw <= 0 || sh <= 0) continue

    const col = getColor(det.class)
    const trackPrefix = det.trackId ? `#${det.trackId} ` : ''
    const label = `${trackPrefix}${det.class.replace(/^(trash_|animal_)/, '')} ${(det.confidence * 100).toFixed(0)}%`
    const fontSize = Math.max(11, Math.min(14, Math.round(sw / 8)))

    // Box stroke
    ctx.strokeStyle = col
    ctx.lineWidth = 2.5
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
