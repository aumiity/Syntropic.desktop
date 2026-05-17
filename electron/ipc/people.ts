import { ipcMain } from 'electron'
import { getDb } from '../db'
import { nextCustomerCode } from './codes'

export function registerPeopleHandlers() {
  // --- CUSTOMERS ---
  ipcMain.handle('people:listCustomers', (_e, filters: { q?: string; page?: number; includeDisabled?: boolean }) => {
    const db = getDb()
    const { q, page = 1, includeDisabled = false } = filters ?? {}
    const limit = 50; const offset = (page - 1) * limit
    const conds: string[] = []
    const params: any[] = []
    if (!includeDisabled) conds.push(`is_disabled = 0`)
    if (q) {
      conds.push(`(full_name LIKE ? OR phone LIKE ? OR code LIKE ? OR hn LIKE ?)`)
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const rows = db.prepare(`SELECT * FROM customers ${where} ORDER BY code LIMIT ? OFFSET ?`).all(...params, limit, offset)
    const total = (db.prepare(`SELECT COUNT(*) as c FROM customers ${where}`).get(...params) as any).c
    return { rows, total, page, limit }
  })

  ipcMain.handle('people:getCustomer', (_e, id: number) => {
    const db = getDb()
    const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id)
    const allergies = db.prepare(`
      SELECT da.*, dgn.name as generic_name FROM drug_allergies da
      LEFT JOIN drug_generic_names dgn ON dgn.id = da.generic_name_id
      WHERE da.customer_id = ? ORDER BY da.noted_at DESC
    `).all(id)
    return { ...(customer as any), allergies }
  })

  ipcMain.handle('people:saveCustomer', (_e, data: any) => {
    const db = getDb()
    if (data.id) {
      const { id, ...rest } = data
      delete rest.allergies
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE customers SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run(data)
      return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id)
    }
    const code = nextCustomerCode(db)
    const result = db.prepare(`
      INSERT INTO customers (code, full_name, id_card, hn, dob, phone, address,
        hc_uc, hc_gov, hc_sso, food_allergy, other_allergy, chronic_diseases,
        is_alert, alert_note, warning_note)
      VALUES (@code, @full_name, @id_card, @hn, @dob, @phone, @address,
        @hc_uc, @hc_gov, @hc_sso, @food_allergy, @other_allergy, @chronic_diseases,
        @is_alert, @alert_note, @warning_note)
    `).run({ code, ...data })
    return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('people:setCustomerStatus', (_e, payload: { id: number; disabled: boolean }) => {
    getDb().prepare(`UPDATE customers SET is_disabled = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(payload.disabled ? 1 : 0, payload.id)
    return true
  })

  // --- SUPPLIERS ---
  ipcMain.handle('people:listSuppliers', (_e, filters: { q?: string; page?: number; includeDisabled?: boolean }) => {
    const db = getDb()
    const { q, page = 1, includeDisabled = false } = filters ?? {}
    const limit = 50; const offset = (page - 1) * limit
    const conds: string[] = []
    const params: any[] = []
    if (!includeDisabled) conds.push(`is_disabled = 0`)
    if (q) {
      conds.push(`(name LIKE ? OR code LIKE ? OR phone LIKE ?)`)
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const rows = db.prepare(`SELECT * FROM suppliers ${where} ORDER BY name LIMIT ? OFFSET ?`).all(...params, limit, offset)
    const total = (db.prepare(`SELECT COUNT(*) as c FROM suppliers ${where}`).get(...params) as any).c
    return { rows, total, page, limit }
  })

  ipcMain.handle('people:saveSupplier', (_e, data: any) => {
    const db = getDb()
    if (data.id) {
      const { id, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE suppliers SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run(data)
      return db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id)
    }
    const last = db.prepare(`SELECT code FROM suppliers WHERE code LIKE 'S%' ORDER BY id DESC LIMIT 1`).get() as any
    let nextNum = 1
    if (last?.code) nextNum = parseInt(last.code.slice(1)) + 1
    const code = `S${String(nextNum).padStart(4, '0')}`
    const result = db.prepare(`
      INSERT INTO suppliers (code, name, tax_id, phone, address, contact_name)
      VALUES (@code, @name, @tax_id, @phone, @address, @contact_name)
    `).run({ code, ...data })
    return db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('people:setSupplierStatus', (_e, payload: { id: number; disabled: boolean }) => {
    getDb().prepare(`UPDATE suppliers SET is_disabled = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(payload.disabled ? 1 : 0, payload.id)
    return true
  })

  // --- STAFF ---
  ipcMain.handle('people:listStaff', (_e, filters?: { includeDisabled?: boolean }) => {
    const { includeDisabled = false } = filters ?? {}
    const where = includeDisabled ? '' : `WHERE is_disabled = 0`
    return getDb().prepare(`SELECT id, name, email, role, is_disabled, created_at FROM users ${where} ORDER BY name`).all()
  })

  ipcMain.handle('people:saveStaff', (_e, data: any) => {
    const db = getDb()
    if (data.id) {
      const { id, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE users SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run(data)
      return db.prepare(`SELECT id, name, email, role, is_disabled FROM users WHERE id = ?`).get(id)
    }
    const result = db.prepare(`INSERT INTO users (name, email, password, role) VALUES (@name, @email, @password, @role)`).run(data)
    return db.prepare(`SELECT id, name, email, role, is_disabled FROM users WHERE id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('people:setStaffStatus', (_e, payload: { id: number; disabled: boolean }) => {
    getDb().prepare(`UPDATE users SET is_disabled = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(payload.disabled ? 1 : 0, payload.id)
    return true
  })

  // All suppliers (for dropdowns) — always filters disabled.
  ipcMain.handle('people:allSuppliers', () => {
    return getDb().prepare(`SELECT id, code, name FROM suppliers WHERE is_disabled = 0 ORDER BY name`).all()
  })
}
