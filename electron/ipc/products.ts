import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerProductHandlers() {
  ipcMain.handle('products:list', (_e, filters: { q?: string; category_id?: number; drug_type_id?: number; page?: number }) => {
    const db = getDb()
    const { q, category_id, drug_type_id, page = 1 } = filters
    const limit = 50
    const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: any[] = []

    if (q) {
      conditions.push(`(p.trade_name LIKE ? OR p.barcode LIKE ? OR p.code LIKE ? OR p.search_keywords LIKE ?)`)
      const lq = `%${q}%`
      params.push(lq, lq, lq, lq)
    }
    if (category_id) { conditions.push(`p.category_id = ?`); params.push(category_id) }
    if (drug_type_id) { conditions.push(`p.drug_type_id = ?`); params.push(drug_type_id) }

    const where = conditions.length ? `WHERE p.is_disabled = 0 AND ${conditions.join(' AND ')}` : `WHERE p.is_disabled = 0`

    const total = (db.prepare(`SELECT COUNT(*) as c FROM products p ${where}`).get(...params) as any).c

    const rows = db.prepare(`
      SELECT p.*, c.name as category_name, dt.name_th as drug_type_name,
             df.name_th as dosage_form_name, u.name as unit_name,
             COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0) as stock_qty
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN drug_types dt ON dt.id = p.drug_type_id
      LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
      LEFT JOIN item_units u ON u.id = p.unit_id
      ${where} ORDER BY p.trade_name LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    return { rows, total, page, limit }
  })

  ipcMain.handle('products:get', (_e, id: number) => {
    const db = getDb()
    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id)
    if (!product) return null
    const units = db.prepare(`
      SELECT pu.*, u.name as unit_name FROM product_units pu
      JOIN item_units u ON u.id = pu.unit_id
      WHERE pu.product_id = ? ORDER BY pu.is_base_unit DESC, pu.qty_per_base ASC
    `).all(id)
    const lots = db.prepare(`SELECT * FROM product_lots WHERE product_id = ? ORDER BY created_at DESC`).all(id)
    const labels = db.prepare(`
      SELECT pl.*, lf.name_th as frequency_name, ld.name_th as dosage_name, lm.name_th as timing_name
      FROM product_labels pl
      LEFT JOIN label_frequencies lf ON lf.id = pl.frequency_id
      LEFT JOIN label_dosages ld ON ld.id = pl.dosage_id
      LEFT JOIN label_meal_relations lm ON lm.id = pl.timing_id
      WHERE pl.product_id = ? ORDER BY pl.sort_order, pl.id
    `).all(id)
    return { ...(product as any), units, lots, labels }
  })

  ipcMain.handle('products:create', (_e, data: any) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO products (barcode, barcode2, barcode3, barcode4, code, trade_name, name_for_print,
        category_id, dosage_form_id, unit_id, is_stock_item,
        price_retail, price_wholesale1, price_wholesale2, cost_price,
        has_vat, no_discount, reorder_point, safety_stock,
        drug_type_id, strength, registration_no, tmt_id,
        is_original_drug, is_antibiotic, max_dispense_qty,
        indication_note, side_effect_note, is_fda_report, is_fda13_report,
        is_sale_control, sale_control_qty, search_keywords, note)
      VALUES (@barcode, @barcode2, @barcode3, @barcode4, @code, @trade_name, @name_for_print,
        @category_id, @dosage_form_id, @unit_id, @is_stock_item,
        @price_retail, @price_wholesale1, @price_wholesale2, @cost_price,
        @has_vat, @no_discount, @reorder_point, @safety_stock,
        @drug_type_id, @strength, @registration_no, @tmt_id,
        @is_original_drug, @is_antibiotic, @max_dispense_qty,
        @indication_note, @side_effect_note, @is_fda_report, @is_fda13_report,
        @is_sale_control, @sale_control_qty, @search_keywords, @note)
    `)
    const result = stmt.run(data)
    return db.prepare(`SELECT * FROM products WHERE id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('products:update', (_e, id: number, data: any) => {
    const db = getDb()
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE products SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run({ ...data, id })
    return db.prepare(`SELECT * FROM products WHERE id = ?`).get(id)
  })

  ipcMain.handle('products:updatePrice', (_e, productId: number, data: { price_type?: 'retail' | 'wholesale1' | 'wholesale2'; new_price: number; note?: string }) => {
    const db = getDb()
    const type = data.price_type ?? 'retail'
    const col = type === 'retail' ? 'price_retail' : type === 'wholesale1' ? 'price_wholesale1' : 'price_wholesale2'
    return db.transaction(() => {
      const product = db.prepare(`SELECT id, ${col} as current FROM products WHERE id = ?`).get(productId) as any
      if (!product) throw new Error('ไม่พบสินค้า')
      const oldPrice = Number(product.current) || 0
      const newPrice = Number(data.new_price) || 0
      if (oldPrice === newPrice) return { product_id: productId, price_type: type, old_price: oldPrice, new_price: newPrice, changed: false }
      db.prepare(`UPDATE products SET ${col} = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(newPrice, productId)
      db.prepare(`INSERT INTO price_logs (product_id, price_type, old_price, new_price, note) VALUES (?, ?, ?, ?, ?)`)
        .run(productId, type, oldPrice, newPrice, data.note ?? null)
      return { product_id: productId, price_type: type, old_price: oldPrice, new_price: newPrice, changed: true }
    })()
  })

  ipcMain.handle('products:priceHistory', (_e, productId: number, limit = 10) => {
    return getDb().prepare(`
      SELECT id, price_type, old_price, new_price, note, created_at
      FROM price_logs
      WHERE product_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(productId, limit)
  })

  ipcMain.handle('products:adjustStock', (_e, productId: number, data: { qty: number; type: 'in' | 'out'; note: string; userId: number }) => {
    const db = getDb()
    const adjust = db.transaction(() => {
      // Find or create adjustment lot
      let lot = db.prepare(`SELECT * FROM product_lots WHERE product_id = ? AND lot_number = 'ADJ'`).get(productId) as any
      if (!lot) {
        db.prepare(`INSERT INTO product_lots (product_id, lot_number, qty_received, qty_on_hand) VALUES (?, 'ADJ', 0, 0)`).run(productId)
        lot = db.prepare(`SELECT * FROM product_lots WHERE product_id = ? AND lot_number = 'ADJ'`).get(productId) as any
      }
      const change = data.type === 'in' ? data.qty : -data.qty
      const qtyBefore = lot.qty_on_hand
      db.prepare(`UPDATE product_lots SET qty_on_hand = qty_on_hand + ? WHERE id = ?`).run(change, lot.id)
      db.prepare(`INSERT INTO stock_movements (product_id, lot_id, movement_type, qty_change, qty_before, qty_after, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        productId, lot.id, data.type === 'in' ? 'adjust_in' : 'adjust_out',
        change, qtyBefore, qtyBefore + change, data.note, data.userId
      )
      return true
    })
    return adjust()
  })

  // Product units
  ipcMain.handle('products:addUnit', (_e, data: any) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO product_units (product_id, unit_id, barcode, qty_per_base, price_retail, price_wholesale1, price_wholesale2, is_base_unit, is_for_sale, is_for_purchase)
      VALUES (@product_id, @unit_id, @barcode, @qty_per_base, @price_retail, @price_wholesale1, @price_wholesale2, @is_base_unit, @is_for_sale, @is_for_purchase)
    `).run(data)
    return db.prepare(`SELECT pu.*, u.name as unit_name FROM product_units pu JOIN item_units u ON u.id = pu.unit_id WHERE pu.id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('products:updateUnit', (_e, id: number, data: any) => {
    const db = getDb()
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE product_units SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run({ ...data, id })
    return true
  })

  ipcMain.handle('products:deleteUnit', (_e, id: number) => {
    getDb().prepare(`DELETE FROM product_units WHERE id = ?`).run(id)
    return true
  })

  // Product labels
  ipcMain.handle('products:getLabels', (_e, productId: number) => {
    return getDb().prepare(`
      SELECT pl.*, lf.name_th as frequency_name, ld.name_th as dosage_name, lm.name_th as timing_name
      FROM product_labels pl
      LEFT JOIN label_frequencies lf ON lf.id = pl.frequency_id
      LEFT JOIN label_dosages ld ON ld.id = pl.dosage_id
      LEFT JOIN label_meal_relations lm ON lm.id = pl.timing_id
      WHERE pl.product_id = ? ORDER BY pl.sort_order, pl.id
    `).all(productId)
  })

  ipcMain.handle('products:saveLabel', (_e, data: any) => {
    const db = getDb()
    if (data.id) {
      const { id, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE product_labels SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run(data)
      return db.prepare(`SELECT * FROM product_labels WHERE id = ?`).get(id)
    }
    const result = db.prepare(`
      INSERT INTO product_labels (product_id, label_name, dose_qty, dosage_id, frequency_id, timing_id,
        indication_th, indication_mm, indication_zh, note_th, note_mm, note_zh, sort_order)
      VALUES (@product_id, @label_name, @dose_qty, @dosage_id, @frequency_id, @timing_id,
        @indication_th, @indication_mm, @indication_zh, @note_th, @note_mm, @note_zh, @sort_order)
    `).run(data)
    return db.prepare(`SELECT * FROM product_labels WHERE id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('products:deleteLabel', (_e, id: number) => {
    getDb().prepare(`DELETE FROM product_labels WHERE id = ?`).run(id)
    return true
  })

  // Search generic names
  ipcMain.handle('products:searchGenericNames', (_e, q: string) => {
    return getDb().prepare(`SELECT * FROM drug_generic_names WHERE name LIKE ? AND is_disabled=0 LIMIT 10`).all(`%${q}%`)
  })

  // Lots for a product
  ipcMain.handle('products:getLots', (_e, productId: number) => {
    return getDb().prepare(`
      SELECT pl.*, s.name as supplier_name FROM product_lots pl
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      WHERE pl.product_id = ? ORDER BY pl.created_at DESC
    `).all(productId)
  })
}
