import React, { useState, useMemo } from 'react'
import NavBar from './NavBar'
import useHistory from '../hooks/useHistory'

const SEV_COLOR = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#10b981',
}

const SEV_BG = {
  critical: 'rgba(239, 68, 68, 0.15)',
  high: 'rgba(249, 115, 22, 0.15)',
  medium: 'rgba(234, 179, 8, 0.15)',
  low: 'rgba(16, 185, 129, 0.15)',
}

const TYPE_ICONS = {
  image: '🖼️',
  rov: '🌊',
  batch: '📦',
}

const TYPE_LABELS = {
  image: 'Image Scan',
  rov: 'ROV Dive Transect',
  batch: 'Batch Stream',
}

export default function HistoryPage({ onNavigate }) {
  const { entries, removeEntry, clearHistory } = useHistory()
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'image' | 'rov' | 'batch'
  const [severityFilter, setSeverityFilter] = useState('all') // 'all' | 'critical' | 'high' | 'medium' | 'low'
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

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
    <div style={{ minHeight: '100vh', background: '#0a192f', color: '#e2e8f0', display: 'flex', flexDirection: 'column' }}>
      <NavBar page="history" onNavigate={onNavigate} />

      {/* Hero Header */}
      <div style={{ background: 'linear-gradient(180deg, rgba(14,35,65,0.9) 0%, rgba(10,25,47,0.98) 100%)', borderBottom: '1px solid rgba(56,189,248,0.15)', padding: '36px 32px 28px' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)', padding: '4px 12px', borderRadius: 999, marginBottom: 12 }}>
                <span style={{ fontSize: 13 }}>📜</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Persistent Scan Log
                </span>
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                Analysis & Search History
              </h1>
              <p style={{ fontSize: 14, color: '#94a3b8', margin: 0, maxWidth: 600, lineHeight: 1.5 }}>
                Retains records of single-image scans, ROV video transects, and batch stream surveys. You can inspect findings or dispatch any previous debris pile directly to the Cleanup Optimizer.
              </p>
            </div>

            {entries.length > 0 && (
              <div>
                {!confirmClear ? (
                  <button
                    onClick={() => setConfirmClear(true)}
                    style={{
                      background: 'rgba(239,68,68,0.12)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#f87171',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                    }}
                  >
                    🗑️ Clear All History
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', borderRadius: 8, padding: '6px 12px' }}>
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

          {/* Metric Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 24 }}>
            <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(100,116,139,0.25)', borderRadius: 12, padding: '14px 18px' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Total Analyses
              </span>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', margin: '4px 0 0' }}>
                {stats.totalScans}
              </p>
            </div>
            <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(100,116,139,0.25)', borderRadius: 12, padding: '14px 18px' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Debris Objects Found
              </span>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#4ade80', margin: '4px 0 0' }}>
                {stats.totalDebris}
              </p>
            </div>
            <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(100,116,139,0.25)', borderRadius: 12, padding: '14px 18px' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                High / Critical Events
              </span>
              <p style={{ fontSize: 24, fontWeight: 800, color: stats.highOrCritical > 0 ? '#f87171' : '#94a3b8', margin: '4px 0 0' }}>
                {stats.highOrCritical}
              </p>
            </div>
            <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(100,116,139,0.25)', borderRadius: 12, padding: '14px 18px' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Storage Policy
              </span>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', margin: '8px 0 0' }}>
                Browser LocalStorage (Max 100)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div style={{ flex: 1, padding: '28px 32px 48px', maxWidth: 1140, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          {/* Type filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Scans' },
              { id: 'image', label: '🖼️ Single Images' },
              { id: 'rov', label: '🌊 ROV Surveys' },
              { id: 'batch', label: '📦 Batch Streams' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setTypeFilter(f.id)}
                style={{
                  background: typeFilter === f.id ? '#0284c7' : 'rgba(30,41,59,0.6)',
                  border: `1px solid ${typeFilter === f.id ? '#38bdf8' : 'rgba(100,116,139,0.3)'}`,
                  color: typeFilter === f.id ? '#fff' : '#cbd5e1',
                  borderRadius: 8,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{
                background: 'rgba(30,41,59,0.8)',
                border: '1px solid rgba(100,116,139,0.4)',
                color: '#e2e8f0',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                outline: 'none',
              }}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical Severity</option>
              <option value="high">High Severity</option>
              <option value="medium">Medium Severity</option>
              <option value="low">Low Severity</option>
            </select>

            {/* Search Input */}
            <input
              type="text"
              placeholder="Search history by name, class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'rgba(30,41,59,0.8)',
                border: '1px solid rgba(100,116,139,0.4)',
                color: '#fff',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                outline: 'none',
                minWidth: 220,
              }}
            />
          </div>
        </div>

        {/* History List or Empty State */}
        {filteredEntries.length === 0 ? (
          <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px dashed rgba(100,116,139,0.4)', borderRadius: 16, padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🧭</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: '0 0 8px' }}>
              {entries.length === 0 ? 'No Analysis History Recorded Yet' : 'No Records Match Filter'}
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.5 }}>
              {entries.length === 0
                ? 'Run an image detection scan from Home, launch an ROV transect mission, or execute a Batch Stream. Scans and detected debris piles are automatically remembered here.'
                : 'Try clearing the search query or selecting "All Scans" / "All Severities" to reveal logged missions.'}
            </p>
            {entries.length === 0 && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={() => onNavigate && onNavigate('home')}
                  style={{
                    background: '#0284c7',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Go to Home Scan
                </button>
                <button
                  onClick={() => onNavigate && onNavigate('rov')}
                  style={{
                    background: 'rgba(56,189,248,0.15)',
                    border: '1px solid #0284c7',
                    color: '#38bdf8',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Open ROV Simulator
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredEntries.map((entry) => {
              const sev = entry.summary?.highestSeverity || 'low'
              const color = SEV_COLOR[sev] || '#10b981'
              const bg = SEV_BG[sev] || 'rgba(16,185,129,0.15)'

              return (
                <div
                  key={entry.id}
                  style={{
                    background: 'rgba(15,23,42,0.85)',
                    border: '1px solid rgba(100,116,139,0.3)',
                    borderRadius: 14,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 18,
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                  }}
                >
                  {/* Thumbnail / Icon */}
                  <div style={{ width: 80, height: 64, borderRadius: 10, overflow: 'hidden', background: '#0b1626', flexShrink: 0, border: '1px solid rgba(100,116,139,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {entry.thumbnailDataUrl ? (
                      <img
                        src={entry.thumbnailDataUrl}
                        alt={entry.label}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: 26 }}>{TYPE_ICONS[entry.type] || '🔍'}</span>
                    )}
                  </div>

                  {/* Details Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                        {TYPE_LABELS[entry.type] || entry.type.toUpperCase()}
                      </span>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.label}
                      </h4>
                      <span style={{ fontSize: 11, color: '#64748b' }}>&bull; {formatDate(entry.timestamp)}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#94a3b8', marginTop: 4, flexWrap: 'wrap' }}>
                      <span>
                        <strong style={{ color: '#e2e8f0' }}>{entry.summary?.totalObjects ?? 0}</strong> items detected
                      </span>
                      <span>
                        <strong style={{ color: '#4ade80' }}>{entry.summary?.debrisCount ?? 0}</strong> harmful debris
                      </span>
                      {entry.location && (
                        <span style={{ color: '#64748b', fontSize: 11 }}>
                          📍 {entry.location}
                        </span>
                      )}
                    </div>

                    {/* Inventory Pills if available */}
                    {entry.inventory && entry.inventory.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {entry.inventory.slice(0, 5).map((inv, i) => (
                          <span
                            key={i}
                            style={{
                              background: 'rgba(30,41,59,0.8)',
                              border: '1px solid rgba(100,116,139,0.3)',
                              color: '#cbd5e1',
                              borderRadius: 4,
                              padding: '2px 6px',
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                          >
                            {(inv.class || '').replace(/^trash_|^animal_/, '')}: {inv.count?.min ?? inv.count ?? 1}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Severity Badge & Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
                    <span
                      style={{
                        background: bg,
                        color: color,
                        border: `1px solid ${color}50`,
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {sev}
                    </span>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleSendToOptimizer(entry)}
                        style={{
                          background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          boxShadow: '0 2px 8px rgba(2,132,199,0.35)',
                        }}
                        title="Send this survey's debris inventory to Cleanup Optimizer"
                      >
                        🚀 Dispatch Cleanup
                      </button>

                      <button
                        onClick={() => removeEntry(entry.id)}
                        style={{
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          color: '#f87171',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontSize: 11,
                          cursor: 'pointer',
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
    </div>
  )
}
