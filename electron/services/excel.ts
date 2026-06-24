import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

// Excel workbook builder for the export feature. Datasets pass plain
// SheetSpec[] — header rows of objects keyed by column `key` — and this writes
// a real .xlsx (NOT CSV). Why .xlsx and not CSV: a CSV silently mangles Thai
// (needs a BOM), turns barcodes/lots into scientific notation, and drops the
// leading zeros on lot numbers. Here a column declared `type:'text'` gets the
// '@' number format so a barcode/lot/tax-id renders as the literal string, and
// `type:'currency'/'number'` stays a real number so Excel SUM works.
//
// Dates are passed in ALREADY formatted as DD/MM/YYYY text (via fmtDate) and
// declared as `type:'text'` columns — the one-format date invariant wins over
// Excel's native date sort (documented trade-off in the plan).

export type SheetColumnType = 'text' | 'number' | 'currency' | 'date'

export interface SheetColumn {
  header: string
  key: string
  width?: number
  type?: SheetColumnType
}

export interface SheetSpec {
  name: string
  columns: SheetColumn[]
  rows: Record<string, any>[]
}

// ISO/any parseable date → DD/MM/YYYY (Christian era). Blank/invalid → ''.
// Mirrors the app-wide formatDate default so exported dates match the screen.
export function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = dayjs(iso)
  return d.isValid() ? d.format('DD/MM/YYYY') : ''
}

const NUM_FMT: Record<SheetColumnType, string | null> = {
  text: '@',
  currency: '#,##0.00',
  number: '#,##0',
  date: null, // dates arrive as DD/MM/YYYY text — treated like a text column
}

export async function writeWorkbook(filePath: string, sheets: SheetSpec[]): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Syntropic'
  wb.created = new Date()

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name)
    ws.columns = sheet.columns.map(c => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 16,
    }))

    // Header band — bold + frozen + autofilter.
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    headerRow.alignment = { vertical: 'middle' }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    if (sheet.columns.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } }
    }

    // Per-column number format (text barcode, currency, integer).
    sheet.columns.forEach((c, i) => {
      const fmt = c.type ? NUM_FMT[c.type] : null
      if (fmt) ws.getColumn(i + 1).numFmt = fmt
    })

    for (const row of sheet.rows) ws.addRow(row)
  }

  await wb.xlsx.writeFile(filePath)
}
