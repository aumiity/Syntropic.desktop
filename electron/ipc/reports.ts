import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerReportHandlers() {
  ipcMain.handle('reports:salesList', (_e, filters: {
    q?: string; date_from?: string; date_to?: string
    sort_by?: string; sort_dir?: string; page?: number
    limit?: number | 'all'
    status_filter?: 'all' | 'retail' | 'wholesale' | 'return' | 'voided'
  }) => {
    const db = getDb()
    const { q, date_from, date_to, sort_by = 'sold_at', sort_dir = 'DESC', page = 1, limit: limitOpt, status_filter = 'all' } = filters
    const limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 30)
    const offset = limit ? (page - 1) * limit : 0

    // q/date scope the whole card row; the status filter only narrows the
    // rows/total — the four count cards always reflect the full q/date set
    // so clicking one card never moves the others' numbers.
    const baseConditions: string[] = []
    const params: any[] = []

    if (q) { baseConditions.push(`(s.invoice_no LIKE ? OR c.full_name LIKE ? OR s.customer_name_free LIKE ?)`); const lq = `%${q}%`; params.push(lq, lq, lq) }
    if (date_from) { baseConditions.push(`date(s.sold_at) >= ?`); params.push(date_from) }
    if (date_to) { baseConditions.push(`date(s.sold_at) <= ?`); params.push(date_to) }

    // Status slice has no bind params — safe to AND on as a literal fragment.
    const statusCond =
      status_filter === 'retail' ? `s.status != 'voided' AND s.sale_type = 'retail'`
      : status_filter === 'wholesale' ? `s.status != 'voided' AND s.sale_type = 'wholesale'`
      : status_filter === 'return' ? `s.status != 'voided' AND s.sale_type = 'return'`
      : status_filter === 'voided' ? `s.status = 'voided'`
      : null // 'all' (includes rx + voided — rx has no dedicated card)

    const rowConditions = statusCond ? [...baseConditions, statusCond] : baseConditions
    const where = rowConditions.length ? `WHERE ${rowConditions.join(' AND ')}` : ''
    const baseWhere = baseConditions.length ? `WHERE ${baseConditions.join(' AND ')}` : ''
    const validSorts = ['sold_at', 'invoice_no', 'subtotal', 'total_discount', 'total_amount', 'item_kinds']
    // item_kinds is a computed alias on the SELECT, not a column on s.
    const sortCol = !validSorts.includes(sort_by) ? 's.sold_at'
      : sort_by === 'item_kinds' ? 'item_kinds'
      : `s.${sort_by}`
    const sortDirection = sort_dir === 'ASC' ? 'ASC' : 'DESC'

    const limitClause = limit ? `LIMIT ? OFFSET ?` : ''
    const limitParams = limit ? [limit, offset] : []
    const rows = db.prepare(`
      SELECT s.*, c.full_name as customer_name,
        (SELECT COUNT(DISTINCT si.product_id) FROM sale_items si WHERE si.sale_id = s.id AND si.is_cancelled = 0) as item_kinds
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${where}
      ORDER BY ${sortCol} ${sortDirection}
      ${limitClause}
    `).all(...params, ...limitParams)

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

    // Card counts — partition over the q/date set only (ignores status_filter).
    // retail + wholesale + rx + return = non-voided; + voided = all. rx has no
    // dedicated card (lives only inside count_all), so the visible cards don't
    // sum to count_all by design; a voided row counts as voided only.
    const counts = db.prepare(`
      SELECT
        COUNT(*) as count_all,
        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'retail' THEN 1 ELSE 0 END), 0) as count_retail,
        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'wholesale' THEN 1 ELSE 0 END), 0) as count_wholesale,
        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'return' THEN 1 ELSE 0 END), 0) as count_return,
        COALESCE(SUM(CASE WHEN s.status = 'voided' THEN 1 ELSE 0 END), 0) as count_voided
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${baseWhere}
    `).get(...params) as any
    Object.assign(summary, counts)

    const total = (db.prepare(`SELECT COUNT(*) as c FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ${where}`).get(...params) as any).c
    return { rows, summary, total, page, limit: limit ?? total }
  })

  // Deeplink hook for "ดูรายละเอียด" buttons elsewhere in the app (e.g.,
  // EditProduct → ความเคลื่อนไหว tab). Returns the same shape as reports:getSale
  // — the renderer doesn't care which key it queried by.
  ipcMain.handle('reports:getSaleByInvoice', (_e, invoiceNo: string) => {
    const db = getDb()
    const sale = db.prepare(`
      SELECT s.*, c.full_name as customer_name, u.name as sold_by_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.sold_by
      WHERE s.invoice_no = ?
    `).get(invoiceNo) as any
    if (!sale) return null
    const items = db.prepare(`
      SELECT si.*,
        p.is_bundle,
        COALESCE((
          SELECT SUM(sil.qty * pl.cost_price) FROM sale_item_lots sil
          JOIN product_lots pl ON pl.id = sil.lot_id
          WHERE sil.sale_item_id = si.id AND sil.is_cancelled = 0
        ), 0) as item_cost
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
    `).all(sale.id) as any[]
    // For bundle items, attach the component breakdown (sale_item_lots grouped
    // by product_id with joined component name + lot info). Used by
    // SaleDetailDialog to render the expandable list under each bundle row.
    for (const it of items) {
      if (it.is_bundle === 1) {
        it.component_lots = db.prepare(`
          SELECT sil.id, sil.lot_id, sil.product_id, sil.qty, sil.is_cancelled,
                 c.trade_name as component_name,
                 u.name as component_unit_name,
                 pl.lot_number, pl.expiry_date, pl.cost_price
          FROM sale_item_lots sil
          LEFT JOIN products c ON c.id = sil.product_id
          LEFT JOIN item_units u ON u.id = c.unit_id
          LEFT JOIN product_lots pl ON pl.id = sil.lot_id
          WHERE sil.sale_item_id = ?
          ORDER BY c.trade_name, pl.expiry_date
        `).all(it.id)
      }
    }
    return { ...sale, items }
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

      // Restore stock for each lot. SELECT sil.* only — sale_item_lots and
      // sale_items BOTH have a product_id column, so `SELECT sil.*, si.product_id`
      // collides at the better-sqlite3 row mapper (last column wins → row.product_id
      // resolves to si.product_id, i.e. the BUNDLE id, not the component id). This
      // was harmless pre-bundle (always equal) but corrupts stock_movements.product_id
      // for bundle voids. The JOIN is still needed for the sale_id filter.
      //
      // si.is_cancelled = 0 is what skips sale_items that have ALREADY been
      // returned (per-item return flow). The flag lives on sale_items while
      // sale_item_lots stays intact, so aggregate cost stays correct and we
      // avoid double-restore on void.
      const saleItemLots = db.prepare(`
        SELECT sil.* FROM sale_item_lots sil
        JOIN sale_items si ON si.id = sil.sale_item_id
        WHERE si.sale_id = ? AND si.is_cancelled = 0 AND sil.is_cancelled = 0 AND sil.lot_id IS NOT NULL
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

      // Cancel any negative-stock markers (lot_id IS NULL) on this sale so
      // the /manage/negative-stock queue doesn't ghost a voided bill. The
      // marker only exists when deductFefo couldn't fully satisfy the qty,
      // so most voids hit zero rows; cheap to run unconditionally.
      db.prepare(`
        UPDATE sale_item_lots
           SET is_cancelled = 1
         WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id = ?)
           AND lot_id IS NULL
           AND is_cancelled = 0
      `).run(id)

      db.prepare(`UPDATE sales SET status = 'voided', void_reason = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(reason, id)
      return true
    })
    return voidSale()
  })

  // System C — Expiry report data
  ipcMain.handle('reports:expiringLots', (_e, filters: {
    filter: 'expired' | 30 | 90 | 365
    category_id?: number
    q?: string
  }) => {
    const db = getDb()
    const { filter, category_id, q } = filters
    const conditions = [`pl.qty_on_hand > 0`, `pl.is_closed = 0`]
    const params: any[] = []

    if (filter === 'expired') {
      conditions.push(`pl.expiry_date IS NOT NULL AND date(pl.expiry_date) < date('now')`)
    } else if (typeof filter === 'number') {
      conditions.push(`pl.expiry_date IS NOT NULL AND date(pl.expiry_date) <= date('now', '+' || ? || ' days')`)
      params.push(filter)
    }
    // 'all' → no date condition

    if (category_id) { conditions.push(`p.category_id = ?`); params.push(category_id) }
    if (q) { conditions.push(`(p.trade_name LIKE ? OR pl.lot_number LIKE ?)`); const lq = `%${q}%`; params.push(lq, lq) }

    const where = `WHERE ${conditions.join(' AND ')}`

    return db.prepare(`
      SELECT
        pl.id          AS lot_id,
        pl.lot_number,
        pl.expiry_date,
        pl.qty_on_hand,
        pl.cost_price,
        ROUND(pl.qty_on_hand * pl.cost_price, 2) AS total_cost,
        p.id           AS product_id,
        p.trade_name,
        u.name         AS unit_name,
        c.name         AS category_name,
        s.name         AS supplier_name,
        CAST(julianday(date(pl.expiry_date)) - julianday(date('now')) AS INTEGER) AS days_remaining
      FROM product_lots pl
      JOIN products p ON p.id = pl.product_id
      LEFT JOIN item_units u ON u.id = p.unit_id
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      ${where}
      ORDER BY pl.expiry_date ASC, p.trade_name ASC
    `).all(...params)
  })

  // ── Phase 4: finance dashboard aggregates ────────────────────────────────
  // Shared SQL fragments. Sale cost = Σ(sold-lot qty × that lot's cost_price)
  // (same shape as reports:salesList). Purchase bill net = Σ(line qty × cost)
  // − header discount + header surcharge, from the immutable receipt ledger.
  const SALE_COST_SUB = `
    (SELECT COALESCE(SUM(sil.qty * pl.cost_price), 0)
     FROM sale_items si
     JOIN sale_item_lots sil ON sil.sale_item_id = si.id
     JOIN product_lots pl ON pl.id = sil.lot_id
     WHERE si.sale_id = s.id AND sil.is_cancelled = 0)`
  const PURCHASE_NET_SUB = `
    ((SELECT COALESCE(SUM(pri.qty * pri.cost_price), 0)
      FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no)
     - pr.discount_amount + pr.surcharge_amount)`

  // Compute sales+purchase rollup for a date window. Pulled out so we can run
  // it twice (current + previous period) for delta widgets without duplicating
  // the SQL or losing the SALE_COST_SUB / PURCHASE_NET_SUB sharing.
  function computeFinanceWindow(date_from?: string, date_to?: string) {
    const db = getDb()
    const sCond = [`s.status != 'voided'`]
    const sParams: any[] = []
    if (date_from) { sCond.push(`date(s.sold_at) >= ?`); sParams.push(date_from) }
    if (date_to) { sCond.push(`date(s.sold_at) <= ?`); sParams.push(date_to) }
    const sWhere = `WHERE ${sCond.join(' AND ')}`

    const sales = db.prepare(`
      SELECT
        COALESCE(SUM(s.subtotal), 0)        AS sales_subtotal,
        COALESCE(SUM(s.total_discount), 0)  AS sales_discount,
        COALESCE(SUM(s.total_amount), 0)    AS sales_net,
        COALESCE(SUM(${SALE_COST_SUB}), 0)  AS sales_cost,
        COALESCE(SUM(s.cash_amount), 0)     AS cash_amount,
        COALESCE(SUM(s.card_amount), 0)     AS card_amount,
        COALESCE(SUM(s.transfer_amount), 0) AS transfer_amount,
        COALESCE(SUM(CASE WHEN s.is_credit = 1 THEN 1 ELSE 0 END), 0) AS credit_count,
        COUNT(*) AS sale_count
      FROM sales s ${sWhere}
    `).get(...sParams) as any
    sales.sales_profit = sales.sales_net - sales.sales_cost

    const pCond = [`pr.status != 'cancelled'`]
    const pParams: any[] = []
    if (date_from) { pCond.push(`date(pr.created_at) >= ?`); pParams.push(date_from) }
    if (date_to) { pCond.push(`date(pr.created_at) <= ?`); pParams.push(date_to) }
    const pWhere = `WHERE ${pCond.join(' AND ')}`

    const purchases = db.prepare(`
      SELECT
        COALESCE(SUM(${PURCHASE_NET_SUB}), 0) AS purchase_total,
        COALESCE(SUM(CASE WHEN pr.payment_type = 'cash'   THEN ${PURCHASE_NET_SUB} ELSE 0 END), 0) AS purchase_cash,
        COALESCE(SUM(CASE WHEN pr.payment_type = 'credit' THEN ${PURCHASE_NET_SUB} ELSE 0 END), 0) AS purchase_credit,
        COUNT(*) AS purchase_count
      FROM purchase_receipts pr ${pWhere}
    `).get(...pParams) as any

    return { ...sales, ...purchases }
  }

  // Same-length window immediately before [date_from, date_to]. e.g. May 1–23
  // (23 days) → April 8–30. Returned as ISO yyyy-mm-dd to match input format.
  function previousWindow(date_from: string, date_to: string): { from: string; to: string } {
    const ms = new Date(date_to).getTime() - new Date(date_from).getTime()
    const days = Math.round(ms / 86_400_000) + 1
    const prevTo = new Date(date_from)
    prevTo.setDate(prevTo.getDate() - 1)
    const prevFrom = new Date(prevTo)
    prevFrom.setDate(prevFrom.getDate() - (days - 1))
    return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) }
  }

  ipcMain.handle('reports:financeSummary', (_e, filters: {
    date_from?: string; date_to?: string; with_compare?: boolean
  }) => {
    const db = getDb()
    const { date_from, date_to, with_compare } = filters
    const current = computeFinanceWindow(date_from, date_to)

    // Accounts payable is CURRENT outstanding — never date-bound.
    const payable = db.prepare(`
      SELECT
        COALESCE(SUM(${PURCHASE_NET_SUB}), 0) AS payable_total,
        COUNT(*) AS payable_count
      FROM purchase_receipts pr
      WHERE pr.status != 'cancelled' AND pr.payment_type = 'credit' AND pr.is_paid = 0
    `).get() as any

    // `previous` only included on explicit opt-in; existing callers that don't
    // pass with_compare get the same shape as before (no perf hit for a second
    // round of aggregation when not needed).
    let previous: any = null
    if (with_compare && date_from && date_to) {
      const prev = previousWindow(date_from, date_to)
      previous = { ...computeFinanceWindow(prev.from, prev.to), date_from: prev.from, date_to: prev.to }
    }
    return { ...current, ...payable, previous }
  })

  ipcMain.handle('reports:salesPurchaseTrend', (_e, filters: {
    date_from?: string; date_to?: string;
    granularity?: 'day' | 'week' | 'month' | 'year';
  }) => {
    const db = getDb()
    const { date_from, date_to } = filters
    const granularity = filters.granularity ?? 'day'
    // SQLite strftime keys produce comparable strings ordered correctly when
    // sorted lexicographically (zero-padded month/week). For day we keep
    // date() so the key remains a valid yyyy-mm-dd that the frontend can pass
    // to existing formatters; the other granularities return the raw key
    // (frontend renders "พ.ค. 2569" / "สัปดาห์ 21" / "2569").
    const keyForSales = (
      granularity === 'week'  ? `strftime('%Y-W%W', s.sold_at)` :
      granularity === 'month' ? `strftime('%Y-%m', s.sold_at)` :
      granularity === 'year'  ? `strftime('%Y', s.sold_at)` :
      `date(s.sold_at)`
    )
    const keyForPurchase = (
      granularity === 'week'  ? `strftime('%Y-W%W', pr.created_at)` :
      granularity === 'month' ? `strftime('%Y-%m', pr.created_at)` :
      granularity === 'year'  ? `strftime('%Y', pr.created_at)` :
      `date(pr.created_at)`
    )

    const sCond = [`s.status != 'voided'`]
    const sParams: any[] = []
    if (date_from) { sCond.push(`date(s.sold_at) >= ?`); sParams.push(date_from) }
    if (date_to) { sCond.push(`date(s.sold_at) <= ?`); sParams.push(date_to) }

    const salesByBucket = db.prepare(`
      SELECT ${keyForSales} AS d,
             COALESCE(SUM(s.total_amount), 0)   AS sales_net,
             COALESCE(SUM(${SALE_COST_SUB}), 0) AS sales_cost
      FROM sales s
      WHERE ${sCond.join(' AND ')}
      GROUP BY ${keyForSales}
    `).all(...sParams) as any[]

    const pCond = [`pr.status != 'cancelled'`]
    const pParams: any[] = []
    if (date_from) { pCond.push(`date(pr.created_at) >= ?`); pParams.push(date_from) }
    if (date_to) { pCond.push(`date(pr.created_at) <= ?`); pParams.push(date_to) }

    const purchaseByBucket = db.prepare(`
      SELECT ${keyForPurchase} AS d,
             COALESCE(SUM(${PURCHASE_NET_SUB}), 0) AS purchase_total
      FROM purchase_receipts pr
      WHERE ${pCond.join(' AND ')}
      GROUP BY ${keyForPurchase}
    `).all(...pParams) as any[]

    const map = new Map<string, { date: string; sales_net: number; sales_cost: number; sales_profit: number; purchase_total: number }>()
    for (const r of salesByBucket) {
      map.set(r.d, { date: r.d, sales_net: r.sales_net, sales_cost: r.sales_cost, sales_profit: r.sales_net - r.sales_cost, purchase_total: 0 })
    }
    for (const r of purchaseByBucket) {
      const e = map.get(r.d)
      if (e) e.purchase_total = r.purchase_total
      else map.set(r.d, { date: r.d, sales_net: 0, sales_cost: 0, sales_profit: 0, purchase_total: r.purchase_total })
    }
    return Array.from(map.values()).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  })

  ipcMain.handle('reports:accountsPayable', () => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT pr.invoice_no, pr.supplier_invoice_no, pr.created_at AS received_at,
             pr.due_date, s.name AS supplier_name,
             ${PURCHASE_NET_SUB} AS amount,
             CAST(julianday(date('now')) - julianday(date(pr.due_date)) AS INTEGER) AS days_overdue
      FROM purchase_receipts pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      WHERE pr.status != 'cancelled' AND pr.payment_type = 'credit' AND pr.is_paid = 0
      ORDER BY (pr.due_date IS NULL), date(pr.due_date) ASC, pr.created_at ASC
    `).all() as any[]

    // Aging buckets by days overdue (negative/unset = not yet due).
    const buckets = { not_due: 0, d1_30: 0, d31_60: 0, d60_plus: 0 }
    for (const r of rows) {
      const o = r.days_overdue
      if (o == null || o <= 0) buckets.not_due += r.amount
      else if (o <= 30) buckets.d1_30 += r.amount
      else if (o <= 60) buckets.d31_60 += r.amount
      else buckets.d60_plus += r.amount
    }
    const total = rows.reduce((s, r) => s + r.amount, 0)
    return { rows, total, count: rows.length, buckets }
  })

  // ── ขย.9 — บัญชีการซื้อยา (Drug Purchase Record per Thai Pharmacy Council) ──
  // One row per drug line in a non-cancelled GR within the date range. Bundle
  // SKUs are excluded — they can carry is_drug=1 as a category hint but are
  // sold-only constructs (purchases hit their component lots, not the bundle).
  ipcMain.handle('reports:khorYor9', (_e, filters: { date_from?: string; date_to?: string }) => {
    const db = getDb()
    const { date_from, date_to } = filters
    const conds: string[] = [
      `pr.status = 'completed'`,
      `pr.cancelled_at IS NULL`,
      `p.is_drug = 1`,
      `p.is_bundle = 0`,
    ]
    const params: any[] = []
    if (date_from) { conds.push(`date(pr.created_at) >= date(?)`); params.push(date_from) }
    if (date_to)   { conds.push(`date(pr.created_at) <= date(?)`); params.push(date_to) }

    return db.prepare(`
      SELECT
        pr.invoice_no                                              AS invoice_no,
        pr.created_at                                              AS purchase_date,
        COALESCE(s.name, '')                                       AS supplier_name,
        COALESCE(NULLIF(p.name_for_print,''), p.trade_name)        AS drug_name,
        COALESCE(pri.lot_number, '')                               AS lot_number,
        pri.qty                                                    AS qty,
        COALESCE(u.name, '')                                       AS unit_name
      FROM purchase_receipt_items pri
      JOIN purchase_receipts pr ON pr.invoice_no = pri.invoice_no
      JOIN products          p  ON p.id  = pri.product_id
      LEFT JOIN suppliers    s  ON s.id  = pr.supplier_id
      LEFT JOIN item_units   u  ON u.id  = p.unit_id
      WHERE ${conds.join(' AND ')}
      ORDER BY pr.created_at ASC, pri.invoice_no ASC, pri.id ASC
    `).all(...params)
  })
}
