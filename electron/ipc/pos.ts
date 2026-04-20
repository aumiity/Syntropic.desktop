import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'

export function registerPosHandlers() {
  // Search products for POS
  ipcMain.handle('pos:searchProducts', (_e, query: string) => {
    const db = getDb()
    const q = `%${query}%`
    const products = db.prepare(`
      SELECT p.*, c.name as category_name, dt.name_th as drug_type_name,
             df.name_th as dosage_form_name, u.name as unit_name
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN drug_types dt ON dt.id = p.drug_type_id
      LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
      LEFT JOIN item_units u ON u.id = p.unit_id
      WHERE p.is_disabled = 0
        AND (p.trade_name LIKE ? OR p.barcode LIKE ? OR p.barcode2 LIKE ?
             OR p.barcode3 LIKE ? OR p.barcode4 LIKE ?
             OR p.code LIKE ? OR p.search_keywords LIKE ?)
      ORDER BY p.trade_name
      LIMIT 30
    `).all(q, q, q, q, q, q, q)

    for (const prod of products as any[]) {
      prod.lots = db.prepare(`
        SELECT * FROM product_lots
        WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0
        ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC
      `).all(prod.id)

      prod.units = db.prepare(`
        SELECT pu.*, u.name as unit_name FROM product_units pu
        JOIN item_units u ON u.id = pu.unit_id
        WHERE pu.product_id = ? AND pu.is_disabled = 0
          AND (pu.is_for_sale = 1 OR pu.is_base_unit = 1)
        ORDER BY pu.is_base_unit DESC, pu.qty_per_base ASC
      `).all(prod.id)
    }

    return products
  })

  // Search customers
  ipcMain.handle('pos:searchCustomers', (_e, query: string) => {
    const q = `%${query}%`
    return getDb().prepare(`
      SELECT * FROM customers
      WHERE is_hidden = 0
        AND (full_name LIKE ? OR phone LIKE ? OR code LIKE ? OR hn LIKE ?)
      ORDER BY full_name
      LIMIT 20
    `).all(q, q, q, q)
  })

  // Quick-add customer
  ipcMain.handle('pos:addCustomer', (_e, data: { full_name: string; phone?: string }) => {
    const db = getDb()
    const last = db.prepare(`SELECT code FROM customers ORDER BY id DESC LIMIT 1`).get() as any
    let nextNum = 1
    if (last?.code?.startsWith('C')) nextNum = parseInt(last.code.slice(1)) + 1
    const code = `C${String(nextNum).padStart(4, '0')}`
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

    const saveBill = db.transaction(() => {
      // Generate invoice number
      const today = dayjs().format('YYYYMMDD')
      const countRow = db.prepare(`SELECT COUNT(*) as c FROM sales WHERE sold_at >= ? AND sold_at < ?`)
        .get(`${today} 00:00:00`, `${today} 23:59:59`) as { c: number }
      const invoiceNo = `RX-${today}-${String(countRow.c + 1).padStart(4, '0')}`

      const saleResult = db.prepare(`
        INSERT INTO sales (invoice_no, sale_type, customer_id, customer_name_free,
          sold_by, sold_at, subtotal, total_discount, total_amount,
          cash_amount, card_amount, transfer_amount, change_amount,
          symptom_note, age_range, note, status)
        VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(
        invoiceNo, payload.sale_type, payload.customer_id, payload.customer_name_free,
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

        // FEFO stock deduction
        const lots = db.prepare(`
          SELECT * FROM product_lots
          WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0
          ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC
        `).all(item.product_id) as any[]

        let remaining = item.qty
        for (const lot of lots) {
          if (remaining <= 0) break
          const deduct = Math.min(lot.qty_on_hand, remaining)
          const qtyBefore = lot.qty_on_hand
          db.prepare(`UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?`).run(deduct, lot.id)
          db.prepare(`INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty) VALUES (?, ?, ?, ?)`).run(saleItemId, lot.id, item.product_id, deduct)
          db.prepare(`INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, unit_cost, note, created_by)
            VALUES (?, ?, 'sale', 'sale', ?, ?, ?, ?, ?, ?, ?)`).run(
            item.product_id, lot.id, saleId, -deduct, qtyBefore, qtyBefore - deduct, lot.cost_price,
            `ขาย: ${invoiceNo}`, payload.sold_by
          )
          remaining -= deduct
        }

        // Handle oversold (no stock)
        if (remaining > 0) {
          db.prepare(`INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty) VALUES (?, NULL, ?, ?)`).run(saleItemId, item.product_id, remaining)
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
