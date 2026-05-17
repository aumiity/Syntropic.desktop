import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'

// Dev-only handlers. Trigger from DevTools console:
//   await window.api.dev.seedTestStock()
// Marker prefixes ('TEST-', 'GR-TEST-', 'LOT-TEST-') let us wipe + re-seed
// without touching real data.
export function registerDevHandlers() {
  ipcMain.handle('dev:seedTestStock', () => {
    const db = getDb()

    const NAME_TEMPLATES = [
      'Paracetamol 500mg', 'Ibuprofen 400mg', 'Amoxicillin 500mg',
      'Loratadine 10mg', 'Omeprazole 20mg', 'Metformin 500mg',
      'Amlodipine 5mg', 'Simvastatin 20mg', 'Diphenhydramine 25mg',
      'Hydroxyzine 10mg', 'Vitamin C 1000mg', 'Vitamin D 1000IU',
      'Calcium 600mg', 'Aspirin 81mg', 'Cetirizine 10mg',
      'Diclofenac Gel 1%', 'Ranitidine 150mg', 'Salbutamol Inhaler',
      'Prednisolone 5mg', 'Atorvastatin 20mg',
    ]

    const rand = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min
    const pick = <T,>(arr: T[]): T => arr[rand(0, arr.length - 1)]

    // ---- Phase 0: Pre-flight checks ----
    const cats = db.prepare(`SELECT id FROM product_categories WHERE is_disabled = 0`)
      .all().map((r: any) => r.id) as number[]
    const drugTypes = db.prepare(`SELECT id FROM drug_types WHERE is_disabled = 0`)
      .all().map((r: any) => r.id) as number[]
    const units = db.prepare(`SELECT id, name FROM item_units`)
      .all() as Array<{ id: number; name: string }>
    const suppliers = db.prepare(`SELECT id FROM suppliers WHERE is_disabled = 0`)
      .all().map((r: any) => r.id) as number[]

    if (cats.length === 0) throw new Error('ไม่มี product_categories — รัน seed หลักก่อน')
    if (units.length === 0) throw new Error('ไม่มี item_units — รัน seed หลักก่อน')
    if (suppliers.length === 0) throw new Error('ไม่มี suppliers — รัน seed หลักก่อน')

    // ---- Phase 1: Wipe existing TEST-* data ----
    // Block if any sale references a TEST lot — would orphan FEFO trace.
    const usedTestLots = (db.prepare(`
      SELECT COUNT(*) as c FROM sale_item_lots sil
      JOIN product_lots pl ON pl.id = sil.lot_id
      WHERE pl.lot_number GLOB 'LOT-TEST-*'
    `).get() as any).c
    if (usedTestLots > 0) {
      throw new Error(`พบ ${usedTestLots} sale_item_lots อ้างถึง lot ทดสอบ — ลบข้อมูลขายก่อน หรือ void invoices ที่เกี่ยวข้อง`)
    }

    const wipe = db.transaction(() => {
      const testProductIds = db.prepare(`SELECT id FROM products WHERE code GLOB 'TEST-*'`)
        .all().map((r: any) => r.id) as number[]

      if (testProductIds.length === 0) return 0

      const ph = testProductIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM stock_movements WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM lot_cost_logs WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM price_logs WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM purchase_receipt_items WHERE invoice_no GLOB 'GR-TEST-*'`).run()
      db.prepare(`DELETE FROM product_lots WHERE lot_number GLOB 'LOT-TEST-*'`).run()
      db.prepare(`DELETE FROM purchase_receipts WHERE invoice_no GLOB 'GR-TEST-*'`).run()
      db.prepare(`DELETE FROM product_units WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM product_labels WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM products WHERE code GLOB 'TEST-*'`).run()
      return testProductIds.length
    })
    const wipedCount = wipe()

    // ---- Phase 2: Generate 1000 products ----
    const insProduct = db.prepare(`
      INSERT INTO products (
        barcode, code, trade_name, name_for_print,
        category_id, drug_type_id, is_stock_item,
        price_retail, price_wholesale1, price_wholesale2, cost_price,
        unit_id,
        has_vat, reorder_point, safety_stock,
        is_antibiotic, is_fda9, is_fda10, is_fda11, is_fda13,
        search_keywords, note
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insReceipt = db.prepare(`
      INSERT INTO purchase_receipts
        (invoice_no, supplier_id, supplier_invoice_no, order_date,
         payment_type, due_date, is_paid, paid_date, note,
         discount_amount, surcharge_amount, status, created_at)
      VALUES (?, ?, ?, ?, 'cash', NULL, 1, ?, '', 0, 0, 'completed', ?)
    `)
    const insReceiptItem = db.prepare(`
      INSERT INTO purchase_receipt_items
        (invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date,
         cost_price, sell_price, qty, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
    `)
    const insLot = db.prepare(`
      INSERT INTO product_lots
        (product_id, supplier_id, lot_number, manufactured_date, expiry_date,
         cost_price, sell_price, qty_received, qty_on_hand, qty_reserved,
         invoice_no, supplier_invoice_no, order_date,
         payment_type, is_paid, paid_date, is_closed, is_cancelled, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'cash', 1, ?, 0, 0, '', ?)
    `)
    const insMove = db.prepare(`
      INSERT INTO stock_movements
        (product_id, lot_id, movement_type, ref_type, ref_id,
         qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)
      VALUES (?, ?, 'receive', 'purchase_receipt', NULL, ?, 0, ?, ?, '', NULL, ?)
    `)

    const today = dayjs()

    const generate = db.transaction(() => {
      // 2a. Products + base units
      const productIds: number[] = []
      const productCosts: number[] = []
      const productPrices: number[] = []

      for (let i = 1; i <= 1000; i++) {
        const seq = String(i).padStart(4, '0')
        const template = pick(NAME_TEMPLATES)
        const trade_name = `[ทดสอบ] ${template} #${seq}`
        const code = `TEST-${seq}`
        const barcode = `999${String(i).padStart(10, '0')}`

        const cost = rand(5, 200)
        const markup = 1.3 + Math.random() * 1.2
        const retail = Math.round(cost * markup)
        const ws1 = Math.round(cost * (1.1 + Math.random() * 0.3))

        const result = insProduct.run(
          barcode, code, trade_name, template,
          pick(cats), pick(drugTypes),
          retail, ws1, 0, cost,
          pick(units).id, // unit_id (base unit, lives directly on products)
          0, // has_vat
          rand(10, 100), // reorder_point
          rand(5, 50),   // safety_stock
          Math.random() < 0.15 ? 1 : 0, // is_antibiotic ~15%
          0, 0, 0, 0, // is_fda9/10/11/13 (all off for test data)
          template.split(' ')[0].toLowerCase(),
          'auto-generated test data',
        )
        const productId = result.lastInsertRowid as number
        productIds.push(productId)
        productCosts.push(cost)
        productPrices.push(retail)
      }

      // 2b. 10 GRs × 100 line items each
      for (let g = 1; g <= 10; g++) {
        const grNo = `GR-TEST-${String(g).padStart(3, '0')}`
        const receiveDate = today.subtract(10 - g, 'day').format('YYYY-MM-DD')
        const supplierId = pick(suppliers)

        insReceipt.run(grNo, supplierId, `INV-MOCK-${grNo}`, receiveDate, receiveDate, receiveDate)

        for (let j = 0; j < 100; j++) {
          const idx = (g - 1) * 100 + j
          const productId = productIds[idx]
          const cost = productCosts[idx]
          const retail = productPrices[idx]

          // Expiry distribution:
          // - 10% near-expiry (30-89 days)  → triggers expiry-warning UI
          // - 90% normal (180 days - 3 years)
          const daysAhead = idx % 10 === 0 ? rand(30, 89) : rand(180, 1095)
          const expiry = today.add(daysAhead, 'day').format('YYYY-MM-DD')
          const manufactured = today.subtract(rand(30, 360), 'day').format('YYYY-MM-DD')

          // Stock distribution:
          // - 5% out of stock (qty_on_hand = 0) → triggers "หมดสต็อก" badge
          // - 95% in stock (50-500 units)
          const qtyReceived = rand(50, 500)
          const qtyOnHand = idx % 20 === 0 ? 0 : qtyReceived

          const lotNo = `LOT-TEST-${String(idx + 1).padStart(4, '0')}`

          const lotResult = insLot.run(
            productId, supplierId, lotNo, manufactured, expiry,
            cost, retail, qtyReceived, qtyOnHand,
            grNo, `INV-MOCK-${grNo}`, receiveDate,
            receiveDate, // paid_date
            receiveDate, // created_at
          )
          const lotId = lotResult.lastInsertRowid as number

          insReceiptItem.run(
            grNo, productId, lotId, lotNo, manufactured, expiry,
            cost, retail, qtyReceived, receiveDate,
          )

          insMove.run(productId, lotId, qtyReceived, qtyReceived, cost, receiveDate)
        }
      }
    })

    generate()

    return {
      wiped: wipedCount,
      products: 1000,
      grs: 10,
      lots: 1000,
      message: `เสร็จแล้ว — ลบของเก่า ${wipedCount} ชิ้น, สร้างใหม่ 1000 ชนิด, 10 GR (100/บิล)`,
    }
  })

  // dev:seedSalesHistory
  // -------------------
  // Backdates ~500 GRs + ~3000 sales across the last 90 days using REAL seeded
  // products / suppliers / customers (not TEST-* synthetic stock). FEFO is
  // enforced day-by-day so movements/lots/sale_item_lots are internally
  // consistent — same shape as a user clicking through POS + GR 3000+ times.
  //
  // Idempotent via the '[DEV-SEED]' marker on purchase_receipts.note,
  // product_lots.note, and sales.note. Re-running wipes prior seed and
  // regenerates. Refuses to wipe if any non-dev sale references a dev lot.
  ipcMain.handle('dev:seedSalesHistory', () => {
    const db = getDb()

    const rand = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min
    const randF = (min: number, max: number) => Math.random() * (max - min) + min
    const pick = <T,>(arr: T[]): T => arr[rand(0, arr.length - 1)]
    const weighted = <T,>(opts: Array<[T, number]>): T => {
      const total = opts.reduce((s, [, w]) => s + w, 0)
      let r = Math.random() * total
      for (const [v, w] of opts) {
        r -= w
        if (r <= 0) return v
      }
      return opts[opts.length - 1][0]
    }

    // ---- Pre-flight ----
    const products = db.prepare(`
      SELECT p.id, p.trade_name, p.name_for_print, p.cost_price, p.price_retail, p.unit_id,
             u.name AS unit_name
      FROM products p
      LEFT JOIN item_units u ON u.id = p.unit_id
      WHERE p.is_disabled = 0 AND p.is_stock_item = 1 AND p.price_retail > 0
    `).all() as Array<{
      id: number; trade_name: string; name_for_print: string | null
      cost_price: number; price_retail: number; unit_id: number | null; unit_name: string | null
    }>
    if (products.length === 0) throw new Error('ไม่มีสินค้าที่ขายได้ — รัน seed หลักก่อน')

    const suppliers = (db.prepare(`SELECT id FROM suppliers WHERE is_disabled = 0`).all() as any[])
      .map(r => r.id) as number[]
    if (suppliers.length === 0) throw new Error('ไม่มี suppliers')

    const allCustomers = db.prepare(`SELECT id, code FROM customers WHERE is_disabled = 0`)
      .all() as Array<{ id: number; code: string }>
    const walkIn = allCustomers.find(c => c.code === 'C0000')
    if (!walkIn) throw new Error('ไม่มีลูกค้าทั่วไป (C0000)')
    const namedCustomers = allCustomers.filter(c => c.code !== 'C0000').map(c => c.id)

    const users = (db.prepare(`SELECT id FROM users WHERE is_disabled = 0`).all() as any[])
      .map(r => r.id) as number[]
    if (users.length === 0) throw new Error('ไม่มี users')

    // ---- Safety: any non-dev sale referencing a dev lot? ----
    const conflict = (db.prepare(`
      SELECT COUNT(*) c FROM sale_item_lots sil
      JOIN product_lots pl ON pl.id = sil.lot_id
      JOIN sale_items si ON si.id = sil.sale_item_id
      JOIN sales s ON s.id = si.sale_id
      WHERE pl.note = '[DEV-SEED]'
        AND (s.note IS NULL OR s.note != '[DEV-SEED]')
    `).get() as { c: number }).c
    if (conflict > 0) {
      throw new Error(
        `พบ ${conflict} sale_item_lots ของจริงอ้างถึง lot dev-seed — void/ลบบิลพวกนั้นก่อน`,
      )
    }

    // ---- Phase 1: Wipe previous dev seed ----
    const wiped = db.transaction(() => {
      const oldSaleIds = (db.prepare(`SELECT id FROM sales WHERE note = '[DEV-SEED]'`)
        .all() as any[]).map(r => r.id) as number[]
      const oldGRs = (db.prepare(`SELECT invoice_no FROM purchase_receipts WHERE note = '[DEV-SEED]'`)
        .all() as any[]).map(r => r.invoice_no) as string[]
      const oldLotIds = (db.prepare(`SELECT id FROM product_lots WHERE note = '[DEV-SEED]'`)
        .all() as any[]).map(r => r.id) as number[]

      const wipeIn = (sql: string, ids: (number | string)[]) => {
        if (ids.length === 0) return
        const ph = ids.map(() => '?').join(',')
        db.prepare(sql.replace('IN_PLACEHOLDER', ph)).run(...ids)
      }
      wipeIn(`DELETE FROM stock_movements WHERE lot_id IN (IN_PLACEHOLDER)`, oldLotIds)
      wipeIn(`DELETE FROM sales WHERE id IN (IN_PLACEHOLDER)`, oldSaleIds)
      wipeIn(`DELETE FROM purchase_receipt_items WHERE invoice_no IN (IN_PLACEHOLDER)`, oldGRs)
      wipeIn(`DELETE FROM purchase_receipts WHERE invoice_no IN (IN_PLACEHOLDER)`, oldGRs)
      wipeIn(`DELETE FROM product_lots WHERE id IN (IN_PLACEHOLDER)`, oldLotIds)

      return { sales: oldSaleIds.length, grs: oldGRs.length, lots: oldLotIds.length }
    })()

    // ---- Phase 2: Generate 90 days ----
    const today = dayjs()
    const DAYS = 90

    // Sellable subset (~200 active SKUs) — concentrates volume, mimics real shop
    const inventory = [...products].sort(() => Math.random() - 0.5)
      .slice(0, Math.min(200, products.length))

    const grSeqByDate = new Map<string, number>()
    const saleSeqByDate = new Map<string, number>()

    const insReceipt = db.prepare(`
      INSERT INTO purchase_receipts
        (invoice_no, supplier_id, supplier_invoice_no, order_date,
         payment_type, due_date, is_paid, paid_date, note,
         discount_amount, surcharge_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[DEV-SEED]', 0, 0, 'completed', ?)
    `)
    const insReceiptItem = db.prepare(`
      INSERT INTO purchase_receipt_items
        (invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date,
         cost_price, sell_price, qty, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `)
    const insLot = db.prepare(`
      INSERT INTO product_lots
        (product_id, supplier_id, lot_number, manufactured_date, expiry_date,
         cost_price, sell_price, qty_received, qty_on_hand,
         invoice_no, supplier_invoice_no, order_date,
         payment_type, due_date, is_paid, paid_date,
         note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[DEV-SEED]', ?, ?)
    `)
    const insMove = db.prepare(`
      INSERT INTO stock_movements
        (product_id, lot_id, movement_type, ref_type, ref_id,
         qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insSale = db.prepare(`
      INSERT INTO sales
        (invoice_no, sale_type, customer_id, sold_by, sold_at,
         subtotal, total_discount, total_amount,
         cash_amount, card_amount, transfer_amount, change_amount,
         note, status, created_at)
      VALUES (?, 'retail', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[DEV-SEED]', 'completed', ?)
    `)
    const insSaleItem = db.prepare(`
      INSERT INTO sale_items
        (sale_id, product_id, item_name, unit_name, qty, unit_price, discount, line_total, item_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `)
    const insSaleItemLot = db.prepare(
      `INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty) VALUES (?, ?, ?, ?)`,
    )
    const selLotsFEFO = db.prepare(`
      SELECT id, qty_on_hand, cost_price FROM product_lots
      WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0 AND is_cancelled = 0
      ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC, id ASC
    `)
    const updLotAfterSale = db.prepare(`
      UPDATE product_lots
      SET qty_on_hand = ?,
          is_closed = CASE WHEN ? <= 0 THEN 1 ELSE is_closed END,
          closed_at = CASE WHEN ? <= 0 AND closed_at IS NULL THEN ? ELSE closed_at END
      WHERE id = ?
    `)

    const result = db.transaction(() => {
      let grCount = 0, lotCount = 0, saleCount = 0, saleItemCount = 0

      for (let d = DAYS; d >= 0; d--) {
        const day = today.subtract(d, 'day')
        const dateStr = day.format('YYYY-MM-DD')
        const yymmdd = day.format('YYYYMMDD')

        // ---- GRs (3-8/day) ----
        const grPerDay = rand(3, 8)
        for (let g = 0; g < grPerDay; g++) {
          const seq = (grSeqByDate.get(yymmdd) ?? 0) + 1
          grSeqByDate.set(yymmdd, seq)
          const grNo = `GR-${yymmdd}-${String(seq).padStart(4, '0')}`

          const supplierId = pick(suppliers)
          const hour = rand(8, 17)
          const min = rand(0, 59)
          const dtStr = `${dateStr} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`

          const isPaid = Math.random() < 0.6 ? 1 : 0
          const paymentType = isPaid ? 'cash' : 'credit'
          const dueDate = !isPaid ? day.add(30, 'day').format('YYYY-MM-DD') : null

          insReceipt.run(grNo, supplierId, `INV-MOCK-${grNo}`, dateStr,
            paymentType, dueDate, isPaid, isPaid ? dateStr : null, dtStr)

          const lineCount = weighted<number>([
            [rand(5, 15), 60], [rand(16, 30), 30], [rand(31, 50), 10],
          ])
          const lineProducts = [...inventory].sort(() => Math.random() - 0.5).slice(0, lineCount)

          for (const product of lineProducts) {
            const cost = Math.max(0.5, +(product.cost_price * randF(0.85, 1.15)).toFixed(2))
            const sellPrice = product.price_retail
            const qty = rand(50, 500)
            const expiry = day.add(rand(6, 24) * 30, 'day').format('YYYY-MM-DD')
            const mfg = day.subtract(rand(30, 360), 'day').format('YYYY-MM-DD')
            // (product, lot_number) is UNIQUE — include GR seq to avoid collisions
            // when same product receives twice on same day from same supplier
            const lotNo = `DEV-${yymmdd}-${supplierId}-${seq}-${product.id}`

            const lotRes = insLot.run(
              product.id, supplierId, lotNo, mfg, expiry,
              cost, sellPrice, qty, qty,
              grNo, `INV-MOCK-${grNo}`, dateStr,
              paymentType, dueDate, isPaid, isPaid ? dateStr : null,
              dtStr, dtStr,
            )
            const lotId = Number(lotRes.lastInsertRowid)
            lotCount++

            insReceiptItem.run(grNo, product.id, lotId, lotNo, mfg, expiry,
              cost, sellPrice, qty, dtStr)
            insMove.run(product.id, lotId, 'receive', 'stock_receive', null,
              qty, 0, qty, cost, `รับสินค้า: ${grNo} [DEV-SEED]`, users[0], dtStr)
          }
          grCount++
        }

        // ---- Sales (20-50/day) ----
        const salesPerDay = rand(20, 50)
        for (let s = 0; s < salesPerDay; s++) {
          const seq = (saleSeqByDate.get(yymmdd) ?? 0) + 1
          saleSeqByDate.set(yymmdd, seq)
          const rcNo = `RC-${yymmdd}-${String(seq).padStart(4, '0')}`

          const hour = weighted<number>([
            [rand(9, 11), 25], [rand(12, 15), 40], [rand(16, 19), 30], [rand(20, 21), 5],
          ])
          const min = rand(0, 59)
          const dtStr = `${dateStr} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`

          const customerId = Math.random() < 0.7
            ? walkIn.id
            : (namedCustomers.length ? pick(namedCustomers) : walkIn.id)
          const userId = pick(users)

          const itemCount = weighted<number>([
            [1, 30], [2, 30], [3, 20], [rand(4, 6), 15], [rand(7, 10), 5],
          ])

          // Pick `itemCount` distinct products that currently have stock
          const shuffled = [...inventory].sort(() => Math.random() - 0.5)
          const items: Array<{
            product: typeof inventory[0]
            qty: number
            lots: Array<{ id: number; qty: number; cost: number; qtyBefore: number }>
          }> = []

          for (const product of shuffled) {
            if (items.length >= itemCount) break
            const lots = selLotsFEFO.all(product.id) as Array<{
              id: number; qty_on_hand: number; cost_price: number
            }>
            if (lots.length === 0) continue
            const avail = lots.reduce((s, l) => s + l.qty_on_hand, 0)
            if (avail < 1) continue

            const desired = weighted<number>([
              [1, 30], [2, 30], [3, 15], [rand(4, 5), 15], [rand(6, 10), 8], [rand(10, 25), 2],
            ])
            const qty = Math.min(desired, Math.floor(avail))
            if (qty < 1) continue

            // Plan FEFO deduction
            const used: typeof items[0]['lots'] = []
            let remaining = qty
            for (const lot of lots) {
              if (remaining <= 0) break
              const deduct = Math.min(lot.qty_on_hand, remaining)
              used.push({
                id: lot.id, qty: deduct, cost: lot.cost_price, qtyBefore: lot.qty_on_hand,
              })
              remaining -= deduct
            }
            items.push({ product, qty, lots: used })

            // Apply deduction to lots immediately so the next item's FEFO query
            // sees the right state (prevents over-selling across items in the
            // same sale even though items are distinct products)
            for (const u of used) {
              const after = u.qtyBefore - u.qty
              updLotAfterSale.run(after, after, after, dtStr, u.id)
            }
          }
          if (items.length === 0) continue

          let subtotal = 0
          for (const it of items) subtotal += it.qty * it.product.price_retail
          const discountPct = Math.random() < 0.15 ? randF(0.05, 0.15) : 0
          const totalDiscount = +(subtotal * discountPct).toFixed(2)
          const totalAmount = +(subtotal - totalDiscount).toFixed(2)

          let cashAmount = 0, transferAmount = 0, cardAmount = 0, changeAmount = 0
          const pay = Math.random()
          if (pay < 0.7) {
            const paid = Math.ceil(totalAmount / 10) * 10
            cashAmount = paid
            changeAmount = +(paid - totalAmount).toFixed(2)
          } else if (pay < 0.85) {
            transferAmount = totalAmount
          } else if (pay < 0.95) {
            const splitCash = Math.floor(totalAmount * 0.5)
            cashAmount = splitCash
            transferAmount = +(totalAmount - splitCash).toFixed(2)
          } else {
            cardAmount = totalAmount
          }

          const saleRes = insSale.run(
            rcNo, customerId, userId, dtStr,
            subtotal, totalDiscount, totalAmount,
            cashAmount, cardAmount, transferAmount, changeAmount, dtStr,
          )
          const saleId = Number(saleRes.lastInsertRowid)

          for (const it of items) {
            const gross = it.qty * it.product.price_retail
            const lineDiscount = +(gross * discountPct).toFixed(2)
            const lineTotal = +(gross - lineDiscount).toFixed(2)

            const siRes = insSaleItem.run(
              saleId, it.product.id,
              it.product.name_for_print ?? it.product.trade_name,
              it.product.unit_name ?? '',
              it.qty, it.product.price_retail, lineDiscount, lineTotal,
            )
            const saleItemId = Number(siRes.lastInsertRowid)
            saleItemCount++

            for (const u of it.lots) {
              insSaleItemLot.run(saleItemId, u.id, it.product.id, u.qty)
              insMove.run(
                it.product.id, u.id, 'sale', 'sale', saleId,
                -u.qty, u.qtyBefore, u.qtyBefore - u.qty, u.cost,
                `ขาย: ${rcNo} [DEV-SEED]`, userId, dtStr,
              )
            }
          }
          saleCount++
        }
      }

      return { grCount, lotCount, saleCount, saleItemCount }
    })()

    // ---- Phase 3: Recompute products.cost_price (weighted avg of open lots) ----
    const affected = (db.prepare(`
      SELECT DISTINCT product_id FROM product_lots WHERE note = '[DEV-SEED]'
    `).all() as any[]).map(r => r.product_id) as number[]
    const recompute = db.prepare(`
      UPDATE products SET cost_price = (
        SELECT COALESCE(SUM(qty_received * cost_price) / NULLIF(SUM(qty_received), 0),
                        products.cost_price)
        FROM product_lots
        WHERE product_id = ? AND qty_received > 0 AND is_closed = 0
      )
      WHERE id = ?
    `)
    db.transaction(() => {
      for (const pid of affected) recompute.run(pid, pid)
    })()

    return {
      wiped,
      ...result,
      message: `✓ ลบของเก่า ${wiped.grs} GR / ${wiped.sales} sales / ${wiped.lots} lots — สร้างใหม่ ${result.grCount} GR (${result.lotCount} lots), ${result.saleCount} sales (${result.saleItemCount} items)`,
    }
  })
}
