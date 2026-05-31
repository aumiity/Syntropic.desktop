import { ipcMain } from 'electron'
import { getDb } from '../db'
import { orderByBucket } from '../db/sortName'
import dayjs from 'dayjs'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
// Prices are VAT-inclusive — back the tax out of the net (see src/lib/vat.ts).
const extractVat = (amountInclusive: number, rate: number) => amountInclusive * rate / (100 + rate)

interface QuoteItemIn {
  product_id: number | null
  item_name: string
  unit_name: string
  qty: number
  unit_price: number
  discount: number
  line_total: number
}

export function registerQuotationHandlers() {
  // Create (no id) or update (id, draft-only). Quotations never touch stock.
  ipcMain.handle('quotation:save', (_e, payload: {
    id?: number
    customer_id: number | null
    customer_name: string
    customer_address: string
    customer_tax_id: string
    valid_until: string | null
    note: string
    items: QuoteItemIn[]
    created_by: number
  }) => {
    const db = getDb()

    // Totals from the line items (line_total is VAT-inclusive).
    const items = payload.items ?? []
    const subtotal = round2(items.reduce((s, i) => s + i.qty * i.unit_price, 0))
    const totalDiscount = round2(items.reduce((s, i) => s + (i.discount || 0), 0))
    const totalAmount = round2(items.reduce((s, i) => s + i.line_total, 0))

    const insertItems = (quotationId: number | bigint) => {
      const stmt = db.prepare(`
        INSERT INTO quotation_items (quotation_id, product_id, item_name, unit_name, qty, unit_price, discount, line_total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      items.forEach((it, idx) => stmt.run(
        quotationId, it.product_id ?? null, it.item_name, it.unit_name,
        it.qty, it.unit_price, it.discount || 0, it.line_total, idx
      ))
    }

    // ── UPDATE (draft-only) ──
    if (payload.id) {
      const existing = db.prepare(`SELECT id, status FROM quotations WHERE id = ?`).get(payload.id) as { id: number; status: string } | undefined
      if (!existing) throw new Error('ไม่พบใบเสนอราคา')
      if (existing.status !== 'draft') throw new Error('แก้ไขได้เฉพาะใบร่าง (draft)')

      // VAT snapshot is kept fresh while still a draft (re-read sales_settings).
      const ss = db.prepare(`SELECT vat_enabled, vat_rate FROM sales_settings LIMIT 1`).get() as { vat_enabled: number; vat_rate: number } | undefined
      const vatEnabled = ss?.vat_enabled ? 1 : 0
      const vatRate = ss?.vat_rate ?? 7
      const totalVat = vatEnabled ? round2(extractVat(totalAmount, vatRate)) : 0

      const doUpdate = db.transaction(() => {
        // issue_date / quote_no / created_* are intentionally NOT touched.
        db.prepare(`
          UPDATE quotations SET
            customer_id = @customer_id, customer_name = @customer_name,
            customer_address = @customer_address, customer_tax_id = @customer_tax_id,
            valid_until = @valid_until, note = @note,
            vat_enabled = @vat_enabled, vat_rate = @vat_rate,
            subtotal = @subtotal, total_discount = @total_discount,
            total_vat = @total_vat, total_amount = @total_amount,
            updated_at = datetime('now','localtime')
          WHERE id = @id
        `).run({
          id: payload.id,
          customer_id: payload.customer_id ?? null,
          customer_name: payload.customer_name ?? '',
          customer_address: payload.customer_address ?? '',
          customer_tax_id: payload.customer_tax_id ?? '',
          valid_until: payload.valid_until ?? null,
          note: payload.note ?? '',
          vat_enabled: vatEnabled, vat_rate: vatRate,
          subtotal, total_discount: totalDiscount, total_vat: totalVat, total_amount: totalAmount,
        })
        db.prepare(`DELETE FROM quotation_items WHERE quotation_id = ?`).run(payload.id)
        insertItems(payload.id!)
      })
      doUpdate()
      return db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(payload.id)
    }

    // ── CREATE ──
    const ss = db.prepare(`SELECT vat_enabled, vat_rate FROM sales_settings LIMIT 1`).get() as { vat_enabled: number; vat_rate: number } | undefined
    const vatEnabled = ss?.vat_enabled ? 1 : 0
    const vatRate = ss?.vat_rate ?? 7
    const totalVat = vatEnabled ? round2(extractVat(totalAmount, vatRate)) : 0
    const today = dayjs().format('YYYYMMDD')

    // Generate QT-YYYYMMDD-NNNN with retry-on-unique-collision. MAX(suffix)+1
    // (not COUNT) so a manually-edited/imported gap doesn't reuse a number; the
    // retry loop covers the race where two saves compute the same next number.
    const create = db.transaction(() => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = db.prepare(
          `SELECT MAX(CAST(SUBSTR(quote_no, 13) AS INTEGER)) AS maxNum
           FROM quotations WHERE quote_no LIKE ?`
        ).get(`QT-${today}-%`) as { maxNum: number | null }
        const next = (row?.maxNum ?? 0) + 1
        const quoteNo = `QT-${today}-${String(next).padStart(4, '0')}`
        try {
          const res = db.prepare(`
            INSERT INTO quotations (quote_no, customer_id, customer_name, customer_address, customer_tax_id,
              issue_date, valid_until, status, vat_enabled, vat_rate,
              subtotal, total_discount, total_vat, total_amount, note, created_by)
            VALUES (@quote_no, @customer_id, @customer_name, @customer_address, @customer_tax_id,
              datetime('now','localtime'), @valid_until, 'draft', @vat_enabled, @vat_rate,
              @subtotal, @total_discount, @total_vat, @total_amount, @note, @created_by)
          `).run({
            quote_no: quoteNo,
            customer_id: payload.customer_id ?? null,
            customer_name: payload.customer_name ?? '',
            customer_address: payload.customer_address ?? '',
            customer_tax_id: payload.customer_tax_id ?? '',
            valid_until: payload.valid_until ?? null,
            vat_enabled: vatEnabled, vat_rate: vatRate,
            subtotal, total_discount: totalDiscount, total_vat: totalVat, total_amount: totalAmount,
            note: payload.note ?? '', created_by: payload.created_by ?? null,
          })
          insertItems(res.lastInsertRowid)
          return res.lastInsertRowid
        } catch (e: any) {
          // Unique collision on quote_no → recompute and retry; rethrow others.
          if (String(e?.code).includes('SQLITE_CONSTRAINT') && attempt < 4) continue
          throw e
        }
      }
      throw new Error('ไม่สามารถออกเลขที่ใบเสนอราคาได้ กรุณาลองใหม่')
    })
    const newId = create()
    return db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(newId)
  })

  // List with q/date/status filters + pagination (mirrors reports:salesList).
  ipcMain.handle('quotation:list', (_e, filters: {
    q?: string; date_from?: string; date_to?: string
    sort_by?: string; sort_dir?: string; page?: number
    limit?: number | 'all'
    status_filter?: 'all' | 'draft' | 'sent' | 'accepted' | 'rejected'
  }) => {
    const db = getDb()
    const { q, date_from, date_to, sort_by = 'issue_date', sort_dir = 'DESC', page = 1, limit: limitOpt, status_filter = 'all' } = filters
    const limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 50)
    const offset = limit ? (page - 1) * limit : 0

    // Base scope = search + date. The status filter narrows the table rows and
    // the paginated total, but NOT the summary cards — the cards always show the
    // full status breakdown for the current search/date scope (so picking the
    // "ร่าง" tab doesn't zero out the other count cards).
    const baseConditions: string[] = []
    const baseParams: any[] = []
    if (q) { baseConditions.push(`(qt.quote_no LIKE ? OR c.full_name LIKE ? OR qt.customer_name LIKE ?)`); const lq = `%${q}%`; baseParams.push(lq, lq, lq) }
    if (date_from) { baseConditions.push(`date(qt.issue_date) >= ?`); baseParams.push(date_from) }
    if (date_to) { baseConditions.push(`date(qt.issue_date) <= ?`); baseParams.push(date_to) }
    const baseWhere = baseConditions.length ? `WHERE ${baseConditions.join(' AND ')}` : ''

    const rowConditions = [...baseConditions]
    const rowParams = [...baseParams]
    if (['draft', 'sent', 'accepted', 'rejected'].includes(status_filter)) { rowConditions.push(`qt.status = ?`); rowParams.push(status_filter) }
    const where = rowConditions.length ? `WHERE ${rowConditions.join(' AND ')}` : ''

    const validSorts = ['issue_date', 'quote_no', 'valid_until', 'total_amount', 'customer_name']
    const sortCol = !validSorts.includes(sort_by) ? 'qt.issue_date'
      : sort_by === 'customer_name' ? 'COALESCE(c.full_name, qt.customer_name)'
      : `qt.${sort_by}`
    const sortDirection = sort_dir === 'ASC' ? 'ASC' : 'DESC'
    const limitClause = limit ? `LIMIT ? OFFSET ?` : ''
    const limitParams = limit ? [limit, offset] : []

    const rows = db.prepare(`
      SELECT qt.*, COALESCE(c.full_name, qt.customer_name) AS customer_display,
        (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = qt.id) AS item_count
      FROM quotations qt
      LEFT JOIN customers c ON c.id = qt.customer_id
      ${where}
      ORDER BY ${sortCol} ${sortDirection}
      ${limitClause}
    `).all(...rowParams, ...limitParams)

    const summary = db.prepare(`
      SELECT
        COUNT(*) AS count_all,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS count_draft,
        COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS count_sent,
        COALESCE(SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END), 0) AS count_accepted,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS count_rejected
      FROM quotations qt
      LEFT JOIN customers c ON c.id = qt.customer_id
      ${baseWhere}
    `).get(...baseParams)

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM quotations qt LEFT JOIN customers c ON c.id = qt.customer_id ${where}`).get(...rowParams) as any).c
    return { rows, summary, total, page, limit: limit ?? total }
  })

  ipcMain.handle('quotation:get', (_e, id: number) => {
    const db = getDb()
    const quote = db.prepare(`
      SELECT qt.*, c.full_name AS customer_full_name, u.name AS created_by_name
      FROM quotations qt
      LEFT JOIN customers c ON c.id = qt.customer_id
      LEFT JOIN users u ON u.id = qt.created_by
      WHERE qt.id = ?
    `).get(id) as any
    if (!quote) return null
    quote.items = db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id`).all(id)
    return quote
  })

  // Status transitions: draft→sent, sent→accepted|rejected, sent→draft (revert).
  // NOTE: 'converting'/'converted' are NOT reachable here — conversion has its
  // own dedicated, atomic handlers below so 'converted' always carries an
  // invoice link (single write path).
  ipcMain.handle('quotation:setStatus', (_e, payload: { id: number; status: string }) => {
    const db = getDb()
    const cur = db.prepare(`SELECT status FROM quotations WHERE id = ?`).get(payload.id) as { status: string } | undefined
    if (!cur) throw new Error('ไม่พบใบเสนอราคา')
    const allowed: Record<string, string[]> = {
      draft: ['sent'],
      sent: ['accepted', 'rejected', 'draft'],
      accepted: [],
      rejected: [],
      converting: [],
      converted: [],
    }
    if (!(allowed[cur.status] ?? []).includes(payload.status)) {
      throw new Error(`เปลี่ยนสถานะจาก ${cur.status} เป็น ${payload.status} ไม่ได้`)
    }
    db.prepare(`UPDATE quotations SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(payload.status, payload.id)
    return db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(payload.id)
  })

  // ── Conversion to a sale (exclusive claim → sell → mark) ──
  // Atomically claim an accepted quote (accepted→converting) BEFORE the cart is
  // populated, so the same quote can't be sold twice from two windows/terminals.
  ipcMain.handle('quotation:beginConversion', (_e, id: number) => {
    const db = getDb()
    const res = db.prepare(`UPDATE quotations SET status='converting', updated_at=datetime('now','localtime') WHERE id=? AND status='accepted'`).run(id)
    if (res.changes === 0) {
      const cur = db.prepare(`SELECT status FROM quotations WHERE id = ?`).get(id) as { status: string } | undefined
      if (!cur) throw new Error('ไม่พบใบเสนอราคา')
      throw new Error('ใบนี้ถูกแปลงหรือกำลังแปลงอยู่แล้ว')
    }
    return db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(id)
  })

  // Release a claim back to accepted (operator cancelled the conversion).
  ipcMain.handle('quotation:releaseConversion', (_e, id: number) => {
    const db = getDb()
    db.prepare(`UPDATE quotations SET status='accepted', updated_at=datetime('now','localtime') WHERE id=? AND status='converting'`).run(id)
    return db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(id)
  })

  // The ONLY path that writes 'converted' — always records the linked invoice.
  ipcMain.handle('quotation:markConverted', (_e, payload: { id: number; invoice_no: string }) => {
    const db = getDb()
    const res = db.prepare(`UPDATE quotations SET status='converted', converted_invoice_no=?, updated_at=datetime('now','localtime') WHERE id=? AND status='converting'`)
      .run(payload.invoice_no, payload.id)
    if (res.changes === 0) throw new Error('ใบเสนอราคาไม่อยู่ในสถานะกำลังแปลง')
    return db.prepare(`SELECT * FROM quotations WHERE id = ?`).get(payload.id)
  })

  // Delete — draft only (items cascade).
  ipcMain.handle('quotation:delete', (_e, id: number) => {
    const db = getDb()
    const cur = db.prepare(`SELECT status FROM quotations WHERE id = ?`).get(id) as { status: string } | undefined
    if (!cur) throw new Error('ไม่พบใบเสนอราคา')
    if (cur.status !== 'draft') throw new Error('ลบได้เฉพาะใบร่าง (draft)')
    db.prepare(`DELETE FROM quotations WHERE id = ?`).run(id)
    return { success: true }
  })
}
