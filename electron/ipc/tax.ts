import { ipcMain } from 'electron'
import { getDb } from '../db'

// Full tax invoices (ใบกำกับภาษีเต็มรูป, ม.86/4). One row per sale; the sale's
// invoice_no (RC-) is reused as the running serial number (doc_no). Buyer fields
// are a snapshot taken at issue time. The first issue prints the "ต้นฉบับ";
// every subsequent issue is a "สำเนา" (gated by original_printed).
export function registerTaxHandlers() {
  ipcMain.handle('tax:get', (_e, saleId: number) => {
    return getDb().prepare(`SELECT * FROM tax_invoices WHERE sale_id = ?`).get(saleId) ?? null
  })

  // Upsert the buyer snapshot and return { record, copy }. `copy` = true means
  // the original has already been printed before, so the caller should stamp
  // "สำเนา" on this print; false = first issue → "ต้นฉบับ".
  ipcMain.handle('tax:issueOrGet', (_e, payload: {
    sale_id: number
    buyer_name: string
    buyer_address: string
    buyer_tax_id?: string
    buyer_branch?: string
    issued_by?: number | null
  }) => {
    const db = getDb()
    const sale = db.prepare(`SELECT id, invoice_no, status, sale_type FROM sales WHERE id = ?`)
      .get(payload.sale_id) as { id: number; invoice_no: string; status: string; sale_type: string } | undefined
    if (!sale) throw new Error('ไม่พบรายการขาย')
    // Defensive guard mirroring the UI: never issue a tax invoice for a voided
    // bill or a return document.
    if (sale.status === 'voided') throw new Error('บิลถูกยกเลิก ไม่สามารถออกใบกำกับภาษีได้')
    if (sale.sale_type === 'return') throw new Error('บิลรับคืนสินค้า ไม่สามารถออกใบกำกับภาษีได้')

    const issue = db.transaction(() => {
      const existing = db.prepare(`SELECT * FROM tax_invoices WHERE sale_id = ?`).get(sale.id) as any
      const copy = !!existing && existing.original_printed === 1
      if (existing) {
        db.prepare(`
          UPDATE tax_invoices SET
            buyer_name = @buyer_name, buyer_address = @buyer_address,
            buyer_tax_id = @buyer_tax_id, buyer_branch = @buyer_branch,
            updated_at = datetime('now','localtime')
          WHERE sale_id = @sale_id
        `).run({
          sale_id: sale.id,
          buyer_name: payload.buyer_name ?? '',
          buyer_address: payload.buyer_address ?? '',
          buyer_tax_id: payload.buyer_tax_id ?? '',
          buyer_branch: payload.buyer_branch ?? '',
        })
      } else {
        db.prepare(`
          INSERT INTO tax_invoices (sale_id, doc_no, buyer_name, buyer_address, buyer_tax_id, buyer_branch, original_printed, issued_by)
          VALUES (@sale_id, @doc_no, @buyer_name, @buyer_address, @buyer_tax_id, @buyer_branch, 0, @issued_by)
        `).run({
          sale_id: sale.id,
          doc_no: sale.invoice_no,
          buyer_name: payload.buyer_name ?? '',
          buyer_address: payload.buyer_address ?? '',
          buyer_tax_id: payload.buyer_tax_id ?? '',
          buyer_branch: payload.buyer_branch ?? '',
          issued_by: payload.issued_by ?? null,
        })
      }
      const record = db.prepare(`SELECT * FROM tax_invoices WHERE sale_id = ?`).get(sale.id)
      return { record, copy }
    })
    return issue()
  })

  // Lock the bill AFTER a successful "ต้นฉบับ" print — deferred from issueOrGet
  // so a cancelled/failed print never permanently locks a bill (P0). Sets the
  // flag only when it's still 0 (idempotent); a re-print of an already-locked
  // bill is a สำเนา and never reaches here.
  ipcMain.handle('tax:confirmOriginalPrinted', (_e, saleId: number) => {
    getDb().prepare(`UPDATE tax_invoices SET original_printed = 1, updated_at = datetime('now','localtime')
      WHERE sale_id = ? AND original_printed = 0`).run(saleId)
    return true
  })
}
