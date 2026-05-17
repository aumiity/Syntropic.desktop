import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerProductHandlers() {
  ipcMain.handle('products:list', (_e, filters: {
    q?: string; category_id?: number; drug_type_id?: number; page?: number
    sort_by?: string; sort_dir?: 'asc' | 'desc'
    stock_filter?: 'all' | 'low' | 'out'
    include_disabled?: boolean
  }) => {
    const db = getDb()
    const { q, category_id, drug_type_id, page = 1, sort_by, sort_dir, stock_filter, include_disabled } = filters
    const limit = 50
    const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: any[] = []

    // Disabled filter: by default hidden; opt-in to recover/inspect.
    if (!include_disabled) conditions.push(`p.is_disabled = 0`)

    if (q) {
      conditions.push(`(p.trade_name LIKE ? OR p.barcode LIKE ? OR p.code LIKE ? OR p.search_keywords LIKE ?)`)
      const lq = `%${q}%`
      params.push(lq, lq, lq, lq)
    }
    if (category_id) { conditions.push(`p.category_id = ?`); params.push(category_id) }
    if (drug_type_id) { conditions.push(`p.drug_type_id = ?`); params.push(drug_type_id) }

    // Stock-state filter: 'low' / 'out' narrow the result; 'all' (or missing) is a no-op.
    // Same SUM-of-open-lots expression as stockStats, kept inline to share the WHERE.
    if (stock_filter === 'out' || stock_filter === 'low') {
      const stockExpr = `COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)`
      if (stock_filter === 'out') {
        conditions.push(`${stockExpr} <= 0`)
      } else {
        conditions.push(`${stockExpr} > 0 AND p.reorder_point > 0 AND ${stockExpr} <= p.reorder_point`)
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Whitelist sort columns — never interpolate user input directly into ORDER BY.
    // Keys are the public field names exposed to the renderer; values are the SQL
    // expression they map to (computed columns like profit are built here).
    const SORT_MAP: Record<string, string> = {
      trade_name: 'p.trade_name',
      unit_name: 'u.name',
      cost_price: 'p.cost_price',
      price_retail: 'p.price_retail',
      profit: '(p.price_retail - p.cost_price)',
      stock_qty: 'stock_qty',
    }
    const orderCol = (sort_by && SORT_MAP[sort_by]) || 'p.trade_name'
    const orderDir = sort_dir === 'desc' ? 'DESC' : 'ASC'
    // Always tie-break on trade_name so paginated results are stable when the
    // primary sort column has duplicates (e.g. many products with cost_price=0).
    const orderBy = orderCol === 'p.trade_name'
      ? `${orderCol} ${orderDir}`
      : `${orderCol} ${orderDir}, p.trade_name ASC`

    const total = (db.prepare(`SELECT COUNT(*) as c FROM products p ${where}`).get(...params) as any).c

    const rows = db.prepare(`
      SELECT p.*, c.name as category_name, dt.name_th as drug_type_name,
             u.name as unit_name,
             COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0) as stock_qty
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN drug_types dt ON dt.id = p.drug_type_id
      LEFT JOIN item_units u ON u.id = p.unit_id
      ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    return { rows, total, page, limit }
  })

  ipcMain.handle('products:stockStats', (_e, filters: {
    q?: string; category_id?: number; drug_type_id?: number; include_disabled?: boolean
  }) => {
    const db = getDb()
    const { q, category_id, drug_type_id, include_disabled } = filters
    const conditions: string[] = []
    const params: any[] = []

    if (!include_disabled) conditions.push(`p.is_disabled = 0`)

    if (q) {
      conditions.push(`(p.trade_name LIKE ? OR p.barcode LIKE ? OR p.code LIKE ? OR p.search_keywords LIKE ?)`)
      const lq = `%${q}%`
      params.push(lq, lq, lq, lq)
    }
    if (category_id) { conditions.push(`p.category_id = ?`); params.push(category_id) }
    if (drug_type_id) { conditions.push(`p.drug_type_id = ?`); params.push(drug_type_id) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const stockExpr = `COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)`

    const andStock = (extra: string) => where
      ? `${where} AND ${extra}`
      : `WHERE ${extra}`
    const out = (db.prepare(`SELECT COUNT(*) as c FROM products p ${andStock(`${stockExpr} <= 0`)}`).get(...params) as any).c
    const low = (db.prepare(`SELECT COUNT(*) as c FROM products p ${andStock(`${stockExpr} > 0 AND p.reorder_point > 0 AND ${stockExpr} <= p.reorder_point`)}`).get(...params) as any).c
    // Total — used by "สินค้าทั้งหมด" stat card. Respects only the "include_disabled"
    // toggle, never the search/category/drug-type filters, so it doesn't shrink
    // as the user narrows the list.
    const total_all = (db.prepare(
      `SELECT COUNT(*) as c FROM products ${include_disabled ? '' : 'WHERE is_disabled = 0'}`
    ).get() as any).c

    return { out, low, total_all }
  })

  ipcMain.handle('products:get', (_e, id: number) => {
    const db = getDb()
    const product = db.prepare(`
      SELECT p.*, u.name as unit_name
      FROM products p
      LEFT JOIN item_units u ON u.id = p.unit_id
      WHERE p.id = ?
    `).get(id)
    if (!product) return null
    const units = db.prepare(`
      SELECT pu.*, u.name as unit_name FROM product_units pu
      JOIN item_units u ON u.id = pu.unit_id
      WHERE pu.product_id = ? ORDER BY pu.qty_per_base ASC
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
    // Auto-generate product code (P0001, P0002, …). Scan only auto-generated codes
    // so legacy custom codes (e.g. MED001) don't poison the sequence.
    const last = db.prepare(`SELECT code FROM products WHERE code GLOB 'P[0-9][0-9][0-9][0-9]*' ORDER BY code DESC LIMIT 1`).get() as any
    let nextNum = 1
    if (last?.code) nextNum = parseInt(last.code.slice(1)) + 1
    const code = `P${String(nextNum).padStart(4, '0')}`

    // Fallback unit if caller didn't pick one (shouldn't happen via the UI, but defends against legacy callers).
    const fallbackUnitId = (db.prepare(`SELECT id FROM item_units WHERE name = 'ชิ้น'`).get() as any)?.id
                         ?? (db.prepare(`INSERT INTO item_units (name) VALUES ('ชิ้น')`).run().lastInsertRowid as number)

    const insProduct = db.prepare(`
      INSERT INTO products (barcode, barcode2, barcode3, barcode4, code, trade_name, name_for_print,
        category_id, is_stock_item,
        price_retail, price_wholesale1, price_wholesale2, cost_price, last_cost_price,
        unit_id,
        has_vat, reorder_point, safety_stock,
        drug_type_id, tmt_id,
        is_drug, is_antibiotic,
        indication_note, side_effect_note,
        is_fda9, is_fda10, is_fda11, is_fda13,
        search_keywords, note)
      VALUES (@barcode, @barcode2, @barcode3, @barcode4, @code, @trade_name, @name_for_print,
        @category_id, @is_stock_item,
        @price_retail, @price_wholesale1, @price_wholesale2, @cost_price, @last_cost_price,
        @unit_id,
        @has_vat, @reorder_point, @safety_stock,
        @drug_type_id, @tmt_id,
        @is_drug, @is_antibiotic,
        @indication_note, @side_effect_note,
        @is_fda9, @is_fda10, @is_fda11, @is_fda13,
        @search_keywords, @note)
    `)

    // New product has no lots yet: seed both costs from the entered value.
    // cost_price (weighted avg) will be recomputed once lots exist;
    // last_cost_price is the pricing reference until the first paid receive.
    const r = insProduct.run({
      ...data, code,
      unit_id: data.unit_id ?? fallbackUnitId,
      cost_price: data.cost_price ?? 0,
      last_cost_price: data.last_cost_price ?? data.cost_price ?? 0,
    })
    return db.prepare(`SELECT * FROM products WHERE id = ?`).get(r.lastInsertRowid)
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

  // Stock movement audit log for a single product. Returns rows from
  // stock_movements joined with lot + user info for display. Ordered newest
  // first. movement_type values: receive, sale, sale_return, adjust_in,
  // adjust_out, lot_edit, gr_cancel. Note often contains a referencing
  // invoice/GR number (frontend extracts for navigation).
  ipcMain.handle('products:stockMovements', (_e, productId: number, opts?: {
    limit?: number
    movement_types?: string[]
    date_from?: string
    date_to?: string
  }) => {
    const limit = opts?.limit ?? 200
    const conditions: string[] = ['sm.product_id = ?']
    const params: any[] = [productId]
    if (opts?.movement_types && opts.movement_types.length > 0) {
      conditions.push(`sm.movement_type IN (${opts.movement_types.map(() => '?').join(',')})`)
      params.push(...opts.movement_types)
    }
    if (opts?.date_from) { conditions.push(`date(sm.created_at) >= ?`); params.push(opts.date_from) }
    if (opts?.date_to)   { conditions.push(`date(sm.created_at) <= ?`); params.push(opts.date_to)   }

    // pl.invoice_no = the GR (purchase_receipt) the lot belongs to → used for
    // navigating receive/gr_cancel movements to the purchase detail page.
    // s.invoice_no = the sale the movement references → only meaningful when
    // ref_type='sale' (covers both 'sale' and 'sale_return' movement_types).
    return getDb().prepare(`
      SELECT sm.id, sm.movement_type, sm.ref_type, sm.ref_id,
             sm.qty_change, sm.qty_before, sm.qty_after, sm.unit_cost,
             sm.note, sm.created_at,
             sm.lot_id, pl.lot_number, pl.expiry_date,
             pl.invoice_no AS gr_invoice_no,
             s.invoice_no AS sale_invoice_no,
             sm.created_by, u.name AS created_by_name
      FROM stock_movements sm
      LEFT JOIN product_lots pl ON pl.id = sm.lot_id
      LEFT JOIN sales s ON sm.ref_type = 'sale' AND s.id = sm.ref_id
      LEFT JOIN users u ON u.id = sm.created_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT ?
    `).all(...params, limit)
  })

  // Stock adjustment from Products list. Three modes — operator picks one
  // based on the situation:
  //
  //   decrease            → auto-FEFO. Deduct from real lots ordered by
  //                         expiry_date ASC. Preserves cost provenance.
  //                         Used when stock count finds shortage.
  //
  //   increase_new_lot    → create a brand-new product_lot. Operator supplies
  //                         lot_number (auto-generated if blank), optional
  //                         expiry, cost (default 0 for freebies). The right
  //                         pick when extra stock came from somewhere with
  //                         different expiry/source than existing lots.
  //
  //   increase_existing_lot → add qty into an existing lot. Operator picks the
  //                           target lot and supplies the cost of the *added*
  //                           units (often 0). The lot's qty_received grows
  //                           and cost_price is recomputed as a weighted avg
  //                           within the lot — same total contribution to
  //                           products.cost_price as creating a new lot. Use
  //                           when supplier bundles freebies with an existing
  //                           receive (same batch/expiry).
  ipcMain.handle('products:adjustStock', (_e, productId: number, data: {
    mode: 'decrease' | 'increase_new_lot' | 'increase_existing_lot'
    qty: number
    note: string
    userId: number
    lot_number?: string
    expiry_date?: string | null
    manufactured_date?: string | null
    cost_price?: number
    target_lot_id?: number
    added_cost_price?: number
  }) => {
    if (!data.userId) throw new Error('ไม่พบผู้ใช้งาน')
    if (!data.note || !data.note.trim()) throw new Error('กรุณาระบุหมายเหตุ')
    if (!data.qty || data.qty <= 0) throw new Error('จำนวนต้องมากกว่า 0')

    const db = getDb()

    const recomputeAvgCost = (pid: number) => {
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

    return db.transaction(() => {
      if (data.mode === 'decrease') {
        const lots = db.prepare(`
          SELECT * FROM product_lots
          WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0 AND is_cancelled = 0
          ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC, id ASC
        `).all(productId) as any[]

        const totalAvail = lots.reduce((s, l) => s + Number(l.qty_on_hand), 0)
        if (data.qty > totalAvail) {
          throw new Error(`จำนวนที่ต้องการลด (${data.qty}) มากกว่าสต็อกที่มี (${totalAvail})`)
        }

        let remaining = data.qty
        const affected: any[] = []
        for (const lot of lots) {
          if (remaining <= 0) break
          const deduct = Math.min(remaining, Number(lot.qty_on_hand))
          const qtyBefore = Number(lot.qty_on_hand)
          const qtyAfter = qtyBefore - deduct

          const setParts = ['qty_on_hand = qty_on_hand - ?']
          const setVals: any[] = [deduct]
          if (qtyAfter <= 0) {
            setParts.push(`is_closed = 1`, `closed_at = datetime('now','localtime')`)
          }
          setParts.push(`updated_at = datetime('now','localtime')`)
          db.prepare(`UPDATE product_lots SET ${setParts.join(', ')} WHERE id = ?`).run(...setVals, lot.id)

          db.prepare(`
            INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)
            VALUES (?, ?, 'adjust_out', 'adjust', ?, ?, ?, ?, ?, ?)
          `).run(productId, lot.id, -deduct, qtyBefore, qtyAfter, lot.cost_price, data.note, data.userId)

          affected.push({
            lot_id: lot.id,
            lot_number: lot.lot_number,
            qty_deducted: deduct,
            qty_before: qtyBefore,
            qty_after: qtyAfter,
          })
          remaining -= deduct
        }

        recomputeAvgCost(productId)
        return { success: true, mode: 'decrease', affected_lots: affected }
      }

      if (data.mode === 'increase_new_lot') {
        const cost = Number(data.cost_price ?? 0)
        if (cost < 0) throw new Error('ต้นทุนต้องไม่ติดลบ')

        let lotNumber = (data.lot_number ?? '').trim()
        if (!lotNumber) {
          // Auto-generate ADJ-YYYYMMDD-NNN — unique per product per day
          const today = (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d
          const prefix = `ADJ-${today.replace(/-/g, '')}-`
          const last = db.prepare(`
            SELECT lot_number FROM product_lots
            WHERE product_id = ? AND lot_number LIKE ?
            ORDER BY lot_number DESC LIMIT 1
          `).get(productId, `${prefix}%`) as any
          const nextSeq = last
            ? String(Number(String(last.lot_number).slice(prefix.length)) + 1).padStart(3, '0')
            : '001'
          lotNumber = `${prefix}${nextSeq}`
        } else {
          const dup = db.prepare(`
            SELECT id FROM product_lots WHERE product_id = ? AND lot_number = ? LIMIT 1
          `).get(productId, lotNumber) as any
          if (dup) throw new Error(`มีล็อตหมายเลข "${lotNumber}" อยู่แล้วในสินค้านี้`)
        }

        const insertResult = db.prepare(`
          INSERT INTO product_lots (product_id, lot_number, expiry_date, manufactured_date, qty_received, qty_on_hand, cost_price, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          productId,
          lotNumber,
          data.expiry_date || null,
          data.manufactured_date || null,
          data.qty,
          data.qty,
          cost,
          data.note,
        )
        const newLotId = Number(insertResult.lastInsertRowid)

        db.prepare(`
          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)
          VALUES (?, ?, 'adjust_in', 'adjust', ?, 0, ?, ?, ?, ?)
        `).run(productId, newLotId, data.qty, data.qty, cost, data.note, data.userId)

        recomputeAvgCost(productId)
        return { success: true, mode: 'increase_new_lot', lot_id: newLotId, lot_number: lotNumber, cost_price: cost }
      }

      if (data.mode === 'increase_existing_lot') {
        if (!data.target_lot_id) throw new Error('กรุณาเลือกล็อตปลายทาง')
        const addedCost = Number(data.added_cost_price ?? 0)
        if (addedCost < 0) throw new Error('ต้นทุนต้องไม่ติดลบ')

        const lot = db.prepare(`SELECT * FROM product_lots WHERE id = ? AND product_id = ?`)
          .get(data.target_lot_id, productId) as any
        if (!lot) throw new Error('ไม่พบล็อตปลายทาง')
        if (lot.is_cancelled) throw new Error('ล็อตนี้ถูกยกเลิกแล้ว')

        const qtyBefore = Number(lot.qty_on_hand)
        const qtyAfter = qtyBefore + data.qty
        const oldQtyReceived = Number(lot.qty_received)
        const newQtyReceived = oldQtyReceived + data.qty
        const oldCost = Number(lot.cost_price)

        // Weighted avg within the lot: ((old_qty × old_cost) + (added_qty × added_cost)) / new_qty
        // This keeps the lot's total cost contribution (qty_received × cost_price) consistent
        // with summing the two events separately — products.cost_price ends up identical
        // whether the operator picked new-lot or existing-lot mode.
        const newLotCost = newQtyReceived > 0
          ? (oldQtyReceived * oldCost + data.qty * addedCost) / newQtyReceived
          : addedCost

        const setParts = [
          'qty_received = ?',
          'qty_on_hand = qty_on_hand + ?',
          'cost_price = ?',
          `updated_at = datetime('now','localtime')`,
        ]
        const setVals: any[] = [newQtyReceived, data.qty, newLotCost]
        if (lot.is_closed) {
          setParts.push('is_closed = 0', 'closed_at = NULL')
        }
        db.prepare(`UPDATE product_lots SET ${setParts.join(', ')} WHERE id = ?`)
          .run(...setVals, data.target_lot_id)

        db.prepare(`
          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)
          VALUES (?, ?, 'adjust_in', 'adjust', ?, ?, ?, ?, ?, ?)
        `).run(productId, data.target_lot_id, data.qty, qtyBefore, qtyAfter, addedCost, data.note, data.userId)

        if (Math.abs(newLotCost - oldCost) > 0.0001) {
          db.prepare(`
            INSERT INTO lot_cost_logs (lot_id, product_id, old_cost, new_cost, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(data.target_lot_id, productId, oldCost, newLotCost, `เพิ่มสต็อกเข้าล็อตเดิม: ${data.note}`, data.userId)
        }

        recomputeAvgCost(productId)
        return {
          success: true,
          mode: 'increase_existing_lot',
          lot_id: data.target_lot_id,
          lot_number: lot.lot_number,
          new_lot_cost: newLotCost,
        }
      }

      throw new Error('โหมดปรับสต็อกไม่ถูกต้อง')
    })()
  })

  // Product units — non-base variants only (แผง, กล่อง, …).
  // The base unit lives on products.unit_id (single source of truth).
  ipcMain.handle('products:addUnit', (_e, data: any) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO product_units (product_id, unit_id, barcode, qty_per_base, price_retail, price_wholesale1, price_wholesale2, is_for_sale, is_for_purchase, is_disabled)
      VALUES (@product_id, @unit_id, @barcode, @qty_per_base, @price_retail, @price_wholesale1, @price_wholesale2, @is_for_sale, @is_for_purchase, @is_disabled)
    `).run(data)
    return db.prepare(`SELECT pu.*, u.name as unit_name FROM product_units pu JOIN item_units u ON u.id = pu.unit_id WHERE pu.id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('products:updateUnit', (_e, id: number, data: any) => {
    const db = getDb()
    if (Object.keys(data).length === 0) return true
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

  // System A — FEFO stock-out (POS quick adjust)
  ipcMain.handle('products:adjustLot', (_e, payload: {
    product_id: number
    qty: number
    note: string
    user_id: number
  }) => {
    if (!payload.qty || payload.qty <= 0) throw new Error('จำนวนต้องมากกว่า 0')
    if (!payload.user_id) throw new Error('ไม่พบผู้ใช้งาน')

    const db = getDb()
    return db.transaction(() => {
      const lot = db.prepare(`
        SELECT * FROM product_lots
        WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0 AND is_cancelled = 0
        ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC
        LIMIT 1
      `).get(payload.product_id) as any

      if (!lot) throw new Error('ไม่พบล็อตสินค้าที่มีสต็อก')
      if (payload.qty > lot.qty_on_hand) throw new Error(`จำนวนที่ต้องการตัด (${payload.qty}) มากกว่าคงเหลือในล็อต (${lot.qty_on_hand})`)

      const qtyBefore = lot.qty_on_hand
      const qtyAfter = qtyBefore - payload.qty

      db.prepare(`UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?`).run(payload.qty, lot.id)
      db.prepare(`
        INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)
        VALUES (?, ?, 'adjust_out', 'adjust', ?, ?, ?, ?, ?, ?)
      `).run(payload.product_id, lot.id, -payload.qty, qtyBefore, qtyAfter, lot.cost_price, payload.note || null, payload.user_id)

      return { success: true, lot_number: lot.lot_number, expiry_date: lot.expiry_date, qty_before: qtyBefore, qty_after: qtyAfter }
    })()
  })

  // System A (batch) — Multi-item explicit-lot stock-out from POS adjust modal.
  // Atomic: any per-item failure rolls back the entire batch.
  ipcMain.handle('products:adjustLotBatch', (_e, payload: {
    items: Array<{ product_id: number; lot_id: number; qty: number }>
    reason: string
    user_id: number
  }) => {
    if (!payload.user_id) throw new Error('ไม่พบผู้ใช้งาน')
    if (!payload.reason || !payload.reason.trim()) throw new Error('กรุณาระบุสาเหตุ')
    if (!payload.items || payload.items.length === 0) throw new Error('ไม่มีรายการที่จะตัด')

    const db = getDb()
    return db.transaction(() => {
      const results: Array<{ product_id: number; lot_id: number; lot_number: string; qty_before: number; qty_after: number }> = []

      for (const item of payload.items) {
        if (!item.qty || item.qty <= 0) throw new Error('จำนวนต้องมากกว่า 0')

        const lot = db.prepare(`SELECT * FROM product_lots WHERE id = ?`).get(item.lot_id) as any
        if (!lot) throw new Error(`ไม่พบล็อต #${item.lot_id}`)
        if (lot.product_id !== item.product_id) throw new Error(`ล็อต ${lot.lot_number} ไม่ตรงกับสินค้าที่ระบุ`)
        if (lot.is_closed || lot.is_cancelled) throw new Error(`ล็อต ${lot.lot_number} ถูกปิดหรือยกเลิกแล้ว`)
        if (item.qty > lot.qty_on_hand) {
          throw new Error(`จำนวนที่ตัด (${item.qty}) มากกว่าคงเหลือในล็อต ${lot.lot_number} (${lot.qty_on_hand})`)
        }

        const qtyBefore = lot.qty_on_hand
        const qtyAfter = qtyBefore - item.qty

        db.prepare(`UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?`).run(item.qty, lot.id)
        db.prepare(`
          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)
          VALUES (?, ?, 'adjust_out', 'adjust', ?, ?, ?, ?, ?, ?)
        `).run(item.product_id, lot.id, -item.qty, qtyBefore, qtyAfter, lot.cost_price, payload.reason.trim(), payload.user_id)

        results.push({ product_id: item.product_id, lot_id: lot.id, lot_number: lot.lot_number, qty_before: qtyBefore, qty_after: qtyAfter })
      }

      return { success: true, count: results.length, items: results }
    })()
  })

  // System B — Direct lot edit (metadata + qty)
  ipcMain.handle('products:updateLot', (_e, id: number, data: {
    lot_number?: string
    expiry_date?: string | null
    manufactured_date?: string | null
    qty_on_hand?: number
    cost_price?: number
    user_id: number
  }) => {
    if (!data.user_id) throw new Error('ไม่พบผู้ใช้งาน')

    const db = getDb()
    return db.transaction(() => {
      const lot = db.prepare(`SELECT * FROM product_lots WHERE id = ?`).get(id) as any
      if (!lot) throw new Error('ไม่พบล็อต')

      // Block edits on cancelled lots (UI hides the button, but guard against direct IPC)
      if (lot.is_cancelled) throw new Error('ไม่สามารถแก้ไขล็อตที่ถูกยกเลิกได้')

      // Pre-flight: lot_number rename collision
      if (data.lot_number !== undefined && data.lot_number !== lot.lot_number) {
        const dup = db.prepare(`
          SELECT id FROM product_lots
          WHERE product_id = ? AND lot_number = ? AND id <> ?
          LIMIT 1
        `).get(lot.product_id, data.lot_number, id) as any
        if (dup) throw new Error(`มีล็อตหมายเลข "${data.lot_number}" อยู่แล้วในสินค้านี้`)
      }

      // qty must be non-negative
      if (data.qty_on_hand !== undefined && data.qty_on_hand < 0) {
        throw new Error('จำนวนคงเหลือต้องไม่ติดลบ')
      }

      const qtyChanged = data.qty_on_hand !== undefined && data.qty_on_hand !== lot.qty_on_hand
      const costChanged = data.cost_price !== undefined && Number(data.cost_price) !== Number(lot.cost_price)

      // Log qty change as stock movement
      if (qtyChanged) {
        const delta = data.qty_on_hand! - lot.qty_on_hand
        const movType = delta > 0 ? 'adjust_in' : 'adjust_out'
        db.prepare(`
          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)
          VALUES (?, ?, ?, 'manual_edit', ?, ?, ?, ?, 'แก้ไขโดยตรง', ?)
        `).run(lot.product_id, id, movType, delta, lot.qty_on_hand, data.qty_on_hand, lot.cost_price, data.user_id)
      }

      // Log cost_price change to lot_cost_logs (regulatory-significant for retroactive profit)
      if (costChanged) {
        db.prepare(`
          INSERT INTO lot_cost_logs (lot_id, product_id, old_cost, new_cost, note, created_by)
          VALUES (?, ?, ?, ?, 'แก้ไขราคาทุนผ่านหน้าล็อต', ?)
        `).run(id, lot.product_id, lot.cost_price, data.cost_price, data.user_id)
      }

      const updatable = ['lot_number', 'expiry_date', 'manufactured_date', 'qty_on_hand', 'cost_price'] as const
      const fields: string[] = []
      const vals: any = { id }
      for (const key of updatable) {
        if (key in data) { fields.push(`${key} = @${key}`); vals[key] = (data as any)[key] }
      }

      // Auto-toggle is_closed/closed_at when qty crosses the 0 boundary
      // - qty → 0: close the lot so it drops out of FEFO / stock queries (filter is_closed = 0)
      // - qty 0 → >0 on a previously-closed lot: reopen so the stock is visible again
      if (data.qty_on_hand !== undefined) {
        if (data.qty_on_hand <= 0) {
          fields.push(`is_closed = 1`, `closed_at = datetime('now','localtime')`)
        } else if (lot.is_closed) {
          fields.push(`is_closed = 0`, `closed_at = NULL`)
        }
      }

      if (fields.length === 0) return lot

      db.prepare(`UPDATE product_lots SET ${fields.join(', ')}, updated_at = datetime('now','localtime') WHERE id = @id`).run(vals)

      // Recompute products.cost_price (weighted avg of open lots by qty_received).
      // A lot's contribution to that avg changes whenever its cost_price changes OR
      // it transitions in/out of is_closed (qty crossing 0). Recompute on both.
      if (qtyChanged || costChanged) {
        const agg = db.prepare(`
          SELECT
            COALESCE(SUM(qty_received * cost_price), 0) as cost_sum,
            COALESCE(SUM(qty_received), 0) as qty_sum
          FROM product_lots
          WHERE product_id = ? AND qty_received > 0 AND is_closed = 0
        `).get(lot.product_id) as any
        if (agg.qty_sum > 0) {
          db.prepare(`UPDATE products SET cost_price = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
            .run(agg.cost_sum / agg.qty_sum, lot.product_id)
        }
      }

      return db.prepare(`SELECT * FROM product_lots WHERE id = ?`).get(id)
    })()
  })

  // System C — Full lot disposal from Expiry report.
  // Auto-classifies movement_type based on expiry_date vs today:
  //   expired      → expiry_date <= today
  //   near_expiry  → expiry_date >  today (or expiry_date IS NULL — disposed without expiry tracking)
  // Used ONLY by the Expiry / Expiring Products page. Other disposal flows are unaffected.
  ipcMain.handle('products:expireLot', (_e, lot_id: number, user_id: number) => {
    if (!user_id) throw new Error('ไม่พบผู้ใช้งาน')

    const db = getDb()
    return db.transaction(() => {
      const lot = db.prepare(`SELECT * FROM product_lots WHERE id = ?`).get(lot_id) as any
      if (!lot) throw new Error('ไม่พบล็อต')
      if (lot.qty_on_hand <= 0) throw new Error('ล็อตนี้ไม่มีสินค้าคงเหลือ')

      const today = (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d
      const isExpired = !!lot.expiry_date && lot.expiry_date <= today
      const movementType = isExpired ? 'expired' : 'near_expiry'
      const note = isExpired ? 'ตัดออกเนื่องจากหมดอายุ' : 'ตัดออกก่อนหมดอายุ'

      const qtyBefore = lot.qty_on_hand
      db.prepare(`UPDATE product_lots SET qty_on_hand = 0, is_closed = 1, closed_at = datetime('now','localtime') WHERE id = ?`).run(lot_id)
      db.prepare(`
        INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)
        VALUES (?, ?, ?, 'expiry_report', ?, ?, 0, ?, ?, ?)
      `).run(lot.product_id, lot_id, movementType, -qtyBefore, qtyBefore, lot.cost_price, note, user_id)

      return {
        success: true,
        product_id: lot.product_id,
        lot_number: lot.lot_number,
        qty_removed: qtyBefore,
        classification: movementType,
      }
    })()
  })
}
