import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerSettingsHandlers() {
  // Shop settings
  ipcMain.handle('settings:getShop', () => {
    return getDb().prepare(`SELECT * FROM settings LIMIT 1`).get()
  })
  ipcMain.handle('settings:saveShop', (_e, data: any) => {
    const db = getDb()
    const existing = db.prepare(`SELECT id FROM settings LIMIT 1`).get() as any
    if (existing) {
      const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE settings SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run({ ...data, id: existing.id })
    } else {
      db.prepare(`INSERT INTO settings (shop_name, shop_address, shop_phone, shop_license_no, shop_tax_id, shop_line_id) VALUES (@shop_name, @shop_address, @shop_phone, @shop_license_no, @shop_tax_id, @shop_line_id)`).run(data)
    }
    return db.prepare(`SELECT * FROM settings LIMIT 1`).get()
  })

  // Categories
  ipcMain.handle('settings:listCategories', () => {
    return getDb().prepare(`SELECT * FROM product_categories ORDER BY sort_order, id`).all()
  })
  ipcMain.handle('settings:saveCategory', (_e, data: any) => {
    const db = getDb()
    if (data.id) {
      const { id, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE product_categories SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run(data)
      return db.prepare(`SELECT * FROM product_categories WHERE id = ?`).get(id)
    }
    const result = db.prepare(`INSERT INTO product_categories (code, name, description, sort_order) VALUES (@code, @name, @description, @sort_order)`).run(data)
    return db.prepare(`SELECT * FROM product_categories WHERE id = ?`).get(result.lastInsertRowid)
  })
  ipcMain.handle('settings:toggleCategory', (_e, id: number) => {
    const db = getDb()
    db.prepare(`UPDATE product_categories SET is_disabled = 1 - is_disabled WHERE id = ?`).run(id)
    return db.prepare(`SELECT * FROM product_categories WHERE id = ?`).get(id)
  })

  // Item units
  ipcMain.handle('settings:listUnits', () => {
    return getDb().prepare(`
      SELECT u.*, COUNT(p.id) as usage_count
      FROM item_units u
      LEFT JOIN products p ON p.unit_id = u.id
      GROUP BY u.id ORDER BY u.name
    `).all()
  })
  ipcMain.handle('settings:saveUnit', (_e, data: any) => {
    const db = getDb()
    if (data.id) {
      db.prepare(`UPDATE item_units SET name = ? WHERE id = ?`).run(data.name, data.id)
      return db.prepare(`SELECT * FROM item_units WHERE id = ?`).get(data.id)
    }
    const result = db.prepare(`INSERT INTO item_units (name, multiply) VALUES (?, ?)`).run(data.name, data.multiply ?? 1)
    return db.prepare(`SELECT * FROM item_units WHERE id = ?`).get(result.lastInsertRowid)
  })

  // Drug types
  ipcMain.handle('settings:listDrugTypes', () => {
    return getDb().prepare(`SELECT * FROM drug_types ORDER BY id`).all()
  })
  ipcMain.handle('settings:saveDrugType', (_e, data: any) => {
    const db = getDb()
    if (data.id) {
      const { id, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE drug_types SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run(data)
      return db.prepare(`SELECT * FROM drug_types WHERE id = ?`).get(id)
    }
    const result = db.prepare(`INSERT INTO drug_types (code, name_th, khor_yor_report) VALUES (@code, @name_th, @khor_yor_report)`).run(data)
    return db.prepare(`SELECT * FROM drug_types WHERE id = ?`).get(result.lastInsertRowid)
  })
  ipcMain.handle('settings:toggleDrugType', (_e, id: number) => {
    const db = getDb()
    db.prepare(`UPDATE drug_types SET is_disabled = 1 - is_disabled WHERE id = ?`).run(id)
    return db.prepare(`SELECT * FROM drug_types WHERE id = ?`).get(id)
  })

  // Dosage forms
  ipcMain.handle('settings:listDosageForms', () => {
    return getDb().prepare(`SELECT * FROM dosage_forms WHERE is_disabled = 0 ORDER BY name_th`).all()
  })

  // Label frequencies/dosages/etc.
  ipcMain.handle('settings:listLabelFrequencies', () => getDb().prepare(`SELECT * FROM label_frequencies ORDER BY sort_order`).all())
  ipcMain.handle('settings:listLabelDosages', () => getDb().prepare(`SELECT * FROM label_dosages ORDER BY sort_order`).all())
  ipcMain.handle('settings:listLabelMealRelations', () => getDb().prepare(`SELECT * FROM label_meal_relations ORDER BY sort_order`).all())
  ipcMain.handle('settings:listLabelTimes', () => getDb().prepare(`SELECT * FROM label_times ORDER BY sort_order`).all())
  ipcMain.handle('settings:listLabelAdvices', () => getDb().prepare(`SELECT * FROM label_advices ORDER BY sort_order`).all())

  // Label settings
  ipcMain.handle('settings:getLabelSettings', () => {
    return getDb().prepare(`SELECT * FROM label_settings LIMIT 1`).get()
  })
  ipcMain.handle('settings:saveLabelSettings', (_e, data: any) => {
    const db = getDb()
    const existing = db.prepare(`SELECT id FROM label_settings LIMIT 1`).get() as any
    if (existing) {
      const { id, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE label_settings SET ${fields}, updated_at = datetime('now','localtime') WHERE id = ?`).run({ ...rest, id: existing.id })
    } else {
      db.prepare(`INSERT INTO label_settings DEFAULT VALUES`).run()
    }
    return db.prepare(`SELECT * FROM label_settings LIMIT 1`).get()
  })

  // All item units (for dropdowns)
  ipcMain.handle('settings:allUnits', () => {
    return getDb().prepare(`SELECT * FROM item_units ORDER BY name`).all()
  })
  // All categories (for dropdowns)
  ipcMain.handle('settings:allCategories', () => {
    return getDb().prepare(`SELECT * FROM product_categories WHERE is_disabled = 0 ORDER BY sort_order`).all()
  })
  // All drug types (for dropdowns)
  ipcMain.handle('settings:allDrugTypes', () => {
    return getDb().prepare(`SELECT * FROM drug_types WHERE is_disabled = 0 ORDER BY id`).all()
  })
  // All dosage forms (for dropdowns)
  ipcMain.handle('settings:allDosageForms', () => {
    return getDb().prepare(`SELECT * FROM dosage_forms WHERE is_disabled = 0 ORDER BY name_th`).all()
  })
}
