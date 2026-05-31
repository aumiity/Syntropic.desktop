import { ipcMain } from 'electron';
import { getDb } from '../db';
// Full tax invoices (ใบกำกับภาษีเต็มรูป, ม.86/4). One row per sale; the sale's
// invoice_no (RC-) is reused as the running serial number (doc_no). Buyer fields
// are a snapshot taken at issue time. The first issue prints the "ต้นฉบับ";
// every subsequent issue is a "สำเนา" (gated by original_printed).
export function registerTaxHandlers() {
    ipcMain.handle('tax:get', function (_e, saleId) {
        var _a;
        return (_a = getDb().prepare("SELECT * FROM tax_invoices WHERE sale_id = ?").get(saleId)) !== null && _a !== void 0 ? _a : null;
    });
    // Upsert the buyer snapshot and return { record, copy }. `copy` = true means
    // the original has already been printed before, so the caller should stamp
    // "สำเนา" on this print; false = first issue → "ต้นฉบับ".
    ipcMain.handle('tax:issueOrGet', function (_e, payload) {
        var db = getDb();
        var sale = db.prepare("SELECT id, invoice_no, status, sale_type FROM sales WHERE id = ?")
            .get(payload.sale_id);
        if (!sale)
            throw new Error('ไม่พบรายการขาย');
        // Defensive guard mirroring the UI: never issue a tax invoice for a voided
        // bill or a return document.
        if (sale.status === 'voided')
            throw new Error('บิลถูกยกเลิก ไม่สามารถออกใบกำกับภาษีได้');
        if (sale.sale_type === 'return')
            throw new Error('บิลรับคืนสินค้า ไม่สามารถออกใบกำกับภาษีได้');
        var issue = db.transaction(function () {
            var _a, _b, _c, _d, _f, _g, _h, _j, _k;
            var existing = db.prepare("SELECT * FROM tax_invoices WHERE sale_id = ?").get(sale.id);
            var copy = !!existing && existing.original_printed === 1;
            if (existing) {
                db.prepare("\n          UPDATE tax_invoices SET\n            buyer_name = @buyer_name, buyer_address = @buyer_address,\n            buyer_tax_id = @buyer_tax_id, buyer_branch = @buyer_branch,\n            original_printed = 1, updated_at = datetime('now','localtime')\n          WHERE sale_id = @sale_id\n        ").run({
                    sale_id: sale.id,
                    buyer_name: (_a = payload.buyer_name) !== null && _a !== void 0 ? _a : '',
                    buyer_address: (_b = payload.buyer_address) !== null && _b !== void 0 ? _b : '',
                    buyer_tax_id: (_c = payload.buyer_tax_id) !== null && _c !== void 0 ? _c : '',
                    buyer_branch: (_d = payload.buyer_branch) !== null && _d !== void 0 ? _d : '',
                });
            }
            else {
                db.prepare("\n          INSERT INTO tax_invoices (sale_id, doc_no, buyer_name, buyer_address, buyer_tax_id, buyer_branch, original_printed, issued_by)\n          VALUES (@sale_id, @doc_no, @buyer_name, @buyer_address, @buyer_tax_id, @buyer_branch, 1, @issued_by)\n        ").run({
                    sale_id: sale.id,
                    doc_no: sale.invoice_no,
                    buyer_name: (_f = payload.buyer_name) !== null && _f !== void 0 ? _f : '',
                    buyer_address: (_g = payload.buyer_address) !== null && _g !== void 0 ? _g : '',
                    buyer_tax_id: (_h = payload.buyer_tax_id) !== null && _h !== void 0 ? _h : '',
                    buyer_branch: (_j = payload.buyer_branch) !== null && _j !== void 0 ? _j : '',
                    issued_by: (_k = payload.issued_by) !== null && _k !== void 0 ? _k : null,
                });
            }
            var record = db.prepare("SELECT * FROM tax_invoices WHERE sale_id = ?").get(sale.id);
            return { record: record, copy: copy };
        });
        return issue();
    });
}
