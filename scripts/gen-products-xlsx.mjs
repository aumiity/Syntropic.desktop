// Generate an editable Excel workbook for the Hygeia product cleanup pass.
//
// Reads the JSON dumped by hygeia_export.py and writes ONE .xlsx the operator
// edits by hand before the import:
//   - trade_name / name_for_print : free-text edit
//   - category                    : dropdown (data validation, 12 Hygeia types)
//   - DELETE A ROW                 : that product will NOT be imported
//   - reference cols (grey)        : code / unit / stock / price / debt status
//
// The "สถานะหนี้" column flags the 275 products that sit on an unpaid credit
// bill — those are force-kept by the importer even if the row is deleted, so
// the outstanding payable stays correct. Deleting them is pointless (a warning).
//
// Run:  node scripts/gen-products-xlsx.mjs
//
// Real shop data stays OUTSIDE the repo: input from D:\Syntropic.Project\
// hygeia-export, output to D:\Syntropic.Project\products-edit.xlsx.
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')

const EXPORT_DIR = 'D:\\Syntropic.Project\\hygeia-export'
const OUT_XLSX = 'D:\\Syntropic.Project\\products-edit.xlsx'

// Shared header labels — the importer matches columns back BY THESE STRINGS,
// so keep them identical in import-hygeia.mjs (HEADERS).
export const HEADERS = {
  itemKey: 'ItemKey',
  code: 'รหัส',
  tradeName: 'ชื่อการค้า',
  nameForPrint: 'ชื่อบนใบเสร็จ/ฉลาก',
  category: 'หมวดหมู่',
  unit: 'หน่วย',
  stock: 'สต็อก',
  price: 'ราคาขายปลีก',
  debt: 'สถานะหนี้',
}

const load = (t) => JSON.parse(readFileSync(path.join(EXPORT_DIR, t + '.json'), 'utf8'))
const s = (v) => { if (v === null || v === undefined) return ''; const x = String(v).trim(); return x }
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
const bool = (v) => (v === true || v === 'True' || v === '1' || v === 1)

function main() {
  // ---- categories (ItemType) -> dropdown list, keyed by ItemTypeKey ----------
  const types = load('ItemType')
  const catName = new Map()                                    // ItemTypeKey -> Name
  for (const t of types) catName.set(String(t.ItemTypeKey), s(t.Name) || '(ไม่ระบุ)')
  const catList = [...new Set([...catName.values()])]          // unique names for dropdown

  // ---- current stock per item (sum across StockKey, skip cancelled) ----------
  const stockByItem = new Map()
  for (const r of load('StockCurrentBalance')) {
    if (bool(r.IsCanceled)) continue
    const k = String(r.ItemKey)
    stockByItem.set(k, (stockByItem.get(k) || 0) + num(r.Qty))
  }

  // ---- products on unpaid, not-cancelled credit bills (force-keep set) --------
  const unpaidHeaderKeys = new Set()
  if (existsSync(path.join(EXPORT_DIR, 'PurchaseReceiveHeader.json'))) {
    for (const h of load('PurchaseReceiveHeader')) {
      if (!bool(h.IsPay) && !bool(h.IsCanceled)) unpaidHeaderKeys.add(String(h.PurchaseReceiveHeaderKey))
    }
  }
  const unpaidReceiveKeys = new Set()
  if (existsSync(path.join(EXPORT_DIR, 'PurchaseReceive.json'))) {
    for (const r of load('PurchaseReceive')) {
      if (unpaidHeaderKeys.has(String(r.PurchaseReceiveHeaderKey))) unpaidReceiveKeys.add(String(r.PurchaseReceiveKey))
    }
  }
  const debtItemKeys = new Set()
  if (existsSync(path.join(EXPORT_DIR, 'PurchaseReceiveLot.json'))) {
    for (const L of load('PurchaseReceiveLot')) {
      if (unpaidReceiveKeys.has(String(L.PurchaseReceiveKey))) debtItemKeys.add(String(L.ItemKey))
    }
  }

  // ---- build workbook --------------------------------------------------------
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Syntropic Hygeia migration'
  wb.created = new Date()

  const ws = wb.addWorksheet('สินค้า', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],          // freeze ItemKey+code + header
  })

  // hidden sheet holding the dropdown source range
  const catSheet = wb.addWorksheet('_cats')
  catSheet.state = 'veryHidden'
  catList.forEach((c, i) => { catSheet.getCell(`A${i + 1}`).value = c })

  const cols = [
    { header: HEADERS.itemKey, key: 'itemKey', width: 10, ref: true },
    { header: HEADERS.code, key: 'code', width: 14, ref: true },
    { header: HEADERS.tradeName, key: 'tradeName', width: 42, edit: true },
    { header: HEADERS.nameForPrint, key: 'nameForPrint', width: 32, edit: true },
    { header: HEADERS.category, key: 'category', width: 18, edit: true, dropdown: true },
    { header: HEADERS.unit, key: 'unit', width: 10, ref: true },
    { header: HEADERS.stock, key: 'stock', width: 10, ref: true },
    { header: HEADERS.price, key: 'price', width: 12, ref: true },
    { header: HEADERS.debt, key: 'debt', width: 12, ref: true },
  ]
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  // ---- rows ------------------------------------------------------------------
  const items = load('Item')
  let debtRows = 0
  for (const r of items) {
    const k = String(r.ItemKey)
    const isDebt = debtItemKeys.has(k)
    if (isDebt) debtRows++
    ws.addRow({
      itemKey: r.ItemKey,
      code: s(r.Code),
      tradeName: s(r.Name) || '(ไม่ระบุชื่อ)',
      nameForPrint: s(r.NameForPrint),
      category: catName.get(String(r.ItemTypeKey)) || '',
      unit: s(r.SaleUnitName),
      stock: stockByItem.get(k) || 0,
      price: num(r.SalePrice),
      debt: isDebt ? 'ค้างชำระ' : '',
    })
  }

  // ---- styling ---------------------------------------------------------------
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { vertical: 'middle' }
  headerRow.height = 22
  headerRow.eachCell((cell, colNo) => {
    const c = cols[colNo - 1]
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.edit ? 'FF0E7C7B' : 'FF6B7280' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  })

  const lastRow = ws.rowCount
  const refFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  cols.forEach((c, idx) => {
    const colNo = idx + 1
    if (c.ref) {
      for (let r = 2; r <= lastRow; r++) ws.getCell(r, colNo).fill = refFill
    }
  })
  // right-align numeric reference columns
  for (const key of ['stock', 'price']) {
    const col = ws.getColumn(key); col.alignment = { horizontal: 'right' }
  }
  // debt warning column -> red text
  const debtCol = ws.getColumn('debt')
  for (let r = 2; r <= lastRow; r++) {
    const cell = ws.getCell(r, debtCol.number)
    if (cell.value) cell.font = { color: { argb: 'FFB91C1C' }, bold: true }
  }

  // ---- category dropdown (data validation) -----------------------------------
  const catColLetter = ws.getColumn('category').letter
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(`${catColLetter}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`_cats!$A$1:$A$${catList.length}`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'หมวดหมู่ไม่อยู่ในรายการ',
      error: 'ควรเลือกจากรายการ มิฉะนั้น importer จะใช้หมวดเดิม',
    }
  }

  // ---- autofilter on the header ----------------------------------------------
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }

  wb.xlsx.writeFile(OUT_XLSX).then(() => {
    console.log(`OK -> ${OUT_XLSX}`)
    console.log(`  ${items.length} products, ${catList.length} categories (dropdown)`)
    console.log(`  ${debtRows} products flagged ค้างชำระ (force-kept by importer)`)
    console.log(`  Edit: ${HEADERS.tradeName} / ${HEADERS.nameForPrint} / ${HEADERS.category}`)
    console.log(`  Delete a row = that product is NOT imported (debt rows are force-kept anyway)`)
  })
}

main()
