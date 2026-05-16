import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import dayjs from 'dayjs'
import { getDb } from '../db'
import { matchLines, buildCsv, normalize, type ExportRow } from '../services/matcher'

export function registerMatcherHandlers() {
  // Match pasted invoice lines against the product master.
  ipcMain.handle(
    'matcher:matchLines',
    (_e, supplierId: number, lines: string[]) => {
      return matchLines(getDb(), supplierId, lines ?? [])
    },
  )

  // Bulk upsert human-confirmed aliases. supplier_text is normalized here so
  // the stored key always matches the lookup key.
  ipcMain.handle(
    'matcher:saveAliases',
    (
      _e,
      rows: Array<{
        supplierId: number
        supplierText: string
        productId: number
        confidence?: number
        confirmedBy?: number
      }>,
    ) => {
      const db = getDb()
      const stmt = db.prepare(
        `INSERT INTO supplier_product_alias
           (supplier_id, supplier_text, product_id, confidence, confirmed_by)
         VALUES (@supplier_id, @supplier_text, @product_id, @confidence, @confirmed_by)
         ON CONFLICT(supplier_id, supplier_text) DO UPDATE SET
           product_id   = excluded.product_id,
           confidence   = excluded.confidence,
           confirmed_by = excluded.confirmed_by,
           confirmed_at = datetime('now','localtime')`,
      )
      const tx = db.transaction(
        (items: typeof rows) => {
          for (const r of items) {
            const text = normalize(r.supplierText ?? '')
            if (!text || !r.supplierId || !r.productId) continue
            stmt.run({
              supplier_id: r.supplierId,
              supplier_text: text,
              product_id: r.productId,
              confidence: r.confidence ?? 1.0,
              confirmed_by: r.confirmedBy ?? null,
            })
          }
        },
      )
      tx(rows ?? [])
      return { ok: true }
    },
  )

  // Management / debug: list a supplier's aliases.
  ipcMain.handle('matcher:listAliases', (_e, supplierId: number) => {
    return getDb()
      .prepare(
        `SELECT a.id, a.supplier_text, a.product_id, a.confidence,
                a.confirmed_at, p.trade_name, p.code
           FROM supplier_product_alias a
           JOIN products p ON p.id = a.product_id
          WHERE a.supplier_id = ?
          ORDER BY a.confirmed_at DESC`,
      )
      .all(supplierId)
  })

  // Write the Power Automate CSV to a user-chosen location.
  ipcMain.handle(
    'matcher:exportCSV',
    async (
      _e,
      rows: Array<ExportRow & { lineTotal: number | string }>,
    ) => {
      const csv = buildCsv(rows ?? [])
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'ส่งออก CSV สำหรับ Power Automate',
        defaultPath: `intake-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      // UTF-8 BOM so Excel on Windows reads Thai + leading-zero lots correctly.
      const BOM = Buffer.from([0xef, 0xbb, 0xbf])
      fs.writeFileSync(filePath, Buffer.concat([BOM, Buffer.from(csv, 'utf8')]))
      return { ok: true, path: filePath }
    },
  )
}
