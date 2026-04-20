import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerReportHandlers() {
  ipcMain.handle('reports:salesList', (_e, filters: {
    q?: string; date_from?: string; date_to?: string
    sort_by?: string; sort_dir?: string; page?: number
  }) => {
    const db = getDb()
    const { q, date_from, date_to, sort_by = 'sold_at', sort_dir = 'DESC', page = 1 } = filters
    const limit = 30; const offset = (page - 1) * limit
    const conditions = [`s.status != 'voided'`]
    const params: any[] = []

    if (q) { conditions.push(`(s.invoice_no LIKE ? OR c.full_name LIKE ? OR s.customer_name_free LIKE ?)`); const lq = `%${q}%`; params.push(lq, lq, lq) }
    if (date_from) { conditions.push(`date(s.sold_at) >= ?`); params.push(date_from) }
    if (date_to) { conditions.push(`date(s.sold_at) <= ?`); params.push(date_to) }

    const where = `WHERE ${conditions.join(' AND ')}`
    const validSorts = ['sold_at', 'invoice_no', 'subtotal', 'total_discount', 'total_amount']
    const sortCol = validSorts.includes(sort_by) ? `s.${sort_by}` : 's.sold_at'
    const sortDirection = sort_dir === 'ASC' ? 'ASC' : 'DESC'

    const rows = db.prepare(`
      SELECT s.*, c.full_name as customer_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${where}
      ORDER BY ${sortCol} ${sortDirection}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(s.subtotal), 0) as total_subtotal,
        COALESCE(SUM(s.total_discount), 0) as total_discount,
        COALESCE(SUM(s.total_amount), 0) as total_amount,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(sil.qty * pl.cost_price), 0)
           FROM sale_items si2
           JOIN sale_item_lots sil ON sil.sale_item_id = si2.id
           JOIN product_lots pl ON pl.id = sil.lot_id
           WHERE si2.sale_id = s.id AND sil.is_cancelled = 0)
        ), 0) as total_cost,
        COUNT(*) as sale_count
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${where}
    `).get(...params) as any

    summary.total_profit = summary.total_amount - summary.total_cost

    const total = (db.prepare(`SELECT COUNT(*) as c FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ${where}`).get(...params) as any).c
    return { rows, summary, total, page, limit }
  })

  ipcMain.handle('reports:getSale', (_e, id: number) => {
    const db = getDb()
    const sale = db.prepare(`
      SELECT s.*, c.full_name as customer_name, u.name as sold_by_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.sold_by
      WHERE s.id = ?
    `).get(id)

    const items = db.prepare(`
      SELECT si.*,
        COALESCE((
          SELECT SUM(sil.qty * pl.cost_price) FROM sale_item_lots sil
          JOIN product_lots pl ON pl.id = sil.lot_id
          WHERE sil.sale_item_id = si.id AND sil.is_cancelled = 0
        ), 0) as item_cost
      FROM sale_items si WHERE si.sale_id = ?
    `).all(id)

    return { ...(sale as any), items }
  })

  ipcMain.handle('reports:voidSale', (_e, id: number, reason: string) => {
    const db = getDb()
    const voidSale = db.transaction(() => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id) as any
      if (!sale || sale.status === 'voided') throw new Error('ไม่สามารถยกเลิกรายการนี้ได้')

      // Restore stock for each lot
      const saleItemLots = db.prepare(`
        SELECT sil.*, si.product_id FROM sale_item_lots sil
        JOIN sale_items si ON si.id = sil.sale_item_id
        WHERE si.sale_id = ? AND sil.is_cancelled = 0 AND sil.lot_id IS NOT NULL
      `).all(id) as any[]

      for (const sil of saleItemLots) {
        const lot = db.prepare(`SELECT * FROM product_lots WHERE id = ?`).get(sil.lot_id) as any
        const qtyBefore = lot.qty_on_hand
        db.prepare(`UPDATE product_lots SET qty_on_hand = qty_on_hand + ? WHERE id = ?`).run(sil.qty, sil.lot_id)
        db.prepare(`UPDATE sale_item_lots SET is_cancelled = 1 WHERE id = ?`).run(sil.id)
        db.prepare(`INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, note)
          VALUES (?, ?, 'sale_return', 'sale', ?, ?, ?, ?, ?)`).run(
          sil.product_id, sil.lot_id, id, sil.qty, qtyBefore, qtyBefore + sil.qty, `ยกเลิกขาย: ${sale.invoice_no}`
        )
      }

      db.prepare(`UPDATE sales SET status = 'voided', void_reason = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(reason, id)
      return true
    })
    return voidSale()
  })

  ipcMain.handle('reports:purchaseList', (_e, filters: {
    q?: string; supplier_id?: number; date_from?: string; date_to?: string; page?: number
  }) => {
    const db = getDb()
    const { q, supplier_id, date_from, date_to, page = 1 } = filters
    const limit = 30; const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: any[] = []

    if (q) { conditions.push(`pl.invoice_no LIKE ?`); params.push(`%${q}%`) }
    if (supplier_id) { conditions.push(`pl.supplier_id = ?`); params.push(supplier_id) }
    if (date_from) { conditions.push(`date(pl.created_at) >= ?`); params.push(date_from) }
    if (date_to) { conditions.push(`date(pl.created_at) <= ?`); params.push(date_to) }

    conditions.push(`pl.invoice_no IS NOT NULL`)
    const where = `WHERE ${conditions.join(' AND ')}`

    const rows = db.prepare(`
      SELECT pl.invoice_no, MAX(pl.created_at) as receive_date, pl.supplier_id,
             s.name as supplier_name, pl.payment_type, MAX(pl.is_paid) as is_paid, pl.due_date,
             COUNT(*) as item_count, SUM(pl.qty_received * pl.cost_price) as total_cost
      FROM product_lots pl
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      ${where}
      GROUP BY pl.invoice_no
      ORDER BY receive_date DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    const total = (db.prepare(`SELECT COUNT(DISTINCT pl.invoice_no) as c FROM product_lots pl ${where}`).get(...params) as any).c
    return { rows, total, page, limit }
  })
}
