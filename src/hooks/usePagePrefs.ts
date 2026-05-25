import { useCallback, useEffect, useState } from 'react'

// Persisted per-page UI preferences (column visibility, pageSize, sort, date preset, ...).
// Stored in localStorage under `page-prefs:<key>`. Defaults are merged with the stored
// value so adding a new field later doesn't blow up old stored objects.
export function usePagePrefs<T extends object>(key: string, defaults: T): [T, (patch: Partial<T>) => void] {
  const storageKey = `page-prefs:${key}`

  const [prefs, setPrefs] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return defaults
      const parsed = JSON.parse(raw)
      return { ...defaults, ...parsed }
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs))
    } catch {
      // quota / private mode — ignore; runtime state still works for this session
    }
  }, [storageKey, prefs])

  const update = useCallback((patch: Partial<T>) => {
    setPrefs(p => ({ ...p, ...patch }))
  }, [])

  return [prefs, update]
}
