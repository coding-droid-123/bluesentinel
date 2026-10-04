import React, { useState, useCallback } from 'react'
import logo from '../assets/logo.png'

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
const AREAS = [
  {
    id: 'area-a', name: 'Coral Triangle Zone A', location: 'Lat 2.3N, Lon 108.5E',
    detections: [
      { class: 'trash_net',    count: { min: 3, max: 6 } },
      { class: 'trash_rope',   count: { min: 5, max: 9 } },
      { class: 'trash_bottle', count: { min: 12, max: 20 } },
      { class: 'trash_bag',    count: { min: 8, max: 14 } },
    ],
    travelCost: 350,
  },
  {
    id: 'area-b', name: 'Harbor Shelf Zone B', location: 'Lat 1.1N, Lon 109.2E',
    detections: [
      { class: 'trash_wreckage',  count: { min: 1, max: 2 } },
      { class: 'trash_tarp',      count: { min: 2, max: 4 } },
      { class: 'trash_pipe',      count: { min: 3, max: 5 } },
      { class: 'trash_container', count: { min: 6, max: 10 } },
    ],
    travelCost: 280,
  },
  {
    id: 'area-c', name: 'Seagrass Bed Zone C', location: 'Lat 0.8S, Lon 107.9E',
    detections: [
      { class: 'trash_bag',          count: { min: 20, max: 35 } },
      { class: 'trash_bottle',       count: { min: 30, max: 50 } },
      { class: 'trash_clothing',     count: { min: 5, max: 10 } },
      { class: 'trash_snack_wrapper',count: { min: 15, max: 25 } },
    ],
    travelCost: 220,
  },
]

function computeMetrics(area, assumptions) {
  let minHours = 0, maxHours = 0
  const equipment = new Set()
  let maxCrew = 1
  const itemSummary = []
  for (const det of area.detections) {
    const p = assumptions[det.class] ?? assumptions.default
    minHours += p.minH * det.count.min
    maxHours += p.maxH * det.count.max
    if (p.crew > maxCrew) maxCrew = p.crew
    p.equipment.forEach((e) => equipment.add(e))
    itemSummary.push({ label: p.label, min: det.count.min, max: det.count.max })
  }
  const minCost = Math.round(minHours * maxCrew * COST_PER_CREW_HOUR + area.travelCost)
  const maxCost = Math.round(maxHours * maxCrew * COST_PER_CREW_HOUR + area.travelCost)
  return {
    minHours: minHours.toFixed(1), maxHours: maxHours.toFixed(1),
    minCost, maxCost, maxCrew, equipment: [...equipment], itemSummary,
    totalMin: area.detections.reduce((s, d) => s + d.count.min, 0),
    totalMax: area.detections.reduce((s, d) => s + d.count.max, 0),
  }
}

const SEV_C = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#10b981' }
const SEV_B = { critical: '#fef2f2', high: '#fff7ed', medium: '#fefce8', low: '#f0fdf4' }

export default function CleanupOptimizer({ onNavigate }) {
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS)
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [selected, setSelected] = useState(null)

  const ranked = AREAS.map((a) => {
    const m = computeMetrics(a, assumptions)
    return { ...a, metrics: m, midCost: (m.minCost + m.maxCost) / 2 }
  }).sort((a, b) => b.midCost - a.midCost)

  const updateAssumption = useCallback((cls, field, val) => {
    setAssumptions((prev) => ({ ...prev, [cls]: { ...prev[cls], [field]: parseFloat(val) || 0 } }))
  }, [])

  const top = ranked[0]

  return (
    <div className="home-page">
      <nav className="home-nav">
        <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
          <button className="home-logo" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => onNavigate('home')}>
            <img src={logo} alt="Blue Sentinel" className="home-logo-img" />
            <span className="home-logo-text">Blue Sentinel</span>
          </button>
          <div className="home-nav-links">
            <button className="home-nav-link" onClick={() => onNavigate('home')}>Home</button>
            <button className="home-nav-link" onClick={() => onNavigate('rov')}>ROV Simulator</button>
            <button className="home-nav-link home-nav-link-active">Optimizer</button>
            <button className="home-nav-link" onClick={() => onNavigate('about')}>About</button>
          </div>
        </div>
      </nav>

      <section className="upload-hero" style={{ background: 'linear-gradient(135deg,#0d2a1a 0%,#0d4a2e 45%,#0e4560 100%)' }}>
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            CLEANUP COST &amp; IMPACT OPTIMIZER &nbsp;&middot;&nbsp; DECISION SUPPORT
          </div>
          <h1 className="home-hero-title" style={{ fontSize: 'clamp(26px,4vw,40px)', marginBottom: 8 }}>
            Cleanup Optimizer<br /><em className="home-hero-italic">Area Comparison Tool</em>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, maxWidth: 560 }}>
            Compares surveyed areas and estimates crew hours, equipment, and cost ranges under stated assumptions.
            Uncertainty from survey counts is carried through every calculation.
          </p>
        </div>
      </section>

      {/* Validation banner */}
      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fcd34d', padding: '10px 32px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
        <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
          <strong>Validation Rule:</strong> These estimates require operational data. Do not use as guaranteed cost savings until validated against real figures. This is a comparison under stated assumptions only.
        </p>
      </div>

      <section style={{ background: '#e4eff5', padding: '32px 32px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 className="home-how-title" style={{ margin: 0, fontSize: 22 }}>3 Surveyed Areas &mdash; Budget to Clean 1 This Week</h2>
              <p className="home-card-desc" style={{ marginTop: 4, fontSize: 13 }}>Click any area card to see the full cost breakdown.</p>
            </div>
            <button
              onClick={() => setShowAssumptions(!showAssumptions)}
              style={{ background: showAssumptions ? '#0c2340' : '#fff', border: '1.5px solid #a8cfe0', color: showAssumptions ? '#fff' : '#1a4a6a', fontWeight: 600, fontSize: 13, padding: '9px 18px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.18s' }}
            >
              {showAssumptions ? '✕ Close Assumptions' : '⚙ Edit Assumptions'}
            </button>
          </div>

          {/* Editable assumptions */}
          {showAssumptions && (
            <div className="home-card" style={{ padding: 24, marginBottom: 20 }}>
              <p className="home-card-num" style={{ marginBottom: 12 }}>TIME-PER-ITEM ASSUMPTIONS (hours)</p>
              <p style={{ fontSize: 12, color: '#6a9ab0', marginBottom: 16 }}>
                Documented assumptions &mdash; edit to update all estimates instantly. Crew cost: ${COST_PER_CREW_HOUR}/hr.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
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

          {/* Area cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
            {ranked.map((area, rank) => {
              const m = area.metrics
              const isTop = rank === 0
              return (
                <div key={area.id} className="home-card" onClick={() => setSelected(selected?.id === area.id ? null : area)}
                  style={{ padding: 22, cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
                    border: selected?.id === area.id ? '2px solid #2563eb' : isTop ? '2px solid #fbbf24' : '1px solid #e0eef5' }}>
                  <div style={{ position: 'absolute', top: 14, right: 14 }}>
                    <span style={{ background: isTop ? '#fbbf24' : rank === 1 ? '#94a3b8' : '#cd7c3a', color: '#fff', width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>#{rank + 1}</span>
                  </div>
                  <p className="home-card-num" style={{ marginBottom: 6 }}>
                    {isTop ? '🥇 HIGHEST COST' : rank === 1 ? '🥈 MID RANGE' : '🥉 LOWEST COST'}
                  </p>
                  <h3 className="home-card-title" style={{ fontSize: 16, marginBottom: 4 }}>{area.name}</h3>
                  <p style={{ fontSize: 11, color: '#6a9ab0', fontFamily: 'monospace', marginBottom: 16 }}>{area.location}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px' }}>
                      <p style={{ fontSize: 10, color: '#047857', fontWeight: 700 }}>OBJECTS (survey range)</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: '#0f2030' }}>{m.totalMin}&ndash;{m.totalMax}</p>
                    </div>
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
                      <p style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700 }}>CREW HOURS</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: '#0f2030' }}>{m.minHours}&ndash;{m.maxHours} h</p>
                    </div>
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px' }}>
                      <p style={{ fontSize: 10, color: '#c2410c', fontWeight: 700 }}>COST RANGE (USD)</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: '#0f2030' }}>${m.minCost.toLocaleString()}&ndash;${m.maxCost.toLocaleString()}</p>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {m.equipment.map((eq) => (
                      <span key={eq} style={{ background: '#eef6fb', border: '1px solid #c0dcea', borderRadius: 999, padding: '3px 10px', fontSize: 11, color: '#1a4a6a' }}>{eq}</span>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: '#6a9ab0', marginTop: 10 }}>{m.maxCrew} crew needed &middot; Travel: ${area.travelCost}</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>Click for full breakdown &darr;</p>
                </div>
              )
            })}
          </div>

          {/* Selected breakdown */}
          {selected && (() => {
            const m = computeMetrics(selected, assumptions)
            return (
              <div className="home-card" style={{ padding: 24, marginBottom: 24, border: '2px solid #2563eb' }}>
                <p className="home-card-num" style={{ marginBottom: 16 }}>BREAKDOWN &mdash; {selected.name}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1a4a6a', marginBottom: 10 }}>Debris Inventory (survey range)</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {m.itemSummary.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fbfd', borderRadius: 8, border: '1px solid #e0eef5' }}>
                          <span style={{ fontSize: 12, color: '#0f2030', fontWeight: 600 }}>{item.label}</span>
                          <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>{item.min}&ndash;{item.max} items</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1a4a6a', marginBottom: 10 }}>Cost Breakdown</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: 'Labour (crew hrs x rate)', value: `$${Math.round(parseFloat(m.minHours) * m.maxCrew * COST_PER_CREW_HOUR)}\u2013$${Math.round(parseFloat(m.maxHours) * m.maxCrew * COST_PER_CREW_HOUR)}` },
                        { label: 'Travel & operations', value: `$${selected.travelCost}` },
                        { label: 'Total estimate', value: `$${m.minCost.toLocaleString()}\u2013$${m.maxCost.toLocaleString()}`, highlight: true },
                        { label: 'Crew required', value: `${m.maxCrew} divers` },
                        { label: 'Survey uncertainty', value: `\u00b1${Math.round(((m.maxCost - m.minCost) / m.maxCost) * 100)}%` },
                      ].map((row, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: row.highlight ? '#eff6ff' : '#f8fbfd', border: `1px solid ${row.highlight ? '#bfdbfe' : '#e0eef5'}`, borderRadius: 8 }}>
                          <span style={{ fontSize: 12, color: '#6a9ab0' }}>{row.label}</span>
                          <span style={{ fontSize: 12, color: row.highlight ? '#1d4ed8' : '#0f2030', fontWeight: 700 }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, fontStyle: 'italic' }}>
                      Most sensitive assumption: crew-hours-per-net changes total cost most. Adjust above.
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Recommendation */}
          <div style={{ background: '#0c2340', borderRadius: 16, padding: '24px 28px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 32, flexShrink: 0 }}>🎯</div>
            <div>
              <p style={{ fontSize: 11, color: '#4ade80', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 6 }}>OPTIMIZER RECOMMENDATION</p>
              <p style={{ fontSize: 15, color: '#fff', fontWeight: 700, marginBottom: 8 }}>
                {top.name} has the highest estimated cost and debris load &mdash; clean this area first to maximize impact per dollar.
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                Estimated {top.metrics.minHours}&ndash;{top.metrics.maxHours} crew hours &middot;
                Cost ${top.metrics.minCost.toLocaleString()}&ndash;${top.metrics.maxCost.toLocaleString()} &middot;
                {top.metrics.maxCrew} crew required &middot;
                All figures are ranges under stated assumptions &mdash; validate against operational data before committing resources.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinel &mdash; Cleanup Cost &amp; Impact Optimizer</p>
        <p className="home-footer-sub">Comparison under stated assumptions &middot; Validation required before use &middot; Users: cleanup contractors, environmental programs, port teams</p>
      </footer>
    </div>
  )
}
