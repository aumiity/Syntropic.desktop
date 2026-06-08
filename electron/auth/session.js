import { getDb } from '../db';
import { verifySecret } from './hash';
import { checkLocked, recordFailure, clearFailures } from './lockout';
var sessions = new Map();
export function bindSession(e, userId, role) {
    sessions.set(e.sender.id, { userId: userId, role: role });
}
export function clearSession(e) {
    sessions.delete(e.sender.id);
}
export function clearSessionById(senderId) {
    sessions.delete(senderId);
}
export function getSession(senderId) {
    return sessions.get(senderId);
}
export function getSessionRole(e) {
    var _a;
    return (_a = sessions.get(e.sender.id)) === null || _a === void 0 ? void 0 : _a.role;
}
// Gate an admin-only handler. The caller's session role is the primary check;
// if the caller is NOT an admin but supplies a manager override credential, we
// verify it inline (same lockout backoff as login, admin role required) and
// allow the single action through. The override password/hash NEVER leaves main.
// Throws 'FORBIDDEN' (renderer maps to a Thai toast) or the override failure
// message. See §4.3.
export function requireAdmin(e, override) {
    if (getSessionRole(e) === 'admin')
        return;
    if (override && override.userId && override.password) {
        var db = getDb();
        var lock = checkLocked(db, override.userId);
        if (lock.locked) {
            var err = new Error('LOCKED');
            err.remainingMs = lock.remainingMs;
            throw err;
        }
        var row = db
            .prepare("SELECT id, role, password FROM users WHERE id = ? AND is_disabled = 0")
            .get(override.userId);
        if (!row || row.role !== 'admin') {
            recordFailure(db, override.userId);
            throw new Error('รหัสผ่านไม่ถูกต้อง');
        }
        var ok = verifySecret(override.password, row.password).ok;
        if (!ok) {
            recordFailure(db, override.userId);
            throw new Error('รหัสผ่านไม่ถูกต้อง');
        }
        clearFailures(db, override.userId);
        return;
    }
    throw new Error('FORBIDDEN');
}
