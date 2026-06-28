import { ipcMain } from 'electron'
import { getDb } from '../db'
import { stateFor, requirePermission } from '../auth/permissions'
import {
  isPermKey, EDITABLE_ROLES, MATRIX_KEYS, allowedStates, permDefault, type PermState,
} from '../../src/lib/permissions/registry'

const VALID_STATES: readonly string[] = ['off', 'allow', 'override']

export function registerPermissionHandlers() {
  // Active users who may APPROVE an override for `permKey`: the owner always
  // qualifies; any other role qualifies iff it grants this key as 'allow'.
  // Mirrors the approver check inside requirePermission so the picker never lists
  // someone main would reject. NO password/hash exposed. Unknown key → [].
  ipcMain.handle('permissions:listApprovers', (_e, { permKey }: { permKey: string }) => {
    if (!isPermKey(permKey)) return []
    const rows = getDb()
      .prepare(`SELECT id, name, username, email, role FROM users WHERE is_disabled = 0 ORDER BY username`)
      .all() as { id: number; name: string; username: string; email: string; role: string }[]
    return rows.filter((u) => u.role === 'owner' || stateFor(u.role, permKey) === 'allow')
  })

  // The full editable matrix: every (editable role × matrix key) with its
  // current state (DB row if present + parseable, else registry default). The
  // owner-only permission.manage key is NOT included (MATRIX_KEYS excludes it).
  ipcMain.handle('permissions:getMatrix', (e) => {
    requirePermission(e, 'permission.manage')
    const db = getDb()
    const out: { role: string; permission: string; state: PermState }[] = []
    for (const role of EDITABLE_ROLES) {
      const rows = db
        .prepare(`SELECT permission, state FROM role_permissions WHERE role = ?`)
        .all(role) as { permission: string; state: string }[]
      const byKey = new Map(rows.map((r) => [r.permission, r.state]))
      for (const key of MATRIX_KEYS) {
        const stored = byKey.get(key)
        const state = stored && VALID_STATES.includes(stored) ? (stored as PermState) : permDefault(role, key)
        out.push({ role, permission: key, state })
      }
    }
    return out
  })

  // Persist matrix edits. ALLOW-LIST every triple (CLAUDE.md invariant): the role
  // must be editable, the key must be a matrix key (never permission.manage), and
  // the state must be legal for that key's kind (view → off|allow only). One
  // transaction UPSERT keyed on (role, permission).
  ipcMain.handle('permissions:save', (e, payload: { changes?: { role: string; permission: string; state: string }[] }) => {
    requirePermission(e, 'permission.manage')
    const changes = payload?.changes ?? []
    for (const c of changes) {
      if (!(EDITABLE_ROLES as string[]).includes(c.role)) throw new Error('บทบาทไม่ถูกต้อง')
      if (!MATRIX_KEYS.includes(c.permission)) throw new Error('สิทธิ์ไม่ถูกต้อง')
      if (!(allowedStates(c.permission) as string[]).includes(c.state)) throw new Error('สถานะไม่ถูกต้อง')
    }
    const db = getDb()
    const up = db.prepare(`
      INSERT INTO role_permissions (role, permission, state) VALUES (@role, @permission, @state)
      ON CONFLICT(role, permission) DO UPDATE SET state = excluded.state
    `)
    db.transaction(() => { for (const c of changes) up.run(c) })()
    return { ok: true as const }
  })
}
