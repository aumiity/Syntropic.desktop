import { ipcMain, app } from 'electron';
import { getDb } from '../db';
import { hashSecret, verifySecret, genRecoveryCode } from '../auth/hash';
import { checkLocked, recordFailure, clearFailures, checkRecoveryLocked, recordRecoveryFailure, clearRecoveryFailures, } from '../auth/lockout';
import { bindSession, clearSession, getSession } from '../auth/session';
export function registerAuthHandlers() {
    // Users shown on the Login picker. The picker now displays @username + email
    // by product decision (was previously name-only to avoid exposing email; that
    // posture was deliberately reversed — see docs/plans + e2e T0). Still NEVER
    // expose password/hash.
    ipcMain.handle('auth:listLoginUsers', function () {
        return getDb()
            .prepare("SELECT id, name, username, email, role FROM users WHERE is_disabled = 0 ORDER BY username")
            .all();
    });
    // Verify a user's password. The hash never leaves main; the renderer only ever
    // gets back safe fields on success.
    ipcMain.handle('auth:login', function (_e, _a) {
        var userId = _a.userId, password = _a.password;
        var db = getDb();
        var lock = checkLocked(db, userId);
        if (lock.locked) {
            var err = new Error('LOCKED');
            err.remainingMs = lock.remainingMs;
            throw err;
        }
        var row = db
            .prepare("SELECT id, name, role, password FROM users WHERE id = ? AND is_disabled = 0")
            .get(userId);
        // Same message as a wrong password so the renderer can't enumerate which
        // userId exists. No phantom recordFailure — lockout binds to a real row only.
        if (!row)
            throw new Error('รหัสผ่านไม่ถูกต้อง');
        var _b = verifySecret(password, row.password), ok = _b.ok, legacy = _b.legacy;
        if (!ok) {
            recordFailure(db, userId);
            throw new Error('รหัสผ่านไม่ถูกต้อง');
        }
        // Upgrade a plaintext seed password to a hash on first successful login.
        if (legacy) {
            db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashSecret(password), userId);
        }
        clearFailures(db, userId);
        // Bind the main-side session for this renderer — the authoritative caller
        // identity for IPC role enforcement (BL-1). In-memory only.
        bindSession(_e, row.id, row.role);
        // Return only what the session/UI needs — email stays in main (defence-in-depth).
        return { id: row.id, name: row.name, role: row.role };
    });
    // DEV-ONLY auto-login — binds a session for the first admin WITHOUT a password
    // so a hard refresh during development doesn't bounce you to the login screen.
    // Hard-gated on !app.isPackaged: a packaged production build returns null (no
    // bypass). The renderer call site is also stripped via import.meta.env.DEV.
    ipcMain.handle('auth:devLogin', function (_e) {
        if (app.isPackaged)
            return null;
        var row = getDb()
            .prepare("SELECT id, name, role FROM users WHERE role = 'admin' AND is_disabled = 0 ORDER BY id LIMIT 1")
            .get();
        if (!row)
            return null;
        bindSession(_e, row.id, row.role);
        return row;
    });
    // Clear the main-side session for this renderer (logout / lock screen).
    ipcMain.handle('auth:logout', function (_e) {
        clearSession(_e);
    });
    // Read the CALLER'S OWN profile (for the sidebar profile card). Identity comes
    // from the main-side session, never from the renderer — so a caller can only
    // ever read their own row. No password/hash returned.
    ipcMain.handle('auth:getMyProfile', function (_e) {
        var s = getSession(_e.sender.id);
        if (!s)
            throw new Error('FORBIDDEN');
        return getDb()
            .prepare("SELECT id, name, first_name, last_name, username, email, phone, role FROM users WHERE id = ?")
            .get(s.userId);
    });
    // Self-service password change. userId comes from the session (NOT the
    // renderer) so a user can only change their OWN password. Verifies the current
    // password (with the same login lockout backoff) before setting the new one.
    ipcMain.handle('auth:changePassword', function (_e, _a) {
        var currentPassword = _a.currentPassword, newPassword = _a.newPassword;
        var s = getSession(_e.sender.id);
        if (!s)
            throw new Error('FORBIDDEN');
        var db = getDb();
        var userId = s.userId;
        var lock = checkLocked(db, userId);
        if (lock.locked) {
            var err = new Error('LOCKED');
            err.remainingMs = lock.remainingMs;
            throw err;
        }
        var row = db
            .prepare("SELECT password FROM users WHERE id = ?")
            .get(userId);
        if (!row)
            throw new Error('ไม่พบบัญชีผู้ใช้งาน');
        var ok = verifySecret(currentPassword !== null && currentPassword !== void 0 ? currentPassword : '', row.password).ok;
        if (!ok) {
            recordFailure(db, userId);
            throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }
        var pw = (newPassword !== null && newPassword !== void 0 ? newPassword : '').trim();
        if (pw.length < 4)
            throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
        clearFailures(db, userId);
        db.prepare("UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(hashSecret(pw), userId);
        return { ok: true };
    });
    // Self-service password reset via the recovery code. Resets ONLY the admin's
    // password — never touches shop data, never binds a session (the user must log
    // in afterward). Verifies against a SEPARATE recovery lockout counter so a
    // login backoff can't block recovery (and vice-versa). On success regenerates
    // the recovery code and returns the new plaintext ONCE (only its hash is kept).
    // See §4.5 / Phase 2.5.
    ipcMain.handle('auth:resetAdminPassword', function (_e, _a) {
        var recoveryCode = _a.recoveryCode, newPassword = _a.newPassword;
        var db = getDb();
        var admin = db
            .prepare("SELECT id, recovery_code_hash FROM users WHERE email = 'admin@syntropic.local'")
            .get();
        if (!admin || !admin.recovery_code_hash)
            throw new Error('ไม่พบบัญชีผู้ดูแล หรือยังไม่ได้ตั้งรหัสกู้คืน');
        var lock = checkRecoveryLocked(db, admin.id);
        if (lock.locked) {
            var err = new Error('LOCKED');
            err.remainingMs = lock.remainingMs;
            throw err;
        }
        var code = (recoveryCode !== null && recoveryCode !== void 0 ? recoveryCode : '').trim().toUpperCase();
        var ok = verifySecret(code, admin.recovery_code_hash).ok;
        if (!ok) {
            recordRecoveryFailure(db, admin.id);
            throw new Error('รหัสกู้คืนไม่ถูกต้อง');
        }
        var pw = (newPassword !== null && newPassword !== void 0 ? newPassword : '').trim();
        if (pw.length < 4)
            throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
        var newCode = genRecoveryCode();
        db.prepare("UPDATE users SET password = ?, recovery_code_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(hashSecret(pw), hashSecret(newCode), admin.id);
        clearRecoveryFailures(db, admin.id);
        // Plaintext recovery code shown once — caller MUST store it now.
        return { recoveryCode: newCode };
    });
}
