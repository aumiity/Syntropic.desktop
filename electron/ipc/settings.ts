import { ipcMain } from 'electron'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db'

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
}
