import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { initializeSchema } from './schema';
import { seedDatabase } from './seed';
var db;
var locked = false;
/** Permanently bar getDb() from reopening for the rest of this process.
 *  The restore handler calls this right before closeDb() so a queued/in-flight
 *  renderer IPC can't lazily recreate (and reseed!) syntropic.db in the window
 *  between closeDb() and the relaunch — the staged restore must win untouched.
 *  Only reset by a fresh process after relaunch. */
export function lockDb() {
    locked = true;
}
/** Absolute path to the live SQLite file. Shared by getDb() and the backup
 *  feature so the location is defined in exactly one place. */
export function getDbPath() {
    return path.join(app.getPath('userData'), 'database', 'syntropic.db');
}
/** Swap in a restored database staged by the backup feature.
 *  The restore handler can't overwrite the live file while it's open (Windows
 *  locks it, and getDb() could reopen mid-swap), so it copies the chosen backup
 *  to `<db>.incoming` and relaunches. This runs at startup BEFORE getDb() opens
 *  anything: if a staged file exists, drop the old db + its WAL companions and
 *  rename the staged file into place. Safe to call every launch (no-op when no
 *  pending restore). */
export function applyPendingRestore() {
    var dbPath = getDbPath();
    var incoming = dbPath + '.incoming';
    if (!fs.existsSync(incoming))
        return;
    var dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir))
        fs.mkdirSync(dbDir, { recursive: true });
    // Stale WAL/SHM belong to the OLD database — they must not be replayed onto
    // the restored file, so remove them before swapping.
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
    fs.rmSync(dbPath, { force: true });
    fs.renameSync(incoming, dbPath);
}
export function getDb() {
    if (locked)
        throw new Error('ฐานข้อมูลถูกล็อกเพื่อกู้คืน — กำลังรีสตาร์ทโปรแกรม');
    if (!db) {
        var dbPath = getDbPath();
        var dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir))
            fs.mkdirSync(dbDir, { recursive: true });
        db = new Database(dbPath);
        initializeSchema(db);
        seedDatabase(db);
    }
    return db;
}
export function closeDb() {
    if (db) {
        db.close();
        db = undefined;
    }
}
