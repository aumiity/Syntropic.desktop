import type { IpcMainInvokeEvent } from 'electron'
import { getDb } from '../db'
import { verifySecret } from './hash'
import { checkLocked, recordFailure, clearFailures } from './lockout'
import { getSessionRole, type Override } from './session'
import { PERMISSIONS, permDefault, isPermKey, type PermState } from '../../src/lib/permissions/registry'

// Data-driven permission enforcement — the authoritative gate for IPC handlers
// (the renderer's useCan is UX only). Replaces requireAdmin: instead of a fixed
// admin/staff split, every action resolves a per-(role × key) state stored in
// role_permissions, falling back to the registry default. owner always passes.
//
// Fail-safe posture (matches CLAUDE.md allow-list invariant): an unknown key or
// an unparseable stored state resolves to 'off' (deny), never to 'allow'.

const VALID_STATES: readonly string[] = ['off', 'allow', 'override']

// Effective state for (role, key). owner → always 'allow'; unknown key → 'off';
// a stored row wins (if its value parses), else the registry default; an
// unparseable stored value → 'off'.
export function stateFor(role: string, key: string): PermState {
  if (role === 'owner') return 'allow'
  if (!isPermKey(key)) return 'off'
  const row = getDb()
    .prepare(`SELECT state FROM role_permissions WHERE role = ? AND permission = ?`)
    .get(role, key) as { state: string } | undefined
  if (!row) return permDefault(role, key)
  return VALID_STATES.includes(row.state) ? (row.state as PermState) : 'off'
}

// Gate an IPC handler on a permission key. owner/allow → return (pass). off →
// throw FORBIDDEN. override → require an approver credential: verify it inline
// (same lockout backoff as login) and allow the single action through ONLY if
// the approver's role actually has this permission as 'allow' (owner always
// qualifies). The override password/hash NEVER leaves main.
//
// Self-approval is structurally impossible: a role at state 'override' is, by
// definition, NOT 'allow' for that key, so it can never qualify as an approver.
export function requirePermission(e: IpcMainInvokeEvent, key: string, override?: Override): void {
  const role = getSessionRole(e)
  if (role === 'owner') return

  const state = stateFor(role ?? '', key)
  if (state === 'allow') return
  if (state !== 'override') throw new Error('FORBIDDEN')

  // state === 'override' — needs a valid approver credential.
  if (!override || !override.userId || !override.password) {
    throw new Error('NEEDS_OVERRIDE')
  }

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

  // Approver qualifies iff owner, or their role grants this exact key as 'allow'.
  const approverOk = !!row && (row.role === 'owner' || stateFor(row.role, key) === 'allow')
  if (!approverOk) {
    recordFailure(db, override.userId)
    throw new Error('รหัสผ่านไม่ถูกต้อง')
  }

  const { ok } = verifySecret(override.password, row!.password)
  if (!ok) {
    recordFailure(db, override.userId)
    throw new Error('รหัสผ่านไม่ถูกต้อง')
  }

  clearFailures(db, override.userId)
}

// Full permission snapshot for a role — every registry key present. owner → all
// 'allow'. Otherwise DB rows (parseable) over registry defaults. Sent to the
// renderer at login so useCan can gate UX without another round-trip; the
// renderer copy is advisory (real enforcement is requirePermission here).
export function permissionSnapshot(role: string): Record<string, PermState> {
  const snap: Record<string, PermState> = {}
  if (role === 'owner') {
    for (const p of PERMISSIONS) snap[p.key] = 'allow'
    return snap
  }
  const rows = getDb()
    .prepare(`SELECT permission, state FROM role_permissions WHERE role = ?`)
    .all(role) as { permission: string; state: string }[]
  const byKey = new Map(rows.map((r) => [r.permission, r.state]))
  for (const p of PERMISSIONS) {
    const stored = byKey.get(p.key)
    snap[p.key] = stored && VALID_STATES.includes(stored) ? (stored as PermState) : permDefault(role, p.key)
  }
  return snap
}
