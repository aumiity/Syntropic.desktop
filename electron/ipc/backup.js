var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { ipcMain, dialog, shell, app } from 'electron';
import path from 'path';
import fs from 'fs';
import dayjs from 'dayjs';
import Database from 'better-sqlite3';
import { getDb, getDbPath, closeDb, lockDb } from '../db';
import { requireAdmin } from '../auth/session';
function defaultBackupsDir() {
    return path.join(app.getPath('userData'), 'backups');
}
// Resolve the active auto-backup folder: the user-chosen backup_dir if set and
// writable, else the default. Falls back silently when the chosen folder is gone
// (USB unplugged, network share offline) so an auto-backup still lands somewhere.
function resolveBackupsDir() {
    var def = defaultBackupsDir();
    var dir = def;
    try {
        var row = getDb()
            .prepare("SELECT backup_dir FROM backup_settings ORDER BY id LIMIT 1")
            .get();
        if (row === null || row === void 0 ? void 0 : row.backup_dir)
            dir = row.backup_dir;
    }
    catch (_a) {
        /* fall back to default */
    }
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return dir;
    }
    catch (_b) {
        fs.mkdirSync(def, { recursive: true });
        return def;
    }
}
var fullStamp = function () { return dayjs().format('YYYYMMDD-HHmmss'); };
// Auto backups are named by DATE only, so repeated backups on the same day
// (e.g. a lunch-close then an evening-close) overwrite into one file — at most
// one auto-*.db per calendar day, always holding the latest state.
var autoTarget = function (dir) { return path.join(dir, "auto-".concat(dayjs().format('YYYYMMDD'), ".db")); };
function readConfig(db) {
    var s = db.prepare("SELECT * FROM backup_settings ORDER BY id LIMIT 1").get();
    if (!s) {
        db.prepare("INSERT INTO backup_settings DEFAULT VALUES").run();
        s = db.prepare("SELECT * FROM backup_settings ORDER BY id LIMIT 1").get();
    }
    return s;
}
// Promote a fully-written temp file to its final name. Writing to <target>.tmp
// first means an interrupted/abrupt kill (force-quit, power loss) leaves only a
// stray .tmp — never a 0-byte "latest" backup that pruning would keep while
// discarding good older ones. .tmp files are excluded from listing + pruning
// (they don't end in .db). Rm-then-rename keeps it cross-platform (Windows
// renameSync refuses to overwrite).
function promote(tmp, target) {
    fs.rmSync(target, { force: true });
    fs.renameSync(tmp, target);
}
function finalize(db, dir, retention) {
    db.prepare("UPDATE backup_settings SET last_auto_backup_at = datetime('now','localtime')\n      WHERE id = (SELECT id FROM backup_settings ORDER BY id LIMIT 1)").run();
    pruneBackups(dir, retention);
}
function saveBackupDir(dir) {
    var db = getDb();
    db.transaction(function () {
        var row = db.prepare("SELECT id FROM backup_settings ORDER BY id LIMIT 1").get();
        if (!row) {
            var r = db.prepare("INSERT INTO backup_settings DEFAULT VALUES").run();
            row = { id: r.lastInsertRowid };
        }
        db.prepare("UPDATE backup_settings SET backup_dir = @dir, updated_at = datetime('now','localtime') WHERE id = @id")
            .run({ dir: dir, id: row.id });
    })();
}
// Validate a candidate .db before letting it overwrite the live database.
// Opens read-only (fileMustExist so a non-existent path fails instead of
// creating an empty db), runs integrity_check, and confirms the core tables
// exist. Always closes the validation connection before returning.
function validateBackupFile(file) {
    var _a;
    var vdb = null;
    try {
        vdb = new Database(file, { readonly: true, fileMustExist: true });
        var integrity = vdb.pragma('integrity_check', { simple: true });
        if (integrity !== 'ok')
            return { ok: false, error: 'ไฟล์ฐานข้อมูลเสียหาย (integrity check ไม่ผ่าน)' };
        var row = vdb
            .prepare("SELECT count(*) AS n FROM sqlite_master\n          WHERE type='table' AND name IN ('products','sales','settings')")
            .get();
        if (row.n < 3)
            return { ok: false, error: 'ไฟล์นี้ไม่ใช่ฐานข้อมูล Syntropic ที่ถูกต้อง' };
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: (_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : 'ไม่สามารถอ่านไฟล์ฐานข้อมูลได้' };
    }
    finally {
        vdb === null || vdb === void 0 ? void 0 : vdb.close();
    }
}
// statSync, skipping files that vanished between readdir and stat (a concurrent
// prune/restore can remove one mid-iteration).
function safeMtime(file) {
    try {
        return fs.statSync(file).mtimeMs;
    }
    catch (_a) {
        return null;
    }
}
// Keep only the newest `keep` files within each backup prefix group
// (auto-*.db AND pre-restore-*.db), so neither grows unbounded. Also sweeps
// orphan .tmp/.tmp-journal left by an interrupted backup — runs in finalize,
// after a successful promote, so nothing in flight is removed.
function pruneBackups(dir, keep) {
    for (var _i = 0, _a = fs.readdirSync(dir); _i < _a.length; _i++) {
        var f = _a[_i];
        if (f.startsWith('auto-') && (f.endsWith('.tmp') || f.endsWith('.tmp-journal'))) {
            fs.rmSync(path.join(dir, f), { force: true });
        }
    }
    var _loop_1 = function (prefix) {
        var files = fs
            .readdirSync(dir)
            .filter(function (f) { return f.startsWith(prefix) && f.endsWith('.db'); })
            .map(function (f) { return ({ f: f, m: safeMtime(path.join(dir, f)) }); })
            .filter(function (x) { return x.m !== null; })
            .sort(function (a, b) { return b.m - a.m; });
        for (var _d = 0, _f = files.slice(Math.max(1, keep)); _d < _f.length; _d++) {
            var f = _f[_d].f;
            fs.rmSync(path.join(dir, f), { force: true });
        }
    };
    for (var _b = 0, _c = ['auto-', 'pre-restore-']; _b < _c.length; _b++) {
        var prefix = _c[_b];
        _loop_1(prefix);
    }
}
export function registerBackupHandlers() {
    var _this = this;
    // Export a full snapshot to a user-chosen location. Uses the SQLite online
    // backup API (WAL-safe — captures committed data without a manual checkpoint).
    ipcMain.handle('backup:export', function (_e) { return __awaiter(_this, void 0, void 0, function () {
        var _a, canceled, filePath, e_1;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    requireAdmin(_e);
                    return [4 /*yield*/, dialog.showSaveDialog({
                            title: 'สำรองฐานข้อมูล',
                            defaultPath: "syntropic-backup-".concat(fullStamp(), ".db"),
                            filters: [{ name: 'Database', extensions: ['db'] }],
                        })];
                case 1:
                    _a = _c.sent(), canceled = _a.canceled, filePath = _a.filePath;
                    if (canceled || !filePath)
                        return [2 /*return*/, { ok: false, canceled: true }];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, getDb().backup(filePath)];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _c.sent();
                    // The destination is exactly where this feature gets used (USB, cloud
                    // drive) — surface a clean message instead of leaking a raw driver error.
                    return [2 /*return*/, { ok: false, error: (_b = e_1 === null || e_1 === void 0 ? void 0 : e_1.message) !== null && _b !== void 0 ? _b : 'เขียนไฟล์สำรองไม่สำเร็จ' }];
                case 5: return [2 /*return*/, { ok: true, path: filePath }];
            }
        });
    }); });
    // Restore from a chosen .db. Validates first, snapshots the current db, then
    // STAGES the chosen file as <db>.incoming and relaunches — the actual swap
    // happens at next boot via applyPendingRestore(), before getDb() reopens.
    ipcMain.handle('backup:restore', function (_e) { return __awaiter(_this, void 0, void 0, function () {
        var _a, canceled, filePaths, picked, check, dir, e_2;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    requireAdmin(_e);
                    return [4 /*yield*/, dialog.showOpenDialog({
                            title: 'เลือกไฟล์สำรองเพื่อกู้คืน',
                            properties: ['openFile'],
                            filters: [{ name: 'Database', extensions: ['db'] }],
                        })];
                case 1:
                    _a = _c.sent(), canceled = _a.canceled, filePaths = _a.filePaths;
                    if (canceled || !(filePaths === null || filePaths === void 0 ? void 0 : filePaths.length))
                        return [2 /*return*/, { ok: false, canceled: true }];
                    picked = filePaths[0];
                    check = validateBackupFile(picked);
                    if (!check.ok)
                        return [2 /*return*/, { ok: false, error: check.error }];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    dir = resolveBackupsDir();
                    return [4 /*yield*/, getDb().backup(path.join(dir, "pre-restore-".concat(fullStamp(), ".db")))
                        // Stage — do NOT touch the live file here (avoids reopen race + Windows lock).
                    ];
                case 3:
                    _c.sent();
                    // Stage — do NOT touch the live file here (avoids reopen race + Windows lock).
                    fs.copyFileSync(picked, getDbPath() + '.incoming');
                    return [3 /*break*/, 5];
                case 4:
                    e_2 = _c.sent();
                    return [2 /*return*/, { ok: false, error: (_b = e_2 === null || e_2 === void 0 ? void 0 : e_2.message) !== null && _b !== void 0 ? _b : 'กู้คืนไม่สำเร็จ' }];
                case 5:
                    // Bar any reopen first (a queued renderer IPC could otherwise recreate +
                    // reseed the file before relaunch), then release the connection and
                    // relaunch. Nothing async/getDb() may run after this point.
                    lockDb();
                    closeDb();
                    app.relaunch();
                    app.quit();
                    return [2 /*return*/, { ok: true }];
            }
        });
    }); });
    // Returns the settings row plus the resolved default dir so the UI can label
    // "ค่าเริ่มต้น" without knowing the userData path.
    ipcMain.handle('backup:getSettings', function () {
        var row = readConfig(getDb());
        return __assign(__assign({}, row), { default_dir: defaultBackupsDir() });
    });
    // Allow-list: only the two user-editable columns are written here, so the
    // renderer can never clobber backup_dir / last_auto_backup_at / id via a
    // stray payload key. (backup_dir is set through pickFolder/resetFolder.)
    ipcMain.handle('backup:saveSettings', function (_e, data) {
        requireAdmin(_e);
        var db = getDb();
        var auto_enabled = data.auto_enabled ? 1 : 0;
        var retention_count = Math.max(1, Math.floor(Number(data.retention_count) || 7));
        db.transaction(function () {
            var row = db.prepare("SELECT id FROM backup_settings ORDER BY id LIMIT 1").get();
            if (!row) {
                var r = db.prepare("INSERT INTO backup_settings DEFAULT VALUES").run();
                row = { id: r.lastInsertRowid };
            }
            db.prepare("UPDATE backup_settings\n              SET auto_enabled = @auto_enabled,\n                  retention_count = @retention_count,\n                  updated_at = datetime('now','localtime')\n            WHERE id = @id").run({ auto_enabled: auto_enabled, retention_count: retention_count, id: row.id });
        })();
        return __assign(__assign({}, readConfig(db)), { default_dir: defaultBackupsDir() });
    });
    // Pick + persist the auto-backup destination folder. Rejects a non-writable
    // choice so a backup never silently fails later.
    ipcMain.handle('backup:pickFolder', function (_e) { return __awaiter(_this, void 0, void 0, function () {
        var _a, canceled, filePaths, dir;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    requireAdmin(_e);
                    return [4 /*yield*/, dialog.showOpenDialog({
                            title: 'เลือกโฟลเดอร์สำรองข้อมูล',
                            properties: ['openDirectory', 'createDirectory'],
                        })];
                case 1:
                    _a = _b.sent(), canceled = _a.canceled, filePaths = _a.filePaths;
                    if (canceled || !(filePaths === null || filePaths === void 0 ? void 0 : filePaths.length))
                        return [2 /*return*/, { ok: false, canceled: true }];
                    dir = filePaths[0];
                    try {
                        fs.mkdirSync(dir, { recursive: true });
                        fs.accessSync(dir, fs.constants.W_OK);
                    }
                    catch (_c) {
                        return [2 /*return*/, { ok: false, error: 'โฟลเดอร์นี้เขียนไม่ได้ กรุณาเลือกที่อื่น' }];
                    }
                    saveBackupDir(dir);
                    return [2 /*return*/, { ok: true, path: dir }];
            }
        });
    }); });
    ipcMain.handle('backup:resetFolder', function (_e) {
        requireAdmin(_e);
        saveBackupDir(null);
        return { ok: true, path: defaultBackupsDir() };
    });
    // Lists every backup in the active folder (auto-* and pre-restore-*). Both
    // groups are bounded by pruneBackups(); manual exports go elsewhere.
    ipcMain.handle('backup:listAuto', function () {
        var dir = resolveBackupsDir();
        return fs
            .readdirSync(dir)
            .filter(function (f) { return f.endsWith('.db'); })
            .map(function (f) {
            var full = path.join(dir, f);
            try {
                var st = fs.statSync(full);
                return { name: f, path: full, size: st.size, mtime: dayjs(st.mtime).toISOString() };
            }
            catch (_a) {
                return null;
            }
        })
            .filter(function (x) { return x !== null; })
            .sort(function (a, b) { return (a.mtime < b.mtime ? 1 : -1); });
    });
    ipcMain.handle('backup:openFolder', function () { return __awaiter(_this, void 0, void 0, function () {
        var err;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, shell.openPath(resolveBackupsDir())];
                case 1:
                    err = _a.sent();
                    return [2 /*return*/, err ? { ok: false, error: err } : { ok: true }];
            }
        });
    }); });
}
// ── Auto-backup triggers ──────────────────────────────────────────────────
// Model: back up when the program CLOSES (the end-of-day state), plus a midnight
// timer that only matters when the terminal is left running across midnight.
// A shop that closes the app daily gets exactly one backup/day from the close;
// an always-on terminal gets one/day from the timer. Auto files are date-named
// so same-day repeats overwrite into a single file.
// On-quit backup. SYNCHRONOUS (VACUUM INTO) because async db.backup() can't
// reliably finish before the process exits. Runs once per process.
var closeBackupDone = false;
export function runCloseBackup() {
    if (closeBackupDone)
        return;
    closeBackupDone = true;
    try {
        var db = getDb(); // throws if locked (restore in progress) → caught → skipped
        var s = readConfig(db);
        if (!s.auto_enabled)
            return;
        var dir = resolveBackupsDir();
        var target = autoTarget(dir);
        var tmp = target + '.tmp';
        fs.rmSync(tmp, { force: true }); // VACUUM INTO refuses to overwrite an existing file
        db.exec("VACUUM INTO '".concat(tmp.replace(/'/g, "''"), "'"));
        promote(tmp, target); // only a fully-written file becomes the day's backup
        finalize(db, dir, s.retention_count);
    }
    catch (err) {
        console.error('close-backup failed', err);
    }
}
// Midnight scheduler — fires at 00:00 local each day while the app runs, so an
// always-on terminal still gets a daily backup. Re-arms itself after each fire.
var dailyTimer = null;
export function scheduleDailyBackup() {
    var _a;
    if (dailyTimer)
        clearTimeout(dailyTimer);
    var ms = Math.max(1000, dayjs().add(1, 'day').startOf('day').diff(dayjs()));
    dailyTimer = setTimeout(function () {
        runScheduledBackup().finally(function () { return scheduleDailyBackup(); });
    }, ms);
    (_a = dailyTimer.unref) === null || _a === void 0 ? void 0 : _a.call(dailyTimer); // never keep the process alive just for the timer
}
function runScheduledBackup() {
    return __awaiter(this, void 0, void 0, function () {
        var db, s, today, dir, target, tmp, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    db = getDb();
                    s = readConfig(db);
                    if (!s.auto_enabled)
                        return [2 /*return*/];
                    today = dayjs().format('YYYY-MM-DD');
                    if (s.last_auto_backup_at && dayjs(s.last_auto_backup_at).format('YYYY-MM-DD') === today)
                        return [2 /*return*/];
                    dir = resolveBackupsDir();
                    target = autoTarget(dir);
                    tmp = target + '.tmp';
                    fs.rmSync(tmp, { force: true });
                    return [4 /*yield*/, db.backup(tmp)];
                case 1:
                    _a.sent();
                    promote(tmp, target);
                    finalize(db, dir, s.retention_count);
                    return [3 /*break*/, 3];
                case 2:
                    err_1 = _a.sent();
                    console.error('scheduled-backup failed', err_1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
