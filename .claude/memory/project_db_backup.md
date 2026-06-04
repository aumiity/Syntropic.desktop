---
name: project_db_backup
description: Full-DB backup/export/restore feature with WAL-safe online API and stage-then-relaunch restore mechanism
metadata:
  type: project
---

## Feature scope (decided 2026-06-04)

Settings → "ฐานข้อมูล" tab. Full `.db`-file backup/export, restore/import, and once-per-day auto-backup. Scope is **full DB file only** (no CSV/JSON per-table export — user explicitly chose this).

## Restore mechanism (the critical non-obvious part)

**Stage-and-relaunch pattern** sidesteps Windows file-locking and the reopen race entirely. Do NOT attempt to overwrite the live DB in place.

1. **Validation first** (`validateBackupFile()` in backup.ts)
   - Open chosen file read-only with `fileMustExist: true` (fails instead of creating empty DB)
   - Run `integrity_check` pragma; must return `'ok'`
   - Confirm 3 core tables exist: products, sales, settings
   - Always close validation connection before returning

2. **Snapshot the live DB** before touching anything
   - Use `db.backup(path)` (WAL-safe, captures committed data)
   - Save to `backups/pre-restore-YYYYMMDD-HHmmss.db`

3. **Stage the chosen file** (NOT the live DB)
   - Copy selected file to `<dbPath>.incoming`
   - Do NOT touch the live `syntropic.db` or its WAL/SHM files yet

4. **Bar any concurrent recreate** via `lockDb()`
   - Set `locked = true` in `electron/db/index.ts` right before `closeDb()`
   - Prevents a queued renderer IPC from lazily re-creating + reseeding the file between `closeDb()` and relaunch

5. **Close, relaunch, then swap** (in `main.ts` app.whenReady)
   - `handleRestore()` returns immediately after calling `app.relaunch()` + `app.quit()`
   - On next boot, `applyPendingRestore()` runs in `app.whenReady()` BEFORE any `getDb()` call:
     - Delete stale `-wal` and `-shm` companions of the OLD database
     - Delete the old `syntropic.db` itself
     - Rename `.incoming` → `syntropic.db` in one syscall (atomic)
   - `getDb()` now opens the restored file

**Why this works:**
- Avoids Windows file-lock on the live DB (never try to overwrite while open)
- Atomic rename is single-syscall (no partial-write race)
- `lockDb()` blocks any IPC-spawned recreation between closeDb() and relaunch
- Safe to call `applyPendingRestore()` every launch (no-op when no pending restore)

## Backup API: `db.backup(path)` — WAL-safe online copy

- better-sqlite3 v12.9.0+ native method
- Captures committed data without manual checkpoint
- Works while DB is open (safe in production)
- **Destination DIRECTORY must exist first** — throws otherwise (hence `getBackupsDir()` calls `mkdirSync(recursive)` every call)
- Used for: user exports, pre-restore snapshots, auto-backups

## File paths

| File | Purpose |
|------|---------|
| `userData/database/syntropic.db` | Live database |
| `userData/database/syntropic.db.incoming` | Staged restore candidate (swapped in at next boot) |
| `userData/database/syntropic.db-wal` | Write-ahead log (deleted before restore swap) |
| `userData/database/syntropic.db-shm` | Shared memory file (deleted before restore swap) |
| `userData/backups/auto-YYYYMMDD-HHmmss.db` | Once-per-day auto-backup (pruned to retention_count, default 7) |
| `userData/backups/pre-restore-YYYYMMDD-HHmmss.db` | Pre-restore safety snapshot (also pruned to retention_count) |
| User-chosen location | Manual exports (not in backups dir) |

## Settings singleton: `backup_settings` table

| Column | Type | Default | Mutable | Purpose |
|--------|------|---------|---------|---------|
| id | INTEGER PK | — | No | Singleton (always id=1) |
| auto_enabled | INTEGER | 1 | Yes | Gates once-per-day backup on app launch |
| retention_count | INTEGER | 7 | Yes | Max files to keep per prefix (auto-* and pre-restore-*) |
| last_auto_backup_at | TEXT | NULL | No (internal) | Set by `runAutoBackup()`; checked daily to prevent double-runs |
| updated_at | TEXT | now | No (internal) | Updated by saveSettings |

**Allow-list on saveSettings()** (line 138 in backup.ts): only `auto_enabled` + `retention_count` from renderer. `last_auto_backup_at` and `id` cannot be clobbered.

## Auto-backup (fire-and-forget)

- Runs once at startup via `runAutoBackup()` (line 188 in backup.ts)
- **Never blocks window show** (called after `createWindow()` returns, exceptions caught)
- Checks if enabled AND if today's backup already exists (compares `last_auto_backup_at` date)
- If due, backs up to `auto-YYYYMMDD-HHmmss.db`, updates `last_auto_backup_at`, prunes old backups
- Pruning keeps only newest `retention_count` files per prefix (auto-* and pre-restore-* tracked separately)

## Related memories

- [[feedback_confirm_dialog_content_pattern]] — restore confirmation uses the destructive dialog pattern
- [[project_printer_settings]] — similar settings-tab singleton pattern (one row, user-editable fields allow-listed)

## Files involved

- `electron/ipc/backup.ts` (NEW) — all IPC handlers + restore logic + prune + validate
- `electron/db/index.ts` — `lockDb()`, `applyPendingRestore()`, `getDbPath()`
- `electron/db/schema.ts` — `backup_settings` table definition (lines 504–513)
- `electron/main.ts` — `applyPendingRestore()` call before getDb() (line 96), `runAutoBackup()` after window show (line 99)
- `electron/preload.ts` — `window.api.backup.*` namespace (lines 202–220)
- `src/pages/Settings/DatabaseTab.tsx` — UI: export/restore/auto-backup controls + file list
- `src/types/index.ts` — BackupFileInfo type
