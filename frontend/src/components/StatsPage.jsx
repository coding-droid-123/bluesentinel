import React, { useState, useEffect, useCallback, useRef } from 'react'
import NavBar from './NavBar'
import { API_BASE_URL } from '../config'

// ── Class taxonomy ──────────────────────────────────────────────────────────
const CLASS_COLORS = {
  trash_net:             '#dc2626',
  trash_rope:            '#ef4444',
  trash_tarp:            '#f87171',
  trash_bottle:          '#f97316',
  trash_bag:             '#fb923c',
  trash_container:       '#fbbf24',
  trash_pipe:            '#f59e0b',
  trash_wreckage:        '#d97706',
  trash_can:             '#ca8a04',
  trash_cup:             '#a16207',
  trash_clothing:        '#7c3aed',
  trash_snack_wrapper:   '#8b5cf6',
  trash_unknown_instance:'#64748b',
  trash_branch:          '#6b7280',
  animal_fish:           '#0ea5e9',
  animal_starfish:       '#38bdf8',
  animal_crab:           '#0284c7',
  animal_shells:         '#0369a1',
  animal_eel:            '#075985',
  animal_etc:            '#0c4a6e',
  plant:                 '#10b981',
  rov:                   '#94a3b8',
}

const SEV_COLOR = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#059669' }
const SEV_BG    = { critical: '#fef2f2', high: '#fff7ed', medium: '#fffbeb', low: '#ecfdf5' }

function fmt(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

// ── Mini Horizontal Bar Chart ────────────────────────────────────────────────
function BarChart({ data, maxVal }) {
  if (!data || data.length === 0) return (
    <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>No data yet</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {data.map(({ label, value, color }) => {
        const pct = maxVal > 0 ? (value / maxVal) * 100 : 0
        const barColor = color || '#0284c7'
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#475569', minWidth: 130, textAlign: 'right', flexShrink: 0 }}>
              {label.replace(/^(trash_|animal_)/, '').replace(/_/g, ' ')}
            </span>
            <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 7, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: barColor,
                  borderRadius: 7,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', minWidth: 28, textAlign: 'right' }}>{value}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Tiny Sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data, color = '#0284c7', height = 44 }) {
  if (!data || data.length < 2) return null
  const w = 200
  const h = height
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')
  const safeColor = color.replace('#', '')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`sg${safeColor}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#sg${safeColor})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Animated counter ─────────────────────────────────────────────────────────
function Counter({ value, color }) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)
  useEffect(() => {
    const from = prevRef.current
    const to = value
    prevRef.current = to
    let start = null
    const duration = 600
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setDisplay(Math.round(from + (to - from) * p))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])
  return <span style={color ? { color } : {}}>{fmt(display)}</span>
}

// ── Main StatsPage ────────────────────────────────────────────────────────────
export default function StatsPage({ onNavigate }) {
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [missions, setMissions]       = useState([])
  const [stats, setStats]             = useState(null)
  const [incidents, setIncidents]     = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const refreshSec                    = 30
  const [countdown, setCountdown]     = useState(refreshSec)
  const timerRef                      = useRef(null)
  const countdownRef                  = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const [missionsRes, statsRes, incidentsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/history?limit=50`),
        fetch(`${API_BASE_URL}/stats`),
        fetch(`${API_BASE_URL}/incidents?limit=50`),
      ])
      const [missionsData, statsData, incData] = await Promise.all([
        missionsRes.ok  ? missionsRes.json()   : { scans: [] },
        statsRes.ok     ? statsRes.json()      : {},
        incidentsRes.ok ? incidentsRes.json()  : { incidents: [] },
      ])
      setMissions(missionsData.scans || [])
      setStats(statsData)
      setIncidents(incData.incidents || [])
      setLastUpdated(new Date())
      setError(null)
    } catch {
      setError('Backend unreachable — make sure FastAPI is running on port 8000.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!autoRefresh) {
      clearInterval(timerRef.current)
      clearInterval(countdownRef.current)
      return
    }
    setCountdown(refreshSec)
    timerRef.current = setInterval(() => { fetchAll(); setCountdown(refreshSec) }, refreshSec * 1000)
    countdownRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => { clearInterval(timerRef.current); clearInterval(countdownRef.current) }
  }, [autoRefresh, fetchAll])

  // ── Derived metrics ──────────────────────────────────────────────────────
  const totalObjects    = missions.reduce((s, m) => s + (m.total_unique_objects || 0), 0)
  const totalIncidents  = incidents.length
  const criticalCount   = incidents.filter(i => i.severity === 'critical').length
  const avgLatency      = missions.length
    ? (missions.reduce((s, m) => s + (m.avg_latency_ms || 0), 0) / missions.length).toFixed(0)
    : 0

  // Class distribution
  const classTally = {}
  missions.forEach(m => {
    const sbc = m.summary_by_class || {}
    Object.entries(sbc).forEach(([cls, cnt]) => {
      if (cls !== 'rov') classTally[cls] = (classTally[cls] || 0) + cnt
    })
  })
  const classData = Object.entries(classTally)
    .map(([label, value]) => ({ label, value, color: CLASS_COLORS[label] || '#64748b' }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 14)
  const maxClassVal = classData[0]?.value || 1

  // Incident type distribution
  const incTypeTally = {}
  incidents.forEach(i => { incTypeTally[i.incident_type] = (incTypeTally[i.incident_type] || 0) + 1 })
  const incTypeData = Object.entries(incTypeTally)
    .map(([label, value]) => ({ label, value, color: label === 'GHOST_GEAR' ? '#dc2626' : label === 'ENTANGLEMENT' ? '#ea580c' : '#d97706' }))
    .sort((a, b) => b.value - a.value)
  const maxIncVal = incTypeData[0]?.value || 1

  // Sparkline for missions timeline
  const objectCounts = [...missions].reverse().slice(-16).map(m => m.total_unique_objects || 0)

  // Severity breakdown
  const sevBreakdown = { critical: 0, high: 0, medium: 0, low: 0 }
  incidents.forEach(i => { if (sevBreakdown[i.severity] !== undefined) sevBreakdown[i.severity]++ })

  // Missions per day (last 7 days)
  const dayMap = {}
  const today = new Date()
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(today)
    dt.setDate(today.getDate() - d)
    const key = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    dayMap[key] = 0
  }
  missions.forEach(m => {
    try {
      const dt = new Date(m.created_at)
      const key = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      if (dayMap[key] !== undefined) dayMap[key]++
    } catch {}
  })
  const dayData = Object.entries(dayMap)
  const maxDayVal = Math.max(...dayData.map(([, v]) => v), 1)

  return (
    <div className="home-page" style={{ minHeight: '100vh' }}>
      <NavBar page="stats" onNavigate={onNavigate} />

      {/* ── HERO ── */}
      <section
        className="upload-hero"
        style={{ background: 'linear-gradient(135deg, #0a1f3a 0%, #1e3a5f 50%, #0d4a2e 100%)', padding: '44px 32px 52px' }}
      >
        <div className="home-hero-inner" style={{ maxWidth: 1200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="home-badge">
                <span className="home-badge-dot" style={{ background: error ? '#f87171' : '#4ade80' }} />
                LIVE ANALYTICS &nbsp;·&nbsp; MISSION INTELLIGENCE &nbsp;·&nbsp; {missions.length} MISSIONS
              </div>
              <h1 className="home-hero-title" style={{ fontSize: 'clamp(24px,3.5vw,38px)', marginBottom: 8 }}>
                Analytics Dashboard<br />
                <em className="home-hero-italic">Mission Intelligence &amp; Detection Trends</em>
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, maxWidth: 580, lineHeight: 1.6 }}>
                Aggregated statistics from all ROV survey missions. Detection trends, class distribution,
                ecological incident breakdown, and inference performance metrics.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => { fetchAll(); setCountdown(refreshSec) }}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={() => setAutoRefresh(r => !r)}
                  style={{ background: autoRefresh ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.1)', border: `1px solid ${autoRefresh ? '#10b981' : 'rgba(255,255,255,0.2)'}`, color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  {autoRefresh ? `⏱ Auto (${countdown}s)` : '⏸ Paused'}
                </button>
              </div>
              {lastUpdated && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  Updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca', color: '#991b1b', padding: '12px 32px', fontSize: 13, fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── KPI CARDS ── */}
      <section style={{ background: '#e4eff5', padding: '24px 32px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="upload-stats-row" style={{ marginBottom: 0 }}>
            {[
              {
                label: 'TOTAL MISSIONS', value: missions.length,
                sub: `${stats?.active_engine || 'ONNX'} engine`,
                color: '#0284c7',
                spark: dayData.map(([, v]) => v), sparkColor: '#0284c7',
              },
              {
                label: 'UNIQUE DEBRIS OBJECTS', value: totalObjects,
                sub: 'cumulative across all missions',
                color: '#059669',
                spark: objectCounts, sparkColor: '#10b981',
              },
              {
                label: 'TOTAL INCIDENTS', value: totalIncidents,
                sub: `${criticalCount} critical severity`,
                color: totalIncidents > 0 ? '#dc2626' : '#64748b',
                spark: Object.values(sevBreakdown).reverse(), sparkColor: '#ef4444',
              },
              {
                label: 'AVG INFERENCE', value: avgLatency ? `${avgLatency} ms` : '—',
                sub: 'mean backend latency',
                color: avgLatency && avgLatency < 800 ? '#10b981' : '#f97316',
              },
            ].map(s => (
              <div key={s.label} className="home-card upload-stat-card" style={{ overflow: 'hidden', paddingBottom: 0 }}>
                <p className="home-card-num">{s.label}</p>
                <p className="upload-stat-val" style={s.color ? { color: s.color } : {}}>
                  {loading ? '…' : typeof s.value === 'number' ? <Counter value={s.value} color={s.color} /> : s.value}
                </p>
                <p className="home-card-desc" style={{ marginTop: 4, fontSize: 12 }}>{s.sub}</p>
                {s.spark && s.spark.length > 1 && (
                  <div style={{ marginTop: 8, marginLeft: -16, marginRight: -16, opacity: 0.6 }}>
                    <Sparkline data={s.spark} color={s.sparkColor} height={36} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MAIN GRID ── */}
      <section style={{ background: '#e4eff5', padding: '20px 32px 64px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* LEFT column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Missions per day */}
            <div className="home-card" style={{ padding: '20px 24px' }}>
              <p className="home-card-num" style={{ marginBottom: 16 }}>MISSIONS PER DAY — LAST 7 DAYS</p>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading…</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
                  {dayData.map(([label, count]) => {
                    const pct = maxDayVal > 0 ? (count / maxDayVal) * 100 : 0
                    return (
                      <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: count > 0 ? '#0284c7' : '#cbd5e1' }}>{count || ''}</span>
                        <div style={{ width: '100%', height: 60, background: '#f1f5f9', borderRadius: '4px 4px 0 0', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: '100%', height: `${pct}%`,
                              background: count > 0 ? 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)' : 'transparent',
                              borderRadius: '4px 4px 0 0',
                              minHeight: count > 0 ? 4 : 0,
                              transition: 'height 0.7s ease',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Class distribution */}
            <div className="home-card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p className="home-card-num" style={{ margin: 0 }}>DEBRIS CLASS DISTRIBUTION</p>
                <span style={{ fontSize: 11, color: '#64748b' }}>{classData.length} detected classes</span>
              </div>
              {loading
                ? <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading…</div>
                : <BarChart data={classData} maxVal={maxClassVal} />
              }
            </div>

            {/* Incident types */}
            <div className="home-card" style={{ padding: '20px 24px' }}>
              <p className="home-card-num" style={{ marginBottom: 16 }}>ALERT TYPE BREAKDOWN</p>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading…</div>
              ) : incTypeData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 13 }}>No incidents recorded yet</div>
              ) : (
                <BarChart data={incTypeData} maxVal={maxIncVal} />
              )}
            </div>
          </div>

          {/* RIGHT column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Severity grid */}
            <div className="home-card" style={{ padding: '20px 24px' }}>
              <p className="home-card-num" style={{ marginBottom: 14 }}>INCIDENT SEVERITY</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {Object.entries(sevBreakdown).map(([sev, count]) => (
                  <div key={sev} style={{ background: SEV_BG[sev], border: `1.5px solid ${SEV_COLOR[sev]}40`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: SEV_COLOR[sev], display: 'block' }}>
                      {loading ? '…' : <Counter value={count} color={SEV_COLOR[sev]} />}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: SEV_COLOR[sev] }}>{sev}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent missions */}
            <div className="home-card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p className="home-card-num" style={{ margin: 0 }}>RECENT MISSIONS</p>
                <button
                  onClick={() => onNavigate?.('history')}
                  style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  View All →
                </button>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Loading…</div>
              ) : missions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 13 }}>No missions yet — launch the ROV Simulator</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                  {missions.slice(0, 12).map(m => {
                    const dt = m.created_at
                      ? new Date(m.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{m.name || 'Unnamed Mission'}</p>
                          <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{dt}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#0284c7' }}>{m.total_unique_objects || 0}</span>
                          <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>objects</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Backend status card */}
            <div className="home-card" style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0a1f3a, #0d3260)' }}>
              <p className="home-card-num" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>BACKEND STATUS</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Active Engine', value: stats?.active_engine || (loading ? '…' : 'Unavailable') },
                  { label: 'DB Missions', value: stats?.total_missions ?? (loading ? '…' : '—') },
                  { label: 'DB Incidents', value: stats?.total_incidents ?? (loading ? '…' : '—') },
                  { label: 'Backend Port', value: '8000' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{row.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', fontFamily: 'monospace' }}>{row.value}</span>
                  </div>
                ))}
                <button
                  onClick={() => onNavigate?.('rov')}
                  style={{ marginTop: 4, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff', borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%' }}
                >
                  🌊 Launch ROV Simulator →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinel — Mission Analytics Dashboard</p>
        <p className="home-footer-sub">Live data from FastAPI · Auto-refreshes every {refreshSec}s</p>
      </footer>
    </div>
  )
}
