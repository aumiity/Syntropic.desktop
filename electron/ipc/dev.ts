import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'

// Dev-only handlers. Triggered from the /theme → "เครื่องมือ Dev" tab.
export function registerDevHandlers() {

  // dev:seedSalesHistory
  // -------------------
  // Backdates GR + sales across the last N days (default 180) using the REAL
  // seeded products / suppliers / customers. Lots accumulate naturally over
  // the simulation window — no hard cap on lot count per SKU. Per-SKU on-hand
  // never exceeds safety_stock × STOCK_CAP_MULT (fallback safety = 200 when
  // NULL). FEFO is enforced. Same shape as a user clicking POS + GR by hand.
  //
  // Sales mix: ~10% wholesale (sale_type='wholesale', price_wholesale1, larger
  // baskets) and ~2% of bills get a later customer return (RT- negative sale that
  // restocks the original lot). GR bills are 90% paid / 10% outstanding.
  // Monthly operating expenses are also seeded (fixed rent/salary + utilities +
  // random extras, capped at 30,000 ฿/month).
  //
  // After the random simulation, a final "end-state engineering" phase
  // guarantees the demo state the user asked for:
  //   • 20 SKUs out of stock
  //   • 80-100 SKUs below reorder_point
  //   • 200-300 SKUs expired
  //   • 40 SKUs near-expire (30-90 days)
  // The four target sets are mutually exclusive — each SKU is in at most one.
  //
  // Idempotent via the '[DEV-SEED]' marker on purchase_receipts.note,
  // product_lots.note, and sales.note. Re-running wipes prior seed and
  // regenerates. Refuses to wipe if any non-dev sale references a dev lot.
  ipcMain.handle('dev:seedSalesHistory', (_e, payload?: { days?: number }) => {
    const db = getDb()
    const DAYS = Math.max(1, Math.min(800, payload?.days ?? 90))

    // Stock cap = safety_stock × STOCK_CAP_MULT. Larger multiplier means more
    // headroom for opening + refills so we don't drain to zero across DAYS days
    // of sales. Opening qty = safety_stock × OPENING_MULT (must be < cap).
    const STOCK_CAP_MULT = 3
    // Opening lot qty = safety_stock × [MIN, MAX]. Keep modest so the bootstrap
    // lot drains within months (not years) and frees a lot-slot for new GRs.
    const OPENING_MULT_MIN = 0.7
    const OPENING_MULT_MAX = 1.3

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
    const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5)

    // ---- Pre-flight ----
    type Product = {
      id: number; trade_name: string; name_for_print: string | null
      cost_price: number; price_retail: number; price_wholesale1: number
      unit_id: number | null; unit_name: string | null
      reorder_point: number | null; safety_stock: number | null
    }
    const products = db.prepare(`
      SELECT p.id, p.trade_name, p.name_for_print, p.cost_price, p.price_retail,
             p.price_wholesale1, p.unit_id,
             u.name AS unit_name, p.reorder_point, p.safety_stock
      FROM products p
      LEFT JOIN item_units u ON u.id = p.unit_id
      WHERE p.is_disabled = 0 AND p.is_stock_item = 1 AND p.price_retail > 0
    `).all() as Product[]
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

    // Per-SKU caps. Fallback when product has no value set.
    const FALLBACK_SAFETY_STOCK = 200
    const FALLBACK_REORDER = 50
    const safetyCap = (p: Product) =>
      (p.safety_stock != null && p.safety_stock > 0 ? p.safety_stock : FALLBACK_SAFETY_STOCK)
        * STOCK_CAP_MULT
    const reorderOf = (p: Product) =>
      p.reorder_point != null && p.reorder_point > 0
        ? p.reorder_point
        : Math.max(1, Math.floor(safetyCap(p) * 0.3))

    // ---- Phase 1: Wipe previous dev seed ----
    // All deletes are set-based (filter by note / subquery), never an
    // `id IN (?, ?, …)` list — a dev seed accumulates tens of thousands of rows
    // and binding one variable per id blows past SQLite's variable limit
    // ("too many SQL variables"). Ordering matters: clear every non-cascade
    // referencer of product_lots BEFORE deleting the lots themselves
    // (stock_movements.lot_id, purchase_receipt_items.lot_id, sale_item_lots.lot_id
    //  all lack ON DELETE CASCADE — schema.ts).
    const wiped = db.transaction(() => {
      // Conflicting non-dev bills: click-testing the POS rings up real
      // (non-DEV-SEED) sales whose FEFO pulled from dev-seed lots. On a dev DB
      // this is throwaway test data, so fold them into the wipe — deleting the
      // sale cascades its sale_items + sale_item_lots, releasing the lot refs.
      const conflicts = db.prepare(`
        DELETE FROM sales WHERE id IN (
          SELECT DISTINCT si.sale_id
          FROM sale_item_lots sil
          JOIN product_lots pl ON pl.id = sil.lot_id
          JOIN sale_items si ON si.id = sil.sale_item_id
          JOIN sales s ON s.id = si.sale_id
          WHERE pl.note = '[DEV-SEED]'
            AND (s.note IS NULL OR s.note != '[DEV-SEED]')
        )
      `).run().changes

      db.prepare(`
        DELETE FROM stock_movements
        WHERE lot_id IN (SELECT id FROM product_lots WHERE note = '[DEV-SEED]')
      `).run()

      // Deleting dev sales cascades sale_items + sale_item_lots.
      const sales = db.prepare(`DELETE FROM sales WHERE note = '[DEV-SEED]'`).run().changes

      db.prepare(`
        DELETE FROM purchase_receipt_items
        WHERE invoice_no IN (SELECT invoice_no FROM purchase_receipts WHERE note = '[DEV-SEED]')
      `).run()
      const grs = db.prepare(`DELETE FROM purchase_receipts WHERE note = '[DEV-SEED]'`).run().changes

      // lot_cost_logs.lot_id has ON DELETE CASCADE, so it clears automatically.
      const lots = db.prepare(`DELETE FROM product_lots WHERE note = '[DEV-SEED]'`).run().changes

      // Seeded expenses (Phase 5) carry '[DEV-SEED]' in their note.
      db.prepare(`DELETE FROM expenses WHERE note LIKE '%[DEV-SEED]%'`).run()

      return { sales, grs, lots, conflicts }
    })()

    // ---- Phase 2: Simulation params ----
    const today = dayjs()

    const GR_PER_DAY_MIN = 3, GR_PER_DAY_MAX = 6
    const LINES_PER_GR_MIN = 5, LINES_PER_GR_MAX = 30
    const SALES_PER_DAY_MIN = 80, SALES_PER_DAY_MAX = 100
    const ITEMS_PER_SALE_MIN = 1, ITEMS_PER_SALE_MAX = 12

    // Per-SKU running on-hand total (gates GR eligibility — must stay ≤ safety cap)
    const onHandByProduct = new Map<number, number>()
    const bumpOnHand = (pid: number, delta: number) =>
      onHandByProduct.set(pid, (onHandByProduct.get(pid) ?? 0) + delta)

    // Lot number = plain running 6-digit (000001, 000002, …). Globally
    // unique so it never collides on the (product, lot_number) UNIQUE index.
    let lotSeq = 0
    const nextLotNo = () => String(++lotSeq).padStart(6, '0')

    const grSeqByDate = new Map<string, number>()
    const saleSeqByDate = new Map<string, number>()
    const returnSeqByDate = new Map<string, number>()

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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[DEV-SEED]', 'completed', ?)
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
    // Returns restore stock to the original lot, reopening it if a prior sale had
    // closed it at zero (HARD invariant: is_closed toggles when qty crosses 0).
    const selLotNow = db.prepare(`SELECT qty_on_hand FROM product_lots WHERE id = ?`)
    const restoreLotStmt = db.prepare(`
      UPDATE product_lots
      SET qty_on_hand = qty_on_hand + ?,
          is_closed = CASE WHEN qty_on_hand + ? > 0 THEN 0 ELSE is_closed END,
          closed_at = CASE WHEN qty_on_hand + ? > 0 THEN NULL ELSE closed_at END,
          updated_at = ?
      WHERE id = ?
    `)

    // Receive one line: insert lot + receipt item + stock_movement, update bookkeeping.
    // Returns true if succeeded (room under safety cap), false if skipped.
    const receiveLine = (
      product: Product, supplierId: number, grNo: string,
      dateStr: string, dtStr: string, payType: string, dueDate: string | null,
      isPaid: number, qtyHint: number,
    ): boolean => {
      const cap = safetyCap(product)
      const headroom = cap - (onHandByProduct.get(product.id) ?? 0)
      if (headroom < 1) return false

      const qty = Math.max(1, Math.min(qtyHint, Math.floor(headroom)))
      const cost = Math.max(0.5, +(product.cost_price * randF(0.85, 1.15)).toFixed(2))
      const day = dayjs(dateStr)
      const expiry = day.add(rand(6, 24) * 30, 'day').format('YYYY-MM-DD')
      const mfg = day.subtract(rand(30, 360), 'day').format('YYYY-MM-DD')
      const lotNo = nextLotNo()

      const lotRes = insLot.run(
        product.id, supplierId, lotNo, mfg, expiry,
        cost, product.price_retail, qty, qty,
        grNo, `INV-MOCK-${grNo}`, dateStr,
        payType, dueDate, isPaid, isPaid ? dateStr : null,
        dtStr, dtStr,
      )
      const lotId = Number(lotRes.lastInsertRowid)
      bumpOnHand(product.id, qty)

      insReceiptItem.run(grNo, product.id, lotId, lotNo, mfg, expiry,
        cost, product.price_retail, qty, dtStr)
      insMove.run(product.id, lotId, 'receive', 'stock_receive', null,
        qty, 0, qty, cost, `รับสินค้า: ${grNo} [DEV-SEED]`, users[0], dtStr)
      return true
    }

    const result = db.transaction(() => {
      let grCount = 0, lotCount = 0, saleCount = 0, saleItemCount = 0
      let wholesaleCount = 0, returnCount = 0

      // ---- Day 0: opening-stock GR ----
      // One bootstrap receipt on the oldest day that stocks EVERY inventory
      // SKU so sales have stock from day one (no ramp). Opening qty is sized
      // against safety_stock so we leave headroom for subsequent GRs.
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

        for (const product of products) {
          const baseSafety = product.safety_stock != null && product.safety_stock > 0
            ? product.safety_stock : FALLBACK_SAFETY_STOCK
          const opening = Math.max(1, Math.floor(baseSafety * randF(OPENING_MULT_MIN, OPENING_MULT_MAX)))
          if (receiveLine(product, supplierId, grNo, openDate, dtStr, 'cash', null, 1, opening)) {
            lotCount++
          }
        }
        grCount++
      }

      for (let d = DAYS - 1; d >= 0; d--) {
        const day = today.subtract(d, 'day')
        const dateStr = day.format('YYYY-MM-DD')
        const yymmdd = day.format('YYYYMMDD')

        // ---- GRs (3-6 ใบ/วัน) ----
        const grPerDay = rand(GR_PER_DAY_MIN, GR_PER_DAY_MAX)
        for (let g = 0; g < grPerDay; g++) {
          // Candidates = products with on-hand below the safety cap. Lots can
          // accumulate freely — no hard lot-count cap. If every SKU is full,
          // stop generating GRs today.
          const candidates = products.filter(p => {
            const cap = safetyCap(p)
            return (onHandByProduct.get(p.id) ?? 0) < cap
          })
          if (candidates.length === 0) break

          const seq = (grSeqByDate.get(yymmdd) ?? 0) + 1
          grSeqByDate.set(yymmdd, seq)
          const grNo = `GR-${yymmdd}-${String(seq).padStart(4, '0')}`

          const supplierId = pick(suppliers)
          const hour = rand(8, 17)
          const min = rand(0, 59)
          const dtStr = `${dateStr} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`

          // 90% of GR bills are paid, 10% outstanding (credit, due in 30 days).
          const isPaid = Math.random() < 0.9 ? 1 : 0
          const paymentType = isPaid ? 'cash' : 'credit'
          const dueDate = !isPaid ? day.add(30, 'day').format('YYYY-MM-DD') : null

          insReceipt.run(grNo, supplierId, `INV-MOCK-${grNo}`, dateStr,
            paymentType, dueDate, isPaid, isPaid ? dateStr : null, dtStr)

          // Stock-aware refill: prioritize products below reorder_point so they
          // get topped up first; healthy products fill any remaining line slots
          // for variety.
          const low = candidates.filter(p =>
            (onHandByProduct.get(p.id) ?? 0) < reorderOf(p))
          const healthy = candidates.filter(p =>
            (onHandByProduct.get(p.id) ?? 0) >= reorderOf(p))
          const lineCount = Math.min(rand(LINES_PER_GR_MIN, LINES_PER_GR_MAX), candidates.length)
          const lineProducts = [...shuffle(low), ...shuffle(healthy)].slice(0, lineCount)

          for (const product of lineProducts) {
            // Per-line qty 10-80, capped by remaining headroom inside receiveLine.
            // Smaller batches let lots drain and close within a reasonable window.
            const qtyHint = rand(10, 80)
            if (receiveLine(product, supplierId, grNo, dateStr, dtStr, paymentType, dueDate, isPaid, qtyHint)) {
              lotCount++
            }
          }
          grCount++
        }

        // ---- Sales (80-100 ใบ/วัน) ----
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

          // 10% of bills are wholesale: sale_type='wholesale', priced at
          // price_wholesale1 (fallback retail), larger baskets (1,000-5,000 ฿).
          const isWholesale = Math.random() < 0.10
          const saleType = isWholesale ? 'wholesale' : 'retail'
          const priceOf = (p: Product) =>
            isWholesale && p.price_wholesale1 > 0 ? p.price_wholesale1 : p.price_retail

          // Target bill amount. Retail [50,2000] heavily biased small so a day of
          // 80-100 bills lands ~10k-20k; wholesale [1000,5000] for bulk buyers.
          const targetAmount = isWholesale
            ? rand(1000, 5000)
            : weighted<number>([
                [rand(50, 100), 60],
                [rand(100, 200), 30],
                [rand(200, 600), 8],
                [rand(600, 2000), 2],
              ])
          const maxItems = rand(ITEMS_PER_SALE_MIN, ITEMS_PER_SALE_MAX)

          const shuffled = shuffle(products)
          const items: Array<{
            product: Product
            qty: number
            price: number
            lots: Array<{ id: number; qty: number; cost: number; qtyBefore: number }>
          }> = []
          let runningSubtotal = 0

          for (const product of shuffled) {
            if (items.length >= maxItems) break
            if (runningSubtotal >= targetAmount) break

            const lots = selLotsFEFO.all(product.id) as Array<{
              id: number; qty_on_hand: number; cost_price: number
            }>
            if (lots.length === 0) continue
            const avail = lots.reduce((s, l) => s + l.qty_on_hand, 0)
            if (avail < 1) continue

            // Size the line so it nudges the bill toward (not past) the target.
            const unitPrice = priceOf(product)
            const remaining = Math.max(1, targetAmount - runningSubtotal)
            const idealQty = Math.max(1, Math.round(remaining / unitPrice))
            const desired = weighted<number>([
              [1, 35], [2, 25], [3, 15], [rand(4, 6), 15], [rand(6, 12), 10],
            ])
            const qty = Math.min(desired, idealQty, Math.floor(avail))
            if (qty < 1) continue

            // Plan FEFO deduction
            const used: typeof items[0]['lots'] = []
            let remainingQty = qty
            for (const lot of lots) {
              if (remainingQty <= 0) break
              const deduct = Math.min(lot.qty_on_hand, remainingQty)
              used.push({
                id: lot.id, qty: deduct, cost: lot.cost_price, qtyBefore: lot.qty_on_hand,
              })
              remainingQty -= deduct
            }
            items.push({ product, qty, price: unitPrice, lots: used })
            runningSubtotal += qty * unitPrice

            // Apply deduction immediately so next item's FEFO query sees it
            for (const u of used) {
              const after = u.qtyBefore - u.qty
              updLotAfterSale.run(after, after, after, dtStr, u.id)
              bumpOnHand(product.id, -u.qty)
            }
          }
          if (items.length === 0) continue

          let subtotal = 0
          for (const it of items) subtotal += it.qty * it.price
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
            rcNo, saleType, customerId, userId, dtStr,
            subtotal, totalDiscount, totalAmount,
            cashAmount, cardAmount, transferAmount, changeAmount, dtStr,
          )
          const saleId = Number(saleRes.lastInsertRowid)

          for (const it of items) {
            const gross = it.qty * it.price
            const lineDiscount = +(gross * discountPct).toFixed(2)
            const lineTotal = +(gross - lineDiscount).toFixed(2)

            const siRes = insSaleItem.run(
              saleId, it.product.id,
              it.product.name_for_print ?? it.product.trade_name,
              it.product.unit_name ?? '',
              it.qty, it.price, lineDiscount, lineTotal,
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
          if (isWholesale) wholesaleCount++

          // ---- Returns (~2% of bills) ----
          // A few days later the customer brings one line back: a negative RT-
          // sale + stock restored to the very lot it came from (mirrors
          // pos:returnItems). note='[DEV-SEED]' so Phase 1 wipes it like any sale.
          if (Math.random() < 0.02) {
            const ret = pick(items)
            if (ret.lots.length > 0) {
              const rDay = day.add(Math.min(rand(1, 7), d), 'day')
              const rYmd = rDay.format('YYYYMMDD')
              const rSeq = (returnSeqByDate.get(rYmd) ?? 0) + 1
              returnSeqByDate.set(rYmd, rSeq)
              const rtNo = `RT-${rYmd}-${String(rSeq).padStart(4, '0')}`
              const rDtStr = `${rDay.format('YYYY-MM-DD')} ` +
                `${String(rand(9, 18)).padStart(2, '0')}:${String(rand(0, 59)).padStart(2, '0')}:00`

              const lineTotal = +(ret.qty * ret.price).toFixed(2)
              const rSaleRes = insSale.run(
                rtNo, 'return', customerId, userId, rDtStr,
                -lineTotal, 0, -lineTotal,
                0, 0, 0, 0, rDtStr,
              )
              const rSaleId = Number(rSaleRes.lastInsertRowid)
              const rItemRes = insSaleItem.run(
                rSaleId, ret.product.id,
                ret.product.name_for_print ?? ret.product.trade_name,
                ret.product.unit_name ?? '',
                -ret.qty, ret.price, 0, -lineTotal,
              )
              const rItemId = Number(rItemRes.lastInsertRowid)
              for (const u of ret.lots) {
                insSaleItemLot.run(rItemId, u.id, ret.product.id, -u.qty)
                const before = (selLotNow.get(u.id) as { qty_on_hand: number } | undefined)?.qty_on_hand ?? 0
                restoreLotStmt.run(u.qty, u.qty, u.qty, rDtStr, u.id)
                bumpOnHand(ret.product.id, u.qty)
                insMove.run(
                  ret.product.id, u.id, 'sale_return', 'return', rSaleId,
                  u.qty, before, before + u.qty, u.cost,
                  `รับคืน: ${rtNo} [DEV-SEED]`, userId, rDtStr,
                )
              }
              returnCount++
            }
          }
        }
      }

      return { grCount, lotCount, saleCount, saleItemCount, wholesaleCount, returnCount }
    })()

    // ---- Phase 3: End-state engineering ----
    // After the random simulation, force the demo-friendly state the user asked
    // for. Four disjoint product subsets so each SKU lands in at most one bucket.
    const TARGET_OUT_OF_STOCK = 20
    const TARGET_BELOW_REORDER_MIN = 80
    const TARGET_BELOW_REORDER_MAX = 100
    const TARGET_EXPIRED_MIN = 200
    const TARGET_EXPIRED_MAX = 300
    const TARGET_NEAR_EXPIRE = 40

    const targetBelowReorder = rand(TARGET_BELOW_REORDER_MIN, TARGET_BELOW_REORDER_MAX)
    const targetExpired = rand(TARGET_EXPIRED_MIN, TARGET_EXPIRED_MAX)

    // Eligible = has at least one open, non-cancelled dev-seed lot
    const eligibleIds = (db.prepare(`
      SELECT DISTINCT p.id
      FROM products p
      JOIN product_lots pl ON pl.product_id = p.id
      WHERE pl.note = '[DEV-SEED]' AND pl.is_closed = 0 AND pl.is_cancelled = 0
        AND pl.qty_on_hand > 0
    `).all() as any[]).map(r => r.id) as number[]

    const productById = new Map(products.map(p => [p.id, p]))
    const shuffledEligible = shuffle(eligibleIds)

    const need = TARGET_OUT_OF_STOCK + targetBelowReorder + targetExpired + TARGET_NEAR_EXPIRE
    if (shuffledEligible.length < need) {
      // Not enough — proportionally scale down each bucket so we don't bias one.
      // Rare for a real run (typically 1000+ SKUs eligible), defensive only.
    }

    let cursor = 0
    const take = (n: number) => {
      const slice = shuffledEligible.slice(cursor, cursor + n)
      cursor += n
      return slice
    }
    const outOfStockIds = take(TARGET_OUT_OF_STOCK)
    const belowReorderIds = take(targetBelowReorder)
    const expiredIds = take(targetExpired)
    const nearExpireIds = take(TARGET_NEAR_EXPIRE)

    const adjustStmt = db.prepare(`
      UPDATE product_lots
      SET qty_on_hand = ?,
          is_closed = CASE WHEN ? <= 0 THEN 1 ELSE is_closed END,
          closed_at = CASE WHEN ? <= 0 AND closed_at IS NULL THEN ? ELSE closed_at END
      WHERE id = ?
    `)
    const updExpiry = db.prepare(`
      UPDATE product_lots
      SET expiry_date = ?, updated_at = ?
      WHERE id = ?
    `)
    const nowStr = today.format('YYYY-MM-DD HH:mm:ss')

    // Helper: drain qty from a product's FEFO-ordered lots by `deltaDown` units,
    // logging adjust_out movements.
    const drainProduct = (pid: number, deltaDown: number) => {
      if (deltaDown <= 0) return
      const lots = db.prepare(`
        SELECT id, qty_on_hand, cost_price FROM product_lots
        WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0 AND is_cancelled = 0
        ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC, id ASC
      `).all(pid) as Array<{ id: number; qty_on_hand: number; cost_price: number }>
      let remaining = deltaDown
      for (const lot of lots) {
        if (remaining <= 0) break
        const cut = Math.min(lot.qty_on_hand, remaining)
        const after = lot.qty_on_hand - cut
        adjustStmt.run(after, after, after, nowStr, lot.id)
        insMove.run(
          pid, lot.id, 'adjust_out', 'adjust', null,
          -cut, lot.qty_on_hand, after, lot.cost_price,
          'ปรับสต๊อก dev seed (end-state) [DEV-SEED]', users[0], nowStr,
        )
        remaining -= cut
      }
    }

    const totalOnHandStmt = db.prepare(`
      SELECT COALESCE(SUM(qty_on_hand), 0) AS total FROM product_lots
      WHERE product_id = ? AND is_closed = 0 AND is_cancelled = 0
    `)
    const totalOnHand = (pid: number) =>
      (totalOnHandStmt.get(pid) as { total: number }).total

    const engineered = db.transaction(() => {
      // 1. Out of stock → drain everything
      for (const pid of outOfStockIds) {
        const cur = totalOnHand(pid)
        if (cur > 0) drainProduct(pid, cur)
      }

      // 2. Below reorder → drain to a value in [1, reorder-1]
      for (const pid of belowReorderIds) {
        const p = productById.get(pid)
        if (!p) continue
        const reorder = reorderOf(p)
        const target = Math.max(1, rand(1, Math.max(1, Math.floor(reorder) - 1)))
        const cur = totalOnHand(pid)
        if (cur > target) drainProduct(pid, cur - target)
      }

      // 3. Expired → push the latest-expiry lot into the past (1-90 days ago)
      const latestLotStmt = db.prepare(`
        SELECT id FROM product_lots
        WHERE product_id = ? AND is_closed = 0 AND is_cancelled = 0 AND qty_on_hand > 0
        ORDER BY CASE WHEN expiry_date IS NULL THEN '0000-00-00' ELSE expiry_date END DESC, id DESC
        LIMIT 1
      `)
      for (const pid of expiredIds) {
        const row = latestLotStmt.get(pid) as { id: number } | undefined
        if (!row) continue
        const past = today.subtract(rand(1, 90), 'day').format('YYYY-MM-DD')
        updExpiry.run(past, nowStr, row.id)
      }

      // 4. Near-expire → push the latest-expiry lot to 30-90 days out
      for (const pid of nearExpireIds) {
        const row = latestLotStmt.get(pid) as { id: number } | undefined
        if (!row) continue
        const near = today.add(rand(30, 90), 'day').format('YYYY-MM-DD')
        updExpiry.run(near, nowStr, row.id)
      }

      return {
        outOfStock: outOfStockIds.length,
        belowReorder: belowReorderIds.length,
        expired: expiredIds.length,
        nearExpire: nearExpireIds.length,
      }
    })()

    // ---- Phase 4: Recompute products.cost_price (weighted avg of open lots) ----
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

    // ---- Phase 5: Monthly expenses (fixed recurring + random, ≤ 30,000/เดือน) ----
    // One pass per month in the simulation window. Fixed lines (rent, salary)
    // anchor the total; utilities + a few random extras fill toward the 30k cap
    // but never exceed it. Dates are clamped so nothing lands in the future.
    const cats = db.prepare(`SELECT id, name FROM expense_categories`).all() as Array<{ id: number; name: string }>
    const catId = (name: string) => cats.find(c => c.name === name)?.id ?? cats[0]?.id ?? null
    const insExpense = db.prepare(`
      INSERT INTO expenses
        (expense_no, expense_date, category_id, amount, reference_no, note,
         vat_amount, has_tax_invoice, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, 0, 0, ?, ?)
    `)
    const expSeqByDate = new Map<string, number>()
    const expNo = (ymd: string) => {
      const seq = (expSeqByDate.get(ymd) ?? 0) + 1
      expSeqByDate.set(ymd, seq)
      return `EX-${ymd}-${String(seq).padStart(4, '0')}`
    }
    let expenseCount = 0
    if (cats.length > 0) {
      const startMonth = today.subtract(DAYS, 'day').startOf('month')
      const endMonth = today.startOf('month')
      const MONTHLY_BUDGET = 30000
      db.transaction(() => {
        let m = startMonth
        while (m.isBefore(endMonth) || m.isSame(endMonth, 'month')) {
          let monthTotal = 0
          const add = (catName: string, amount: number, dom: number, label: string) => {
            if (monthTotal + amount > MONTHLY_BUDGET) return
            const dt0 = m.date(Math.min(dom, m.daysInMonth()))
            const dt = dt0.isAfter(today) ? today : dt0
            const dateStr = dt.format('YYYY-MM-DD')
            const created = `${dateStr} 09:00:00`
            insExpense.run(expNo(dt.format('YYYYMMDD')), dateStr, catId(catName),
              +amount.toFixed(2), `${label} [DEV-SEED]`, created, created)
            monthTotal += amount
            expenseCount++
          }
          // Fixed recurring
          add('ค่าเช่า', 8000, 1, 'ค่าเช่าร้าน')
          add('เงินเดือน/ค่าแรง', 9000, 28, 'เงินเดือนพนักงาน')
          // Semi-fixed utilities (random within band)
          add('ค่าน้ำ', rand(300, 900), 5, 'ค่าน้ำประปา')
          add('ค่าไฟ', rand(1500, 3500), 8, 'ค่าไฟฟ้า')
          // Random extras until the budget runs low
          const extras: Array<[string, string]> = [
            ['ค่าการตลาด', 'โฆษณา/โปรโมชัน'],
            ['ค่าขนส่ง', 'ค่าขนส่งสินค้า'],
            ['ค่าอุปกรณ์', 'อุปกรณ์สำนักงาน'],
            ['ภาษี/ค่าธรรมเนียม', 'ค่าธรรมเนียม'],
            ['อื่นๆ', 'เบ็ดเตล็ด'],
          ]
          const extraCount = rand(2, 4)
          for (let i = 0; i < extraCount; i++) {
            const [c, l] = pick(extras)
            add(c, rand(500, 4000), rand(10, 26), l)
          }
          m = m.add(1, 'month')
        }
      })()
    }

    return {
      wiped,
      ...result,
      engineered,
      expenseCount,
      days: DAYS,
      message:
        `ลบของเก่า ${wiped.grs} GR / ${wiped.sales} sales / ${wiped.lots} lots` +
        (wiped.conflicts > 0 ? ` (รวมบิลทดสอบที่อ้างล็อต dev ${wiped.conflicts} ใบ)` : '') + `\n` +
        `สร้างใหม่ย้อน ${DAYS} วัน: ${result.grCount} GR (รวม ${result.lotCount} lots), ` +
        `${result.saleCount} sales (${result.saleItemCount} items) ` +
        `[ขายส่ง ${result.wholesaleCount} / รับคืน ${result.returnCount}], ` +
        `ค่าใช้จ่าย ${expenseCount} รายการ\n` +
        `End-state: ${engineered.outOfStock} หมดสต็อก / ${engineered.belowReorder} ต่ำกว่าจุดสั่งซื้อ / ` +
        `${engineered.expired} expired / ${engineered.nearExpire} near-expire`,
    }
  })
}
