import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'
import { requireAdmin } from '../auth/session'

// Shop expenses (ค่าใช้จ่าย). Manual operating-cost entries feed the Finance
// net-profit calc and the dedicated ค่าใช้จ่าย report. Category CRUD lives here
// (namespaced expenses:*Categories) — there is NO `code` column on categories.
//
// HARD invariants:
//   - expenses:save / saveCategory allow-list columns explicitly — never spread
//     ...payload (a stray key throws `no such column` and aborts the UPDATE).
//   - amount must be a finite > 0 number (validated server-side too); blank is
//     never coerced to 0.
//   - expense_no is EX-YYYYMMDD-NNNN, generated with MAX(suffix)+1 +
//     retry-on-unique-collision (mirrors quotation.ts QT- numbering).

// Allow-listed editable columns (shared by create + update). expense_no /
// created_at are never in here — they're set once on create.
const EXPENSE_COLS = ['expense_date', 'category_id', 'amount', 'reference_no', 'note', 'vat_amount', 'has_tax_invoice'] as const

function validateExpense(payload: any) {
  const amount = Number(payload.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('กรุณาระบุจำนวนเงินให้ถูกต้อง')
  if (!payload.category_id) throw new Error('กรุณาเลือกหมวดค่าใช้จ่าย')
  if (!payload.expense_date) throw new Error('กรุณาระบุวันที่')
  // Input VAT can never meet or exceed the VAT-inclusive amount paid
  if (payload.has_tax_invoice) {
    const vat = Number(payload.vat_amount)
    if (!Number.isFinite(vat) || vat < 0) throw new Error('กรุณาระบุยอดภาษีซื้อให้ถูกต้อง')
    if (vat >= amount) throw new Error('ยอดภาษีซื้อต้องน้อยกว่ายอดค่าใช้จ่าย')
  }
}

// Map a payload to a clean column object (allow-list only). Unknown keys are
// dropped; missing optional fields become null. vat_amount is only claimable
// with a full tax invoice — forced 0 when has_tax_invoice is off so the
// ภาษีซื้อ report can trust the column directly.
function pickExpenseCols(payload: any) {
  const hasTaxInvoice = payload.has_tax_invoice ? 1 : 0
  return {
    expense_date: payload.expense_date,
    category_id: payload.category_id ?? null,
    amount: Number(payload.amount),
    reference_no: payload.reference_no ?? null,
    note: payload.note ?? null,
    vat_amount: hasTaxInvoice ? (Number(payload.vat_amount) || 0) : 0,
    has_tax_invoice: hasTaxInvoice,
  }
}

export function registerExpenseHandlers() {
  // List with date/category filters + pagination. Joins the category for the
  // display name; whitelisted sort; COUNT(*) under the same WHERE for total.
  ipcMain.handle('expenses:list', (_e, filters: {
    date_from?: string; date_to?: string; category_id?: number
    page?: number; pageSize?: number; sort_by?: string; sort_dir?: string
  } = {}) => {
    requireAdmin(_e)
    const db = getDb()
    const { date_from, date_to, category_id, page = 1, pageSize = 50, sort_by = 'expense_date', sort_dir = 'DESC' } = filters

    const conditions: string[] = []
    const params: any[] = []
    if (date_from) { conditions.push(`date(e.expense_date) >= ?`); params.push(date_from) }
    if (date_to) { conditions.push(`date(e.expense_date) <= ?`); params.push(date_to) }
    if (category_id) { conditions.push(`e.category_id = ?`); params.push(category_id) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const validSorts = ['expense_date', 'expense_no', 'amount', 'category_name']
    const sortCol = !validSorts.includes(sort_by) ? 'e.expense_date'
      : sort_by === 'category_name' ? 'ec.name'
      : `e.${sort_by}`
    const sortDirection = sort_dir === 'ASC' ? 'ASC' : 'DESC'

    const limit = typeof pageSize === 'number' && pageSize > 0 ? pageSize : null
    const offset = limit ? (page - 1) * limit : 0
    const limitClause = limit ? `LIMIT ? OFFSET ?` : ''
    const limitParams = limit ? [limit, offset] : []

    const rows = db.prepare(`
      SELECT e.*, ec.name AS category_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      ${where}
      ORDER BY ${sortCol} ${sortDirection}, e.id DESC
      ${limitClause}
    `).all(...params, ...limitParams)

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM expenses e ${where}`).get(...params) as any).c
    return { rows, total }
  })

  // Aggregate rollup for a window — used by the report summary cards.
  ipcMain.handle('expenses:summary', (_e, filters: { date_from?: string; date_to?: string } = {}) => {
    requireAdmin(_e)
    const db = getDb()
    const { date_from, date_to } = filters
    const conditions: string[] = []
    const params: any[] = []
    if (date_from) { conditions.push(`date(e.expense_date) >= ?`); params.push(date_from) }
    if (date_to) { conditions.push(`date(e.expense_date) <= ?`); params.push(date_to) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const totals = db.prepare(`
      SELECT COALESCE(SUM(e.amount), 0) AS expense_total, COUNT(*) AS expense_count
      FROM expenses e ${where}
    `).get(...params) as any

    const by_category = db.prepare(`
      SELECT e.category_id, COALESCE(ec.name, 'ไม่ระบุหมวด') AS category_name,
             COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS count
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      ${where}
      GROUP BY e.category_id
      ORDER BY total DESC
    `).all(...params) as any[]

    return {
      expense_total: totals.expense_total,
      expense_count: totals.expense_count,
      by_category,
      top_category: by_category[0]?.category_name ?? null,
    }
  })

  // Create (no id) or update (id present). Allow-listed columns only.
  ipcMain.handle('expenses:save', (_e, payload: any) => {
    requireAdmin(_e)
    const db = getDb()
    validateExpense(payload)
    const cols = pickExpenseCols(payload)

    // ── UPDATE ── never touches expense_no / created_at.
    if (payload.id) {
      const existing = db.prepare(`SELECT id FROM expenses WHERE id = ?`).get(payload.id) as any
      if (!existing) throw new Error('ไม่พบรายการค่าใช้จ่าย')
      const setClause = EXPENSE_COLS.map(c => `${c} = @${c}`).join(', ')
      db.prepare(`UPDATE expenses SET ${setClause}, updated_at = datetime('now','localtime') WHERE id = @id`)
        .run({ ...cols, id: payload.id })
      return db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(payload.id)
    }

    // ── CREATE ── EX-YYYYMMDD-NNNN with retry-on-unique-collision. MAX(suffix)+1
    // (not COUNT) so a gap doesn't reuse a number; the retry loop covers the race
    // where two saves compute the same next number. Prefix 'EX-'+8+'-' = 12 chars
    // so the running number starts at SUBSTR offset 13.
    const today = dayjs().format('YYYYMMDD')
    const create = db.transaction(() => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = db.prepare(
          `SELECT MAX(CAST(SUBSTR(expense_no, 13) AS INTEGER)) AS maxNum
           FROM expenses WHERE expense_no LIKE ?`
        ).get(`EX-${today}-%`) as { maxNum: number | null }
        const next = (row?.maxNum ?? 0) + 1
        const expenseNo = `EX-${today}-${String(next).padStart(4, '0')}`
        try {
          const res = db.prepare(`
            INSERT INTO expenses (expense_no, expense_date, category_id, amount, reference_no, note, vat_amount, has_tax_invoice, created_at, updated_at)
            VALUES (@expense_no, @expense_date, @category_id, @amount, @reference_no, @note, @vat_amount, @has_tax_invoice, datetime('now','localtime'), datetime('now','localtime'))
          `).run({ expense_no: expenseNo, ...cols })
          return res.lastInsertRowid
        } catch (e: any) {
          if (String(e?.code).includes('SQLITE_CONSTRAINT') && attempt < 4) continue
          throw e
        }
      }
      throw new Error('ไม่สามารถออกเลขที่ค่าใช้จ่ายได้ กรุณาลองใหม่')
    })
    const newId = create()
    return db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(newId)
  })

  ipcMain.handle('expenses:delete', (_e, id: number) => {
    requireAdmin(_e)
    const db = getDb()
    db.prepare(`DELETE FROM expenses WHERE id = ?`).run(id)
    return { success: true }
  })

  // ── Categories ──
  ipcMain.handle('expenses:listCategories', (_e) => {
    requireAdmin(_e)
    return getDb().prepare(`SELECT * FROM expense_categories ORDER BY sort_order, id`).all()
  })
  ipcMain.handle('expenses:activeCategories', (_e) => {
    requireAdmin(_e)
    return getDb().prepare(`SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY sort_order, id`).all()
  })
  ipcMain.handle('expenses:saveCategory', (_e, data: any) => {
    requireAdmin(_e)
    const db = getDb()
    if (data.id) {
      const cols = {
        name: data.name,
        is_active: data.is_active ?? 1,
        sort_order: data.sort_order ?? 0,
      }
      db.prepare(`UPDATE expense_categories SET name = @name, is_active = @is_active, sort_order = @sort_order, updated_at = datetime('now','localtime') WHERE id = @id`)
        .run({ ...cols, id: data.id })
      return db.prepare(`SELECT * FROM expense_categories WHERE id = ?`).get(data.id)
    }
    const result = db.prepare(`INSERT INTO expense_categories (name, is_active, sort_order) VALUES (@name, @is_active, @sort_order)`)
      .run({ name: data.name, is_active: data.is_active ?? 1, sort_order: data.sort_order ?? 0 })
    return db.prepare(`SELECT * FROM expense_categories WHERE id = ?`).get(result.lastInsertRowid)
  })
  // Drag-and-drop reorder: renumber sort_order to 1..n by the given id order, in
  // one transaction so listCategories (ORDER BY sort_order, id) is stable.
  ipcMain.handle('expenses:reorderCategories', (_e, ids: number[]) => {
    requireAdmin(_e)
    const db = getDb()
    const upd = db.prepare(`UPDATE expense_categories SET sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    db.transaction((order: number[]) => {
      order.forEach((id, i) => upd.run(i + 1, id))
    })(ids)
    return db.prepare(`SELECT * FROM expense_categories ORDER BY sort_order, id`).all()
  })
}
