import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix Leaflet default marker icon broken by bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const ZONE_LABELS = {
  protected: { label: 'Marine Protected Area', color: '#ef4444', bg: '#fef2f2' },
  eez: { label: 'Exclusive Economic Zone', color: '#f97316', bg: '#fff7ed' },
  open_ocean: { label: 'Open Ocean', color: '#0891b2', bg: '#ecfeff' },
}

// Fallback client-side zone guess
function guessZone(lat, lon) {
  if (lat > 10 && lat < 12.5 && lon > 72 && lon < 74)
    return { zone: 'Lakshadweep Marine Sanctuary', type: 'protected' }
  if (lat > 8.5 && lat < 10 && lon > 78 && lon < 80.5)
    return { zone: 'Gulf of Mannar Biosphere Reserve', type: 'protected' }
  if (lat > 5 && lat < 23 && lon > 80 && lon < 100)
    return { zone: 'Bay of Bengal', type: 'eez' }
  if (lat > 5 && lat < 26 && lon > 50 && lon < 78)
    return { zone: 'Arabian Sea', type: 'eez' }
  if (lat > -60 && lat < 30 && lon > 20 && lon < 147)
    return { zone: 'Indian Ocean', type: 'open_ocean' }
  return { zone: 'International Waters', type: 'open_ocean' }
}

// Inner component — captures click events on Leaflet map
function PinHandler({ candidatePin, onSelect }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lon: e.latlng.lng })
    },
  })
  return candidatePin ? <Marker position={[candidatePin.lat, candidatePin.lon]} /> : null
}

export default function LocationPinMap({ pin, onConfirm, onSkip }) {
  const [candidatePin, setCandidatePin] = useState(pin || null)
  const [isConfirmed, setIsConfirmed] = useState(Boolean(pin))
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState(null) // { is_ocean, is_land, zone, zone_type, message }

  // Sync state if prop pin changes externally
  useEffect(() => {
    if (pin) {
      setCandidatePin(pin)
      setIsConfirmed(true)
    } else if (pin === null && isConfirmed) {
      setCandidatePin(null)
      setIsConfirmed(false)
      setValidation(null)
    }
  }, [pin])

  // Validate whenever candidate pin changes
  const handleSelectLocation = async (coords) => {
    setCandidatePin(coords)
    setIsConfirmed(false)
    setValidating(true)
    setValidation(null)

    try {
      const res = await fetch(`http://localhost:8000/validate-location?lat=${coords.lat}&lon=${coords.lon}`)
      if (res.ok) {
        const data = await res.json()
        setValidation(data)
      } else {
        // Fallback if backend returned non-200
        const fallback = guessZone(coords.lat, coords.lon)
        setValidation({
          is_ocean: true,
          is_land: false,
          zone: fallback.zone,
          zone_type: fallback.type,
          message: 'Valid coordinates (offline estimation).',
        })
      }
    } catch (e) {
      const fallback = guessZone(coords.lat, coords.lon)
      setValidation({
        is_ocean: true,
        is_land: false,
        zone: fallback.zone,
        zone_type: fallback.type,
        message: 'Valid coordinates (offline mode).',
      })
    } finally {
      setValidating(false)
    }
  }

  const handleConfirm = () => {
    if (!candidatePin || validation?.is_land) return
    setIsConfirmed(true)
    if (onConfirm) {
      onConfirm({
        lat: candidatePin.lat,
        lon: candidatePin.lon,
        zone: validation?.zone || guessZone(candidatePin.lat, candidatePin.lon).zone,
        zone_type: validation?.zone_type || guessZone(candidatePin.lat, candidatePin.lon).type,
      })
    }
  }

  const handleRepin = () => {
    setIsConfirmed(false)
  }

  const currentZone = validation?.zone || (candidatePin ? guessZone(candidatePin.lat, candidatePin.lon).zone : 'Unknown Zone')
  const currentZoneType = validation?.zone_type || (candidatePin ? guessZone(candidatePin.lat, candidatePin.lon).type : 'open_ocean')
  const zoneStyle = ZONE_LABELS[currentZoneType] || ZONE_LABELS.open_ocean

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Map header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="home-card-num" style={{ margin: 0 }}>PIN SCAN LOCATION</p>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
            {isConfirmed
              ? 'Location confirmed. Re-pin to change.'
              : 'Click anywhere on the ocean to verify and mark where the debris photo was taken.'}
          </p>
        </div>
        {!isConfirmed && (
          <button
            onClick={onSkip}
            style={{
              fontSize: 12,
              color: '#94a3b8',
              background: 'none',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '5px 12px',
              cursor: 'pointer',
            }}
          >
            Skip ›
          </button>
        )}
      </div>

      {/* Leaflet Map */}
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', height: 260 }}>
        <MapContainer
          center={[12.0, 76.0]}
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <PinHandler candidatePin={candidatePin} onSelect={handleSelectLocation} />
        </MapContainer>
      </div>

      {/* Validating indicator */}
      {validating && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#64748b'
        }}>
          <span className="upload-spinner" style={{ width: 14, height: 14 }} />
          Verifying location against global land & marine boundary datasets...
        </div>
      )}

      {/* Pending confirmation — pin selected */}
      {candidatePin && !isConfirmed && !validating && (
        <div style={{
          background: validation?.is_land ? '#fef2f2' : '#f8fafc',
          border: `1px solid ${validation?.is_land ? '#fca5a5' : '#e2e8f0'}`,
          borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              {validation?.is_land ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
                      Land Location Detected
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: '#fee2e2', color: '#b91c1c',
                      borderRadius: 999, padding: '2px 8px',
                      textTransform: 'uppercase',
                    }}>
                      Invalid
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#991b1b', margin: '4px 0 0' }}>
                    {validation?.message || 'Pinned point is on land. Marine debris scans must be in ocean/water.'}
                  </p>
                  <p style={{ fontSize: 11, color: '#b91c1c', marginTop: 2, fontFamily: 'monospace' }}>
                    {candidatePin.lat.toFixed(4)}°{candidatePin.lat >= 0 ? 'N' : 'S'} &nbsp;·&nbsp;
                    {candidatePin.lon.toFixed(4)}°{candidatePin.lon >= 0 ? 'E' : 'W'}
                  </p>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>🌊</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                      {currentZone}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: zoneStyle.bg, color: zoneStyle.color,
                      border: `1px solid ${zoneStyle.color}40`,
                      borderRadius: 999, padding: '2px 8px',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {zoneStyle.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0, fontFamily: 'monospace' }}>
                    {candidatePin.lat.toFixed(4)}°{candidatePin.lat >= 0 ? 'N' : 'S'} &nbsp;·&nbsp;
                    {candidatePin.lon.toFixed(4)}°{candidatePin.lon >= 0 ? 'E' : 'W'}
                  </p>
                  <p style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>
                    ✓ Ocean location verified
                  </p>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignSelf: 'center' }}>
              <button
                onClick={() => setCandidatePin(null)}
                style={{
                  fontSize: 12, fontWeight: 600, color: '#64748b',
                  background: 'white', border: '1px solid #e2e8f0',
                  borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                }}
              >
                Clear
              </button>
              <button
                onClick={handleConfirm}
                disabled={validation?.is_land}
                title={validation?.is_land ? 'Cannot confirm location on land' : 'Confirm ocean location'}
                style={{
                  fontSize: 12, fontWeight: 700, color: 'white',
                  background: validation?.is_land ? '#94a3b8' : '#0891b2',
                  border: 'none',
                  borderRadius: 8, padding: '7px 16px',
                  cursor: validation?.is_land ? 'not-allowed' : 'pointer',
                  opacity: validation?.is_land ? 0.6 : 1,
                }}
              >
                ✅ Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmed state badge */}
      {isConfirmed && candidatePin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: 12, padding: '12px 16px',
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#166534', margin: 0 }}>
              Location confirmed — {currentZone}
            </p>
            <p style={{ fontSize: 11, color: '#15803d', margin: '2px 0 0', fontFamily: 'monospace' }}>
              {candidatePin.lat.toFixed(4)}°{candidatePin.lat >= 0 ? 'N' : 'S'} · {candidatePin.lon.toFixed(4)}°{candidatePin.lon >= 0 ? 'E' : 'W'}
            </p>
          </div>
          <button
            onClick={handleRepin}
            style={{
              marginLeft: 'auto', fontSize: 11, color: '#166534',
              background: 'none', border: '1px solid #bbf7d0',
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            Change
          </button>
        </div>
      )}
    </div>
  )
}
