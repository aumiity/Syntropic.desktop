import { ipcMain, dialog } from 'electron'
import dayjs from 'dayjs'
import { getDb } from '../db'
import { requireAdmin } from '../auth/session'
import { computeVatSummary } from './reports'
import { writeWorkbook, fmtDate, type SheetSpec } from '../services/excel'

// Excel export handlers (phase 1 — all finance, admin-only). Each handler:
//   1. requireAdmin(e)  ← first line; the REAL gate (hiding the button is UX only)
//   2. queries the FULL set for the given filters (NO pagination — the on-screen
//      list is paginated, so reading screen rows would export one page)
//   3. opens a save dialog, writes the .xlsx, returns {ok,path} / {ok:false,canceled}
//
// Bills export as a 2-sheet workbook (header + line items) so each can be
// pivoted independently. Dates → DD/MM/YYYY text; barcode/lot/code/tax-id →
// text columns; money → real numbers (Excel SUM works).

async function saveAndWrite(base: string, sheets: SheetSpec[]) {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'ส่งออก Excel',
    defaultPath: `${base}-${dayjs().format('YYYYMMDD-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  await writeWorkbook(filePath, sheets)
  return { ok: true, path: filePath }
}

export function registerExportHandlers() {
  // ── บิลขาย (sales) ─────────────────────────────────────────────────────────
  ipcMain.handle('export:sales', async (e, filters: {
    q?: string; date_from?: string; date_to?: string
    status_filter?: 'all' | 'retail' | 'wholesale' | 'return' | 'voided'
    vat_filter?: 'all' | 'vat' | 'novat'
  } = {}) => {
    requireAdmin(e)
    const db = getDb()
    const { q, date_from, date_to, status_filter = 'all', vat_filter = 'all' } = filters

    // Mirror reports:salesList's WHERE so the export matches the on-screen set,
    // with limit = null (full set, no LIMIT/OFFSET).
    const conds: string[] = []
    const params: any[] = []
    if (q) { conds.push(`(s.invoice_no LIKE ? OR c.full_name LIKE ? OR s.customer_name_free LIKE ?)`); const lq = `%${q}%`; params.push(lq, lq, lq) }
    if (date_from) { conds.push(`date(s.sold_at) >= ?`); params.push(date_from) }
    if (date_to) { conds.push(`date(s.sold_at) <= ?`); params.push(date_to) }
    const statusCond =
      status_filter === 'retail' ? `s.status != 'voided' AND s.sale_type = 'retail'`
      : status_filter === 'wholesale' ? `s.status != 'voided' AND s.sale_type = 'wholesale'`
      : status_filter === 'return' ? `s.status != 'voided' AND s.sale_type = 'return'`
      : status_filter === 'voided' ? `s.status = 'voided'`
      : null
    const vatCond =
      vat_filter === 'vat' ? `COALESCE(s.total_vat, 0) > 0`
      : vat_filter === 'novat' ? `COALESCE(s.total_vat, 0) = 0`
      : null
    const all = [...conds, statusCond, vatCond].filter(Boolean) as string[]
    const where = all.length ? `WHERE ${all.join(' AND ')}` : ''

    const headers = db.prepare(`
      SELECT s.invoice_no, s.sold_at, s.sale_type, s.status,
             COALESCE(c.full_name, s.customer_name_free) AS customer_name,
             s.subtotal, s.total_discount, s.total_vat, s.total_amount,
             s.cash_amount, s.card_amount, s.transfer_amount
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${where}
      ORDER BY s.sold_at DESC, s.invoice_no DESC
    `).all(...params) as any[]

    // Lines re-apply the header filter directly (adding the customers join so the
    // q clause resolves) rather than an IN(<invoice list>) — a literal invoice
    // list blows past SQLite's variable limit once the range spans many bills.
    let lines: any[] = []
    if (headers.length > 0) {
      lines = db.prepare(`
        SELECT s.invoice_no, si.item_name, si.unit_name, si.qty,
               si.unit_price, si.discount, si.unit_vat, si.line_total
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        LEFT JOIN customers c ON c.id = s.customer_id
        ${where ? `${where} AND` : 'WHERE'} si.is_cancelled = 0
        ORDER BY s.sold_at, s.invoice_no
      `).all(...params) as any[]
    }

    const SALE_TYPE_LABELS: Record<string, string> = { retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า' }
    const sheets: SheetSpec[] = [
      {
        name: 'บิลขาย',
        columns: [
          { header: 'เลขบิล', key: 'invoice_no', type: 'text', width: 18 },
          { header: 'วันที่', key: 'sold_at', type: 'text', width: 14 },
          { header: 'ประเภท', key: 'sale_type', type: 'text', width: 12 },
          { header: 'สถานะ', key: 'status', type: 'text', width: 12 },
          { header: 'ลูกค้า', key: 'customer_name', type: 'text', width: 24 },
          { header: 'ยอดก่อนส่วนลด', key: 'subtotal', type: 'currency', width: 16 },
          { header: 'ส่วนลด', key: 'total_discount', type: 'currency', width: 14 },
          { header: 'ภาษี (VAT)', key: 'total_vat', type: 'currency', width: 14 },
          { header: 'ยอดสุทธิ', key: 'total_amount', type: 'currency', width: 16 },
          { header: 'เงินสด', key: 'cash_amount', type: 'currency', width: 14 },
          { header: 'บัตร', key: 'card_amount', type: 'currency', width: 14 },
          { header: 'เงินโอน', key: 'transfer_amount', type: 'currency', width: 14 },
        ],
        rows: headers.map(h => ({
          ...h,
          sold_at: fmtDate(h.sold_at),
          sale_type: SALE_TYPE_LABELS[h.sale_type] ?? h.sale_type,
          status: h.status === 'voided' ? 'ยกเลิก' : 'สำเร็จ',
        })),
      },
      {
        name: 'รายการสินค้า',
        columns: [
          { header: 'เลขบิล', key: 'invoice_no', type: 'text', width: 18 },
          { header: 'สินค้า', key: 'item_name', type: 'text', width: 30 },
          { header: 'หน่วย', key: 'unit_name', type: 'text', width: 12 },
          { header: 'จำนวน', key: 'qty', type: 'number', width: 10 },
          { header: 'ราคา/หน่วย', key: 'unit_price', type: 'currency', width: 14 },
          { header: 'ส่วนลด', key: 'discount', type: 'currency', width: 12 },
          { header: 'ภาษี/หน่วย', key: 'unit_vat', type: 'currency', width: 12 },
          { header: 'ยอดรวม', key: 'line_total', type: 'currency', width: 14 },
        ],
        rows: lines,
      },
    ]
    return saveAndWrite('sales', sheets)
  })

  // ── บิลซื้อ / GR (purchases) ─────────────────────────────────────────────────
  ipcMain.handle('export:purchases', async (e, filters: {
    q?: string; supplier_id?: number; date_from?: string; date_to?: string
  } = {}) => {
    requireAdmin(e)
    const db = getDb()
    const { q, supplier_id, date_from, date_to } = filters

    // Mirror purchase:history base filters (created_at window, supplier, q),
    // exclude cancelled — full set, no LIMIT.
    const conds: string[] = [`COALESCE(pr.status,'completed') != 'cancelled'`]
    const params: any[] = []
    if (q) { conds.push(`(pr.invoice_no LIKE ? OR pr.supplier_invoice_no LIKE ?)`); params.push(`%${q}%`, `%${q}%`) }
    if (date_from) { conds.push(`date(pr.created_at) >= ?`); params.push(date_from) }
    if (date_to) { conds.push(`date(pr.created_at) <= ?`); params.push(date_to) }
    if (supplier_id) { conds.push(`pr.supplier_id = ?`); params.push(supplier_id) }
    const where = `WHERE ${conds.join(' AND ')}`

    const headers = db.prepare(`
      SELECT pr.invoice_no, pr.supplier_invoice_no, pr.created_at,
             pr.payment_type, pr.is_paid, pr.due_date,
             COALESCE(pr.vat_mode,'none') AS vat_mode, pr.vat_amount,
             s.name AS supplier_name,
             COALESCE((SELECT SUM(pri.qty * pri.cost_price) FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no), 0) AS total_cost
      FROM purchase_receipts pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      ${where}
      ORDER BY pr.created_at DESC, pr.invoice_no DESC
    `).all(...params) as any[]

    // Line items re-apply the header filter directly (no IN(<invoice list>) —
    // a literal list exceeds SQLite's variable limit at scale). JOIN products for
    // the trade name, item_units for the base-unit fallback. Link key = invoice_no
    // (no numeric id). Mirror purchase.ts:406-423.
    let lines: any[] = []
    if (headers.length > 0) {
      lines = db.prepare(`
        SELECT pr.invoice_no, p.trade_name AS product_name,
               COALESCE(pri.unit_name, iu.name) AS unit_name,
               pri.qty, pri.cost_price, pri.lot_number, pri.expiry_date
        FROM purchase_receipt_items pri
        JOIN products p          ON p.id = pri.product_id
        LEFT JOIN item_units iu  ON iu.id = p.unit_id
        JOIN purchase_receipts pr ON pr.invoice_no = pri.invoice_no
        ${where}
        ORDER BY pr.created_at, pr.invoice_no
      `).all(...params) as any[]
    }

    const sheets: SheetSpec[] = [
      {
        name: 'บิลซื้อ',
        columns: [
          { header: 'เลขรับสินค้า', key: 'invoice_no', type: 'text', width: 18 },
          { header: 'เลขที่บิลผู้ขาย', key: 'supplier_invoice_no', type: 'text', width: 18 },
          { header: 'วันที่', key: 'created_at', type: 'text', width: 14 },
          { header: 'ผู้จัดจำหน่าย', key: 'supplier_name', type: 'text', width: 28 },
          { header: 'การชำระ', key: 'payment_type', type: 'text', width: 12 },
          { header: 'ชำระแล้ว', key: 'is_paid', type: 'text', width: 12 },
          { header: 'ครบกำหนด', key: 'due_date', type: 'text', width: 14 },
          { header: 'ภาษีซื้อ (VAT)', key: 'vat_amount', type: 'currency', width: 14 },
          { header: 'ยอดรวม', key: 'total_cost', type: 'currency', width: 16 },
        ],
        rows: headers.map(h => ({
          ...h,
          created_at: fmtDate(h.created_at),
          due_date: fmtDate(h.due_date),
          payment_type: h.payment_type === 'credit' ? 'เครดิต' : 'เงินสด',
          is_paid: h.is_paid ? 'ชำระแล้ว' : 'ยังไม่ชำระ',
        })),
      },
      {
        name: 'รายการรับ',
        columns: [
          { header: 'เลขรับสินค้า', key: 'invoice_no', type: 'text', width: 18 },
          { header: 'สินค้า', key: 'product_name', type: 'text', width: 30 },
          { header: 'หน่วย', key: 'unit_name', type: 'text', width: 12 },
          { header: 'จำนวน', key: 'qty', type: 'number', width: 10 },
          { header: 'ต้นทุน/หน่วย', key: 'cost_price', type: 'currency', width: 14 },
          { header: 'เลขล็อต', key: 'lot_number', type: 'text', width: 16 },
          { header: 'วันหมดอายุ', key: 'expiry_date', type: 'text', width: 14 },
        ],
        rows: lines.map(l => ({ ...l, expiry_date: fmtDate(l.expiry_date) })),
      },
    ]
    return saveAndWrite('purchases', sheets)
  })

  // ── ภาษี VAT (3 sheets) ──────────────────────────────────────────────────────
  ipcMain.handle('export:vat', async (e, filters: { date_from?: string; date_to?: string } = {}) => {
    requireAdmin(e)
    const data = computeVatSummary(getDb(), filters ?? {})

    const SALE_TYPE_LABELS: Record<string, string> = { retail: 'ปลีก', wholesale: 'ส่ง', rx: 'ใบสั่งยา', return: 'คืนสินค้า' }
    const sheets: SheetSpec[] = [
      {
        name: 'ภาษีขาย',
        columns: [
          { header: 'เลขบิล', key: 'invoice_no', type: 'text', width: 18 },
          { header: 'วันที่', key: 'sold_at', type: 'text', width: 14 },
          { header: 'ประเภท', key: 'sale_type', type: 'text', width: 12 },
          { header: 'ลูกค้า', key: 'customer_name', type: 'text', width: 24 },
          { header: 'เลขผู้เสียภาษี', key: 'customer_tax_id', type: 'text', width: 18 },
          { header: 'ยอดรวม', key: 'total_amount', type: 'currency', width: 16 },
          { header: 'ภาษีขาย', key: 'total_vat', type: 'currency', width: 14 },
          { header: 'ออกใบกำกับภาษี', key: 'tax_invoice_issued', type: 'text', width: 16 },
        ],
        rows: (data.sales_rows as any[]).map(r => ({
          invoice_no: r.invoice_no,
          sold_at: fmtDate(r.sold_at),
          sale_type: SALE_TYPE_LABELS[r.sale_type] ?? r.sale_type,
          customer_name: r.customer_name ?? r.customer_name_free ?? '',
          customer_tax_id: r.customer_tax_id ?? '',
          total_amount: r.total_amount,
          total_vat: r.total_vat,
          tax_invoice_issued: r.tax_invoice_issued ? 'ออกแล้ว' : '',
        })),
      },
      {
        name: 'ภาษีซื้อ-รับสินค้า',
        columns: [
          { header: 'เลขรับสินค้า', key: 'invoice_no', type: 'text', width: 18 },
          { header: 'เลขที่บิลผู้ขาย', key: 'supplier_invoice_no', type: 'text', width: 18 },
          { header: 'วันที่', key: 'created_at', type: 'text', width: 14 },
          { header: 'ผู้จัดจำหน่าย', key: 'supplier_name', type: 'text', width: 28 },
          { header: 'ยอดรวม', key: 'total_cost', type: 'currency', width: 16 },
          { header: 'ภาษีซื้อ', key: 'vat_amount', type: 'currency', width: 14 },
        ],
        rows: (data.purchase_rows as any[]).map(r => ({
          invoice_no: r.invoice_no,
          supplier_invoice_no: r.supplier_invoice_no ?? '',
          created_at: fmtDate(r.created_at),
          supplier_name: r.supplier_name ?? '',
          total_cost: r.total_cost,
          vat_amount: r.vat_amount,
        })),
      },
      {
        name: 'ภาษีซื้อ-ค่าใช้จ่าย',
        columns: [
          { header: 'เลขที่', key: 'expense_no', type: 'text', width: 18 },
          { header: 'วันที่', key: 'expense_date', type: 'text', width: 14 },
          { header: 'หมวด', key: 'category_name', type: 'text', width: 24 },
          { header: 'ยอดรวม', key: 'amount', type: 'currency', width: 16 },
          { header: 'ภาษีซื้อ', key: 'vat_amount', type: 'currency', width: 14 },
        ],
        rows: (data.expense_rows as any[]).map(r => ({
          expense_no: r.expense_no,
          expense_date: fmtDate(r.expense_date),
          category_name: r.category_name ?? '',
          amount: r.amount,
          vat_amount: r.vat_amount,
        })),
      },
    ]
    return saveAndWrite('vat', sheets)
  })

  // ── ค่าใช้จ่าย (expenses) ─────────────────────────────────────────────────────
  ipcMain.handle('export:expenses', async (e, filters: {
    date_from?: string; date_to?: string; category_id?: number
  } = {}) => {
    requireAdmin(e)
    const db = getDb()
    const { date_from, date_to, category_id } = filters

    // Full set — no LIMIT. The expenses:list handler caps at 50; here we query
    // directly so a >50-row month exports completely.
    const conds: string[] = []
    const params: any[] = []
    if (date_from) { conds.push(`date(e.expense_date) >= ?`); params.push(date_from) }
    if (date_to) { conds.push(`date(e.expense_date) <= ?`); params.push(date_to) }
    if (category_id) { conds.push(`e.category_id = ?`); params.push(category_id) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const rows = db.prepare(`
      SELECT e.expense_no, e.expense_date, ec.name AS category_name,
             e.amount, e.vat_amount, e.has_tax_invoice, e.reference_no, e.note
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      ${where}
      ORDER BY e.expense_date DESC, e.id DESC
    `).all(...params) as any[]

    const sheets: SheetSpec[] = [
      {
        name: 'ค่าใช้จ่าย',
        columns: [
          { header: 'เลขที่', key: 'expense_no', type: 'text', width: 18 },
          { header: 'วันที่', key: 'expense_date', type: 'text', width: 14 },
          { header: 'หมวด', key: 'category_name', type: 'text', width: 24 },
          { header: 'จำนวนเงิน', key: 'amount', type: 'currency', width: 16 },
          { header: 'ภาษีซื้อ', key: 'vat_amount', type: 'currency', width: 14 },
          { header: 'มีใบกำกับภาษี', key: 'has_tax_invoice', type: 'text', width: 14 },
          { header: 'อ้างอิง', key: 'reference_no', type: 'text', width: 18 },
          { header: 'หมายเหตุ', key: 'note', type: 'text', width: 30 },
        ],
        rows: rows.map(r => ({
          ...r,
          expense_date: fmtDate(r.expense_date),
          category_name: r.category_name ?? '',
          has_tax_invoice: r.has_tax_invoice ? 'มี' : '',
          reference_no: r.reference_no ?? '',
          note: r.note ?? '',
        })),
      },
    ]
    return saveAndWrite('expenses', sheets)
  })
}
