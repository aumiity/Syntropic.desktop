var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
import { requireAdmin } from '../auth/session';
// Shop expenses (ค่าใช้จ่าย). Manual operating-cost entries feed the Finance
// net-profit calc and the dedicated ค่าใช้จ่าย report. Category CRUD lives here
// (namespaced expenses:*Categories) — there is NO `code` column on categories.
//
// HARD invariants:
//   - expenses:save / saveCategory allow-list columns explicitly — never spread
//     ...payload (a stray key throws `no such column` and aborts the UPDATE).
//   - amount must be a finite > 0 number (validated server-side too); blank is
//     never coerced to 0.
//   - expense_no is EX-YYYYMMDD-NNNN, generated with MAX(suffix)+1 +
//     retry-on-unique-collision (mirrors quotation.ts QT- numbering).
// Allow-listed editable columns (shared by create + update). expense_no /
// created_at are never in here — they're set once on create.
var EXPENSE_COLS = ['expense_date', 'category_id', 'amount', 'reference_no', 'note', 'vat_amount', 'has_tax_invoice'];
function validateExpense(payload) {
    var amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0)
        throw new Error('กรุณาระบุจำนวนเงินให้ถูกต้อง');
    if (!payload.category_id)
        throw new Error('กรุณาเลือกหมวดค่าใช้จ่าย');
    if (!payload.expense_date)
        throw new Error('กรุณาระบุวันที่');
    // Input VAT can never meet or exceed the VAT-inclusive amount paid
    if (payload.has_tax_invoice) {
        var vat = Number(payload.vat_amount);
        if (!Number.isFinite(vat) || vat < 0)
            throw new Error('กรุณาระบุยอดภาษีซื้อให้ถูกต้อง');
        if (vat >= amount)
            throw new Error('ยอดภาษีซื้อต้องน้อยกว่ายอดค่าใช้จ่าย');
    }
}
// Map a payload to a clean column object (allow-list only). Unknown keys are
// dropped; missing optional fields become null. vat_amount is only claimable
// with a full tax invoice — forced 0 when has_tax_invoice is off so the
// ภาษีซื้อ report can trust the column directly.
function pickExpenseCols(payload) {
    var _a, _b, _c;
    var hasTaxInvoice = payload.has_tax_invoice ? 1 : 0;
    return {
        expense_date: payload.expense_date,
        category_id: (_a = payload.category_id) !== null && _a !== void 0 ? _a : null,
        amount: Number(payload.amount),
        reference_no: (_b = payload.reference_no) !== null && _b !== void 0 ? _b : null,
        note: (_c = payload.note) !== null && _c !== void 0 ? _c : null,
        vat_amount: hasTaxInvoice ? (Number(payload.vat_amount) || 0) : 0,
        has_tax_invoice: hasTaxInvoice,
    };
}
export function registerExpenseHandlers() {
    // List with date/category filters + pagination. Joins the category for the
    // display name; whitelisted sort; COUNT(*) under the same WHERE for total.
    ipcMain.handle('expenses:list', function (_e, filters) {
        var _a, _b;
        if (filters === void 0) { filters = {}; }
        requireAdmin(_e);
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to, category_id = filters.category_id, _c = filters.page, page = _c === void 0 ? 1 : _c, _d = filters.pageSize, pageSize = _d === void 0 ? 50 : _d, _f = filters.sort_by, sort_by = _f === void 0 ? 'expense_date' : _f, _g = filters.sort_dir, sort_dir = _g === void 0 ? 'DESC' : _g;
        var conditions = [];
        var params = [];
        if (date_from) {
            conditions.push("date(e.expense_date) >= ?");
            params.push(date_from);
        }
        if (date_to) {
            conditions.push("date(e.expense_date) <= ?");
            params.push(date_to);
        }
        if (category_id) {
            conditions.push("e.category_id = ?");
            params.push(category_id);
        }
        var where = conditions.length ? "WHERE ".concat(conditions.join(' AND ')) : '';
        var validSorts = ['expense_date', 'expense_no', 'amount', 'category_name'];
        var sortCol = !validSorts.includes(sort_by) ? 'e.expense_date'
            : sort_by === 'category_name' ? 'ec.name'
                : "e.".concat(sort_by);
        var sortDirection = sort_dir === 'ASC' ? 'ASC' : 'DESC';
        var limit = typeof pageSize === 'number' && pageSize > 0 ? pageSize : null;
        var offset = limit ? (page - 1) * limit : 0;
        var limitClause = limit ? "LIMIT ? OFFSET ?" : '';
        var limitParams = limit ? [limit, offset] : [];
        var rows = (_a = db.prepare("\n      SELECT e.*, ec.name AS category_name\n      FROM expenses e\n      LEFT JOIN expense_categories ec ON ec.id = e.category_id\n      ".concat(where, "\n      ORDER BY ").concat(sortCol, " ").concat(sortDirection, ", e.id DESC\n      ").concat(limitClause, "\n    "))).all.apply(_a, __spreadArray(__spreadArray([], params, false), limitParams, false));
        var total = (_b = db.prepare("SELECT COUNT(*) AS c FROM expenses e ".concat(where))).get.apply(_b, params).c;
        return { rows: rows, total: total };
    });
    // Aggregate rollup for a window — used by the report summary cards.
    ipcMain.handle('expenses:summary', function (_e, filters) {
        var _a, _b;
        var _c, _d;
        if (filters === void 0) { filters = {}; }
        requireAdmin(_e);
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var conditions = [];
        var params = [];
        if (date_from) {
            conditions.push("date(e.expense_date) >= ?");
            params.push(date_from);
        }
        if (date_to) {
            conditions.push("date(e.expense_date) <= ?");
            params.push(date_to);
        }
        var where = conditions.length ? "WHERE ".concat(conditions.join(' AND ')) : '';
        var totals = (_a = db.prepare("\n      SELECT COALESCE(SUM(e.amount), 0) AS expense_total, COUNT(*) AS expense_count\n      FROM expenses e ".concat(where, "\n    "))).get.apply(_a, params);
        var by_category = (_b = db.prepare("\n      SELECT e.category_id, COALESCE(ec.name, '\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E2B\u0E21\u0E27\u0E14') AS category_name,\n             COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS count\n      FROM expenses e\n      LEFT JOIN expense_categories ec ON ec.id = e.category_id\n      ".concat(where, "\n      GROUP BY e.category_id\n      ORDER BY total DESC\n    "))).all.apply(_b, params);
        return {
            expense_total: totals.expense_total,
            expense_count: totals.expense_count,
            by_category: by_category,
            top_category: (_d = (_c = by_category[0]) === null || _c === void 0 ? void 0 : _c.category_name) !== null && _d !== void 0 ? _d : null,
        };
    });
    // Create (no id) or update (id present). Allow-listed columns only.
    ipcMain.handle('expenses:save', function (_e, payload) {
        requireAdmin(_e);
        var db = getDb();
        validateExpense(payload);
        var cols = pickExpenseCols(payload);
        // ── UPDATE ── never touches expense_no / created_at.
        if (payload.id) {
            var existing = db.prepare("SELECT id FROM expenses WHERE id = ?").get(payload.id);
            if (!existing)
                throw new Error('ไม่พบรายการค่าใช้จ่าย');
            var setClause = EXPENSE_COLS.map(function (c) { return "".concat(c, " = @").concat(c); }).join(', ');
            db.prepare("UPDATE expenses SET ".concat(setClause, ", updated_at = datetime('now','localtime') WHERE id = @id"))
                .run(__assign(__assign({}, cols), { id: payload.id }));
            return db.prepare("SELECT * FROM expenses WHERE id = ?").get(payload.id);
        }
        // ── CREATE ── EX-YYYYMMDD-NNNN with retry-on-unique-collision. MAX(suffix)+1
        // (not COUNT) so a gap doesn't reuse a number; the retry loop covers the race
        // where two saves compute the same next number. Prefix 'EX-'+8+'-' = 12 chars
        // so the running number starts at SUBSTR offset 13.
        var today = dayjs().format('YYYYMMDD');
        var create = db.transaction(function () {
            var _a;
            for (var attempt = 0; attempt < 5; attempt++) {
                var row = db.prepare("SELECT MAX(CAST(SUBSTR(expense_no, 13) AS INTEGER)) AS maxNum\n           FROM expenses WHERE expense_no LIKE ?").get("EX-".concat(today, "-%"));
                var next = ((_a = row === null || row === void 0 ? void 0 : row.maxNum) !== null && _a !== void 0 ? _a : 0) + 1;
                var expenseNo = "EX-".concat(today, "-").concat(String(next).padStart(4, '0'));
                try {
                    var res = db.prepare("\n            INSERT INTO expenses (expense_no, expense_date, category_id, amount, reference_no, note, vat_amount, has_tax_invoice, created_at, updated_at)\n            VALUES (@expense_no, @expense_date, @category_id, @amount, @reference_no, @note, @vat_amount, @has_tax_invoice, datetime('now','localtime'), datetime('now','localtime'))\n          ").run(__assign({ expense_no: expenseNo }, cols));
                    return res.lastInsertRowid;
                }
                catch (e) {
                    if (String(e === null || e === void 0 ? void 0 : e.code).includes('SQLITE_CONSTRAINT') && attempt < 4)
                        continue;
                    throw e;
                }
            }
            throw new Error('ไม่สามารถออกเลขที่ค่าใช้จ่ายได้ กรุณาลองใหม่');
        });
        var newId = create();
        return db.prepare("SELECT * FROM expenses WHERE id = ?").get(newId);
    });
    ipcMain.handle('expenses:delete', function (_e, id) {
        requireAdmin(_e);
        var db = getDb();
        db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
        return { success: true };
    });
    // ── Categories ──
    ipcMain.handle('expenses:listCategories', function (_e) {
        requireAdmin(_e);
        return getDb().prepare("SELECT * FROM expense_categories ORDER BY sort_order, id").all();
    });
    ipcMain.handle('expenses:activeCategories', function (_e) {
        requireAdmin(_e);
        return getDb().prepare("SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY sort_order, id").all();
    });
    ipcMain.handle('expenses:saveCategory', function (_e, data) {
        var _a, _b, _c, _d;
        requireAdmin(_e);
        var db = getDb();
        if (data.id) {
            var cols = {
                name: data.name,
                is_active: (_a = data.is_active) !== null && _a !== void 0 ? _a : 1,
                sort_order: (_b = data.sort_order) !== null && _b !== void 0 ? _b : 0,
            };
            db.prepare("UPDATE expense_categories SET name = @name, is_active = @is_active, sort_order = @sort_order, updated_at = datetime('now','localtime') WHERE id = @id")
                .run(__assign(__assign({}, cols), { id: data.id }));
            return db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(data.id);
        }
        var result = db.prepare("INSERT INTO expense_categories (name, is_active, sort_order) VALUES (@name, @is_active, @sort_order)")
            .run({ name: data.name, is_active: (_c = data.is_active) !== null && _c !== void 0 ? _c : 1, sort_order: (_d = data.sort_order) !== null && _d !== void 0 ? _d : 0 });
        return db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(result.lastInsertRowid);
    });
    // Drag-and-drop reorder: renumber sort_order to 1..n by the given id order, in
    // one transaction so listCategories (ORDER BY sort_order, id) is stable.
    ipcMain.handle('expenses:reorderCategories', function (_e, ids) {
        requireAdmin(_e);
        var db = getDb();
        var upd = db.prepare("UPDATE expense_categories SET sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ?");
        db.transaction(function (order) {
            order.forEach(function (id, i) { return upd.run(i + 1, id); });
        })(ids);
        return db.prepare("SELECT * FROM expense_categories ORDER BY sort_order, id").all();
    });
}
