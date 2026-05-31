import { ipcMain } from 'electron'
import { getDb } from '../db'
import { walkInCustomerId, WALKIN_CUSTOMER_CODE } from './codes'
import { orderByBucket } from '../db/sortName'
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
        ${orderByBucket('p.trade_name')}
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
      ORDER BY ${orderByBucket('full_name')}
      LIMIT 20
    `).all(q, q, q)
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
      unit_vat?: number
      line_total: number
      item_note?: string
    }>
    subtotal: number
    total_discount: number
    total_vat?: number
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
          sold_by, sold_at, subtotal, total_discount, total_vat, total_amount,
          cash_amount, card_amount, transfer_amount, change_amount,
          symptom_note, age_range, note, status)
        VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(
        invoiceNo, payload.sale_type, customerId, payload.customer_name_free,
        payload.sold_by, payload.subtotal, payload.total_discount, payload.total_vat ?? 0, payload.total_amount,
        payload.cash_amount, payload.card_amount, payload.transfer_amount, payload.change_amount,
        payload.symptom_note ?? '', payload.age_range ?? '', payload.note ?? ''
      )
      const saleId = saleResult.lastInsertRowid

      for (const item of payload.items) {
        const itemResult = db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, item_name, unit_name, qty, unit_price, discount, unit_vat, line_total, item_note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(saleId, item.product_id, item.item_name, item.unit_name, item.qty, item.unit_price, item.discount, item.unit_vat ?? 0, item.line_total, item.item_note ?? '')
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

      // Daily summary — sold_at is stored as 'YYYY-MM-DD HH:MM:SS', so the
      // range must use the dashed date (NOT `today`, which is 'YYYYMMDD' for
      // invoice numbering — string-comparing it against sold_at excludes every
      // row because '-' < '0').
      const dateStr = dayjs().format('YYYY-MM-DD')
      const dailySummary = db.prepare(`
        SELECT COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total,
               MAX(sold_at) as latest
        FROM sales WHERE sold_at >= ? AND sold_at < ? AND status = 'completed'
      `).get(`${dateStr} 00:00:00`, `${dateStr} 23:59:59`) as any

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

  // Get daily stats
  ipcMain.handle('pos:getDailyStats', () => {
    const db = getDb()
    // sold_at is 'YYYY-MM-DD HH:MM:SS' — must match that format in the range,
    // not 'YYYYMMDD' (string-comparing the latter excludes every row).
    const dateStr = dayjs().format('YYYY-MM-DD')
    return db.prepare(`
      SELECT COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total, MAX(sold_at) as latest
      FROM sales WHERE sold_at >= ? AND sold_at < ? AND status = 'completed'
    `).get(`${dateStr} 00:00:00`, `${dateStr} 23:59:59`)
  })
}
