import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'

export function registerPurchaseHandlers() {
  // Ensure new columns exist (safe to call multiple times)
  const db = getDb()
  for (const sql of [
    `ALTER TABLE purchase_receipts ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_receipts ADD COLUMN surcharge_amount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE product_lots ADD COLUMN order_date TEXT`,
  ]) { try { db.exec(sql) } catch {} }

  ipcMain.handle('purchase:nextGRNumber', () => {
    const db = getDb()
    const today = dayjs().format('YYYYMMDD')
    const count = (db.prepare(`
      SELECT COUNT(DISTINCT invoice_no) as c FROM product_lots
      WHERE invoice_no LIKE ? AND invoice_no LIKE 'GR-%'
    `).get(`GR-${today}%`) as any).c
    return `GR-${today}-${String(count + 1).padStart(4, '0')}`
  })

  ipcMain.handle('purchase:save', (_e, payload: {
    invoice_no: string
    supplier_id: number
    supplier_invoice_no: string
    receive_date: string
    order_date?: string
    payment_type: string
    due_date?: string
    is_paid: boolean
    paid_date?: string
    note?: string
    discount_amount?: number
    surcharge_amount?: number
    items: Array<{
      product_id: number
      lot_number: string
      manufactured_date?: string
      expiry_date: string
      cost_price: number
      sell_price: number
      qty: number
      note?: string
    }>
    userId: number
  }) => {
    const db = getDb()
    const save = db.transaction(() => {
      db.prepare(`INSERT OR REPLACE INTO purchase_receipts (invoice_no, note, discount_amount, surcharge_amount, created_at) VALUES (?, ?, ?, ?, datetime('now','localtime'))`)
        .run(payload.invoice_no, payload.note ?? '', payload.discount_amount ?? 0, payload.surcharge_amount ?? 0)

      for (const item of payload.items) {
        const existing = db.prepare(`SELECT * FROM product_lots WHERE product_id = ? AND lot_number = ?`).get(item.product_id, item.lot_number) as any

        if (existing) {
          // Weighted average cost
          const totalQty = existing.qty_received + item.qty
          const avgCost = (existing.qty_received * existing.cost_price + item.qty * item.cost_price) / totalQty
          const qtyBefore = existing.qty_on_hand
          db.prepare(`
            UPDATE product_lots SET
              qty_received = qty_received + ?,
              qty_on_hand = qty_on_hand + ?,
              cost_price = ?,
              sell_price = ?,
              supplier_id = ?,
              invoice_no = ?,
              supplier_invoice_no = ?,
              order_date = ?,
              payment_type = ?,
              due_date = ?,
              is_paid = ?,
              paid_date = ?,
              updated_at = ?
            WHERE id = ?
          `).run(item.qty, item.qty, avgCost, item.sell_price, payload.supplier_id,
            payload.invoice_no, payload.supplier_invoice_no, payload.order_date ?? null,
            payload.payment_type,
            payload.due_date ?? null, payload.is_paid ? 1 : 0, payload.paid_date ?? null,
            payload.receive_date, existing.id)

          db.prepare(`INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)
            VALUES (?, ?, 'receive', 'stock_receive', ?, ?, ?, ?, ?, ?, ?)`).run(
            item.product_id, existing.id, item.qty, qtyBefore, qtyBefore + item.qty,
            item.cost_price, `รับสินค้า: ${payload.invoice_no}`, payload.userId, payload.receive_date
          )
        } else {
          const lotResult = db.prepare(`
            INSERT INTO product_lots (product_id, supplier_id, lot_number, manufactured_date, expiry_date,
              cost_price, sell_price, qty_received, qty_on_hand,
              invoice_no, supplier_invoice_no, order_date, payment_type, due_date, is_paid, paid_date, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(item.product_id, payload.supplier_id, item.lot_number, item.manufactured_date ?? null, item.expiry_date,
            item.cost_price, item.sell_price, item.qty, item.qty,
            payload.invoice_no, payload.supplier_invoice_no, payload.order_date ?? null,
            payload.payment_type,
            payload.due_date ?? null, payload.is_paid ? 1 : 0, payload.paid_date ?? null, item.note ?? '',
            payload.receive_date, payload.receive_date)

          db.prepare(`INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)
            VALUES (?, ?, 'receive', 'stock_receive', ?, 0, ?, ?, ?, ?, ?)`).run(
            item.product_id, lotResult.lastInsertRowid, item.qty, item.qty,
            item.cost_price, `รับสินค้า: ${payload.invoice_no}`, payload.userId, payload.receive_date
          )
        }

        // Update product prices
        db.prepare(`UPDATE products SET price_retail = ?, cost_price = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
          .run(item.sell_price, item.cost_price, item.product_id)
      }
      return { success: true, invoice_no: payload.invoice_no }
    })
    return save()
  })

  ipcMain.handle('purchase:history', (_e, filters: {
    q?: string; supplier_id?: number; date_from?: string; date_to?: string; page?: number; payment_type?: string
  }) => {
    const db = getDb()
    const { q, supplier_id, date_from, date_to, payment_type, page = 1 } = filters
    const limit = 20
    const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: any[] = []

    if (q) { conditions.push(`(pl.invoice_no LIKE ? OR pl.supplier_invoice_no LIKE ?)`); params.push(`%${q}%`, `%${q}%`) }
    if (supplier_id) { conditions.push(`pl.supplier_id = ?`); params.push(supplier_id) }
    if (date_from) { conditions.push(`date(pl.created_at) >= ?`); params.push(date_from) }
    if (date_to) { conditions.push(`date(pl.created_at) <= ?`); params.push(date_to) }

    const baseWhere = conditions.length
      ? `WHERE pl.invoice_no IS NOT NULL AND ${conditions.join(' AND ')}`
      : `WHERE pl.invoice_no IS NOT NULL`

    // Summary always uses base filters only (no payment_type chip)
    const summary = (db.prepare(`
      SELECT
        COUNT(DISTINCT pl.invoice_no) as count,
        COALESCE(SUM(pl.qty_received * pl.cost_price), 0) as total_cost,
        COALESCE(SUM(CASE WHEN pl.payment_type = 'credit' AND pl.is_paid = 0
                         THEN pl.qty_received * pl.cost_price ELSE 0 END), 0) as unpaid_cost
      FROM product_lots pl
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      ${baseWhere}
    `).get(...params) as any)

    // Row query adds optional payment_type filter
    const rowConditions = [...conditions]
    const rowParams = [...params]
    if (payment_type) { rowConditions.push(`pl.payment_type = ?`); rowParams.push(payment_type) }
    const rowWhere = rowConditions.length
      ? `WHERE pl.invoice_no IS NOT NULL AND ${rowConditions.join(' AND ')}`
      : `WHERE pl.invoice_no IS NOT NULL`

    const rows = db.prepare(`
      SELECT pl.invoice_no, pl.created_at, pl.payment_type, pl.is_paid, pl.due_date,
             s.name as supplier_name,
             COUNT(*) as item_count,
             SUM(pl.qty_received * pl.cost_price) as total_cost
      FROM product_lots pl
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      ${rowWhere}
      GROUP BY pl.invoice_no
      ORDER BY pl.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...rowParams, limit, offset)

    const total = (db.prepare(`
      SELECT COUNT(DISTINCT pl.invoice_no) as c FROM product_lots pl ${rowWhere}
    `).get(...rowParams) as any).c

    return {
      rows, total, page, limit,
      summary: { count: summary.count, total_cost: summary.total_cost, unpaid_cost: summary.unpaid_cost }
    }
  })

  ipcMain.handle('purchase:getReceipt', (_e, invoice_no: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT pl.*, p.trade_name, p.code as product_code, iu.name as unit_name,
             s.name as supplier_name,
             pr.discount_amount, pr.surcharge_amount
      FROM product_lots pl
      JOIN products p ON p.id = pl.product_id
      LEFT JOIN item_units iu ON iu.id = p.unit_id
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      LEFT JOIN purchase_receipts pr ON pr.invoice_no = pl.invoice_no
      WHERE pl.invoice_no = ?
      ORDER BY pl.id
    `).all(invoice_no)
  })
}
