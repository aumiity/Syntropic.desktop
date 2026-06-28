import type { IpcMainInvokeEvent } from 'electron'
import { getDb } from '../db'
import { verifySecret } from './hash'
import { checkLocked, recordFailure, clearFailures } from './lockout'

// Main-side session — the authoritative caller identity for IPC role enforcement
// (User_Login_System.md §0.6 BL-1, R1/R2). Keyed by webContents.id so each
// renderer frame maps to exactly one logged-in user. In-memory ONLY — never
// persisted: a reload/navigate/destroy clears it (see main.ts wiring), so a
// stale role can never be replayed after the login screen is gone.
type Session = { userId: number; role: string }

const sessions = new Map<number, Session>()

export function bindSession(e: IpcMainInvokeEvent, userId: number, role: string): void {
  sessions.set(e.sender.id, { userId, role })
}

export function clearSession(e: IpcMainInvokeEvent): void {
  sessions.delete(e.sender.id)
}

export function clearSessionById(senderId: number): void {
  sessions.delete(senderId)
}

export function getSession(senderId: number): Session | undefined {
  return sessions.get(senderId)
}

export function getSessionRole(e: IpcMainInvokeEvent): string | undefined {
  return sessions.get(e.sender.id)?.role
}

export type Override = { userId: number; password: string }

// Gate an admin-only handler. The caller's session role is the primary check;
// if the caller is NOT an admin but supplies a manager override credential, we
// verify it inline (same lockout backoff as login, admin role required) and
// allow the single action through. The override password/hash NEVER leaves main.
// Throws 'FORBIDDEN' (renderer maps to a Thai toast) or the override failure
// message. See §4.3.
export function requireAdmin(e: IpcMainInvokeEvent, override?: Override): void {
  if (getSessionRole(e) === 'owner') return

  if (override && override.userId && override.password) {
    const db = getDb()

    const lock = checkLocked(db, override.userId)
    if (lock.locked) {
      const err = new Error('LOCKED') as Error & { remainingMs?: number }
      err.remainingMs = lock.remainingMs
      throw err
    }

    const row = db
      .prepare(`SELECT id, role, password FROM users WHERE id = ? AND is_disabled = 0`)
      .get(override.userId) as { id: number; role: string; password: string } | undefined

    if (!row || row.role !== 'owner') {
      recordFailure(db, override.userId)
      throw new Error('รหัสผ่านไม่ถูกต้อง')
    }

    const { ok } = verifySecret(override.password, row.password)
    if (!ok) {
      recordFailure(db, override.userId)
      throw new Error('รหัสผ่านไม่ถูกต้อง')
    }

    clearFailures(db, override.userId)
    return
  }

  throw new Error('FORBIDDEN')
}
