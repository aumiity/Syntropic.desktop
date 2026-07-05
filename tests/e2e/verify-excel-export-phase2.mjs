// E2E verification of Export-to-Excel PHASE 2 (staff-allowed operational exports:
// expiry + low-stock, with COST columns stripped for non-admin). Driven against a
// real Electron instance on the dev DB (export = read-only).
//
// Prereq: `npm run dev` running (:5173). Run: node tests/e2e/verify-excel-export-phase2.mjs
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syntropic-xlsx2-e2e-'))
const _electron = (() => { for (const c of [process.env.PLAYWRIGHT_CORE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(c)._electron } catch {} } throw new Error('playwright not found') })()
const ExcelJS = require('exceljs')

const results = []
let group = ''
const setGroup = (g) => { group = g; console.log(`\n=== ${g} ===`) }
const check = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`) }

// header row (row 1) cell values of the first sheet
async function headers(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  const hs = []
  ws.getRow(1).eachCell((c) => hs.push(String(c.value)))
  return { headers: hs, sheets: wb.worksheets.length, rows: Math.max(0, ws.rowCount - 1) }
}

const COST_HEADERS = ['ต้นทุน/หน่วย', 'มูลค่ารวม', 'ราคาผู้ขายถูกสุด']
const hasCost = (hs) => hs.some((h) => COST_HEADERS.includes(h))

const app = await _electron.launch({ executablePath: electronExe, args: ['.'], cwd: projectRoot, env: { ...process.env, NODE_ENV: 'development' } })
try {
  async function getApiPage() {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      for (const w of app.windows()) {
        try { if (w.url().startsWith('http://localhost:5173') && await w.evaluate(() => !!(window.api?.exports?.expiry && window.api?.auth))) return w } catch {}
      }
      await app.firstWindow().catch(() => {})
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('no api page')
  }
  const page = await getApiPage()
  await app.evaluate(({ dialog }, dir) => { let n = 0; dialog.showSaveDialog = async () => ({ canceled: false, filePath: `${dir}/out-${++n}.xlsx` }) }, outDir)
  const run = (ns, f) => page.evaluate(([n, ff]) => window.api.exports[n](ff), [ns, f])

  // ── admin: exports work AND include cost columns ──
  setGroup('admin — expiry/lowStock export with cost columns')
  const who = await page.evaluate(() => window.api.auth.devLogin())
  check('devLogin = admin', ['owner','admin'].includes(who?.role), JSON.stringify(who))
  for (const ns of ['expiry', 'lowStock']) {
    const res = await run(ns, {}).catch((e) => ({ ok: false, err: String(e) }))
    check(`admin exports.${ns} ok`, res?.ok === true && fs.existsSync(res.path), JSON.stringify(res))
    if (res?.ok) {
      const h = await headers(res.path)
      check(`  ${ns}: 1 sheet, Thai headers`, h.sheets === 1 && h.headers.some((x) => /[฀-๿]/.test(x)), `[${h.headers.join(', ')}]`)
      check(`  ${ns}: COST column PRESENT for admin`, hasCost(h.headers), `${h.rows} rows`)
    }
  }

  // ── staff: exports NOT blocked, but cost columns stripped ──
  setGroup('staff — expiry/lowStock allowed, cost columns STRIPPED')
  const staff = await page.evaluate(() => window.api.auth.devSetRole('staff'))
  check('devSetRole(staff)', staff?.role === 'staff', JSON.stringify(staff))
  for (const ns of ['expiry', 'lowStock']) {
    const res = await run(ns, {}).then((v) => ({ ok: true, v })).catch((e) => ({ ok: false, msg: String(e) }))
    check(`staff exports.${ns} NOT blocked (ok, no FORBIDDEN)`, res.ok === true && res.v?.ok === true, res.ok ? JSON.stringify(res.v) : res.msg)
    if (res.ok && res.v?.ok && fs.existsSync(res.v.path)) {
      const h = await headers(res.v.path)
      check(`  ${ns}: COST column ABSENT for staff`, !hasCost(h.headers), `[${h.headers.join(', ')}]`)
      check(`  ${ns}: still has reorder-useful columns`, h.headers.length >= 6, `${h.headers.length} cols`)
    }
  }

  // ── staff still blocked on finance (regression guard) ──
  setGroup('staff — finance still FORBIDDEN (regression)')
  for (const ns of ['sales', 'vat']) {
    const r = await run(ns, {}).then(() => ({ ok: true })).catch((e) => ({ ok: false, msg: String(e) }))
    check(`staff exports.${ns} blocked`, r.ok === false && /FORBIDDEN/.test(r.msg), r.ok ? 'NOT blocked!' : 'FORBIDDEN')
  }
} finally { await app.close() }

const failed = results.filter((r) => !r.pass)
console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASS ===`)
if (failed.length) failed.forEach((f) => console.log(`  FAIL: ${f.name}`))
console.log(`xlsx dir: ${outDir}`)
process.exit(failed.length ? 1 : 0)
