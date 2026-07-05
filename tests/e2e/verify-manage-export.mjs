// E2E: verify ExportButton is on the STOCK sub-tab strip (right-aligned),
// NOT in the filter strip — and that it disappears on dead-stock/negative-stock
// (owner-scoping via setSubTabActions ownerTab guard).
//
// Checks:
//   E1a-c  Expiry page: button visible, enabled, in sub-tab row (not filter strip)
//   E2a-c  LowStock page: same structural checks
//   E3a-b  dead-stock + negative-stock: no export button (owner-scoping)
//   E4a-b  window.api.exports.expiry / .lowStock callable
//
// Run: node tests/e2e/verify-manage-export.mjs
// Prereq: playwright-core installed under ../.pw-tools or globally

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

// Returns { btnFound, inSubTabRow, inFilterStrip } from the live DOM.
// Tab row = a flex container that holds a [role=tablist] (top TabStrip or the
//   STOCK_SUBTABS row — the actions slot moved to the top TabStrip in the
//   2026-06-26 stock-tab collapse). Export button must live on one of those
//   rows — NOT inside the card's filter strip which has the SearchInput.
async function checkBtnPosition(page, searchPlaceholder) {
  return page.evaluate((placeholder) => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('ส่งออก Excel'))
    if (!btn) return { btnFound: false, inSubTabRow: false, inFilterStrip: false }

    // Any tab row: walk up 2 parents from each tablist (Tabs root → row container)
    const tabRows = [...document.querySelectorAll('[role="tablist"]')]
      .map(el => el.parentElement?.parentElement ?? null)
      .filter(Boolean)
    const subTabRow = tabRows.find(r => r.contains(btn)) ?? null
    const inSubTabRow = subTabRow !== null

    // Filter strip: walk up from the search input to the first h-12 ancestor
    const searchInput = document.querySelector(`input[placeholder*="${placeholder}"]`)
    let filterStrip = searchInput ? searchInput.parentElement : null
    while (filterStrip && !filterStrip.classList.contains('h-12')) {
      filterStrip = filterStrip.parentElement
    }
    const inFilterStrip = filterStrip ? filterStrip.contains(btn) : false

    return {
      btnFound: true,
      inSubTabRow,
      inFilterStrip,
      subTabRowClass: subTabRow?.className ?? '(none)',
      filterStripClass: filterStrip?.className ?? '(none)',
    }
  }, searchPlaceholder)
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

  // Boot into expiry tab; reload so devLogin fires
  await page.evaluate(() => { window.location.hash = '#/manage/expiry' })
  await page.reload()
  await page.waitForSelector('button:has-text("ส่งออก Excel")', { timeout: 30000 })

  // ── E1: Manage › Expiry ─────────────────────────────────────────────────────
  console.log('\n=== E1: Manage › Expiry ===')

  const e1Visible = await page.locator('button:has-text("ส่งออก Excel")').first().isVisible().catch(() => false)
  check('E1a: ปุ่ม export ปรากฏ (text="ส่งออก Excel")', e1Visible)

  const e1Enabled = await page.locator('button:has-text("ส่งออก Excel")').first().isEnabled().catch(() => false)
  check('E1b: ปุ่ม enabled', e1Enabled)

  const e1Pos = await checkBtnPosition(page, 'ชื่อสินค้า')
  check('E1c: ปุ่มอยู่บนแถว sub-tab (ไม่ใช่ filter strip)', e1Pos.inSubTabRow && !e1Pos.inFilterStrip,
    e1Pos.btnFound ? `inSubTabRow=${e1Pos.inSubTabRow} inFilterStrip=${e1Pos.inFilterStrip}` : 'button not found')

  // ── E2: Manage › LowStock ───────────────────────────────────────────────────
  console.log('\n=== E2: Manage › LowStock ===')
  await page.evaluate(() => { window.location.hash = '#/manage/low-stock' })
  await page.waitForSelector('button:has-text("ส่งออก Excel")', { timeout: 15000 })

  const e2Visible = await page.locator('button:has-text("ส่งออก Excel")').first().isVisible().catch(() => false)
  check('E2a: ปุ่ม export ปรากฏ', e2Visible)

  const e2Enabled = await page.locator('button:has-text("ส่งออก Excel")').first().isEnabled().catch(() => false)
  check('E2b: ปุ่ม enabled', e2Enabled)

  const e2Pos = await checkBtnPosition(page, 'ชื่อสินค้า')
  check('E2c: ปุ่มอยู่บนแถว sub-tab (ไม่ใช่ filter strip)', e2Pos.inSubTabRow && !e2Pos.inFilterStrip,
    e2Pos.btnFound ? `inSubTabRow=${e2Pos.inSubTabRow} inFilterStrip=${e2Pos.inFilterStrip}` : 'button not found')

  // ── E3: owner-scoping — dead-stock + negative-stock must NOT show export ─────
  console.log('\n=== E3: owner-scoping (dead-stock + negative-stock) ===')

  await page.evaluate(() => { window.location.hash = '#/manage/dead-stock' })
  // Wait for sub-tab to change (TabsTrigger "ค้างสต็อก" becomes active)
  await page.waitForFunction(
    () => {
      const tabs = [...document.querySelectorAll('[role="tab"]')]
      return tabs.some(t => t.getAttribute('data-state') === 'active' && t.textContent.includes('ค้างสต็อก'))
    },
    { timeout: 10000 },
  ).catch(() => {})

  const e3DeadCount = await page.locator('button:has-text("ส่งออก Excel")').count()
  check('E3a: dead-stock — ไม่มีปุ่ม export ใน DOM (owner-scoping)', e3DeadCount === 0,
    `found ${e3DeadCount} button(s)`)

  await page.evaluate(() => { window.location.hash = '#/manage/negative-stock' })
  await page.waitForFunction(
    () => {
      const tabs = [...document.querySelectorAll('[role="tab"]')]
      return tabs.some(t => t.getAttribute('data-state') === 'active' && t.textContent.includes('ติดลบ'))
    },
    { timeout: 10000 },
  ).catch(() => {})

  const e3NegCount = await page.locator('button:has-text("ส่งออก Excel")').count()
  check('E3b: negative-stock — ไม่มีปุ่ม export ใน DOM (owner-scoping)', e3NegCount === 0,
    `found ${e3NegCount} button(s)`)

  // ── E4: IPC methods accessible via window.api ────────────────────────────────
  console.log('\n=== E4: window.api.exports callable ===')
  const apiCheck = await page.evaluate(() => ({
    expiryFn: typeof window.api?.exports?.expiry === 'function',
    lowStockFn: typeof window.api?.exports?.lowStock === 'function',
  }))
  check('E4a: window.api.exports.expiry เป็น function', apiCheck.expiryFn)
  check('E4b: window.api.exports.lowStock เป็น function', apiCheck.lowStockFn)

  // ── E5: better-sqlite3 native module still present ──────────────────────────
  console.log('\n=== E5: native module integrity ===')
  const nodeFile = pathMod.join(projectRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  check('E5: better_sqlite3.node ยังอยู่ครบ', fsSync.existsSync(nodeFile))

} catch (err) {
  console.error('\nFATAL:', err.message)
  failed++
} finally {
  await app.close().catch(() => {})
  fsSync.rmSync(userDataDir, { recursive: true, force: true })

  console.log(`\n── Result: ${passed} passed, ${failed} failed ──`)
  process.exit(failed > 0 ? 1 : 0)
}
