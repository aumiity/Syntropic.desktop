import { ipcMain } from 'electron'
import { getDb } from '../db'
import { recomputeAvgCost, propagateCostToBundles } from '../db/pricing'
import { nextCustomerCode, walkInCustomerId, WALKIN_CUSTOMER_CODE } from './codes'
import dayjs from 'dayjs'

// FEFO deduction shared by single-product sales and bundle-component sales.
// Takes BASE-unit qty — the caller multiplies by qty_per_base for non-base
// unit sales. Bundles iterate this helper once per component.
//
// Behavior (intentionally preserved from the pre-refactor inline loop):
// - Walks open lots ordered by expiry_date ASC.
// - Each take inserts a sale_item_lots row + a stock_movements 'sale' row,
//   tagged with the COMPONENT's product_id (independent of sale_items.product_id).
//   This makes void/return work for bundles with no reports.ts changes.
// - Oversell remainder is written as ONE sale_item_lots row with lot_id=NULL.
// - Does NOT auto-close lots at qty_on_hand=0 — FEFO queries filter
//   `qty_on_hand > 0 AND is_closed=0` already; adjustStock/updateLot owns
//   the close-toggle behavior. Adding it here would change semantics.
function deductFefo(
  db: any,
  productId: number,
  baseQty: number,
  saleItemId: number | bigint,
  saleId: number | bigint,
  invoiceNo: string,
  soldBy: number,
): void {
  const lots = db.prepare(`
    SELECT * FROM product_lots
    WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0
    ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC
  `).all(productId) as any[]

  let remaining = baseQty
  for (const lot of lots) {
    if (remaining <= 0) break
    const deduct = Math.min(lot.qty_on_hand, remaining)
    const qtyBefore = lot.qty_on_hand
    db.prepare(`UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?`).run(deduct, lot.id)
    db.prepare(`INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty) VALUES (?, ?, ?, ?)`)
      .run(saleItemId, lot.id, productId, deduct)
    db.prepare(`INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, unit_cost, note, created_by)
      VALUES (?, ?, 'sale', 'sale', ?, ?, ?, ?, ?, ?, ?)`).run(
      productId, lot.id, saleId, -deduct, qtyBefore, qtyBefore - deduct, lot.cost_price,
      `ขาย: ${invoiceNo}`, soldBy
    )
    remaining -= deduct
  }

  if (remaining > 0) {
    // Oversold — record the unfulfilled portion against no lot.
    db.prepare(`INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty) VALUES (?, NULL, ?, ?)`)
      .run(saleItemId, productId, remaining)
  }
}

export function registerPosHandlers() {
  // Search products for POS
  ipcMain.handle('pos:searchProducts', (_e, query: string) => {
    const db = getDb()
    const q = `%${query}%`
    const prefix = `${query}%`
    const kwMid = `%,${query}%`
    const kwMidSp = `%, ${query}%`
    const products = db.prepare(`
      SELECT p.*, c.name as category_name, dt.name_th as drug_type_name,
             u.name as unit_name
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN drug_types dt ON dt.id = p.drug_type_id
      LEFT JOIN item_units u ON u.id = p.unit_id
      WHERE p.is_disabled = 0
        AND (p.trade_name LIKE ? OR p.barcode LIKE ? OR p.barcode2 LIKE ?
             OR p.barcode3 LIKE ? OR p.barcode4 LIKE ?
             OR p.code LIKE ? OR p.search_keywords LIKE ?)
      ORDER BY
        CASE
          WHEN p.trade_name LIKE ? THEN 1
          WHEN p.code LIKE ? THEN 2
          WHEN p.search_keywords LIKE ? OR p.search_keywords LIKE ? OR p.search_keywords LIKE ? THEN 3
          ELSE 4
        END,
        p.trade_name
      LIMIT 30
    `).all(q, q, q, q, q, q, q, prefix, prefix, prefix, kwMid, kwMidSp)

    for (const prod of products as any[]) {
      prod.lots = db.prepare(`
        SELECT * FROM product_lots
        WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0
        ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC
      `).all(prod.id)

      prod.units = db.prepare(`
        SELECT pu.*, u.name as unit_name FROM product_units pu
        JOIN item_units u ON u.id = pu.unit_id
        WHERE pu.product_id = ? AND pu.is_disabled = 0 AND pu.is_for_sale = 1
        ORDER BY pu.qty_per_base ASC
      `).all(prod.id)

      // Bundles carry composition + per-component lots so POS can FEFO-cost
      // the preview without a second round-trip.
      if (prod.is_bundle === 1) {
        const items = db.prepare(`
          SELECT bi.*,
                 c.trade_name as component_name,
                 u.name as component_unit_name,
                 c.cost_price as component_cost
          FROM product_bundle_items bi
          JOIN products c ON c.id = bi.component_product_id
          LEFT JOIN item_units u ON u.id = c.unit_id
          WHERE bi.bundle_id = ?
          ORDER BY bi.sort_order, bi.id
        `).all(prod.id) as any[]
        for (const it of items) {
          it.lots = db.prepare(`
            SELECT * FROM product_lots
            WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0
            ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC
          `).all(it.component_product_id)
        }
        prod.bundle_items = items
      }
    }

    return products
  })

  // Search customers
  ipcMain.handle('pos:searchCustomers', (_e, query: string) => {
    const q = `%${query}%`
    return getDb().prepare(`
      SELECT * FROM customers
      WHERE is_disabled = 0
        AND code != '${WALKIN_CUSTOMER_CODE}'
        AND (full_name LIKE ? OR phone LIKE ? OR code LIKE ?)
      ORDER BY full_name
      LIMIT 20
    `).all(q, q, q)
  })

  // Quick-add customer
  ipcMain.handle('pos:addCustomer', (_e, data: { full_name: string; phone?: string }) => {
    const db = getDb()
    const code = nextCustomerCode(db)
    const result = db.prepare(`INSERT INTO customers (code, full_name, phone) VALUES (?, ?, ?)`).run(code, data.full_name, data.phone ?? '')
    return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(result.lastInsertRowid)
  })

  // Save sale (main POS transaction)
  ipcMain.handle('pos:saveBill', (_e, payload: {
    sale_type: string
    customer_id: number | null
    customer_name_free: string
    items: Array<{
      product_id: number
      item_name: string
      unit_name: string
      qty: number
      // Conversion factor of the SOLD unit → base unit. 1 for base-unit sales.
      // sale_items.qty stays in the sold unit (receipt unchanged); FEFO/lots
      // deduct qty * qty_per_base in base units.
      qty_per_base?: number
      unit_price: number
      discount: number
      line_total: number
      item_note?: string
    }>
    subtotal: number
    total_discount: number
    total_amount: number
    cash_amount: number
    card_amount: number
    transfer_amount: number
    change_amount: number
    symptom_note?: string
    age_range?: string
    note?: string
    sold_by: number
  }) => {
    const db = getDb()

    // Walk-in (null from the renderer) is persisted as the C0000 row, never
    // NULL — see walk-in invariant in CLAUDE.md.
    const customerId = payload.customer_id ?? walkInCustomerId(db)

    const saveBill = db.transaction(() => {
      // Generate invoice number — LIKE prefix already encodes today's date.
      // (Don't filter by sold_at: it stores 'YYYY-MM-DD HH:MM:SS' but `today`
      // is 'YYYYMMDD', so a string-range comparison silently excludes every row.)
      const today = dayjs().format('YYYYMMDD')
      const countRow = db.prepare(`SELECT COUNT(*) as c FROM sales WHERE invoice_no LIKE ?`)
        .get(`RC-${today}-%`) as { c: number }
      const invoiceNo = `RC-${today}-${String(countRow.c + 1).padStart(4, '0')}`

      const saleResult = db.prepare(`
        INSERT INTO sales (invoice_no, sale_type, customer_id, customer_name_free,
          sold_by, sold_at, subtotal, total_discount, total_amount,
          cash_amount, card_amount, transfer_amount, change_amount,
          symptom_note, age_range, note, status)
        VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(
        invoiceNo, payload.sale_type, customerId, payload.customer_name_free,
        payload.sold_by, payload.subtotal, payload.total_discount, payload.total_amount,
        payload.cash_amount, payload.card_amount, payload.transfer_amount, payload.change_amount,
        payload.symptom_note ?? '', payload.age_range ?? '', payload.note ?? ''
      )
      const saleId = saleResult.lastInsertRowid

      for (const item of payload.items) {
        const itemResult = db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, item_name, unit_name, qty, unit_price, discount, line_total, item_note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(saleId, item.product_id, item.item_name, item.unit_name, item.qty, item.unit_price, item.discount, item.line_total, item.item_note ?? '')
        const saleItemId = itemResult.lastInsertRowid

        // Resolve bundle status from authoritative source — payload could be
        // stale (the client may have searched before the product was flipped).
        const prod = db.prepare(`SELECT is_bundle FROM products WHERE id = ?`)
          .get(item.product_id) as { is_bundle: number } | undefined

        if (prod?.is_bundle === 1) {
          // Bundle: 1 sale_items row (the bundle) + N sale_item_lots rows
          // (one per component lot, tagged with the COMPONENT's product_id).
          // Void/return restoration in reports.ts iterates these rows by
          // sale_item_lots.product_id, so each component lot returns to its
          // own product automatically — no special-case there.
          const components = db.prepare(`
            SELECT component_product_id, qty_per_bundle
            FROM product_bundle_items
            WHERE bundle_id = ?
          `).all(item.product_id) as Array<{ component_product_id: number; qty_per_bundle: number }>

          // qty_per_base is irrelevant for v1 bundles (always sold in base unit).
          for (const comp of components) {
            const componentBaseQty = Number(comp.qty_per_bundle) * item.qty
            deductFefo(db, comp.component_product_id, componentBaseQty, saleItemId, saleId, invoiceNo, payload.sold_by)
          }
        } else {
          // Regular product — qty_per_base converts sold-unit qty into base qty.
          deductFefo(db, item.product_id, item.qty * (item.qty_per_base ?? 1), saleItemId, saleId, invoiceNo, payload.sold_by)
        }
      }

      // Daily summary
      const dailySummary = db.prepare(`
        SELECT COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total,
               MAX(sold_at) as latest
        FROM sales WHERE sold_at >= ? AND sold_at < ? AND status = 'completed'
      `).get(`${today} 00:00:00`, `${today} 23:59:59`) as any

      return { success: true, invoice_no: invoiceNo, daily_bills: dailySummary.bills, daily_total: dailySummary.total, latest_bill_time: dailySummary.latest }
    })

    return saveBill()
  })

  // Return items — Option B: negative sales record + stock restore + movements
  ipcMain.handle('pos:returnItems', (_e, payload: {
    items: Array<{
      product_id: number
      lot_id: number
      product_name: string
      unit_name: string
      qty: number
      unit_price: number
      line_total: number
      reason: string
    }>
    customer_id?: number | null
    reason: string
    created_by: number
  }) => {
    const db = getDb()
    // Walk-in (null) → C0000 row, never NULL (walk-in invariant).
    const customerId = payload.customer_id ?? walkInCustomerId(db)
    const doReturn = db.transaction(() => {
      // Generate RT-YYYYMMDD-NNN invoice number (see saveBill for why the
      // sold_at date filter is omitted — format mismatch makes it always-false).
      const today = dayjs().format('YYYYMMDD')
      const countRow = db.prepare(
        `SELECT COUNT(*) as c FROM sales WHERE invoice_no LIKE ?`
      ).get(`RT-${today}-%`) as { c: number }
      const invoiceNo = `RT-${today}-${String(countRow.c + 1).padStart(4, '0')}`

      const totalAmount = payload.items.reduce((s, i) => s + i.line_total, 0)

      // Negative sales record — total_amount is negative, decreases daily stats automatically
      const saleResult = db.prepare(`
        INSERT INTO sales (invoice_no, sale_type, customer_id, sold_by, sold_at,
          subtotal, total_discount, total_vat, total_amount,
          cash_amount, card_amount, transfer_amount, change_amount,
          note, status)
        VALUES (?, 'return', ?, ?, datetime('now','localtime'),
          ?, 0, 0, ?,
          0, 0, 0, 0,
          ?, 'completed')
      `).run(invoiceNo, customerId, payload.created_by,
        -totalAmount, -totalAmount, payload.reason)
      const saleId = saleResult.lastInsertRowid

      for (const item of payload.items) {
        const lot = db.prepare(`SELECT * FROM product_lots WHERE id = ?`).get(item.lot_id) as any
        if (!lot) throw new Error(`Lot not found: ${item.lot_id}`)

        // Negative sale_items row
        const saleItemResult = db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, item_name, unit_name, qty, unit_price, discount, line_total, item_note)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(saleId, item.product_id, item.product_name, item.unit_name,
          -item.qty, item.unit_price, -item.line_total, item.reason)
        const saleItemId = saleItemResult.lastInsertRowid

        // Lot tracing — negative qty mirrors sale_items
        db.prepare(`
          INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty)
          VALUES (?, ?, ?, ?)
        `).run(saleItemId, item.lot_id, item.product_id, -item.qty)

        // Restore stock
        const qtyBefore = lot.qty_on_hand
        const qtyAfter = qtyBefore + item.qty
        db.prepare(`UPDATE product_lots SET qty_on_hand = qty_on_hand + ? WHERE id = ?`).run(item.qty, item.lot_id)

        // Stock movement — ref_id links back to the return sales record
        db.prepare(`
          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, unit_cost, note, created_by)
          VALUES (?, ?, 'sale_return', 'return', ?, ?, ?, ?, ?, ?, ?)
        `).run(item.product_id, item.lot_id, saleId,
          item.qty, qtyBefore, qtyAfter, lot.cost_price, item.reason, payload.created_by)
      }

      return { success: true, invoice_no: invoiceNo, count: payload.items.length, total_amount: totalAmount }
    })
    return doReturn()
  })

  // Whole-bundle return — Phase 2. Returns a single bundle sale_item from a
  // completed sale: restores each component's lot, marks the original
  // sale_items.is_cancelled=1 (UI shows line-through + voidSale skips its
  // sale_item_lots via the si.is_cancelled=0 filter), and emits an RT- sales
  // row with one negative sale_items + N negative sale_item_lots mirroring
  // the original.
  //
  // Why we DON'T mark the original sale_item_lots is_cancelled=1: report
  // aggregates (reports:salesList total_cost, financeSummary, etc.) filter on
  // sil.is_cancelled=0 to skip refunded lines. If we marked the original sil
  // rows AND inserted negative-qty mirrors on the RT- bill, the bundle's
  // cost would be subtracted twice in any date range spanning both bills.
  // Keeping the original sil intact + negative mirror = net-0 cost from the
  // bundle across both bills (matches "sold then refunded" reality). voidSale
  // uses si.is_cancelled instead to avoid re-restoring already-returned items.
  //
  // Restores to the EXACT SAME LOTS the components came from (sale_item_lots
  // is the authoritative trace) — preserves cost provenance vs. FEFO-restoring
  // to whatever's currently first.
  //
  // Oversold rows (lot_id IS NULL) are SKIPPED for stock restore — there's
  // nothing to restore to. They still get a negative sale_item_lots row so
  // the return-bill total reconciles. Operator note: this is a known
  // limitation also present in voidSale.
  ipcMain.handle('pos:returnBundle', (_e, payload: {
    sale_item_id: number
    reason: string
    created_by: number
    customer_id?: number | null
  }) => {
    if (!payload.reason || !payload.reason.trim()) throw new Error('กรุณาระบุเหตุผลการคืน')
    if (!payload.created_by) throw new Error('ไม่พบผู้ใช้งาน')

    const db = getDb()
    const doReturn = db.transaction(() => {
      // Validate target sale_item is a not-yet-cancelled bundle from a
      // not-yet-voided sale.
      const si = db.prepare(`
        SELECT si.*, s.invoice_no as orig_invoice, s.customer_id as orig_customer, s.status as sale_status,
               p.is_bundle, p.trade_name
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        WHERE si.id = ?
      `).get(payload.sale_item_id) as any
      if (!si) throw new Error('ไม่พบรายการขาย')
      if (si.is_bundle !== 1) throw new Error('รายการนี้ไม่ใช่ชุดสินค้า')
      if (si.is_cancelled === 1) throw new Error('รายการนี้ถูกคืนแล้ว')
      if (si.sale_status === 'voided') throw new Error('บิลนี้ถูกยกเลิกแล้ว — ไม่ต้องคืนชุด')
      // Return-of-a-return guard: an RT- bill's bundle sale_item has qty <= 0
      // (mirror of the original with negated qty). The other checks above pass
      // for it (is_bundle=1 from the product, is_cancelled=0 because it's a
      // fresh row, sale_status='completed' because RT- bills aren't voided),
      // so without this check the handler would proceed and the stock-restore
      // loop would actually DEDUCT stock (UPDATE qty_on_hand += sil.qty where
      // sil.qty is negative).
      if (Number(si.qty) <= 0) throw new Error('รายการนี้เป็นการคืนสินค้าอยู่แล้ว — คืนซ้ำไม่ได้')

      // The original deductions — these are the ground truth for what to
      // restore. Already-cancelled rows are skipped (defensive — should be
      // empty if the is_cancelled checks above held).
      const origLots = db.prepare(`
        SELECT * FROM sale_item_lots
        WHERE sale_item_id = ? AND is_cancelled = 0
      `).all(payload.sale_item_id) as any[]

      // Generate RT-YYYYMMDD-NNN invoice (same pattern as returnItems).
      const today = dayjs().format('YYYYMMDD')
      const countRow = db.prepare(
        `SELECT COUNT(*) as c FROM sales WHERE invoice_no LIKE ?`
      ).get(`RT-${today}-%`) as { c: number }
      const invoiceNo = `RT-${today}-${String(countRow.c + 1).padStart(4, '0')}`

      const customerId = payload.customer_id ?? si.orig_customer ?? walkInCustomerId(db)
      const negTotal = -Math.abs(si.line_total)

      // Negative sales row — same shape as returnItems for daily-stats consistency.
      const saleResult = db.prepare(`
        INSERT INTO sales (invoice_no, sale_type, customer_id, sold_by, sold_at,
          subtotal, total_discount, total_vat, total_amount,
          cash_amount, card_amount, transfer_amount, change_amount,
          note, status)
        VALUES (?, 'return', ?, ?, datetime('now','localtime'),
          ?, 0, 0, ?,
          0, 0, 0, 0,
          ?, 'completed')
      `).run(invoiceNo, customerId, payload.created_by,
        negTotal, negTotal, `คืนชุด ${si.trade_name} จากบิล ${si.orig_invoice}: ${payload.reason}`)
      const saleId = saleResult.lastInsertRowid

      // Negative sale_items — ONE row for the bundle (mirrors the original).
      const itemResult = db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, item_name, unit_name, qty, unit_price, discount, line_total, item_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(saleId, si.product_id, `คืน: ${si.item_name}`, si.unit_name,
        -si.qty, si.unit_price, -si.discount, -si.line_total,
        `คืนจาก ${si.orig_invoice}: ${payload.reason}`)
      const newSaleItemId = itemResult.lastInsertRowid

      // For each original lot row: restore stock, write negative sale_item_lots
      // mirroring it (component product_id, original lot_id), and log a
      // sale_return movement. We deliberately do NOT mark the original
      // sale_item_lots rows is_cancelled=1 — instead, the higher-level
      // sale_items.is_cancelled=1 (set below at line ~478) is what voidSale
      // uses to skip them. This keeps cost-aggregation correct: the original
      // bundle's positive cost and the RT- mirror's negative cost both stay
      // visible, so total_cost across both sales nets to zero for the returned
      // bundle (rather than being subtracted twice as it was before).
      for (const sil of origLots) {
        // Mirror the original row into the new return sale_item with negated qty.
        db.prepare(`
          INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty)
          VALUES (?, ?, ?, ?)
        `).run(newSaleItemId, sil.lot_id, sil.product_id, -sil.qty)

        if (sil.lot_id) {
          const lot = db.prepare(`SELECT * FROM product_lots WHERE id = ?`).get(sil.lot_id) as any
          if (lot) {
            const qtyBefore = lot.qty_on_hand
            const qtyAfter = qtyBefore + sil.qty
            // Restoring stock to a closed lot must reopen it, otherwise FEFO
            // queries (which filter is_closed=0) will hide the restored qty.
            const wasClosed = lot.is_closed === 1
            const setParts = ['qty_on_hand = qty_on_hand + ?']
            const setVals: any[] = [sil.qty]
            if (wasClosed) {
              setParts.push('is_closed = 0', 'closed_at = NULL')
            }
            db.prepare(`UPDATE product_lots SET ${setParts.join(', ')} WHERE id = ?`)
              .run(...setVals, sil.lot_id)
            db.prepare(`
              INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, unit_cost, note, created_by)
              VALUES (?, ?, 'sale_return', 'return', ?, ?, ?, ?, ?, ?, ?)
            `).run(sil.product_id, sil.lot_id, saleId,
              sil.qty, qtyBefore, qtyAfter, lot.cost_price,
              `คืนชุด ${si.trade_name} จาก ${si.orig_invoice}: ${payload.reason}`,
              payload.created_by)
            // Reopening a lot (is_closed 1→0) brings it back into the
            // weighted-avg pool that recomputeAvgCost uses (filter is_closed=0).
            // Without this call, products.cost_price stays at the
            // pre-reopen value until the next unrelated event triggers a
            // recompute — and bundles that depend on this component stay
            // stale too. Pure qty restores on an already-open lot don't
            // change the avg because cost is weighted by qty_received, not
            // qty_on_hand.
            if (wasClosed) {
              recomputeAvgCost(db, sil.product_id)
              propagateCostToBundles(db, sil.product_id)
            }
          }
        }
        // Oversold (lot_id IS NULL): no stock to restore, no movement to log.
      }

      // Mark the original sale_items row cancelled — SaleDetailDialog will
      // render it with line-through styling (matches the existing UI for
      // partially-returned items).
      db.prepare(`UPDATE sale_items SET is_cancelled = 1 WHERE id = ?`).run(payload.sale_item_id)

      return { success: true, invoice_no: invoiceNo, total_amount: negTotal }
    })
    return doReturn()
  })

  // Get daily stats
  ipcMain.handle('pos:getDailyStats', () => {
    const db = getDb()
    const today = dayjs().format('YYYYMMDD')
    return db.prepare(`
      SELECT COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total, MAX(sold_at) as latest
      FROM sales WHERE sold_at >= ? AND sold_at < ? AND status = 'completed'
    `).get(`${today} 00:00:00`, `${today} 23:59:59`)
  })
}
