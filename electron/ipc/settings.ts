import { ipcMain } from 'electron'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db'
import { orderByBucket } from '../db/sortName'
import { hashSecret, genRecoveryCode, verifySecret } from '../auth/hash'
import { requireAdmin, getSession } from '../auth/session'
import { checkLocked, recordFailure, clearFailures } from '../auth/lockout'

type ThemeColorPayload = {
  token: string
  light: string
  dark: string
}

function resolveThemeCssPath() {
  const appPath = app.getAppPath()
  const candidates = [
    path.resolve(appPath, 'src/index.css'),
    path.resolve(process.cwd(), 'src/index.css'),
  ]
  const found = candidates.find(candidate => fs.existsSync(candidate))
  if (!found) {
    throw new Error('ไม่พบไฟล์ src/index.css สำหรับแก้ไขธีมสี')
  }
  return found
}

function parseVars(block: string) {
  const vars: Record<string, string> = {}
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    vars[m[1]] = m[2].trim()
  }
  return vars
}

function upsertVar(block: string, token: string, value: string) {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const lineRe = new RegExp(`(^\\s*${escapedToken}\\s*:\\s*)([^;]+)(;.*$)`, 'm')
  if (lineRe.test(block)) {
    return block.replace(lineRe, `$1${value}$3`)
  }
  const trimmed = block.replace(/\s*$/, '')
  return `${trimmed}\n    ${token}: ${value};`
}

function updateSelectorBlock(content: string, selector: ':root' | '.dark', updates: Record<string, string>) {
  const selectorRe = selector === ':root' ? /(:root\s*\{)([\s\S]*?)(\n\s*\})/m : /(\.dark\s*\{)([\s\S]*?)(\n\s*\})/m
  const match = content.match(selectorRe)
  if (!match) {
    throw new Error(`ไม่พบบล็อก ${selector} ในไฟล์ index.css`)
  }

  const [, open, body, close] = match
  let newBody = body
  for (const [token, value] of Object.entries(updates)) {
    newBody = upsertVar(newBody, token, value)
  }
  return content.replace(selectorRe, `${open}${newBody}${close}`)
}

function getHtmlFontSize(css: string) {
  const htmlBlock = css.match(/html\s*\{([\s\S]*?)\}/m)
  if (!htmlBlock) return null
  const fontSizeMatch = htmlBlock[1].match(/font-size\s*:\s*([^;]+);/m)
  if (!fontSizeMatch) return null
  return fontSizeMatch[1].trim()
}

function setHtmlFontSize(css: string, value: string) {
  const htmlBlockRe = /(html\s*\{)([\s\S]*?)(\})/m
  const htmlBlock = css.match(htmlBlockRe)
  if (!htmlBlock) {
    return `${css}\n\nhtml { font-size: ${value}; }\n`
  }

  const [, open, body, close] = htmlBlock
  const bodyWithFontSize = /font-size\s*:/m.test(body)
    ? body.replace(/(font-size\s*:\s*)([^;]+)(;)/m, `$1${value}$3`)
    : `${body.replace(/\s*$/, '')}\n  font-size: ${value};\n`

  return css.replace(htmlBlockRe, `${open}${bodyWithFontSize}${close}`)
}

export function registerSettingsHandlers() {
  // Shop settings
  ipcMain.handle('settings:getShop', () => {
    return getDb().prepare(`SELECT * FROM settings LIMIT 1`).get()
  })
  ipcMain.handle('settings:saveShop', (_e, data: any) => {
    requireAdmin(_e)
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

  // First-run setup: atomically write shop identity + the one-time VAT decision
  // and flip the setup_completed gate, all in ONE transaction so onboarding can
  // never half-complete. Columns are listed explicitly (not a dynamic Object.keys
  // spread) per the allow-list invariant. Payload shape:
  //   { shop: {shop_name, shop_address, shop_phone, shop_license_no, shop_line_id,
  //            shop_tax_id, shop_branch, vat_registered_date},
  //     vat:  {vat_enabled, vat_rate} }
  ipcMain.handle('settings:completeSetup', (_e, payload: any) => {
    const db = getDb()
    const shop = payload?.shop ?? {}
    const vat = payload?.vat ?? {}
    const shopData = {
      shop_name: shop.shop_name ?? '',
      shop_address: shop.shop_address ?? '',
      shop_phone: shop.shop_phone ?? '',
      shop_license_no: shop.shop_license_no ?? '',
      shop_line_id: shop.shop_line_id ?? '',
      shop_tax_id: shop.shop_tax_id ?? '',
      shop_branch: shop.shop_branch ?? 'สำนักงานใหญ่',
      vat_registered_date: shop.vat_registered_date ?? null,
    }
    let recoveryCode: string | null = null
    db.transaction(() => {
      const existing = db.prepare(`SELECT id FROM settings LIMIT 1`).get() as any
      if (existing) {
        db.prepare(`
          UPDATE settings SET
            shop_name = @shop_name, shop_address = @shop_address, shop_phone = @shop_phone,
            shop_license_no = @shop_license_no, shop_line_id = @shop_line_id,
            shop_tax_id = @shop_tax_id, shop_branch = @shop_branch,
            vat_registered_date = @vat_registered_date,
            setup_completed = 1, setup_completed_at = datetime('now','localtime'),
            updated_at = datetime('now','localtime')
          WHERE id = @id
        `).run({ ...shopData, id: existing.id })
      } else {
        db.prepare(`
          INSERT INTO settings (
            shop_name, shop_address, shop_phone, shop_license_no, shop_line_id,
            shop_tax_id, shop_branch, vat_registered_date,
            setup_completed, setup_completed_at
          ) VALUES (
            @shop_name, @shop_address, @shop_phone, @shop_license_no, @shop_line_id,
            @shop_tax_id, @shop_branch, @vat_registered_date,
            1, datetime('now','localtime')
          )
        `).run(shopData)
      }
      // VAT decision → sales_settings (ensure-row-then-UPDATE singleton, mirrors
      // saveSalesSettings so a first-ever write persists instead of bare defaults).
      let srow = db.prepare(`SELECT id FROM sales_settings LIMIT 1`).get() as any
      if (!srow) {
        const r = db.prepare(`INSERT INTO sales_settings DEFAULT VALUES`).run()
        srow = { id: r.lastInsertRowid }
      }
      db.prepare(`UPDATE sales_settings SET vat_enabled = @vat_enabled, vat_rate = @vat_rate, updated_at = datetime('now','localtime') WHERE id = @id`)
        .run({ vat_enabled: vat.vat_enabled ? 1 : 0, vat_rate: Number(vat.vat_rate) || 7, id: srow.id })

      // Phase 0 bootstrap: set the admin password + a one-time recovery code.
      // Only the hashes are stored; the plaintext code is returned once.
      if (payload?.adminPassword) {
        recoveryCode = genRecoveryCode()
        db.prepare(`
          UPDATE users SET password = @password, recovery_code_hash = @recovery, updated_at = datetime('now','localtime')
          WHERE email = 'admin@syntropic.local'
        `).run({ password: hashSecret(payload.adminPassword), recovery: hashSecret(recoveryCode) })
      }
    })()
    const settingsRow = db.prepare(`SELECT * FROM settings LIMIT 1`).get() as any
    return { ...settingsRow, recoveryCode }
  })

  // Categories
  ipcMain.handle('settings:listCategories', () => {
    return getDb().prepare(`SELECT * FROM product_categories ORDER BY sort_order, id`).all()
  })
  ipcMain.handle('settings:saveCategory', (_e, data: any) => {
    requireAdmin(_e)
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
  // Drag-and-drop reorder: renumber sort_order to 1..n by the given id order,
  // in one transaction so listCategories (ORDER BY sort_order, id) is stable.
  ipcMain.handle('settings:reorderCategories', (_e, ids: number[]) => {
    requireAdmin(_e)
    const db = getDb()
    const upd = db.prepare(`UPDATE product_categories SET sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    db.transaction((order: number[]) => {
      order.forEach((id, i) => upd.run(i + 1, id))
    })(ids)
    return db.prepare(`SELECT * FROM product_categories ORDER BY sort_order, id`).all()
  })

  // Item units
  ipcMain.handle('settings:listUnits', () => {
    return getDb().prepare(`
      SELECT u.*, COUNT(DISTINCT pu.product_id) as usage_count
      FROM item_units u
      LEFT JOIN product_units pu ON pu.unit_id = u.id
      GROUP BY u.id ORDER BY ${orderByBucket('u.name')}
    `).all()
  })
  ipcMain.handle('settings:saveUnit', (_e, data: any) => {
    requireAdmin(_e)
    const db = getDb()
    if (data.id) {
      db.prepare(`UPDATE item_units SET name = ? WHERE id = ?`).run(data.name, data.id)
      return db.prepare(`SELECT * FROM item_units WHERE id = ?`).get(data.id)
    }
    const result = db.prepare(`INSERT INTO item_units (name) VALUES (?)`).run(data.name)
    return db.prepare(`SELECT * FROM item_units WHERE id = ?`).get(result.lastInsertRowid)
  })

  // Drug types
  ipcMain.handle('settings:listDrugTypes', () => {
    return getDb().prepare(`SELECT * FROM drug_types ORDER BY id`).all()
  })
  ipcMain.handle('settings:saveDrugType', (_e, data: any) => {
    requireAdmin(_e)
    const db = getDb()
    if (data.id) {
      const { id, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE drug_types SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run(data)
      return db.prepare(`SELECT * FROM drug_types WHERE id = ?`).get(id)
    }
    const result = db.prepare(`INSERT INTO drug_types (code, name_th, is_fda9, is_fda10, is_fda11, is_fda13) VALUES (@code, @name_th, @is_fda9, @is_fda10, @is_fda11, @is_fda13)`).run(data)
    return db.prepare(`SELECT * FROM drug_types WHERE id = ?`).get(result.lastInsertRowid)
  })

  // Dosage forms
  ipcMain.handle('settings:listDosageForms', () => {
    return getDb().prepare(`SELECT * FROM dosage_forms WHERE is_disabled = 0 ORDER BY ${orderByBucket('name_th')}`).all()
  })

  // Label frequencies/dosages/etc.
  ipcMain.handle('settings:listLabelFrequencies', () => getDb().prepare(`SELECT * FROM label_frequencies ORDER BY sort_order`).all())
  ipcMain.handle('settings:listLabelDosages', () => getDb().prepare(`SELECT * FROM label_dosages ORDER BY sort_order`).all())
  ipcMain.handle('settings:listLabelMealRelations', () => getDb().prepare(`SELECT * FROM label_meal_relations ORDER BY sort_order`).all())
  ipcMain.handle('settings:listLabelTimes', () => getDb().prepare(`SELECT * FROM label_times ORDER BY sort_order`).all())
  ipcMain.handle('settings:listLabelAdvices', () => getDb().prepare(`SELECT * FROM label_advices ORDER BY sort_order`).all())

  // Label settings (singleton). ORDER BY id keeps reads deterministic if a
  // legacy DB ended up with multiple rows; the seed now guarantees only one.
  ipcMain.handle('settings:getLabelSettings', () => {
    return getDb().prepare(`SELECT * FROM label_settings ORDER BY id LIMIT 1`).get()
  })
  ipcMain.handle('settings:saveLabelSettings', (_e, data: any) => {
    requireAdmin(_e)
    const db = getDb()
    const existing = db.prepare(`SELECT id FROM label_settings ORDER BY id LIMIT 1`).get() as any
    if (existing) {
      const { id: _drop, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      // Bind id as @id (named) — mixing `?` with an object binding throws
      // "Too few parameter values were provided" in better-sqlite3.
      db.prepare(`UPDATE label_settings SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`)
        .run({ ...rest, id: existing.id })
    } else {
      db.prepare(`INSERT INTO label_settings DEFAULT VALUES`).run()
    }
    return db.prepare(`SELECT * FROM label_settings ORDER BY id LIMIT 1`).get()
  })

  // Sales settings (singleton) — POS cart alert thresholds and toggles.
  // First read auto-inserts a default row so the renderer always gets a complete object.
  ipcMain.handle('settings:getSalesSettings', () => {
    const db = getDb()
    let row = db.prepare(`SELECT * FROM sales_settings LIMIT 1`).get()
    if (!row) {
      db.prepare(`INSERT INTO sales_settings DEFAULT VALUES`).run()
      row = db.prepare(`SELECT * FROM sales_settings LIMIT 1`).get()
    }
    return row
  })
  ipcMain.handle('settings:saveSalesSettings', (_e, data: any) => {
    requireAdmin(_e)
    const db = getDb()
    db.transaction(() => {
      // Ensure the singleton row exists, then UPDATE with the submitted form —
      // so a first-ever save (no row yet) still persists the values instead of
      // silently inserting bare defaults.
      let row = db.prepare(`SELECT id FROM sales_settings LIMIT 1`).get() as any
      if (!row) {
        const r = db.prepare(`INSERT INTO sales_settings DEFAULT VALUES`).run()
        row = { id: r.lastInsertRowid }
      }
      // vat_enabled/vat_rate are NOT saveable here — VAT mode is a one-time
      // decision (setup wizard / settings:upgradeToVat) and must never be
      // flippable via the generic settings save, even by a crafted payload.
      const { id, updated_at, vat_enabled, vat_rate, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      if (fields) {
        db.prepare(`UPDATE sales_settings SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run({ ...rest, id: row.id })
      }
    })()
    return db.prepare(`SELECT * FROM sales_settings LIMIT 1`).get()
  })

  // One-way upgrade to VAT-registered mode (Phase 3). Requires admin, the
  // 13-digit tax id, and an effective date; writes shop registration data +
  // flips sales_settings.vat_enabled in ONE transaction and records the
  // transition in vat_audit_log. There is deliberately NO downgrade handler —
  // a VAT shop charges VAT from the effective date onward, period.
  ipcMain.handle('settings:upgradeToVat', (e, payload: any) => {
    requireAdmin(e)
    const db = getDb()
    const taxId = String(payload?.tax_id ?? '').trim()
    const branch = String(payload?.branch ?? '').trim() || 'สำนักงานใหญ่'
    const rate = Number(payload?.vat_rate)
    const effectiveDate = String(payload?.effective_date ?? '').trim()
    if (!/^\d{13}$/.test(taxId)) throw new Error('เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก')
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) throw new Error('อัตราภาษีไม่ถูกต้อง')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error('กรุณาระบุวันที่จดทะเบียน VAT')

    const current = db.prepare(`SELECT vat_enabled FROM sales_settings LIMIT 1`).get() as any
    if (current?.vat_enabled === 1) throw new Error('ร้านอยู่ในโหมดจดทะเบียน VAT อยู่แล้ว')

    const userId = getSession(e.sender.id)?.userId ?? null
    db.transaction(() => {
      const settingsRow = db.prepare(`SELECT id FROM settings LIMIT 1`).get() as any
      if (!settingsRow) throw new Error('ยังไม่ได้ตั้งค่าข้อมูลร้าน')
      db.prepare(`
        UPDATE settings SET
          shop_tax_id = @tax_id, shop_branch = @branch,
          vat_registered_date = @effective_date,
          updated_at = datetime('now','localtime')
        WHERE id = @id
      `).run({ tax_id: taxId, branch, effective_date: effectiveDate, id: settingsRow.id })

      let srow = db.prepare(`SELECT id FROM sales_settings LIMIT 1`).get() as any
      if (!srow) {
        const r = db.prepare(`INSERT INTO sales_settings DEFAULT VALUES`).run()
        srow = { id: r.lastInsertRowid }
      }
      db.prepare(`UPDATE sales_settings SET vat_enabled = 1, vat_rate = @rate, updated_at = datetime('now','localtime') WHERE id = @id`)
        .run({ rate, id: srow.id })

      db.prepare(`
        INSERT INTO vat_audit_log (action, tax_id, branch, vat_rate, effective_date, performed_by)
        VALUES ('upgrade', @tax_id, @branch, @rate, @effective_date, @performed_by)
      `).run({ tax_id: taxId, branch, rate, effective_date: effectiveDate, performed_by: userId })
    })()
    return db.prepare(`SELECT * FROM sales_settings LIMIT 1`).get()
  })

  // Guarded downgrade out of VAT mode. Beyond the admin session, the LOGGED-IN
  // admin must re-enter their own password (same scrypt verify + lockout
  // backoff as login — ties accountability to the person who clicked) and give
  // a mandatory reason; both go into vat_audit_log (action 'downgrade').
  // Registration data (tax id / branch / registered date) is deliberately KEPT
  // in settings so a later re-upgrade prefills. Old bills keep their VAT
  // snapshots untouched — past ภาษีขาย stays reportable.
  ipcMain.handle('settings:downgradeFromVat', (e, payload: { password?: string; reason?: string }) => {
    requireAdmin(e)
    const db = getDb()
    const session = getSession(e.sender.id)
    if (!session) throw new Error('FORBIDDEN')
    const reason = String(payload?.reason ?? '').trim()
    const password = String(payload?.password ?? '')
    if (!reason) throw new Error('กรุณาระบุเหตุผลในการปิดระบบ VAT')
    if (!password) throw new Error('กรุณายืนยันรหัสผ่าน')

    const current = db.prepare(`SELECT vat_enabled, vat_rate FROM sales_settings LIMIT 1`).get() as any
    if (current?.vat_enabled !== 1) throw new Error('ร้านไม่ได้อยู่ในโหมดจดทะเบียน VAT')

    const lock = checkLocked(db, session.userId)
    if (lock.locked) {
      const err = new Error('LOCKED') as Error & { remainingMs?: number }
      err.remainingMs = lock.remainingMs
      throw err
    }
    const userRow = db.prepare(`SELECT id, role, password FROM users WHERE id = ? AND is_disabled = 0`)
      .get(session.userId) as { id: number; role: string; password: string } | undefined
    if (!userRow || userRow.role !== 'admin' || !verifySecret(password, userRow.password).ok) {
      if (userRow) recordFailure(db, userRow.id)
      throw new Error('รหัสผ่านไม่ถูกต้อง')
    }
    clearFailures(db, userRow.id)

    const shop = db.prepare(`SELECT shop_tax_id, shop_branch FROM settings LIMIT 1`).get() as any
    db.transaction(() => {
      db.prepare(`UPDATE sales_settings SET vat_enabled = 0, updated_at = datetime('now','localtime') WHERE vat_enabled = 1`).run()
      db.prepare(`
        INSERT INTO vat_audit_log (action, tax_id, branch, vat_rate, effective_date, reason, performed_by)
        VALUES ('downgrade', @tax_id, @branch, @rate, date('now','localtime'), @reason, @performed_by)
      `).run({
        tax_id: shop?.shop_tax_id ?? '', branch: shop?.shop_branch ?? '',
        rate: Number(current.vat_rate) || 7, reason, performed_by: session.userId,
      })
    })()
    return db.prepare(`SELECT * FROM sales_settings LIMIT 1`).get()
  })

  // Whether the DB carries any VAT history (VAT bills, input VAT, or mode
  // transitions). Drives the Reports "ภาษี (VAT)" tab for downgraded shops —
  // past periods must stay inspectable (ภ.พ.30 งวดสุดท้าย / ตรวจย้อนหลัง).
  ipcMain.handle('settings:hasVatHistory', () => {
    const db = getDb()
    const row = db.prepare(`
      SELECT EXISTS(SELECT 1 FROM sales WHERE total_vat > 0)
          OR EXISTS(SELECT 1 FROM vat_audit_log)
          OR EXISTS(SELECT 1 FROM purchase_receipts WHERE COALESCE(vat_mode,'none') != 'none')
          AS has
    `).get() as any
    return !!row?.has
  })

  // Receipt / cash-slip settings (singleton). Uses the ensure-row-then-UPDATE
  // pattern (NOT label_settings' INSERT-DEFAULT-then-skip-payload bug) so a
  // first-ever save persists the submitted values instead of bare defaults.
  ipcMain.handle('settings:getReceiptSettings', () => {
    const db = getDb()
    let row = db.prepare(`SELECT * FROM receipt_settings ORDER BY id LIMIT 1`).get()
    if (!row) {
      db.prepare(`INSERT INTO receipt_settings DEFAULT VALUES`).run()
      row = db.prepare(`SELECT * FROM receipt_settings ORDER BY id LIMIT 1`).get()
    }
    return row
  })
  ipcMain.handle('settings:saveReceiptSettings', (_e, data: any) => {
    requireAdmin(_e)
    const db = getDb()
    db.transaction(() => {
      let row = db.prepare(`SELECT id FROM receipt_settings ORDER BY id LIMIT 1`).get() as any
      if (!row) {
        const r = db.prepare(`INSERT INTO receipt_settings DEFAULT VALUES`).run()
        row = { id: r.lastInsertRowid }
      }
      const { id, updated_at, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      if (fields) {
        db.prepare(`UPDATE receipt_settings SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`)
          .run({ ...rest, id: row.id })
      }
    })()
    return db.prepare(`SELECT * FROM receipt_settings ORDER BY id LIMIT 1`).get()
  })

  // A4 document settings (singleton) — printer + copies shared by every
  // full-page document (tax invoice, goods receipt, quotation). Same
  // ensure-row-then-UPDATE pattern as receipt_settings so a first-ever save
  // persists the submitted values instead of bare defaults.
  ipcMain.handle('settings:getDocumentSettings', () => {
    const db = getDb()
    let row = db.prepare(`SELECT * FROM document_settings ORDER BY id LIMIT 1`).get()
    if (!row) {
      db.prepare(`INSERT INTO document_settings DEFAULT VALUES`).run()
      row = db.prepare(`SELECT * FROM document_settings ORDER BY id LIMIT 1`).get()
    }
    return row
  })
  ipcMain.handle('settings:saveDocumentSettings', (_e, data: any) => {
    requireAdmin(_e)
    const db = getDb()
    db.transaction(() => {
      let row = db.prepare(`SELECT id FROM document_settings ORDER BY id LIMIT 1`).get() as any
      if (!row) {
        const r = db.prepare(`INSERT INTO document_settings DEFAULT VALUES`).run()
        row = { id: r.lastInsertRowid }
      }
      const { id, updated_at, ...rest } = data
      const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
      if (fields) {
        db.prepare(`UPDATE document_settings SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`)
          .run({ ...rest, id: row.id })
      }
    })()
    return db.prepare(`SELECT * FROM document_settings ORDER BY id LIMIT 1`).get()
  })

  // All item units (for dropdowns)
  ipcMain.handle('settings:allUnits', () => {
    return getDb().prepare(`SELECT * FROM item_units ORDER BY ${orderByBucket('name')}`).all()
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
    return getDb().prepare(`SELECT * FROM dosage_forms WHERE is_disabled = 0 ORDER BY ${orderByBucket('name_th')}`).all()
  })

  // Theme color tokens in src/index.css
  ipcMain.handle('settings:getThemeColors', () => {
    const cssPath = resolveThemeCssPath()
    const css = fs.readFileSync(cssPath, 'utf8')
    const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\s*\}/m)
    const darkMatch = css.match(/\.dark\s*\{([\s\S]*?)\n\s*\}/m)
    if (!rootMatch || !darkMatch) {
      throw new Error('ไม่พบบล็อก :root หรือ .dark ในไฟล์ index.css')
    }

    return {
      path: cssPath,
      root: parseVars(rootMatch[1]),
      dark: parseVars(darkMatch[1]),
    }
  })

  ipcMain.handle('settings:saveThemeColors', (_e, payload: ThemeColorPayload[]) => {
    requireAdmin(_e)
    const cssPath = resolveThemeCssPath()
    const css = fs.readFileSync(cssPath, 'utf8')

    const rootUpdates: Record<string, string> = {}
    const darkUpdates: Record<string, string> = {}
    for (const row of payload ?? []) {
      if (!row?.token || !/^--[a-z0-9-]+$/i.test(row.token)) continue
      if (typeof row.light === 'string' && row.light.trim()) rootUpdates[row.token] = row.light.trim()
      if (typeof row.dark === 'string' && row.dark.trim()) darkUpdates[row.token] = row.dark.trim()
    }

    let updated = css
    if (Object.keys(rootUpdates).length) {
      updated = updateSelectorBlock(updated, ':root', rootUpdates)
    }
    if (Object.keys(darkUpdates).length) {
      updated = updateSelectorBlock(updated, '.dark', darkUpdates)
    }

    fs.writeFileSync(cssPath, updated, 'utf8')
    return true
  })

  ipcMain.handle('settings:getThemeFontSize', () => {
    const cssPath = resolveThemeCssPath()
    const css = fs.readFileSync(cssPath, 'utf8')
    return getHtmlFontSize(css) ?? '18px'
  })

  ipcMain.handle('settings:saveThemeFontSize', (_e, fontSize: string) => {
    requireAdmin(_e)
    const value = String(fontSize ?? '').trim()
    if (!/^\d+(\.\d+)?px$/i.test(value)) {
      throw new Error('รูปแบบขนาดฟอนต์ไม่ถูกต้อง (ตัวอย่าง: 18px)')
    }
    const cssPath = resolveThemeCssPath()
    const css = fs.readFileSync(cssPath, 'utf8')
    const updated = setHtmlFontSize(css, value)
    fs.writeFileSync(cssPath, updated, 'utf8')
    return true
  })

  ipcMain.handle('settings:getThemeFonts', () => {
    const cssPath = resolveThemeCssPath()
    const css = fs.readFileSync(cssPath, 'utf8')
    const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\s*\}/m)
    const vars = rootMatch ? parseVars(rootMatch[1]) : {}
    return {
      latin: vars['--font-latin'] ?? "'Inter'",
      thai: vars['--font-thai'] ?? "'Sarabun'",
    }
  })

  ipcMain.handle('settings:saveThemeFonts', (_e, payload: { latin: string; thai: string }) => {
    requireAdmin(_e)
    const latin = String(payload?.latin ?? '').trim()
    const thai = String(payload?.thai ?? '').trim()
    if (!latin || !thai) {
      throw new Error('ต้องระบุฟอนต์ทั้ง Latin และ Thai')
    }
    const cssPath = resolveThemeCssPath()
    const css = fs.readFileSync(cssPath, 'utf8')
    const updated = updateSelectorBlock(css, ':root', {
      '--font-latin': latin,
      '--font-thai': thai,
    })
    fs.writeFileSync(cssPath, updated, 'utf8')
    return true
  })
}
