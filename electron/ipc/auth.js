import { ipcMain } from 'electron';
import { getDb } from '../db';
export function registerAuthHandlers() {
    // Returns the user the renderer should attribute actions to.
    // Until proper login is built, this is the seeded Staff Test user.
    ipcMain.handle('auth:getCurrentUser', function () {
        var db = getDb();
        var user = db.prepare("\n      SELECT id, name, email, role\n      FROM users\n      WHERE email = 'staff@syntropic.local'\n      LIMIT 1\n    ").get();
        if (user)
            return user;
        // Fallback: any non-disabled user (covers older installs without staff seed yet)
        return db.prepare("\n      SELECT id, name, email, role\n      FROM users\n      WHERE is_disabled = 0\n      ORDER BY id ASC\n      LIMIT 1\n    ").get();
    });
}
