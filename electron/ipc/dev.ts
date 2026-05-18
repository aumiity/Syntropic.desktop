import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'

// Dev-only handlers. Triggered from the /theme → "เครื่องมือ Dev" tab.
export function registerDevHandlers() {

  // dev:seedSalesHistory
  // -------------------
  // Backdates ~500 GRs + ~9000 sales across the last 90 days using the REAL
  // seeded products / suppliers / customers. Every product gets a lot
  // (≤3 per product); FEFO is enforced day-by-day so
  // movements/lots/sale_item_lots are internally consistent — same shape as a
  // user clicking through POS + GR 9000+ times.
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

    // Per-day rates (spec): GR 3-8 ใบ/วัน, ขาย 90-100 ใบ/วัน over ~91 days
    // → ≈500 GR / ≈9000 sales total. No exact-total distribution: each day
    // draws its own count so the volume looks organic, not perfectly flat.
    const GR_PER_DAY_MIN = 3, GR_PER_DAY_MAX = 8
    const SALES_PER_DAY_MIN = 90, SALES_PER_DAY_MAX = 100

    // "ทุก SKU active" — every sellable product participates (no subset cap)
    const inventory = products

    // "มี Lot ทุกสินค้า — สินค้าละ ไม่เกิน 3 Lot": hard cap. The opening GR
    // gives every product lot #1; regular GRs may add lot #2/#3 only. A
    // product already at 3 lots is excluded from further GR lines, so the
    // 5-50 lines/GR target clamps to the remaining candidate pool — the lot
    // cap always wins over the line-count target.
    const MAX_LOTS_PER_PRODUCT = 3
    const lotCountByProduct = new Map<number, number>()

    // Lot number = plain running 6-digit (000001, 000002, …). Globally
    // unique, so it never collides on the (product, lot_number) UNIQUE index.
    let lotSeq = 0
    const nextLotNo = () => String(++lotSeq).padStart(6, '0')

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

      // ---- Day 0: opening-stock GR ----
      // One bootstrap receipt on the oldest day that stocks EVERY inventory
      // SKU, so sales have stock to draw from from day one (no ramp). Counted
      // as seq 1 of that day; the regular day-loop GRs continue from seq 2.
      {
        const openDay = today.subtract(DAYS, 'day')
        const openDate = openDay.format('YYYY-MM-DD')
        const openYmd = openDay.format('YYYYMMDD')
        const openSeq = 1
        grSeqByDate.set(openYmd, openSeq)
        const grNo = `GR-${openYmd}-${String(openSeq).padStart(4, '0')}`
        const supplierId = pick(suppliers)
        const dtStr = `${openDate} 08:00:00`

        insReceipt.run(grNo, supplierId, `INV-MOCK-${grNo}`, openDate,
          'cash', null, 1, openDate, dtStr)

        for (const product of inventory) {
          const cost = Math.max(0.5, +(product.cost_price * randF(0.85, 1.15)).toFixed(2))
          const qty = rand(200, 800)
          const expiry = openDay.add(rand(6, 24) * 30, 'day').format('YYYY-MM-DD')
          const mfg = openDay.subtract(rand(30, 360), 'day').format('YYYY-MM-DD')
          const lotNo = nextLotNo()

          const lotRes = insLot.run(
            product.id, supplierId, lotNo, mfg, expiry,
            cost, product.price_retail, qty, qty,
            grNo, `INV-MOCK-${grNo}`, openDate,
            'cash', null, 1, openDate,
            dtStr, dtStr,
          )
          const lotId = Number(lotRes.lastInsertRowid)
          lotCount++
          lotCountByProduct.set(product.id, 1) // lot #1 for every product

          insReceiptItem.run(grNo, product.id, lotId, lotNo, mfg, expiry,
            cost, product.price_retail, qty, dtStr)
          insMove.run(product.id, lotId, 'receive', 'stock_receive', null,
            qty, 0, qty, cost, `รับสินค้า: ${grNo} [DEV-SEED]`, users[0], dtStr)
        }
        grCount++
      }

      for (let d = DAYS; d >= 0; d--) {
        const day = today.subtract(d, 'day')
        const dateStr = day.format('YYYY-MM-DD')
        const yymmdd = day.format('YYYYMMDD')

        // ---- GRs (3-8 ใบ/วัน → ~500 total) ----
        const grPerDay = rand(GR_PER_DAY_MIN, GR_PER_DAY_MAX)
        for (let g = 0; g < grPerDay; g++) {
          // Only products under the 3-lot cap can receive more stock. Once
          // every product is capped, no further GR lines are possible — stop
          // creating GRs for the rest of the run.
          const candidates = inventory.filter(
            p => (lotCountByProduct.get(p.id) ?? 0) < MAX_LOTS_PER_PRODUCT,
          )
          if (candidates.length === 0) break

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

          const lineCount = Math.min(rand(5, 50), candidates.length)
          const lineProducts = [...candidates].sort(() => Math.random() - 0.5).slice(0, lineCount)

          for (const product of lineProducts) {
            const cost = Math.max(0.5, +(product.cost_price * randF(0.85, 1.15)).toFixed(2))
            const sellPrice = product.price_retail
            const qty = rand(50, 500)
            const expiry = day.add(rand(6, 24) * 30, 'day').format('YYYY-MM-DD')
            const mfg = day.subtract(rand(30, 360), 'day').format('YYYY-MM-DD')
            const lotNo = nextLotNo()

            const lotRes = insLot.run(
              product.id, supplierId, lotNo, mfg, expiry,
              cost, sellPrice, qty, qty,
              grNo, `INV-MOCK-${grNo}`, dateStr,
              paymentType, dueDate, isPaid, isPaid ? dateStr : null,
              dtStr, dtStr,
            )
            const lotId = Number(lotRes.lastInsertRowid)
            lotCount++
            lotCountByProduct.set(product.id, (lotCountByProduct.get(product.id) ?? 0) + 1)

            insReceiptItem.run(grNo, product.id, lotId, lotNo, mfg, expiry,
              cost, sellPrice, qty, dtStr)
            insMove.run(product.id, lotId, 'receive', 'stock_receive', null,
              qty, 0, qty, cost, `รับสินค้า: ${grNo} [DEV-SEED]`, users[0], dtStr)
          }
          grCount++
        }

        // ---- Sales (90-100 ใบ/วัน → ~9000 total) ----
        const salesPerDay = rand(SALES_PER_DAY_MIN, SALES_PER_DAY_MAX)
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

          const itemCount = rand(1, 10) // 1-10 รายการ/ใบ

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
      message: `✓ ลบของเก่า ${wiped.grs} GR / ${wiped.sales} sales / ${wiped.lots} lots — สร้างใหม่ ${result.grCount} GR (รวม GR เปิดสต็อก 1 ใบ, ${result.lotCount} lots, ≤3/สินค้า), ${result.saleCount} sales (${result.saleItemCount} items)`,
    }
  })
}
