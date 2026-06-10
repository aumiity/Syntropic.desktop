import { ipcMain } from 'electron'
import { getDb } from '../db'
import { orderByBucket } from '../db/sortName'
import { requireAdmin, getSessionRole, type Override } from '../auth/session'

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
    const validSorts = ['sold_at', 'invoice_no', 'subtotal', 'total_discount', 'total_amount', 'item_kinds', 'customer_name']
    // item_kinds is a computed alias on the SELECT, not a column on s.
    // customer_name: walk-in sales fall back to s.customer_name_free when no customer_id.
    const sortCol = !validSorts.includes(sort_by) ? 's.sold_at'
      : sort_by === 'item_kinds' ? 'item_kinds'
      : sort_by === 'customer_name' ? 'COALESCE(c.full_name, s.customer_name_free)'
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

    // Card counts — partition over the q/date set only (ignores status_filter).
    // Cost/profit aggregates are NOT computed here: they require a per-sale
    // subquery over sale_item_lots × product_lots (O(N) bills × O(M) lots = slow
    // at 2k+ bills) and the list page only renders the count_* fields. Use
    // /reports → Finance / Dashboard for revenue/cost/profit aggregates.
    // retail + wholesale + rx + return = non-voided; + voided = all. rx has no
    // dedicated card (lives only inside count_all), so the visible cards don't
    // sum to count_all by design; a voided row counts as voided only.
    const summary = db.prepare(`
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
    // Attach the lot breakdown (sale_item_lots with joined lot info) to EVERY
    // line. For a bundle this is the per-component split; for a normal product
    // it's the FEFO lots that line was dispensed from. SaleDetailDialog uses it
    // to render the expandable list under each row — letting the operator trace
    // which lot (and its expiry) was sold, not just for bundles.
    for (const it of items) {
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
        ORDER BY ${orderByBucket('c.trade_name')}, pl.expiry_date
      `).all(it.id)
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

  ipcMain.handle('reports:voidSale', (_e, id: number, reason: string, override?: Override) => {
    requireAdmin(_e, override)
    const db = getDb()
    const voidSale = db.transaction(() => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id) as any
      if (!sale || sale.status === 'voided') throw new Error('ไม่สามารถยกเลิกรายการนี้ได้')
      // Return bills (RT-) can't be voided — if the operator wants to "undo"
      // a return, they sell the item again as a normal sale. Voiding would
      // also log a confusing 'sale_void' movement with a negative qty.
      if (sale.sale_type === 'return') throw new Error('ไม่สามารถยกเลิกบิลรับคืนสินค้าได้ — ถ้าต้องการคืนสต็อก ให้ขายออกใหม่')

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
          VALUES (?, ?, 'sale_void', 'sale', ?, ?, ?, ?, ?)`).run(
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

  // System C — Expiry report data.
  // Returns { rows (paginated, filter-applied), total, counts (cumulative
  // buckets — same q/category scope, ignores `filter`) }. With 16k+ tracked
  // lots in long-running stores, returning everything + filtering client-side
  // froze the UI; the rows query is now LIMIT-paginated and the four card
  // counts come from a single cheap aggregate. Pass `count_only: true` to
  // skip the rows query entirely (used by Reports/Dashboard for its KPI cards).
  ipcMain.handle('reports:expiringLots', (_e, filters: {
    filter?: 'expired' | 30 | 90 | 180
    category_id?: number
    q?: string
    page?: number
    limit?: number
    sort_by?: 'trade_name' | 'expiry_date' | 'total_cost'
    sort_dir?: 'ASC' | 'DESC'
    count_only?: boolean
  }) => {
    const db = getDb()
    const { filter, category_id, q, page = 1, limit = 50, sort_by, sort_dir, count_only } = filters

    // Base = open lots with an expiry date in q/category scope. The four card
    // counts always reflect this set; only the rows query layers `filter` on top.
    const baseConds = [`pl.qty_on_hand > 0`, `pl.is_closed = 0`, `pl.expiry_date IS NOT NULL`]
    const baseParams: any[] = []
    if (category_id) { baseConds.push(`p.category_id = ?`); baseParams.push(category_id) }
    if (q) { baseConds.push(`(p.trade_name LIKE ? OR pl.lot_number LIKE ?)`); const lq = `%${q}%`; baseParams.push(lq, lq) }
    const baseWhere = `WHERE ${baseConds.join(' AND ')}`

    const counts = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN date(pl.expiry_date) <  date('now')              THEN 1 ELSE 0 END), 0) AS expired,
        COALESCE(SUM(CASE WHEN date(pl.expiry_date) <= date('now', '+30 days')  THEN 1 ELSE 0 END), 0) AS d30,
        COALESCE(SUM(CASE WHEN date(pl.expiry_date) <= date('now', '+90 days')  THEN 1 ELSE 0 END), 0) AS d90,
        COALESCE(SUM(CASE WHEN date(pl.expiry_date) <= date('now', '+180 days') THEN 1 ELSE 0 END), 0) AS d180
      FROM product_lots pl
      JOIN products p ON p.id = pl.product_id
      ${baseWhere}
    `).get(...baseParams) as { expired: number; d30: number; d90: number; d180: number }

    if (count_only) return { rows: [], total: 0, counts }

    const rowConds = [...baseConds]
    const rowParams = [...baseParams]
    if (filter === 'expired') {
      rowConds.push(`date(pl.expiry_date) < date('now')`)
    } else if (typeof filter === 'number') {
      rowConds.push(`date(pl.expiry_date) <= date('now', '+' || ? || ' days')`)
      rowParams.push(filter)
    }
    const rowWhere = `WHERE ${rowConds.join(' AND ')}`

    const SORT_COLS: Record<string, string> = {
      trade_name: 'p.trade_name',
      expiry_date: 'pl.expiry_date',
      total_cost: 'total_cost',
    }
    const sortCol = sort_by && SORT_COLS[sort_by] ? SORT_COLS[sort_by] : 'pl.expiry_date'
    const sortDirSql = sort_dir === 'DESC' ? 'DESC' : 'ASC'
    const sortClause = sortCol === 'p.trade_name'
      ? orderByBucket(sortCol, sortDirSql as 'ASC' | 'DESC')
      : `${sortCol} ${sortDirSql}, ${orderByBucket('p.trade_name')}`

    const totalAgg = db.prepare(`
      SELECT COUNT(*) AS c,
             ROUND(COALESCE(SUM(pl.qty_on_hand * pl.cost_price), 0), 2) AS total_cost
      FROM product_lots pl
      JOIN products p ON p.id = pl.product_id
      ${rowWhere}
    `).get(...rowParams) as { c: number; total_cost: number }
    const total = totalAgg.c
    const total_cost = totalAgg.total_cost

    const offset = (page - 1) * limit
    const rows = db.prepare(`
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
      ${rowWhere}
      ORDER BY ${sortClause}
      LIMIT ? OFFSET ?
    `).all(...rowParams, limit, offset)

    return { rows, total, total_cost, counts }
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
  // Money actually owed/paid per GR: line sum − discount + surcharge, plus the
  // VAT when the bill prices it separately ('exclusive' — VAT on top of lines;
  // 'inclusive' VAT already sits inside the line prices, add nothing).
  const PURCHASE_NET_SUB = `
    ((SELECT COALESCE(SUM(pri.qty * pri.cost_price), 0)
      FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no)
     - pr.discount_amount + pr.surcharge_amount
     + CASE WHEN COALESCE(pr.vat_mode,'none') = 'exclusive' THEN pr.vat_amount ELSE 0 END)`

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

    // Shop expenses (ค่าใช้จ่าย) over the same window — feeds net-profit display.
    const eCond: string[] = []
    const eParams: any[] = []
    if (date_from) { eCond.push(`date(e.expense_date) >= ?`); eParams.push(date_from) }
    if (date_to) { eCond.push(`date(e.expense_date) <= ?`); eParams.push(date_to) }
    const eWhere = eCond.length ? `WHERE ${eCond.join(' AND ')}` : ''
    const expenses = db.prepare(`
      SELECT COALESCE(SUM(e.amount), 0) AS expense_total FROM expenses e ${eWhere}
    `).get(...eParams) as any

    return { ...sales, ...purchases, expense_total: expenses.expense_total }
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
    requireAdmin(_e)
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

  // VAT summary (ภาษีขาย / ภาษีซื้อ / ภ.พ.30) for a date window — admin-only.
  // Output VAT reads the per-sale snapshots (sales.total_vat, voided excluded;
  // NOTE: returns currently write total_vat = 0 — no credit-note/ใบลดหนี้
  // document yet — so they don't reduce output VAT here). Input VAT = GR
  // headers (vat_mode != 'none', not cancelled) + expenses carrying a full tax
  // invoice. net_vat = output − input (ภ.พ.30: positive → นำส่ง, negative →
  // ขอคืน/ยกยอด).
  ipcMain.handle('reports:vatSummary', (_e, filters: { date_from?: string; date_to?: string }) => {
    requireAdmin(_e)
    const db = getDb()
    const { date_from, date_to } = filters

    const sCond: string[] = [`s.status != 'voided'`]
    const sParams: any[] = []
    if (date_from) { sCond.push(`date(s.sold_at) >= ?`); sParams.push(date_from) }
    if (date_to) { sCond.push(`date(s.sold_at) <= ?`); sParams.push(date_to) }
    const output = db.prepare(`
      SELECT COALESCE(SUM(s.total_vat), 0) AS vat_total,
             COALESCE(SUM(CASE WHEN s.total_vat > 0 THEN s.total_amount ELSE 0 END), 0) AS amount_total,
             COUNT(CASE WHEN s.total_vat > 0 THEN 1 END) AS bill_count
      FROM sales s WHERE ${sCond.join(' AND ')}
    `).get(...sParams) as any
    const salesRows = db.prepare(`
      SELECT s.invoice_no, s.sold_at, s.sale_type, s.total_amount, s.total_vat
      FROM sales s WHERE ${sCond.join(' AND ')} AND s.total_vat > 0
      ORDER BY s.sold_at
    `).all(...sParams)

    const pCond: string[] = [`COALESCE(pr.status,'completed') != 'cancelled'`, `COALESCE(pr.vat_mode,'none') != 'none'`]
    const pParams: any[] = []
    if (date_from) { pCond.push(`date(pr.created_at) >= ?`); pParams.push(date_from) }
    if (date_to) { pCond.push(`date(pr.created_at) <= ?`); pParams.push(date_to) }
    const purchase = db.prepare(`
      SELECT COALESCE(SUM(pr.vat_amount), 0) AS vat_total, COUNT(*) AS bill_count
      FROM purchase_receipts pr WHERE ${pCond.join(' AND ')}
    `).get(...pParams) as any
    const purchaseRows = db.prepare(`
      SELECT pr.invoice_no, pr.supplier_invoice_no, pr.created_at, pr.vat_mode, pr.vat_rate, pr.vat_amount,
             s.name AS supplier_name,
             COALESCE((SELECT SUM(pri.qty * pri.cost_price) FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no), 0) AS total_cost
      FROM purchase_receipts pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      WHERE ${pCond.join(' AND ')}
      ORDER BY pr.created_at
    `).all(...pParams)

    const eCond: string[] = [`e.has_tax_invoice = 1`, `e.vat_amount > 0`]
    const eParams: any[] = []
    if (date_from) { eCond.push(`date(e.expense_date) >= ?`); eParams.push(date_from) }
    if (date_to) { eCond.push(`date(e.expense_date) <= ?`); eParams.push(date_to) }
    const expense = db.prepare(`
      SELECT COALESCE(SUM(e.vat_amount), 0) AS vat_total, COUNT(*) AS bill_count
      FROM expenses e WHERE ${eCond.join(' AND ')}
    `).get(...eParams) as any
    const expenseRows = db.prepare(`
      SELECT e.expense_no, e.expense_date, e.amount, e.vat_amount, ec.name AS category_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE ${eCond.join(' AND ')}
      ORDER BY e.expense_date
    `).all(...eParams)

    const inputTotal = (purchase.vat_total as number) + (expense.vat_total as number)
    return {
      output: { vat_total: output.vat_total, amount_total: output.amount_total, bill_count: output.bill_count },
      input: {
        purchase_vat: purchase.vat_total, purchase_count: purchase.bill_count,
        expense_vat: expense.vat_total, expense_count: expense.bill_count,
        vat_total: inputTotal,
      },
      net_vat: (output.vat_total as number) - inputTotal,
      sales_rows: salesRows, purchase_rows: purchaseRows, expense_rows: expenseRows,
    }
  })

  ipcMain.handle('reports:salesPurchaseTrend', (_e, filters: {
    date_from?: string; date_to?: string;
    granularity?: 'hour' | 'day' | 'week' | 'month' | 'year';
  }) => {
    requireAdmin(_e)
    const db = getDb()
    const { date_from, date_to } = filters
    const granularity = filters.granularity ?? 'day'
    // SQLite strftime keys produce comparable strings ordered correctly when
    // sorted lexicographically (zero-padded month/week). For day we keep
    // date() so the key remains a valid yyyy-mm-dd that the frontend can pass
    // to existing formatters; the other granularities return the raw key
    // (frontend renders "พ.ค. 2569" / "สัปดาห์ 21" / "2569" / "14:00").
    const keyForSales = (
      granularity === 'hour'  ? `strftime('%Y-%m-%d %H:00', s.sold_at)` :
      granularity === 'week'  ? `strftime('%Y-W%W', s.sold_at)` :
      granularity === 'month' ? `strftime('%Y-%m', s.sold_at)` :
      granularity === 'year'  ? `strftime('%Y', s.sold_at)` :
      `date(s.sold_at)`
    )
    const keyForPurchase = (
      granularity === 'hour'  ? `strftime('%Y-%m-%d %H:00', pr.created_at)` :
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

  ipcMain.handle('reports:accountsPayable', (_e) => {
    requireAdmin(_e)
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

  // ── Dashboard handlers ───────────────────────────────────────────────────
  // Used by /reports/dashboard. Most reuse the SALE_COST_SUB / PURCHASE_NET_SUB
  // fragments defined above so revenue/cost/profit numbers stay consistent
  // with financeSummary and salesList. All time-bound handlers exclude
  // s.status='voided' (sales) and pr.status='cancelled' (purchases).

  // Top products within window — by qty, revenue, profit, or low_profit
  // (lowest margin first; surfaces loss-leaders / mispriced SKUs).
  ipcMain.handle('reports:topProducts', (_e, filters: {
    date_from?: string; date_to?: string
    by?: 'qty' | 'revenue' | 'profit' | 'low_profit' | 'margin'
    limit?: number
  }) => {
    requireAdmin(_e)
    const db = getDb()
    const { date_from, date_to } = filters
    const by = filters.by ?? 'revenue'
    const limit = filters.limit ?? 10
    const conds = [`s.status != 'voided'`, `si.is_cancelled = 0`]
    const params: any[] = []
    if (date_from) { conds.push(`date(s.sold_at) >= ?`); params.push(date_from) }
    if (date_to)   { conds.push(`date(s.sold_at) <= ?`); params.push(date_to) }
    const where = `WHERE ${conds.join(' AND ')}`

    // cost = Σ(lot qty × lot cost_price), matched per sale_item. Same expression
    // as salesList's total_cost subquery but pivoted by product instead of sale.
    // `margin` = profit/revenue; NULLIF guards divide-by-zero so zero-revenue
    // rows sort last. Wrapped in an outer SELECT so the ORDER BY can reference
    // the aggregate aliases inside an expression (bare aliases alone are safe,
    // but `profit / revenue` is not guaranteed without the wrapper).
    const orderBy = (
      by === 'qty'        ? `qty DESC` :
      by === 'profit'     ? `profit DESC` :
      by === 'low_profit' ? `profit ASC` :
      by === 'margin'     ? `CAST(profit AS REAL) / NULLIF(revenue, 0) DESC` :
      `revenue DESC`
    )

    return db.prepare(`
      SELECT * FROM (
        SELECT p.id                                      AS product_id,
               p.trade_name,
               u.name                                    AS unit_name,
               COALESCE(SUM(si.qty), 0)                  AS qty,
               COALESCE(SUM(si.line_total), 0)           AS revenue,
               COALESCE(SUM((
                 SELECT COALESCE(SUM(sil.qty * pl.cost_price), 0)
                 FROM sale_item_lots sil
                 LEFT JOIN product_lots pl ON pl.id = sil.lot_id
                 WHERE sil.sale_item_id = si.id AND sil.is_cancelled = 0
               )), 0)                                    AS cost,
               COALESCE(SUM(si.line_total), 0) - COALESCE(SUM((
                 SELECT COALESCE(SUM(sil.qty * pl.cost_price), 0)
                 FROM sale_item_lots sil
                 LEFT JOIN product_lots pl ON pl.id = sil.lot_id
                 WHERE sil.sale_item_id = si.id AND sil.is_cancelled = 0
               )), 0)                                    AS profit
        FROM sale_items si
        JOIN sales s    ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        LEFT JOIN item_units u ON u.id = p.unit_id
        ${where}
        GROUP BY p.id
      )
      ORDER BY ${orderBy}, ${orderByBucket('trade_name')}
      LIMIT ?
    `).all(...params, limit)
  })

  // Top suppliers by purchase amount in window. Same PURCHASE_NET_SUB logic
  // as financeSummary so totals reconcile.
  ipcMain.handle('reports:topSuppliers', (_e, filters: {
    date_from?: string; date_to?: string; limit?: number
  }) => {
    requireAdmin(_e)
    const db = getDb()
    const { date_from, date_to } = filters
    const limit = filters.limit ?? 10
    const conds = [`pr.status != 'cancelled'`, `pr.supplier_id IS NOT NULL`]
    const params: any[] = []
    if (date_from) { conds.push(`date(pr.created_at) >= ?`); params.push(date_from) }
    if (date_to)   { conds.push(`date(pr.created_at) <= ?`); params.push(date_to) }
    const where = `WHERE ${conds.join(' AND ')}`

    return db.prepare(`
      SELECT s.id                            AS supplier_id,
             s.name                          AS supplier_name,
             COUNT(*)                        AS receipt_count,
             COALESCE(SUM(${PURCHASE_NET_SUB}), 0) AS total_amount
      FROM purchase_receipts pr
      JOIN suppliers s ON s.id = pr.supplier_id
      ${where}
      GROUP BY s.id
      ORDER BY total_amount DESC
      LIMIT ?
    `).all(...params, limit)
  })

  // Bills/sales by hour. Two modes:
  //   single_day  — date_from === date_to → returns up to 24 points for that
  //                 actual day (gaps filled with zero so the chart shows a
  //                 continuous 0..23 axis).
  //   aggregated  — multi-day → buckets by hour-of-day across the whole range
  //                 (average busiest times). Same fill so 24 points always.
  ipcMain.handle('reports:hourlyTraffic', (_e, filters: {
    date_from?: string; date_to?: string
  }) => {
    requireAdmin(_e) // hourly sales = revenue → admin-only (staff never see money)
    const db = getDb()
    const { date_from, date_to } = filters
    const mode: 'single_day' | 'aggregated' =
      (date_from && date_to && date_from === date_to) ? 'single_day' : 'aggregated'

    const conds = [`s.status != 'voided'`]
    const params: any[] = []
    if (date_from) { conds.push(`date(s.sold_at) >= ?`); params.push(date_from) }
    if (date_to)   { conds.push(`date(s.sold_at) <= ?`); params.push(date_to) }
    const where = `WHERE ${conds.join(' AND ')}`

    const rows = db.prepare(`
      SELECT CAST(strftime('%H', s.sold_at) AS INTEGER) AS hour,
             COUNT(*)                                   AS bills,
             COALESCE(SUM(s.total_amount), 0)           AS sales
      FROM sales s
      ${where}
      GROUP BY hour
      ORDER BY hour ASC
    `).all(...params) as Array<{ hour: number; bills: number; sales: number }>

    // Fill zero-buckets so charts get a continuous 0..23 axis.
    const map = new Map(rows.map(r => [r.hour, r]))
    const points = Array.from({ length: 24 }, (_, h) =>
      map.get(h) ?? { hour: h, bills: 0, sales: 0 })
    return { mode, points }
  })

  // Cashier leaderboard within window. Cost subquery is the same as
  // topProducts to keep profit comparable across reports.
  ipcMain.handle('reports:cashierLeaderboard', (_e, filters: {
    date_from?: string; date_to?: string; limit?: number
  }) => {
    requireAdmin(_e)
    const db = getDb()
    const { date_from, date_to } = filters
    const limit = filters.limit ?? 10
    const conds = [`s.status != 'voided'`, `s.sold_by IS NOT NULL`]
    const params: any[] = []
    if (date_from) { conds.push(`date(s.sold_at) >= ?`); params.push(date_from) }
    if (date_to)   { conds.push(`date(s.sold_at) <= ?`); params.push(date_to) }
    const where = `WHERE ${conds.join(' AND ')}`

    return db.prepare(`
      SELECT u.id                                    AS user_id,
             COALESCE(u.name, '(ไม่ทราบ)')           AS user_name,
             COUNT(*)                                AS bill_count,
             COALESCE(SUM(s.total_amount), 0)        AS total_amount,
             COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(${SALE_COST_SUB}), 0) AS profit
      FROM sales s
      LEFT JOIN users u ON u.id = s.sold_by
      ${where}
      GROUP BY s.sold_by
      ORDER BY total_amount DESC
      LIMIT ?
    `).all(...params, limit)
  })

  // Extra metrics for the dashboard — packed in one round-trip:
  //   - sale_type counts (retail / wholesale / rx / return / voided)
  //   - avg basket value + avg items per bill (non-voided non-return)
  //   - new vs returning customers within window
  //   - return rate / void rate / discount usage
  //   - bundle revenue share
  ipcMain.handle('reports:salesStats', (_e, filters: {
    date_from?: string; date_to?: string
  }) => {
    requireAdmin(_e)
    const db = getDb()
    const { date_from, date_to } = filters
    const sCond: string[] = []
    const sParams: any[] = []
    if (date_from) { sCond.push(`date(s.sold_at) >= ?`); sParams.push(date_from) }
    if (date_to)   { sCond.push(`date(s.sold_at) <= ?`); sParams.push(date_to) }
    const sWhere = sCond.length ? `WHERE ${sCond.join(' AND ')}` : ''

    const counts = db.prepare(`
      SELECT
        COUNT(*) AS count_all,
        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'retail'    THEN 1 ELSE 0 END), 0) AS count_retail,
        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'wholesale' THEN 1 ELSE 0 END), 0) AS count_wholesale,
        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'rx'        THEN 1 ELSE 0 END), 0) AS count_rx,
        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'return'    THEN 1 ELSE 0 END), 0) AS count_return,
        COALESCE(SUM(CASE WHEN s.status = 'voided' THEN 1 ELSE 0 END), 0) AS count_voided,
        COALESCE(SUM(CASE WHEN s.sale_type = 'return' THEN s.total_amount ELSE 0 END), 0) AS return_amount,
        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.total_discount > 0 THEN 1 ELSE 0 END), 0) AS count_discounted
      FROM sales s ${sWhere}
    `).get(...sParams) as any

    // Avg basket — limit to revenue-positive types (exclude returns + voids).
    const basket = db.prepare(`
      SELECT
        COALESCE(AVG(s.total_amount), 0) AS avg_basket,
        COALESCE(AVG(items.kinds), 0)    AS avg_item_kinds,
        COALESCE(AVG(items.units), 0)    AS avg_units_per_bill
      FROM sales s
      LEFT JOIN (
        SELECT si.sale_id,
               COUNT(DISTINCT si.product_id) AS kinds,
               COALESCE(SUM(si.qty), 0)      AS units
        FROM sale_items si WHERE si.is_cancelled = 0
        GROUP BY si.sale_id
      ) items ON items.sale_id = s.id
      WHERE s.status != 'voided' AND s.sale_type != 'return'
      ${sCond.length ? 'AND ' + sCond.join(' AND ') : ''}
    `).get(...sParams) as any

    // New vs returning — "new" = customer's first ever sale falls within the window.
    // Walk-in (C0000) is treated as a real customer (CLAUDE.md invariant), so it
    // appears here too; the share will be heavy on a single C0000 row by design.
    const customers = db.prepare(`
      SELECT
        COUNT(DISTINCT s.customer_id) AS unique_customers,
        COALESCE(SUM(CASE
          WHEN first_sale.first_sold_at >= COALESCE(?, '0000-01-01')
           AND first_sale.first_sold_at <= COALESCE(?, '9999-12-31')
          THEN 1 ELSE 0
        END), 0) AS new_customers
      FROM (
        SELECT DISTINCT s.customer_id
        FROM sales s
        WHERE s.status != 'voided' AND s.customer_id IS NOT NULL ${sCond.length ? 'AND ' + sCond.join(' AND ') : ''}
      ) AS s
      LEFT JOIN (
        SELECT customer_id, MIN(date(sold_at)) AS first_sold_at
        FROM sales WHERE status != 'voided' AND customer_id IS NOT NULL
        GROUP BY customer_id
      ) first_sale ON first_sale.customer_id = s.customer_id
    `).get(date_from ?? null, date_to ?? null, ...sParams) as any

    // Bundle revenue share.
    const bundle = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN p.is_bundle = 1 THEN si.line_total ELSE 0 END), 0) AS bundle_revenue,
        COALESCE(SUM(si.line_total), 0) AS total_revenue
      FROM sale_items si
      JOIN sales    s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.status != 'voided' AND si.is_cancelled = 0
      ${sCond.length ? 'AND ' + sCond.join(' AND ') : ''}
    `).get(...sParams) as any

    const non_voided_non_return = counts.count_retail + counts.count_wholesale + counts.count_rx
    const return_rate = non_voided_non_return > 0
      ? counts.count_return / (non_voided_non_return + counts.count_return)
      : 0
    const void_rate = counts.count_all > 0 ? counts.count_voided / counts.count_all : 0
    const discount_rate = non_voided_non_return > 0
      ? counts.count_discounted / non_voided_non_return
      : 0
    const bundle_share = bundle.total_revenue > 0
      ? bundle.bundle_revenue / bundle.total_revenue
      : 0

    return {
      counts: {
        all: counts.count_all,
        retail: counts.count_retail,
        wholesale: counts.count_wholesale,
        rx: counts.count_rx,
        return: counts.count_return,
        voided: counts.count_voided,
      },
      return_amount: counts.return_amount,
      avg_basket: basket.avg_basket,
      avg_item_kinds: basket.avg_item_kinds,
      avg_units_per_bill: basket.avg_units_per_bill,
      unique_customers: customers.unique_customers,
      new_customers: customers.new_customers,
      returning_customers: Math.max(0, customers.unique_customers - customers.new_customers),
      return_rate,
      void_rate,
      discount_rate,
      bundle_revenue: bundle.bundle_revenue,
      bundle_share,
    }
  })

  // Products with stock on hand but no sale_items within window. Drives the
  // "สินค้าไม่เคลื่อนไหวในช่วงนี้" panel. avg_monthly_6m is a 6-month rolling
  // window (not affected by the date filter) so users see how badly the SKU
  // is stalled relative to its own baseline.
  ipcMain.handle('reports:inactiveProducts', (_e, filters: {
    date_from?: string; date_to?: string; limit?: number
  }) => {
    const db = getDb()
    const isAdmin = getSessionRole(_e) === 'admin'
    const { date_from, date_to } = filters
    const limit = filters.limit ?? 50
    const stockExpr = `COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)`
    const costExpr = `COALESCE((SELECT SUM(qty_on_hand * cost_price) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)`

    const sCond = [`s.status != 'voided'`, `si.is_cancelled = 0`]
    const sParams: any[] = []
    if (date_from) { sCond.push(`date(s.sold_at) >= ?`); sParams.push(date_from) }
    if (date_to)   { sCond.push(`date(s.sold_at) <= ?`); sParams.push(date_to) }
    const inactiveCondition = `NOT EXISTS (
      SELECT 1 FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE si.product_id = p.id AND ${sCond.join(' AND ')}
    )`

    const rows = db.prepare(`
      SELECT p.id                                  AS product_id,
             p.trade_name,
             u.name                                AS unit_name,
             ${stockExpr}                          AS qty_on_hand,
             ${costExpr}                           AS cost_value,
             (SELECT MAX(s2.sold_at)
                FROM sale_items si2
                JOIN sales s2 ON s2.id = si2.sale_id
                WHERE si2.product_id = p.id AND s2.status != 'voided' AND si2.is_cancelled = 0
             )                                     AS last_sold_at,
             (SELECT COALESCE(SUM(sil3.qty), 0) / 6.0
                FROM sale_item_lots sil3
                JOIN sale_items si3 ON si3.id = sil3.sale_item_id
                JOIN sales s3 ON s3.id = si3.sale_id
                WHERE sil3.product_id = p.id
                  AND sil3.is_cancelled = 0
                  AND si3.is_cancelled = 0
                  AND s3.status != 'voided'
                  AND date(s3.sold_at) >= date('now','-6 months')
             )                                     AS avg_monthly_6m
      FROM products p
      LEFT JOIN item_units u ON u.id = p.unit_id
      WHERE p.is_disabled = 0
        AND p.is_bundle   = 0
        AND ${stockExpr} > 0
        AND ${inactiveCondition}
      ORDER BY cost_value DESC
      LIMIT ?
    `).all(...sParams, limit) as Array<Record<string, any>>

    // R1: cost is finance — staff never see per-row cost value. Strip on the
    // main side so it can't leak via DevTools; admin keeps the full figure.
    if (!isAdmin) return rows.map(r => ({ ...r, cost_value: null }))
    return rows
  })

  // Counts of "dead stock" SKUs (stock on hand, no sale within N months) for
  // the 1/3/6/12-month threshold cards. Counts are nested by construction
  // (m1 >= m3 >= m6 >= m12). "Not sold within N months" ⟺ last sale older than
  // now-N (or never sold), matching the NOT EXISTS window in inactiveProducts.
  ipcMain.handle('reports:inactiveCounts', () => {
    const db = getDb()
    const stockExpr = `COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)`
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN last_sold IS NULL OR last_sold < date('now','-1 months')  THEN 1 ELSE 0 END) AS m1,
        SUM(CASE WHEN last_sold IS NULL OR last_sold < date('now','-3 months')  THEN 1 ELSE 0 END) AS m3,
        SUM(CASE WHEN last_sold IS NULL OR last_sold < date('now','-6 months')  THEN 1 ELSE 0 END) AS m6,
        SUM(CASE WHEN last_sold IS NULL OR last_sold < date('now','-12 months') THEN 1 ELSE 0 END) AS m12
      FROM (
        SELECT (
          SELECT MAX(date(s.sold_at))
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id AND s.status != 'voided' AND si.is_cancelled = 0
        ) AS last_sold
        FROM products p
        WHERE p.is_disabled = 0
          AND p.is_bundle   = 0
          AND ${stockExpr} > 0
      )
    `).get() as { m1: number | null; m3: number | null; m6: number | null; m12: number | null }
    return {
      m1: row.m1 ?? 0,
      m3: row.m3 ?? 0,
      m6: row.m6 ?? 0,
      m12: row.m12 ?? 0,
    }
  })

  // Sales velocity per product (6-month rolling base, not affected by date
  // filter) + suggested safety_stock / reorder_point for the operator. We
  // explicitly do NOT persist the suggestions — owner reviews and edits the
  // value on the product page if they agree.
  //
  // avg_monthly_6m subtracts returns ('sale_return' movements would double the
  // count, so we filter by sale_type and use sale_item_lots qty as the canonical
  // base-unit consumption — non-base unit sales are already converted at POS
  // save). bundles: consumption hits component lots, so summing by
  // sale_item_lots.product_id naturally rolls component velocity.
  ipcMain.handle('reports:productVelocity', (_e, filters: {
    q?: string; limit?: number; sort_by?: 'days_cover' | 'avg_monthly'
  }) => {
    requireAdmin(_e)
    const db = getDb()
    const limit = filters.limit ?? 50
    const sort_by = filters.sort_by ?? 'days_cover'

    const conds = [`p.is_disabled = 0`, `p.is_bundle = 0`]
    const params: any[] = []
    if (filters.q) {
      conds.push(`(p.trade_name LIKE ? OR p.code LIKE ?)`)
      const lq = `%${filters.q}%`
      params.push(lq, lq)
    }
    const where = `WHERE ${conds.join(' AND ')}`

    // Build per-product consumption (returns SUBTRACTED) over the last 6 months.
    // months_with_data = distinct yyyy-mm in that window — informs the "ข้อมูลยังน้อย" flag.
    const rows = db.prepare(`
      SELECT p.id AS product_id,
             p.trade_name,
             p.reorder_point,
             p.safety_stock,
             u.name AS unit_name,
             COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0) AS current_stock,
             COALESCE((
               SELECT SUM(CASE WHEN s.sale_type = 'return' THEN -sil.qty ELSE sil.qty END)
                 FROM sale_item_lots sil
                 JOIN sale_items si ON si.id = sil.sale_item_id
                 JOIN sales s ON s.id = si.sale_id
                WHERE sil.product_id = p.id
                  AND sil.is_cancelled = 0
                  AND si.is_cancelled = 0
                  AND s.status != 'voided'
                  AND date(s.sold_at) >= date('now','-6 months')
             ), 0) AS total_6m_qty,
             COALESCE((
               SELECT COUNT(DISTINCT strftime('%Y-%m', s.sold_at))
                 FROM sale_item_lots sil
                 JOIN sale_items si ON si.id = sil.sale_item_id
                 JOIN sales s ON s.id = si.sale_id
                WHERE sil.product_id = p.id
                  AND sil.is_cancelled = 0
                  AND si.is_cancelled = 0
                  AND s.status != 'voided'
                  AND date(s.sold_at) >= date('now','-6 months')
             ), 0) AS months_with_data
      FROM products p
      LEFT JOIN item_units u ON u.id = p.unit_id
      ${where}
    `).all(...params) as any[]

    // Project derived values JS-side — cleaner than nested CASEs and avoids
    // recomputing avg_daily three times in SQL.
    const enriched = rows.map(r => {
      const avg_monthly_6m = Math.max(0, (r.total_6m_qty ?? 0) / 6)
      const avg_daily = avg_monthly_6m / 30
      const days_cover = avg_daily > 0 ? r.current_stock / avg_daily : null
      const suggested_safety_stock = Math.ceil(avg_daily * 30)
      const suggested_reorder_point = Math.ceil(avg_daily * 14)
      return {
        product_id: r.product_id,
        trade_name: r.trade_name,
        unit_name: r.unit_name,
        current_stock: r.current_stock,
        reorder_point: r.reorder_point,
        safety_stock: r.safety_stock,
        avg_monthly_6m,
        avg_daily,
        days_cover,
        months_with_data: r.months_with_data,
        suggested_safety_stock,
        suggested_reorder_point,
      }
    })
    // Sort by days_cover ASC (urgent first) or avg_monthly DESC (high-velocity first).
    enriched.sort((a, b) => {
      if (sort_by === 'days_cover') {
        const ax = a.avg_daily > 0 ? a.days_cover! : Number.POSITIVE_INFINITY
        const bx = b.avg_daily > 0 ? b.days_cover! : Number.POSITIVE_INFINITY
        if (ax !== bx) return ax - bx
        return b.current_stock - a.current_stock
      }
      return b.avg_monthly_6m - a.avg_monthly_6m
    })
    return enriched.slice(0, limit)
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
