// E2E verification of the Role Permissions system (Phase 1).
// Exercises the data-driven requirePermission gate against a REAL Electron
// instance so main-side enforcement is verified — not just unit logic.
//
// Run:  node tests/e2e/verify-role-permissions.mjs
// Prereq: `npm run dev` must be running (builds dist-electron + serves :5173).
//
// Tests:
//   G1  owner devLogin → returns owner + full permission snapshot
//   G2  permissions.getMatrix (owner) → 28 rows (14 keys × 2 roles)
//   G3  devSetRole('staff') → session role flips
//   G4  permissions.getMatrix (staff) → FORBIDDEN
//   G5  reports.financeSummary (staff default off) → FORBIDDEN
//   G6  devSetRole('pharmacist') → pharmacist
//   G7  reports.financeSummary (pharmacist default allow) → succeeds
//   G8  devSetRole('owner') → owner again
//   G9  permissions.save a change → persists in subsequent getMatrix
//   G10 lockout-DoS safety: staff getMatrix → FORBIDDEN (not lockout failure)

import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Cross-platform electron executable
function resolveElectronExe() {
  const p = os.platform()
  if (p === 'win32') return pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  if (p === 'darwin') return pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  return pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
}
const electronExe = resolveElectronExe()
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-perms-e2e-'))

// Load playwright-core (_electron) from project node_modules or env override.
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

// ── tiny harness ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  const tag = ok ? 'PASS' : 'FAIL'
  if (ok) passed++; else failed++
  console.log(`  [${tag}] ${name}${detail ? '  — ' + detail : ''}`)
}

// Call window.api by dotted path
function apiCall(page, dotted, ...args) {
  return page.evaluate(async ({ dotted, args }) => {
    const fn = dotted.split('.').reduce((o, k) => (o ? o[k] : undefined), window.api)
    if (typeof fn !== 'function') return { ok: false, error: `no api: ${dotted}` }
    try { return { ok: true, value: await fn(...args) } }
    catch (e) { return { ok: false, error: String((e && e.message) || e) } }
  }, { dotted, args })
}
const errHas = (r, s) => !r.ok && String(r.error).includes(s)

// Wait for the main renderer window (window.api.auth + window.api.permissions must be present)
async function getMainPage(app) {
  for (let i = 0; i < 80; i++) {
    for (const w of app.windows()) {
      try {
        if (await w.evaluate(() => !!(window.api && window.api.auth && window.api.permissions))) return w
      } catch { /* devtools / loading */ }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('main window with window.api never appeared (is `npm run dev` running on :5173?)')
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

  // ── G1: devLogin → owner session ──────────────────────────────────────────
  console.log('\n=== G1 devLogin → owner session ===')
  const dl = await apiCall(page, 'auth.devLogin')
  check('G1a: devLogin returns non-null', !!dl.value, dl.ok ? '' : dl.error)
  check('G1b: role = owner', dl.value?.role === 'owner', dl.value?.role)
  check('G1c: permissions snapshot has permission.manage = allow',
    dl.value?.permissions?.['permission.manage'] === 'allow',
    JSON.stringify(dl.value?.permissions?.['permission.manage']))

  // ── G2: getMatrix (owner) returns 28 rows ────────────────────────────────
  console.log('\n=== G2 permissions.getMatrix (owner) ===')
  const matrix = await apiCall(page, 'permissions.getMatrix')
  const rows = matrix.value ?? []
  // 14 MATRIX_KEYS × 2 EDITABLE_ROLES (pharmacist + staff) = 28
  check('G2a: getMatrix succeeds for owner', matrix.ok, matrix.ok ? '' : matrix.error)
  check('G2b: returns 28 rows (14 keys × 2 roles)', rows.length === 28, `got ${rows.length}`)
  const pharmacistFinance = rows.find(r => r.role === 'pharmacist' && r.permission === 'report.finance')
  const staffFinance = rows.find(r => r.role === 'staff' && r.permission === 'report.finance')
  check('G2c: pharmacist.report.finance default = allow', pharmacistFinance?.state === 'allow', pharmacistFinance?.state)
  check('G2d: staff.report.finance default = off', staffFinance?.state === 'off', staffFinance?.state)

  // ── G3: devSetRole('staff') ───────────────────────────────────────────────
  console.log('\n=== G3 devSetRole(staff) ===')
  const toStaff = await apiCall(page, 'auth.devSetRole', 'staff')
  check('G3a: devSetRole(staff) ok', !!toStaff.value, toStaff.ok ? '' : toStaff.error)
  check('G3b: role = staff', toStaff.value?.role === 'staff', toStaff.value?.role)

  // ── G4: getMatrix (staff) → FORBIDDEN ────────────────────────────────────
  console.log('\n=== G4 permissions.getMatrix (staff) → FORBIDDEN ===')
  const staffMatrix = await apiCall(page, 'permissions.getMatrix')
  check('G4: getMatrix throws FORBIDDEN for staff', errHas(staffMatrix, 'FORBIDDEN'), staffMatrix.error)

  // ── G5: report.finance (staff default off) → FORBIDDEN ───────────────────
  console.log('\n=== G5 reports.financeSummary (staff) → FORBIDDEN ===')
  const staffFin = await apiCall(page, 'reports.financeSummary', {})
  check('G5: financeSummary FORBIDDEN for staff', errHas(staffFin, 'FORBIDDEN'), staffFin.error)

  // ── G6: devSetRole('pharmacist') ──────────────────────────────────────────
  console.log('\n=== G6 devSetRole(pharmacist) ===')
  const toPharm = await apiCall(page, 'auth.devSetRole', 'pharmacist')
  check('G6: devSetRole(pharmacist) ok', toPharm.value?.role === 'pharmacist', toPharm.value?.role)

  // ── G7: report.finance (pharmacist default allow) → succeeds ─────────────
  console.log('\n=== G7 reports.financeSummary (pharmacist) → allow ===')
  const pharmFin = await apiCall(page, 'reports.financeSummary', {})
  check('G7: financeSummary PASSES for pharmacist (default allow)', pharmFin.ok, pharmFin.ok ? '' : pharmFin.error)

  // ── G8: devSetRole('owner') ───────────────────────────────────────────────
  console.log('\n=== G8 devSetRole(owner) ===')
  const toOwner = await apiCall(page, 'auth.devSetRole', 'owner')
  check('G8: back to owner', toOwner.value?.role === 'owner', toOwner.value?.role)

  // ── G9: permissions.save → persists ──────────────────────────────────────
  console.log('\n=== G9 permissions.save → persists ===')
  // Change staff.stock.adjust from 'override' (default) → 'off'
  const saveR = await apiCall(page, 'permissions.save', [{ role: 'staff', permission: 'stock.adjust', state: 'off' }])
  check('G9a: save succeeds for owner', saveR.ok, saveR.ok ? '' : saveR.error)
  // Verify it persisted
  const matrix2 = await apiCall(page, 'permissions.getMatrix')
  const staffAdjust = (matrix2.value ?? []).find(r => r.role === 'staff' && r.permission === 'stock.adjust')
  check('G9b: staff.stock.adjust persists as off', staffAdjust?.state === 'off', staffAdjust?.state)

  // ── G10: staff cannot use NEEDS_OVERRIDE path → still FORBIDDEN, no lockout ──
  console.log('\n=== G10 lockout-DoS safety (staff getMatrix repeated) ===')
  await apiCall(page, 'auth.devSetRole', 'staff')
  const r1 = await apiCall(page, 'permissions.getMatrix')
  const r2 = await apiCall(page, 'permissions.getMatrix')
  const r3 = await apiCall(page, 'permissions.getMatrix')
  check('G10a: repeated getMatrix (staff) → always FORBIDDEN, never LOCKED',
    errHas(r1, 'FORBIDDEN') && errHas(r2, 'FORBIDDEN') && errHas(r3, 'FORBIDDEN'),
    `r1=${r1.error} r2=${r2.error} r3=${r3.error}`)

} catch (err) {
  console.error('\nFATAL:', err.message)
  failed++
} finally {
  await app.close().catch(() => {})
  // Verify better-sqlite3 binary untouched
  const binaryOk = fsSync.existsSync(pathMod.join(projectRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'))
  check('BINARY: better-sqlite3 native binary intact', binaryOk)
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(56)}`)
console.log(`RESULT: ${passed} passed / ${failed} failed / ${passed + failed} total`)
if (failed > 0) {
  console.log('OVERALL: FAIL')
  process.exit(1)
} else {
  console.log('OVERALL: PASS')
}
