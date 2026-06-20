import { ipcMain } from 'electron'
import { getDb } from '../db'
import { requireAdmin, getSession } from '../auth/session'
import { GPP_THRESHOLDS } from '../../src/lib/env/thresholds'

// Allow-listed numeric fields in env_log — gates `env:saveCell` and
// `env:generateMonth` so a stray `field` can never be interpolated into SQL
// (would otherwise throw "no such column"). `note` is TEXT and is handled
// separately (trim, never parseFloat).
const NUMERIC_FIELDS = new Set([
  'store_temp', 'store_humidity', 'reserve_temp', 'reserve_humidity', 'fridge_temp',
])
const SAVE_FIELDS = new Set([...NUMERIC_FIELDS, 'note'])

// Explicit column allow-list for env_settings — the saveSettings dynamic UPDATE
// intersects Object.keys(rest) against this before building SQL (the handler-side
// guard; the Settings renderer is the first gate).
const SETTINGS_COLUMNS = new Set([
  'zone_reserve_enabled', 'zone_fridge_enabled',
  // DEAD COLUMN — thresholds ฝังใน src/lib/env/thresholds.ts (SSOT) แล้ว; รอ DROP ก่อน launch
  'store_temp_max', 'store_humidity_max',
  'reserve_temp_max', 'reserve_humidity_max',
  'fridge_temp_min', 'fridge_temp_max',
])

// First/last day of a (year, month) as 'YYYY-MM-DD' bounds for BETWEEN.
function monthBounds(year: number, month: number) {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const last = new Date(year, month, 0).getDate() // month is 1-based → day 0 of next month
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}`, daysInMonth: last }
}

// Read-or-INSERT-DEFAULT the singleton settings row (materializes GPP defaults on
// first read so every consumer always has zone flags + thresholds). Mirrors
// settings:getDocumentSettings.
function ensureSettings(db: ReturnType<typeof getDb>) {
  let row = db.prepare(`SELECT * FROM env_settings ORDER BY id LIMIT 1`).get() as any
  if (!row) {
    db.prepare(`INSERT INTO env_settings DEFAULT VALUES`).run()
    row = db.prepare(`SELECT * FROM env_settings ORDER BY id LIMIT 1`).get()
  }
  return row
}

export function registerEnvHandlers() {
  // All env_log rows in a month (every period), ordered for the grid. Empty
  // month (fresh DB) → []. Ungated read.
  ipcMain.handle('env:getMonth', (_e, { year, month }: { year: number; month: number }) => {
    const db = getDb()
    const { from, to } = monthBounds(year, month)
    return db.prepare(`
      SELECT * FROM env_log
      WHERE log_date BETWEEN ? AND ?
      ORDER BY log_date, period
    `).all(from, to)
  })

  // Upsert ONE cell. ALLOW-LIST the field, branch by type (numeric blank/NaN/0 →
  // NULL — a temp/humidity/fridge reading of exactly 0 is never real, and the
  // grid legend renders "ไม่ได้กรอกหรือใส่ 0" as a blank cell; note trimmed,
  // empty → NULL), and set recorded_by on INSERT ONLY (later field edits keep
  // the original recorder). Ungated — staff record daily.
  ipcMain.handle('env:saveCell', (e, payload: { log_date: string; period: number; field: string; value: any }) => {
    const db = getDb()
    const field = String(payload?.field ?? '')
    if (!SAVE_FIELDS.has(field)) throw new Error(`invalid env field: ${field}`)

    let value: number | string | null
    if (field === 'note') {
      const t = String(payload?.value ?? '').trim()
      value = t === '' ? null : t
    } else {
      const raw = payload?.value
      if (raw === '' || raw === null || raw === undefined) {
        value = null
      } else {
        const n = parseFloat(String(raw))
        // blank/NaN/0 → NULL (0 is never a real reading; renders as blank).
        value = Number.isNaN(n) || n === 0 ? null : n
      }
    }

    const uid = getSession(e.sender.id)?.userId ?? null
    const log_date = String(payload?.log_date ?? '')
    const period = Number(payload?.period)

    db.prepare(`
      INSERT INTO env_log (log_date, period, ${field}, recorded_by)
      VALUES (@log_date, @period, @value, @uid)
      ON CONFLICT(log_date, period) DO UPDATE SET
        ${field} = @value,
        updated_at = datetime('now','localtime')
    `).run({ log_date, period, value, uid })

    return db.prepare(`SELECT * FROM env_log WHERE log_date = ? AND period = ?`).get(log_date, period)
  })

  // Bulk auto-fill the whole month in ONE transaction. mode 'fill-empty'
  // (default — only NULL cells, preserves real entries) | 'all' (every cell).
  // Per-zone random-walk inside the configured GPP band so values read natural
  // and always pass thresholds (never produce a red cell). Caps at today for the
  // current month; never touches note. recorded_by on INSERT. Ungated (same
  // operational class as saveCell). Returns the month's rows for grid refresh.
  ipcMain.handle('env:generateMonth', (e, { year, month, mode }: { year: number; month: number; mode?: 'fill-empty' | 'all' }) => {
    const db = getDb()
    const fillMode = mode === 'all' ? 'all' : 'fill-empty'
    const s = ensureSettings(db)
    const uid = getSession(e.sender.id)?.userId ?? null
    const { from, to, daysInMonth } = monthBounds(year, month)

    // Cap at today for the current month (no fabricated future days); past months
    // fill fully.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let lastDay = daysInMonth
    if (today.getFullYear() === year && today.getMonth() + 1 === month) {
      lastDay = Math.min(daysInMonth, today.getDate())
    } else if (today.getFullYear() < year || (today.getFullYear() === year && today.getMonth() + 1 < month)) {
      lastDay = 0 // entirely future month → nothing to fill
    }

    // Enabled numeric fields with their band [lo, hi] and rounding ('temp'|'humid').
    type Band = { field: string; lo: number; hi: number; round: 'temp' | 'humid' }
    // Build a safe in-threshold band: clamp lo at 0 (humidity also ≤ ceil), and
    // if a pathological threshold collapses the band (lo ≥ hi) fall back to a
    // single value pinned just inside hi (or 0). Values can never go negative
    // and always stay within the configured thresholds.
    const safeBand = (field: string, lo: number, hi: number, round: 'temp' | 'humid', ceil = Infinity): Band => {
      let loC = Math.max(0, lo)
      let hiC = Math.min(ceil, hi)
      if (loC >= hiC) loC = hiC = Math.max(0, hiC)
      return { field, lo: loC, hi: hiC, round }
    }
    const bands: Band[] = [
      safeBand('store_temp', GPP_THRESHOLDS.store_temp_max - 5, GPP_THRESHOLDS.store_temp_max - 1, 'temp'),
      safeBand('store_humidity', GPP_THRESHOLDS.store_humidity_max - 15, GPP_THRESHOLDS.store_humidity_max - 3, 'humid', 100),
    ]
    if (s.zone_reserve_enabled) {
      bands.push(safeBand('reserve_temp', GPP_THRESHOLDS.reserve_temp_max - 5, GPP_THRESHOLDS.reserve_temp_max - 1, 'temp'))
      bands.push(safeBand('reserve_humidity', GPP_THRESHOLDS.reserve_humidity_max - 15, GPP_THRESHOLDS.reserve_humidity_max - 3, 'humid', 100))
    }
    if (s.zone_fridge_enabled) {
      bands.push(safeBand('fridge_temp', GPP_THRESHOLDS.fridge_temp_min + 0.5, GPP_THRESHOLDS.fridge_temp_max - 0.5, 'temp'))
    }
    // Guard: every produced field must be in the allow-list (defends the column
    // interpolation below — same Set as saveCell).
    for (const b of bands) if (!NUMERIC_FIELDS.has(b.field)) throw new Error(`invalid env field: ${b.field}`)

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    const roundVal = (v: number, kind: 'temp' | 'humid') => kind === 'temp' ? Math.round(v * 10) / 10 : Math.round(v)

    db.transaction(() => {
      const existingRows = db.prepare(`
        SELECT log_date, period, ${[...NUMERIC_FIELDS].join(', ')} FROM env_log
        WHERE log_date BETWEEN ? AND ?
      `).all(from, to) as any[]
      const existing = new Map<string, any>()
      for (const r of existingRows) existing.set(`${r.log_date}|${r.period}`, r)

      // Per-zone random-walk state: one running value per field, drifting between
      // readings rather than independent white noise.
      const prev = new Map<string, number>()
      for (const b of bands) prev.set(b.field, b.lo + (b.hi - b.lo) * Math.random())

      const y = String(year).padStart(4, '0')
      const m = String(month).padStart(2, '0')

      for (let day = 1; day <= lastDay; day++) {
        const log_date = `${y}-${m}-${String(day).padStart(2, '0')}`
        for (const period of [1, 2, 3]) {
          const cur = existing.get(`${log_date}|${period}`)
          const sets: Record<string, number> = {}
          for (const b of bands) {
            // fill-empty: only NULL cells; 'all': always regenerate.
            if (fillMode === 'fill-empty' && cur && cur[b.field] != null) continue
            const drift = (Math.random() * 0.5 + 0.5) * (Math.random() < 0.5 ? -1 : 1)
            const next = clamp((prev.get(b.field) as number) + drift, b.lo, b.hi)
            prev.set(b.field, next)
            sets[b.field] = roundVal(next, b.round)
          }
          const cols = Object.keys(sets)
          if (cols.length === 0) continue

          const insertCols = ['log_date', 'period', ...cols, 'recorded_by']
          const insertVals = ['@log_date', '@period', ...cols.map(c => `@${c}`), '@uid']
          const updateSet = cols.map(c => `${c} = @${c}`).join(', ')
          db.prepare(`
            INSERT INTO env_log (${insertCols.join(', ')})
            VALUES (${insertVals.join(', ')})
            ON CONFLICT(log_date, period) DO UPDATE SET
              ${updateSet},
              updated_at = datetime('now','localtime')
          `).run({ log_date, period, uid, ...sets })
        }
      }
    })()

    return db.prepare(`
      SELECT * FROM env_log
      WHERE log_date BETWEEN ? AND ?
      ORDER BY log_date, period
    `).all(from, to)
  })

  // Singleton settings — read-or-INSERT-DEFAULT (first call materializes GPP
  // defaults). Ungated read. Mirrors settings:getDocumentSettings.
  ipcMain.handle('env:getSettings', () => {
    const db = getDb()
    return ensureSettings(db)
  })

  // Toggle the two zone-enabled flags from the on-page "จุดวัด" popover.
  // DEVIATION: NO requireAdmin here. This is an operational layout preference
  // (which measurement points the shop actually uses) driven by a shop-floor
  // popover, with no money/security impact — the same carve-out rationale as
  // settings:saveBarcodeStickerSettings (ipc-api.md "settings writes admin-only"
  // + the DEVIATION comment at electron/ipc/settings.ts:666-670).
  ipcMain.handle('env:setZones', (_e, { zone_reserve_enabled, zone_fridge_enabled }: { zone_reserve_enabled: number; zone_fridge_enabled: number }) => {
    const db = getDb()
    const row = ensureSettings(db)
    db.prepare(`
      UPDATE env_settings SET
        zone_reserve_enabled = @reserve,
        zone_fridge_enabled = @fridge,
        updated_at = datetime('now','localtime')
      WHERE id = @id
    `).run({
      reserve: zone_reserve_enabled ? 1 : 0,
      fridge: zone_fridge_enabled ? 1 : 0,
      id: row.id,
    })
    return db.prepare(`SELECT * FROM env_settings ORDER BY id LIMIT 1`).get()
  })

  // Threshold upsert from the Settings tab (admin write). The {id,updated_at,
  // ...rest} dynamic UPDATE is NOT itself an allow-list — intersect
  // Object.keys(rest) with SETTINGS_COLUMNS before building SQL so a stray key
  // can't throw "no such column" (handler-side guard; the renderer is the first
  // gate, mirroring saveDocumentSettings).
  // NO CALLER after EnvironmentTab removal (2026-06-20) — kept harmless; thresholds now SSOT in src/lib/env/thresholds.ts
  ipcMain.handle('env:saveSettings', (e, data: any) => {
    requireAdmin(e)
    const db = getDb()
    db.transaction(() => {
      const row = ensureSettings(db)
      const { id, updated_at, ...rest } = data ?? {}
      const cols = Object.keys(rest).filter(k => SETTINGS_COLUMNS.has(k))
      if (cols.length) {
        const fields = cols.map(k => `${k} = @${k}`).join(', ')
        const params: Record<string, any> = { id: row.id }
        for (const k of cols) params[k] = rest[k]
        db.prepare(`UPDATE env_settings SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`)
          .run(params)
      }
    })()
    return db.prepare(`SELECT * FROM env_settings ORDER BY id LIMIT 1`).get()
  })
}
