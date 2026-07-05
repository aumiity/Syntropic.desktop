// Storefront smoke: full retail cycle against a REAL Electron app + fresh temp DB.
// GR receive (2 lots, different expiry) → POS saveBill walk-in (FEFO spans lots,
// earliest lot closes) → daily stats → voidSale → stock + lot restored.
import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import { fileURLToPath } from 'node:url'
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = process.platform === 'win32' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe') : process.platform === 'darwin' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron') : pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-smoke-'))
const { _electron: electron } = require(pathMod.join(projectRoot, 'node_modules', 'playwright-core'))

let passed = 0, failed = 0
function check(n, ok, d) { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${n}${d ? '  -- ' + d : ''}`); ok ? passed++ : failed++ }
async function getMainPage(a) { for (let i = 0; i < 80; i++) { for (const w of a.windows()) { try { if (await w.evaluate(() => !!(window.api && window.api.auth))) return w } catch {} } await new Promise(r => setTimeout(r, 500)) } throw new Error('no window') }
async function api(pg, dotted, ...args) { return pg.evaluate(async ({ dotted, args }) => { const fn = dotted.split('.').reduce((o, k) => o ? o[k] : undefined, window.api); if (typeof fn !== 'function') return { ok: false, error: 'no api:' + dotted }; try { return { ok: true, value: await fn(...args) } } catch (e) { return { ok: false, error: String(e && e.message || e) } } }, { dotted, args }) }

const app = await electron.launch({ executablePath: electronExe, args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot, env: { ...process.env, NODE_ENV: 'development' } })
try {
  const page = await getMainPage(app)
  const setup = await api(page, 'settings.completeSetup', { shop: { shop_name: 'Smoke' }, vat: { vat_enabled: false }, adminPassword: 'admin123' })
  if (!setup.ok) throw new Error('setup:' + setup.error)
  const users = (await api(page, 'auth.listLoginUsers')).value || []
  const owner = users.find(u => u.role === 'owner' || u.role === 'admin')
  const la = await api(page, 'auth.login', owner.id, 'admin123')
  if (!la.ok) throw new Error('login:' + la.error)

  // ── seed product + 2 lots via real GR flow ──
  const prod = await api(page, 'products.create', { trade_name: 'ยาสโมคเทส', category_id: 1, unit_id: 1, unit_name: 'เม็ด', price_retail: 10, cost_price: 5, last_cost_price: 5, reorder_point: 0, notes: '' })
  if (!prod.ok) throw new Error('create:' + prod.error)
  const pid = prod.value.id
  const sup = (await api(page, 'suppliers.list')).value || []
  const supplierId = (Array.isArray(sup) ? sup[0]?.id : sup.rows?.[0]?.id) || 1
  const gr1no = (await api(page, 'purchase.nextGRNumber')).value || 'GR-S1'
  const gr1 = await api(page, 'purchase.save', { invoice_no: gr1no, supplier_id: supplierId, supplier_invoice_no: 'S1', receive_date: '2026-07-01', payment_type: 'cash', is_paid: true, vat_mode: 'none', vat_rate: 0, userId: owner.id, items: [{ product_id: pid, lot_number: 'LOT-EARLY', expiry_date: '2027-01-01', cost_price: 5, sell_price: 10, qty: 10 }] })
  check('GR#1 (LOT-EARLY exp 2027, qty 10)', gr1.ok, gr1.error)
  const gr2no = (await api(page, 'purchase.nextGRNumber')).value || 'GR-S2'
  const gr2 = await api(page, 'purchase.save', { invoice_no: gr2no, supplier_id: supplierId, supplier_invoice_no: 'S2', receive_date: '2026-07-02', payment_type: 'cash', is_paid: true, vat_mode: 'none', vat_rate: 0, userId: owner.id, items: [{ product_id: pid, lot_number: 'LOT-LATE', expiry_date: '2028-01-01', cost_price: 6, sell_price: 10, qty: 10 }] })
  check('GR#2 (LOT-LATE exp 2028, qty 10)', gr2.ok, gr2.error)

  const lots0 = (await api(page, 'products.getLots', pid)).value || []
  const stock0 = lots0.reduce((s, l) => s + Number(l.qty_on_hand ?? 0), 0)
  check('stock after 2 GRs = 20', stock0 === 20, 'lots=' + JSON.stringify(lots0.map(l => ({ lot: l.lot_number, q: l.qty_on_hand, closed: l.is_closed }))))

  // ── POS sale: walk-in, qty 12 base units → FEFO must span both lots ──
  const bill = await api(page, 'pos.saveBill', {
    sale_type: 'retail', customer_id: null, customer_name_free: '',
    items: [{ product_id: pid, item_name: 'ยาสโมคเทส', unit_name: 'เม็ด', qty: 12, qty_per_base: 1, unit_price: 10, discount: 0, line_total: 120 }],
    subtotal: 120, total_discount: 0, total_amount: 120,
    cash_amount: 120, card_amount: 0, transfer_amount: 0, change_amount: 0, sold_by: owner.id,
  })
  check('saveBill ok + invoice RC-*', bill.ok && /^RC-\d{8}-\d{4}$/.test(bill.value?.invoice_no || ''), JSON.stringify(bill.value || bill.error))

  const lots1 = (await api(page, 'products.getLots', pid)).value || []
  const early = lots1.find(l => l.lot_number === 'LOT-EARLY')
  const late = lots1.find(l => l.lot_number === 'LOT-LATE')
  const q = l => Number(l?.qty_on_hand ?? -1)
  check('FEFO: LOT-EARLY (หมดอายุก่อน) ถูกตัดหมด = 0', q(early) === 0, 'got=' + q(early))
  // Sale path deliberately does NOT auto-close at 0 (pos.ts deductFefo comment) —
  // availability queries filter qty_on_hand > 0. Assert the functional outcome:
  // the depleted lot is invisible to POS availability.
  const posView = (await api(page, 'pos.getProductsByIds', [pid])).value || []
  const posLots = posView[0]?.lots || []
  check('FEFO: ล็อตที่หมด (0) หายจาก availability ของ POS', !posLots.some(l => l.lot_number === 'LOT-EARLY'), 'posLots=' + JSON.stringify(posLots.map(l => l.lot_number)))
  check('FEFO: LOT-LATE เหลือ 8', q(late) === 8, 'got=' + q(late))

  const sale = (await api(page, 'reports.getSaleByInvoice', bill.value.invoice_no)).value
  check('sale persisted + walk-in customer_id NOT NULL (C0000)', !!sale && sale.customer_id != null, 'customer_id=' + sale?.customer_id)
  const stats = (await api(page, 'pos.getDailyStats')).value
  check('daily stats: 1 bill / 120', Number(stats?.bills ?? stats?.daily_bills) === 1 && Number(stats?.total ?? stats?.daily_total) === 120, JSON.stringify(stats))

  // ── void → stock restored, lot reopened ──
  const vd = await api(page, 'reports.voidSale', sale.id, 'smoke-test')
  check('voidSale (owner) ok', vd.ok, vd.error)
  const lots2 = (await api(page, 'products.getLots', pid)).value || []
  const early2 = lots2.find(l => l.lot_number === 'LOT-EARLY')
  const late2 = lots2.find(l => l.lot_number === 'LOT-LATE')
  check('หลัง void: LOT-EARLY กลับมา 10 + reopen (is_closed=0)', q(early2) === 10 && Number(early2?.is_closed) === 0, `q=${q(early2)} closed=${early2?.is_closed}`)
  check('หลัง void: LOT-LATE กลับมา 10', q(late2) === 10, 'got=' + q(late2))
  const sale2 = (await api(page, 'reports.getSale', sale.id)).value
  check('sale status = voided', (sale2?.status || sale2?.sale?.status) === 'voided', JSON.stringify(sale2?.status || sale2?.sale?.status))
} catch (e) {
  console.error('FATAL', e); failed++
} finally {
  await app.close().catch(() => {})
  fsSync.rmSync(userDataDir, { recursive: true, force: true })
}
console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed ? 1 : 0)
