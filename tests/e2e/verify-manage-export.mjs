// Lightweight E2E: verify ExportButton renders in Manage/Expiry + Manage/LowStock.
// Checks: button visible in filter strip, aria-label correct, window.api callable.
// Does NOT drive the native save dialog (cannot in headless Playwright).
//
// Run: node tests/e2e/verify-manage-export.mjs
// Prereq: npm run dev running (or just: npx electron . in dev mode)

import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')

function resolveElectronExe() {
  const p = os.platform()
  if (p === 'win32') return pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  if (p === 'darwin') return pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  return pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
}

function loadElectron() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    'playwright-core',
    'playwright',
    pathMod.resolve(projectRoot, '..', '.pw-tools', 'node_modules', 'playwright-core'),
  ].filter(Boolean)
  for (const c of candidates) {
    try { return require(c)._electron } catch { /* try next */ }
  }
  throw new Error('playwright-core not found. Tried: ' + candidates.join(', '))
}

const electron = loadElectron()
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-mexp-e2e-'))

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`)
}

function apiCall(page, dotted, ...args) {
  return page.evaluate(async ({ dotted, args }) => {
    const fn = dotted.split('.').reduce((o, k) => (o ? o[k] : undefined), window.api)
    if (typeof fn !== 'function') return { ok: false, error: `no api: ${dotted}` }
    try { return { ok: true, value: await fn(...args) } }
    catch (e) { return { ok: false, error: String((e && e.message) || e) } }
  }, { dotted, args })
}

async function getMainPage(app) {
  for (let i = 0; i < 80; i++) {
    for (const w of app.windows()) {
      try {
        if (await w.evaluate(() => !!(window.api && window.api.auth))) return w
      } catch { /* devtools / loading */ }
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('main window with window.api never appeared')
}

const app = await electron.launch({
  executablePath: resolveElectronExe(),
  args: ['.', `--user-data-dir=${userDataDir}`],
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: 'development' },
})

let page
try {
  page = await getMainPage(app)

  // ── setup: seed DB + login as owner ─────────────────────────────────────────
  const setup = await apiCall(page, 'settings.completeSetup', {
    shop: { shop_name: 'ManageExport E2E' },
    vat: { vat_enabled: false },
    adminPassword: 'admin123',
  })
  if (!setup.ok) throw new Error('completeSetup: ' + setup.error)

  // Navigate to expiry and reload so devLogin fires on load
  await page.evaluate(() => { window.location.hash = '#/manage/expiry' })
  await page.reload()

  // Wait for the page to hydrate — look for any h-9 button (filter strip loads quickly)
  await page.waitForSelector('[aria-label="ส่งออก Excel"]', { timeout: 30000 })

  // ── E1: Expiry page — Export button visible ──────────────────────────────────
  console.log('\n=== E1: Manage › Expiry ===')
  const expiryExportBtn = page.locator('[aria-label="ส่งออก Excel"]').first()
  const e1Visible = await expiryExportBtn.isVisible().catch(() => false)
  check('E1a: ExportButton มีใน filter strip (aria-label="ส่งออก Excel")', e1Visible)

  const e1Enabled = await expiryExportBtn.isEnabled().catch(() => false)
  check('E1b: ปุ่ม enabled (ไม่ disabled)', e1Enabled)

  // ── E2: LowStock page — Export button visible ────────────────────────────────
  console.log('\n=== E2: Manage › LowStock ===')
  await page.evaluate(() => { window.location.hash = '#/manage/low-stock' })
  await page.waitForSelector('[aria-label="ส่งออก Excel"]', { timeout: 15000 })

  const lowstockExportBtn = page.locator('[aria-label="ส่งออก Excel"]').first()
  const e2Visible = await lowstockExportBtn.isVisible().catch(() => false)
  check('E2a: ExportButton มีใน filter strip', e2Visible)

  const e2Enabled = await lowstockExportBtn.isEnabled().catch(() => false)
  check('E2b: ปุ่ม enabled', e2Enabled)

  // ── E3: IPC methods accessible via window.api ────────────────────────────────
  console.log('\n=== E3: window.api.exports callable ===')
  const apiCheck = await page.evaluate(() => ({
    expiryFn: typeof window.api?.exports?.expiry === 'function',
    lowStockFn: typeof window.api?.exports?.lowStock === 'function',
  }))
  check('E3a: window.api.exports.expiry เป็น function', apiCheck.expiryFn)
  check('E3b: window.api.exports.lowStock เป็น function', apiCheck.lowStockFn)

} catch (err) {
  console.error('\nFATAL:', err.message)
  failed++
} finally {
  await app.close().catch(() => {})
  // clean up tmp userdata
  fsSync.rmSync(userDataDir, { recursive: true, force: true })

  console.log(`\n── Result: ${passed} passed, ${failed} failed ──`)
  process.exit(failed > 0 ? 1 : 0)
}
