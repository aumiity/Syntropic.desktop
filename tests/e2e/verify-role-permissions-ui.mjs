// E2E verification of the Role Permissions UI — React DOM rendering, not just IPC.
// Drives a real Electron window to verify PermissionsTab matrix renders, save/cancel
// work, changes persist, and the tab is hidden for non-owner roles.
//
// Run:  node tests/e2e/verify-role-permissions-ui.mjs
// Prereq: npm run dev must be running (serves :5173 and dist-electron).
//
// Tests:
//   U1  owner → /settings → "สิทธิ์การใช้งาน" tab visible
//   U2  click tab → matrix renders (28 selects, 14 owner-Check icons, group headers)
//   U3  change select → save btn enables → click save → toast → btn disables
//   U4  value persists after navigate-away + back + re-open tab
//   U5  change select → cancel → value reverts to saved baseline
//   U6  TitleBar role switch → staff → tab disappears + matrix content hidden

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
const electronExe = resolveElectronExe()
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-permsui-e2e-'))

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

// ── tiny harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  const tag = ok ? 'PASS' : 'FAIL'
  if (ok) passed++; else failed++
  console.log(`  [${tag}] ${name}${detail ? '  — ' + detail : ''}`)
}

// Call window.api by dotted path → {ok, value} or {ok:false, error}
function apiCall(page, dotted, ...args) {
  return page.evaluate(async ({ dotted, args }) => {
    const fn = dotted.split('.').reduce((o, k) => (o ? o[k] : undefined), window.api)
    if (typeof fn !== 'function') return { ok: false, error: `no api: ${dotted}` }
    try { return { ok: true, value: await fn(...args) } }
    catch (e) { return { ok: false, error: String((e && e.message) || e) } }
  }, { dotted, args })
}

// Wait until the main Electron window exposes window.api.permissions
async function getMainPage(app) {
  for (let i = 0; i < 80; i++) {
    for (const w of app.windows()) {
      try {
        if (await w.evaluate(() => !!(window.api && window.api.auth && window.api.permissions))) return w
      } catch { /* devtools / loading */ }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('main window with window.api.permissions never appeared')
}

// ── launch ───────────────────────────────────────────────────────────────────
const app = await electron.launch({
  executablePath: electronExe,
  args: ['.', `--user-data-dir=${userDataDir}`],
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: 'development' },
})

let page
try {
  page = await getMainPage(app)

  // ── bootstrap: setup + navigate to settings then reload ──────────────────────
  // completeSetup seeds the DB and sets setup_completed=1 so the SetupGate passes
  // after reload. In DEV mode, LoginGate auto-calls devLogin (owner) on mount.
  const setup = await apiCall(page, 'settings.completeSetup', {
    shop: { shop_name: 'PermUI E2E' },
    vat: { vat_enabled: false },
    adminPassword: 'admin123',
  })
  if (!setup.ok) throw new Error('completeSetup: ' + setup.error)

  // Set hash to /settings BEFORE reload so the app lands there after the devLogin fires.
  await page.evaluate(() => { window.location.hash = '#/settings' })
  await page.reload()

  // Wait for the Settings page — "ข้อมูลร้าน" tab is always the first visible tab.
  const firstTab = page.locator('button:has-text("ข้อมูลร้าน")').first()
  await firstTab.waitFor({ state: 'visible', timeout: 45000 })

  // ── U1: owner เห็น tab "สิทธิ์การใช้งาน" ─────────────────────────────────────
  console.log('\n=== U1 owner sees permissions tab ===')
  const permTab = page.locator('button:has-text("สิทธิ์การใช้งาน")').first()
  let u1ok = false
  try { await permTab.waitFor({ state: 'visible', timeout: 5000 }); u1ok = true } catch { }
  check('U1: owner เห็น tab "สิทธิ์การใช้งาน"', u1ok)
  if (!u1ok) throw new Error('permissions tab not visible — cannot continue UI tests (check useCan / devLogin role)')

  // ── U2: คลิก tab → matrix render ──────────────────────────────────────────────
  console.log('\n=== U2 click tab → matrix renders ===')
  await permTab.click()

  // Wait for loading state to clear (getMatrix IPC async)
  const ownerHeader = page.locator('th:has-text("เจ้าของร้าน")').first()
  await ownerHeader.waitFor({ state: 'visible', timeout: 10000 })

  check('U2a: column "เจ้าของร้าน" แสดง', await ownerHeader.isVisible())
  check('U2b: column "เภสัชกร" แสดง', await page.locator('th:has-text("เภสัชกร")').first().isVisible())
  check('U2c: column "พนักงาน" แสดง', await page.locator('th:has-text("พนักงาน")').first().isVisible())

  // 14 permission keys × 2 editable roles = 28 native <select> elements
  const tableSelects = page.locator('table select')
  await tableSelects.first().waitFor({ state: 'visible', timeout: 5000 })
  const selectCount = await tableSelects.count()
  check('U2d: มี select 28 ช่อง (14 keys × 2 roles)', selectCount === 28, `got ${selectCount}`)

  // Owner column: each row has <Check aria-label="เปิดเสมอ">
  const ownerCheckCount = await page.locator('[aria-label="เปิดเสมอ"]').count()
  check('U2e: owner column มี Check icon 14 ตัว', ownerCheckCount === 14, `got ${ownerCheckCount}`)

  // Group headers: "ระบบ" is a safe simple word (no special chars)
  const groupHeaderOk = await page.locator('td:has-text("ระบบ")').first().isVisible().catch(() => false)
  check('U2f: group header "ระบบ" แสดง', groupHeaderOk)

  // ── U3: edit → save → toast ───────────────────────────────────────────────────
  console.log('\n=== U3 edit + save + toast ===')
  // stock.adjust row → staff select (nth(1) = 1=pharmacist 2nd col, but EDITABLE_ROLES=[pharmacist,staff]
  // so nth(0)=pharmacist, nth(1)=staff inside this row)
  const stockAdjRow = page.locator('tr:has-text("ปรับสต็อก/ล็อต")').first()
  const staffAdjSel = stockAdjRow.locator('select').nth(1)
  const origVal = await staffAdjSel.inputValue()
  check('U3-pre: stock.adjust/staff registry default = override', origVal === 'override', `got "${origVal}"`)

  // Buttons are lifted to TabStrip by onActions — only visible when permissions tab is active
  const saveBtn = page.locator('button:has-text("บันทึก")').first()
  const cancelBtn = page.locator('button:has-text("ยกเลิก")').first()

  // Before editing: both buttons are disabled (dirty=false)
  const saveBefore = await saveBtn.isDisabled().catch(() => true)
  check('U3a: "บันทึก" disabled ก่อนแก้ไข', saveBefore, `isDisabled=${saveBefore}`)
  const cancelBefore = await cancelBtn.isDisabled().catch(() => true)
  check('U3b: "ยกเลิก" disabled ก่อนแก้ไข', cancelBefore, `isDisabled=${cancelBefore}`)

  // Change staff.stock.adjust → 'off'
  await staffAdjSel.selectOption('off')
  await page.waitForTimeout(200)

  check('U3c: "บันทึก" enabled หลังแก้ไข', !(await saveBtn.isDisabled()))
  check('U3d: "ยกเลิก" enabled หลังแก้ไข', !(await cancelBtn.isDisabled()))

  // Click save
  await saveBtn.click()

  // Wait for success toast title
  let toastOk = false
  try {
    await page.locator('text=บันทึกสิทธิ์แล้ว').first().waitFor({ state: 'visible', timeout: 6000 })
    toastOk = true
  } catch { }
  check('U3e: toast "บันทึกสิทธิ์แล้ว" ปรากฏ', toastOk)

  // After save completes, original = draft → dirty=false → buttons disabled again
  await page.waitForTimeout(500)
  check('U3f: "บันทึก" disabled หลัง save สำเร็จ', await saveBtn.isDisabled())

  // ── U4: persist หลัง navigate away + back ─────────────────────────────────────
  console.log('\n=== U4 persists after navigate away + back ===')
  await page.evaluate(() => { window.location.hash = '#/' })
  await page.waitForTimeout(400)
  await page.evaluate(() => { window.location.hash = '#/settings' })
  await page.locator('button:has-text("ข้อมูลร้าน")').waitFor({ state: 'visible', timeout: 10000 })

  // Re-open permissions tab
  await page.locator('button:has-text("สิทธิ์การใช้งาน")').first().click()
  await page.locator('table select').first().waitFor({ state: 'visible', timeout: 8000 })

  const persistedVal = await page.locator('tr:has-text("ปรับสต็อก/ล็อต")').first().locator('select').nth(1).inputValue()
  check('U4: ค่า "off" persist หลัง re-navigate (IPC getMatrix ดึงใหม่)', persistedVal === 'off', `got "${persistedVal}"`)

  // ── U5: ยกเลิก → draft revert ─────────────────────────────────────────────────
  console.log('\n=== U5 cancel reverts draft ===')
  const cancelTestSel = page.locator('tr:has-text("ปรับสต็อก/ล็อต")').first().locator('select').nth(1)
  await cancelTestSel.selectOption('override')  // change from 'off' → 'override'
  await page.waitForTimeout(200)

  check('U5a: "ยกเลิก" enabled หลังแก้ไข', !(await page.locator('button:has-text("ยกเลิก")').first().isDisabled()))
  await page.locator('button:has-text("ยกเลิก")').first().click()
  await page.waitForTimeout(300)

  const afterCancel = await page.locator('tr:has-text("ปรับสต็อก/ล็อต")').first().locator('select').nth(1).inputValue()
  check('U5b: ยกเลิก → ค่ากลับเป็น "off" (saved baseline)', afterCancel === 'off', `got "${afterCancel}"`)
  const saveBtnAfterCancel = await page.locator('button:has-text("บันทึก")').first().isDisabled()
  check('U5c: "บันทึก" กลับ disabled หลัง ยกเลิก', saveBtnAfterCancel)

  // ── U6: staff → tab หาย + matrix ไม่ render ────────────────────────────────────
  console.log('\n=== U6 staff cannot see permissions tab ===')
  // TitleBar DEV button cycles owner → pharmacist → staff on each click.
  // Selector: button[title*="สลับ role"]  (full title: "สลับ role (...) สำหรับทดสอบ")
  const switchBtn = page.locator('button[title*="สลับ role"]').first()
  let switchBtnFound = false
  try { await switchBtn.waitFor({ state: 'visible', timeout: 3000 }); switchBtnFound = true } catch { }

  if (!switchBtnFound) {
    check('U6a: tab ไม่แสดงสำหรับ staff', false, 'skip — TitleBar DEV switch button not found (not in DEV mode?)')
    check('U6b: matrix content ไม่ render สำหรับ staff', false, 'skip — same reason')
  } else {
    // Click once: owner → pharmacist
    await switchBtn.click()
    await page.waitForTimeout(400)
    // Click twice: pharmacist → staff
    await switchBtn.click()
    await page.waitForTimeout(400)

    // On the settings page now as staff: permissions tab should vanish from the tab list
    const permTabNow = page.locator('button:has-text("สิทธิ์การใช้งาน")')
    const tabCount = await permTabNow.count()
    check('U6a: tab "สิทธิ์การใช้งาน" ไม่อยู่ใน tab list (staff)', tabCount === 0, `count=${tabCount}`)

    // Navigate to /settings again as staff — matrix content should not render
    await page.evaluate(() => { window.location.hash = '#/' })
    await page.waitForTimeout(300)
    await page.evaluate(() => { window.location.hash = '#/settings' })
    // Wait for settings to load (tab strip should still show for staff if canSettings=true,
    // or the route still renders even if sidebar hides the link).
    // Give it a moment — if Settings doesn't render at all for staff, the tab list won't be there.
    await page.waitForTimeout(1000)

    // The "เจ้าของร้าน" column header is inside PermissionsTab — must NOT be in DOM for staff
    const matrixVisible = await page.locator('th:has-text("เจ้าของร้าน")').first().isVisible().catch(() => false)
    check('U6b: matrix table (th "เจ้าของร้าน") ไม่ render สำหรับ staff', !matrixVisible, `visible=${matrixVisible}`)
  }

} catch (e) {
  console.error('\nFATAL:', e.message)
  failed++
} finally {
  await app.close().catch(() => {})
  // Confirm better-sqlite3 native binary was not touched by this test run
  const binaryOk = fsSync.existsSync(pathMod.join(projectRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'))
  check('BINARY: better-sqlite3 native binary intact', binaryOk)
  try { fsSync.rmSync(userDataDir, { recursive: true, force: true }) } catch { /* Windows handle lock */ }
}

// ── summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`RESULT: ${passed} passed / ${failed} failed / ${passed + failed} total`)
if (failed > 0) {
  console.log('OVERALL: FAIL')
  process.exit(1)
} else {
  console.log('OVERALL: PASS')
}
