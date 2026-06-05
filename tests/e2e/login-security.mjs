// E2E verification of the Phase 0–3 + 2.5 login/role system, driven against a
// REAL Electron instance (not unit logic). Launches the app with an isolated
// --user-data-dir so it never touches the dev DB, then exercises the security
// invariants by calling window.api.* directly through the preload bridge — the
// same path the renderer uses, so main-side session binding / role enforcement /
// navigation clearing are all exercised for real.
//
// Prereq: `npm run dev` must be running (builds dist-electron + serves :5173).
// Run:    node tests/e2e/login-security.mjs
//
// playwright-core lives in an isolated prefix so the project's node_modules
// (and the better-sqlite3 prebuilt) are never reconciled by npm.
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syntropic-e2e-'))

// playwright-core is intentionally NOT a project dependency (installing it would
// make npm reconcile node_modules and risk the better-sqlite3 prebuilt). Resolve
// it from, in order: PLAYWRIGHT_CORE env, the project's node_modules (if ever
// added there), or the isolated sibling install used to author this test.
function loadElectron() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    'playwright-core',
    path.resolve(projectRoot, '..', '.pw-tools', 'node_modules', 'playwright-core'),
  ].filter(Boolean)
  for (const c of candidates) {
    try { return require(c)._electron } catch { /* try next */ }
  }
  throw new Error('playwright-core not found. Install it in an isolated prefix and/or set PLAYWRIGHT_CORE to its path.\nTried: ' + candidates.join(', '))
}
const electron = loadElectron()

// ---- tiny assertion harness --------------------------------------------------
const results = []
let group = ''
const setGroup = (g) => { group = g; console.log(`\n=== ${g} ===`) }
function check(name, pass, detail = '') {
  results.push({ group, name, pass })
  const tag = pass ? 'PASS' : 'FAIL'
  console.log(`  [${tag}] ${name}${detail ? `  — ${detail}` : ''}`)
}

// Call window.api by dotted path; resolve to {ok, value} or {ok:false, error}.
function api(page, dotted, ...args) {
  return page.evaluate(async ({ dotted, args }) => {
    const fn = dotted.split('.').reduce((o, k) => (o ? o[k] : undefined), window.api)
    if (typeof fn !== 'function') return { ok: false, error: `no such api: ${dotted}` }
    try { return { ok: true, value: await fn(...args) } }
    catch (e) { return { ok: false, error: String((e && e.message) || e) } }
  }, { dotted, args })
}
const errHas = (r, s) => !r.ok && String(r.error).includes(s)

async function getMainPage(app) {
  for (let i = 0; i < 80; i++) {
    for (const w of app.windows()) {
      try { if (await w.evaluate(() => !!(window.api && window.api.auth && window.api.reports))) return w } catch { /* devtools / loading */ }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('main window with window.api never appeared (is `npm run dev` running on :5173?)')
}

// ---- run ---------------------------------------------------------------------
const app = await electron.launch({
  executablePath: electronExe,
  args: ['.', `--user-data-dir=${userDataDir}`],
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: 'development' },
})

let page
try {
  page = await getMainPage(app)

  // T0 — login picker -------------------------------------------------------
  // The picker now shows @username + email by product decision (was name-only).
  // The security line that still matters: NEVER expose password/hash.
  setGroup('T0 listLoginUsers (no password/hash leak)')
  const users = (await api(page, 'auth.listLoginUsers')).value || []
  const admin = users.find((u) => u.role === 'admin')
  const staff = users.find((u) => u.role === 'staff')
  check('admin user present', !!admin, admin && `id=${admin.id} ${admin.name}`)
  check('staff user present', !!staff, staff && `id=${staff.id} ${staff.name}`)
  check('rows never expose password/hash', users.every((u) => !('password' in u) && !('recovery_code_hash' in u)))
  check('picker exposes username + email (by design)', users.every((u) => 'username' in u && 'email' in u))
  const adminId = admin?.id
  const staffId = staff?.id

  // T1 — completeSetup issues a one-time recovery code ----------------------
  setGroup('T1 completeSetup → admin password + recovery code')
  const ADMIN_PW = 'admin123'
  const setup = await api(page, 'settings.completeSetup', { shop: { shop_name: 'E2E Pharmacy' }, vat: { vat_enabled: false }, adminPassword: ADMIN_PW })
  const code1 = setup.value?.recoveryCode
  check('setup_completed === 1', setup.value?.setup_completed === 1)
  check('recoveryCode returned once (non-empty)', typeof code1 === 'string' && code1.length > 0, code1)

  // T2 — login returns safe fields only -------------------------------------
  setGroup('T2 login (admin) returns {id,name,role}, no email')
  const la = await api(page, 'auth.login', adminId, ADMIN_PW)
  check('admin login succeeds', la.ok && la.value?.role === 'admin', la.ok ? '' : la.error)
  check('login result has no email key', la.ok && !('email' in (la.value || {})))

  // T3 — wrong password rejected (generic message) --------------------------
  setGroup('T3 wrong password')
  const wrong = await api(page, 'auth.login', staffId, 'definitely-wrong')
  check('wrong password → รหัสผ่านไม่ถูกต้อง', errHas(wrong, 'รหัสผ่านไม่ถูกต้อง'), wrong.error)

  // T4 — main-side session role enforcement ---------------------------------
  setGroup('T4 session role enforcement (the BL-1 invariant)')
  await api(page, 'auth.login', adminId, ADMIN_PW)               // bind admin
  const adminFin = await api(page, 'reports.financeSummary', {})
  check('admin CAN call financeSummary', adminFin.ok, adminFin.ok ? '' : adminFin.error)

  await api(page, 'auth.logout')                                  // clear session
  const noSessFin = await api(page, 'reports.financeSummary', {})
  check('no session → financeSummary FORBIDDEN', errHas(noSessFin, 'FORBIDDEN'), noSessFin.error)

  await api(page, 'auth.login', staffId, 'staff')                 // bind staff (legacy pw, upgrades)
  const staffFin = await api(page, 'reports.financeSummary', {})
  check('staff → financeSummary FORBIDDEN', errHas(staffFin, 'FORBIDDEN'), staffFin.error)
  const staffStaffList = await api(page, 'people.listStaff', {})
  check('staff → listStaff FORBIDDEN', errHas(staffStaffList, 'FORBIDDEN'), staffStaffList.error)

  // T5 — manager override (inline credential, verified in main) --------------
  setGroup('T5 manager-override (staff session, admin credential)')
  const ovOk = await api(page, 'reports.voidSale', 999999, 'e2e', { userId: adminId, password: ADMIN_PW })
  check('valid override passes auth (fails only on missing sale)',
    errHas(ovOk, 'ไม่สามารถยกเลิกรายการนี้ได้') && !errHas(ovOk, 'FORBIDDEN'), ovOk.error)
  const ovBadPw = await api(page, 'reports.voidSale', 999999, 'e2e', { userId: adminId, password: 'nope' })
  check('override wrong admin password → รหัสผ่านไม่ถูกต้อง', errHas(ovBadPw, 'รหัสผ่านไม่ถูกต้อง'), ovBadPw.error)
  const ovNonAdmin = await api(page, 'reports.voidSale', 999999, 'e2e', { userId: staffId, password: 'staff' })
  check('override with non-admin user rejected', errHas(ovNonAdmin, 'รหัสผ่านไม่ถูกต้อง'), ovNonAdmin.error)
  const noOv = await api(page, 'reports.voidSale', 999999, 'e2e')
  check('staff, no override → FORBIDDEN', errHas(noOv, 'FORBIDDEN'), noOv.error)

  // T6 — DeadStock cost-strip (R1: staff never see per-row cost) -------------
  setGroup('T6 DeadStock cost-strip (staff cost_value=null, admin numeric)')
  // create a stock lot so inactiveProducts has a row to strip (still staff session)
  const plist = await api(page, 'products.list', { is_bundle: 0, limit: 5 })
  const prows = Array.isArray(plist.value) ? plist.value : (plist.value?.rows || [])
  const prod = prows[0]
  const sup = await api(page, 'people.saveSupplier', { name: 'E2E Supplier', tax_id: '', phone: '', address: '' })
  let stripPass = false, stripDetail = 'no seed product to exercise'
  if (prod && sup.ok) {
    const gr = await api(page, 'purchase.save', {
      invoice_no: 'GR-E2E-0001', supplier_id: sup.value.id, supplier_invoice_no: 'INV-E2E',
      receive_date: '2026-06-05', payment_type: 'cash', is_paid: true,
      items: [{ product_id: prod.id, lot_number: 'E2E-LOT', expiry_date: '2030-12-31', cost_price: 25, sell_price: 40, qty: 10 }],
      userId: adminId,
    })
    check('GR lot created (cost 25 × qty 10)', gr.ok, gr.ok ? '' : gr.error)

    const staffDead = await api(page, 'reports.inactiveProducts', {})
    const sRow = (staffDead.value || []).find((r) => r.product_id === prod.id)
    check('staff: row present but cost_value === null', !!sRow && sRow.cost_value === null,
      sRow ? `cost_value=${sRow.cost_value}` : 'row missing')

    await api(page, 'auth.login', adminId, ADMIN_PW)   // back to admin
    const adminDead = await api(page, 'reports.inactiveProducts', {})
    const aRow = (adminDead.value || []).find((r) => r.product_id === prod.id)
    stripPass = !!aRow && typeof aRow.cost_value === 'number' && aRow.cost_value > 0
    stripDetail = aRow ? `cost_value=${aRow.cost_value}` : 'row missing'
  } else {
    await api(page, 'auth.login', adminId, ADMIN_PW)
  }
  check('admin: same row shows numeric cost_value', stripPass, stripDetail)

  // T7 — HashRouter same-document nav does NOT drop the session --------------
  setGroup('T7 session survives HashRouter route change (same-document)')
  await api(page, 'auth.login', adminId, ADMIN_PW)
  await page.evaluate(() => { window.location.hash = '#/reports/finance' })
  await page.waitForTimeout(300)
  const afterHash = await api(page, 'reports.financeSummary', {})
  check('admin session intact after hash change', afterHash.ok, afterHash.ok ? '' : afterHash.error)

  // T8 — recovery-code self-service -----------------------------------------
  setGroup('T8 recovery-code reset (single-use, regenerates)')
  const reset = await api(page, 'auth.resetAdminPassword', code1, 'newpw99')
  const code2 = reset.value?.recoveryCode
  check('reset returns a NEW recovery code', reset.ok && typeof code2 === 'string' && code2 !== code1, reset.ok ? `${code1} → ${code2}` : reset.error)
  const loginNew = await api(page, 'auth.login', adminId, 'newpw99')
  check('admin can log in with the new password', loginNew.ok && loginNew.value?.role === 'admin', loginNew.ok ? '' : loginNew.error)
  const reuseOld = await api(page, 'auth.resetAdminPassword', code1, 'whatever')
  check('old recovery code no longer valid', errHas(reuseOld, 'รหัสกู้คืนไม่ถูกต้อง'), reuseOld.error)

  // T8b — self-service changePassword (own password only, session-scoped) ----
  setGroup('T8b changePassword (self-service)')
  await api(page, 'auth.login', staffId, 'staff')                 // bind staff (pw upgraded in T4)
  const cpWrong = await api(page, 'auth.changePassword', 'wrong-current', 'staffNew1')
  check('wrong current password rejected', errHas(cpWrong, 'รหัสผ่านปัจจุบันไม่ถูกต้อง'), cpWrong.error)
  const cpOk = await api(page, 'auth.changePassword', 'staff', 'staffNew1')
  check('correct current → change succeeds', cpOk.ok && cpOk.value?.ok === true, cpOk.ok ? '' : cpOk.error)
  await api(page, 'auth.logout')
  const reLoginNew = await api(page, 'auth.login', staffId, 'staffNew1')
  check('staff can log in with the new password', reLoginNew.ok, reLoginNew.ok ? '' : reLoginNew.error)
  await api(page, 'auth.logout')
  const cpNoSess = await api(page, 'auth.changePassword', 'x', 'yyyy')
  check('no session → changePassword FORBIDDEN', errHas(cpNoSess, 'FORBIDDEN'), cpNoSess.error)
  await api(page, 'auth.login', adminId, 'newpw99')               // restore admin session for T9

  // T9 — full reload clears the main-side session ---------------------------
  setGroup('T9 full reload clears session (no stale role replay)')
  await api(page, 'auth.login', adminId, 'newpw99')
  await page.reload()
  await page.waitForFunction(() => !!(window.api && window.api.reports), null, { timeout: 30000 })
  const afterReload = await api(page, 'reports.financeSummary', {})
  check('after reload → FORBIDDEN (session gone)', errHas(afterReload, 'FORBIDDEN'), afterReload.error)
} catch (e) {
  console.error('\nFATAL', e)
  results.push({ group: 'harness', name: String(e && e.message || e), pass: false })
} finally {
  await app.close().catch(() => {})
  try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch { /* backup may hold a handle */ }
}

// ---- summary -----------------------------------------------------------------
const failed = results.filter((r) => !r.pass)
console.log(`\n──────── ${results.length - failed.length}/${results.length} passed ────────`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - [${f.group}] ${f.name}`)
}
process.exit(failed.length ? 1 : 0)
