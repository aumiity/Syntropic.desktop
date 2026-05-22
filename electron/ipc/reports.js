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
export function registerReportHandlers() {
    ipcMain.handle('reports:salesList', function (_e, filters) {
        var _a, _b, _c, _d;
        var db = getDb();
        var q = filters.q, date_from = filters.date_from, date_to = filters.date_to, _f = filters.sort_by, sort_by = _f === void 0 ? 'sold_at' : _f, _g = filters.sort_dir, sort_dir = _g === void 0 ? 'DESC' : _g, _h = filters.page, page = _h === void 0 ? 1 : _h, limitOpt = filters.limit, _j = filters.status_filter, status_filter = _j === void 0 ? 'all' : _j;
        var limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 30);
        var offset = limit ? (page - 1) * limit : 0;
        // q/date scope the whole card row; the status filter only narrows the
        // rows/total — the four count cards always reflect the full q/date set
        // so clicking one card never moves the others' numbers.
        var baseConditions = [];
        var params = [];
        if (q) {
            baseConditions.push("(s.invoice_no LIKE ? OR c.full_name LIKE ? OR s.customer_name_free LIKE ?)");
            var lq = "%".concat(q, "%");
            params.push(lq, lq, lq);
        }
        if (date_from) {
            baseConditions.push("date(s.sold_at) >= ?");
            params.push(date_from);
        }
        if (date_to) {
            baseConditions.push("date(s.sold_at) <= ?");
            params.push(date_to);
        }
        // Status slice has no bind params — safe to AND on as a literal fragment.
        var statusCond = status_filter === 'retail' ? "s.status != 'voided' AND s.sale_type = 'retail'"
            : status_filter === 'wholesale' ? "s.status != 'voided' AND s.sale_type = 'wholesale'"
                : status_filter === 'return' ? "s.status != 'voided' AND s.sale_type = 'return'"
                    : status_filter === 'voided' ? "s.status = 'voided'"
                        : null; // 'all' (includes rx + voided — rx has no dedicated card)
        var rowConditions = statusCond ? __spreadArray(__spreadArray([], baseConditions, true), [statusCond], false) : baseConditions;
        var where = rowConditions.length ? "WHERE ".concat(rowConditions.join(' AND ')) : '';
        var baseWhere = baseConditions.length ? "WHERE ".concat(baseConditions.join(' AND ')) : '';
        var validSorts = ['sold_at', 'invoice_no', 'subtotal', 'total_discount', 'total_amount', 'item_kinds'];
        // item_kinds is a computed alias on the SELECT, not a column on s.
        var sortCol = !validSorts.includes(sort_by) ? 's.sold_at'
            : sort_by === 'item_kinds' ? 'item_kinds'
                : "s.".concat(sort_by);
        var sortDirection = sort_dir === 'ASC' ? 'ASC' : 'DESC';
        var limitClause = limit ? "LIMIT ? OFFSET ?" : '';
        var limitParams = limit ? [limit, offset] : [];
        var rows = (_a = db.prepare("\n      SELECT s.*, c.full_name as customer_name,\n        (SELECT COUNT(DISTINCT si.product_id) FROM sale_items si WHERE si.sale_id = s.id AND si.is_cancelled = 0) as item_kinds\n      FROM sales s\n      LEFT JOIN customers c ON c.id = s.customer_id\n      ".concat(where, "\n      ORDER BY ").concat(sortCol, " ").concat(sortDirection, "\n      ").concat(limitClause, "\n    "))).all.apply(_a, __spreadArray(__spreadArray([], params, false), limitParams, false));
        var summary = (_b = db.prepare("\n      SELECT\n        COALESCE(SUM(s.subtotal), 0) as total_subtotal,\n        COALESCE(SUM(s.total_discount), 0) as total_discount,\n        COALESCE(SUM(s.total_amount), 0) as total_amount,\n        COALESCE(SUM(\n          (SELECT COALESCE(SUM(sil.qty * pl.cost_price), 0)\n           FROM sale_items si2\n           JOIN sale_item_lots sil ON sil.sale_item_id = si2.id\n           JOIN product_lots pl ON pl.id = sil.lot_id\n           WHERE si2.sale_id = s.id AND sil.is_cancelled = 0)\n        ), 0) as total_cost,\n        COUNT(*) as sale_count\n      FROM sales s\n      LEFT JOIN customers c ON c.id = s.customer_id\n      ".concat(where, "\n    "))).get.apply(_b, params);
        summary.total_profit = summary.total_amount - summary.total_cost;
        // Card counts — partition over the q/date set only (ignores status_filter).
        // retail + wholesale + rx + return = non-voided; + voided = all. rx has no
        // dedicated card (lives only inside count_all), so the visible cards don't
        // sum to count_all by design; a voided row counts as voided only.
        var counts = (_c = db.prepare("\n      SELECT\n        COUNT(*) as count_all,\n        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'retail' THEN 1 ELSE 0 END), 0) as count_retail,\n        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'wholesale' THEN 1 ELSE 0 END), 0) as count_wholesale,\n        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'return' THEN 1 ELSE 0 END), 0) as count_return,\n        COALESCE(SUM(CASE WHEN s.status = 'voided' THEN 1 ELSE 0 END), 0) as count_voided\n      FROM sales s\n      LEFT JOIN customers c ON c.id = s.customer_id\n      ".concat(baseWhere, "\n    "))).get.apply(_c, params);
        Object.assign(summary, counts);
        var total = (_d = db.prepare("SELECT COUNT(*) as c FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ".concat(where))).get.apply(_d, params).c;
        return { rows: rows, summary: summary, total: total, page: page, limit: limit !== null && limit !== void 0 ? limit : total };
    });
    // Deeplink hook for "ดูรายละเอียด" buttons elsewhere in the app (e.g.,
    // EditProduct → ความเคลื่อนไหว tab). Returns the same shape as reports:getSale
    // — the renderer doesn't care which key it queried by.
    ipcMain.handle('reports:getSaleByInvoice', function (_e, invoiceNo) {
        var db = getDb();
        var sale = db.prepare("\n      SELECT s.*, c.full_name as customer_name, u.name as sold_by_name\n      FROM sales s\n      LEFT JOIN customers c ON c.id = s.customer_id\n      LEFT JOIN users u ON u.id = s.sold_by\n      WHERE s.invoice_no = ?\n    ").get(invoiceNo);
        if (!sale)
            return null;
        var items = db.prepare("\n      SELECT si.*,\n        p.is_bundle,\n        COALESCE((\n          SELECT SUM(sil.qty * pl.cost_price) FROM sale_item_lots sil\n          JOIN product_lots pl ON pl.id = sil.lot_id\n          WHERE sil.sale_item_id = si.id AND sil.is_cancelled = 0\n        ), 0) as item_cost\n      FROM sale_items si\n      LEFT JOIN products p ON p.id = si.product_id\n      WHERE si.sale_id = ?\n    ").all(sale.id);
        // For bundle items, attach the component breakdown (sale_item_lots grouped
        // by product_id with joined component name + lot info). Used by
        // SaleDetailDialog to render the expandable list under each bundle row.
        for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
            var it = items_1[_i];
            if (it.is_bundle === 1) {
                it.component_lots = db.prepare("\n          SELECT sil.id, sil.lot_id, sil.product_id, sil.qty, sil.is_cancelled,\n                 c.trade_name as component_name,\n                 u.name as component_unit_name,\n                 pl.lot_number, pl.expiry_date, pl.cost_price\n          FROM sale_item_lots sil\n          LEFT JOIN products c ON c.id = sil.product_id\n          LEFT JOIN item_units u ON u.id = c.unit_id\n          LEFT JOIN product_lots pl ON pl.id = sil.lot_id\n          WHERE sil.sale_item_id = ?\n          ORDER BY c.trade_name, pl.expiry_date\n        ").all(it.id);
            }
        }
        return __assign(__assign({}, sale), { items: items });
    });
    ipcMain.handle('reports:getSale', function (_e, id) {
        var db = getDb();
        var sale = db.prepare("\n      SELECT s.*, c.full_name as customer_name, u.name as sold_by_name\n      FROM sales s\n      LEFT JOIN customers c ON c.id = s.customer_id\n      LEFT JOIN users u ON u.id = s.sold_by\n      WHERE s.id = ?\n    ").get(id);
        var items = db.prepare("\n      SELECT si.*,\n        COALESCE((\n          SELECT SUM(sil.qty * pl.cost_price) FROM sale_item_lots sil\n          JOIN product_lots pl ON pl.id = sil.lot_id\n          WHERE sil.sale_item_id = si.id AND sil.is_cancelled = 0\n        ), 0) as item_cost\n      FROM sale_items si WHERE si.sale_id = ?\n    ").all(id);
        return __assign(__assign({}, sale), { items: items });
    });
    ipcMain.handle('reports:voidSale', function (_e, id, reason) {
        var db = getDb();
        var voidSale = db.transaction(function () {
            var sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(id);
            if (!sale || sale.status === 'voided')
                throw new Error('ไม่สามารถยกเลิกรายการนี้ได้');
            // Restore stock for each lot. SELECT sil.* only — sale_item_lots and
            // sale_items BOTH have a product_id column, so `SELECT sil.*, si.product_id`
            // collides at the better-sqlite3 row mapper (last column wins → row.product_id
            // resolves to si.product_id, i.e. the BUNDLE id, not the component id). This
            // was harmless pre-bundle (always equal) but corrupts stock_movements.product_id
            // for bundle voids. The JOIN is still needed for the sale_id filter.
            //
            // si.is_cancelled = 0 is what skips sale_items that have ALREADY been
            // returned (per-item return flow). The flag lives on sale_items while
            // sale_item_lots stays intact, so aggregate cost stays correct and we
            // avoid double-restore on void.
            var saleItemLots = db.prepare("\n        SELECT sil.* FROM sale_item_lots sil\n        JOIN sale_items si ON si.id = sil.sale_item_id\n        WHERE si.sale_id = ? AND si.is_cancelled = 0 AND sil.is_cancelled = 0 AND sil.lot_id IS NOT NULL\n      ").all(id);
            for (var _i = 0, saleItemLots_1 = saleItemLots; _i < saleItemLots_1.length; _i++) {
                var sil = saleItemLots_1[_i];
                var lot = db.prepare("SELECT * FROM product_lots WHERE id = ?").get(sil.lot_id);
                var qtyBefore = lot.qty_on_hand;
                db.prepare("UPDATE product_lots SET qty_on_hand = qty_on_hand + ? WHERE id = ?").run(sil.qty, sil.lot_id);
                db.prepare("UPDATE sale_item_lots SET is_cancelled = 1 WHERE id = ?").run(sil.id);
                db.prepare("INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, note)\n          VALUES (?, ?, 'sale_return', 'sale', ?, ?, ?, ?, ?)").run(sil.product_id, sil.lot_id, id, sil.qty, qtyBefore, qtyBefore + sil.qty, "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E02\u0E32\u0E22: ".concat(sale.invoice_no));
            }
            // Cancel any negative-stock markers (lot_id IS NULL) on this sale so
            // the /manage/negative-stock queue doesn't ghost a voided bill. The
            // marker only exists when deductFefo couldn't fully satisfy the qty,
            // so most voids hit zero rows; cheap to run unconditionally.
            db.prepare("\n        UPDATE sale_item_lots\n           SET is_cancelled = 1\n         WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id = ?)\n           AND lot_id IS NULL\n           AND is_cancelled = 0\n      ").run(id);
            db.prepare("UPDATE sales SET status = 'voided', void_reason = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(reason, id);
            return true;
        });
        return voidSale();
    });
    // System C — Expiry report data
    ipcMain.handle('reports:expiringLots', function (_e, filters) {
        var _a;
        var db = getDb();
        var filter = filters.filter, category_id = filters.category_id, q = filters.q;
        var conditions = ["pl.qty_on_hand > 0", "pl.is_closed = 0"];
        var params = [];
        if (filter === 'expired') {
            conditions.push("pl.expiry_date IS NOT NULL AND date(pl.expiry_date) < date('now')");
        }
        else if (typeof filter === 'number') {
            conditions.push("pl.expiry_date IS NOT NULL AND date(pl.expiry_date) <= date('now', '+' || ? || ' days')");
            params.push(filter);
        }
        // 'all' → no date condition
        if (category_id) {
            conditions.push("p.category_id = ?");
            params.push(category_id);
        }
        if (q) {
            conditions.push("(p.trade_name LIKE ? OR pl.lot_number LIKE ?)");
            var lq = "%".concat(q, "%");
            params.push(lq, lq);
        }
        var where = "WHERE ".concat(conditions.join(' AND '));
        return (_a = db.prepare("\n      SELECT\n        pl.id          AS lot_id,\n        pl.lot_number,\n        pl.expiry_date,\n        pl.qty_on_hand,\n        pl.cost_price,\n        ROUND(pl.qty_on_hand * pl.cost_price, 2) AS total_cost,\n        p.id           AS product_id,\n        p.trade_name,\n        u.name         AS unit_name,\n        c.name         AS category_name,\n        s.name         AS supplier_name,\n        CAST(julianday(date(pl.expiry_date)) - julianday(date('now')) AS INTEGER) AS days_remaining\n      FROM product_lots pl\n      JOIN products p ON p.id = pl.product_id\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      LEFT JOIN product_categories c ON c.id = p.category_id\n      LEFT JOIN suppliers s ON s.id = pl.supplier_id\n      ".concat(where, "\n      ORDER BY pl.expiry_date ASC, p.trade_name ASC\n    "))).all.apply(_a, params);
    });
    // ── Phase 4: finance dashboard aggregates ────────────────────────────────
    // Shared SQL fragments. Sale cost = Σ(sold-lot qty × that lot's cost_price)
    // (same shape as reports:salesList). Purchase bill net = Σ(line qty × cost)
    // − header discount + header surcharge, from the immutable receipt ledger.
    var SALE_COST_SUB = "\n    (SELECT COALESCE(SUM(sil.qty * pl.cost_price), 0)\n     FROM sale_items si\n     JOIN sale_item_lots sil ON sil.sale_item_id = si.id\n     JOIN product_lots pl ON pl.id = sil.lot_id\n     WHERE si.sale_id = s.id AND sil.is_cancelled = 0)";
    var PURCHASE_NET_SUB = "\n    ((SELECT COALESCE(SUM(pri.qty * pri.cost_price), 0)\n      FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no)\n     - pr.discount_amount + pr.surcharge_amount)";
    ipcMain.handle('reports:financeSummary', function (_e, filters) {
        var _a, _b;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var sCond = ["s.status != 'voided'"];
        var sParams = [];
        if (date_from) {
            sCond.push("date(s.sold_at) >= ?");
            sParams.push(date_from);
        }
        if (date_to) {
            sCond.push("date(s.sold_at) <= ?");
            sParams.push(date_to);
        }
        var sWhere = "WHERE ".concat(sCond.join(' AND '));
        var sales = (_a = db.prepare("\n      SELECT\n        COALESCE(SUM(s.subtotal), 0)        AS sales_subtotal,\n        COALESCE(SUM(s.total_discount), 0)  AS sales_discount,\n        COALESCE(SUM(s.total_amount), 0)    AS sales_net,\n        COALESCE(SUM(".concat(SALE_COST_SUB, "), 0)  AS sales_cost,\n        COALESCE(SUM(s.cash_amount), 0)     AS cash_amount,\n        COALESCE(SUM(s.card_amount), 0)     AS card_amount,\n        COALESCE(SUM(s.transfer_amount), 0) AS transfer_amount,\n        COALESCE(SUM(CASE WHEN s.is_credit = 1 THEN 1 ELSE 0 END), 0) AS credit_count,\n        COUNT(*) AS sale_count\n      FROM sales s ").concat(sWhere, "\n    "))).get.apply(_a, sParams);
        sales.sales_profit = sales.sales_net - sales.sales_cost;
        var pCond = ["pr.status != 'cancelled'"];
        var pParams = [];
        if (date_from) {
            pCond.push("date(pr.created_at) >= ?");
            pParams.push(date_from);
        }
        if (date_to) {
            pCond.push("date(pr.created_at) <= ?");
            pParams.push(date_to);
        }
        var pWhere = "WHERE ".concat(pCond.join(' AND '));
        var purchases = (_b = db.prepare("\n      SELECT\n        COALESCE(SUM(".concat(PURCHASE_NET_SUB, "), 0) AS purchase_total,\n        COALESCE(SUM(CASE WHEN pr.payment_type = 'cash'   THEN ").concat(PURCHASE_NET_SUB, " ELSE 0 END), 0) AS purchase_cash,\n        COALESCE(SUM(CASE WHEN pr.payment_type = 'credit' THEN ").concat(PURCHASE_NET_SUB, " ELSE 0 END), 0) AS purchase_credit,\n        COUNT(*) AS purchase_count\n      FROM purchase_receipts pr ").concat(pWhere, "\n    "))).get.apply(_b, pParams);
        // Accounts payable is CURRENT outstanding — never date-bound.
        var payable = db.prepare("\n      SELECT\n        COALESCE(SUM(".concat(PURCHASE_NET_SUB, "), 0) AS payable_total,\n        COUNT(*) AS payable_count\n      FROM purchase_receipts pr\n      WHERE pr.status != 'cancelled' AND pr.payment_type = 'credit' AND pr.is_paid = 0\n    ")).get();
        return __assign(__assign(__assign({}, sales), purchases), payable);
    });
    ipcMain.handle('reports:salesPurchaseTrend', function (_e, filters) {
        var _a, _b;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var sCond = ["s.status != 'voided'"];
        var sParams = [];
        if (date_from) {
            sCond.push("date(s.sold_at) >= ?");
            sParams.push(date_from);
        }
        if (date_to) {
            sCond.push("date(s.sold_at) <= ?");
            sParams.push(date_to);
        }
        var salesByDay = (_a = db.prepare("\n      SELECT date(s.sold_at) AS d,\n             COALESCE(SUM(s.total_amount), 0)   AS sales_net,\n             COALESCE(SUM(".concat(SALE_COST_SUB, "), 0) AS sales_cost\n      FROM sales s\n      WHERE ").concat(sCond.join(' AND '), "\n      GROUP BY date(s.sold_at)\n    "))).all.apply(_a, sParams);
        var pCond = ["pr.status != 'cancelled'"];
        var pParams = [];
        if (date_from) {
            pCond.push("date(pr.created_at) >= ?");
            pParams.push(date_from);
        }
        if (date_to) {
            pCond.push("date(pr.created_at) <= ?");
            pParams.push(date_to);
        }
        var purchaseByDay = (_b = db.prepare("\n      SELECT date(pr.created_at) AS d,\n             COALESCE(SUM(".concat(PURCHASE_NET_SUB, "), 0) AS purchase_total\n      FROM purchase_receipts pr\n      WHERE ").concat(pCond.join(' AND '), "\n      GROUP BY date(pr.created_at)\n    "))).all.apply(_b, pParams);
        var map = new Map();
        for (var _i = 0, salesByDay_1 = salesByDay; _i < salesByDay_1.length; _i++) {
            var r = salesByDay_1[_i];
            map.set(r.d, { date: r.d, sales_net: r.sales_net, sales_cost: r.sales_cost, sales_profit: r.sales_net - r.sales_cost, purchase_total: 0 });
        }
        for (var _c = 0, purchaseByDay_1 = purchaseByDay; _c < purchaseByDay_1.length; _c++) {
            var r = purchaseByDay_1[_c];
            var e = map.get(r.d);
            if (e)
                e.purchase_total = r.purchase_total;
            else
                map.set(r.d, { date: r.d, sales_net: 0, sales_cost: 0, sales_profit: 0, purchase_total: r.purchase_total });
        }
        return Array.from(map.values()).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    });
    ipcMain.handle('reports:accountsPayable', function () {
        var db = getDb();
        var rows = db.prepare("\n      SELECT pr.invoice_no, pr.supplier_invoice_no, pr.created_at AS received_at,\n             pr.due_date, s.name AS supplier_name,\n             ".concat(PURCHASE_NET_SUB, " AS amount,\n             CAST(julianday(date('now')) - julianday(date(pr.due_date)) AS INTEGER) AS days_overdue\n      FROM purchase_receipts pr\n      LEFT JOIN suppliers s ON s.id = pr.supplier_id\n      WHERE pr.status != 'cancelled' AND pr.payment_type = 'credit' AND pr.is_paid = 0\n      ORDER BY (pr.due_date IS NULL), date(pr.due_date) ASC, pr.created_at ASC\n    ")).all();
        // Aging buckets by days overdue (negative/unset = not yet due).
        var buckets = { not_due: 0, d1_30: 0, d31_60: 0, d60_plus: 0 };
        for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
            var r = rows_1[_i];
            var o = r.days_overdue;
            if (o == null || o <= 0)
                buckets.not_due += r.amount;
            else if (o <= 30)
                buckets.d1_30 += r.amount;
            else if (o <= 60)
                buckets.d31_60 += r.amount;
            else
                buckets.d60_plus += r.amount;
        }
        var total = rows.reduce(function (s, r) { return s + r.amount; }, 0);
        return { rows: rows, total: total, count: rows.length, buckets: buckets };
    });
    // ── ขย.9 — บัญชีการซื้อยา (Drug Purchase Record per Thai Pharmacy Council) ──
    // One row per drug line in a non-cancelled GR within the date range. Bundle
    // SKUs are excluded — they can carry is_drug=1 as a category hint but are
    // sold-only constructs (purchases hit their component lots, not the bundle).
    ipcMain.handle('reports:khorYor9', function (_e, filters) {
        var _a;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var conds = [
            "pr.status = 'completed'",
            "pr.cancelled_at IS NULL",
            "p.is_drug = 1",
            "p.is_bundle = 0",
        ];
        var params = [];
        if (date_from) {
            conds.push("date(pr.created_at) >= date(?)");
            params.push(date_from);
        }
        if (date_to) {
            conds.push("date(pr.created_at) <= date(?)");
            params.push(date_to);
        }
        return (_a = db.prepare("\n      SELECT\n        pr.invoice_no                                              AS invoice_no,\n        pr.created_at                                              AS purchase_date,\n        COALESCE(s.name, '')                                       AS supplier_name,\n        COALESCE(NULLIF(p.name_for_print,''), p.trade_name)        AS drug_name,\n        COALESCE(pri.lot_number, '')                               AS lot_number,\n        pri.qty                                                    AS qty,\n        COALESCE(u.name, '')                                       AS unit_name\n      FROM purchase_receipt_items pri\n      JOIN purchase_receipts pr ON pr.invoice_no = pri.invoice_no\n      JOIN products          p  ON p.id  = pri.product_id\n      LEFT JOIN suppliers    s  ON s.id  = pr.supplier_id\n      LEFT JOIN item_units   u  ON u.id  = p.unit_id\n      WHERE ".concat(conds.join(' AND '), "\n      ORDER BY pr.created_at ASC, pri.invoice_no ASC, pri.id ASC\n    "))).all.apply(_a, params);
    });
}
