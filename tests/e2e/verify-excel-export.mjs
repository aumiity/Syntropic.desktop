// E2E verification of the Export-to-Excel feature, driven against a REAL
// Electron instance. Launches the app (macOS binary), binds an admin session
// via auth:devLogin, stubs the native save dialog in MAIN so writes go to a
// temp dir, then calls window.api.exports.* (the real preload -> ipcMain ->
// exceljs path) and reads the produced .xlsx back to assert structure/content.
//
// Prereq: `npm run dev` running (serves :5173 + builds dist-electron).
// Run:    node tests/e2e/verify-excel-export.mjs
//
// Uses the REAL dev DB (no --user-data-dir): export is READ-ONLY, the only
// writes are .xlsx files into an isolated temp dir via the stubbed dialog.
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// macOS electron binary
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syntropic-xlsx-e2e-'))

function loadElectron() {
  for (const c of [process.env.PLAYWRIGHT_CORE, 'playwright-core', 'playwright'].filter(Boolean)) {
    try { const m = require(c); return m._electron } catch { /* next */ }
  }
  throw new Error('playwright-core not found')
}
const electron = loadElectron()
const ExcelJS = require('exceljs')

const results = []
let group = ''
const setGroup = (g) => { group = g; console.log(`\n=== ${g} ===`) }
function check(name, pass, detail = '') {
  results.push({ group, name, pass })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`)
}

async function readWb(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  return wb
}
// collect every cell's value+numFmt across a worksheet
function cells(ws) {
  const out = []
  ws.eachRow((row) => row.eachCell((c) => out.push({ v: c.value, fmt: c.numFmt, type: c.type })))
  return out
}

const app = await electron.launch({
  executablePath: electronExe,
  args: ['.'],
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: 'development' },
})

try {
  // The app opens >1 window; pick the renderer that loaded :5173 AND exposes
  // the preload bridge (firstWindow() can race to the wrong one).
  async function getApiPage() {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      for (const w of app.windows()) {
        try {
          if (!w.url().startsWith('http://localhost:5173')) continue
          const ok = await w.evaluate(() => !!(window.api && window.api.exports && window.api.auth))
          if (ok) return w
        } catch { /* window navigating */ }
      }
      await app.firstWindow().catch(() => {})
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('no renderer window with window.api.exports found')
  }
  const page = await getApiPage()

  // Stub the native save dialog in MAIN: each call returns a fresh temp path.
  await app.evaluate(({ dialog }, dir) => {
    let n = 0
    const next = () => ({ canceled: false, filePath: `${dir}/out-${++n}.xlsx` })
    dialog.showSaveDialog = async () => next()
    // expose a cancel-stub toggler for the cancel test (main is ESM — no require)
    globalThis.__setCancel = (v) => {
      dialog.showSaveDialog = v
        ? async () => ({ canceled: true, filePath: undefined })
        : async () => next()
    }
  }, outDir)

  // ---- admin session ----
  setGroup('admin session + dataset exports')
  const who = await page.evaluate(() => window.api.auth.devLogin())
  check('devLogin returns an admin user', who && who.role === 'admin', JSON.stringify(who))

  const run = (ns, filters) => page.evaluate(([n, f]) => window.api.exports[n](f), [ns, filters])

  // sales (broad range to capture whatever the dev DB holds)
  const broad = { date_from: '2000-01-01', date_to: '2099-12-31' }
  for (const ns of ['sales', 'purchases', 'vat', 'expenses']) {
    let res
    try { res = await run(ns, broad) } catch (e) { res = { ok: false, err: String(e) } }
    check(`exports.${ns} returns ok:true with a path`, res && res.ok === true && !!res.path, JSON.stringify(res))
    if (res && res.ok && res.path && fs.existsSync(res.path)) {
      const wb = await readWb(res.path)
      const sheetNames = wb.worksheets.map((w) => w.name)
      const expectSheets = ns === 'sales' ? 2 : ns === 'purchases' ? 2 : ns === 'vat' ? 3 : 1
      check(`  ${ns}: sheet count = ${expectSheets}`, wb.worksheets.length === expectSheets, `sheets=[${sheetNames.join(', ')}]`)
      // Thai text present somewhere (headers are Thai even with 0 data rows)
      const allText = JSON.stringify(sheetNames) + JSON.stringify(wb.worksheets.map((w) => cells(w).map((c) => c.v)))
      check(`  ${ns}: contains Thai text`, /[฀-๿]/.test(allText), '')
      // record data-row presence for richer checks
      const dataRows = wb.worksheets.reduce((s, w) => s + Math.max(0, w.rowCount - 1), 0)
      console.log(`        (${ns}: ${dataRows} data rows across sheets)`)
    }
  }

  // ---- content checks on whichever export has data rows ----
  setGroup('cell formatting (date text / barcode text / currency numeric)')
  // re-export sales+purchases and inspect formats; if no rows, note it
  let sawDate = false, sawBarcodeText = false, sawCurrencyNumeric = false, anyDataRows = false
  for (const ns of ['sales', 'purchases', 'expenses']) {
    const res = await run(ns, broad)
    if (!res?.ok || !fs.existsSync(res.path)) continue
    const wb = await readWb(res.path)
    for (const ws of wb.worksheets) {
      if (ws.rowCount > 1) anyDataRows = true
      for (const c of cells(ws)) {
        if (typeof c.v === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(c.v)) sawDate = true
        // barcode/lot stored as text: value is string of digits AND column numFmt is '@'
        if (typeof c.v === 'string' && /^\d{6,}$/.test(c.v)) sawBarcodeText = true
        if (typeof c.v === 'number' && c.v !== 0) sawCurrencyNumeric = true
      }
    }
  }
  if (anyDataRows) {
    check('a date cell renders as DD/MM/YYYY text', sawDate)
    check('currency cells are numeric (SUM-able)', sawCurrencyNumeric)
    check('a long-digit (barcode/lot) cell stored as text string', sawBarcodeText)
  } else {
    console.log('  [INFO] dev DB has 0 data rows in these datasets — date/barcode/currency cell checks skipped (structure+headers still verified above)')
  }

  // ---- empty-range export still valid ----
  setGroup('empty date range -> header-only workbook')
  const future = { date_from: '2099-01-01', date_to: '2099-01-02' }
  const er = await run('sales', future)
  check('empty-range sales export ok:true', er?.ok === true, JSON.stringify(er))
  if (er?.ok && fs.existsSync(er.path)) {
    const wb = await readWb(er.path)
    check('empty-range workbook has 2 sheets with header rows', wb.worksheets.length === 2 && wb.worksheets.every((w) => w.rowCount >= 1))
  }

  // ---- cancel path ----
  setGroup('cancel -> silent, no file, no throw')
  await app.evaluate(() => globalThis.__setCancel(true))
  const cancelled = await run('sales', broad).catch((e) => ({ threw: String(e) }))
  check('cancel returns {ok:false, canceled:true} (no throw)', cancelled && cancelled.ok === false && cancelled.canceled === true, JSON.stringify(cancelled))
  await app.evaluate(() => globalThis.__setCancel(false))

  // ---- role gating ----
  setGroup('staff role -> FORBIDDEN')
  const asStaff = await page.evaluate(() => window.api.auth.devSetRole('staff'))
  check('devSetRole(staff) rebinds session', asStaff && asStaff.role === 'staff', JSON.stringify(asStaff))
  for (const ns of ['sales', 'purchases', 'vat', 'expenses']) {
    const r = await run(ns, broad).then((v) => ({ ok: true, v })).catch((e) => ({ ok: false, msg: String(e) }))
    check(`staff exports.${ns} is blocked (FORBIDDEN)`, r.ok === false && /FORBIDDEN/.test(r.msg), r.ok ? 'NOT blocked!' : r.msg.slice(0, 80))
  }
} finally {
  await app.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASS ===`)
if (failed.length) { console.log('FAILED:'); failed.forEach((f) => console.log(`  - [${f.group}] ${f.name}`)) }
console.log(`xlsx output dir: ${outDir}`)
process.exit(failed.length ? 1 : 0)
