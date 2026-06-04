---
name: project_db_backup
description: Full-DB backup/export/restore feature — stage-then-relaunch restore, on-quit (sync VACUUM INTO) + midnight auto-backup, user-selectable folder
metadata:
  type: project
---

## Feature scope (decided 2026-06-04)

Settings → "ฐานข้อมูล" tab. Full `.db`-file backup/export, restore/import, and daily auto-backup. Scope is **full DB file only** (no CSV/JSON per-table export — user explicitly chose this).

**Auto-backup TIMING was revised same day** (do NOT re-add startup backup): backup ON QUIT + a midnight timer — NOT on startup. See "Auto-backup triggers" below. The user-selectable destination folder was added in the same revision.

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
| `<backupsDir>/auto-YYYYMMDD.db` | Daily auto-backup — **DATE-named** so same-day repeats overwrite into one file (≤1/day). Pruned to retention_count (default 7) |
| `<backupsDir>/auto-YYYYMMDD.db.tmp` | In-progress write; promoted via atomic rename only when complete (interrupted kill leaves a harmless .tmp, never a 0-byte .db). Swept by pruneBackups |
| `<backupsDir>/pre-restore-YYYYMMDD-HHmmss.db` | Pre-restore safety snapshot (also pruned to retention_count) |
| User-chosen location | Manual exports (not in backups dir) |

`<backupsDir>` = the user-chosen `backup_dir` if set+writable, else `userData/backups` (resolved by `resolveBackupsDir()`, falls back to default when the chosen folder is gone — USB unplugged). User picks it via `backup:pickFolder` / clears via `backup:resetFolder`.

## Settings singleton: `backup_settings` table

| Column | Type | Default | Mutable | Purpose |
|--------|------|---------|---------|---------|
| id | INTEGER PK | — | No | Singleton (resolve by `ORDER BY id LIMIT 1`, NOT hardcoded id=1) |
| auto_enabled | INTEGER | 1 | Yes | Gates BOTH the on-quit and midnight backups |
| retention_count | INTEGER | 7 | Yes | Max files to keep per prefix (auto-* and pre-restore-*) |
| backup_dir | TEXT | NULL | Via pickFolder | User-chosen destination; NULL = default userData/backups. Added by migration (ALTER in schema.ts array) |
| last_auto_backup_at | TEXT | NULL | No (internal) | Set after each auto-backup; day-gates the midnight timer |
| updated_at | TEXT | now | No (internal) | Updated by saveSettings |

**Allow-list on saveSettings()**: only `auto_enabled` + `retention_count` from renderer. `backup_dir` is written only via `saveBackupDir()` (pickFolder/resetFolder). `last_auto_backup_at`/`id` cannot be clobbered.

## Auto-backup triggers (revised model — NOT on startup)

Two triggers, both gated by `auto_enabled`. Files are date-named so the two never produce >1/day in normal use; retention pruning bounds the rest.

1. **On quit** — `runCloseBackup()`, wired in `main.ts` `before-quit` (runs, then `closeDb()`). This is the PRIMARY backup (captures end-of-day state for a shop that closes the app daily).
   - **SYNCHRONOUS** `VACUUM INTO` (NOT async `db.backup()`) — async can't reliably finish before the process exits. VACUUM INTO is WAL-safe and captures committed data WITHOUT a checkpoint (verified empirically on the real 20MB DB; a prepended `wal_checkpoint` makes ZERO difference — do not add one).
   - Self-guards via `closeBackupDone` to run once. During restore, `getDb()` throws (lockDb) → caught → skipped, leaving the staged `.incoming` untouched.
2. **Midnight timer** — `scheduleDailyBackup()` (setTimeout to next 00:00, `.unref()`, re-arms in `.finally()`). Only matters for an always-on terminal left running across midnight (on-quit never fires there). Uses async `db.backup()` (app is alive). Day-gated by `last_auto_backup_at`.

**Write-to-temp-then-rename** (`promote()`): every auto-backup writes `<target>.tmp` first, then atomically renames. An interrupted/abrupt kill leaves only a stray `.tmp` (excluded from listing + swept by pruneBackups) — NEVER a 0-byte `.db` that pruning would keep while discarding good older backups. This is the fix for the real failure mode (an interrupted VACUUM), NOT the checkpoint red herring.

Manual export + pre-restore still use async `db.backup()` (called while app is alive / awaited).

## Related memories

- [[feedback_confirm_dialog_content_pattern]] — restore confirmation uses the destructive dialog pattern
- [[project_printer_settings]] — similar settings-tab singleton pattern (one row, user-editable fields allow-listed)

## Files involved

- `electron/ipc/backup.ts` (NEW) — IPC handlers + restore + prune + validate + `runCloseBackup()`/`scheduleDailyBackup()` + `resolveBackupsDir()`/`promote()`
- `electron/db/index.ts` — `lockDb()`, `applyPendingRestore()`, `getDbPath()`
- `electron/db/schema.ts` — `backup_settings` table + `backup_dir` migration ALTER (in the try/catch migration array)
- `electron/main.ts` — `applyPendingRestore()` before getDb(); `scheduleDailyBackup()` after createWindow(); `before-quit` → `runCloseBackup()` then `closeDb()` (closeDb removed from window-all-closed)
- `electron/preload.ts` — `window.api.backup.*` (export/restore/getSettings/saveSettings/pickFolder/resetFolder/listAuto/openFolder)
- `src/pages/Settings/DatabaseTab.tsx` — UI: export/restore/auto-backup + folder picker + file list
- `src/types/index.ts` — BackupSettings (incl. backup_dir) + BackupFileInfo
