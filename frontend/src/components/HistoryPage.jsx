import React, { useState, useMemo } from 'react'
import NavBar from './NavBar'
import useHistory from '../hooks/useHistory'

const SEV_COLOR = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#059669',
}

const SEV_BG = {
  critical: '#fef2f2',
  high: '#fff7ed',
  medium: '#fffbeb',
  low: '#ecfdf5',
}

const SEV_BORDER = {
  critical: '#fca5a5',
  high: '#fdba74',
  medium: '#fde68a',
  low: '#a7f3d0',
}

const TYPE_CONFIG = {
  image: {
    label: 'Single Image Scan',
    icon: '🖼️',
    badgeBg: '#eff6ff',
    badgeText: '#1d4ed8',
    badgeBorder: '#bfdbfe',
  },
  rov: {
    label: 'ROV Dive Transect',
    icon: '🌊',
    badgeBg: '#ecfdf5',
    badgeText: '#047857',
    badgeBorder: '#a7f3d0',
  },
  batch: {
    label: 'Batch Stream',
    icon: '📦',
    badgeBg: '#faf5ff',
    badgeText: '#7e22ce',
    badgeBorder: '#e9d5ff',
  },
}

export default function HistoryPage({ onNavigate }) {
  const { entries, removeEntry, clearHistory } = useHistory()
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'image' | 'rov' | 'batch'
  const [severityFilter, setSeverityFilter] = useState('all') // 'all' | 'critical' | 'high' | 'medium' | 'low'
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null) // For detail inspection modal

  // Counts by type
  const typeCounts = useMemo(() => {
    const counts = { all: entries.length, image: 0, rov: 0, batch: 0 }
    entries.forEach((e) => {
      if (counts[e.type] !== undefined) counts[e.type]++
    })
    return counts
  }, [entries])

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false
      if (severityFilter !== 'all' && (entry.summary?.highestSeverity || 'low') !== severityFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const labelMatch = (entry.label || '').toLowerCase().includes(q)
        const typeMatch = (entry.type || '').toLowerCase().includes(q)
        const locMatch = (entry.location || '').toLowerCase().includes(q)
        const invMatch = (entry.inventory || []).some(
          (inv) => (inv.class || '').toLowerCase().includes(q)
        )
        if (!labelMatch && !typeMatch && !locMatch && !invMatch) return false
      }
      return true
    })
  }, [entries, typeFilter, severityFilter, searchQuery])

  // Summary statistics
  const stats = useMemo(() => {
    let totalScans = entries.length
    let totalDebris = 0
    let highOrCritical = 0
    entries.forEach((e) => {
      totalDebris += e.summary?.debrisCount ?? e.summary?.totalObjects ?? 0
      const s = e.summary?.highestSeverity
      if (s === 'critical' || s === 'high') highOrCritical++
    })
    return { totalScans, totalDebris, highOrCritical }
  }, [entries])

  const formatDate = (isoString) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString || 'Recently'
    }
  }

  const handleSendToOptimizer = (entry) => {
    if (!onNavigate) return
    onNavigate('optimizer', {
      source: 'history',
      pileId: entry.label || `Scan ${entry.id}`,
      depth: entry.depth || entry.seafloor_depth_m || entry.seafloorDepthMeters || null,
      inventory: entry.inventory && entry.inventory.length > 0
        ? entry.inventory
        : [
            { class: 'trash_debris', count: { min: entry.summary?.debrisCount || 1, max: Math.ceil((entry.summary?.debrisCount || 1) * 1.5) } }
          ],
      location: entry.location || 'Logged Survey Site',
      severity: entry.summary?.highestSeverity || 'high',
      frameDataUrl: entry.thumbnailDataUrl,
    })
  }

  return (
    <div className="home-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <NavBar page="history" onNavigate={onNavigate} />

      {/* ── HERO BANNER (Ocean Shimmer Header) ── */}
      <section className="upload-hero" style={{ background: 'linear-gradient(135deg, #0a1f3a 0%, #0d3260 40%, #0e5e48 100%)', padding: '48px 32px 52px' }}>
        <div className="home-hero-inner" style={{ maxWidth: 1200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="home-badge">
                <span className="home-badge-dot" style={{ background: entries.length > 0 ? '#4ade80' : '#94a3b8' }} />
                AUDIT TRAIL &nbsp;&middot;&nbsp; PERSISTENT SCAN ARCHIVE &nbsp;&middot;&nbsp; {entries.length} RECORD{entries.length !== 1 ? 'S' : ''}
              </div>
              <h1 className="home-hero-title" style={{ fontSize: 'clamp(26px,4vw,40px)', marginBottom: 8 }}>
                Survey &amp; Inspection History<br />
                <em className="home-hero-italic">Detections, Transects &amp; Hotspot Archive</em>
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, maxWidth: 640, lineHeight: 1.6, margin: 0 }}>
                Persistent chronological survey log retaining single-image scans and ROV video transects.
                Review detected debris tallies, ecological threats, or dispatch any past debris cluster directly to the Cleanup Optimizer.
              </p>
            </div>

            {/* Clear All Controls */}
            {entries.length > 0 && (
              <div style={{ alignSelf: 'flex-start' }}>
                {!confirmClear ? (
                  <button
                    onClick={() => setConfirmClear(true)}
                    style={{
                      background: 'rgba(239,68,68,0.18)',
                      border: '1px solid rgba(239,68,68,0.4)',
                      color: '#fca5a5',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                    }}
                  >
                    🗑️ Clear History
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.25)', border: '1px solid #ef4444', borderRadius: 8, padding: '6px 12px' }}>
                    <span style={{ fontSize: 11, color: '#fca5a5', fontWeight: 600 }}>Clear all records?</span>
                    <button
                      onClick={() => {
                        clearHistory()
                        setConfirmClear(false)
                      }}
                      style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Yes, Clear
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── STATS ROW (Matching Theme of ROVSimulator & UploadPage) ── */}
      <section style={{ background: '#e4eff5', padding: '24px 32px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="upload-stats-row" style={{ marginBottom: 0 }}>
            {[
              {
                label: 'TOTAL INSPECTIONS',
                value: stats.totalScans,
                sub: `${typeCounts.image} image · ${typeCounts.rov} ROV${typeCounts.batch > 0 ? ` · ${typeCounts.batch} batch` : ''}`,
              },
              {
                label: 'HARMFUL DEBRIS FOUND',
                value: stats.totalDebris,
                sub: 'cumulative detected items',
                color: '#059669',
              },
              {
                label: 'HIGH / CRITICAL THREATS',
                value: stats.highOrCritical,
                sub: 'priority ecological hazards',
                color: stats.highOrCritical > 0 ? '#ef4444' : '#64748b',
              },
              {
                label: 'STORAGE RESIDENCY',
                value: 'Local Session',
                sub: 'browser storage (max 100 entries)',
                color: '#2563eb',
              },
            ].map((s) => (
              <div key={s.label} className="home-card upload-stat-card">
                <p className="home-card-num">{s.label}</p>
                <p className="upload-stat-val" style={s.color ? { color: s.color } : {}}>
                  {s.value}
                </p>
                <p className="home-card-desc" style={{ marginTop: 4, fontSize: 12 }}>{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MAIN WORKSPACE ── */}
      <section style={{ background: '#e4eff5', padding: '20px 32px 64px', flex: 1 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Filter & Search Bar Card */}
          <div className="home-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'center' }}>
            
            {/* Type tabs */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All Records (${typeCounts.all})` },
                { id: 'image', label: `🖼️ Single Images (${typeCounts.image})` },
                { id: 'rov', label: `🌊 ROV Transects (${typeCounts.rov})` },
                ...(typeCounts.batch > 0 ? [{ id: 'batch', label: `📦 Batch Streams (${typeCounts.batch})` }] : []),
              ].map((f) => {
                const isActive = typeFilter === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => setTypeFilter(f.id)}
                    style={{
                      background: isActive ? '#0284c7' : '#f8fafc',
                      border: `1px solid ${isActive ? '#0284c7' : '#cbd5e1'}`,
                      color: isActive ? '#ffffff' : '#334155',
                      borderRadius: 8,
                      padding: '7px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 2px 8px rgba(2,132,199,0.25)' : 'none',
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>

            {/* Severity Filter & Search Input */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  color: '#1e293b',
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Threat Levels</option>
                <option value="critical">Critical Severity</option>
                <option value="high">High Severity</option>
                <option value="medium">Medium Severity</option>
                <option value="low">Low Severity</option>
              </select>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search by name, class, site..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    color: '#0f172a',
                    borderRadius: 8,
                    padding: '7px 32px 7px 12px',
                    fontSize: 12,
                    outline: 'none',
                    minWidth: 240,
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: 2,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* History Records List */}
          {filteredEntries.length === 0 ? (
            <div className="home-card" style={{ padding: '64px 32px', textAlign: 'center', background: '#ffffff', border: '2px dashed #cbd5e1', borderRadius: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0f9ff', border: '1.5px solid #bae6fd', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
                🧭
              </div>
              <h3 className="home-card-title" style={{ fontSize: 20, marginBottom: 8, color: '#0f2030' }}>
                {entries.length === 0 ? 'No Survey Records Yet' : 'No Records Match Current Filter'}
              </h3>
              <p className="home-card-desc" style={{ maxWidth: 460, margin: '0 auto 24px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                {entries.length === 0
                  ? 'Run an underwater image scan or launch an ROV dive transect. Every completed survey and detected debris pile is automatically retained here.'
                  : 'Try selecting "All Records" or "All Threat Levels", or clear the search query to show all logged missions.'}
              </p>
              {entries.length === 0 && (
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => onNavigate && onNavigate('home')}
                    className="upload-btn-run"
                    style={{ padding: '8px 20px', fontSize: 13 }}
                  >
                    ▶ Run New Image Scan
                  </button>
                  <button
                    onClick={() => onNavigate && onNavigate('rov')}
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #0284c7',
                      color: '#0284c7',
                      borderRadius: 8,
                      padding: '8px 20px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    🌊 Launch ROV Simulator
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredEntries.map((entry) => {
                const sev = entry.summary?.highestSeverity || 'low'
                const sevColor = SEV_COLOR[sev] || '#059669'
                const sevBg = SEV_BG[sev] || '#ecfdf5'
                const sevBorder = SEV_BORDER[sev] || '#a7f3d0'
                const typeCfg = TYPE_CONFIG[entry.type] || TYPE_CONFIG.image

                return (
                  <div
                    key={entry.id}
                    className="home-card"
                    style={{
                      padding: '18px 22px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 20,
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      border: '1px solid rgba(168, 207, 224, 0.45)',
                    }}
                  >
                    {/* Thumbnail / Image Preview */}
                    <div
                      onClick={() => entry.thumbnailDataUrl && setSelectedEntry(entry)}
                      style={{
                        width: 90,
                        height: 72,
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: '#f1f5f9',
                        flexShrink: 0,
                        border: '1.5px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: entry.thumbnailDataUrl ? 'pointer' : 'default',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      }}
                      title={entry.thumbnailDataUrl ? 'Click to inspect frame' : undefined}
                    >
                      {entry.thumbnailDataUrl ? (
                        <img
                          src={entry.thumbnailDataUrl}
                          alt={entry.label}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontSize: 28 }}>{typeCfg.icon}</span>
                      )}
                    </div>

                    {/* Content Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '3px 9px',
                            borderRadius: 6,
                            background: typeCfg.badgeBg,
                            color: typeCfg.badgeText,
                            border: `1px solid ${typeCfg.badgeBorder}`,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {typeCfg.label}
                        </span>

                        <h4
                          style={{
                            margin: 0,
                            fontSize: 15,
                            fontWeight: 700,
                            color: '#0f2030',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {entry.label}
                        </h4>

                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          &bull; {formatDate(entry.timestamp)}
                        </span>
                      </div>

                      {/* Stat summary pills */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#475569', marginTop: 4, flexWrap: 'wrap' }}>
                        <span>
                          <strong style={{ color: '#0f172a' }}>{entry.summary?.totalObjects ?? 0}</strong> total objects
                        </span>
                        <span>
                          <strong style={{ color: '#059669' }}>{entry.summary?.debrisCount ?? 0}</strong> harmful debris
                        </span>
                        {entry.location && (
                          <span style={{ color: '#64748b', fontSize: 11 }}>
                            📍 {entry.location}
                          </span>
                        )}
                      </div>

                      {/* Detected Classes Inventory Tags */}
                      {entry.inventory && entry.inventory.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {entry.inventory.slice(0, 6).map((inv, i) => {
                            const countVal = typeof inv.count === 'object' ? (inv.count.min ?? 1) : (inv.count ?? 1)
                            const clsLabel = (inv.class || '').replace(/^trash_|^animal_/, '')
                            return (
                              <span
                                key={i}
                                style={{
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  color: '#334155',
                                  borderRadius: 5,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                {clsLabel}: <span style={{ color: '#0284c7', fontWeight: 700 }}>{countVal}</span>
                              </span>
                            )
                          })}
                          {entry.inventory.length > 6 && (
                            <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>
                              +{entry.inventory.length - 6} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Threat Level & Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
                      <span
                        style={{
                          background: sevBg,
                          color: sevColor,
                          border: `1.5px solid ${sevBorder}`,
                          borderRadius: 999,
                          padding: '3px 12px',
                          fontSize: 11,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {sev}
                      </span>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {entry.thumbnailDataUrl && (
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              borderRadius: 6,
                              padding: '6px 10px',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title="Inspect details and snapshot"
                          >
                            👁️ View
                          </button>
                        )}

                        <button
                          onClick={() => handleSendToOptimizer(entry)}
                          style={{
                            background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
                            border: 'none',
                            color: '#ffffff',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            boxShadow: '0 2px 8px rgba(2,132,199,0.3)',
                            transition: 'all 0.15s ease',
                          }}
                          title="Dispatch debris inventory to Diver Cleanup Optimizer"
                        >
                          🚀 Dispatch Cleanup
                        </button>

                        <button
                          onClick={() => removeEntry(entry.id)}
                          style={{
                            background: '#fee2e2',
                            border: '1px solid #fca5a5',
                            color: '#dc2626',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          title="Delete this record"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── INSPECTION DETAIL MODAL ── */}
      {selectedEntry && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 32, 48, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="home-card"
            style={{
              maxWidth: 680,
              width: '100%',
              background: '#ffffff',
              padding: 28,
              borderRadius: 16,
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: TYPE_CONFIG[selectedEntry.type]?.badgeBg || '#eff6ff',
                    color: TYPE_CONFIG[selectedEntry.type]?.badgeText || '#1d4ed8',
                    border: `1px solid ${TYPE_CONFIG[selectedEntry.type]?.badgeBorder || '#bfdbfe'}`,
                    textTransform: 'uppercase',
                  }}
                >
                  {TYPE_CONFIG[selectedEntry.type]?.label || selectedEntry.type}
                </span>
                <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: '#0f2030' }}>
                  {selectedEntry.label}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  Logged on {formatDate(selectedEntry.timestamp)} &bull; {selectedEntry.location || 'Survey Coordinates'}
                </p>
              </div>

              <button
                onClick={() => setSelectedEntry(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Snapshot */}
            {selectedEntry.thumbnailDataUrl && (
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #cbd5e1', marginBottom: 18, background: '#000', maxHeight: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={selectedEntry.thumbnailDataUrl}
                  alt={selectedEntry.label}
                  style={{ width: '100%', maxHeight: 340, objectFit: 'contain' }}
                />
              </div>
            )}

            {/* Metrics summary grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Total Objects</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{selectedEntry.summary?.totalObjects ?? 0}</span>
              </div>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Harmful Debris</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{selectedEntry.summary?.debrisCount ?? 0}</span>
              </div>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Threat Level</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: SEV_COLOR[selectedEntry.summary?.highestSeverity || 'low'], textTransform: 'uppercase' }}>
                  {selectedEntry.summary?.highestSeverity || 'Low'}
                </span>
              </div>
            </div>

            {/* Class Breakdown if available */}
            {selectedEntry.inventory && selectedEntry.inventory.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Debris Inventory Breakdown
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                  {selectedEntry.inventory.map((item, idx) => {
                    const countVal = typeof item.count === 'object' ? `${item.count.min ?? 1}–${item.count.max ?? 1}` : (item.count ?? 1)
                    return (
                      <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#475569' }}>{(item.class || '').replace(/^trash_/, '')}</span>
                        <strong style={{ color: '#0284c7' }}>{countVal}</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setSelectedEntry(null)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleSendToOptimizer(selectedEntry)
                  setSelectedEntry(null)
                }}
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(2,132,199,0.3)',
                }}
              >
                🚀 Dispatch to Cleanup Optimizer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
