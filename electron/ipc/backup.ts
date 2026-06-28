import { ipcMain, dialog, shell, app } from 'electron'
import path from 'path'
import fs from 'fs'
import dayjs from 'dayjs'
import Database from 'better-sqlite3'
import { getDb, getDbPath, closeDb, lockDb } from '../db'
import { requirePermission } from '../auth/permissions'

interface BackupConfig {
  id: number
  auto_enabled: number
  retention_count: number
  backup_dir: string | null
  last_auto_backup_at: string | null
}

function defaultBackupsDir(): string {
  return path.join(app.getPath('userData'), 'backups')
}

// Resolve the active auto-backup folder: the user-chosen backup_dir if set and
// writable, else the default. Falls back silently when the chosen folder is gone
// (USB unplugged, network share offline) so an auto-backup still lands somewhere.
function resolveBackupsDir(): string {
  const def = defaultBackupsDir()
  let dir = def
  try {
    const row = getDb()
      .prepare(`SELECT backup_dir FROM backup_settings ORDER BY id LIMIT 1`)
      .get() as { backup_dir: string | null } | undefined
    if (row?.backup_dir) dir = row.backup_dir
  } catch {
    /* fall back to default */
  }
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.accessSync(dir, fs.constants.W_OK)
    return dir
  } catch {
    fs.mkdirSync(def, { recursive: true })
    return def
  }
}

const fullStamp = () => dayjs().format('YYYYMMDD-HHmmss')
// Auto backups are named by DATE only, so repeated backups on the same day
// (e.g. a lunch-close then an evening-close) overwrite into one file — at most
// one auto-*.db per calendar day, always holding the latest state.
const autoTarget = (dir: string) => path.join(dir, `auto-${dayjs().format('YYYYMMDD')}.db`)

function readConfig(db: Database.Database): BackupConfig {
  let s = db.prepare(`SELECT * FROM backup_settings ORDER BY id LIMIT 1`).get() as BackupConfig | undefined
  if (!s) {
    db.prepare(`INSERT INTO backup_settings DEFAULT VALUES`).run()
    s = db.prepare(`SELECT * FROM backup_settings ORDER BY id LIMIT 1`).get() as BackupConfig
  }
  return s
}

// Promote a fully-written temp file to its final name. Writing to <target>.tmp
// first means an interrupted/abrupt kill (force-quit, power loss) leaves only a
// stray .tmp — never a 0-byte "latest" backup that pruning would keep while
// discarding good older ones. .tmp files are excluded from listing + pruning
// (they don't end in .db). Rm-then-rename keeps it cross-platform (Windows
// renameSync refuses to overwrite).
function promote(tmp: string, target: string) {
  fs.rmSync(target, { force: true })
  fs.renameSync(tmp, target)
}

function finalize(db: Database.Database, dir: string, retention: number) {
  db.prepare(
    `UPDATE backup_settings SET last_auto_backup_at = datetime('now','localtime')
      WHERE id = (SELECT id FROM backup_settings ORDER BY id LIMIT 1)`,
  ).run()
  pruneBackups(dir, retention)
}

function saveBackupDir(dir: string | null) {
  const db = getDb()
  db.transaction(() => {
    let row = db.prepare(`SELECT id FROM backup_settings ORDER BY id LIMIT 1`).get() as any
    if (!row) {
      const r = db.prepare(`INSERT INTO backup_settings DEFAULT VALUES`).run()
      row = { id: r.lastInsertRowid }
    }
    db.prepare(`UPDATE backup_settings SET backup_dir = @dir, updated_at = datetime('now','localtime') WHERE id = @id`)
      .run({ dir, id: row.id })
  })()
}

// Validate a candidate .db before letting it overwrite the live database.
// Opens read-only (fileMustExist so a non-existent path fails instead of
// creating an empty db), runs integrity_check, and confirms the core tables
// exist. Always closes the validation connection before returning.
function validateBackupFile(file: string): { ok: boolean; error?: string } {
  let vdb: Database.Database | null = null
  try {
    vdb = new Database(file, { readonly: true, fileMustExist: true })
    const integrity = vdb.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') return { ok: false, error: 'ไฟล์ฐานข้อมูลเสียหาย (integrity check ไม่ผ่าน)' }
    const row = vdb
      .prepare(
        `SELECT count(*) AS n FROM sqlite_master
          WHERE type='table' AND name IN ('products','sales','settings')`,
      )
      .get() as { n: number }
    if (row.n < 3) return { ok: false, error: 'ไฟล์นี้ไม่ใช่ฐานข้อมูล Syntropic ที่ถูกต้อง' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'ไม่สามารถอ่านไฟล์ฐานข้อมูลได้' }
  } finally {
    vdb?.close()
  }
}

// statSync, skipping files that vanished between readdir and stat (a concurrent
// prune/restore can remove one mid-iteration).
function safeMtime(file: string): number | null {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return null
  }
}

// Keep only the newest `keep` files within each backup prefix group
// (auto-*.db AND pre-restore-*.db), so neither grows unbounded. Also sweeps
// orphan .tmp/.tmp-journal left by an interrupted backup — runs in finalize,
// after a successful promote, so nothing in flight is removed.
function pruneBackups(dir: string, keep: number) {
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('auto-') && (f.endsWith('.tmp') || f.endsWith('.tmp-journal'))) {
      fs.rmSync(path.join(dir, f), { force: true })
    }
  }
  for (const prefix of ['auto-', 'pre-restore-']) {
    const files = fs
      .readdirSync(dir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.db'))
      .map(f => ({ f, m: safeMtime(path.join(dir, f)) }))
      .filter((x): x is { f: string; m: number } => x.m !== null)
      .sort((a, b) => b.m - a.m)
    for (const { f } of files.slice(Math.max(1, keep))) {
      fs.rmSync(path.join(dir, f), { force: true })
    }
  }
}

export function registerBackupHandlers() {
  // Export a full snapshot to a user-chosen location. Uses the SQLite online
  // backup API (WAL-safe — captures committed data without a manual checkpoint).
  ipcMain.handle('backup:export', async (_e) => {
    requirePermission(_e, 'data.backup')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'สำรองฐานข้อมูล',
      defaultPath: `syntropic-backup-${fullStamp()}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      await getDb().backup(filePath)
    } catch (e: any) {
      // The destination is exactly where this feature gets used (USB, cloud
      // drive) — surface a clean message instead of leaking a raw driver error.
      return { ok: false, error: e?.message ?? 'เขียนไฟล์สำรองไม่สำเร็จ' }
    }
    return { ok: true, path: filePath }
  })

  // Restore from a chosen .db. Validates first, snapshots the current db, then
  // STAGES the chosen file as <db>.incoming and relaunches — the actual swap
  // happens at next boot via applyPendingRestore(), before getDb() reopens.
  ipcMain.handle('backup:restore', async (_e) => {
    requirePermission(_e, 'data.backup')
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'เลือกไฟล์สำรองเพื่อกู้คืน',
      properties: ['openFile'],
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    const picked = filePaths[0]

    const check = validateBackupFile(picked)
    if (!check.ok) return { ok: false, error: check.error }

    try {
      // Safety net: snapshot the live db before replacing it.
      const dir = resolveBackupsDir()
      await getDb().backup(path.join(dir, `pre-restore-${fullStamp()}.db`))
      // Stage — do NOT touch the live file here (avoids reopen race + Windows lock).
      fs.copyFileSync(picked, getDbPath() + '.incoming')
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'กู้คืนไม่สำเร็จ' }
    }

    // Bar any reopen first (a queued renderer IPC could otherwise recreate +
    // reseed the file before relaunch), then release the connection and
    // relaunch. Nothing async/getDb() may run after this point.
    lockDb()
    closeDb()
    app.relaunch()
    app.quit()
    return { ok: true }
  })

  // Returns the settings row plus the resolved default dir so the UI can label
  // "ค่าเริ่มต้น" without knowing the userData path.
  ipcMain.handle('backup:getSettings', () => {
    const row = readConfig(getDb())
    return { ...row, default_dir: defaultBackupsDir() }
  })

  // Allow-list: only the two user-editable columns are written here, so the
  // renderer can never clobber backup_dir / last_auto_backup_at / id via a
  // stray payload key. (backup_dir is set through pickFolder/resetFolder.)
  ipcMain.handle(
    'backup:saveSettings',
    (_e, data: { auto_enabled: boolean; retention_count: number }) => {
      requirePermission(_e, 'data.backup')
      const db = getDb()
      const auto_enabled = data.auto_enabled ? 1 : 0
      const retention_count = Math.max(1, Math.floor(Number(data.retention_count) || 7))
      db.transaction(() => {
        let row = db.prepare(`SELECT id FROM backup_settings ORDER BY id LIMIT 1`).get() as any
        if (!row) {
          const r = db.prepare(`INSERT INTO backup_settings DEFAULT VALUES`).run()
          row = { id: r.lastInsertRowid }
        }
        db.prepare(
          `UPDATE backup_settings
              SET auto_enabled = @auto_enabled,
                  retention_count = @retention_count,
                  updated_at = datetime('now','localtime')
            WHERE id = @id`,
        ).run({ auto_enabled, retention_count, id: row.id })
      })()
      return { ...readConfig(db), default_dir: defaultBackupsDir() }
    },
  )

  // Pick + persist the auto-backup destination folder. Rejects a non-writable
  // choice so a backup never silently fails later.
  ipcMain.handle('backup:pickFolder', async (_e) => {
    requirePermission(_e, 'data.backup')
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'เลือกโฟลเดอร์สำรองข้อมูล',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    const dir = filePaths[0]
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.accessSync(dir, fs.constants.W_OK)
    } catch {
      return { ok: false, error: 'โฟลเดอร์นี้เขียนไม่ได้ กรุณาเลือกที่อื่น' }
    }
    saveBackupDir(dir)
    return { ok: true, path: dir }
  })

  ipcMain.handle('backup:resetFolder', (_e) => {
    requirePermission(_e, 'data.backup')
    saveBackupDir(null)
    return { ok: true, path: defaultBackupsDir() }
  })

  // Lists every backup in the active folder (auto-* and pre-restore-*). Both
  // groups are bounded by pruneBackups(); manual exports go elsewhere.
  ipcMain.handle('backup:listAuto', () => {
    const dir = resolveBackupsDir()
    return fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const full = path.join(dir, f)
        try {
          const st = fs.statSync(full)
          return { name: f, path: full, size: st.size, mtime: dayjs(st.mtime).toISOString() }
        } catch {
          return null
        }
      })
      .filter((x): x is { name: string; path: string; size: number; mtime: string } => x !== null)
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1))
  })

  ipcMain.handle('backup:openFolder', async () => {
    const err = await shell.openPath(resolveBackupsDir())
    return err ? { ok: false, error: err } : { ok: true }
  })
}

// ── Auto-backup triggers ──────────────────────────────────────────────────
// Model: back up when the program CLOSES (the end-of-day state), plus a midnight
// timer that only matters when the terminal is left running across midnight.
// A shop that closes the app daily gets exactly one backup/day from the close;
// an always-on terminal gets one/day from the timer. Auto files are date-named
// so same-day repeats overwrite into a single file.

// On-quit backup. SYNCHRONOUS (VACUUM INTO) because async db.backup() can't
// reliably finish before the process exits. Runs once per process.
let closeBackupDone = false
export function runCloseBackup(): void {
  if (closeBackupDone) return
  closeBackupDone = true
  try {
    const db = getDb() // throws if locked (restore in progress) → caught → skipped
    const s = readConfig(db)
    if (!s.auto_enabled) return
    const dir = resolveBackupsDir()
    const target = autoTarget(dir)
    const tmp = target + '.tmp'
    fs.rmSync(tmp, { force: true }) // VACUUM INTO refuses to overwrite an existing file
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`)
    promote(tmp, target) // only a fully-written file becomes the day's backup
    finalize(db, dir, s.retention_count)
  } catch (err) {
    console.error('close-backup failed', err)
  }
}

// Midnight scheduler — fires at 00:00 local each day while the app runs, so an
// always-on terminal still gets a daily backup. Re-arms itself after each fire.
let dailyTimer: NodeJS.Timeout | null = null
export function scheduleDailyBackup(): void {
  if (dailyTimer) clearTimeout(dailyTimer)
  const ms = Math.max(1000, dayjs().add(1, 'day').startOf('day').diff(dayjs()))
  dailyTimer = setTimeout(() => {
    runScheduledBackup().finally(() => scheduleDailyBackup())
  }, ms)
  dailyTimer.unref?.() // never keep the process alive just for the timer
}

async function runScheduledBackup(): Promise<void> {
  try {
    const db = getDb()
    const s = readConfig(db)
    if (!s.auto_enabled) return
    const today = dayjs().format('YYYY-MM-DD')
    if (s.last_auto_backup_at && dayjs(s.last_auto_backup_at).format('YYYY-MM-DD') === today) return
    const dir = resolveBackupsDir()
    const target = autoTarget(dir)
    const tmp = target + '.tmp'
    fs.rmSync(tmp, { force: true })
    await db.backup(tmp)
    promote(tmp, target)
    finalize(db, dir, s.retention_count)
  } catch (err) {
    console.error('scheduled-backup failed', err)
  }
}
