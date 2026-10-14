import React, { useState, useEffect, useCallback } from 'react'
import NavBar from './NavBar'
import { API_BASE_URL } from '../config'

// ── Time-per-item assumptions ──────────────────────────────────────────────
const DEFAULT_ASSUMPTIONS = {
  trash_net:      { label: 'Fishing Net',    minH: 0.8, maxH: 1.5, crew: 2, equipment: ['cutters', 'lift bags'] },
  trash_rope:     { label: 'Rope',           minH: 0.3, maxH: 0.6, crew: 1, equipment: ['cutters'] },
  trash_tarp:     { label: 'Tarp',           minH: 0.4, maxH: 0.8, crew: 2, equipment: ['lift bags'] },
  trash_pipe:     { label: 'Pipe',           minH: 0.5, maxH: 1.0, crew: 2, equipment: ['lift bags'] },
  trash_wreckage: { label: 'Wreckage',       minH: 1.5, maxH: 3.0, crew: 3, equipment: ['lift bags', 'cutting tools'] },
  trash_bag:      { label: 'Plastic Bag',    minH: 0.1, maxH: 0.2, crew: 1, equipment: ['collection sacks'] },
  trash_bottle:   { label: 'Bottle',         minH: 0.05,maxH: 0.1, crew: 1, equipment: ['collection sacks'] },
  trash_cup:      { label: 'Cup',            minH: 0.05,maxH: 0.1, crew: 1, equipment: ['collection sacks'] },
  trash_can:      { label: 'Metal Can',      minH: 0.1, maxH: 0.2, crew: 1, equipment: ['collection sacks'] },
  trash_container:{ label: 'Container',      minH: 0.3, maxH: 0.6, crew: 1, equipment: ['collection sacks'] },
  trash_clothing: { label: 'Clothing',       minH: 0.1, maxH: 0.2, crew: 1, equipment: ['collection sacks'] },
  trash_snack_wrapper:{ label: 'Wrapper',    minH: 0.05,maxH: 0.1, crew: 1, equipment: ['collection sacks'] },
  default:        { label: 'Other debris',   minH: 0.2, maxH: 0.4, crew: 1, equipment: ['collection sacks'] },
}

const COST_PER_CREW_HOUR = 45 // USD assumption
const DEFAULT_AREAS = []

const isSeedName = (name) => {
  const n = (name || '').toLowerCase()
  return n.includes('harbor shelf') || n.includes('coral triangle') || n.includes('seagrass bed')
}

function computeMetrics(area, assumptions) {
  let minHours = 0, maxHours = 0
  const equipment = new Set()
  let maxCrew = 1
  const itemSummary = []

  for (const det of (area.detections || [])) {
    // Strictly skip ROV vehicle or biota
    if (det.class === 'rov' || det.class === 'plant' || (det.class || '').startsWith('animal_')) continue
    const p = assumptions[det.class] ?? assumptions.default
    const cMin = det.count?.min ?? 1
    const cMax = det.count?.max ?? 1
    const subMinH = p.minH * cMin
    const subMaxH = p.maxH * cMax
    minHours += subMinH
    maxHours += subMaxH
    if (p.crew > maxCrew) maxCrew = p.crew
    p.equipment.forEach((e) => equipment.add(e))
    itemSummary.push({
      class: det.class,
      label: p.label,
      min: cMin,
      max: cMax,
      minH: p.minH,
      maxH: p.maxH,
      crew: p.crew,
      subtotalHours: `${subMinH.toFixed(1)}–${subMaxH.toFixed(1)} h`,
      equipment: p.equipment,
    })
  }

  const travelCost = area.travelCost || 180
  const laborMin = Math.round(minHours * maxCrew * COST_PER_CREW_HOUR)
  const laborMax = Math.round(maxHours * maxCrew * COST_PER_CREW_HOUR)
  const minCost = laborMin + travelCost
  const maxCost = laborMax + travelCost

  // Rotations calculation: standard working bottom time = 45 mins (0.75h) per dive
  const estimatedDivesMin = Math.max(1, Math.ceil(minHours / 0.75))
  const estimatedDivesMax = Math.max(1, Math.ceil(maxHours / 0.75))

  return {
    minHours: minHours.toFixed(1),
    maxHours: maxHours.toFixed(1),
    minCost,
    maxCost,
    laborMin,
    laborMax,
    travelCost,
    maxCrew,
    estimatedDivesMin,
    estimatedDivesMax,
    equipment: [...equipment],
    itemSummary,
    totalMin: (area.detections || []).filter((d) => d.class !== 'rov').reduce((s, d) => s + (d.count?.min ?? 1), 0),
    totalMax: (area.detections || []).filter((d) => d.class !== 'rov').reduce((s, d) => s + (d.count?.max ?? 1), 0),
  }
}

export default function CleanupOptimizer({ onNavigate, target, onClearTarget }) {
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS)
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [areas, setAreas] = useState(() => {
    try {
      const saved = sessionStorage.getItem('bluesentinel_cleanup_areas')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          return parsed.filter((a) => !isSeedName(a.name))
        }
      }
    } catch {}
    return DEFAULT_AREAS
  })

  const [selectedId, setSelectedId] = useState(null)
  const [isSavingPlan, setIsSavingPlan] = useState(false)
  const [planSaveStatus, setPlanSaveStatus] = useState(null)
  const [isDbConnected, setIsDbConnected] = useState(false)
  const [copiedManifest, setCopiedManifest] = useState(false)

  // Persist areas to sessionStorage for session lifetime
  useEffect(() => {
    try {
      sessionStorage.setItem('bluesentinel_cleanup_areas', JSON.stringify(areas.filter((a) => !isSeedName(a.name))))
    } catch {}
  }, [areas])

  // Inject redirected detection or pile as a new cleanup target
  useEffect(() => {
    if (!target) return
    let detectionList = []

    if (target.inventory && target.inventory.length > 0) {
      detectionList = target.inventory
        .filter((item) => item.class !== 'rov' && !item.class.startsWith('animal_') && item.class !== 'plant')
        .map((item) => {
          const c = item.count
          const cMin = typeof c === 'object' ? (c.min ?? 1) : Number(c) || 1
          const cMax = typeof c === 'object' ? (c.max ?? Math.ceil(cMin * 1.5)) : Math.ceil(cMin * 1.5)
          return {
            class: item.class,
            count: { min: Math.max(1, cMin), max: Math.max(1, cMax) },
          }
        })
    } else if (target.detections && target.detections.length > 0) {
      const classMap = {}
      target.detections.forEach((d) => {
        const cls = d.class
        if (!cls || cls.startsWith('animal_') || cls === 'rov' || cls === 'plant') return
        classMap[cls] = (classMap[cls] || 0) + 1
      })
      detectionList = Object.entries(classMap).map(([cls, cnt]) => ({
        class: cls,
        count: { min: Math.max(1, cnt), max: Math.max(1, Math.ceil(cnt * 1.5)) },
      }))
    }

    if (detectionList.length === 0) {
      detectionList.push({ class: 'trash_bottle', count: { min: 2, max: 5 } })
    }

    const newAreaId = 'target-' + Date.now()
    const newArea = {
      id: newAreaId,
      name: target.name || (target.pileId ? `📍 Debris ${target.pileId}` : `📍 ${target.alertType || 'Debris Target'} — ${target.frameId || 'Live Frame'}`),
      location: target.location || 'Surveyed Marine Coordinates',
      detections: detectionList,
      travelCost: 150,
      isTarget: true,
      targetMeta: target,
    }

    setAreas((prev) => [newArea, ...prev.filter((a) => !a.isTarget && !isSeedName(a.name))])
    setSelectedId(newAreaId)

    // Smooth auto-scroll down to the comprehensive breakdown
    setTimeout(() => {
      document.getElementById('cleanup-detailed-breakdown')?.scrollIntoView({ behavior: 'smooth' })
    }, 120)
  }, [target])

  // Fetch surveyed cleanup zones from live database (strictly ignoring seeded mock zones)
  useEffect(() => {
    fetch(`${API_BASE_URL}/cleanup/zones`)
      .then((res) => {
        if (!res.ok) throw new Error('API error')
        return res.json()
      })
      .then((data) => {
        if (data.zones && data.zones.length > 0) {
          const liveZones = data.zones
            .filter((z) => !isSeedName(z.name))
            .map((z) => ({
              id: z.id,
              name: z.name,
              location: z.location || 'Surveyed coordinates',
              detections: (z.debris_inventory && z.debris_inventory.length > 0)
                ? z.debris_inventory.filter((d) => d.class !== 'rov')
                : [
                    { class: 'trash_bottle', count: { min: 4, max: 8 } },
                    { class: 'trash_bag', count: { min: 3, max: 6 } },
                  ],
              travelCost: z.travel_cost || 180,
            }))

          setAreas((prev) => {
            const userAreas = prev.filter((a) => !isSeedName(a.name))
            const liveMap = new Map(liveZones.map((z) => [z.id, z]))
            userAreas.forEach((a) => liveMap.set(a.id, a))
            return Array.from(liveMap.values())
          })
          setIsDbConnected(true)
        }
      })
      .catch(() => {
        setIsDbConnected(false)
      })
  }, [])

  const ranked = areas
    .filter((a) => !isSeedName(a.name))
    .map((a) => {
      const m = computeMetrics(a, assumptions)
      return { ...a, metrics: m, midCost: (m.minCost + m.maxCost) / 2 }
    })
    .sort((a, b) => {
      if (a.isTarget) return -1
      if (b.isTarget) return 1
      return b.midCost - a.midCost
    })

  const top = ranked[0]
  // Default to the first area if none selected, so breakdown is ALWAYS visible
  const selectedArea = ranked.find((a) => a.id === selectedId) || top || null

  const updateAssumption = useCallback((cls, field, val) => {
    setAssumptions((prev) => ({ ...prev, [cls]: { ...prev[cls], [field]: parseFloat(val) || 0 } }))
  }, [])

  const handleSelectCard = (area) => {
    setSelectedId(area.id)
    setTimeout(() => {
      document.getElementById('cleanup-detailed-breakdown')?.scrollIntoView({ behavior: 'smooth' })
    }, 60)
  }

  const handleClearAllAreas = () => {
    setAreas([])
    setSelectedId(null)
    try { sessionStorage.removeItem('bluesentinel_cleanup_areas') } catch {}
    if (onClearTarget) onClearTarget()
  }

  const handleRemoveArea = (idToRemove) => {
    setAreas((prev) => prev.filter((a) => a.id !== idToRemove))
    if (selectedId === idToRemove) setSelectedId(null)
  }

  const handleSavePlan = async (zoneId) => {
    setIsSavingPlan(true)
    setPlanSaveStatus(null)
    try {
      const res = await fetch(`${API_BASE_URL}/cleanup/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: zoneId,
          assumptions: assumptions,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPlanSaveStatus({
        success: true,
        planId: data.plan_id,
        plan: data.plan,
      })
    } catch (e) {
      setPlanSaveStatus({ success: false, error: e.message })
    } finally {
      setIsSavingPlan(false)
    }
  }

  const handleExportManifest = (area) => {
    if (!area) return
    const m = area.metrics
    const text = [
      `======================================================`,
      `BLUE SENTINEL DIVER CLEANUP & LOGISTICS MANIFEST`,
      `Target Area: ${area.name}`,
      `Survey Location: ${area.location}`,
      `Date/Time: ${new Date().toLocaleString()}`,
      `======================================================`,
      `1. DEBRIS INVENTORY:`,
      ...m.itemSummary.map((i) => ` - ${i.label}: ${i.min}–${i.max} items (Est. labor: ${i.subtotalHours}, Crew: ${i.crew} divers, Equipment: ${i.equipment.join(', ')})`),
      `------------------------------------------------------`,
      `2. CREW & ROTATION LOGISTICS:`,
      ` - Diver Crew Size: ${m.maxCrew} Certified Commercial/Scientific Divers`,
      ` - Estimated Bottom Time: ${m.minHours}–${m.maxHours} diver-hours`,
      ` - Dive Rotations Required: ${m.estimatedDivesMin}–${m.estimatedDivesMax} rotations (45-min working window)`,
      ` - Required Equipment: ${m.equipment.join(', ') || 'Standard retrieval kit'}`,
      `------------------------------------------------------`,
      `3. COST BREAKDOWN (Parametric Estimate):`,
      ` - Labor Cost (${m.maxCrew} divers @ $${COST_PER_CREW_HOUR}/hr): $${m.laborMin.toLocaleString()} – $${m.laborMax.toLocaleString()}`,
      ` - Vessel Mobilization & Transit: $${m.travelCost}`,
      ` - TOTAL PROJECTED BUDGET: $${m.minCost.toLocaleString()} – $${m.maxCost.toLocaleString()} USD`,
      `======================================================`,
    ].join('\n')

    navigator.clipboard.writeText(text).then(() => {
      setCopiedManifest(true)
      setTimeout(() => setCopiedManifest(false), 2500)
    })
  }

  return (
    <div className="home-page">
      <NavBar page="optimizer" onNavigate={onNavigate} />

      <section className="upload-hero" style={{ background: 'linear-gradient(135deg,#0d2a1a 0%,#0d4a2e 45%,#0e4560 100%)' }}>
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            CLEANUP COST &amp; IMPACT OPTIMIZER &nbsp;&middot;&nbsp; DECISION SUPPORT
          </div>
          <h1 className="home-hero-title" style={{ fontSize: 'clamp(26px,4vw,40px)', marginBottom: 8 }}>
            Cleanup Optimizer<br /><em className="home-hero-italic">Diver Crew &amp; Cost Allocation</em>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, maxWidth: 580 }}>
            Translates ROV underwater debris piles into parametric diver hours, equipment mobilization, and operational cost breakdowns.
          </p>
        </div>
      </section>

      {/* Target redirect banner */}
      {target && (
        <div style={{
          background: 'linear-gradient(135deg,#0f2030,#0d3260)',
          borderBottom: '3px solid #f59e0b',
          padding: '14px 32px',
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {target.frameDataUrl && (
              <div style={{ flexShrink: 0, width: 120, height: 72, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(245,158,11,0.6)' }}>
                <img src={target.frameDataUrl} alt="Detection frame" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ background: '#f59e0b', color: '#1a0000', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em' }}>
                  ⚡ IMPORTED FROM {target.source === 'pile' ? 'SCHEMATIC HOTSPOT MAP' : 'SURVEY LOG'}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                  {target.pileId || target.frameId}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#fff', fontWeight: 600, margin: '0 0 4px' }}>
                {target.name || 'Underwater Debris Target Loaded into Cleanup Plan'}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
                {target.location || 'Surveyed marine sector'} &bull; Full cost &amp; diver breakdown calculated below.
              </p>
            </div>
            <button
              onClick={() => {
                setAreas((prev) => prev.filter((a) => !a.isTarget))
                if (onClearTarget) onClearTarget()
              }}
              style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12,
              }}
              title="Dismiss redirect"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Validation banner */}
      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fcd34d', padding: '10px 32px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
        <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5, margin: 0 }}>
          <strong>Operational Decision Support:</strong> Estimates account for working dive limits, buoyancy gear, and underwater retrieval uncertainty. Validate with local dive master before sea deployment.
        </p>
      </div>

      <section style={{ background: '#e4eff5', padding: '32px 32px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Header Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="home-how-title" style={{ margin: 0, fontSize: 22 }}>
                {ranked.length > 0
                  ? `${ranked.length} Surveyed ${ranked.length === 1 ? 'Area' : 'Areas'} \u2014 Diver Crew & Cost Allocation`
                  : 'Diver Crew & Cleanup Cost Optimizer'}
              </h2>
              <p className="home-card-desc" style={{ marginTop: 4, fontSize: 13 }}>
                {ranked.length > 0
                  ? 'Click any card to inspect the full operational breakdown, diver rotations, and cost equation.'
                  : 'Dispatch debris piles from the ROV Simulator to plan removal logistics.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {ranked.length > 0 && (
                <button
                  onClick={handleClearAllAreas}
                  style={{
                    background: '#fff', border: '1.5px solid #fca5a5', color: '#b91c1c',
                    fontWeight: 600, fontSize: 13, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                  }}
                  title="Remove all surveyed zones from active plan"
                >
                  🗑 Clear Queue
                </button>
              )}
              <button
                onClick={() => setShowAssumptions(!showAssumptions)}
                style={{
                  background: showAssumptions ? '#0c2340' : '#fff', border: '1.5px solid #a8cfe0',
                  color: showAssumptions ? '#fff' : '#1a4a6a', fontWeight: 600, fontSize: 13,
                  padding: '8px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.18s',
                }}
              >
                {showAssumptions ? '✕ Close Assumptions' : '⚙ Edit Assumptions'}
              </button>
            </div>
          </div>

          {/* Editable assumptions */}
          {showAssumptions && (
            <div className="home-card" style={{ padding: 24, marginBottom: 20 }}>
              <p className="home-card-num" style={{ marginBottom: 12 }}>TIME-PER-ITEM ASSUMPTIONS (hours)</p>
              <p style={{ fontSize: 12, color: '#6a9ab0', marginBottom: 16 }}>
                Adjust recovery hours per debris class. Standard diver rate: ${COST_PER_CREW_HOUR}/diver-hour.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {Object.entries(assumptions).filter(([k]) => k !== 'default').map(([cls, p]) => (
                  <div key={cls} style={{ background: '#f8fbfd', border: '1px solid #e0eef5', borderRadius: 10, padding: '12px 14px' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#1a4a6a', marginBottom: 8 }}>{p.label}</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: '#6a9ab0', display: 'block', marginBottom: 3 }}>Min hrs</label>
                        <input type="number" min="0.01" max="10" step="0.05" value={p.minH} onChange={(e) => updateAssumption(cls, 'minH', e.target.value)}
                          style={{ width: '100%', border: '1px solid #c0dcea', borderRadius: 6, padding: '5px 8px', fontSize: 12, outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: '#6a9ab0', display: 'block', marginBottom: 3 }}>Max hrs</label>
                        <input type="number" min="0.01" max="10" step="0.05" value={p.maxH} onChange={(e) => updateAssumption(cls, 'maxH', e.target.value)}
                          style={{ width: '100%', border: '1px solid #c0dcea', borderRadius: 6, padding: '5px 8px', fontSize: 12, outline: 'none' }} />
                      </div>
                    </div>
                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>Equipment: {p.equipment.join(', ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Area cards or Empty state */}
          {ranked.length === 0 ? (
            <div className="home-card" style={{ padding: '48px 24px', textAlign: 'center', background: '#fff', borderRadius: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🌊</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f2030', marginBottom: 8 }}>
                No Cleanup Areas Queued
              </h3>
              <p style={{ fontSize: 14, color: '#6a9ab0', maxWidth: 540, margin: '0 auto 20px', lineHeight: 1.6 }}>
                All mock data has been cleared. To add a live area, run a survey in the <strong>ROV Simulator</strong> and click <strong>🚀 Send to Cleanup Optimizer</strong> on any detected pile, or select a past survey from <strong>History</strong>.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={() => onNavigate && onNavigate('rov')}
                  style={{
                    background: '#0284c7', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Open ROV Simulator
                </button>
                <button
                  onClick={() => onNavigate && onNavigate('history')}
                  style={{
                    background: 'rgba(2,132,199,0.08)', color: '#0284c7', border: '1px solid #0284c7', borderRadius: 8,
                    padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  View Survey History
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
              {ranked.map((area, rank) => {
                const m = area.metrics
                const isTop = rank === 0
                const isSelected = selectedArea?.id === area.id
                return (
                  <div
                    key={area.id}
                    className="home-card"
                    onClick={() => handleSelectCard(area)}
                    style={{
                      padding: 22,
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.2s',
                      border: isSelected
                        ? '2.5px solid #0284c7'
                        : area.isTarget
                        ? '2px solid #f59e0b'
                        : isTop
                        ? '2px solid #fbbf24'
                        : '1px solid #e0eef5',
                      boxShadow: isSelected ? '0 8px 24px rgba(2,132,199,0.2)' : undefined,
                      background: isSelected ? '#f0f9ff' : area.isTarget ? '#fffbeb' : undefined,
                    }}
                  >
                    <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {area.isTarget ? (
                        <span style={{ background: '#f59e0b', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.05em' }}>⚡ LIVE</span>
                      ) : (
                        <span style={{ background: isTop ? '#fbbf24' : rank === 1 ? '#94a3b8' : '#cd7c3a', color: '#fff', width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>#{rank + 1}</span>
                      )}
                    </div>

                    <p className="home-card-num" style={{ marginBottom: 6 }}>
                      {isTop ? '🥇 HIGHEST COST' : rank === 1 ? '🥈 MID RANGE' : '🥉 PRIORITY TARGET'}
                    </p>
                    <h3 className="home-card-title" style={{ fontSize: 16, marginBottom: 4 }}>{area.name}</h3>
                    <p style={{ fontSize: 11, color: '#6a9ab0', fontFamily: 'monospace', marginBottom: 14, wordBreak: 'break-word' }}>
                      {area.location}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px' }}>
                        <p style={{ fontSize: 10, color: '#047857', fontWeight: 700 }}>DEBRIS OBJECTS (RANGE)</p>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#0f2030' }}>{m.totalMin}&ndash;{m.totalMax} items</p>
                      </div>
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
                        <p style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700 }}>CREW LABOR HOURS</p>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#0f2030' }}>{m.minHours}&ndash;{m.maxHours} h</p>
                      </div>
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px' }}>
                        <p style={{ fontSize: 10, color: '#c2410c', fontWeight: 700 }}>ESTIMATED COST (USD)</p>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#0f2030' }}>${m.minCost.toLocaleString()}&ndash;${m.maxCost.toLocaleString()}</p>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {m.equipment.map((eq) => (
                        <span key={eq} style={{ background: '#eef6fb', border: '1px solid #c0dcea', borderRadius: 999, padding: '2px 8px', fontSize: 10, color: '#1a4a6a' }}>{eq}</span>
                      ))}
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#0284c7', fontWeight: 700 }}>
                        {isSelected ? 'Viewing Full Breakdown ↓' : 'Click for full breakdown ↓'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveArea(area.id)
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                        title="Remove area from optimizer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── FULL DETAILED BREAKDOWN SECTION ───────────────────────────── */}
          {selectedArea && (() => {
            const m = computeMetrics(selectedArea, assumptions)
            return (
              <div id="cleanup-detailed-breakdown" className="home-card" style={{ padding: 28, marginBottom: 24, border: '2px solid #0284c7', background: '#fff', borderRadius: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <span style={{ background: 'rgba(2,132,199,0.12)', color: '#0284c7', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 6, letterSpacing: '0.05em' }}>
                      DETAILED OPERATIONAL BREAKDOWN
                    </span>
                    <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f2030', margin: '6px 0 2px' }}>
                      {selectedArea.name}
                    </h3>
                    <p style={{ fontSize: 12, color: '#6a9ab0', fontFamily: 'monospace', margin: 0 }}>
                      {selectedArea.location}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleExportManifest(selectedArea)}
                      style={{
                        background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155',
                        fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      }}
                    >
                      {copiedManifest ? '✅ Manifest Copied!' : '📋 Copy Mission Manifest'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                  {/* Left Column: Itemized Debris Inventory Table */}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: '#1a4a6a', marginBottom: 12 }}>
                      1. Debris Inventory &amp; Itemized Labor
                    </h4>
                    <div style={{ overflowX: 'auto', border: '1px solid #e0eef5', borderRadius: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fbfd', borderBottom: '1px solid #e0eef5', textAlign: 'left', color: '#6a9ab0' }}>
                            <th style={{ padding: '8px 12px' }}>Debris Type</th>
                            <th style={{ padding: '8px 12px' }}>Est. Count</th>
                            <th style={{ padding: '8px 12px' }}>Labor Subtotal</th>
                            <th style={{ padding: '8px 12px' }}>Equipment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.itemSummary.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: idx < m.itemSummary.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f2030' }}>
                                {item.label}
                              </td>
                              <td style={{ padding: '10px 12px', color: '#0284c7', fontWeight: 700 }}>
                                {item.min}&ndash;{item.max}
                              </td>
                              <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: 600 }}>
                                {item.subtotalHours}
                              </td>
                              <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 11 }}>
                                {item.equipment.join(', ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: 16, background: '#f8fbfd', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                      <h5 style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>
                        Required Equipment Manifest:
                      </h5>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {m.equipment.map((eq) => (
                          <span key={eq} style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                            ⚙️ {eq}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Diver Crew Logistics & Cost Equation */}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: '#1a4a6a', marginBottom: 12 }}>
                      2. Diver Crew Logistics &amp; Cost Equation
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fbfd', border: '1px solid #e0eef5', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#6a9ab0' }}>Commercial Diver Crew:</span>
                        <span style={{ fontSize: 13, color: '#0f2030', fontWeight: 700 }}>
                          {m.maxCrew} Divers ({m.maxCrew >= 2 ? 'Buddy Pair + Surface Tender' : 'Solo Scientific Diver'})
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fbfd', border: '1px solid #e0eef5', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#6a9ab0' }}>Estimated Dive Rotations:</span>
                        <span style={{ fontSize: 13, color: '#0f2030', fontWeight: 700 }}>
                          {m.estimatedDivesMin}&ndash;{m.estimatedDivesMax} Dives (45 min working bottom time)
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fbfd', border: '1px solid #e0eef5', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#6a9ab0' }}>Labor Formula:</span>
                        <span style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>
                          {m.minHours}–{m.maxHours}h &times; {m.maxCrew} crew &times; ${COST_PER_CREW_HOUR}/hr
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fbfd', border: '1px solid #e0eef5', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#6a9ab0' }}>Labor Cost Subtotal:</span>
                        <span style={{ fontSize: 13, color: '#0f2030', fontWeight: 700 }}>
                          ${m.laborMin.toLocaleString()} &ndash; ${m.laborMax.toLocaleString()}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fbfd', border: '1px solid #e0eef5', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#6a9ab0' }}>Vessel &amp; Travel Mobilization:</span>
                        <span style={{ fontSize: 13, color: '#0f2030', fontWeight: 700 }}>
                          ${m.travelCost}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8 }}>
                        <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 800 }}>TOTAL PROJECTED COST:</span>
                        <span style={{ fontSize: 16, color: '#1d4ed8', fontWeight: 900 }}>
                          ${m.minCost.toLocaleString()} &ndash; ${m.maxCost.toLocaleString()} USD
                        </span>
                      </div>
                    </div>

                    {/* Dispatch Plan Button */}
                    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <button
                        onClick={() => handleSavePlan(selectedArea.id)}
                        disabled={isSavingPlan}
                        style={{
                          background: isSavingPlan ? '#64748b' : 'linear-gradient(135deg, #10b981, #059669)',
                          border: 'none', color: '#fff', fontWeight: 800, fontSize: 13,
                          padding: '11px 22px', borderRadius: 8, cursor: isSavingPlan ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                        }}
                      >
                        {isSavingPlan ? 'Saving to Database…' : '💾 Dispatch & Save Plan to Database'}
                      </button>

                      {planSaveStatus && (
                        <div style={{
                          fontSize: 12, fontWeight: 600,
                          color: planSaveStatus.success ? '#047857' : '#b91c1c',
                          background: planSaveStatus.success ? '#ecfdf5' : '#fef2f2',
                          border: `1px solid ${planSaveStatus.success ? '#a7f3d0' : '#fecaca'}`,
                          borderRadius: 6, padding: '8px 14px',
                        }}>
                          {planSaveStatus.success
                            ? `✅ Plan Logged to Database! (ID: ${planSaveStatus.planId ? planSaveStatus.planId.slice(0, 8) : ''}… | Est: $${planSaveStatus.plan?.estimated_min_cost?.toLocaleString() ?? '—'}–$${planSaveStatus.plan?.estimated_max_cost?.toLocaleString() ?? '—'})`
                            : `⚠️ Error saving plan: ${planSaveStatus.error}`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Recommendation */}
          {top && (
            <div style={{ background: '#0c2340', borderRadius: 16, padding: '24px 28px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>🎯</div>
              <div>
                <p style={{ fontSize: 11, color: '#4ade80', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 6 }}>OPTIMIZER RECOMMENDATION</p>
                <p style={{ fontSize: 15, color: '#fff', fontWeight: 700, marginBottom: 8 }}>
                  {top.name} represents the primary cleanup priority &mdash; clean this area first to maximize ecological impact per dollar.
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0 }}>
                  Estimated {top.metrics.minHours}&ndash;{top.metrics.maxHours} crew hours &middot;
                  Budget ${top.metrics.minCost.toLocaleString()}&ndash;${top.metrics.maxCost.toLocaleString()} &middot;
                  {top.metrics.maxCrew} divers required.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinel &mdash; Cleanup Cost &amp; Impact Optimizer</p>
        <p className="home-footer-sub">Comparison under stated assumptions &middot; Validation required before use &middot; Users: cleanup contractors, environmental programs, port teams</p>
      </footer>
    </div>
  )
}
