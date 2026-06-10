import { ipcMain } from 'electron'
import { getDb } from '../db'
import { assertNotBundle, recomputeAvgCost, propagateCostToBundles } from '../db/pricing'
import dayjs from 'dayjs'
import { requireAdmin, type Override } from '../auth/session'

export function registerPurchaseHandlers() {
  const db = getDb()

  // Migrations (safe to call repeatedly)
  for (const sql of [
    `ALTER TABLE purchase_receipts ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_receipts ADD COLUMN surcharge_amount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_receipts ADD COLUMN vat_mode TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE purchase_receipts ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_receipts ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0`,
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
    vat_mode?: 'none' | 'inclusive' | 'exclusive'
    vat_rate?: number
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

    // Input VAT (ภาษีซื้อ) — declared PER BILL because not every supplier is
    // VAT-registered. Only a VAT-registered shop can claim input VAT, so a
    // NO-VAT shop is forced to 'none' here regardless of payload (everything
    // it pays IS cost). The VAT base is the line sum as sent — the renderer
    // already distributes bill discount/surcharge into the line totals.
    const shopVatEnabled = ((db.prepare(`SELECT vat_enabled FROM sales_settings LIMIT 1`).get() as any)?.vat_enabled ?? 0) === 1
    const vatMode: 'none' | 'inclusive' | 'exclusive' =
      shopVatEnabled && (payload.vat_mode === 'inclusive' || payload.vat_mode === 'exclusive')
        ? payload.vat_mode : 'none'
    const vatRate = vatMode === 'none' ? 0 : (Number(payload.vat_rate) > 0 ? Number(payload.vat_rate) : 7)
    const lineSum = payload.items.reduce((s, it) => s + it.qty * it.cost_price, 0)
    const vatAmount = vatMode === 'inclusive' ? lineSum * vatRate / (100 + vatRate)
      : vatMode === 'exclusive' ? lineSum * vatRate / 100
      : 0
    // Claimable VAT is not cost: for VAT-inclusive bills the cost model
    // (product_lots, weighted avg, stock_movements, last_cost_price) stores
    // the ex-VAT cost. The purchase_receipt_items ledger keeps the entered
    // cost untouched — document fidelity with the supplier invoice. For
    // 'exclusive' bills the entered prices are already ex-VAT.
    const costFactor = vatMode === 'inclusive' ? 100 / (100 + vatRate) : 1

    const save = db.transaction(() => {
      // Header is the authoritative source for GR-level metadata
      db.prepare(`INSERT OR REPLACE INTO purchase_receipts
        (invoice_no, supplier_id, supplier_invoice_no, order_date,
         payment_type, due_date, is_paid, paid_date,
         note, discount_amount, surcharge_amount,
         vat_mode, vat_rate, vat_amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`)
        .run(payload.invoice_no, payload.supplier_id, payload.supplier_invoice_no,
             payload.order_date ?? null,
             payload.payment_type, payload.due_date ?? null,
             payload.is_paid ? 1 : 0, payload.paid_date ?? null,
             payload.note ?? '',
             payload.discount_amount ?? 0, payload.surcharge_amount ?? 0,
             vatMode, vatRate, vatAmount,
             payload.receive_date)

      for (const item of payload.items) {
        // Bundles have no own lots — block GR'ing a bundle. UI hides them via
        // pos:searchProducts result filtering, but Purchase/PurchaseIntake call
        // searchProducts without an is_bundle filter so this is the only
        // backstop. assertNotBundle throws inside the transaction → rollback.
        assertNotBundle(db, item.product_id)

        // Cost-model cost (ex-VAT for inclusive bills) — see costFactor above.
        const costEx = item.cost_price * costFactor

        const existing = db.prepare(`SELECT * FROM product_lots WHERE product_id = ? AND lot_number = ?`).get(item.product_id, item.lot_number) as any

        let lotId: number
        let qtyBefore = 0

        if (existing) {
          const totalQty = existing.qty_received + item.qty
          const avgCost = (existing.qty_received * existing.cost_price + item.qty * costEx) / totalQty
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
            costEx, item.sell_price, item.qty, item.qty,
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
          costEx, `รับสินค้า: ${payload.invoice_no}`, payload.userId, payload.receive_date
        )

        db.prepare(`UPDATE products SET price_retail = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
          .run(item.sell_price, item.product_id)

        // last_cost_price = the last cost we actually PAID (display-only).
        // Skip when receiving free goods (cost 0) so a freebie doesn't wipe
        // the real prior cost — the scalar naturally tracks the latest
        // non-zero cost. Stays 0 only for products never paid for (new, or
        // only ever received free). cost_price is NOT touched here — it's
        // recomputed as a weighted average below.
        if (costEx > 0) {
          db.prepare(`UPDATE products SET last_cost_price = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
            .run(costEx, item.product_id)
        }
      }

      // Recompute products.cost_price as the weighted average of open lots,
      // then fan out to any bundle that uses these products as components.
      const affectedIds = Array.from(new Set(payload.items.map(i => i.product_id)))
      for (const pid of affectedIds) {
        recomputeAvgCost(db, pid)
        propagateCostToBundles(db, pid)
      }

      // Surface negative-stock markers that the just-received product(s) now
      // make eligible for retroactive deduction. The renderer uses this to
      // toast the operator + refresh the sidebar badge.
      // Build the IN-list dynamically — better-sqlite3 has no array binding.
      const placeholders = affectedIds.map(() => '?').join(',')
      const negativeStockAlerts = affectedIds.length === 0 ? [] : db.prepare(`
        SELECT sil.product_id,
               p.trade_name,
               COUNT(*)                 AS marker_count,
               COALESCE(SUM(sil.qty),0) AS total_qty
          FROM sale_item_lots sil
          JOIN sale_items si ON si.id = sil.sale_item_id
          JOIN sales      s  ON s.id  = si.sale_id
          JOIN products   p  ON p.id  = sil.product_id
         WHERE sil.lot_id      IS NULL
           AND sil.is_cancelled = 0
           AND si.is_cancelled  = 0
           AND s.status         = 'completed'
           AND sil.product_id IN (${placeholders})
         GROUP BY sil.product_id, p.trade_name
      `).all(...affectedIds)

      return {
        success: true,
        invoice_no: payload.invoice_no,
        negative_stock_alerts: negativeStockAlerts,
      }
    })
    return save()
  })

  ipcMain.handle('purchase:history', (_e, filters: {
    q?: string; supplier_id?: number; date_from?: string; date_to?: string;
    page?: number; limit?: number | 'all'; payment_type?: string; status?: 'completed' | 'cancelled' | 'all';
    sort_by?: 'created_at' | 'invoice_no' | 'total_cost'; sort_dir?: 'ASC' | 'DESC'
  }) => {
    const db = getDb()
    const { q, supplier_id, date_from, date_to, payment_type, page = 1, limit: limitOpt, status = 'all', sort_by, sort_dir } = filters
    // Whitelist sort fields to keep ORDER BY injection-proof.
    const SORT_COLS: Record<string, string> = {
      created_at: 'pr.created_at',
      invoice_no: 'pr.invoice_no',
      total_cost: 'total_cost',
    }
    const sortCol = sort_by && SORT_COLS[sort_by] ? SORT_COLS[sort_by] : 'pr.created_at'
    const sortDir = sort_dir === 'ASC' ? 'ASC' : 'DESC'
    const limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 20)
    const offset = limit ? (page - 1) * limit : 0
    const conditions: string[] = []
    const params: any[] = []

    if (q) { conditions.push(`(pr.invoice_no LIKE ? OR pr.supplier_invoice_no LIKE ?)`); params.push(`%${q}%`, `%${q}%`) }
    if (date_from) { conditions.push(`date(pr.created_at) >= ?`); params.push(date_from) }
    if (date_to) { conditions.push(`date(pr.created_at) <= ?`); params.push(date_to) }
    if (supplier_id) { conditions.push(`pr.supplier_id = ?`); params.push(supplier_id) }

    const baseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ``

    // Summary uses base filters only (no payment_type / status chip). These are
    // receipt COUNTS per status — no finance figures (kept to a restricted
    // finance page). The cash/credit/unpaid counts exclude cancelled so each
    // card's number matches the rows shown when its filter is clicked.
    const NOT_CANCELLED = `COALESCE(pr.status,'completed') != 'cancelled'`
    const summary = (db.prepare(`
      SELECT
        COUNT(DISTINCT pr.invoice_no) as count,
        COUNT(DISTINCT CASE WHEN ${NOT_CANCELLED} AND pr.payment_type = 'cash'   THEN pr.invoice_no END) as cash_count,
        COUNT(DISTINCT CASE WHEN ${NOT_CANCELLED} AND pr.payment_type = 'credit' THEN pr.invoice_no END) as credit_count,
        COUNT(DISTINCT CASE WHEN ${NOT_CANCELLED} AND pr.payment_type = 'credit' AND pr.is_paid = 0 THEN pr.invoice_no END) as unpaid_count,
        COUNT(DISTINCT CASE WHEN pr.status = 'cancelled' THEN pr.invoice_no END) as cancelled_count
      FROM purchase_receipts pr
      ${baseWhere}
    `).get(...params) as any)

    const rowConditions = [...conditions]
    const rowParams = [...params]
    if (payment_type === 'unpaid') {
      rowConditions.push(`pr.payment_type = 'credit'`, `pr.is_paid = 0`, NOT_CANCELLED)
    } else if (payment_type === 'cash' || payment_type === 'credit') {
      rowConditions.push(`pr.payment_type = ?`, NOT_CANCELLED); rowParams.push(payment_type)
    }
    if (status === 'completed') { rowConditions.push(`COALESCE(pr.status,'completed') = 'completed'`) }
    else if (status === 'cancelled') { rowConditions.push(`pr.status = 'cancelled'`) }

    const rowWhere = rowConditions.length ? `WHERE ${rowConditions.join(' AND ')}` : ``

    const limitClause = limit ? `LIMIT ? OFFSET ?` : ''
    const limitParams = limit ? [limit, offset] : []
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
      ORDER BY ${sortCol} ${sortDir}, pr.invoice_no DESC
      ${limitClause}
    `).all(...rowParams, ...limitParams)

    const total = (db.prepare(`
      SELECT COUNT(DISTINCT pr.invoice_no) as c
      FROM purchase_receipts pr
      ${rowWhere}
    `).get(...rowParams) as any).c

    return {
      rows, total, page, limit: limit ?? total,
      summary: {
        count: summary.count,
        cash_count: summary.cash_count,
        credit_count: summary.credit_count,
        unpaid_count: summary.unpaid_count,
        cancelled_count: summary.cancelled_count,
      }
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
             COALESCE(pr.vat_mode,'none') as vat_mode, pr.vat_rate, pr.vat_amount,
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

  ipcMain.handle('purchase:cancel', (_e, payload: { invoice_no: string; reason: string; userId: number }, override?: Override) => {
    requireAdmin(_e, override)
    const db = getDb()
    const reason = (payload.reason ?? '').trim()
    if (!reason) return { success: false, error: 'reason_required' }

    const header = db.prepare(`SELECT status FROM purchase_receipts WHERE invoice_no = ?`).get(payload.invoice_no) as any
    if (!header) return { success: false, error: 'not_found' }
    if (header.status === 'cancelled') return { success: false, error: 'already_cancelled' }

    const lines = db.prepare(`SELECT * FROM purchase_receipt_items WHERE invoice_no = ?`).all(payload.invoice_no) as any[]
    if (lines.length === 0) return { success: false, error: 'no_lines' }

    // Defense in depth — once purchase:save asserts no bundles, no GR line
    // can carry a bundle product_id. Recheck here so a legacy row from before
    // the guard surfaces as a clear error rather than silently corrupting cost.
    for (const line of lines) assertNotBundle(db, line.product_id)

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
        recomputeAvgCost(db, pid)
        propagateCostToBundles(db, pid)
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
