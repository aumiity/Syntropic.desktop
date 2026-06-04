import { ipcMain, dialog, shell, app } from 'electron'
import path from 'path'
import fs from 'fs'
import dayjs from 'dayjs'
import Database from 'better-sqlite3'
import { getDb, getDbPath, closeDb, lockDb } from '../db'

// Where auto + pre-restore backups live. Created on demand because
// db.backup() throws if the destination directory doesn't exist yet.
function getBackupsDir(): string {
  const dir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const stamp = () => dayjs().format('YYYYMMDD-HHmmss')

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
// (auto-*.db AND pre-restore-*.db), so neither grows unbounded.
function pruneBackups(dir: string, keep: number) {
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
  ipcMain.handle('backup:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'สำรองฐานข้อมูล',
      defaultPath: `syntropic-backup-${stamp()}.db`,
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
  ipcMain.handle('backup:restore', async () => {
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
      const dir = getBackupsDir()
      await getDb().backup(path.join(dir, `pre-restore-${stamp()}.db`))
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

  ipcMain.handle('backup:getSettings', () => {
    const db = getDb()
    let row = db.prepare(`SELECT * FROM backup_settings ORDER BY id LIMIT 1`).get()
    if (!row) {
      db.prepare(`INSERT INTO backup_settings DEFAULT VALUES`).run()
      row = db.prepare(`SELECT * FROM backup_settings ORDER BY id LIMIT 1`).get()
    }
    return row
  })

  // Allow-list: only the two user-editable columns are written, so the renderer
  // can never clobber last_auto_backup_at / id via a stray payload key.
  ipcMain.handle(
    'backup:saveSettings',
    (_e, data: { auto_enabled: boolean; retention_count: number }) => {
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
      return db.prepare(`SELECT * FROM backup_settings ORDER BY id LIMIT 1`).get()
    },
  )

  // Lists every backup in the folder (auto-* and pre-restore-*). Both groups are
  // bounded by pruneBackups(); manual exports go to user-chosen locations, not here.
  ipcMain.handle('backup:listAuto', () => {
    const dir = getBackupsDir()
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
    const err = await shell.openPath(getBackupsDir())
    return err ? { ok: false, error: err } : { ok: true }
  })
}

// Fire-and-forget auto-backup, called once at startup. Self-contained
// (try/catch) so a failure can never block the app from opening.
export async function runAutoBackup(): Promise<void> {
  try {
    const db = getDb()
    let s = db.prepare(`SELECT * FROM backup_settings ORDER BY id LIMIT 1`).get() as
      | { id: number; auto_enabled: number; retention_count: number; last_auto_backup_at: string | null }
      | undefined
    if (!s) {
      db.prepare(`INSERT INTO backup_settings DEFAULT VALUES`).run()
      s = db.prepare(`SELECT * FROM backup_settings ORDER BY id LIMIT 1`).get() as any
    }
    if (!s || !s.auto_enabled) return
    const today = dayjs().format('YYYY-MM-DD')
    if (s.last_auto_backup_at && dayjs(s.last_auto_backup_at).format('YYYY-MM-DD') === today) return

    const dir = getBackupsDir()
    await db.backup(path.join(dir, `auto-${stamp()}.db`))
    db.prepare(`UPDATE backup_settings SET last_auto_backup_at = datetime('now','localtime') WHERE id = ?`).run(s.id)
    pruneBackups(dir, s.retention_count || 7)
  } catch (err) {
    console.error('auto-backup failed', err)
  }
}
