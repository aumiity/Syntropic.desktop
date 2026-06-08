import Database from 'better-sqlite3';
/** Permanently bar getDb() from reopening for the rest of this process.
 *  The restore handler calls this right before closeDb() so a queued/in-flight
 *  renderer IPC can't lazily recreate (and reseed!) syntropic.db in the window
 *  between closeDb() and the relaunch — the staged restore must win untouched.
 *  Only reset by a fresh process after relaunch. */
export declare function lockDb(): void;
/** Absolute path to the live SQLite file. Shared by getDb() and the backup
 *  feature so the location is defined in exactly one place. */
export declare function getDbPath(): string;
/** Swap in a restored database staged by the backup feature.
 *  The restore handler can't overwrite the live file while it's open (Windows
 *  locks it, and getDb() could reopen mid-swap), so it copies the chosen backup
 *  to `<db>.incoming` and relaunches. This runs at startup BEFORE getDb() opens
 *  anything: if a staged file exists, drop the old db + its WAL companions and
 *  rename the staged file into place. Safe to call every launch (no-op when no
 *  pending restore). */
export declare function applyPendingRestore(): void;
export declare function getDb(): Database.Database;
export declare function closeDb(): void;
