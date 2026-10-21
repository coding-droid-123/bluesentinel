import React, { useState, useEffect, useCallback, useMemo } from 'react'
import NavBar from './NavBar'
import { API_BASE_URL } from '../config'

// ── Fallback Base Assumptions (Single source of truth: docs/cleanup_assumptions.json) ──
const DEFAULT_CFG = {
  global: {
    shift_hours: 10,
    contingency_pct: 0.20,
    mobilization_base_inr: 15000,
    transit_cost_per_km_inr: 250,
    default_distance_km: 25,
    prefer_robotics_beyond_m: 40,
    hard_max_human_depth_m: 100,
    disposal_inr_per_kg: [8, 30],
    disposal_min_inr: 1500,
  },
  role_rates_inr_per_hr: {
    dive_supervisor: 4500,
    lead_diver: 5000,
    standby_diver: 3800,
    tender: 1800,
    rov_pilot: 4500,
    rov_copilot: 3800,
    rov_engineer: 3200,
  },
  debris_classes: {
    trash_net:       { label: 'Fishing Net',    h: [0.8, 1.5], kg: [5, 40],   tools: ['cutters', 'lift bags'] },
    trash_rope:      { label: 'Rope',           h: [0.3, 0.6], kg: [1, 10],   tools: ['cutters'] },
    trash_tarp:      { label: 'Tarp',           h: [0.4, 0.8], kg: [2, 10],   tools: ['lift bags'] },
    trash_pipe:      { label: 'Pipe',           h: [0.5, 1.0], kg: [10, 60],  tools: ['lift bags'] },
    trash_wreckage:  { label: 'Wreckage',       h: [1.5, 3.0], kg: [50, 500], tools: ['lift bags', 'hydraulic cutting tools'] },
    trash_bag:       { label: 'Plastic Bag',    h: [0.1, 0.2], kg: [0.02, 0.1], tools: ['collection sacks'] },
    trash_bottle:    { label: 'Bottle',         h: [0.05, 0.1], kg: [0.02, 0.1], tools: ['collection sacks'] },
    trash_container: { label: 'Container',      h: [0.3, 0.6], kg: [5, 30],   tools: ['collection sacks'] },
    other_debris:    { label: 'Other Debris',   h: [0.2, 0.4], kg: [0.2, 2],  tools: ['collection sacks'] },
    clothing:        { label: 'Clothing',       h: [0.1, 0.2], kg: [0.2, 1],  tools: ['collection sacks'] },
    unknown:         { label: 'Unknown Debris', h: [0.2, 0.5], kg: [0.5, 5],  tools: ['collection sacks'] },
  },
  no_deco_table_min: [
    [10, 219], [12, 147], [14, 98], [16, 72], [18, 56],
    [20, 45],  [22, 37],  [25, 29], [30, 20], [35, 14], [40, 9]
  ],
  modes: {
    scuba_team: {
      name: 'scuba_team',
      label: 'Scuba Diving Team',
      kind: 'human',
      depth_m: [0, 40],
      roles: ['lead_diver', 'standby_diver', 'tender'],
      bottom_time_h: 'min(table limit, 45 min)',
      working_divers: 2,
      max_rot_per_diver_day: 2,
      descent_m_per_min: 18,
      ascent_m_per_min: 9,
      safety_stop_min: 3,
      deco_h_per_rotation: [[30, 0.0], [40, 0.1]],
      equipment_inr_per_rotation: [1500, 4000],
      spread_inr_per_day: [0, 0],
      vessel_inr_per_day: [5000, 25000],
      gas_inr_per_rotation: [0, 0],
      max_item_kg: 200,
      risk: 'medium',
      verified: { equipment_inr_per_rotation: true, vessel_inr_per_day: true, no_deco_table_min: false },
    },
    surface_supplied_air: {
      name: 'surface_supplied_air',
      label: 'Surface-Supplied Air (SSA)',
      kind: 'human',
      depth_m: [30, 50],
      roles: ['dive_supervisor', 'lead_diver', 'standby_diver', 'tender'],
      bottom_time_h: 0.75,
      working_divers: 1,
      max_rot_per_diver_day: 2,
      descent_m_per_min: 18,
      ascent_m_per_min: 9,
      safety_stop_min: 3,
      deco_h_per_rotation: [[40, 0.1], [50, 0.75]],
      equipment_inr_per_rotation: [0, 0],
      spread_inr_per_day: [40000, 150000],
      vessel_inr_per_day: [40000, 150000],
      gas_inr_per_rotation: [0, 0],
      max_item_kg: 500,
      risk: 'high',
      verified: { depth_m: true },
    },
    mixed_gas_bell: {
      name: 'mixed_gas_bell',
      label: 'Mixed-Gas Bell (Trimix)',
      kind: 'human',
      depth_m: [50, 100],
      roles: ['dive_supervisor', 'lead_diver', 'lead_diver', 'standby_diver', 'tender', 'tender'],
      bottom_time_h: 0.5,
      working_divers: 2,
      max_rot_per_diver_day: 1,
      descent_m_per_min: 18,
      ascent_m_per_min: 9,
      safety_stop_min: 0,
      deco_h_per_rotation: [[75, 2.0], [100, 4.0]],
      equipment_inr_per_rotation: [0, 0],
      spread_inr_per_day: [300000, 1000000],
      vessel_inr_per_day: [300000, 1000000],
      gas_inr_per_rotation: [20000, 60000],
      max_item_kg: 1000,
      risk: 'very_high',
      verified: { depth_m: true },
    },
    compact_rov: {
      name: 'compact_rov',
      label: 'Compact Inspection ROV',
      kind: 'robotics',
      depth_m: [0, 100],
      roles: ['rov_pilot', 'tender'],
      labour_excluded_roles: ['rov_pilot'],
      max_item_kg: 5,
      productive_h_per_day: 6,
      descent_m_per_min: 30,
      spread_inr_per_day: [25000, 75000],
      vessel_inr_per_day: [5000, 25000],
      risk: 'low',
      verified: { depth_m: true, spread_inr_per_day: true, vessel_inr_per_day: true },
    },
    inspection_rov: {
      name: 'inspection_rov',
      label: 'Inspection-Class ROV',
      kind: 'robotics',
      depth_m: [0, 300],
      max_item_kg: 25,
      roles: ['rov_pilot', 'rov_copilot', 'rov_engineer'],
      productive_h_per_day: 8,
      descent_m_per_min: 30,
      spread_inr_per_day: [75000, 200000],
      vessel_inr_per_day: [40000, 150000],
      risk: 'low',
      verified: { depth_m: true },
    },
    light_work_rov: {
      name: 'light_work_rov',
      label: 'Light Work-Class ROV',
      kind: 'robotics',
      depth_m: [0, 1000],
      roles: ['rov_pilot', 'rov_copilot', 'rov_engineer', 'tender'],
      max_item_kg: 100,
      productive_h_per_day: 12,
      descent_m_per_min: 30,
      spread_inr_per_day: [150000, 300000],
      vessel_inr_per_day: [40000, 150000],
      risk: 'low',
      verified: { depth_m: true },
    },
    work_class_rov: {
      name: 'work_class_rov',
      label: 'Heavy Work-Class ROV',
      kind: 'robotics',
      depth_m: [0, 3000],
      max_item_kg: 1000,
      roles: ['rov_pilot', 'rov_pilot', 'rov_copilot', 'rov_copilot', 'rov_engineer', 'rov_engineer'],
      productive_h_per_day: 20,
      descent_m_per_min: 30,
      spread_inr_per_day: [250000, 600000],
      vessel_inr_per_day: [1000000, 4000000],
      risk: 'low',
      verified: { depth_m: true },
    },
  },
}

const CLASS_NORMALIZE = {
  trash_net: 'trash_net',
  trash_rope: 'trash_rope',
  trash_tarp: 'trash_tarp',
  trash_pipe: 'trash_pipe',
  trash_wreckage: 'trash_wreckage',
  trash_bag: 'trash_bag',
  trash_bottle: 'trash_bottle',
  trash_container: 'trash_container',
  clothing: 'clothing',
  trash_clothing: 'clothing',
  other_debris: 'other_debris',
  trash_cup: 'other_debris',
  trash_can: 'other_debris',
  trash_snack_wrapper: 'other_debris',
  trash_branch: 'other_debris',
  trash_unknown_instance: 'unknown',
  unknown: 'unknown',
  default: 'unknown',
}

// ── Math & Interpolation Helpers (Strict ref_model.py logic) ────────────────
function interp(table, x) {
  if (x <= table[0][0]) return table[0][1]
  for (let idx = 0; idx < table.length - 1; idx++) {
    const [x0, y0] = table[idx]
    const [x1, y1] = table[idx + 1]
    if (x0 <= x && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return table[table.length - 1][1]
}

function stepLookup(table, x) {
  for (const [dmax, v] of table) {
    if (x <= dmax) return v
  }
  return table[table.length - 1][1]
}

function isSeedName(name) {
  const n = (name || '').toLowerCase()
  return n.includes('harbor shelf') || n.includes('coral triangle') || n.includes('seagrass bed')
}

// ── Local Simulation Engine (Guarantees instant UI reactive updates & identical results) ──
function runLocalOptimizer(depth, detections, cfg, distKm = 25, depthSource = 'simulated') {
  const g = cfg.global
  const clsDefs = cfg.debris_classes
  const cleanItems = {}

  for (const det of detections || []) {
    if (det.class === 'rov' || det.class === 'plant' || (det.class || '').startsWith('animal_')) continue
    const norm = CLASS_NORMALIZE[det.class] || (clsDefs[det.class] ? det.class : 'unknown')
    const cMin = Number(det.count?.min ?? det.count ?? 1)
    const cMax = Number(det.count?.max ?? det.count ?? Math.ceil(cMin * 1.5))
    if (!cleanItems[norm]) cleanItems[norm] = { min: 0, max: 0 }
    cleanItems[norm].min += Math.max(0, cMin)
    cleanItems[norm].max += Math.max(0, cMax)
  }

  if (Object.keys(cleanItems).length === 0) {
    cleanItems.unknown = { min: 0, max: 0 }
  }

  let hmin = 0, hmax = 0, kmin = 0, kmax = 0, heaviest = 0
  const itemSummary = []

  for (const [k, c] of Object.entries(cleanItems)) {
    const def = clsDefs[k] || clsDefs.unknown
    const subHmin = c.min * def.h[0]
    const subHmax = c.max * def.h[1]
    const subKmin = c.min * def.kg[0]
    const subKmax = c.max * def.kg[1]
    hmin += subHmin
    hmax += subHmax
    kmin += subKmin
    kmax += subKmax
    if (c.max > 0 && def.kg[1] > heaviest) heaviest = def.kg[1]

    itemSummary.push({
      class: k,
      label: def.label || k,
      min: c.min,
      max: c.max,
      subtotalHours: `${subHmin.toFixed(1)}–${subHmax.toFixed(1)} h`,
      subtotalKg: `${subKmin.toFixed(1)}–${subKmax.toFixed(1)} kg`,
      tools: def.tools || ['collection sacks'],
    })
  }

  const warnings = []
  if (depth <= 0) {
    warnings.push('Bathymetry indicates land or elevation >= 0m: operating depth treated as shallow (0m); verify coordinates.')
  }

  if (depth > 3000) {
    warnings.push(`Operating depth of ${depth}m exceeds maximum subsea capability (3000m): out of scope.`)
    return {
      status: 'out_of_scope',
      depth,
      depthSource,
      isOutOfScope: true,
      itemHours: [hmin, hmax],
      debrisKg: [kmin, kmax],
      heaviest,
      modes: [],
      allModesComparison: [],
      recommended: null,
      warnings,
      itemSummary,
    }
  }

  const allModesComparison = []
  const feasibleModes = []

  for (const [name, m] of Object.entries(cfg.modes)) {
    const inDepth = m.depth_m[0] <= depth && depth <= m.depth_m[1]
    const humanDepthAllowed = !(m.kind === 'human' && depth > g.hard_max_human_depth_m)
    const payloadAllowed = heaviest <= m.max_item_kg
    const isFeasible = inDepth && humanDepthAllowed && payloadAllowed

    let excludeReason = null
    if (!inDepth) excludeReason = `Depth ${depth}m exceeds mode range (${m.depth_m[0]}–${m.depth_m[1]}m)`
    else if (!humanDepthAllowed) excludeReason = `Depth ${depth}m exceeds ${g.hard_max_human_depth_m || 100}m operational scope limit for human divers (saturation diving operates deeper; robotics required)`
    else if (!payloadAllowed) excludeReason = `Max item (${heaviest}kg) exceeds mode payload limit (${m.max_item_kg}kg)`

    // Calculate economics
    const crew = m.roles.length
    const labourExcluded = m.labour_excluded_roles || []
    const labourDay = m.roles.reduce((sum, r) => sum + (labourExcluded.includes(r) ? 0 : (cfg.role_rates_inr_per_hr[r] || 3800)), 0) * g.shift_hours

    // Unverified flags
    const verifiedMap = m.verified || {}
    const hasUnverified = !verifiedMap.spread_inr_per_day || !verifiedMap.vessel_inr_per_day || Object.values(verifiedMap).some((v) => v === false)

    const runs = [0, 1].map((i) => {
      const h = i === 0 ? hmin : hmax
      const kg = i === 0 ? kmin : kmax
      let rot = 0, bt = 0, overhead = 0, transit = 0, eff = 0, days = 1, equip = 0

      if (m.kind === 'human') {
        const noDeco = depth > 10 ? interp(cfg.no_deco_table_min, depth) : 219
        bt = typeof m.bottom_time_h === 'string' ? Math.min(noDeco, 45) / 60 : m.bottom_time_h
        overhead = depth / m.descent_m_per_min / 60 + depth / m.ascent_m_per_min / 60 + (depth > 10 ? m.safety_stop_min / 60 : 0) + stepLookup(m.deco_h_per_rotation, depth)
        rot = bt > 0 ? Math.ceil(h / bt) : 1
        days = Math.max(1, Math.ceil(rot / (m.working_divers * m.max_rot_per_diver_day)))
        equip = rot * m.equipment_inr_per_rotation[i] + days * m.spread_inr_per_day[i] + rot * m.gas_inr_per_rotation[i]
      } else {
        transit = (2 * depth) / m.descent_m_per_min / 60
        eff = Math.max(1, m.productive_h_per_day - transit)
        days = Math.max(1, Math.ceil(h / eff))
        equip = days * m.spread_inr_per_day[i]
      }

      const vessel = days * m.vessel_inr_per_day[i]
      const labour = days * labourDay
      const mob = g.mobilization_base_inr + distKm * g.transit_cost_per_km_inr
      const disp = Math.max(g.disposal_min_inr, kg * g.disposal_inr_per_kg[i])
      const sub = labour + equip + vessel + mob + disp
      const total = Math.round(sub * (1 + g.contingency_pct))

      return { days, labour, equipment: equip, vessel, mobilization: mob, disposal: Math.round(disp), subtotal: sub, total, rotations: rot, bottomTimeH: bt, overheadH: overhead, transitH: transit, productiveH: m.productive_h_per_day }
    })

    const modeResult = {
      mode: name,
      label: m.label || name,
      kind: m.kind,
      crew,
      roles: m.roles,
      risk: m.risk,
      isFeasible,
      excludeReason,
      hasUnverified,
      min: runs[0],
      max: runs[1],
      midCost: (runs[0].total + runs[1].total) / 2,
    }

    allModesComparison.push(modeResult)
    if (isFeasible) feasibleModes.push(modeResult)
  }

  if (feasibleModes.length === 0) {
    warnings.push(`Debris mass (${heaviest} kg) or depth (${depth}m) exceeds all available mode capabilities. Specialized crane barge required.`)
    return {
      status: 'no_feasible_modes',
      depth,
      depthSource,
      isNoFeasible: true,
      itemHours: [hmin, hmax],
      debrisKg: [kmin, kmax],
      heaviest,
      modes: [],
      allModesComparison,
      recommended: null,
      warnings,
      itemSummary,
    }
  }

  // Recommendation: beyond prefer_robotics_beyond_m choose cheapest robotics; else cheapest overall
  const roboticsPool = feasibleModes.filter((x) => x.kind === 'robotics')
  const pool = depth > g.prefer_robotics_beyond_m && roboticsPool.length > 0 ? roboticsPool : feasibleModes
  const rec = pool.reduce((minM, curM) => (curM.midCost < minM.midCost ? curM : minM), pool[0])

  if (rec.mode === 'work_class_rov' && hmax < 12) {
    warnings.push('Work-class spread is disproportionate for <12 h of work: batch with other piles into one campaign.')
  }
  if (rec.risk === 'high' || rec.risk === 'very_high') {
    warnings.push('Human diving at this depth is high risk: confirm with diving contractor; robotics preferred if feasible.')
  }

  return {
    status: 'success',
    depth,
    depthSource,
    itemHours: [round2(hmin), round2(hmax)],
    debrisKg: [round2(kmin), round2(kmax)],
    heaviest,
    recommended: rec.mode,
    recDetails: rec,
    modes: feasibleModes,
    allModesComparison,
    warnings,
    itemSummary,
    minCost: rec.min.total,
    maxCost: rec.max.total,
    laborMin: rec.min.labour,
    laborMax: rec.max.labour,
    equipMin: rec.min.equipment,
    equipMax: rec.max.equipment,
    vesselMin: rec.min.vessel,
    vesselMax: rec.max.vessel,
    mobMin: rec.min.mobilization,
    mobMax: rec.max.mobilization,
    dispMin: rec.min.disposal,
    dispMax: rec.max.disposal,
    daysMin: rec.min.days,
    daysMax: rec.max.days,
  }
}

function round2(v) {
  return Math.round(v * 100) / 100
}

export default function CleanupOptimizer({ onNavigate, target, onClearTarget }) {
  const [cfg, setCfg] = useState(DEFAULT_CFG)
  const [assumptionsVersion, setAssumptionsVersion] = useState('v-default')
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [isDbConnected, setIsDbConnected] = useState(false)
  const [areas, setAreas] = useState(() => {
    try {
      const saved = sessionStorage.getItem('bluesentinel_cleanup_areas')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed.filter((a) => !isSeedName(a.name))
      }
    } catch {}
    return []
  })
  const [selectedId, setSelectedId] = useState(null)
  const [isSavingPlan, setIsSavingPlan] = useState(false)
  const [planSaveStatus, setPlanSaveStatus] = useState(null)
  const [copiedManifest, setCopiedManifest] = useState(false)

  // Fetch active assumptions from backend on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/cleanup/assumptions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.assumptions) {
          setCfg(data.assumptions)
          setAssumptionsVersion(data.version || 'v-live')
        }
      })
      .catch((err) => console.warn('Could not fetch remote assumptions:', err))
  }, [])

  // Persist areas to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('bluesentinel_cleanup_areas', JSON.stringify(areas.filter((a) => !isSeedName(a.name))))
    } catch {}
  }, [areas])

  // Ingest redirected detection target
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
          return { class: item.class, count: { min: Math.max(1, cMin), max: Math.max(1, cMax) } }
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

    const newAreaId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `target-${Date.now()}`
    const rawTargetDepth = target.depth ?? target.targetMeta?.depth ?? target.seafloorDepth ?? target.seafloor_depth_m ?? null
    const depthSource = target.depthSource || (rawTargetDepth !== null ? 'bathymetry' : 'simulated')

    const newArea = {
      id: newAreaId,
      name: target.name || (target.pileId ? `📍 ${target.pileId}` : `📍 Survey Target — ${target.frameId || 'Live Frame'}`),
      location: target.location || 'Surveyed Marine Coordinates',
      depth: rawTargetDepth !== null ? Number(rawTargetDepth) : 15,
      depthSource,
      isSimulated: target.isSimulated || false,
      detections: detectionList,
      travelCost: 15000,
      isTarget: true,
      targetMeta: target,
    }

    setAreas((prev) => [newArea, ...prev.filter((a) => !a.isTarget && !isSeedName(a.name))])
    setSelectedId(newAreaId)

    setTimeout(() => {
      document.getElementById('cleanup-detailed-breakdown')?.scrollIntoView({ behavior: 'smooth' })
    }, 120)
  }, [target])

  // Fetch surveyed cleanup zones from live database
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
              depth: 10,
              depthSource: 'simulated',
              detections: (z.debris_inventory && z.debris_inventory.length > 0)
                ? z.debris_inventory.filter((d) => d.class !== 'rov')
                : [{ class: 'trash_bottle', count: { min: 4, max: 8 } }],
              travelCost: z.travel_cost || 15000,
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
      .catch(() => setIsDbConnected(false))
  }, [])

  // Evaluate areas with the multi-mode optimizer
  const ranked = useMemo(() => {
    return areas
      .filter((a) => !isSeedName(a.name))
      .map((a) => {
        const dVal = typeof a.depth === 'number' && !isNaN(a.depth) ? a.depth : 0
        const dSource = a.isSimulated ? 'simulated' : (a.depthSource || 'simulated')
        const opt = runLocalOptimizer(dVal, a.detections, cfg, 25, dSource)
        return { ...a, metrics: opt, midCost: (opt.minCost + opt.maxCost) / 2 || 0 }
      })
      .sort((a, b) => {
        if (a.isTarget) return -1
        if (b.isTarget) return 1
        return b.midCost - a.midCost
      })
  }, [areas, cfg])

  const top = ranked[0]
  const selectedArea = ranked.find((a) => a.id === selectedId) || top || null

  const handleUpdateAreaDepth = (areaId, newDepth) => {
    const parsed = Math.max(0, parseFloat(newDepth) || 0)
    setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, depth: parsed, isSimulated: true, depthSource: 'simulated' } : a)))
  }

  const handleSavePlan = async (zoneId) => {
    setIsSavingPlan(true)
    setPlanSaveStatus(null)
    try {
      const currentArea = areas.find((a) => a.id === zoneId) || selectedArea
      const depthVal = currentArea?.depth ?? 0
      const dSource = currentArea?.isSimulated ? 'simulated' : (currentArea?.depthSource || 'simulated')

      const res = await fetch(`${API_BASE_URL}/cleanup/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: zoneId,
          zone_name: currentArea?.name,
          location_coords: currentArea?.location,
          depth_m: depthVal,
          depth_source: dSource,
          dist_km: 25,
          travel_cost_usd: currentArea?.travelCost || 15000,
          debris_inventory: (currentArea?.detections || []).map((d) => ({
            class: d.class,
            count: d.count || { min: 1, max: 2 },
          })),
          assumptions: cfg,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setPlanSaveStatus({
        success: true,
        planId: data.plan_id,
        plan: data.plan,
        recommended: data.recommended,
        cost_min: data.cost_min,
        cost_max: data.cost_max,
      })
    } catch (e) {
      setPlanSaveStatus({ success: false, error: e.message })
    } finally {
      setIsSavingPlan(false)
    }
  }

  const handleExportManifest = (area) => {
    if (!area || !area.metrics) return
    const m = area.metrics
    const recM = m.recDetails || {}
    const isHuman = recM.kind === 'human'
    const opTitle = isHuman
      ? `COMMERCIAL DIVER OPERATIONS MANIFEST (${m.depth}m DEPTH · ${recM.label})`
      : `SUBSEA ROBOTICS DEPLOYMENT ORDER (${m.depth}m DEPTH · ${recM.label})`

    const text = [
      `========================================================================`,
      `BLUE SENTINEL ${opTitle}`,
      `Assumptions Version: ${assumptionsVersion}`,
      `Target Zone: ${area.name}`,
      `Survey Location: ${area.location}`,
      `Operating Depth: ${m.depth} meters (${area.isSimulated ? 'Simulated Depth' : (area.depthSource || 'Bathymetry Service')})`,
      `Recommended Mode: ${recM.label || m.recommended} [Risk: ${String(recM.risk).toUpperCase()}]`,
      `Crew Required: ${recM.crew} Technical Personnel (${(recM.roles || []).join(', ')})`,
      `Date/Time: ${new Date().toLocaleString()}`,
      `========================================================================`,
      `1. DEBRIS INVENTORY & HOURLY DEMAND:`,
      ...m.itemSummary.map((i) => ` - ${i.label}: ${i.min}–${i.max} items | Labour: ${i.subtotalHours} | Mass: ${i.subtotalKg} | Tooling: ${i.tools.join(', ')}`),
      ` Total Item Labour Window: ${m.itemHours[0]}–${m.itemHours[1]} hours`,
      ` Total Subsea Debris Mass: ${m.debrisKg[0]}–${m.debrisKg[1]} kg`,
      `------------------------------------------------------------------------`,
      `2. OPERATIONAL LOGISTICS & ROTATIONS:`,
      ` - Mode Kind: ${recM.kind === 'human' ? 'Commercial Human Diving' : 'Subsea Unmanned Robotics (ROV)'}`,
      ` - Mission Duration: ${m.daysMin}–${m.daysMax} Days`,
      isHuman
        ? ` - Diver Rotations: ${recM.min?.rotations}–${recM.max?.rotations} Rotations (Bottom time: ${recM.min?.bottomTimeH}h, Overhead: ${recM.min?.overheadH}h/rot)`
        : ` - ROV Sorties: ${m.daysMin}–${m.daysMax} Days (Transit: ${recM.min?.transitH}h/day, Productive window: ${recM.min?.productiveH}h/day)`,
      `------------------------------------------------------------------------`,
      `3. LINE-BY-LINE BUDGET BREAKDOWN (Parametric Estimate - INR):`,
      ` - Labour Cost (${recM.crew} crew full shift): ₹${m.laborMin.toLocaleString('en-IN')} – ₹${m.laborMax.toLocaleString('en-IN')}`,
      ` - Equipment & Spread Rate: ₹${m.equipMin.toLocaleString('en-IN')} – ₹${m.equipMax.toLocaleString('en-IN')}`,
      ` - Support Vessel Charter: ₹${m.vesselMin.toLocaleString('en-IN')} – ₹${m.vesselMax.toLocaleString('en-IN')}`,
      ` - Base Mobilization & Transit: ₹${m.mobMin.toLocaleString('en-IN')} – ₹${m.mobMax.toLocaleString('en-IN')}`,
      ` - Debris Disposal & Processing: ₹${m.dispMin.toLocaleString('en-IN')} – ₹${m.dispMax.toLocaleString('en-IN')}`,
      ` - Contingency Buffer (20%): ₹${Math.round(m.minCost - (m.minCost / 1.2)).toLocaleString('en-IN')} – ₹${Math.round(m.maxCost - (m.maxCost / 1.2)).toLocaleString('en-IN')}`,
      ` TOTAL PROJECTED BUDGET: ₹${m.minCost.toLocaleString('en-IN')} – ₹${m.maxCost.toLocaleString('en-IN')} INR`,
      `------------------------------------------------------------------------`,
      `DISCLAIMER: Budgeting estimate only, not dive planning; decompression figures are placeholders.`,
      `========================================================================`,
    ].join('\n')

    navigator.clipboard.writeText(text).then(() => {
      setCopiedManifest(true)
      setTimeout(() => setCopiedManifest(false), 2500)
    })
  }

  const getRiskChipStyle = (risk) => {
    switch (risk) {
      case 'low':
        return { background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }
      case 'medium':
        return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
      case 'high':
        return { background: '#ffedd5', color: '#c2410c', border: '1px solid #fdba74' }
      case 'very_high':
        return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }
      default:
        return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }
    }
  }

  return (
    <div className="home-page">
      <NavBar page="optimizer" onNavigate={onNavigate} />

      {/* Hero Section */}
      <section className="upload-hero" style={{ background: 'linear-gradient(135deg,#0c2340 0%,#0e4560 50%,#0d4a2e 100%)' }}>
        <div className="home-hero-inner">
          <div className="home-badge">
            <span className="home-badge-dot" />
            CLEANUP COST &amp; IMPACT OPTIMIZER &nbsp;&middot;&nbsp; DECISION SUPPORT
          </div>
          <h1 className="home-hero-title" style={{ fontSize: 'clamp(26px,4vw,40px)', marginBottom: 8 }}>
            Cleanup Logistics Optimizer<br />
            <em className="home-hero-italic">Multi-Mode Subsea Economics Engine</em>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.76)', fontSize: 14, maxWidth: 640 }}>
            Parametric recovery planning matching seafloor depth, debris payloads, and certified operational modes.
            Evaluates human diving tiers (0–100m application scope limit; saturation diving operates deeper) and subsea ROV spreads (up to 3000m) with full vessel and disposal costing.
          </p>
        </div>
      </section>

      {/* Target redirect banner */}
      {target && (
        <div style={{ background: 'linear-gradient(135deg,#0f2030,#0d3260)', borderBottom: '3px solid #f59e0b', padding: '14px 32px' }}>
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
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
                  {target.pileId || target.frameId}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#fff', fontWeight: 600, margin: '0 0 4px' }}>
                {target.name || 'Underwater Debris Cluster Queued for Logistics Allocation'}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                {target.location || 'Surveyed marine sector'} &bull; Operating Depth: {target.depth ?? 'Surface'}m
              </p>
            </div>
            <button
              onClick={() => {
                setAreas((prev) => prev.filter((a) => !a.isTarget))
                if (onClearTarget) onClearTarget()
              }}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}
              title="Dismiss target"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <section style={{ background: '#e4eff5', padding: '32px 32px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Top Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="home-how-title" style={{ margin: 0, fontSize: 22 }}>
                {ranked.length > 0 ? `${ranked.length} Surveyed ${ranked.length === 1 ? 'Target' : 'Targets'} \u2014 Multi-Mode Feasibility & Budgeting` : 'Cleanup Logistics & Cost Optimizer'}
              </h2>
              <p className="home-card-desc" style={{ marginTop: 4, fontSize: 13 }}>
                Select a target to inspect the live Mode Comparison Matrix, line-by-line cost equation, and contractor quote notices.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', color: '#475569' }}>
                Assumptions: <strong style={{ color: '#0284c7' }}>{assumptionsVersion}</strong>
              </span>
              {ranked.length > 0 && (
                <button
                  onClick={() => {
                    setAreas([])
                    setSelectedId(null)
                    try { sessionStorage.removeItem('bluesentinel_cleanup_areas') } catch {}
                    if (onClearTarget) onClearTarget()
                  }}
                  style={{ background: '#fff', border: '1.5px solid #fca5a5', color: '#b91c1c', fontWeight: 600, fontSize: 13, padding: '8px 14px', borderRadius: 10, cursor: 'pointer' }}
                >
                  🗑 Clear Queue
                </button>
              )}
              <button
                onClick={() => setShowAssumptions(!showAssumptions)}
                style={{
                  background: showAssumptions ? '#0c2340' : '#fff',
                  border: '1.5px solid #a8cfe0',
                  color: showAssumptions ? '#fff' : '#1a4a6a',
                  fontWeight: 600,
                  fontSize: 13,
                  padding: '8px 16px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                }}
              >
                {showAssumptions ? '✕ Close Assumptions' : '⚙ Edit Assumptions'}
              </button>
            </div>
          </div>

          {/* Edit Assumptions Drawer */}
          {showAssumptions && (
            <div className="home-card" style={{ padding: 24, marginBottom: 20, background: '#fff', borderRadius: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h4 style={{ fontSize: 16, fontWeight: 800, color: '#0f2030', margin: 0 }}>Operational Assumptions Config ({assumptionsVersion})</h4>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Single source of truth: all rate edits update real-time model bounds and export manifests.</p>
                </div>
                <button
                  onClick={() => {
                    fetch(`${API_BASE_URL}/cleanup/assumptions/reset`, { method: 'POST' })
                      .then((r) => r.json())
                      .then((d) => {
                        if (d.assumptions) {
                          setCfg(d.assumptions)
                          setAssumptionsVersion(d.version)
                        }
                      })
                  }}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  🔄 Reset Defaults
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {Object.entries(cfg.debris_classes || {}).map(([cls, def]) => (
                  <div key={cls} style={{ background: '#f8fbfd', border: '1px solid #e0eef5', borderRadius: 10, padding: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1a4a6a', marginBottom: 6 }}>{def.label || cls}</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: '#64748b' }}>Min h</label>
                        <input
                          type="number"
                          step="0.05"
                          value={def.h[0]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            setCfg((prev) => ({
                              ...prev,
                              debris_classes: {
                                ...prev.debris_classes,
                                [cls]: { ...prev.debris_classes[cls], h: [val, prev.debris_classes[cls].h[1]] },
                              },
                            }))
                          }}
                          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 6px', fontSize: 11 }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: '#64748b' }}>Max h</label>
                        <input
                          type="number"
                          step="0.05"
                          value={def.h[1]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            setCfg((prev) => ({
                              ...prev,
                              debris_classes: {
                                ...prev.debris_classes,
                                [cls]: { ...prev.debris_classes[cls], h: [prev.debris_classes[cls].h[0], val] },
                              },
                            }))
                          }}
                          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 6px', fontSize: 11 }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target Cards Grid or Empty State */}
          {ranked.length === 0 ? (
            <div className="home-card" style={{ padding: '48px 24px', textAlign: 'center', background: '#fff', borderRadius: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🌊</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f2030', marginBottom: 8 }}>No Cleanup Targets Queued</h3>
              <p style={{ fontSize: 14, color: '#64748b', maxWidth: 540, margin: '0 auto 20px', lineHeight: 1.6 }}>
                To optimize cleanup logistics, launch an inspection in the <strong>ROV Simulator</strong> and click <strong>🚀 Send to Cleanup Optimizer</strong> on any surveyed pile.
              </p>
              <button
                onClick={() => onNavigate && onNavigate('rov')}
                style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Open ROV Simulator
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
              {ranked.map((area, rank) => {
                const m = area.metrics
                const recM = m.recDetails || {}
                const isSelected = selectedArea?.id === area.id
                const isHuman = recM.kind === 'human'
                const riskStyle = getRiskChipStyle(recM.risk)

                return (
                  <div
                    key={area.id}
                    className="home-card"
                    onClick={() => setSelectedId(area.id)}
                    style={{
                      padding: 20,
                      cursor: 'pointer',
                      borderRadius: 14,
                      position: 'relative',
                      transition: 'all 0.2s',
                      border: isSelected ? '2.5px solid #0284c7' : area.isTarget ? '2px solid #f59e0b' : '1px solid #e0eef5',
                      boxShadow: isSelected ? '0 8px 24px rgba(2,132,199,0.18)' : undefined,
                      background: isSelected ? '#f0f9ff' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, ...riskStyle }}>
                        {isHuman ? '🤿' : '🤖'} {recM.label || m.recommended || 'Analyzing'} · {String(recM.risk || 'Low').toUpperCase()} RISK
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#0284c7' }}>
                        🌊 {m.depth}m
                      </span>
                    </div>

                    <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f2030', marginBottom: 4 }}>{area.name}</h3>
                    <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginBottom: 12, wordBreak: 'break-word' }}>
                      {area.location}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                        <span>Labour Demand:</span>
                        <strong>{m.itemHours[0]}–{m.itemHours[1]} h ({m.debrisKg[0]}–{m.debrisKg[1]} kg)</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                        <span>Staffing:</span>
                        <strong>{recM.crew || 3} Personnel · {m.daysMin}–{m.daysMax} Days</strong>
                      </div>
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 10px', marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700, display: 'block' }}>PROJECTED COST (INR)</span>
                        <strong style={{ fontSize: 15, color: '#1e3a8a' }}>
                          ₹{m.minCost?.toLocaleString('en-IN')}&ndash;₹{m.maxCost?.toLocaleString('en-IN')}
                        </strong>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── DETAILED OPERATIONAL BREAKDOWN & MODE COMPARISON TABLE ─────────── */}
          {selectedArea && selectedArea.metrics && (() => {
            const m = selectedArea.metrics
            const recM = m.recDetails || {}
            const isHuman = recM.kind === 'human'
            const riskStyle = getRiskChipStyle(recM.risk)

            return (
              <div id="cleanup-detailed-breakdown" className="home-card" style={{ padding: 28, marginBottom: 24, border: '2px solid #0284c7', background: '#fff', borderRadius: 16 }}>

                {/* Header with Title and Mode Chip */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ background: 'rgba(2,132,199,0.12)', color: '#0284c7', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>
                        DECISION SUPPORT &amp; DISPATCH
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 6, ...riskStyle }}>
                        {isHuman ? '🤿 HUMAN DIVER' : '🤖 SUBSEA ROBOTICS'} &middot; {recM.label || m.recommended}
                      </span>
                    </div>

                    <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f2030', margin: '4px 0 2px' }}>
                      {selectedArea.name}
                    </h3>
                    <p style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', margin: '0 0 10px' }}>
                      {selectedArea.location}
                    </p>

                    {/* Depth & Simulation Controller */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '4px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Operating Depth:</span>
                        <input
                          type="number"
                          min="0"
                          max="4000"
                          value={selectedArea.depth ?? 0}
                          onChange={(e) => handleUpdateAreaDepth(selectedArea.id, e.target.value)}
                          style={{ width: 75, padding: '3px 6px', border: '1.5px solid #94a3b8', borderRadius: 4, fontSize: 13, fontWeight: 800, outline: 'none' }}
                        />
                        <span style={{ fontSize: 12, color: '#64748b' }}>m</span>
                      </div>

                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: selectedArea.isSimulated ? '#fef3c7' : '#e0f2fe',
                        color: selectedArea.isSimulated ? '#92400e' : '#0369a1',
                        border: selectedArea.isSimulated ? '1px solid #fde68a' : '1px solid #bae6fd',
                      }}>
                        {selectedArea.isSimulated ? '🎮 Simulated depth' : '🌊 Bathymetry Service (NOAA / SRTM15+)'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleExportManifest(selectedArea)}
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e293b', fontWeight: 700, fontSize: 12, padding: '9px 16px', borderRadius: 8, cursor: 'pointer' }}
                    >
                      {copiedManifest ? '✅ Manifest Copied!' : '📋 Copy Mission Manifest'}
                    </button>
                  </div>
                </div>

                {/* Warnings / Alerts Box */}
                {m.warnings && m.warnings.length > 0 && (
                  <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>⚠️</span>
                      <strong style={{ fontSize: 12, color: '#92400e' }}>Operational Feasibility Warnings:</strong>
                    </div>
                    {m.warnings.map((w, idx) => (
                      <p key={idx} style={{ fontSize: 12, color: '#78350f', margin: '2px 0 0', lineHeight: 1.5 }}>
                        &bull; {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* ── MODE COMPARISON TABLE (Step 4 Requirement) ── */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f2030', margin: 0 }}>
                      Operational Mode Comparison Matrix ({selectedArea.depth}m Operating Depth)
                    </h4>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      Compares all 7 commercial diving and subsea robotics tiers
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                          <th style={{ padding: '10px 14px' }}>Deployment Mode</th>
                          <th style={{ padding: '10px 14px' }}>Category</th>
                          <th style={{ padding: '10px 14px' }}>Risk Rating</th>
                          <th style={{ padding: '10px 14px' }}>Crew</th>
                          <th style={{ padding: '10px 14px' }}>Duration</th>
                          <th style={{ padding: '10px 14px' }}>Cost Range (INR / ₹)</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.allModesComparison.map((comp) => {
                          const isRec = comp.mode === m.recommended
                          const rChip = getRiskChipStyle(comp.risk)

                          return (
                            <tr
                              key={comp.mode}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: isRec ? '#ecfdf5' : comp.isFeasible ? '#fff' : '#f8fafc',
                                opacity: comp.isFeasible ? 1 : 0.65,
                              }}
                            >
                              <td style={{ padding: '10px 14px', fontWeight: isRec ? 800 : 600, color: isRec ? '#065f46' : '#1e293b' }}>
                                {comp.kind === 'human' ? '🤿' : '🤖'} {comp.label}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748b' }}>
                                {comp.kind === 'human' ? 'Commercial Diver' : 'Subsea Robotics'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, ...rChip }}>
                                  {String(comp.risk).toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#1e293b', fontWeight: 600 }}>
                                {comp.crew} Personnel
                              </td>
                              <td style={{ padding: '10px 14px', color: '#475569' }}>
                                {comp.isFeasible ? `${comp.min.days}–${comp.max.days} Days` : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: isRec ? '#047857' : '#1e293b' }}>
                                {comp.isFeasible ? `₹${comp.min.total.toLocaleString('en-IN')} – ₹${comp.max.total.toLocaleString('en-IN')}` : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                {isRec ? (
                                  <span style={{ background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
                                    ★ RECOMMENDED
                                  </span>
                                ) : comp.isFeasible ? (
                                  <span style={{ color: '#0284c7', fontSize: 11, fontWeight: 700 }}>Feasible</span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: 11 }} title={comp.excludeReason}>
                                    {comp.excludeReason ? comp.excludeReason.slice(0, 32) + '…' : 'Ineligible'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── TWO-COLUMN DETAILED LOGISTICS & BREAKDOWN ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>

                  {/* Left Column: Itemized Debris & Tooling Manifest */}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f2030', marginBottom: 12 }}>
                      1. Debris Inventory &amp; Hourly Demand
                    </h4>
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 16 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                            <th style={{ padding: '8px 12px' }}>Debris Item</th>
                            <th style={{ padding: '8px 12px' }}>Count</th>
                            <th style={{ padding: '8px 12px' }}>Labor Demand</th>
                            <th style={{ padding: '8px 12px' }}>Tooling Required</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.itemSummary.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: idx < m.itemSummary.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                              <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b' }}>{item.label}</td>
                              <td style={{ padding: '9px 12px', color: '#0284c7', fontWeight: 700 }}>{item.min}&ndash;{item.max}</td>
                              <td style={{ padding: '9px 12px', color: '#334155', fontWeight: 600 }}>{item.subtotalHours}</td>
                              <td style={{ padding: '9px 12px', color: '#64748b', fontSize: 11 }}>{item.tools.join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: 14 }}>
                      <h5 style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>
                        Required Tooling &amp; Spread Hardware:
                      </h5>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {isHuman ? (
                          <>
                            <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                              🤿 Diver Comm Umbilical
                            </span>
                            <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                              🎈 Inflatable Lift Bags (100–500kg)
                            </span>
                            <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                              ✂️ Hydraulic Wire/Net Shears
                            </span>
                          </>
                        ) : (
                          <>
                            <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                              🤖 Heavy Hydraulic Manipulator Arm
                            </span>
                            <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                              🧺 Subsea Recovery Basket
                            </span>
                            <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                              📡 Ultra-Short Baseline (USBL) Tracking
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Line-by-Line Economics & Rotations */}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f2030', marginBottom: 12 }}>
                      2. Line-by-Line Budget Breakdown &amp; Duty Cycles
                    </h4>

                    {/* Rotations / Sorties conditional display */}
                    <div style={{ background: isHuman ? '#f0fdf4' : '#eff6ff', border: isHuman ? '1.5px solid #86efac' : '1.5px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: isHuman ? '#166534' : '#1e40af' }}>
                          {isHuman ? '🤿 Diver Rotations & Bottom Time' : '🤖 Subsea ROV Sorties & Duty Cycles'}
                        </span>
                        <strong style={{ fontSize: 12, color: isHuman ? '#14532d' : '#1e3a8a' }}>
                          {isHuman
                            ? `${recM.min?.rotations}–${recM.max?.rotations} Rotations (${recM.min?.bottomTimeH}h BT, ${recM.min?.overheadH}h overhead)`
                            : `${m.daysMin}–${m.daysMax} Days (Transit: ${recM.min?.transitH}h/day, Productive: ${recM.min?.productiveH}h/day)`}
                        </strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Labour Cost (Full Shift Pay · {recM.crew} Crew):</span>
                        <strong style={{ fontSize: 12, color: '#1e293b' }}>
                          ₹{m.laborMin?.toLocaleString('en-IN')} &ndash; ₹{m.laborMax?.toLocaleString('en-IN')}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Equipment &amp; Tooling Spread:</span>
                        <strong style={{ fontSize: 12, color: '#1e293b' }}>
                          ₹{m.equipMin?.toLocaleString('en-IN')} &ndash; ₹{m.equipMax?.toLocaleString('en-IN')}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Support Vessel Day Charter:</span>
                        <strong style={{ fontSize: 12, color: '#1e293b' }}>
                          ₹{m.vesselMin?.toLocaleString('en-IN')} &ndash; ₹{m.vesselMax?.toLocaleString('en-IN')}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Mobilization &amp; Transit (25 km base):</span>
                        <strong style={{ fontSize: 12, color: '#1e293b' }}>
                          ₹{m.mobMin?.toLocaleString('en-IN')} &ndash; ₹{m.mobMax?.toLocaleString('en-IN')}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Debris Disposal &amp; Hazmat Processing:</span>
                        <strong style={{ fontSize: 12, color: '#1e293b' }}>
                          ₹{m.dispMin?.toLocaleString('en-IN')} &ndash; ₹{m.dispMax?.toLocaleString('en-IN')}
                        </strong>
                      </div>

                      {/* Total Box */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, marginTop: 4 }}>
                        <div>
                          <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 800, display: 'block' }}>TOTAL PROJECTED BUDGET (INR):</span>
                          <span style={{ fontSize: 10, color: '#60a5fa' }}>Includes 20% Contingency Buffer</span>
                        </div>
                        <span style={{ fontSize: 16, color: '#1e3a8a', fontWeight: 900 }}>
                          ₹{m.minCost?.toLocaleString('en-IN')} &ndash; ₹{m.maxCost?.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {/* Unverified Rates Banner (Step 4 Requirement) */}
                      {recM.hasUnverified && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13 }}>⚠️</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                            Indicative rates, validate with contractor quotes
                          </span>
                        </div>
                      )}

                      {/* Permanent Disclaimer (Step 4 Requirement) */}
                      <p style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', margin: '4px 0 0', lineHeight: 1.4 }}>
                        * Budgeting estimate only, not dive planning; decompression figures are placeholders.
                      </p>
                    </div>

                    {/* Dispatch Plan Button */}
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        onClick={() => handleSavePlan(selectedArea.id)}
                        disabled={isSavingPlan}
                        style={{
                          background: isSavingPlan ? '#64748b' : 'linear-gradient(135deg, #10b981, #059669)',
                          border: 'none',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 13,
                          padding: '11px 22px',
                          borderRadius: 8,
                          cursor: isSavingPlan ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        {isSavingPlan ? 'Saving Plan to Database…' : '💾 Dispatch & Save Plan to Database'}
                      </button>

                      {planSaveStatus && (
                        <div style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: planSaveStatus.success ? '#047857' : '#b91c1c',
                          background: planSaveStatus.success ? '#ecfdf5' : '#fef2f2',
                          border: `1px solid ${planSaveStatus.success ? '#a7f3d0' : '#fecaca'}`,
                          borderRadius: 6,
                          padding: '8px 14px',
                        }}>
                          {planSaveStatus.success
                            ? `✅ Work Order Saved! (ID: ${planSaveStatus.planId.slice(0, 8)}… · Mode: ${planSaveStatus.recommended} · Budget: ₹${planSaveStatus.cost_min.toLocaleString('en-IN')}–₹${planSaveStatus.cost_max.toLocaleString('en-IN')})`
                            : `⚠️ Error saving plan: ${planSaveStatus.error}`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </section>

      <footer className="home-footer">
        <p className="home-footer-title">Blue Sentinel &mdash; Cleanup Cost &amp; Impact Optimizer</p>
        <p className="home-footer-sub">
          Comparison under stated assumptions &middot; Budgeting estimate only, not dive planning &middot; Decompression figures are placeholders
        </p>
      </footer>
    </div>
  )
}
