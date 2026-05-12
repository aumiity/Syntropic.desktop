import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'

export function registerPurchaseHandlers() {
  const db = getDb()

  // Migrations (safe to call repeatedly)
  for (const sql of [
    `ALTER TABLE purchase_receipts ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_receipts ADD COLUMN surcharge_amount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_receipts ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`,
    `ALTER TABLE purchase_receipts ADD COLUMN cancelled_at TEXT`,
    `ALTER TABLE purchase_receipts ADD COLUMN cancelled_by INTEGER`,
    `ALTER TABLE purchase_receipts ADD COLUMN cancel_reason TEXT`,
    `ALTER TABLE purchase_receipts ADD COLUMN supplier_id INTEGER`,
    `ALTER TABLE purchase_receipts ADD COLUMN supplier_invoice_no TEXT`,
    `ALTER TABLE purchase_receipts ADD COLUMN order_date TEXT`,
    `ALTER TABLE purchase_receipts ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'cash'`,
    `ALTER TABLE purchase_receipts ADD COLUMN due_date TEXT`,
    `ALTER TABLE purchase_receipts ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_receipts ADD COLUMN paid_date TEXT`,
    `ALTER TABLE product_lots ADD COLUMN order_date TEXT`,
    `CREATE TABLE IF NOT EXISTS purchase_receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      lot_id INTEGER REFERENCES product_lots(id),
      lot_number TEXT NOT NULL,
      manufactured_date TEXT,
      expiry_date TEXT,
      cost_price REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      qty REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pri_invoice ON purchase_receipt_items(invoice_no)`,
    `CREATE INDEX IF NOT EXISTS idx_pri_lot ON purchase_receipt_items(lot_id)`,
  ]) { try { db.exec(sql) } catch {} }

  // One-time backfill of purchase_receipt_items from existing product_lots.
  // Best-effort: for each lot with an invoice_no, create a single line using
  // current qty_received as the contribution. GRs that were overwritten by
  // later top-ups (the lot-merge bug) cannot be recovered; only the most
  // recent invoice_no on each lot survives in product_lots.
  const itemsBackfillNeeded = (db.prepare(`SELECT COUNT(*) as c FROM purchase_receipt_items`).get() as any).c === 0
  if (itemsBackfillNeeded) {
    db.exec(`
      INSERT INTO purchase_receipt_items
        (invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date,
         cost_price, sell_price, qty, note, created_at)
      SELECT pl.invoice_no, pl.product_id, pl.id, pl.lot_number, pl.manufactured_date, pl.expiry_date,
             pl.cost_price, pl.sell_price, pl.qty_received, pl.note, COALESCE(pl.created_at, datetime('now','localtime'))
      FROM product_lots pl
      WHERE pl.invoice_no IS NOT NULL AND pl.invoice_no <> ''
    `)
  }

  // Backfill purchase_receipts header metadata (supplier/payment/dates) from
  // any matching product_lots row, only for receipts where these fields are
  // still empty (idempotent on re-runs).
  db.exec(`
    UPDATE purchase_receipts
    SET supplier_id        = COALESCE(supplier_id,        (SELECT pl.supplier_id        FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1)),
        supplier_invoice_no= COALESCE(supplier_invoice_no,(SELECT pl.supplier_invoice_no FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1)),
        order_date         = COALESCE(order_date,         (SELECT pl.order_date         FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1)),
        payment_type       = COALESCE(NULLIF(payment_type,''), (SELECT pl.payment_type FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1), 'cash'),
        due_date           = COALESCE(due_date,           (SELECT pl.due_date           FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1)),
        is_paid            = COALESCE(NULLIF(is_paid, 0), (SELECT pl.is_paid           FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1), 0),
        paid_date          = COALESCE(paid_date,          (SELECT pl.paid_date          FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1))
    WHERE supplier_id IS NULL OR supplier_invoice_no IS NULL OR order_date IS NULL
  `)

  ipcMain.handle('purchase:nextGRNumber', () => {
    const db = getDb()
    const today = dayjs().format('YYYYMMDD')
    const count = (db.prepare(`
      SELECT COUNT(DISTINCT invoice_no) as c FROM purchase_receipts
      WHERE invoice_no LIKE ?
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
      // Header is the authoritative source for GR-level metadata
      db.prepare(`INSERT OR REPLACE INTO purchase_receipts
        (invoice_no, supplier_id, supplier_invoice_no, order_date,
         payment_type, due_date, is_paid, paid_date,
         note, discount_amount, surcharge_amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`)
        .run(payload.invoice_no, payload.supplier_id, payload.supplier_invoice_no,
             payload.order_date ?? null,
             payload.payment_type, payload.due_date ?? null,
             payload.is_paid ? 1 : 0, payload.paid_date ?? null,
             payload.note ?? '',
             payload.discount_amount ?? 0, payload.surcharge_amount ?? 0,
             payload.receive_date)

      for (const item of payload.items) {
        const existing = db.prepare(`SELECT * FROM product_lots WHERE product_id = ? AND lot_number = ?`).get(item.product_id, item.lot_number) as any

        let lotId: number
        let qtyBefore = 0

        if (existing) {
          const totalQty = existing.qty_received + item.qty
          const avgCost = (existing.qty_received * existing.cost_price + item.qty * item.cost_price) / totalQty
          qtyBefore = existing.qty_on_hand
          lotId = existing.id
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
          lotId = Number(lotResult.lastInsertRowid)
        }

        db.prepare(`
          INSERT INTO purchase_receipt_items
            (invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date,
             cost_price, sell_price, qty, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(payload.invoice_no, item.product_id, lotId, item.lot_number,
          item.manufactured_date ?? null, item.expiry_date,
          item.cost_price, item.sell_price, item.qty, item.note ?? null,
          payload.receive_date)

        db.prepare(`INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)
          VALUES (?, ?, 'receive', 'stock_receive', ?, ?, ?, ?, ?, ?, ?)`).run(
          item.product_id, lotId, item.qty, qtyBefore, qtyBefore + item.qty,
          item.cost_price, `รับสินค้า: ${payload.invoice_no}`, payload.userId, payload.receive_date
        )

        db.prepare(`UPDATE products SET price_retail = ?, cost_price = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
          .run(item.sell_price, item.cost_price, item.product_id)
      }
      return { success: true, invoice_no: payload.invoice_no }
    })
    return save()
  })

  ipcMain.handle('purchase:history', (_e, filters: {
    q?: string; supplier_id?: number; date_from?: string; date_to?: string;
    page?: number; payment_type?: string; status?: 'completed' | 'cancelled' | 'all'
  }) => {
    const db = getDb()
    const { q, supplier_id, date_from, date_to, payment_type, page = 1, status = 'all' } = filters
    const limit = 20
    const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: any[] = []

    if (q) { conditions.push(`(pr.invoice_no LIKE ? OR pr.supplier_invoice_no LIKE ?)`); params.push(`%${q}%`, `%${q}%`) }
    if (date_from) { conditions.push(`date(pr.created_at) >= ?`); params.push(date_from) }
    if (date_to) { conditions.push(`date(pr.created_at) <= ?`); params.push(date_to) }
    if (supplier_id) { conditions.push(`pr.supplier_id = ?`); params.push(supplier_id) }

    const baseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ``

    // Summary uses base filters only (no payment_type / status chip), excludes cancelled
    const summary = (db.prepare(`
      SELECT
        COUNT(DISTINCT pr.invoice_no) as count,
        COALESCE(SUM(CASE WHEN pr.status = 'completed' THEN pri.qty * pri.cost_price ELSE 0 END), 0) as total_cost,
        COALESCE(SUM(CASE WHEN pr.status = 'completed' AND pr.payment_type = 'credit' AND pr.is_paid = 0
                         THEN pri.qty * pri.cost_price ELSE 0 END), 0) as unpaid_cost
      FROM purchase_receipts pr
      LEFT JOIN purchase_receipt_items pri ON pri.invoice_no = pr.invoice_no
      ${baseWhere}
    `).get(...params) as any)

    const rowConditions = [...conditions]
    const rowParams = [...params]
    if (payment_type) { rowConditions.push(`pr.payment_type = ?`); rowParams.push(payment_type) }
    if (status === 'completed') { rowConditions.push(`COALESCE(pr.status,'completed') = 'completed'`) }
    else if (status === 'cancelled') { rowConditions.push(`pr.status = 'cancelled'`) }

    const rowWhere = rowConditions.length ? `WHERE ${rowConditions.join(' AND ')}` : ``

    const rows = db.prepare(`
      SELECT pr.invoice_no,
             pr.created_at,
             COALESCE(pr.status,'completed') as status,
             pr.cancelled_at, pr.cancel_reason,
             pr.payment_type, pr.is_paid, pr.due_date,
             s.name as supplier_name,
             COALESCE((SELECT COUNT(*) FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no), 0) as item_count,
             COALESCE((SELECT SUM(pri.qty * pri.cost_price) FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no), 0) as total_cost
      FROM purchase_receipts pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      ${rowWhere}
      ORDER BY pr.created_at DESC, pr.invoice_no DESC
      LIMIT ? OFFSET ?
    `).all(...rowParams, limit, offset)

    const total = (db.prepare(`
      SELECT COUNT(DISTINCT pr.invoice_no) as c
      FROM purchase_receipts pr
      ${rowWhere}
    `).get(...rowParams) as any).c

    return {
      rows, total, page, limit,
      summary: { count: summary.count, total_cost: summary.total_cost, unpaid_cost: summary.unpaid_cost }
    }
  })

  ipcMain.handle('purchase:getReceipt', (_e, invoice_no: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT pri.id, pri.invoice_no, pri.product_id, pri.lot_id, pri.lot_number,
             pri.manufactured_date, pri.expiry_date,
             pri.cost_price, pri.sell_price,
             pri.qty as qty_received, pri.note,
             pri.created_at,
             p.trade_name, p.code as product_code,
             iu.name as unit_name,
             pr.supplier_id, pr.supplier_invoice_no, pr.order_date,
             pr.payment_type, pr.due_date, pr.is_paid, pr.paid_date,
             s.name as supplier_name,
             pr.discount_amount, pr.surcharge_amount,
             COALESCE(pr.status,'completed') as status,
             pr.cancelled_at, pr.cancel_reason
      FROM purchase_receipt_items pri
      JOIN products p ON p.id = pri.product_id
      LEFT JOIN item_units iu ON iu.id = p.unit_id
      LEFT JOIN purchase_receipts pr ON pr.invoice_no = pri.invoice_no
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      WHERE pri.invoice_no = ?
      ORDER BY pri.id
    `).all(invoice_no)
  })

  ipcMain.handle('purchase:updateHeader', (_e, payload: {
    invoice_no: string
    supplier_id: number
    supplier_invoice_no: string
    order_date?: string
    receive_date: string
    payment_type: 'cash' | 'credit'
    due_date?: string
    is_paid: boolean
    paid_date?: string
    userId: number
  }) => {
    const db = getDb()
    const header = db.prepare(`SELECT status FROM purchase_receipts WHERE invoice_no = ?`).get(payload.invoice_no) as any
    if (!header) return { success: false, error: 'not_found' }
    if (header.status === 'cancelled') return { success: false, error: 'cancelled' }

    if (!payload.supplier_id) return { success: false, error: 'supplier_required' }
    if (!payload.supplier_invoice_no?.trim()) return { success: false, error: 'supplier_invoice_required' }
    if (!payload.receive_date) return { success: false, error: 'receive_date_required' }
    if (payload.payment_type === 'credit' && !payload.due_date) return { success: false, error: 'due_date_required' }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE purchase_receipts SET
          supplier_id = ?,
          supplier_invoice_no = ?,
          order_date = ?,
          payment_type = ?,
          due_date = ?,
          is_paid = ?,
          paid_date = ?,
          created_at = ?
        WHERE invoice_no = ?
      `).run(
        payload.supplier_id,
        payload.supplier_invoice_no.trim(),
        payload.order_date ?? null,
        payload.payment_type,
        payload.payment_type === 'credit' ? (payload.due_date ?? null) : null,
        payload.is_paid ? 1 : 0,
        payload.is_paid ? (payload.paid_date ?? null) : null,
        payload.receive_date,
        payload.invoice_no,
      )

      // Keep receive_date in sync on the per-line ledger so detail panel shows it consistently
      db.prepare(`UPDATE purchase_receipt_items SET created_at = ? WHERE invoice_no = ?`)
        .run(payload.receive_date, payload.invoice_no)
    })
    tx()
    return { success: true }
  })

  ipcMain.handle('purchase:cancel', (_e, payload: { invoice_no: string; reason: string; userId: number }) => {
    const db = getDb()
    const reason = (payload.reason ?? '').trim()
    if (!reason) return { success: false, error: 'reason_required' }

    const header = db.prepare(`SELECT status FROM purchase_receipts WHERE invoice_no = ?`).get(payload.invoice_no) as any
    if (!header) return { success: false, error: 'not_found' }
    if (header.status === 'cancelled') return { success: false, error: 'already_cancelled' }

    const lines = db.prepare(`SELECT * FROM purchase_receipt_items WHERE invoice_no = ?`).all(payload.invoice_no) as any[]
    if (lines.length === 0) return { success: false, error: 'no_lines' }

    const blockers: { product_id: number; lot_id: number | null; lot_number: string; need: number; have: number }[] = []
    for (const line of lines) {
      if (!line.lot_id) {
        blockers.push({ product_id: line.product_id, lot_id: null, lot_number: line.lot_number, need: line.qty, have: 0 })
        continue
      }
      const lot = db.prepare(`SELECT id, qty_on_hand, qty_received FROM product_lots WHERE id = ?`).get(line.lot_id) as any
      if (!lot) {
        blockers.push({ product_id: line.product_id, lot_id: line.lot_id, lot_number: line.lot_number, need: line.qty, have: 0 })
        continue
      }
      if (lot.qty_on_hand < line.qty - 1e-9) {
        blockers.push({ product_id: line.product_id, lot_id: line.lot_id, lot_number: line.lot_number, need: line.qty, have: lot.qty_on_hand })
      }
    }
    if (blockers.length > 0) {
      const detailed = db.prepare(`
        SELECT b.product_id, b.lot_number, b.need, b.have, p.trade_name, p.code as product_code
        FROM (SELECT ? as product_id, ? as lot_number, ? as need, ? as have) b
        JOIN products p ON p.id = b.product_id
      `)
      const enriched = blockers.map(b => detailed.get(b.product_id, b.lot_number, b.need, b.have)) as any[]
      return { success: false, error: 'stock_consumed', blockers: enriched }
    }

    const cancel = db.transaction(() => {
      for (const line of lines) {
        if (!line.lot_id) continue
        const lot = db.prepare(`SELECT qty_on_hand, qty_received FROM product_lots WHERE id = ?`).get(line.lot_id) as any
        const qtyBefore = lot.qty_on_hand
        const qtyAfter = qtyBefore - line.qty
        const newReceived = lot.qty_received - line.qty

        db.prepare(`
          UPDATE product_lots SET
            qty_on_hand = ?,
            qty_received = ?,
            is_closed = CASE WHEN ? <= 0 THEN 1 ELSE is_closed END,
            closed_at  = CASE WHEN ? <= 0 THEN datetime('now','localtime') ELSE closed_at END,
            updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(qtyAfter, newReceived, newReceived, newReceived, line.lot_id)

        db.prepare(`
          INSERT INTO stock_movements
            (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)
          VALUES (?, ?, 'purchase_return', 'gr_cancel', ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
        `).run(line.product_id, line.lot_id, line.id, -line.qty, qtyBefore, qtyAfter,
               line.cost_price, `ยกเลิกบิล: ${payload.invoice_no} — ${reason}`, payload.userId)
      }

      const productIds = Array.from(new Set(lines.map(l => l.product_id)))
      for (const pid of productIds) {
        const agg = db.prepare(`
          SELECT
            COALESCE(SUM(qty_received * cost_price), 0) as cost_sum,
            COALESCE(SUM(qty_received), 0) as qty_sum
          FROM product_lots
          WHERE product_id = ? AND qty_received > 0 AND is_closed = 0
        `).get(pid) as any
        if (agg.qty_sum > 0) {
          db.prepare(`UPDATE products SET cost_price = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
            .run(agg.cost_sum / agg.qty_sum, pid)
        }
      }

      db.prepare(`
        UPDATE purchase_receipts SET
          status = 'cancelled',
          cancelled_at = datetime('now','localtime'),
          cancelled_by = ?,
          cancel_reason = ?
        WHERE invoice_no = ?
      `).run(payload.userId, reason, payload.invoice_no)
    })
    cancel()
    return { success: true }
  })
}
