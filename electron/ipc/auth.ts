import { ipcMain, app } from 'electron'
import { getDb } from '../db'
import { hashSecret, verifySecret, genRecoveryCode } from '../auth/hash'
import {
  checkLocked, recordFailure, clearFailures,
  checkRecoveryLocked, recordRecoveryFailure, clearRecoveryFailures,
} from '../auth/lockout'
import { bindSession, clearSession, getSession, requireAdmin, type Override } from '../auth/session'
import { permissionSnapshot } from '../auth/permissions'

export function registerAuthHandlers() {
  // Users shown on the Login picker. The picker now displays @username + email
  // by product decision (was previously name-only to avoid exposing email; that
  // posture was deliberately reversed — see docs/plans + e2e T0). Still NEVER
  // expose password/hash.
  ipcMain.handle('auth:listLoginUsers', () => {
    return getDb()
      .prepare(`SELECT id, name, username, email, role FROM users WHERE is_disabled = 0 ORDER BY username`)
      .all()
  })

  // Verify a user's password. The hash never leaves main; the renderer only ever
  // gets back safe fields on success.
  ipcMain.handle('auth:login', (_e, { userId, password }: { userId: number; password: string }) => {
    const db = getDb()

    const lock = checkLocked(db, userId)
    if (lock.locked) {
      const err = new Error('LOCKED') as Error & { remainingMs?: number }
      err.remainingMs = lock.remainingMs
      throw err
    }

    const row = db
      .prepare(`SELECT id, name, role, password FROM users WHERE id = ? AND is_disabled = 0`)
      .get(userId) as { id: number; name: string; role: string; password: string } | undefined

    // Same message as a wrong password so the renderer can't enumerate which
    // userId exists. No phantom recordFailure — lockout binds to a real row only.
    if (!row) throw new Error('รหัสผ่านไม่ถูกต้อง')

    const { ok, legacy } = verifySecret(password, row.password)
    if (!ok) {
      recordFailure(db, userId)
      throw new Error('รหัสผ่านไม่ถูกต้อง')
    }

    // Upgrade a plaintext seed password to a hash on first successful login.
    if (legacy) {
      db.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(hashSecret(password), userId)
    }

    clearFailures(db, userId)
    // Bind the main-side session for this renderer — the authoritative caller
    // identity for IPC role enforcement (BL-1). In-memory only.
    bindSession(_e, row.id, row.role)
    // Return only what the session/UI needs — email stays in main (defence-in-depth).
    // permissions = a snapshot for renderer UX gating (useCan); real enforcement
    // is requirePermission in main. Cached at login → a matrix edit needs the
    // affected user to re-login to take effect (documented limitation).
    return { id: row.id, name: row.name, role: row.role, permissions: permissionSnapshot(row.role) }
  })

  // DEV-ONLY auto-login — binds a session for the first admin WITHOUT a password
  // so a hard refresh during development doesn't bounce you to the login screen.
  // Hard-gated on !app.isPackaged: a packaged production build returns null (no
  // bypass). The renderer call site is also stripped via import.meta.env.DEV.
  ipcMain.handle('auth:devLogin', (_e) => {
    if (app.isPackaged) return null
    const row = getDb()
      .prepare(`SELECT id, name, role FROM users WHERE role = 'owner' AND is_disabled = 0 ORDER BY id LIMIT 1`)
      .get() as { id: number; name: string; role: string } | undefined
    if (!row) return null
    bindSession(_e, row.id, row.role)
    return { ...row, permissions: permissionSnapshot(row.role) }
  })

  // DEV-ONLY role switcher — flips the CALLER'S session role (admin <-> staff)
  // so the system can be exercised under both roles without logging out. Rebinds
  // the AUTHORITATIVE main-side session, so IPC enforcement (requireAdmin) — not
  // just renderer UI gating — sees the new role. Hard-gated on !app.isPackaged:
  // a packaged production build is a no-op (returns null). The renderer trigger
  // (TitleBar role-switch button) is also stripped before release.
  // REMOVE before a production build — see CLAUDE.md "Before a production build".
  ipcMain.handle('auth:devSetRole', (_e, { role }: { role: string }) => {
    if (app.isPackaged) return null
    const s = getSession(_e.sender.id)
    if (!s) return null
    bindSession(_e, s.userId, role)
    return { id: s.userId, role, permissions: permissionSnapshot(role) }
  })

  // Clear the main-side session for this renderer (logout / lock screen).
  ipcMain.handle('auth:logout', (_e) => {
    clearSession(_e)
  })

  // Verify the caller has admin authority (own session OR a valid manager
  // override). Used by the GR wizard to UNLOCK the price editor up front so a
  // wrong credential is rejected immediately instead of at write time. Throws
  // on failure (requireAdmin), resolves { ok:true } on success.
  ipcMain.handle('auth:verifyAdmin', (_e, override?: Override) => {
    requireAdmin(_e, override)
    return { ok: true as const }
  })

  // Read the CALLER'S OWN profile (for the sidebar profile card). Identity comes
  // from the main-side session, never from the renderer — so a caller can only
  // ever read their own row. No password/hash returned.
  ipcMain.handle('auth:getMyProfile', (_e) => {
    const s = getSession(_e.sender.id)
    if (!s) throw new Error('FORBIDDEN')
    return getDb()
      .prepare(`SELECT id, name, first_name, last_name, username, email, phone, role FROM users WHERE id = ?`)
      .get(s.userId)
  })

  // Self-service password change. userId comes from the session (NOT the
  // renderer) so a user can only change their OWN password. Verifies the current
  // password (with the same login lockout backoff) before setting the new one.
  ipcMain.handle('auth:changePassword', (_e, { currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
    const s = getSession(_e.sender.id)
    if (!s) throw new Error('FORBIDDEN')
    const db = getDb()
    const userId = s.userId

    const lock = checkLocked(db, userId)
    if (lock.locked) {
      const err = new Error('LOCKED') as Error & { remainingMs?: number }
      err.remainingMs = lock.remainingMs
      throw err
    }

    const row = db
      .prepare(`SELECT password FROM users WHERE id = ?`)
      .get(userId) as { password: string } | undefined
    if (!row) throw new Error('ไม่พบบัญชีผู้ใช้งาน')

    const { ok } = verifySecret(currentPassword ?? '', row.password)
    if (!ok) {
      recordFailure(db, userId)
      throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง')
    }

    const pw = (newPassword ?? '').trim()
    if (pw.length < 4) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร')

    clearFailures(db, userId)
    db.prepare(`UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(hashSecret(pw), userId)
    return { ok: true }
  })

  // Self-service password reset via the recovery code. Resets ONLY the admin's
  // password — never touches shop data, never binds a session (the user must log
  // in afterward). Verifies against a SEPARATE recovery lockout counter so a
  // login backoff can't block recovery (and vice-versa). On success regenerates
  // the recovery code and returns the new plaintext ONCE (only its hash is kept).
  // See §4.5 / Phase 2.5.
  ipcMain.handle('auth:resetAdminPassword', (_e, { recoveryCode, newPassword }: { recoveryCode: string; newPassword: string }) => {
    const db = getDb()

    const admin = db
      .prepare(`SELECT id, recovery_code_hash FROM users WHERE email = 'admin@syntropic.local'`)
      .get() as { id: number; recovery_code_hash: string | null } | undefined

    if (!admin || !admin.recovery_code_hash) throw new Error('ไม่พบบัญชีผู้ดูแล หรือยังไม่ได้ตั้งรหัสกู้คืน')

    const lock = checkRecoveryLocked(db, admin.id)
    if (lock.locked) {
      const err = new Error('LOCKED') as Error & { remainingMs?: number }
      err.remainingMs = lock.remainingMs
      throw err
    }

    const code = (recoveryCode ?? '').trim().toUpperCase()
    const { ok } = verifySecret(code, admin.recovery_code_hash)
    if (!ok) {
      recordRecoveryFailure(db, admin.id)
      throw new Error('รหัสกู้คืนไม่ถูกต้อง')
    }

    const pw = (newPassword ?? '').trim()
    if (pw.length < 4) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร')

    const newCode = genRecoveryCode()
    db.prepare(`UPDATE users SET password = ?, recovery_code_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(hashSecret(pw), hashSecret(newCode), admin.id)
    clearRecoveryFailures(db, admin.id)

    // Plaintext recovery code shown once — caller MUST store it now.
    return { recoveryCode: newCode }
  })
}
