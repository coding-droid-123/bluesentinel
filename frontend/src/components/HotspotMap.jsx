import React, { useEffect, useState, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import logo from '../assets/logo.png'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_COLOR = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#10b981',
}

const SEVERITY_RADIUS = {
  critical: 22,
  high:     16,
  medium:   12,
  low:      8,
}

const ZONE_TYPE_LABEL = {
  protected:  '🔴 Marine Protected Area',
  eez:        '🟠 Exclusive Economic Zone',
  open_ocean: '🌊 Open Ocean',
}

const REFRESH_INTERVAL_MS = 30_000   // refresh hotspots every 30 s

// ---------------------------------------------------------------------------
// Helper — re-centers map when hotspots load
// ---------------------------------------------------------------------------

function AutoFit({ hotspots }) {
  const map = useMap()
  useEffect(() => {
    if (hotspots.length === 0) return
    const lats = hotspots.map((h) => h.lat)
    const lons = hotspots.map((h) => h.lon)
    const bounds = [
      [Math.min(...lats) - 2, Math.min(...lons) - 2],
      [Math.max(...lats) + 2, Math.max(...lons) + 2],
    ]
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [hotspots, map])
  return null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function HotspotMap({ onNavigate, user, onShowAuth, onLogout }) {
  const [hotspots, setHotspots]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [error, setError]           = useState(null)
  const [filterSev, setFilterSev]   = useState('all')  // 'all' | 'critical' | 'high' | 'medium' | 'low'

  const fetchHotspots = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/hotspots')
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      setHotspots(data.hotspots || [])
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError('Could not reach backend — showing cached data.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling every 30 s
  useEffect(() => {
    fetchHotspots()
    const id = setInterval(fetchHotspots, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchHotspots])

  const filtered = filterSev === 'all'
    ? hotspots
    : hotspots.filter((h) => h.dominant_severity === filterSev)

  // Summary counts
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  hotspots.forEach((h) => { if (counts[h.dominant_severity] !== undefined) counts[h.dominant_severity]++ })

  return (
    <div style={{ minHeight: '100vh', background: '#0a1628', display: 'flex', flexDirection: 'column' }}>

      {/* ── NAVBAR ── */}
      <nav className="home-nav">
        <div className="home-nav-inner" style={{ justifyContent: 'space-between' }}>
          <button
            className="home-logo"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => onNavigate('home')}
          >
            <img src={logo} alt="Blue Sentinel" className="home-logo-img" />
            <span className="home-logo-text">Blue Sentinel</span>
          </button>
          <div className="home-nav-links">
            <button className="home-nav-link" onClick={() => onNavigate('home')}>← Home</button>
            <button className="home-nav-link" onClick={() => onNavigate('about')}>About</button>
            {user
              ? <button className="home-nav-link" onClick={onLogout}>Log Out</button>
              : <button className="home-nav-link" onClick={() => onShowAuth('login')}>Login</button>
            }
          </div>
        </div>
      </nav>

      {/* ── HEADER ── */}
      <div style={{ padding: '28px 32px 0', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <div className="home-badge" style={{ marginBottom: 10 }}>
              <span className="home-badge-dot" />
              Live · Updates every 30 s · Powered by PostgreSQL
            </div>
            <h1 className="home-hero-title" style={{ fontSize: 'clamp(22px,3vw,34px)', marginBottom: 6 }}>
              🌊 Marine Debris <em className="home-hero-italic">Hotspot Tracker</em>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
              All geolocated scans from every user · persisted in database · survives restarts
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Severity filter pills */}
            {['all', 'critical', 'high', 'medium', 'low'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterSev(s)}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: `1px solid ${s === 'all' ? '#334155' : SEVERITY_COLOR[s] + '60'}`,
                  background: filterSev === s
                    ? (s === 'all' ? '#1e3a5f' : SEVERITY_COLOR[s] + '25')
                    : 'transparent',
                  color: s === 'all' ? '#93c5fd' : SEVERITY_COLOR[s] || '#94a3b8',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  transition: 'all 0.15s',
                }}
              >
                {s === 'all' ? `All (${hotspots.length})` : `${s} (${counts[s]})`}
              </button>
            ))}

            {/* Refresh button */}
            <button
              onClick={fetchHotspots}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid #1e3a5f',
                background: '#1e3a5f',
                color: '#60a5fa',
                cursor: 'pointer',
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'TOTAL HOTSPOTS', value: hotspots.length, color: '#60a5fa' },
            { label: '🔴 CRITICAL', value: counts.critical, color: SEVERITY_COLOR.critical },
            { label: '🟠 HIGH', value: counts.high, color: SEVERITY_COLOR.high },
            { label: '🟡 MEDIUM', value: counts.medium, color: SEVERITY_COLOR.medium },
            { label: '🟢 LOW', value: counts.low, color: SEVERITY_COLOR.low },
          ].map((c) => (
            <div key={c.label} style={{
              background: '#0f2240',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              padding: '14px 16px',
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{c.label}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: c.color, margin: '4px 0 0' }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Error / status bar */}
        {error && (
          <div style={{ background: '#7f1d1d22', border: '1px solid #ef444440', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>
            ⚠️ {error}
          </div>
        )}
        {lastRefresh && !error && (
          <p style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
            Last updated: {lastRefresh.toLocaleTimeString()}  ·  Showing {filtered.length} of {hotspots.length} hotspots
          </p>
        )}
      </div>

      {/* ── MAP ── */}
      <div style={{ flex: 1, padding: '0 32px 32px', maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #1e3a5f', height: 520, position: 'relative' }}>

          {loading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 1000,
              background: '#0a162880',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12,
            }}>
              <div style={{ width: 32, height: 32, border: '3px solid #1e3a5f', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading hotspots from database…</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 1000,
              background: '#0a162880',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8,
            }}>
              <p style={{ fontSize: 32 }}>🌊</p>
              <p style={{ color: '#94a3b8', fontSize: 14 }}>No hotspots yet — run a scan with a pinned location to add one!</p>
            </div>
          )}

          <MapContainer
            center={[12.0, 76.0]}
            zoom={3}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {filtered.length > 0 && <AutoFit hotspots={filtered} />}

            {filtered.map((h) => (
              <CircleMarker
                key={h.batch_id}
                center={[h.lat, h.lon]}
                radius={SEVERITY_RADIUS[h.dominant_severity] || 10}
                pathOptions={{
                  color: SEVERITY_COLOR[h.dominant_severity] || '#60a5fa',
                  fillColor: SEVERITY_COLOR[h.dominant_severity] || '#60a5fa',
                  fillOpacity: 0.55,
                  weight: 2,
                }}
              >
                <Popup maxWidth={260}>
                  <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>

                    {/* Severity badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{
                        background: SEVERITY_COLOR[h.dominant_severity] + '20',
                        color: SEVERITY_COLOR[h.dominant_severity],
                        border: `1px solid ${SEVERITY_COLOR[h.dominant_severity]}50`,
                        borderRadius: 999,
                        padding: '2px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}>
                        {h.dominant_severity} risk
                      </span>
                    </div>

                    {/* Zone */}
                    <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px', color: '#1e293b' }}>
                      {h.zone}
                    </p>
                    <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px' }}>
                      {ZONE_TYPE_LABEL[h.zone_type] || h.zone_type}
                    </p>

                    {/* Stats grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 10 }}>
                      <div>
                        <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, textTransform: 'uppercase' }}>Detections</p>
                        <p style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: 0 }}>{h.total_detections}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, textTransform: 'uppercase' }}>Top Class</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>{h.top_class}</p>
                      </div>
                    </div>

                    {/* Coordinates */}
                    <p style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', margin: '0 0 6px' }}>
                      {h.lat.toFixed(4)}°{h.lat >= 0 ? 'N' : 'S'} · {h.lon.toFixed(4)}°{h.lon >= 0 ? 'E' : 'W'}
                    </p>

                    {/* Date */}
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                      🕐 {h.scanned_at ? new Date(h.scanned_at).toLocaleString() : 'Unknown time'}
                    </p>

                    {/* Thumbnail */}
                    {h.image_path && (
                      <img
                        src={`http://localhost:8000${h.image_path}`}
                        alt="scan"
                        style={{ width: '100%', borderRadius: 6, marginTop: 8, objectFit: 'cover', maxHeight: 100 }}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 11, color: '#475569', margin: 0, alignSelf: 'center' }}>
            Circle size = severity · Click any marker for details
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {Object.entries(SEVERITY_COLOR).map(([sev, col]) => (
              <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: SEVERITY_RADIUS[sev], height: SEVERITY_RADIUS[sev], borderRadius: '50%', background: col, opacity: 0.7 }} />
                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{sev}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .leaflet-popup-content { margin: 12px 14px; }
      `}</style>
    </div>
  )
}
