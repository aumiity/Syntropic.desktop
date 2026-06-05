// Stage the Hygeia-imported test DB into an ISOLATED Electron userData dir so the
// real app can open it WITHOUT touching the developer's live dev database.
//
// It also makes the imported DB app-bootable:
//  - inserts an admin user, so the app's seedDatabase() early-returns and does NOT
//    overwrite the imported data with the dev-seed PRODUCTS/CUSTOMERS block;
//  - marks settings.setup_completed = 1, so the first-run Setup wizard is skipped.
//
// Run:  ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe scripts/prep-app-db.mjs
//
// Then launch the app against the staged dir (npm run dev must be on :5173):
//   NODE_ENV=development node_modules/electron/dist/electron.exe . --user-data-dir=D:\Syntropic.Project\hygeia-test-userdata
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const SRC = 'D:\\Syntropic.Project\\hygeia-import-test.db'
const USERDATA = process.argv[2] || 'D:\\Syntropic.Project\\hygeia-test-userdata'
const dbDir = path.join(USERDATA, 'database')
const dest = path.join(dbDir, 'syntropic.db')

if (!existsSync(SRC)) { console.error('missing import DB:', SRC); process.exit(1) }
mkdirSync(dbDir, { recursive: true })
for (const suf of ['', '-wal', '-shm']) rmSync(dest + suf, { force: true })
for (const suf of ['', '-wal', '-shm']) if (existsSync(SRC + suf)) copyFileSync(SRC + suf, dest + suf)

const db = new Database(dest)
db.pragma('wal_checkpoint(TRUNCATE)')

// 1) admin login user (plaintext 'admin' — the app upgrades it to scrypt on first
//    successful login). Presence of an admin makes seedDatabase() skip dev seed.
if (!db.prepare(`SELECT id FROM users WHERE email = 'admin@syntropic.local'`).get()) {
  db.prepare(`INSERT INTO users (name, email, password, role) VALUES ('Admin', 'admin@syntropic.local', 'admin', 'admin')`).run()
}

// 2) settings row with the setup gate already passed
const st = db.prepare(`SELECT id FROM settings LIMIT 1`).get()
if (!st) {
  db.prepare(`INSERT INTO settings (shop_name, setup_completed, setup_completed_at)
              VALUES ('ร้านยา (นำเข้า Hygeia)', 1, datetime('now','localtime'))`).run()
} else {
  db.prepare(`UPDATE settings SET setup_completed = 1, setup_completed_at = datetime('now','localtime') WHERE id = ?`).run(st.id)
}

const counts = {
  products: db.prepare(`SELECT COUNT(*) c FROM products`).get().c,
  sales: db.prepare(`SELECT COUNT(*) c FROM sales`).get().c,
  customers: db.prepare(`SELECT COUNT(*) c FROM customers`).get().c,
  users: db.prepare(`SELECT COUNT(*) c FROM users`).get().c,
}
db.close()

console.log('Staged ->', dest)
console.log('counts:', JSON.stringify(counts))
console.log('Login: Admin / password "admin"')
console.log('Launch: NODE_ENV=development node_modules/electron/dist/electron.exe . --user-data-dir=' + USERDATA)
