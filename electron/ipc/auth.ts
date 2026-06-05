import { ipcMain } from 'electron'
import { getDb } from '../db'
import { hashSecret, verifySecret, genRecoveryCode } from '../auth/hash'
import {
  checkLocked, recordFailure, clearFailures,
  checkRecoveryLocked, recordRecoveryFailure, clearRecoveryFailures,
} from '../auth/lockout'
import { bindSession, clearSession } from '../auth/session'

export function registerAuthHandlers() {
  // Users shown on the Login picker. Never expose email/password/hash — only
  // what the picker renders (audit N-1).
  ipcMain.handle('auth:listLoginUsers', () => {
    return getDb()
      .prepare(`SELECT id, name, role FROM users WHERE is_disabled = 0 ORDER BY name`)
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
    return { id: row.id, name: row.name, role: row.role }
  })

  // Clear the main-side session for this renderer (logout / lock screen).
  ipcMain.handle('auth:logout', (_e) => {
    clearSession(_e)
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
