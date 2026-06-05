// Stage B of the Hygeia migration: read the JSON dumped by hygeia_export.py,
// transform per the audited mapping (docs/plans/Hygeia_Import.md), and load a
// FRESH test sqlite DB. Phase 0-6 (master data) + stock reconcile only; the
// huge sale/purchase tables (Phase 7-8) are a separate pass.
//
// Run:  node scripts/import-hygeia.mjs
//
// Real shop data stays OUTSIDE the repo: input from D:\Syntropic.Project\
// hygeia-export, output to D:\Syntropic.Project\hygeia-import-test.db.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const esbuild = require('esbuild')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXPORT_DIR = 'D:\\Syntropic.Project\\hygeia-export'
const OUT_DB = 'D:\\Syntropic.Project\\hygeia-import-test.db'

// ---- helpers -----------------------------------------------------------------
const load = (t) => JSON.parse(readFileSync(path.join(EXPORT_DIR, t + '.json'), 'utf8'))
const s = (v) => { if (v === null || v === undefined) return null; const x = String(v).trim(); return x === '' ? null : x }
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
const bool = (v) => (v === true || v === 'True' || v === '1' || v === 1) ? 1 : 0
const dOnly = (v) => { const x = s(v); return x ? x.slice(0, 10) : null }            // YYYY-MM-DD
const dFull = (v) => { const x = s(v); if (!x) return null; return x.replace('T', ' ').slice(0, 19) } // YYYY-MM-DD HH:MM:SS

// ---- Phase 0: fresh DB + schema ---------------------------------------------
function initDb() {
  if (existsSync(OUT_DB)) rmSync(OUT_DB, { force: true })
  rmSync(OUT_DB + '-wal', { force: true }); rmSync(OUT_DB + '-shm', { force: true })
  const db = new Database(OUT_DB)
  db.pragma('journal_mode = WAL')
  // foreign_keys stays OFF during bulk load — phase order respects FK and the
  // reconcile step explicitly checks for orphans afterward.
  return db
}

async function runSchema(db) {
  const tsSrc = readFileSync(path.join(repoRoot, 'electron', 'db', 'schema.ts'), 'utf8')
  const { code } = esbuild.transformSync(tsSrc, { loader: 'ts', format: 'esm', target: 'node18' })
  const tmp = path.join(os.tmpdir(), `hygeia-schema-${process.pid}.mjs`)
  writeFileSync(tmp, code)
  const mod = await import(pathToFileURL(tmp).href)
  mod.initializeSchema(db)
  rmSync(tmp, { force: true })
}

// item_units upsert cache (UNIQUE(name); base unit lives on products.unit_id)
function makeUnitResolver(db) {
  const ins = db.prepare(`INSERT OR IGNORE INTO item_units (name) VALUES (?)`)
  const sel = db.prepare(`SELECT id FROM item_units WHERE name = ?`)
  const cache = new Map()
  return (name) => {
    const nm = s(name)
    if (!nm) return null
    if (cache.has(nm)) return cache.get(nm)
    ins.run(nm)
    const id = sel.get(nm).id
    cache.set(nm, id)
    return id
  }
}

const log = (...a) => console.log(...a)

async function main() {
  const t0 = Date.now()
  const db = initDb()
  await runSchema(db)
  log('Phase 0: fresh DB + schema OK')

  // NO-VAT shop (checklist C6): make the test DB consistent with the data.
  const sset = db.prepare(`SELECT id FROM sales_settings LIMIT 1`).get()
  if (sset) db.prepare(`UPDATE sales_settings SET vat_enabled = 0, vat_rate = 0 WHERE id = ?`).run(sset.id)
  else db.prepare(`INSERT INTO sales_settings (vat_enabled, vat_rate) VALUES (0, 0)`).run()

  const unit = makeUnitResolver(db)
  const report = []

  // ---- Phase 1: ItemType -> product_categories ------------------------------
  const itemTypeToCat = new Map()
  {
    const rows = load('ItemType')
    const insCat = db.prepare(`INSERT INTO product_categories (code, name, description, sort_order, is_disabled) VALUES (?, ?, ?, ?, ?)`)
    db.transaction(() => {
      let i = 0
      for (const r of rows) {
        const code = `CAT-${String(++i).padStart(4, '0')}`
        const desc = `hygeia:ItemTypeKey=${r.ItemTypeKey} code=${s(r.Code) ?? ''}`
        const info = insCat.run(code, s(r.Name) ?? '(ไม่ระบุ)', desc, i, bool(r.IsDisabled))
        itemTypeToCat.set(String(r.ItemTypeKey), Number(info.lastInsertRowid))
      }
    })()
    report.push(`Phase 1 categories: ${rows.length}`)
  }

  // ---- Phase 2: Item -> products (+ base unit upsert) -----------------------
  const itemToProduct = new Map()
  const itemBaseUnitName = new Map()  // ItemKey -> base unit name (for Phase 3 skip)
  {
    const rows = load('Item')
    const insProd = db.prepare(`
      INSERT INTO products (
        barcode, barcode2, barcode3, barcode4, code, trade_name, name_for_print,
        category_id, is_stock_item, is_bundle, is_disabled, is_hidden,
        price_retail, price_wholesale1, price_wholesale2, cost_price, last_cost_price,
        unit_id, is_drug, reorder_point, tmt_id, search_keywords, note
      ) VALUES (
        @barcode, @barcode2, @barcode3, @barcode4, @code, @trade_name, @name_for_print,
        @category_id, @is_stock_item, 0, @is_disabled, @is_hidden,
        @price_retail, @price_wholesale1, @price_wholesale2, @cost_price, @last_cost_price,
        @unit_id, 0, @reorder_point, @tmt_id, @search_keywords, @note
      )`)
    db.transaction(() => {
      for (const r of rows) {
        const baseUnitName = s(r.SaleUnitName)
        const unitId = unit(baseUnitName)
        itemBaseUnitName.set(String(r.ItemKey), baseUnitName)
        const rp = num(r.ReorderPoint)
        const info = insProd.run({
          barcode: s(r.BarCode), barcode2: s(r.BarCode2), barcode3: s(r.BarCode3), barcode4: s(r.BarCode4),
          code: s(r.Code), trade_name: s(r.Name) ?? '(ไม่ระบุชื่อ)', name_for_print: s(r.NameForPrint),
          category_id: itemTypeToCat.get(String(r.ItemTypeKey)) ?? null,
          is_stock_item: bool(r.IsStockItem), is_disabled: bool(r.IsDisabled), is_hidden: bool(r.IsHidden),
          price_retail: num(r.SalePrice), price_wholesale1: num(r.Wholesale1), price_wholesale2: num(r.Wholesale2),
          cost_price: num(r.MovAvgPrice), last_cost_price: num(r.UnitPrice),
          unit_id: unitId, reorder_point: rp > 0 ? rp : null, tmt_id: s(r.TMTID),
          search_keywords: s(r.OtherName), note: s(r.Note),
        })
        itemToProduct.set(String(r.ItemKey), Number(info.lastInsertRowid))
      }
    })()
    report.push(`Phase 2 products: ${rows.length}`)
  }

  // ---- Phase 3: ItemUnit -> product_units (non-base variants) ----------------
  {
    const rows = load('ItemUnit')
    const insPU = db.prepare(`
      INSERT INTO product_units (product_id, unit_id, barcode, qty_per_base,
        price_retail, price_wholesale1, price_wholesale2, is_for_sale, is_for_purchase, is_disabled)
      VALUES (@product_id, @unit_id, @barcode, @qty_per_base,
        @price_retail, @price_wholesale1, @price_wholesale2, 1, @is_for_purchase, @is_disabled)`)
    let skipped = 0, baseSkip = 0
    db.transaction(() => {
      for (const r of rows) {
        const pid = itemToProduct.get(String(r.ItemKey))
        if (!pid) { skipped++; continue }
        const nm = s(r.Name)
        // base unit already lives on products.unit_id — never duplicate it here
        if (nm && nm === itemBaseUnitName.get(String(r.ItemKey)) && num(r.Multiply) === 1) { baseSkip++; continue }
        insPU.run({
          product_id: pid, unit_id: unit(nm), barcode: s(r.BarCode),
          qty_per_base: num(r.Multiply) || 1,
          price_retail: num(r.SalePrice), price_wholesale1: num(r.Wholesale1), price_wholesale2: num(r.Wholesale2),
          is_for_purchase: bool(r.IsForPR), is_disabled: bool(r.IsDisabled),
        })
      }
    })()
    report.push(`Phase 3 product_units: ${rows.length - skipped - baseSkip} (skip no-product ${skipped}, base-dup ${baseSkip})`)
  }

  // ---- Phase 4: ItemSet -> products(is_bundle=1) ; ItemSetItem -> recipe -----
  const itemSetToProduct = new Map()
  {
    const sets = load('ItemSet')
    const insBundle = db.prepare(`
      INSERT INTO products (code, trade_name, category_id, is_bundle, is_stock_item, is_disabled, is_hidden, price_retail, note)
      VALUES (@code, @trade_name, NULL, 1, 0, @is_disabled, @is_hidden, @price_retail, @note)`)
    db.transaction(() => {
      for (const r of sets) {
        const info = insBundle.run({
          code: s(r.Code), trade_name: s(r.Name) ?? '(ชุดไม่ระบุชื่อ)',
          is_disabled: bool(r.IsDisabled), is_hidden: bool(r.IsHidden),
          price_retail: num(r.TotalSalePrice), note: `hygeia:ItemSetKey=${r.ItemSetKey}`,
        })
        itemSetToProduct.set(String(r.ItemSetKey), Number(info.lastInsertRowid))
      }
    })()
    const items = load('ItemSetItem')
    const insItem = db.prepare(`
      INSERT INTO product_bundle_items (bundle_id, component_product_id, qty_per_bundle, sort_order)
      VALUES (@bundle_id, @component_product_id, @qty_per_bundle, @sort_order)
      ON CONFLICT(bundle_id, component_product_id) DO UPDATE SET qty_per_bundle = qty_per_bundle + excluded.qty_per_bundle`)
    let skipped = 0, n = 0
    db.transaction(() => {
      let i = 0
      for (const r of items) {
        const bid = itemSetToProduct.get(String(r.ItemSetKey))
        const cid = itemToProduct.get(String(r.ItemKey))
        if (!bid || !cid) { skipped++; continue }
        insItem.run({
          bundle_id: bid, component_product_id: cid,
          qty_per_bundle: (num(r.SaleUnitQty) || 1) * (num(r.Multiply) || 1),  // E8: base qty
          sort_order: ++i,
        })
        n++
      }
    })()
    report.push(`Phase 4 bundles: ${sets.length}, recipe lines: ${n} (skip ${skipped})`)
  }

  // ---- Phase 5: Lot -> product_lots (DEDUP merge, E1) ------------------------
  const lotKeyToLotId = new Map()
  {
    const rows = load('Lot')
    // group by (productId, lot_number); accumulate qty + weighted cost + nearest expiry
    const groups = new Map()
    let noProduct = 0
    for (const r of rows) {
      const pid = itemToProduct.get(String(r.ItemKey))
      if (!pid) { noProduct++; continue }
      const lotNo = s(r.Name) ?? 'ไม่ระบุล็อต'
      const key = pid + '' + lotNo
      let g = groups.get(key)
      if (!g) { g = { pid, lotNo, qty: 0, costQty: 0, exp: null, mfd: null, keys: [] }; groups.set(key, g) }
      const q = num(r.BaseQty)
      const c = num(r.UnitAmt)
      g.qty += q
      g.costQty += q * c
      const exp = dOnly(r.ExpDate); if (exp && (!g.exp || exp < g.exp)) g.exp = exp   // nearest expiry
      const mfd = dOnly(r.EfdDate); if (mfd && (!g.mfd || mfd < g.mfd)) g.mfd = mfd
      g.keys.push(String(r.LotKey))
      if (g.qty === 0 && c > 0) g.fallbackCost = c  // remember a cost even if qty nets 0
    }
    const insLot = db.prepare(`
      INSERT INTO product_lots (product_id, lot_number, manufactured_date, expiry_date,
        cost_price, qty_received, qty_on_hand, qty_reserved, is_closed)
      VALUES (@product_id, @lot_number, @mfd, @exp, @cost, @qty, @qty, 0, @is_closed)`)
    db.transaction(() => {
      for (const g of groups.values()) {
        const cost = g.qty !== 0 ? g.costQty / g.qty : (g.fallbackCost ?? 0)
        const info = insLot.run({
          product_id: g.pid, lot_number: g.lotNo, mfd: g.mfd, exp: g.exp,
          cost: cost, qty: g.qty, is_closed: g.qty > 0 ? 0 : 1,  // P2-A5: compute from merged qty
        })
        const lotId = Number(info.lastInsertRowid)
        for (const k of g.keys) lotKeyToLotId.set(k, lotId)  // many LotKey -> 1 lot id
      }
    })()
    report.push(`Phase 5 lots: ${rows.length} raw -> ${groups.size} merged (skip no-product ${noProduct}, LotKey mapped ${lotKeyToLotId.size})`)
  }

  // ---- Phase 6: Customer+Person -> customers ; LegalEntity(IsVendor) -> suppliers
  const customerKeyToId = new Map()
  const legalEntityToSupplier = new Map()
  {
    const persons = new Map(load('Person').map((p) => [String(p.PersonKey), p]))
    const custs = load('Customer')
    const insCust = db.prepare(`
      INSERT INTO customers (code, full_name, id_card, dob, phone, address, chronic_diseases, is_alert, alert_note, is_disabled)
      VALUES (@code, @full_name, @id_card, @dob, @phone, @address, @chronic_diseases, @is_alert, @alert_note, @is_disabled)`)
    const seenCode = new Set()
    let i = 0
    db.transaction(() => {
      for (const c of custs) {
        const p = persons.get(String(c.CustomerKey)) ?? {}
        const isWalkIn = String(c.CustomerKey) === '-10'
        let code = isWalkIn ? 'C0000' : ('C' + (s(c.Code) ?? String(++i).padStart(4, '0')))
        while (seenCode.has(code)) code = 'C' + String(++i).padStart(4, '0')  // guarantee unique
        seenCode.add(code)
        const addr = [s(p.Address), s(p.Address2)].filter(Boolean).join(' ')
        const info = insCust.run({
          code, full_name: s(p.FullName) ?? (isWalkIn ? 'ลูกค้าทั่วไป' : '(ไม่ระบุชื่อ)'),
          id_card: s(p.Cid), dob: dOnly(p.BirthDate), phone: s(p.MobilePhone) ?? s(p.Phone),
          address: addr || null, chronic_diseases: s(c.CHCDetail),
          is_alert: bool(c.IsAlertNote), alert_note: s(c.AlertNote), is_disabled: bool(c.IsCanceled),
        })
        customerKeyToId.set(String(c.CustomerKey), Number(info.lastInsertRowid))
      }
    })()

    const legals = load('LegalEntity')
    const insSup = db.prepare(`
      INSERT INTO suppliers (code, name, tax_id, phone, address, is_disabled)
      VALUES (@code, @name, @tax_id, @phone, @address, @is_disabled)`)
    const supCode = new Set()
    let j = 0, vendors = 0
    db.transaction(() => {
      for (const e of legals) {
        if (!bool(e.IsVendor)) continue
        vendors++
        let code = s(e.Code) ?? ('S' + String(++j).padStart(4, '0'))
        while (supCode.has(code)) code = 'S' + String(++j).padStart(4, '0')
        supCode.add(code)
        const addr = [s(e.Address), s(e.Address2)].filter(Boolean).join(' ')
        const info = insSup.run({
          code, name: s(e.Name) ?? '(ไม่ระบุ)', tax_id: s(e.TaxID),
          phone: s(e.Phone1) ?? s(e.MobilePhone1), address: addr || null, is_disabled: bool(e.IsDisabled),
        })
        legalEntityToSupplier.set(String(e.LegalEntityKey), Number(info.lastInsertRowid))
      }
    })()
    report.push(`Phase 6 customers: ${custs.length}, suppliers: ${vendors}`)
  }

  // ---- Reconcile: StockCurrentBalance.Qty vs Σ product_lots.qty_on_hand ------
  {
    const scb = load('StockCurrentBalance')
    const lotSum = db.prepare(`SELECT product_id, SUM(qty_on_hand) AS q FROM product_lots GROUP BY product_id`)
    const sumByProduct = new Map()
    for (const r of lotSum.all()) sumByProduct.set(r.product_id, r.q)
    let mismatch = 0, checked = 0
    const samples = []
    for (const r of scb) {
      const pid = itemToProduct.get(String(r.ItemKey))
      if (!pid) continue
      checked++
      const expected = num(r.Qty)
      const got = sumByProduct.get(pid) ?? 0
      if (Math.abs(expected - got) > 0.001) {
        mismatch++
        if (samples.length < 10) samples.push({ ItemKey: r.ItemKey, pid, expected, got })
      }
    }
    report.push(`Reconcile stock: checked ${checked}, mismatch ${mismatch}`)
    if (samples.length) report.push('  sample mismatches: ' + JSON.stringify(samples))

    // orphan check: every mapped LotKey resolves; every bundle recipe component exists
    const orphanLots = db.prepare(`SELECT COUNT(*) c FROM product_lots WHERE product_id NOT IN (SELECT id FROM products)`).get().c
    const orphanRecipe = db.prepare(`SELECT COUNT(*) c FROM product_bundle_items WHERE component_product_id NOT IN (SELECT id FROM products)`).get().c
    report.push(`Orphan check: lots ${orphanLots}, recipe ${orphanRecipe}`)
  }

  db.close()
  report.push(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT_DB}`)
  const out = report.join('\n')
  log('\n' + out)
  writeFileSync(path.join(repoRoot, 'scripts', 'import-report.txt'), out)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
