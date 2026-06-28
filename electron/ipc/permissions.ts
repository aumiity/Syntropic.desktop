import { ipcMain } from 'electron'
import { getDb } from '../db'
import { stateFor } from '../auth/permissions'
import { isPermKey } from '../../src/lib/permissions/registry'

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

  // Phase 3 (matrix UI) handlers — getMatrix / save — are added in the same file.
}
