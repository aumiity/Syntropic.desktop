import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerAuthHandlers() {
  // Returns the user the renderer should attribute actions to.
  // Until proper login is built, this is the seeded Staff Test user.
  ipcMain.handle('auth:getCurrentUser', () => {
    const db = getDb()
    const user = db.prepare(`
      SELECT id, name, email, role
      FROM users
      WHERE email = 'staff@syntropic.local'
      LIMIT 1
    `).get()
    if (user) return user
    // Fallback: any non-disabled user (covers older installs without staff seed yet)
    return db.prepare(`
      SELECT id, name, email, role
      FROM users
      WHERE is_disabled = 0
      ORDER BY id ASC
      LIMIT 1
    `).get()
  })
}
