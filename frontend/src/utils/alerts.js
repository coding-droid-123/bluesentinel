import {
  ALERT_PILE_THRESHOLD,
  CLASS_WEIGHT,
  GHOST_GEAR,
  ANIMALS,
} from './drawing'

/**
 * Evaluates marine emergency alerts based on multi-frame persistence gating.
 *
 * @param {Array} detections - List of detected objects with class and severity
 * @param {number} frameNum - Sequential frame index
 * @param {React.MutableRefObject<Object>} persistenceRef - Ref maintaining cross-frame persistence map
 * @returns {Array<Object>} List of evaluated alerts
 */
export function evaluateAlerts(detections, frameNum, persistenceRef) {
  const alerts = []
  const classes = detections.map((d) => d.class)
  const hasAnimal = classes.some((c) => ANIMALS.has(c))
  const gearFound = classes.filter((c) => GHOST_GEAR.has(c))

  if (hasAnimal && gearFound.length > 0) {
    const animal = classes.find((c) => ANIMALS.has(c))
    const gear = gearFound[0]
    const key = `${animal}+${gear}`

    // Persistence gate: require 3 consecutive frames before firing ENTANGLEMENT
    const prev = persistenceRef.current[key] || { count: 0, lastFrame: -99 }
    if (frameNum - prev.lastFrame <= 2) {
      persistenceRef.current[key] = { count: prev.count + 1, lastFrame: frameNum }
    } else {
      persistenceRef.current[key] = { count: 1, lastFrame: frameNum }
    }

    if (persistenceRef.current[key].count >= 3) {
      alerts.push({
        id: `entangle-${frameNum}-${Date.now()}`,
        type: 'ENTANGLEMENT',
        message: `${animal.replace('animal_', '')} detected near ${gear.replace('trash_', '')} — confirmed entanglement (${persistenceRef.current[key].count} frames)`,
        severity: 'critical',
        frame: frameNum,
        ts: new Date().toLocaleTimeString(),
        animal,
        gear,
      })
    }
  } else if (gearFound.length > 0) {
    gearFound.forEach((g) => {
      alerts.push({
        id: `gear-${frameNum}-${g}-${Date.now()}`,
        type: 'GHOST GEAR',
        message: `${g.replace('trash_', '').toUpperCase()} detected — possible ghost gear`,
        severity: 'critical',
        frame: frameNum,
        ts: new Date().toLocaleTimeString(),
      })
    })
  }

  const hazardousDebris = detections.filter((d) => d.severity && d.severity !== 'low')
  if (hazardousDebris.length >= ALERT_PILE_THRESHOLD) {
    alerts.push({
      id: `pile-${frameNum}-${Date.now()}`,
      type: 'LARGE PILE',
      message: `High debris density: ${hazardousDebris.length} hazardous objects in frame ${frameNum}`,
      severity: 'high',
      frame: frameNum,
      ts: new Date().toLocaleTimeString(),
    })
  }

  return alerts
}

/**
 * Calculates weighted hazard score for a list of detections.
 */
export function weightedScore(detections) {
  if (!detections || !detections.length) return 0
  return detections.reduce(
    (sum, d) => sum + (CLASS_WEIGHT[d.class] ?? 1) * (d.confidence ?? 0.8),
    0
  )
}
