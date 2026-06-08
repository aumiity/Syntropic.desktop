// Brute-force lockout, persisted in users.failed_attempts + users.locked_until
// so it survives an app restart. This is a *delay* not a permanent lock — a
// single admin who fat-fingers their password must be able to retry after the
// backoff window (see User_Login_System.md audit S-1).
var THRESHOLD = 5;
var BACKOFF_MS = 30000;
export function checkLocked(db, userId) {
    var row = db.prepare("SELECT locked_until FROM users WHERE id = ?").get(userId);
    if (!(row === null || row === void 0 ? void 0 : row.locked_until))
        return { locked: false, remainingMs: 0 };
    var until = Date.parse(row.locked_until);
    var remainingMs = until - Date.now();
    if (Number.isNaN(until) || remainingMs <= 0)
        return { locked: false, remainingMs: 0 };
    return { locked: true, remainingMs: remainingMs };
}
export function recordFailure(db, userId) {
    var _a;
    var row = db.prepare("SELECT failed_attempts FROM users WHERE id = ?").get(userId);
    var next = ((_a = row === null || row === void 0 ? void 0 : row.failed_attempts) !== null && _a !== void 0 ? _a : 0) + 1;
    if (next >= THRESHOLD) {
        var lockedUntil = new Date(Date.now() + BACKOFF_MS).toISOString();
        db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?").run(next, lockedUntil, userId);
    }
    else {
        db.prepare("UPDATE users SET failed_attempts = ? WHERE id = ?").run(next, userId);
    }
}
export function clearFailures(db, userId) {
    db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(userId);
}
// Recovery-code lockout — a SEPARATE counter from login (recovery_failed_attempts
// / recovery_locked_until) so brute-forcing the recovery code can't lock the
// owner out of normal login, and vice-versa. Same threshold/backoff policy.
export function checkRecoveryLocked(db, userId) {
    var row = db.prepare("SELECT recovery_locked_until FROM users WHERE id = ?").get(userId);
    if (!(row === null || row === void 0 ? void 0 : row.recovery_locked_until))
        return { locked: false, remainingMs: 0 };
    var until = Date.parse(row.recovery_locked_until);
    var remainingMs = until - Date.now();
    if (Number.isNaN(until) || remainingMs <= 0)
        return { locked: false, remainingMs: 0 };
    return { locked: true, remainingMs: remainingMs };
}
export function recordRecoveryFailure(db, userId) {
    var _a;
    var row = db.prepare("SELECT recovery_failed_attempts FROM users WHERE id = ?").get(userId);
    var next = ((_a = row === null || row === void 0 ? void 0 : row.recovery_failed_attempts) !== null && _a !== void 0 ? _a : 0) + 1;
    if (next >= THRESHOLD) {
        var lockedUntil = new Date(Date.now() + BACKOFF_MS).toISOString();
        db.prepare("UPDATE users SET recovery_failed_attempts = ?, recovery_locked_until = ? WHERE id = ?").run(next, lockedUntil, userId);
    }
    else {
        db.prepare("UPDATE users SET recovery_failed_attempts = ? WHERE id = ?").run(next, userId);
    }
}
export function clearRecoveryFailures(db, userId) {
    db.prepare("UPDATE users SET recovery_failed_attempts = 0, recovery_locked_until = NULL WHERE id = ?").run(userId);
}
