import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'

export function registerPurchaseHandlers() {
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
    payment_type: string
    due_date?: string
    is_paid: boolean
    paid_date?: string
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
              payment_type = ?,
              due_date = ?,
              is_paid = ?,
              paid_date = ?,
              updated_at = ?
            WHERE id = ?
          `).run(item.qty, item.qty, avgCost, item.sell_price, payload.supplier_id,
            payload.invoice_no, payload.supplier_invoice_no, payload.payment_type,
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
              invoice_no, supplier_invoice_no, payment_type, due_date, is_paid, paid_date, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(item.product_id, payload.supplier_id, item.lot_number, item.manufactured_date ?? null, item.expiry_date,
            item.cost_price, item.sell_price, item.qty, item.qty,
            payload.invoice_no, payload.supplier_invoice_no, payload.payment_type,
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
    q?: string; supplier_id?: number; date_from?: string; date_to?: string; page?: number
  }) => {
    const db = getDb()
    const { q, supplier_id, date_from, date_to, page = 1 } = filters
    const limit = 20
    const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: any[] = []

    if (q) { conditions.push(`pl.invoice_no LIKE ?`); params.push(`%${q}%`) }
    if (supplier_id) { conditions.push(`pl.supplier_id = ?`); params.push(supplier_id) }
    if (date_from) { conditions.push(`date(pl.created_at) >= ?`); params.push(date_from) }
    if (date_to) { conditions.push(`date(pl.created_at) <= ?`); params.push(date_to) }

    const where = conditions.length ? `WHERE pl.invoice_no IS NOT NULL AND ${conditions.join(' AND ')}` : `WHERE pl.invoice_no IS NOT NULL`

    const rows = db.prepare(`
      SELECT pl.invoice_no, pl.created_at, pl.payment_type, pl.is_paid, pl.due_date,
             s.name as supplier_name,
             COUNT(*) as item_count,
             SUM(pl.qty_received * pl.cost_price) as total_cost
      FROM product_lots pl
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      ${where}
      GROUP BY pl.invoice_no
      ORDER BY pl.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    const total = (db.prepare(`
      SELECT COUNT(DISTINCT pl.invoice_no) as c FROM product_lots pl ${where}
    `).get(...params) as any).c

    return { rows, total, page, limit }
  })

  ipcMain.handle('purchase:getReceipt', (_e, invoice_no: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT pl.*, p.trade_name, p.code as product_code, s.name as supplier_name
      FROM product_lots pl
      JOIN products p ON p.id = pl.product_id
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      WHERE pl.invoice_no = ?
      ORDER BY pl.id
    `).all(invoice_no)
  })
}
