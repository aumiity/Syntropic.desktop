import type Database from 'better-sqlite3'

// Brute-force lockout, persisted in users.failed_attempts + users.locked_until
// so it survives an app restart. This is a *delay* not a permanent lock — a
// single admin who fat-fingers their password must be able to retry after the
// backoff window (see User_Login_System.md audit S-1).
const THRESHOLD = 5
const BACKOFF_MS = 30_000

export function checkLocked(db: Database.Database, userId: number): { locked: boolean; remainingMs: number } {
  const row = db.prepare(`SELECT locked_until FROM users WHERE id = ?`).get(userId) as { locked_until: string | null } | undefined
  if (!row?.locked_until) return { locked: false, remainingMs: 0 }
  const until = Date.parse(row.locked_until)
  const remainingMs = until - Date.now()
  if (Number.isNaN(until) || remainingMs <= 0) return { locked: false, remainingMs: 0 }
  return { locked: true, remainingMs }
}

export function recordFailure(db: Database.Database, userId: number): void {
  const row = db.prepare(`SELECT failed_attempts FROM users WHERE id = ?`).get(userId) as { failed_attempts: number } | undefined
  const next = (row?.failed_attempts ?? 0) + 1
  if (next >= THRESHOLD) {
    const lockedUntil = new Date(Date.now() + BACKOFF_MS).toISOString()
    db.prepare(`UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`).run(next, lockedUntil, userId)
  } else {
    db.prepare(`UPDATE users SET failed_attempts = ? WHERE id = ?`).run(next, userId)
  }
}

export function clearFailures(db: Database.Database, userId: number): void {
  db.prepare(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`).run(userId)
}

// Recovery-code lockout — a SEPARATE counter from login (recovery_failed_attempts
// / recovery_locked_until) so brute-forcing the recovery code can't lock the
// owner out of normal login, and vice-versa. Same threshold/backoff policy.
export function checkRecoveryLocked(db: Database.Database, userId: number): { locked: boolean; remainingMs: number } {
  const row = db.prepare(`SELECT recovery_locked_until FROM users WHERE id = ?`).get(userId) as { recovery_locked_until: string | null } | undefined
  if (!row?.recovery_locked_until) return { locked: false, remainingMs: 0 }
  const until = Date.parse(row.recovery_locked_until)
  const remainingMs = until - Date.now()
  if (Number.isNaN(until) || remainingMs <= 0) return { locked: false, remainingMs: 0 }
  return { locked: true, remainingMs }
}

export function recordRecoveryFailure(db: Database.Database, userId: number): void {
  const row = db.prepare(`SELECT recovery_failed_attempts FROM users WHERE id = ?`).get(userId) as { recovery_failed_attempts: number } | undefined
  const next = (row?.recovery_failed_attempts ?? 0) + 1
  if (next >= THRESHOLD) {
    const lockedUntil = new Date(Date.now() + BACKOFF_MS).toISOString()
    db.prepare(`UPDATE users SET recovery_failed_attempts = ?, recovery_locked_until = ? WHERE id = ?`).run(next, lockedUntil, userId)
  } else {
    db.prepare(`UPDATE users SET recovery_failed_attempts = ? WHERE id = ?`).run(next, userId)
  }
}

export function clearRecoveryFailures(db: Database.Database, userId: number): void {
  db.prepare(`UPDATE users SET recovery_failed_attempts = 0, recovery_locked_until = NULL WHERE id = ?`).run(userId)
}
