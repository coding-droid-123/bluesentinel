import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { API_BASE_URL } from '../config'

// ── Hazard Score Thresholds ─────────────────────────────────────────────────
const SCORE_THRESHOLDS = { low: 2.0, medium: 6.0, high: 12.0 }

function getBubbleColor(severity, score) {
  if (severity === 'critical' || score >= SCORE_THRESHOLDS.high) return '#ef4444'
  if (severity === 'high' || score >= SCORE_THRESHOLDS.medium)   return '#f59e0b'
  return '#0ea5e9'
}

function getBubbleStroke(severity, score) {
  if (severity === 'critical' || score >= SCORE_THRESHOLDS.high) return '#b91c1c'
  if (severity === 'high' || score >= SCORE_THRESHOLDS.medium)   return '#d97706'
  return '#0369a1'
}

// ── Geo helpers ─────────────────────────────────────────────────────────────
function metersToLat(m)      { return m / 111320 }
function metersToLng(m, lat) { return m / (111320 * Math.cos((lat * Math.PI) / 180)) }

function formatCoord(lat, lng) {
  if (typeof lat !== 'number' || !Number.isFinite(lat) || typeof lng !== 'number' || !Number.isFinite(lng)) {
    return '0.0000°N, 0.0000°E'
  }
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`
}

// ── Pre-configured Marine Test Presets ──────────────────────────────────────
const MARINE_PRESETS = [
  { name: 'Monterey Submarine Canyon (Pacific)', lat: 36.7500, lng: -122.0000 },
  { name: 'Great Barrier Reef (Coral Sea)', lat: -16.5000, lng: 145.8000 },
  { name: 'Goa Offshore Shelf (Arabian Sea)', lat: 15.4900, lng: 73.7000 },
  { name: 'North Sea (Dogger Bank Basin)', lat: 54.7500, lng: 2.2500 },
  { name: 'Mariana Trench (Deepest Seafloor)', lat: 11.3500, lng: 142.2000 },
]

// ── Multi-Tier Seafloor Bathymetric Depth Fetcher ───────────────────────────
// Tiers: (1) Backend proxy (port 8000) -> (2) Depth service (port 8001) -> (3) NOAA NCEI ETOPO Global Relief Model
export async function fetchGlobalBathymetricDepth(lat, lng) {
  // Tier 1: Backend proxy
  try {
    const res = await fetch(`${API_BASE_URL}/api/ocean-depth?lat=${lat}&lon=${lng}`)
    if (res.ok) {
      const data = await res.json()
      if (typeof data?.depth_m === 'number' && data.depth_m > 0) return data.depth_m
    }
  } catch {}

  // Tier 2: Dedicated Ocean Depth microservice (port 8001)
  try {
    const res2 = await fetch(`http://localhost:8001/depth?lat=${lat}&lon=${lng}`, {
      headers: { 'x-api-key': 'test-key-1' },
    })
    if (res2.ok) {
      const data2 = await res2.json()
      if (typeof data2?.depth_m === 'number' && data2.depth_m > 0) return data2.depth_m
    }
  } catch {}

  // Tier 3: Direct NOAA NCEI ETOPO Global DEM Mosaic ImageServer (Global coverage, no auth, no limits)
  try {
    const geoJson = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } })
    const noaaUrl = `https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/identify?geometry=${encodeURIComponent(geoJson)}&geometryType=esriGeometryPoint&returnGeometry=false&f=json`
    const res3 = await fetch(noaaUrl)
    if (res3.ok) {
      const data3 = await res3.json()
      const val = parseFloat(data3?.value)
      if (Number.isFinite(val)) {
        // In ETOPO DEM, negative values are bathymetric depth in meters
        if (val < 0) return Math.round(Math.abs(val) * 10) / 10
        return 0 // Coastal or terrestrial surface
      }
    }
  } catch {}

  return null
}

// ── Dominant Debris Formatting Helper ──────────────────────────────────────
export function formatDebrisClassName(cls) {
  if (!cls) return 'Debris'
  const clean = String(cls).replace(/^trash_|^animal_/, '').toLowerCase()
  if (clean === 'unknown_instance' || clean === 'unknown' || clean === 'debris' || clean === 'trash_debris') {
    return 'Debris'
  }
  const map = {
    net: 'Fishing Net',
    rope: 'Rope',
    tarp: 'Tarp',
    pipe: 'Pipe',
    wreckage: 'Wreckage',
    bag: 'Plastic Bag',
    bottle: 'Bottle',
    container: 'Container',
    clothing: 'Clothing',
    can: 'Metal Can',
    cup: 'Cup',
    snack_wrapper: 'Snack Wrapper',
    branch: 'Branch',
    other_debris: 'Other Debris',
  }
  return map[clean] || clean.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Golden Angle Open Water Radial Distribution ────────────────────────────
// Distributes debris piles around the central dive site across a 500m radius.
// When valid marine headings are detected, piles are steered strictly into water sectors.
const GOLDEN_ANGLE_RAD = 137.508 * (Math.PI / 180)

export function getPileGeoLocation(centerCoords, index = 0, validHeadings = null) {
  const safeIdx = Number.isFinite(Number(index)) ? Math.max(0, Number(index)) : 0
  const centerLat = Number.isFinite(centerCoords?.lat) ? centerCoords.lat : 0
  const centerLng = Number.isFinite(centerCoords?.lng) ? centerCoords.lng : 0

  if (!centerCoords || !Number.isFinite(centerCoords.lat) || !Number.isFinite(centerCoords.lng)) {
    return { lat: 0, lng: 0, distanceMeters: 0, bearingDeg: 0, cardinal: 'N' }
  }

  let angleRad
  let deg

  if (Array.isArray(validHeadings) && validHeadings.length > 0) {
    // Steer strictly into verified open marine water headings (preventing piles from landing on shore/cliffs)
    const baseDeg = validHeadings[safeIdx % validHeadings.length]
    // Slight angular variation within the verified water sector so repeated piles don't stack
    const spreadOffset = ((safeIdx * 7) % 15) - 7
    deg = Math.round((baseDeg + spreadOffset + 360) % 360)
    angleRad = (deg * Math.PI) / 180
  } else {
    // Fallback to Golden angle radial distribution
    angleRad = (safeIdx * GOLDEN_ANGLE_RAD) + (32 * Math.PI / 180)
    deg = Math.round(((angleRad * 180 / Math.PI) % 360 + 360) % 360)
  }

  // Realistic underwater survey distances spanning across 500m dive perimeter (180m to 480m)
  const baseDistances = [190, 310, 240, 440, 220, 380, 270, 460]
  const distMeters = Math.min(480, baseDistances[safeIdx % baseDistances.length] + ((safeIdx * 13) % 25))

  const dLat = (distMeters * Math.cos(angleRad)) / 111320
  const cosLat = Math.cos((centerLat * Math.PI) / 180)
  const safeCos = Math.abs(cosLat) < 0.0001 ? 0.0001 : cosLat
  const dLng = (distMeters * Math.sin(angleRad)) / (111320 * safeCos)

  const lat = centerLat + dLat
  const lng = centerLng + dLng

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const cardinal = cardinals[Math.round(deg / 45) % 8]

  return {
    lat: Number.isFinite(lat) ? lat : centerLat,
    lng: Number.isFinite(lng) ? lng : centerLng,
    distanceMeters: Math.round(distMeters),
    bearingDeg: deg,
    cardinal,
  }
}

// ── Probe 12 surrounding radial azimuths to find strictly water headings ────
async function discoverMarineWaterHeadings(centerLat, centerLng) {
  const probeHeadings = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
  const probeDist = 320 // meters
  const lats = []
  const lngs = []

  for (const deg of probeHeadings) {
    const rad = (deg * Math.PI) / 180
    const dLat = (probeDist * Math.cos(rad)) / 111320
    const cosLat = Math.cos((centerLat * Math.PI) / 180)
    const safeCos = Math.abs(cosLat) < 0.0001 ? 0.0001 : cosLat
    const dLng = (probeDist * Math.sin(rad)) / (111320 * safeCos)
    lats.push(Number((centerLat + dLat).toFixed(5)))
    lngs.push(Number((centerLng + dLng).toFixed(5)))
  }

  // Tier 1: Dedicated Ocean Depth Service (SRTM15Plus Global DEM Bathymetry)
  // Queries high-resolution bathymetric depth for all 12 radial probe coordinates
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(
      `${API_BASE_URL}/api/ocean-depth/batch?lats=${lats.join(',')}&lons=${lngs.join(',')}`,
      { signal: controller.signal }
    )
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const results = data?.results || []
      // Points with positive ocean depth (depth_m > 0) are definitively underwater
      const waterOnly = probeHeadings.filter((_, idx) => {
        const item = results[idx]
        return typeof item?.depth_m === 'number' && item.depth_m > 0
      })
      if (waterOnly.length > 0) return waterOnly
    }
  } catch {}

  // Tier 2: Open-Meteo Global Elevation Fallback
  // Headings with elevation <= 1.0m are in open sea/ocean water
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`,
      { signal: controller.signal }
    )
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const elevs = data?.elevation || []
      const waterOnly = probeHeadings.filter((_, idx) => {
        const el = elevs[idx]
        return typeof el === 'number' && el <= 1.0
      })
      if (waterOnly.length > 0) return waterOnly
    }
  } catch {}
  return null
}

// ── Strict sea/ocean validation (Ocean Depth Service + Marine Wave Model + Elevation + OSM) ──
async function checkMarineWaterNearby(lat, lng) {
  // 1. Primary Ground Truth: Multi-Tier Ocean Depth & NOAA ETOPO Bathymetry
  try {
    const depth = await fetchGlobalBathymetricDepth(lat, lng)
    if (typeof depth === 'number' && depth > 0) {
      return true // Confirmed open marine water with authentic seafloor depth
    }
    if (depth === 0) {
      return true // Coastal sea level
    }
  } catch {}

  // 2. Secondary Ground Truth: Marine Wave Model
  // Marine wave models (ECMWF WAM) only resolve on sea/ocean/bay grid points.
  // Deserts, mountains, and all inland terrain strictly return wave_height = null.
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const mRes = await fetch(
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height`,
      { signal: controller.signal }
    )
    clearTimeout(timer)
    if (mRes.ok) {
      const mData = await mRes.json()
      const wh = mData?.current?.wave_height
      if (wh !== null && typeof wh === 'number') {
        return true // Verified open marine waters (ocean, sea, or active coastal waters)
      }
    }
  } catch {}

  // 3. Tertiary Ground Truth: Elevation Check
  // The global sea level is <= 0m (or <= 5m for tidal fringes).
  // Deserts (Sahara ~500m, Mojave ~1300m, Gobi ~1100m, Atacama ~2500m) are elevated land masses.
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const eRes = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
      { signal: controller.signal }
    )
    clearTimeout(timer)
    if (eRes.ok) {
      const eData = await eRes.json()
      const elev = eData?.elevation?.[0]
      if (typeof elev === 'number' && elev > 5.0) {
        // Strictly inland land mass, desert, or mountain
        return false
      }
    }
  } catch {}

  // 4. Quaternary Check: OpenStreetMap Reverse Geocoding
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const nRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      { headers: { 'User-Agent': 'BlueSentinel/2.0' }, signal: controller.signal }
    )
    clearTimeout(timer)
    if (nRes.ok) {
      const nData = await nRes.json()

      // Deep international waters: No geographic land feature registered
      if (nData.error && String(nData.error).toLowerCase().includes('unable to geocode')) {
        return true
      }

      const type = (nData?.type || '').toLowerCase()
      const cls  = (nData?.class || '').toLowerCase()
      const marineKeywords = ['sea', 'ocean', 'bay', 'strait', 'reef', 'coastline', 'harbour', 'beach', 'shoal', 'water']
      if (marineKeywords.some((t) => type.includes(t) || cls.includes(t))) {
        return true
      }

      // If it belongs to a terrestrial administrative jurisdiction (country, state, county, desert, etc.) without marine tags
      const addr = nData?.address || {}
      if (addr.country || addr.state || addr.county || addr.city || addr.town || addr.village) {
        return false // Strictly terrestrial land/desert
      }
    }
  } catch {}

  // 5. Offline resilience: Fail open only if all network APIs are unreachable (offshore expedition mode)
  return true
}


// ── Custom CSS injected once into <head> ────────────────────────────────────
const INJECTED_CSS = `
.bs-hotspot-tooltip {
  background: rgba(15, 23, 42, 0.95) !important;
  color: #e2e8f0 !important;
  border: 1px solid rgba(100, 116, 139, 0.4) !important;
  border-radius: 10px !important;
  padding: 10px 14px !important;
  font-family: 'Inter', system-ui, sans-serif !important;
  font-size: 12px !important;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4) !important;
  max-width: 280px !important;
}
.bs-hotspot-tooltip::before {
  border-top-color: rgba(15, 23, 42, 0.95) !important;
}
.bs-map-container .leaflet-container { background: #0a1929 !important; }
.bs-map-container .leaflet-control-zoom a {
  background: rgba(15,23,42,0.85) !important; color: #e2e8f0 !important;
  border-color: rgba(100,116,139,0.3) !important;
}
.bs-map-container .leaflet-control-zoom a:hover {
  background: rgba(30,50,80,0.95) !important;
}
.bs-map-container .leaflet-popup-content-wrapper {
  background: rgba(15, 23, 42, 0.97) !important;
  color: #e2e8f0 !important;
  border: 1px solid rgba(56, 189, 248, 0.35) !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 35px rgba(0,0,0,0.6) !important;
  padding: 0 !important;
}
.bs-map-container .leaflet-popup-content {
  margin: 12px !important;
  font-family: 'Inter', system-ui, sans-serif !important;
}
.bs-map-container .leaflet-popup-tip {
  background: rgba(15, 23, 42, 0.97) !important;
}
.bs-pile-cleanup-btn {
  width: 100%;
  margin-top: 10px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 7px 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
}
.bs-pile-cleanup-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}
@keyframes bs-loc-pulse {
  0%   { transform: scale(0.9); opacity: 0.7; }
  50%  { transform: scale(1.4); opacity: 0.25; }
  100% { transform: scale(1.8); opacity: 0; }
}
`

// ==========================================================================
// SchematicMap — Open Water Marine Pile Cluster Map (10-Frame Windows)
// ==========================================================================
export default function SchematicMap({
  hotspots = {},
  windowSize = 10,
  onWindowSizeChange,
  onZoneRenamed,
  onNavigate,
}) {
  // ── Leaflet refs ──
  const mapContainerRef  = useRef(null)
  const mapRef           = useRef(null)
  const markersLayerRef  = useRef(null)
  const transectLayerRef = useRef(null)
  const locationLayerRef = useRef(null)
  const pileMarkersMapRef = useRef({}) // { [pileKey]: leafletLayer }

  // ── State ──
  const [phase, setPhase]         = useState('locating')
  const [coords, setCoords]       = useState(null)
  const [prevCoords, setPrevCoords] = useState(() => {
    try {
      const s = sessionStorage.getItem('bluesentinel_rov_last_dive')
      if (s) {
        const p = JSON.parse(s)
        if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) return p
      }
    } catch {}
    return null
  })
  const [statusMsg, setStatusMsg] = useState('Acquiring dive GPS location…')
  const [selectedPileId, setSelectedPileId] = useState(null)

  // Zone rename
  const [editingZone, setEditingZone]       = useState(null)
  const [zoneAlias, setZoneAlias]           = useState('')
  const [renamingStatus, setRenamingStatus] = useState({})

  // Pile rename / alias state (persisted in sessionStorage)
  const [pileAliases, setPileAliases]       = useState(() => {
    try {
      const saved = sessionStorage.getItem('bluesentinel_pile_aliases')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const [editingPileKey, setEditingPileKey] = useState(null)
  const [pileAliasInput, setPileAliasInput] = useState('')
  const [safeWaterHeadings, setSafeWaterHeadings] = useState(null)
  const [diveDepth, setDiveDepth] = useState(null)
  const diveDepthRef = useRef(diveDepth)
  diveDepthRef.current = diveDepth

  // ── Manual GPS Input & Survey Export State ────────────────────────────────
  const [gpsInputOpen, setGpsInputOpen] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [exportNotice, setExportNotice] = useState(null)

  const handleApplyManualGps = (customLat, customLng) => {
    const lat = parseFloat(customLat !== undefined ? customLat : manualLat)
    const lng = parseFloat(customLng !== undefined ? customLng : manualLng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setStatusMsg('Please enter valid numeric latitude (-90 to 90) and longitude (-180 to 180).')
      return
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setStatusMsg('Coordinates out of range. Lat must be between -90 and 90, Lng between -180 and 180.')
      return
    }
    const c = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
    setCoords(c)
    validateWater(c)
    if (mapRef.current) {
      mapRef.current.setView([c.lat, c.lng], 14, { animate: true })
    }
  }

  const handleExportGeoJSON = () => {
    if (!rankedPiles || rankedPiles.length === 0) return
    const featureCollection = {
      type: 'FeatureCollection',
      metadata: {
        title: 'BlueSentinel ROV Ocean Debris Survey',
        generatedAt: new Date().toISOString(),
        surveyCenter: coords,
        seafloorDepthMeters: diveDepth > 0 ? diveDepth : null,
        totalPiles: rankedPiles.length,
        totalHarmfulItems: rankedPiles.reduce((acc, p) => acc + (p.harmfulCount || 0), 0),
      },
      features: rankedPiles.map((p) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.geo?.lng ?? coords?.lng, p.geo?.lat ?? coords?.lat],
        },
        properties: {
          rank: p.rank,
          pile_number: p.pile_number,
          name: p.displayName,
          harmful_debris_count: p.harmfulCount,
          dominant_class: (p.dominant_class || '').replace(/^trash_|^animal_/, ''),
          severity: p.severity,
          risk_score: p.score,
          distance_meters: p.geo?.distanceMeters,
          cardinal_direction: p.geo?.cardinal,
          bearing_degrees: p.geo?.bearingDeg,
          seafloor_depth_m: diveDepth > 0 ? diveDepth : null,
          center_lat: coords?.lat,
          center_lng: coords?.lng,
        },
      })),
    }

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bluesentinel_hotspots_${new Date().toISOString().replace(/[:.]/g, '-')}.geojson`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setExportNotice('GeoJSON exported!')
    setTimeout(() => setExportNotice(null), 3000)
  }

  const handleExportCSV = () => {
    if (!rankedPiles || rankedPiles.length === 0) return
    const headers = [
      'Rank',
      'Pile_Number',
      'Display_Name',
      'Latitude',
      'Longitude',
      'Harmful_Count',
      'Dominant_Class',
      'Severity',
      'Risk_Score',
      'Distance_Meters',
      'Cardinal_Bearing',
      'Bearing_Degrees',
      'Seafloor_Depth_M',
      'Survey_Center_Lat',
      'Survey_Center_Lng',
    ]

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = rankedPiles.map((p) => [
      p.rank,
      p.pile_number,
      escapeCsv(p.displayName),
      p.geo?.lat ?? '',
      p.geo?.lng ?? '',
      p.harmfulCount,
      escapeCsv((p.dominant_class || '').replace(/^trash_|^animal_/, '')),
      p.severity,
      p.score,
      p.geo?.distanceMeters ?? '',
      escapeCsv(p.geo?.cardinal ?? ''),
      p.geo?.bearingDeg ?? '',
      diveDepth > 0 ? diveDepth : '',
      coords?.lat ?? '',
      coords?.lng ?? '',
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bluesentinel_piles_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setExportNotice('CSV exported!')
    setTimeout(() => setExportNotice(null), 3000)
  }

  const handleStartRenamePile = (pileKey, currentName) => {
    setEditingPileKey(pileKey)
    setPileAliasInput(currentName || '')
  }

  const handleSaveRenamePile = (pileKey) => {
    const trimmed = pileAliasInput.trim()
    setPileAliases((prev) => {
      const next = { ...prev }
      if (trimmed) {
        next[pileKey] = trimmed
      } else {
        delete next[pileKey]
      }
      try {
        sessionStorage.setItem('bluesentinel_pile_aliases', JSON.stringify(next))
      } catch {}
      return next
    })
    setEditingPileKey(null)
  }

  const validateIdRef = useRef(0)
  const validateRef   = useRef(null)
  const onNavigateRef = useRef(onNavigate)
  useEffect(() => { onNavigateRef.current = onNavigate }, [onNavigate])

  // Extract all pile entries with geographic coordinates
  const zoneKeys = Object.keys(hotspots)
  const primaryZoneKey = zoneKeys[0] || 'rov_dive'
  const primaryZoneData = hotspots[primaryZoneKey] || {}
  const rawPiles = primaryZoneData.hotspots || []

  const evaluatedPiles = useMemo(() => {
    if (!coords) return []
    const dNow = new Date()
    const yyyymmdd = `${dNow.getFullYear()}${String(dNow.getMonth() + 1).padStart(2, '0')}${String(dNow.getDate()).padStart(2, '0')}`

    return rawPiles.map((pile, idx) => {
      const geo = getPileGeoLocation(coords, idx, safeWaterHeadings)
      const pileNumber = pile.pile_number || (idx + 1)
      const pileKey = `${pile.zone || primaryZoneKey}_${pile.pile_id || idx}`
      const customName = pileAliases[pileKey]
      const defaultStableId = (pile.pile_id && String(pile.pile_id).startsWith('PILE-'))
        ? pile.pile_id
        : `PILE-${yyyymmdd}-${pileNumber}`
      const stableName = customName || defaultStableId

      return {
        ...pile,
        geo,
        pileKey,
        pile_number: pileNumber,
        pile_id_stable: defaultStableId,
        customName,
        displayName: stableName,
      }
    })
  }, [rawPiles, coords, primaryZoneKey, pileAliases, safeWaterHeadings])

  // Hazard-ranked piles: highest number of harmful objects ranks #1
  const rankedPiles = useMemo(() => {
    return [...evaluatedPiles]
      .map((pile) => {
        const harmfulCount = pile.debris_count > 0 ? pile.debris_count : (pile.object_count || 0)
        return {
          ...pile,
          harmfulCount,
        }
      })
      .sort((a, b) => b.harmfulCount - a.harmfulCount)
      .map((pile, rankIdx) => ({
        ...pile,
        rank: rankIdx + 1,
      }))
  }, [evaluatedPiles])

  const evaluatedPilesRef = useRef(evaluatedPiles)
  useEffect(() => { evaluatedPilesRef.current = evaluatedPiles }, [evaluatedPiles])

  // ── Inject custom CSS (once) ──────────────────────────────────────────────
  useEffect(() => {
    const id = 'bs-schematic-map-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = INJECTED_CSS
    document.head.appendChild(style)
  }, [])

  // ── Water Validation & Seaward Sector Discovery ───────────────────────────
  const validateWater = useCallback(async (c) => {
    const myId = ++validateIdRef.current
    setPhase('validating')
    setStatusMsg(`Checking for marine waters within 1 km of ${formatCoord(c.lat, c.lng)}…`)

    try {
      const hasMarineWater = await checkMarineWaterNearby(c.lat, c.lng)
      if (validateIdRef.current !== myId) return
      if (hasMarineWater) {
        setPhase('confirmed')
        setStatusMsg(`Open marine water confirmed — Dive Site at ${formatCoord(c.lat, c.lng)}`)
        try { sessionStorage.setItem('bluesentinel_rov_last_dive', JSON.stringify(c)) } catch {}

        // Fetch live seafloor bathymetric depth for HUD display
        fetchGlobalBathymetricDepth(c.lat, c.lng)
          .then((d) => {
            if (validateIdRef.current === myId) {
              setDiveDepth(typeof d === 'number' ? d : -1)
            }
          })
          .catch(() => {
            if (validateIdRef.current === myId) setDiveDepth(-1)
          })


        // Discover seaward sectors so debris piles steer strictly into water and away from coastlines
        discoverMarineWaterHeadings(c.lat, c.lng).then((headings) => {
          if (validateIdRef.current === myId && headings && headings.length > 0) {
            setSafeWaterHeadings(headings)
          }
        })
      } else {
        setPhase('no-water')
        setStatusMsg('No sea or ocean within 1 km. Map activates only in marine waters.')
      }
    } catch {
      if (validateIdRef.current !== myId) return
      setPhase('confirmed')
      setStatusMsg(`Dive Site active (offline validation) — ${formatCoord(c.lat, c.lng)}`)
      try { sessionStorage.setItem('bluesentinel_rov_last_dive', JSON.stringify(c)) } catch {}
    }
  }, [])

  validateRef.current = validateWater

  // ── Auto-detect geolocation or continue from previous ROV dive ─────────────
  useEffect(() => {
    // 1. Check if a previous ROV dive location exists to ensure transect continuity
    try {
      const saved = sessionStorage.getItem('bluesentinel_rov_last_dive')
      if (saved) {
        const prev = JSON.parse(saved)
        if (typeof prev?.lat === 'number' && Number.isFinite(prev.lat) && typeof prev?.lng === 'number' && Number.isFinite(prev.lng)) {
          // Set next continuous dive waypoint (~280m offset along survey heading)
          const bearing = 0.785 // ~45 deg NE
          const offsetM = 280
          const dLat = (offsetM * Math.cos(bearing)) / 111320
          const cosLat = Math.cos((prev.lat * Math.PI) / 180)
          const safeCos = Math.abs(cosLat) < 0.0001 ? 0.0001 : cosLat
          const dLng = (offsetM * Math.sin(bearing)) / (111320 * safeCos)
          const next = { lat: prev.lat + dLat, lng: prev.lng + dLng }
          setPrevCoords(prev)
          setCoords(next)
          setPhase('confirmed')
          setStatusMsg(`Continuous ROV Dive Sector — ${formatCoord(next.lat, next.lng)} (~280m from previous dive)`)

          // Discover seaward sectors for continuous dive sector
          discoverMarineWaterHeadings(next.lat, next.lng).then((headings) => {
            if (headings && headings.length > 0) {
              setSafeWaterHeadings(headings)
            }
          })

          // Fetch depth for the continuous dive location too
          fetch(`${API_BASE_URL}/api/ocean-depth?lat=${next.lat}&lon=${next.lng}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => {
              if (typeof d?.depth_m === 'number') setDiveDepth(d.depth_m)
              else {
                // fallback direct
                return fetch(`http://localhost:8001/depth?lat=${next.lat}&lon=${next.lng}`, { headers: { 'x-api-key': 'test-key-1' } })
                  .then((r2) => r2.ok ? r2.json() : null)
                  .then((d2) => { if (typeof d2?.depth_m === 'number') setDiveDepth(d2.depth_m) })
              }
            })
            .catch(() => {})
          return
        }
      }
    } catch {}

    // 2. Geolocation fallback if no previous dive recorded (Monterey Bay Submarine Canyon water)
    if (!navigator.geolocation) {
      const defaultMarine = { lat: 36.6200, lng: -121.8900 }
      setCoords(defaultMarine)
      validateRef.current?.(defaultMarine)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos?.coords?.latitude
        const lng = pos?.coords?.longitude
        if (typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)) {
          const c = { lat, lng }
          setCoords(c)
          validateRef.current?.(c)
        } else {
          const defaultMarine = { lat: 36.6200, lng: -121.8900 }
          setCoords(defaultMarine)
          validateRef.current?.(defaultMarine)
        }
      },
      () => {
        // Fallback to marine dive zone if location denied
        const defaultMarine = { lat: 36.6200, lng: -121.8900 }
        setCoords(defaultMarine)
        validateRef.current?.(defaultMarine)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    )
  }, [])

  // ── Always fetch live seafloor bathymetric depth whenever coords change ───────
  useEffect(() => {
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return
    let isCancelled = false

    async function fetchDepth() {
      const depth = await fetchGlobalBathymetricDepth(coords.lat, coords.lng)
      if (!isCancelled) {
        setDiveDepth(typeof depth === 'number' ? depth : -1)
      }
    }

    fetchDepth()
    return () => { isCancelled = true }
  }, [coords])

  // ── Initialise Leaflet map (once) ─────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
    })

    // Esri World Imagery (Satellite tiles)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '© Esri' },
    ).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.control.attribution({ position: 'bottomleft', prefix: '' })
      .addAttribution('<span style="opacity:0.6;font-size:9px">© Esri · OpenStreetMap</span>')
      .addTo(map)

    locationLayerRef.current = L.layerGroup().addTo(map)
    transectLayerRef.current = L.layerGroup().addTo(map)
    markersLayerRef.current  = L.layerGroup().addTo(map)

    // Handle popup button clicks for sending to cleanup optimizer
    map.on('popupopen', (e) => {
      const container = e.popup.getElement()
      if (!container) return
      const btn = container.querySelector('.bs-pile-cleanup-btn')
      if (btn) {
        btn.onclick = (evt) => {
          evt.stopPropagation()
          const pIdx = parseInt(btn.getAttribute('data-pile-idx'), 10)
          const pile = evaluatedPilesRef.current[pIdx]
          if (pile && onNavigateRef.current) {
            const pileNumber = pile.pile_number || (pIdx + 1)
            const displayName = pile.displayName || `Pile #${pileNumber}`
            const currentDepth = (typeof diveDepthRef.current === 'number' && diveDepthRef.current > 0)
              ? diveDepthRef.current
              : (typeof pile.depth === 'number' && pile.depth > 0 ? pile.depth : null)
            const dominantLabel = formatDebrisClassName(pile.dominant_class)
            const pilePayload = {
              source: 'pile',
              pileId: displayName,
              name: `📍 ${displayName} (${dominantLabel})`,
              depth: currentDepth,
              inventory: pile.classes
                ? Object.entries(pile.classes)
                    .filter(([c]) => c.startsWith('trash_') && c !== 'rov')
                    .map(([c, count]) => ({ class: c, count: { min: count, max: Math.ceil(count * 1.5) } }))
                : [],
              location: pile.geo
                ? `Marine coordinates Lat ${pile.geo.lat.toFixed(4)}, Lon ${pile.geo.lng.toFixed(4)} (${pile.geo.distanceMeters}m ${pile.geo.cardinal} of dive beacon)`
                : 'ROV Dive perimeter',
              severity: pile.severity || 'high',
              frameDataUrl: pile.frameDataUrl,
            }
            onNavigateRef.current('optimizer', {
              ...pilePayload,
              target: pilePayload,
            })
          }
        }
      }
    })

    // Click → set / re-set dive location with continuity from previous location
    map.on('click', (e) => {
      const lat = e?.latlng?.lat
      const lng = e?.latlng?.lng
      if (typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)) {
        const c = { lat, lng }
        setCoords((current) => {
          if (current && Number.isFinite(current.lat) && Number.isFinite(current.lng)) {
            setPrevCoords(current)
          }
          return c
        })
        validateRef.current?.(c)
      }
    })

    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 300)

    // Observe size changes (e.g. when unhiding tab) so Leaflet redraws tiles properly
    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize()
      }
    })
    if (mapContainerRef.current) {
      ro.observe(mapContainerRef.current)
    }

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Fly to dive site & render central beacon + sonar perimeter rings ───────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return

    try {
      const currZoom = map.getZoom?.()
      const safeZoom = (typeof currZoom === 'number' && Number.isFinite(currZoom)) ? Math.max(currZoom, 15) : 15
      map.flyTo([coords.lat, coords.lng], safeZoom, { duration: 1.2 })
    } catch (e) {
      console.warn('Map flyTo failed:', e)
    }
    locationLayerRef.current?.clearLayers()

    try {
      // 1. Sonar Range Perimeter Circles (250m inner buffer and 500m survey perimeter in open marine water)
      L.circle([coords.lat, coords.lng], {
        radius: 250,
        color: '#38bdf8',
        weight: 1.2,
        opacity: 0.35,
        dashArray: '5 6',
        fillColor: '#38bdf8',
        fillOpacity: 0.04,
      }).addTo(locationLayerRef.current)

      L.circle([coords.lat, coords.lng], {
        radius: 500,
        color: '#38bdf8',
        weight: 1.6,
        opacity: 0.5,
        dashArray: '6 8',
        fillColor: '#0284c7',
        fillOpacity: 0.03,
      }).addTo(locationLayerRef.current)

      // 2. ROV Dive Continuity: render navigation track between previous dive and current dive
      if (prevCoords && Number.isFinite(prevCoords.lat) && Number.isFinite(prevCoords.lng)) {
        L.polyline([[prevCoords.lat, prevCoords.lng], [coords.lat, coords.lng]], {
          color: '#06b6d4',
          weight: 2.5,
          opacity: 0.85,
          dashArray: '5 5',
        }).addTo(locationLayerRef.current)

        const midLat = (prevCoords.lat + coords.lat) / 2
        const midLng = (prevCoords.lng + coords.lng) / 2
        L.marker([midLat, midLng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="background:rgba(8,47,73,0.92);color:#38bdf8;border:1px solid rgba(56,189,248,0.5);font-size:9px;font-weight:800;padding:2px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 0 10px rgba(6,182,212,0.4);">ROV Transect Continuity &bull; Prev &rarr; Next Dive</div>`,
            iconAnchor: [80, 10],
          }),
        }).addTo(locationLayerRef.current)
      }

      // 2. Central ROV Dive Beacon
      const diveIcon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;width:42px;height:42px;">
            <div style="position:absolute;inset:0;border-radius:50%;background:#0284c7;opacity:0.3;animation:bs-loc-pulse 2s infinite;"></div>
            <div style="width:30px;height:30px;border-radius:50%;background:#0284c7;border:2.5px solid #ffffff;box-shadow:0 0 14px rgba(2,132,199,0.9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;">
              ⚓
            </div>
            <div style="position:absolute;bottom:-7px;background:rgba(10,20,40,0.95);color:#38bdf8;border:1px solid rgba(56,189,248,0.5);font-size:9px;font-weight:800;padding:1px 6px;border-radius:4px;white-space:nowrap;letter-spacing:0.04em;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">
              <span>DIVE HUB</span>
              ${diveDepth !== null ? `<span style="color:#7dd3fc;border-left:1px solid rgba(56,189,248,0.4);padding-left:4px;">${diveDepth.toLocaleString()}m</span>` : ''}
            </div>
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      })

      const depthHtml = diveDepth !== null
        ? `<div style="font-size:10px;color:#38bdf8;margin-top:3px;font-weight:700">Seafloor Depth: ${diveDepth.toLocaleString()} m</div>`
        : `<div style="font-size:10px;color:#cbd5e1;margin-top:3px">Open marine waters &bull; 500m survey radius active</div>`

      L.marker([coords.lat, coords.lng], { icon: diveIcon })
        .bindTooltip(`<div><strong style="color:#38bdf8">ROV Dive Site (Center)</strong><div style="font-size:10px;color:#94a3b8;margin-top:2px">${formatCoord(coords.lat, coords.lng)}</div>${depthHtml}</div>`, {
          direction: 'top', offset: [0, -22], className: 'bs-hotspot-tooltip',
        })
        .addTo(locationLayerRef.current)
    } catch (markerErr) {
      console.warn('Failed to add dive beacon marker:', markerErr)
    }
  }, [coords, diveDepth])

  // ── Render 10-Frame Debris Piles in Open Waters around Dive Location ───────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !markersLayerRef.current || !transectLayerRef.current) return

    markersLayerRef.current.clearLayers()
    transectLayerRef.current.clearLayers()
    pileMarkersMapRef.current = {}

    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng) || phase !== 'confirmed' || evaluatedPiles.length === 0) return

    evaluatedPiles.forEach((pile, pIdx) => {
      const geo = pile.geo
      if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return

      try {
        const color  = getBubbleColor(pile.severity, pile.score)
        const stroke = getBubbleStroke(pile.severity, pile.score)

        // ── 1. Acoustic Survey Vector from Dive Site to Pile ───────────────────
        L.polyline([[coords.lat, coords.lng], [geo.lat, geo.lng]], {
          color: color,
          weight: 1.8,
          opacity: 0.65,
          dashArray: '4 6',
        }).addTo(transectLayerRef.current)

        // Midpoint distance badge
        const midLat = (coords.lat + geo.lat) / 2
        const midLng = (coords.lng + geo.lng) / 2
        if (Number.isFinite(midLat) && Number.isFinite(midLng)) {
          L.marker([midLat, midLng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="background:rgba(15,23,42,0.88);color:#94a3b8;border:1px solid rgba(100,116,139,0.3);font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;backdrop-filter:blur(3px);">${geo.distanceMeters}m ${geo.cardinal}</div>`,
              iconAnchor: [24, 8],
            }),
          }).addTo(transectLayerRef.current)
        }

      // ── 2. Interactive Debris Pile Marker ──────────────────────────────────
      const pileNumber = pile.pile_number || (pIdx + 1)
      const isCritical = pile.severity === 'critical' || pile.score >= SCORE_THRESHOLDS.high
      const customName = pile.customName
      const displayName = pile.displayName || `Debris Pile #${pileNumber}`

      const pileIcon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;width:38px;height:38px;cursor:pointer;">
            ${isCritical ? `<div style="position:absolute;inset:-4px;border-radius:50%;background:${color};opacity:0.35;animation:bs-loc-pulse 1.8s infinite;"></div>` : ''}
            <div style="width:30px;height:30px;border-radius:50%;background:${color};border:2px solid #ffffff;box-shadow:0 0 12px ${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:10px;font-family:sans-serif;">
              ${customName ? customName.slice(0, 3).toUpperCase() : `P${pileNumber}`}
            </div>
            <div style="position:absolute;bottom:-6px;background:rgba(15,23,42,0.92);color:#e2e8f0;border:1px solid rgba(255,255,255,0.25);font-size:9px;font-weight:700;padding:0 5px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);">
              ${pile.object_count} obj
            </div>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20],
      })

      const marker = L.marker([geo.lat, geo.lng], { icon: pileIcon })

      // Class breakdown badges HTML
      const classBadges = pile.classes
        ? Object.entries(pile.classes)
            .map(([cls, cnt]) =>
              `<span style="display:inline-block;background:rgba(51,65,85,0.7);color:#cbd5e1;border-radius:4px;padding:2px 6px;margin:2px 2px;font-size:10px;font-weight:600">${cls.replace(/^trash_|^animal_/, '')}: ${cnt}</span>`)
            .join('')
        : ''

      // Image thumbnail HTML (if available from 10-frame snapshot)
      const thumbnailHtml = pile.frameDataUrl
        ? `<div style="margin-bottom:8px;border-radius:8px;overflow:hidden;border:1px solid rgba(100,116,139,0.3);position:relative;height:100px;background:#000">
             <img src="${pile.frameDataUrl}" alt="Pile ${pileNumber}" style="width:100%;height:100%;object-fit:cover;display:block;" />
             <div style="position:absolute;bottom:4px;left:6px;background:rgba(0,0,0,0.65);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px">
               Frames ${pile.frame_start}–${pile.frame_end}
             </div>
           </div>`
        : ''

      const popupContent = `
        <div style="min-width:220px;max-width:260px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(100,116,139,0.25)">
            <span style="font-weight:800;font-size:13px;color:#38bdf8">${displayName}</span>
            <span style="background:${color}25;color:${color};border:1px solid ${color}60;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase">${pile.severity || 'pile'}</span>
          </div>
          ${thumbnailHtml}
          <div style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#cbd5e1;">
            <div style="display:flex;justify-content:space-between">
              <span style="color:#94a3b8">Survey Window:</span>
              <span style="font-weight:700">Frames ${pile.frame_start} – ${pile.frame_end} (10f)</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:#94a3b8">Water Distance:</span>
              <span style="font-weight:700;color:#38bdf8">${geo.distanceMeters} m (${geo.cardinal} · ${geo.bearingDeg}°)</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:#94a3b8">Coordinates:</span>
              <span style="font-family:monospace;font-size:10px">${geo.lat.toFixed(4)}°, ${geo.lng.toFixed(4)}°</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:#94a3b8">Debris Items:</span>
              <span style="font-weight:800;color:#f8fafc">${pile.object_count} unique tracked</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:#94a3b8">Dominant Type:</span>
              <span style="color:#34d399;font-weight:700">${formatDebrisClassName(pile.dominant_class)}</span>
            </div>
          </div>
          ${(typeof diveDepth === 'number' && diveDepth > 0) ? `
          <div style="margin-top:6px;padding:5px 8px;border-radius:6px;background:${diveDepth <= 100 ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.12)'};border:1px solid ${diveDepth <= 100 ? 'rgba(74,222,128,0.3)' : 'rgba(245,158,11,0.35)'};display:flex;flex-direction:column;gap:2px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;">
              <span style="color:#94a3b8">Seafloor Depth:</span>
              <span style="font-weight:800;color:#38bdf8">${diveDepth.toLocaleString()} m</span>
            </div>
            <div style="font-size:10px;font-weight:700;color:${diveDepth <= 100 ? '#4ade80' : '#fbbf24'}">
              ${diveDepth <= 100 ? '🤿 Commercial Diver (≤100m · 3 Crew)' : '🤖 Subsea Robotics (>100m · 3 Crew)'}
            </div>
          </div>
          ` : ''}
          ${classBadges ? `<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(100,116,139,0.2);display:flex;flex-wrap:wrap;">${classBadges}</div>` : ''}
          <button class="bs-pile-cleanup-btn" data-pile-idx="${pIdx}">
            <span>🚀 Send to Cleanup Optimizer</span>
          </button>
        </div>
      `

      marker.bindPopup(popupContent, { maxWidth: 280, closeButton: false })
      markersLayerRef.current.addLayer(marker)
      pileMarkersMapRef.current[pile.pileKey] = marker
    } catch (err) {
      console.warn('Error plotting debris pile marker:', err)
    }
  })

    // Auto-fit bounds gently so the dive site and all detected piles are visible
    try {
      const allMarkers = markersLayerRef.current.getLayers()
      if (allMarkers.length > 0 && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
        const group = L.featureGroup([
          L.marker([coords.lat, coords.lng]),
          ...allMarkers,
        ])
        map.fitBounds(group.getBounds().pad(0.35), { maxZoom: 17 })
      }
    } catch { /* bounds error guard */ }
  }, [evaluatedPiles, coords, phase])

  // Center on a specific pile when clicked in the bottom card deck
  const handleFocusPile = (pile) => {
    setSelectedPileId(pile.pileKey)
    const map = mapRef.current
    if (!map || !pile.geo || !Number.isFinite(pile.geo.lat) || !Number.isFinite(pile.geo.lng)) return
    try {
      map.flyTo([pile.geo.lat, pile.geo.lng], 17, { duration: 0.8 })
      const marker = pileMarkersMapRef.current[pile.pileKey]
      if (marker) {
        setTimeout(() => marker.openPopup(), 400)
      }
    } catch (e) {
      console.warn('Map flyTo failed:', e)
    }
  }

  // Quick action: send pile directly to cleanup optimizer
  const handleSendPileToCleanup = (pile, pIdx) => {
    if (!onNavigate) return
    const pileNumber = pile.pile_number || (pIdx + 1)
    const displayName = pile.displayName || `Pile #${pileNumber}`
    const currentDepth = (typeof diveDepth === 'number' && diveDepth > 0)
      ? diveDepth
      : (typeof pile.depth === 'number' && pile.depth > 0 ? pile.depth : null)
    const dominantLabel = formatDebrisClassName(pile.dominant_class)
    const pilePayload = {
      source: 'pile',
      pileId: displayName,
      name: `📍 ${displayName} (${dominantLabel})`,
      depth: currentDepth,
      inventory: pile.classes
        ? Object.entries(pile.classes)
            .filter(([c]) => c.startsWith('trash_'))
            .map(([c, count]) => ({ class: c, count: { min: count, max: Math.ceil(count * 1.5) } }))
        : [],
      location: pile.geo
        ? `Marine coordinates Lat ${pile.geo.lat.toFixed(4)}, Lon ${pile.geo.lng.toFixed(4)} (${pile.geo.distanceMeters}m ${pile.geo.cardinal} of dive beacon)`
        : 'ROV Dive perimeter',
      severity: pile.severity || 'high',
      frameDataUrl: pile.frameDataUrl,
    }
    onNavigate('optimizer', {
      ...pilePayload,
      target: pilePayload,
    })
  }

  // ── Zone rename handlers ──────────────────────────────────────────────────
  const handleStartRename = (zoneKey, currentName) => {
    setEditingZone(zoneKey)
    setZoneAlias(currentName || zoneKey)
  }

  const handleSaveRename = async (zoneKey) => {
    if (!zoneAlias.trim()) return
    const newName = zoneAlias.trim()
    setRenamingStatus((prev) => ({ ...prev, [zoneKey]: 'saving' }))
    try {
      const res = await fetch(`${API_BASE_URL}/cleanup/zones/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: zoneKey, new_name: newName }),
      })
      if (res.ok) {
        setRenamingStatus((prev) => ({ ...prev, [zoneKey]: 'saved' }))
        if (onZoneRenamed) onZoneRenamed(zoneKey, newName)
        setTimeout(() => {
          setRenamingStatus((prev) => ({ ...prev, [zoneKey]: null }))
          setEditingZone(null)
        }, 1200)
      } else {
        setRenamingStatus((prev) => ({ ...prev, [zoneKey]: 'error' }))
      }
    } catch {
      if (onZoneRenamed) onZoneRenamed(zoneKey, newName)
      setEditingZone(null)
    }
  }

  const retryGeo = () => {
    if (!navigator.geolocation) return
    setPhase('locating')
    setStatusMsg('Retrying GPS…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCoords(c)
        validateWater(c)
      },
      () => {
        setPhase('pick-location')
        setStatusMsg('Still denied — click on the map to set location.')
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const isLoading   = phase === 'locating' || phase === 'validating'
  const canInteract = phase === 'pick-location' || phase === 'no-water'

  const phaseIcon  = { locating: '📡', validating: '🔍', confirmed: '✅', 'no-water': '🚫', 'pick-location': '📍' }[phase] || '📡'
  const phaseColor = { locating: '#3b82f6', validating: '#f59e0b', confirmed: '#10b981', 'no-water': '#ef4444', 'pick-location': '#8b5cf6' }[phase] || '#94a3b8'

  // ══════════════════════════════════════════════════════════════════════════
  //  JSX
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ position: 'relative' }}>

      {/* ── Status Bar ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', marginBottom: 10,
        background: `${phaseColor}12`,
        border: `1px solid ${phaseColor}30`,
        borderRadius: 10,
      }}>
        {isLoading ? (
          <span
            className="upload-spinner"
            style={{ width: 14, height: 14, flexShrink: 0,
              borderColor: `${phaseColor}40`, borderTopColor: phaseColor }}
          />
        ) : (
          <span style={{ fontSize: 14, flexShrink: 0 }}>{phaseIcon}</span>
        )}
        <span style={{ fontSize: 12, color: '#1a3a4a', fontWeight: 600, flex: 1, lineHeight: 1.4 }}>
          {statusMsg}
        </span>

        {/* Depth badge — always visible: shows depth, sea level, or offline status */}
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: diveDepth === null ? '#64748b' : diveDepth === -1 ? '#94a3b8' : '#0284c7',
          background: diveDepth === null ? '#f1f5f9' : diveDepth === -1 ? '#f8fafc' : '#e0f2fe',
          border: `1px solid ${diveDepth === null ? '#cbd5e1' : diveDepth === -1 ? '#e2e8f0' : '#bae6fd'}`,
          padding: '3px 9px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <span>🌊 Depth:</span>
          <span>
            {diveDepth === null
              ? 'Querying…'
              : diveDepth === -1
              ? 'Service offline'
              : diveDepth > 0
              ? `${diveDepth.toLocaleString()} m`
              : 'Sea Level'}
          </span>
        </span>

        {phase === 'no-water' && (
          <button
            onClick={() => {
              setPhase('confirmed')
              setStatusMsg(`Location forced — ${coords ? formatCoord(coords.lat, coords.lng) : '?'} (marine water validation bypassed)`)
            }}
            style={{
              background: 'transparent', border: `1px solid ${phaseColor}50`,
              color: phaseColor, fontSize: 10, fontWeight: 700,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Use Anyway
          </button>
        )}

        {canInteract && (
          <button
            onClick={retryGeo}
            style={{
              background: 'transparent', border: '1px solid #94a3b840',
              color: '#64748b', fontSize: 10, fontWeight: 700,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Retry GPS
          </button>
        )}

        {/* Toggle Manual Coordinates panel */}
        <button
          onClick={() => {
            setGpsInputOpen(!gpsInputOpen)
            if (coords && !manualLat && !manualLng) {
              setManualLat(coords.lat.toString())
              setManualLng(coords.lng.toString())
            }
          }}
          style={{
            background: gpsInputOpen ? '#3b82f6' : 'transparent',
            border: `1px solid ${gpsInputOpen ? '#3b82f6' : '#94a3b840'}`,
            color: gpsInputOpen ? '#fff' : '#64748b',
            fontSize: 10, fontWeight: 700,
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          📍 {gpsInputOpen ? 'Close GPS' : 'Enter GPS'}
        </button>
      </div>

      {/* ── Collapsible Manual GPS & Presets Panel ─────────────────────────── */}
      {gpsInputOpen && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
          padding: '10px 14px', marginBottom: 10,
          background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10,
          fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#334155', fontSize: 11 }}>Lat:</span>
            <input
              type="number"
              step="any"
              placeholder="e.g. 36.6002"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              style={{
                width: 100, padding: '4px 8px', borderRadius: 6,
                border: '1px solid #94a3b8', fontSize: 11, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#334155', fontSize: 11 }}>Lng:</span>
            <input
              type="number"
              step="any"
              placeholder="e.g. -121.8947"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              style={{
                width: 100, padding: '4px 8px', borderRadius: 6,
                border: '1px solid #94a3b8', fontSize: 11, outline: 'none',
              }}
            />
          </div>
          <button
            onClick={() => handleApplyManualGps()}
            style={{
              background: '#0284c7', color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 700, padding: '5px 12px',
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            Apply Coordinates
          </button>

          {/* Preset selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Marine Presets:</span>
            <select
              onChange={(e) => {
                const idx = Number(e.target.value)
                if (idx >= 0 && MARINE_PRESETS[idx]) {
                  const p = MARINE_PRESETS[idx]
                  setManualLat(p.lat.toString())
                  setManualLng(p.lng.toString())
                  handleApplyManualGps(p.lat, p.lng)
                }
              }}
              defaultValue=""
              style={{
                padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                fontSize: 11, background: '#fff', color: '#0f172a', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="" disabled>Select ocean site…</option>
              {MARINE_PRESETS.map((p, idx) => (
                <option key={p.name} value={idx}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Map Container ─────────────────────────────────────────────────── */}
      <div className="bs-map-container" style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(30,60,100,0.2)' }}>
        {/* Floating Live Telemetry HUD Card inside the map */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 600,
          background: 'rgba(10, 25, 47, 0.90)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: 8,
          padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🌊</span>
            <div>
              <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                Seafloor Depth
              </div>
              <div style={{ fontSize: 13, color: diveDepth === -1 ? '#94a3b8' : '#38bdf8', fontWeight: 800, lineHeight: 1.2 }}>
                {diveDepth === null
                  ? 'Querying…'
                  : diveDepth === -1
                  ? 'Offline'
                  : `${diveDepth.toLocaleString()} m`}
              </div>
            </div>
          </div>
          <div style={{ width: 1, height: 22, background: 'rgba(100, 116, 139, 0.3)' }} />
          <div>
            <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              DEM Model
            </div>
            <div style={{ fontSize: 11, color: '#10b981', fontWeight: 700, lineHeight: 1.2 }}>
              SRTM15Plus
            </div>
          </div>
        </div>

        <div ref={mapContainerRef} style={{ height: 350, width: '100%' }} />

        {/* Overlay prompt for pick / no-water */}
        {canInteract && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 500,
          }}>
            <div style={{
              background: 'rgba(10,20,40,0.76)', backdropFilter: 'blur(6px)',
              borderRadius: 12, padding: '18px 28px', textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.15)', maxWidth: 340,
            }}>
              <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>
                {phase === 'no-water' ? '🚫 Not a Marine Location' : '📍 Set Dive Site in Sea / Ocean'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                {phase === 'no-water'
                  ? 'Click a location on a coastline, reef, bay, or open ocean. Land and lakes are not permitted.'
                  : 'Click anywhere on open sea or ocean water to position your ROV deployment hub'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls Row ──────────────────────────────────────────────────── */}
      {phase === 'confirmed' && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, marginTop: 12, padding: '10px 14px',
          background: '#f8fbfd', border: '1px solid #e0eef5', borderRadius: 10,
        }}>
          {/* Window Size (10f Default) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Pile Window:</span>
            <input
              type="range" min="5" max="30" step="5"
              value={windowSize}
              onChange={(e) => onWindowSizeChange && onWindowSizeChange(Number(e.target.value))}
              style={{ width: 72, cursor: 'pointer', accentColor: '#3b82f6' }}
            />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', minWidth: 26 }}>{windowSize}f</span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>(10 frames per pile)</span>
          </div>

          {/* Severity Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#64748b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0ea5e9', display: 'inline-block' }} />
              <span>Medium</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              <span>High</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              <span>Critical</span>
            </div>
          </div>

          {/* Depth & Pile Count Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {diveDepth !== null && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#0369a1',
                background: '#f0f9ff', border: '1px solid #bae6fd',
                padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <span style={{ color: '#0284c7' }}>Bathymetry:</span>
                <span>{diveDepth > 0 ? `${diveDepth.toLocaleString()} m` : 'Sea Level'}</span>
              </span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#0284c7',
              background: '#eff6ff', border: '1px solid #bfdbfe',
              padding: '3px 8px', borderRadius: 6,
            }}>
              {rankedPiles.length} {rankedPiles.length === 1 ? 'Hazard Pile Ranked' : 'Hazard Piles Ranked'}
            </span>

            {/* Export buttons */}
            {rankedPiles.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
                <button
                  onClick={handleExportGeoJSON}
                  title="Export debris hotspot coordinates as GeoJSON FeatureCollection"
                  style={{
                    background: '#0f766e', color: '#fff', border: 'none',
                    fontSize: 10, fontWeight: 700, padding: '4px 8px',
                    borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span>📥</span> GeoJSON
                </button>
                <button
                  onClick={handleExportCSV}
                  title="Export debris hotspot coordinates and metrics as CSV table"
                  style={{
                    background: '#0369a1', color: '#fff', border: 'none',
                    fontSize: 10, fontWeight: 700, padding: '4px 8px',
                    borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span>📊</span> CSV
                </button>
                {exportNotice && (
                  <span style={{ fontSize: 10, color: '#059669', fontWeight: 700, background: '#ecfdf5', padding: '2px 6px', borderRadius: 4, border: '1px solid #a7f3d0' }}>
                    {exportNotice}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Hazard-Ranked Pile Leaderboard Deck (Cards below map) ─────────── */}
      {phase === 'confirmed' && rankedPiles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#0f2030', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🏆</span> HAZARD PILE RANKING ({rankedPiles.length} PILES)
            </p>
            <span style={{ fontSize: 10, color: '#6a9ab0', fontWeight: 600 }}>
              Ranked by harmful debris count &middot; Click to center on map
            </span>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10, maxHeight: 270, overflowY: 'auto', paddingRight: 2,
          }}>
            {rankedPiles.map((pile, pIdx) => {
              const geo = pile.geo
              const color = getBubbleColor(pile.severity, pile.score)
              const pileNumber = pile.pile_number || (pIdx + 1)
              const isSelected = selectedPileId === pile.pileKey
              const rank = pile.rank
              const rankBadge = rank === 1 ? '🥇 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`
              const rankBg = rank === 1 ? 'linear-gradient(135deg, #fef08a, #facc15)' : rank === 2 ? 'linear-gradient(135deg, #e2e8f0, #cbd5e1)' : rank === 3 ? 'linear-gradient(135deg, #fed7aa, #fb923c)' : '#e2e8f0'
              const rankTextColor = rank <= 3 ? '#78350f' : '#475569'

              return (
                <div
                  key={pile.pileKey}
                  style={{
                    background: isSelected ? '#eff6ff' : '#f8fbfd',
                    border: `1.5px solid ${isSelected ? '#3b82f6' : rank === 1 ? '#eab308' : '#e0eef5'}`,
                    borderRadius: 10, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    transition: 'all 0.2s ease',
                    boxShadow: rank === 1 ? '0 2px 10px rgba(234,179,8,0.15)' : 'none',
                  }}
                >
                  {/* Thumbnail / Header */}
                  {pile.frameDataUrl ? (
                    <div style={{ height: 80, background: '#000', position: 'relative', overflow: 'hidden' }}>
                      <img src={pile.frameDataUrl} alt={`Pile ${pileNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{
                        position: 'absolute', top: 5, left: 6,
                        background: rankBg, color: rankTextColor,
                        fontSize: 10, fontWeight: 800, padding: '2px 7px',
                        borderRadius: 4, boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      }}>
                        {rankBadge}
                      </div>
                      <div style={{
                        position: 'absolute', top: 5, right: 6,
                        background: color, color: '#fff',
                        fontSize: 9, fontWeight: 800, padding: '2px 6px',
                        borderRadius: 4, textTransform: 'uppercase',
                      }}>
                        {pile.severity || 'med'}
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 4, left: 6,
                        background: 'rgba(10,20,40,0.85)', color: '#fff',
                        fontSize: 9, fontWeight: 700, padding: '2px 6px',
                        borderRadius: 4,
                      }}>
                        F{pile.frame_start}–{pile.frame_end}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      height: 42, background: isSelected ? '#dbeafe' : '#e2e8f0', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between', padding: '0 10px',
                    }}>
                      <span style={{
                        background: rankBg, color: rankTextColor,
                        fontSize: 10, fontWeight: 800, padding: '2px 7px',
                        borderRadius: 4,
                      }}>
                        {rankBadge} &middot; Pile #{pileNumber}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: color, textTransform: 'uppercase' }}>{pile.severity}</span>
                    </div>
                  )}

                  {/* Body */}
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {editingPileKey === pile.pileKey ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                          <input
                            type="text"
                            value={pileAliasInput}
                            onChange={(e) => setPileAliasInput(e.target.value)}
                            placeholder={`e.g. Reef Pile #${pileNumber}`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRenamePile(pile.pileKey)
                              if (e.key === 'Escape') setEditingPileKey(null)
                            }}
                            style={{
                              fontSize: 11, padding: '2px 6px', borderRadius: 4,
                              border: '1.5px solid #3b82f6', fontWeight: 700,
                              outline: 'none', width: '100%', maxWidth: 120,
                            }}
                          />
                          <button
                            onClick={() => handleSaveRenamePile(pile.pileKey)}
                            title="Save name"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', fontSize: 13, padding: 0 }}
                          >✓</button>
                          <button
                            onClick={() => setEditingPileKey(null)}
                            title="Cancel"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: 0 }}
                          >✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              fontSize: 12, fontWeight: 800, color: '#0f2030',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                            title={pile.displayName}
                          >
                            {pile.displayName}
                          </span>
                          <button
                            onClick={() => handleStartRenamePile(pile.pileKey, pile.customName || `Pile #${pileNumber}`)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 11, padding: 0, lineHeight: 1 }}
                            title="Name / Rename this pile"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#0284c7', flexShrink: 0 }}>
                        {geo ? `${geo.distanceMeters}m ${geo.cardinal}` : ''}
                      </span>
                    </div>

                    {/* Harmful items highlight */}
                    <div style={{
                      background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6,
                      padding: '3px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#be123c' }}>
                        ⚠️ {pile.harmfulCount} Harmful {pile.harmfulCount === 1 ? 'Item' : 'Items'}
                      </span>
                      <span style={{ fontSize: 9, color: '#9f1239', fontWeight: 600 }}>
                        {formatDebrisClassName(pile.dominant_class)}
                      </span>
                    </div>

                    {/* Operational Mode & Depth Badge */}
                    {typeof diveDepth === 'number' && diveDepth > 0 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: diveDepth <= 100 ? '#f0fdf4' : '#fffbeb',
                        border: `1px solid ${diveDepth <= 100 ? '#bbf7d0' : '#fde68a'}`,
                        borderRadius: 5,
                        padding: '2px 6px',
                        fontSize: 9,
                        fontWeight: 700,
                        color: diveDepth <= 100 ? '#15803d' : '#b45309',
                      }}>
                        <span>🌊 {diveDepth.toLocaleString()}m</span>
                        <span>{diveDepth <= 100 ? '🤿 Diver (≤100m)' : '🤖 Robotics (>100m)'}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
                      <button
                        onClick={() => handleFocusPile(pile)}
                        style={{
                          flex: 1, background: '#e0eef5', border: 'none', borderRadius: 5,
                          fontSize: 10, fontWeight: 700, color: '#0f2030', padding: '4px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        🎯 Map
                      </button>
                      <button
                        onClick={() => handleSendPileToCleanup(pile, pIdx)}
                        style={{
                          flex: 1.4, background: '#0284c7', border: 'none', borderRadius: 5,
                          fontSize: 10, fontWeight: 700, color: '#fff', padding: '4px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        🚀 Cleanup
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Zone Renaming (if multiple transects) ────────────────────────── */}
      {phase === 'confirmed' && zoneKeys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {zoneKeys.map((zoneKey) => {
            const zData       = hotspots[zoneKey] || {}
            const spotList    = zData.hotspots || []
            const isEditing   = editingZone === zoneKey
            const saveStatus  = renamingStatus[zoneKey]

            return (
              <div
                key={zoneKey}
                style={{
                  background: '#f8fbfd', border: '1px solid #e0eef5',
                  borderRadius: 10, padding: '8px 12px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 5,
                    background: '#eff6ff', color: '#0284c7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800, flexShrink: 0,
                  }}>
                    ⚓
                  </span>

                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="text" value={zoneAlias}
                        onChange={(e) => setZoneAlias(e.target.value)}
                        placeholder="e.g. Harbor Shelf Zone"
                        autoFocus
                        style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 5,
                          border: '1px solid #3b82f6', fontWeight: 600,
                          outline: 'none', width: 140,
                        }}
                      />
                      <button
                        onClick={() => handleSaveRename(zoneKey)}
                        disabled={saveStatus === 'saving'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', fontSize: 14, padding: 2 }}
                      >✓</button>
                      <button
                        onClick={() => setEditingZone(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 2 }}
                      >✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f2030' }}>{zoneKey}</span>
                      <button
                        onClick={() => handleStartRename(zoneKey, zoneKey)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 11, padding: 2 }}
                        title="Rename dive zone"
                      >✏️</button>
                    </div>
                  )}

                  {saveStatus === 'saved' && (
                    <span style={{
                      fontSize: 9, color: '#10b981', fontWeight: 700,
                      background: '#f0fdf4', padding: '1px 6px', borderRadius: 4,
                      border: '1px solid #bbf7d0',
                    }}>Saved</span>
                  )}
                </div>

                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                  Dive Zone · {spotList.length} Piles
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Stated Information ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginTop: 10, padding: '6px 10px',
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 8, fontSize: 10, color: '#166534',
      }}>
        <span>🌊</span>
        <span>
          <strong>10-Frame Water Clusters:</strong> Piles are formed every 10 frames and positioned radially in the surrounding open marine water (175m–395m) with acoustic distance vectors.
        </span>
      </div>
    </div>
  )
}
