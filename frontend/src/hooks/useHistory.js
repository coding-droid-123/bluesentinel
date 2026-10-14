import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../config'

const STORAGE_KEY = 'bluesentinel_history'
const MAX_ENTRIES = 100

/**
 * Safely parse history entries from localStorage or sessionStorage fallback
 */
export function getHistoryRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('Failed to parse BlueSentinel history from storage:', err)
    return []
  }
}

/**
 * Strip oversized thumbnail strings (> 35KB) to guarantee storage quota is never breached
 */
function sanitizeRecord(rec) {
  let thumb = rec.thumbnailDataUrl
  // Never store massive multi-megabyte base64 strings in browser storage
  if (thumb && (thumb.length > 35000 || thumb.startsWith('blob:'))) {
    thumb = null
  }
  return {
    ...rec,
    thumbnailDataUrl: thumb,
    inventory: (rec.inventory || []).filter((item) => (item.class || '') !== 'rov'),
  }
}

/**
 * Save history array to storage safely with multi-layer quota protection
 */
function saveHistoryRecords(entries) {
  const sanitized = entries.map(sanitizeRecord)
  try {
    const jsonStr = JSON.stringify(sanitized)
    localStorage.setItem(STORAGE_KEY, jsonStr)
    try { sessionStorage.setItem(STORAGE_KEY, jsonStr) } catch {}
    window.dispatchEvent(new Event('bluesentinel_history_updated'))
    return true
  } catch (err) {
    console.warn('Storage quota exceeded, stripping all thumbnails to preserve history text logs:', err)
    try {
      // Strip all thumbnails completely to preserve log entries
      const noThumbs = sanitized.map(({ thumbnailDataUrl, ...rest }) => rest).slice(0, 50)
      const jsonStr = JSON.stringify(noThumbs)
      localStorage.setItem(STORAGE_KEY, jsonStr)
      try { sessionStorage.setItem(STORAGE_KEY, jsonStr) } catch {}
      window.dispatchEvent(new Event('bluesentinel_history_updated'))
      return true
    } catch {
      return false
    }
  }
}

/**
 * Add a record directly (can be called outside React hook lifecycle)
 */
export function addHistoryRecord(record) {
  const current = getHistoryRecords()
  const newEntry = sanitizeRecord({
    id: record.id || `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: record.timestamp || new Date().toISOString(),
    type: record.type || 'image', // 'image' | 'rov' | 'batch'
    label: record.label || 'Scan Analysis',
    summary: {
      totalObjects: record.summary?.totalObjects ?? 0,
      debrisCount: record.summary?.debrisCount ?? 0,
      highestSeverity: record.summary?.highestSeverity ?? 'low',
      uniqueTypes: record.summary?.uniqueTypes ?? 0,
      ...record.summary,
    },
    thumbnailDataUrl: record.thumbnailDataUrl || null,
    inventory: (record.inventory || []).filter((i) => (i.class || '') !== 'rov'),
    location: record.location || 'Marine Coordinates',
    meta: record.meta || {},
  })

  // Avoid identical consecutive duplicates
  const isDuplicate = current.length > 0 && current[0].label === newEntry.label && current[0].type === newEntry.type
  const updated = isDuplicate ? [newEntry, ...current.slice(1)] : [newEntry, ...current].slice(0, MAX_ENTRIES)
  saveHistoryRecords(updated)
  return newEntry
}

/**
 * Delete a single record by ID
 */
export function removeHistoryRecord(id) {
  const current = getHistoryRecords()
  const updated = current.filter((e) => e.id !== id)
  saveHistoryRecords(updated)
}

/**
 * Clear all history
 */
export function clearHistoryRecords() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
  window.dispatchEvent(new Event('bluesentinel_history_updated'))
}

/**
 * React hook to reactively track scan history and auto-sync with backend missions
 */
export default function useHistory() {
  const [entries, setEntries] = useState(getHistoryRecords)

  // Listen to local storage updates
  useEffect(() => {
    const handleUpdate = () => {
      setEntries(getHistoryRecords())
    }
    window.addEventListener('bluesentinel_history_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('bluesentinel_history_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  // Auto-sync with logged survey missions from the backend database if local history is sparse
  useEffect(() => {
    let isCancelled = false
    fetch(`${API_BASE_URL}/missions?limit=25`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isCancelled || !data?.missions || data.missions.length === 0) return
        const current = getHistoryRecords()
        const existingIds = new Set(current.map((e) => e.id))

        const newFromDb = []
        for (const m of data.missions) {
          const dbId = `db_${m.id}`
          if (!existingIds.has(dbId)) {
            // Calculate debris counts from mission summary
            let totalDebris = 0
            const inventory = []
            if (m.summary_by_class) {
              for (const [cls, cnt] of Object.entries(m.summary_by_class)) {
                if (cls !== 'rov' && !cls.startsWith('animal_') && cls !== 'plant') {
                  totalDebris += cnt
                  inventory.push({ class: cls, count: cnt })
                }
              }
            }
            newFromDb.push({
              id: dbId,
              timestamp: m.created_at || new Date().toISOString(),
              type: 'rov',
              label: m.name || `ROV Mission ${m.id?.slice(0, 8)}`,
              summary: {
                totalObjects: m.total_unique_objects || totalDebris,
                debrisCount: totalDebris || m.total_unique_objects || 0,
                highestSeverity: totalDebris > 5 ? 'critical' : totalDebris > 0 ? 'high' : 'medium',
                uniqueTypes: inventory.length || 1,
              },
              thumbnailDataUrl: null,
              inventory,
              location: m.video_source || 'ROV Survey Mission',
              meta: { dbSynced: true, missionId: m.id },
            })
          }
        }

        if (newFromDb.length > 0) {
          const merged = [...current, ...newFromDb].slice(0, MAX_ENTRIES)
          saveHistoryRecords(merged)
          setEntries(merged)
        }
      })
      .catch((err) => {
        console.warn('Backend mission sync standby:', err)
      })

    return () => { isCancelled = true }
  }, [])

  const addEntry = useCallback((record) => {
    return addHistoryRecord(record)
  }, [])

  const removeEntry = useCallback((id) => {
    removeHistoryRecord(id)
  }, [])

  const clearHistory = useCallback(() => {
    clearHistoryRecords()
  }, [])

  return {
    entries,
    addEntry,
    removeEntry,
    clearHistory,
  }
}
