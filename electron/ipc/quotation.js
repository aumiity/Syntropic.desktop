var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { ipcMain } from 'electron';
import { getDb } from '../db';
import dayjs from 'dayjs';
var round2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
// Prices are VAT-inclusive — back the tax out of the net (see src/lib/vat.ts).
var extractVat = function (amountInclusive, rate) { return amountInclusive * rate / (100 + rate); };
export function registerQuotationHandlers() {
    // Create (no id) or update (id, draft-only). Quotations never touch stock.
    ipcMain.handle('quotation:save', function (_e, payload) {
        var _a, _b, _c;
        var db = getDb();
        // Totals from the line items (line_total is VAT-inclusive).
        var items = (_a = payload.items) !== null && _a !== void 0 ? _a : [];
        var subtotal = round2(items.reduce(function (s, i) { return s + i.qty * i.unit_price; }, 0));
        var totalDiscount = round2(items.reduce(function (s, i) { return s + (i.discount || 0); }, 0));
        var totalAmount = round2(items.reduce(function (s, i) { return s + i.line_total; }, 0));
        var insertItems = function (quotationId) {
            var stmt = db.prepare("\n        INSERT INTO quotation_items (quotation_id, product_id, item_name, unit_name, qty, unit_price, discount, line_total, sort_order)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ");
            items.forEach(function (it, idx) {
                var _a;
                return stmt.run(quotationId, (_a = it.product_id) !== null && _a !== void 0 ? _a : null, it.item_name, it.unit_name, it.qty, it.unit_price, it.discount || 0, it.line_total, idx);
            });
        };
        // ── UPDATE (draft-only) ──
        if (payload.id) {
            var existing = db.prepare("SELECT id, status FROM quotations WHERE id = ?").get(payload.id);
            if (!existing)
                throw new Error('ไม่พบใบเสนอราคา');
            if (existing.status !== 'draft')
                throw new Error('แก้ไขได้เฉพาะใบร่าง (draft)');
            // VAT snapshot is kept fresh while still a draft (re-read sales_settings).
            var ss_1 = db.prepare("SELECT vat_enabled, vat_rate FROM sales_settings LIMIT 1").get();
            var vatEnabled_1 = (ss_1 === null || ss_1 === void 0 ? void 0 : ss_1.vat_enabled) ? 1 : 0;
            var vatRate_1 = (_b = ss_1 === null || ss_1 === void 0 ? void 0 : ss_1.vat_rate) !== null && _b !== void 0 ? _b : 7;
            var totalVat_1 = vatEnabled_1 ? round2(extractVat(totalAmount, vatRate_1)) : 0;
            var doUpdate = db.transaction(function () {
                var _a, _b, _c, _d, _f, _g;
                // issue_date / quote_no / created_* are intentionally NOT touched.
                db.prepare("\n          UPDATE quotations SET\n            customer_id = @customer_id, customer_name = @customer_name,\n            customer_address = @customer_address, customer_tax_id = @customer_tax_id,\n            valid_until = @valid_until, note = @note,\n            vat_enabled = @vat_enabled, vat_rate = @vat_rate,\n            subtotal = @subtotal, total_discount = @total_discount,\n            total_vat = @total_vat, total_amount = @total_amount,\n            updated_at = datetime('now','localtime')\n          WHERE id = @id\n        ").run({
                    id: payload.id,
                    customer_id: (_a = payload.customer_id) !== null && _a !== void 0 ? _a : null,
                    customer_name: (_b = payload.customer_name) !== null && _b !== void 0 ? _b : '',
                    customer_address: (_c = payload.customer_address) !== null && _c !== void 0 ? _c : '',
                    customer_tax_id: (_d = payload.customer_tax_id) !== null && _d !== void 0 ? _d : '',
                    valid_until: (_f = payload.valid_until) !== null && _f !== void 0 ? _f : null,
                    note: (_g = payload.note) !== null && _g !== void 0 ? _g : '',
                    vat_enabled: vatEnabled_1, vat_rate: vatRate_1,
                    subtotal: subtotal,
                    total_discount: totalDiscount, total_vat: totalVat_1, total_amount: totalAmount,
                });
                db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").run(payload.id);
                insertItems(payload.id);
            });
            doUpdate();
            return db.prepare("SELECT * FROM quotations WHERE id = ?").get(payload.id);
        }
        // ── CREATE ──
        var ss = db.prepare("SELECT vat_enabled, vat_rate FROM sales_settings LIMIT 1").get();
        var vatEnabled = (ss === null || ss === void 0 ? void 0 : ss.vat_enabled) ? 1 : 0;
        var vatRate = (_c = ss === null || ss === void 0 ? void 0 : ss.vat_rate) !== null && _c !== void 0 ? _c : 7;
        var totalVat = vatEnabled ? round2(extractVat(totalAmount, vatRate)) : 0;
        var today = dayjs().format('YYYYMMDD');
        // Generate QT-YYYYMMDD-NNNN with retry-on-unique-collision. MAX(suffix)+1
        // (not COUNT) so a manually-edited/imported gap doesn't reuse a number; the
        // retry loop covers the race where two saves compute the same next number.
        var create = db.transaction(function () {
            var _a, _b, _c, _d, _f, _g, _h, _j;
            for (var attempt = 0; attempt < 5; attempt++) {
                var row = db.prepare("SELECT MAX(CAST(SUBSTR(quote_no, 13) AS INTEGER)) AS maxNum\n           FROM quotations WHERE quote_no LIKE ?").get("QT-".concat(today, "-%"));
                var next = ((_a = row === null || row === void 0 ? void 0 : row.maxNum) !== null && _a !== void 0 ? _a : 0) + 1;
                var quoteNo = "QT-".concat(today, "-").concat(String(next).padStart(4, '0'));
                try {
                    var res = db.prepare("\n            INSERT INTO quotations (quote_no, customer_id, customer_name, customer_address, customer_tax_id,\n              issue_date, valid_until, status, vat_enabled, vat_rate,\n              subtotal, total_discount, total_vat, total_amount, note, created_by)\n            VALUES (@quote_no, @customer_id, @customer_name, @customer_address, @customer_tax_id,\n              datetime('now','localtime'), @valid_until, 'draft', @vat_enabled, @vat_rate,\n              @subtotal, @total_discount, @total_vat, @total_amount, @note, @created_by)\n          ").run({
                        quote_no: quoteNo,
                        customer_id: (_b = payload.customer_id) !== null && _b !== void 0 ? _b : null,
                        customer_name: (_c = payload.customer_name) !== null && _c !== void 0 ? _c : '',
                        customer_address: (_d = payload.customer_address) !== null && _d !== void 0 ? _d : '',
                        customer_tax_id: (_f = payload.customer_tax_id) !== null && _f !== void 0 ? _f : '',
                        valid_until: (_g = payload.valid_until) !== null && _g !== void 0 ? _g : null,
                        vat_enabled: vatEnabled, vat_rate: vatRate,
                        subtotal: subtotal,
                        total_discount: totalDiscount, total_vat: totalVat, total_amount: totalAmount,
                        note: (_h = payload.note) !== null && _h !== void 0 ? _h : '', created_by: (_j = payload.created_by) !== null && _j !== void 0 ? _j : null,
                    });
                    insertItems(res.lastInsertRowid);
                    return res.lastInsertRowid;
                }
                catch (e) {
                    // Unique collision on quote_no → recompute and retry; rethrow others.
                    if (String(e === null || e === void 0 ? void 0 : e.code).includes('SQLITE_CONSTRAINT') && attempt < 4)
                        continue;
                    throw e;
                }
            }
            throw new Error('ไม่สามารถออกเลขที่ใบเสนอราคาได้ กรุณาลองใหม่');
        });
        var newId = create();
        return db.prepare("SELECT * FROM quotations WHERE id = ?").get(newId);
    });
    // List with q/date/status filters + pagination (mirrors reports:salesList).
    ipcMain.handle('quotation:list', function (_e, filters) {
        var _a, _b, _c;
        var db = getDb();
        var q = filters.q, date_from = filters.date_from, date_to = filters.date_to, _d = filters.sort_by, sort_by = _d === void 0 ? 'issue_date' : _d, _f = filters.sort_dir, sort_dir = _f === void 0 ? 'DESC' : _f, _g = filters.page, page = _g === void 0 ? 1 : _g, limitOpt = filters.limit, _h = filters.status_filter, status_filter = _h === void 0 ? 'all' : _h;
        var limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 50);
        var offset = limit ? (page - 1) * limit : 0;
        // Base scope = search + date. The status filter narrows the table rows and
        // the paginated total, but NOT the summary cards — the cards always show the
        // full status breakdown for the current search/date scope (so picking the
        // "ร่าง" tab doesn't zero out the other count cards).
        var baseConditions = [];
        var baseParams = [];
        if (q) {
            baseConditions.push("(qt.quote_no LIKE ? OR c.full_name LIKE ? OR qt.customer_name LIKE ?)");
            var lq = "%".concat(q, "%");
            baseParams.push(lq, lq, lq);
        }
        if (date_from) {
            baseConditions.push("date(qt.issue_date) >= ?");
            baseParams.push(date_from);
        }
        if (date_to) {
            baseConditions.push("date(qt.issue_date) <= ?");
            baseParams.push(date_to);
        }
        var baseWhere = baseConditions.length ? "WHERE ".concat(baseConditions.join(' AND ')) : '';
        // 'expired' is derived, not stored: a draft/sent quote whose valid_until
        // (ครบกำหนด) is in the past. Draft/sent filters EXCLUDE expired rows so the
        // status buckets stay mutually exclusive (an expired quote shows only under
        // the พ้นกำหนด tab, never under ร่าง/รอตอบรับ).
        var EXPIRED = "qt.status IN ('draft','sent') AND qt.valid_until IS NOT NULL AND date(qt.valid_until) < date('now','localtime')";
        var rowConditions = __spreadArray([], baseConditions, true);
        var rowParams = __spreadArray([], baseParams, true);
        if (status_filter === 'expired') {
            rowConditions.push("(".concat(EXPIRED, ")"));
        }
        else if (status_filter === 'draft' || status_filter === 'sent') {
            rowConditions.push("qt.status = ? AND NOT (".concat(EXPIRED, ")"));
            rowParams.push(status_filter);
        }
        else if (['accepted', 'rejected', 'canceled'].includes(status_filter)) {
            rowConditions.push("qt.status = ?");
            rowParams.push(status_filter);
        }
        var where = rowConditions.length ? "WHERE ".concat(rowConditions.join(' AND ')) : '';
        var validSorts = ['issue_date', 'quote_no', 'valid_until', 'total_amount', 'customer_name'];
        var sortCol = !validSorts.includes(sort_by) ? 'qt.issue_date'
            : sort_by === 'customer_name' ? 'COALESCE(c.full_name, qt.customer_name)'
                : "qt.".concat(sort_by);
        var sortDirection = sort_dir === 'ASC' ? 'ASC' : 'DESC';
        var limitClause = limit ? "LIMIT ? OFFSET ?" : '';
        var limitParams = limit ? [limit, offset] : [];
        var rows = (_a = db.prepare("\n      SELECT qt.*, COALESCE(c.full_name, qt.customer_name) AS customer_display,\n        (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = qt.id) AS item_count\n      FROM quotations qt\n      LEFT JOIN customers c ON c.id = qt.customer_id\n      ".concat(where, "\n      ORDER BY ").concat(sortCol, " ").concat(sortDirection, "\n      ").concat(limitClause, "\n    "))).all.apply(_a, __spreadArray(__spreadArray([], rowParams, false), limitParams, false));
        var summary = (_b = db.prepare("\n      SELECT\n        COUNT(*) AS count_all,\n        COALESCE(SUM(CASE WHEN qt.status = 'draft' AND NOT (".concat(EXPIRED, ") THEN 1 ELSE 0 END), 0) AS count_draft,\n        COALESCE(SUM(CASE WHEN qt.status = 'sent'  AND NOT (").concat(EXPIRED, ") THEN 1 ELSE 0 END), 0) AS count_sent,\n        COALESCE(SUM(CASE WHEN (").concat(EXPIRED, ") THEN 1 ELSE 0 END), 0) AS count_expired,\n        COALESCE(SUM(CASE WHEN qt.status = 'accepted' THEN 1 ELSE 0 END), 0) AS count_accepted,\n        COALESCE(SUM(CASE WHEN qt.status = 'rejected' THEN 1 ELSE 0 END), 0) AS count_rejected,\n        COALESCE(SUM(CASE WHEN qt.status = 'canceled' THEN 1 ELSE 0 END), 0) AS count_canceled\n      FROM quotations qt\n      LEFT JOIN customers c ON c.id = qt.customer_id\n      ").concat(baseWhere, "\n    "))).get.apply(_b, baseParams);
        var total = (_c = db.prepare("SELECT COUNT(*) AS c FROM quotations qt LEFT JOIN customers c ON c.id = qt.customer_id ".concat(where))).get.apply(_c, rowParams).c;
        return { rows: rows, summary: summary, total: total, page: page, limit: limit !== null && limit !== void 0 ? limit : total };
    });
    ipcMain.handle('quotation:get', function (_e, id) {
        var db = getDb();
        var quote = db.prepare("\n      SELECT qt.*, c.full_name AS customer_full_name, u.name AS created_by_name\n      FROM quotations qt\n      LEFT JOIN customers c ON c.id = qt.customer_id\n      LEFT JOIN users u ON u.id = qt.created_by\n      WHERE qt.id = ?\n    ").get(id);
        if (!quote)
            return null;
        quote.items = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id").all(id);
        return quote;
    });
    // Status transitions: draft→sent, sent→accepted|rejected, sent→draft (revert).
    // NOTE: 'converting'/'converted' are NOT reachable here — conversion has its
    // own dedicated, atomic handlers below so 'converted' always carries an
    // invoice link (single write path).
    ipcMain.handle('quotation:setStatus', function (_e, payload) {
        var _a;
        var db = getDb();
        var cur = db.prepare("SELECT status FROM quotations WHERE id = ?").get(payload.id);
        if (!cur)
            throw new Error('ไม่พบใบเสนอราคา');
        var allowed = {
            draft: ['sent', 'canceled'],
            sent: ['accepted', 'rejected', 'draft', 'canceled'],
            accepted: ['canceled'],
            rejected: [],
            converting: [],
            converted: [],
            canceled: [],
        };
        if (!((_a = allowed[cur.status]) !== null && _a !== void 0 ? _a : []).includes(payload.status)) {
            throw new Error("\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E08\u0E32\u0E01 ".concat(cur.status, " \u0E40\u0E1B\u0E47\u0E19 ").concat(payload.status, " \u0E44\u0E21\u0E48\u0E44\u0E14\u0E49"));
        }
        db.prepare("UPDATE quotations SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(payload.status, payload.id);
        return db.prepare("SELECT * FROM quotations WHERE id = ?").get(payload.id);
    });
    // ── Conversion to a sale (exclusive claim → sell → mark) ──
    // Atomically claim an accepted quote (accepted→converting) BEFORE the cart is
    // populated, so the same quote can't be sold twice from two windows/terminals.
    ipcMain.handle('quotation:beginConversion', function (_e, id) {
        var db = getDb();
        var res = db.prepare("UPDATE quotations SET status='converting', updated_at=datetime('now','localtime') WHERE id=? AND status='accepted'").run(id);
        if (res.changes === 0) {
            var cur = db.prepare("SELECT status FROM quotations WHERE id = ?").get(id);
            if (!cur)
                throw new Error('ไม่พบใบเสนอราคา');
            throw new Error('ใบนี้ถูกแปลงหรือกำลังแปลงอยู่แล้ว');
        }
        return db.prepare("SELECT * FROM quotations WHERE id = ?").get(id);
    });
    // Release a claim back to accepted (operator cancelled the conversion).
    ipcMain.handle('quotation:releaseConversion', function (_e, id) {
        var db = getDb();
        db.prepare("UPDATE quotations SET status='accepted', updated_at=datetime('now','localtime') WHERE id=? AND status='converting'").run(id);
        return db.prepare("SELECT * FROM quotations WHERE id = ?").get(id);
    });
    // The ONLY path that writes 'converted' — always records the linked invoice.
    ipcMain.handle('quotation:markConverted', function (_e, payload) {
        var db = getDb();
        var res = db.prepare("UPDATE quotations SET status='converted', converted_invoice_no=?, updated_at=datetime('now','localtime') WHERE id=? AND status='converting'")
            .run(payload.invoice_no, payload.id);
        if (res.changes === 0)
            throw new Error('ใบเสนอราคาไม่อยู่ในสถานะกำลังแปลง');
        return db.prepare("SELECT * FROM quotations WHERE id = ?").get(payload.id);
    });
    // Delete — draft only (items cascade).
    ipcMain.handle('quotation:delete', function (_e, id) {
        var db = getDb();
        var cur = db.prepare("SELECT status FROM quotations WHERE id = ?").get(id);
        if (!cur)
            throw new Error('ไม่พบใบเสนอราคา');
        if (cur.status !== 'draft')
            throw new Error('ลบได้เฉพาะใบร่าง (draft)');
        db.prepare("DELETE FROM quotations WHERE id = ?").run(id);
        return { success: true };
    });
}
