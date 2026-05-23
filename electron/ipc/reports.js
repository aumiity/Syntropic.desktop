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
    // Compute sales+purchase rollup for a date window. Pulled out so we can run
    // it twice (current + previous period) for delta widgets without duplicating
    // the SQL or losing the SALE_COST_SUB / PURCHASE_NET_SUB sharing.
    function computeFinanceWindow(date_from, date_to) {
        var _a, _b;
        var db = getDb();
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
        return __assign(__assign({}, sales), purchases);
    }
    // Same-length window immediately before [date_from, date_to]. e.g. May 1–23
    // (23 days) → April 8–30. Returned as ISO yyyy-mm-dd to match input format.
    function previousWindow(date_from, date_to) {
        var ms = new Date(date_to).getTime() - new Date(date_from).getTime();
        var days = Math.round(ms / 86400000) + 1;
        var prevTo = new Date(date_from);
        prevTo.setDate(prevTo.getDate() - 1);
        var prevFrom = new Date(prevTo);
        prevFrom.setDate(prevFrom.getDate() - (days - 1));
        return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
    }
    ipcMain.handle('reports:financeSummary', function (_e, filters) {
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to, with_compare = filters.with_compare;
        var current = computeFinanceWindow(date_from, date_to);
        // Accounts payable is CURRENT outstanding — never date-bound.
        var payable = db.prepare("\n      SELECT\n        COALESCE(SUM(".concat(PURCHASE_NET_SUB, "), 0) AS payable_total,\n        COUNT(*) AS payable_count\n      FROM purchase_receipts pr\n      WHERE pr.status != 'cancelled' AND pr.payment_type = 'credit' AND pr.is_paid = 0\n    ")).get();
        // `previous` only included on explicit opt-in; existing callers that don't
        // pass with_compare get the same shape as before (no perf hit for a second
        // round of aggregation when not needed).
        var previous = null;
        if (with_compare && date_from && date_to) {
            var prev = previousWindow(date_from, date_to);
            previous = __assign(__assign({}, computeFinanceWindow(prev.from, prev.to)), { date_from: prev.from, date_to: prev.to });
        }
        return __assign(__assign(__assign({}, current), payable), { previous: previous });
    });
    ipcMain.handle('reports:salesPurchaseTrend', function (_e, filters) {
        var _a, _b;
        var _c;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var granularity = (_c = filters.granularity) !== null && _c !== void 0 ? _c : 'day';
        // SQLite strftime keys produce comparable strings ordered correctly when
        // sorted lexicographically (zero-padded month/week). For day we keep
        // date() so the key remains a valid yyyy-mm-dd that the frontend can pass
        // to existing formatters; the other granularities return the raw key
        // (frontend renders "พ.ค. 2569" / "สัปดาห์ 21" / "2569" / "14:00").
        var keyForSales = (granularity === 'hour' ? "strftime('%Y-%m-%d %H:00', s.sold_at)" :
            granularity === 'week' ? "strftime('%Y-W%W', s.sold_at)" :
                granularity === 'month' ? "strftime('%Y-%m', s.sold_at)" :
                    granularity === 'year' ? "strftime('%Y', s.sold_at)" :
                        "date(s.sold_at)");
        var keyForPurchase = (granularity === 'hour' ? "strftime('%Y-%m-%d %H:00', pr.created_at)" :
            granularity === 'week' ? "strftime('%Y-W%W', pr.created_at)" :
                granularity === 'month' ? "strftime('%Y-%m', pr.created_at)" :
                    granularity === 'year' ? "strftime('%Y', pr.created_at)" :
                        "date(pr.created_at)");
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
        var salesByBucket = (_a = db.prepare("\n      SELECT ".concat(keyForSales, " AS d,\n             COALESCE(SUM(s.total_amount), 0)   AS sales_net,\n             COALESCE(SUM(").concat(SALE_COST_SUB, "), 0) AS sales_cost\n      FROM sales s\n      WHERE ").concat(sCond.join(' AND '), "\n      GROUP BY ").concat(keyForSales, "\n    "))).all.apply(_a, sParams);
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
        var purchaseByBucket = (_b = db.prepare("\n      SELECT ".concat(keyForPurchase, " AS d,\n             COALESCE(SUM(").concat(PURCHASE_NET_SUB, "), 0) AS purchase_total\n      FROM purchase_receipts pr\n      WHERE ").concat(pCond.join(' AND '), "\n      GROUP BY ").concat(keyForPurchase, "\n    "))).all.apply(_b, pParams);
        var map = new Map();
        for (var _i = 0, salesByBucket_1 = salesByBucket; _i < salesByBucket_1.length; _i++) {
            var r = salesByBucket_1[_i];
            map.set(r.d, { date: r.d, sales_net: r.sales_net, sales_cost: r.sales_cost, sales_profit: r.sales_net - r.sales_cost, purchase_total: 0 });
        }
        for (var _d = 0, purchaseByBucket_1 = purchaseByBucket; _d < purchaseByBucket_1.length; _d++) {
            var r = purchaseByBucket_1[_d];
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
    // ── Dashboard handlers ───────────────────────────────────────────────────
    // Used by /reports/dashboard. Most reuse the SALE_COST_SUB / PURCHASE_NET_SUB
    // fragments defined above so revenue/cost/profit numbers stay consistent
    // with financeSummary and salesList. All time-bound handlers exclude
    // s.status='voided' (sales) and pr.status='cancelled' (purchases).
    // Top products within window — by qty, revenue, profit, or low_profit
    // (lowest margin first; surfaces loss-leaders / mispriced SKUs).
    ipcMain.handle('reports:topProducts', function (_e, filters) {
        var _a;
        var _b, _c;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var by = (_b = filters.by) !== null && _b !== void 0 ? _b : 'revenue';
        var limit = (_c = filters.limit) !== null && _c !== void 0 ? _c : 10;
        var conds = ["s.status != 'voided'", "si.is_cancelled = 0"];
        var params = [];
        if (date_from) {
            conds.push("date(s.sold_at) >= ?");
            params.push(date_from);
        }
        if (date_to) {
            conds.push("date(s.sold_at) <= ?");
            params.push(date_to);
        }
        var where = "WHERE ".concat(conds.join(' AND '));
        // cost = Σ(lot qty × lot cost_price), matched per sale_item. Same expression
        // as salesList's total_cost subquery but pivoted by product instead of sale.
        var orderBy = (by === 'qty' ? "qty DESC" :
            by === 'profit' ? "profit DESC" :
                by === 'low_profit' ? "profit ASC" :
                    "revenue DESC");
        return (_a = db.prepare("\n      SELECT p.id                                        AS product_id,\n             p.trade_name,\n             u.name                                      AS unit_name,\n             COALESCE(SUM(si.qty), 0)                    AS qty,\n             COALESCE(SUM(si.line_total), 0)             AS revenue,\n             COALESCE(SUM((\n               SELECT COALESCE(SUM(sil.qty * pl.cost_price), 0)\n               FROM sale_item_lots sil\n               LEFT JOIN product_lots pl ON pl.id = sil.lot_id\n               WHERE sil.sale_item_id = si.id AND sil.is_cancelled = 0\n             )), 0)                                      AS cost,\n             COALESCE(SUM(si.line_total), 0) - COALESCE(SUM((\n               SELECT COALESCE(SUM(sil.qty * pl.cost_price), 0)\n               FROM sale_item_lots sil\n               LEFT JOIN product_lots pl ON pl.id = sil.lot_id\n               WHERE sil.sale_item_id = si.id AND sil.is_cancelled = 0\n             )), 0)                                      AS profit\n      FROM sale_items si\n      JOIN sales s    ON s.id = si.sale_id\n      JOIN products p ON p.id = si.product_id\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      ".concat(where, "\n      GROUP BY p.id\n      ORDER BY ").concat(orderBy, "\n      LIMIT ?\n    "))).all.apply(_a, __spreadArray(__spreadArray([], params, false), [limit], false));
    });
    // Top suppliers by purchase amount in window. Same PURCHASE_NET_SUB logic
    // as financeSummary so totals reconcile.
    ipcMain.handle('reports:topSuppliers', function (_e, filters) {
        var _a;
        var _b;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var limit = (_b = filters.limit) !== null && _b !== void 0 ? _b : 10;
        var conds = ["pr.status != 'cancelled'", "pr.supplier_id IS NOT NULL"];
        var params = [];
        if (date_from) {
            conds.push("date(pr.created_at) >= ?");
            params.push(date_from);
        }
        if (date_to) {
            conds.push("date(pr.created_at) <= ?");
            params.push(date_to);
        }
        var where = "WHERE ".concat(conds.join(' AND '));
        return (_a = db.prepare("\n      SELECT s.id                            AS supplier_id,\n             s.name                          AS supplier_name,\n             COUNT(*)                        AS receipt_count,\n             COALESCE(SUM(".concat(PURCHASE_NET_SUB, "), 0) AS total_amount\n      FROM purchase_receipts pr\n      JOIN suppliers s ON s.id = pr.supplier_id\n      ").concat(where, "\n      GROUP BY s.id\n      ORDER BY total_amount DESC\n      LIMIT ?\n    "))).all.apply(_a, __spreadArray(__spreadArray([], params, false), [limit], false));
    });
    // Bills/sales by hour. Two modes:
    //   single_day  — date_from === date_to → returns up to 24 points for that
    //                 actual day (gaps filled with zero so the chart shows a
    //                 continuous 0..23 axis).
    //   aggregated  — multi-day → buckets by hour-of-day across the whole range
    //                 (average busiest times). Same fill so 24 points always.
    ipcMain.handle('reports:hourlyTraffic', function (_e, filters) {
        var _a;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var mode = (date_from && date_to && date_from === date_to) ? 'single_day' : 'aggregated';
        var conds = ["s.status != 'voided'"];
        var params = [];
        if (date_from) {
            conds.push("date(s.sold_at) >= ?");
            params.push(date_from);
        }
        if (date_to) {
            conds.push("date(s.sold_at) <= ?");
            params.push(date_to);
        }
        var where = "WHERE ".concat(conds.join(' AND '));
        var rows = (_a = db.prepare("\n      SELECT CAST(strftime('%H', s.sold_at) AS INTEGER) AS hour,\n             COUNT(*)                                   AS bills,\n             COALESCE(SUM(s.total_amount), 0)           AS sales\n      FROM sales s\n      ".concat(where, "\n      GROUP BY hour\n      ORDER BY hour ASC\n    "))).all.apply(_a, params);
        // Fill zero-buckets so charts get a continuous 0..23 axis.
        var map = new Map(rows.map(function (r) { return [r.hour, r]; }));
        var points = Array.from({ length: 24 }, function (_, h) { var _a; return (_a = map.get(h)) !== null && _a !== void 0 ? _a : { hour: h, bills: 0, sales: 0 }; });
        return { mode: mode, points: points };
    });
    // Cashier leaderboard within window. Cost subquery is the same as
    // topProducts to keep profit comparable across reports.
    ipcMain.handle('reports:cashierLeaderboard', function (_e, filters) {
        var _a;
        var _b;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var limit = (_b = filters.limit) !== null && _b !== void 0 ? _b : 10;
        var conds = ["s.status != 'voided'", "s.sold_by IS NOT NULL"];
        var params = [];
        if (date_from) {
            conds.push("date(s.sold_at) >= ?");
            params.push(date_from);
        }
        if (date_to) {
            conds.push("date(s.sold_at) <= ?");
            params.push(date_to);
        }
        var where = "WHERE ".concat(conds.join(' AND '));
        return (_a = db.prepare("\n      SELECT u.id                                    AS user_id,\n             COALESCE(u.name, '(\u0E44\u0E21\u0E48\u0E17\u0E23\u0E32\u0E1A)')           AS user_name,\n             COUNT(*)                                AS bill_count,\n             COALESCE(SUM(s.total_amount), 0)        AS total_amount,\n             COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(".concat(SALE_COST_SUB, "), 0) AS profit\n      FROM sales s\n      LEFT JOIN users u ON u.id = s.sold_by\n      ").concat(where, "\n      GROUP BY s.sold_by\n      ORDER BY total_amount DESC\n      LIMIT ?\n    "))).all.apply(_a, __spreadArray(__spreadArray([], params, false), [limit], false));
    });
    // Extra metrics for the dashboard — packed in one round-trip:
    //   - sale_type counts (retail / wholesale / rx / return / voided)
    //   - avg basket value + avg items per bill (non-voided non-return)
    //   - new vs returning customers within window
    //   - return rate / void rate / discount usage
    //   - bundle revenue share
    ipcMain.handle('reports:salesStats', function (_e, filters) {
        var _a, _b, _c, _d;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var sCond = [];
        var sParams = [];
        if (date_from) {
            sCond.push("date(s.sold_at) >= ?");
            sParams.push(date_from);
        }
        if (date_to) {
            sCond.push("date(s.sold_at) <= ?");
            sParams.push(date_to);
        }
        var sWhere = sCond.length ? "WHERE ".concat(sCond.join(' AND ')) : '';
        var counts = (_a = db.prepare("\n      SELECT\n        COUNT(*) AS count_all,\n        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'retail'    THEN 1 ELSE 0 END), 0) AS count_retail,\n        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'wholesale' THEN 1 ELSE 0 END), 0) AS count_wholesale,\n        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'rx'        THEN 1 ELSE 0 END), 0) AS count_rx,\n        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.sale_type = 'return'    THEN 1 ELSE 0 END), 0) AS count_return,\n        COALESCE(SUM(CASE WHEN s.status = 'voided' THEN 1 ELSE 0 END), 0) AS count_voided,\n        COALESCE(SUM(CASE WHEN s.sale_type = 'return' THEN s.total_amount ELSE 0 END), 0) AS return_amount,\n        COALESCE(SUM(CASE WHEN s.status != 'voided' AND s.total_discount > 0 THEN 1 ELSE 0 END), 0) AS count_discounted\n      FROM sales s ".concat(sWhere, "\n    "))).get.apply(_a, sParams);
        // Avg basket — limit to revenue-positive types (exclude returns + voids).
        var basket = (_b = db.prepare("\n      SELECT\n        COALESCE(AVG(s.total_amount), 0) AS avg_basket,\n        COALESCE(AVG(items.kinds), 0)    AS avg_item_kinds,\n        COALESCE(AVG(items.units), 0)    AS avg_units_per_bill\n      FROM sales s\n      LEFT JOIN (\n        SELECT si.sale_id,\n               COUNT(DISTINCT si.product_id) AS kinds,\n               COALESCE(SUM(si.qty), 0)      AS units\n        FROM sale_items si WHERE si.is_cancelled = 0\n        GROUP BY si.sale_id\n      ) items ON items.sale_id = s.id\n      WHERE s.status != 'voided' AND s.sale_type != 'return'\n      ".concat(sCond.length ? 'AND ' + sCond.join(' AND ') : '', "\n    "))).get.apply(_b, sParams);
        // New vs returning — "new" = customer's first ever sale falls within the window.
        // Walk-in (C0000) is treated as a real customer (CLAUDE.md invariant), so it
        // appears here too; the share will be heavy on a single C0000 row by design.
        var customers = (_c = db.prepare("\n      SELECT\n        COUNT(DISTINCT s.customer_id) AS unique_customers,\n        COALESCE(SUM(CASE\n          WHEN first_sale.first_sold_at >= COALESCE(?, '0000-01-01')\n           AND first_sale.first_sold_at <= COALESCE(?, '9999-12-31')\n          THEN 1 ELSE 0\n        END), 0) AS new_customers\n      FROM (\n        SELECT DISTINCT s.customer_id\n        FROM sales s\n        WHERE s.status != 'voided' AND s.customer_id IS NOT NULL ".concat(sCond.length ? 'AND ' + sCond.join(' AND ') : '', "\n      ) AS s\n      LEFT JOIN (\n        SELECT customer_id, MIN(date(sold_at)) AS first_sold_at\n        FROM sales WHERE status != 'voided' AND customer_id IS NOT NULL\n        GROUP BY customer_id\n      ) first_sale ON first_sale.customer_id = s.customer_id\n    "))).get.apply(_c, __spreadArray([date_from !== null && date_from !== void 0 ? date_from : null, date_to !== null && date_to !== void 0 ? date_to : null], sParams, false));
        // Bundle revenue share.
        var bundle = (_d = db.prepare("\n      SELECT\n        COALESCE(SUM(CASE WHEN p.is_bundle = 1 THEN si.line_total ELSE 0 END), 0) AS bundle_revenue,\n        COALESCE(SUM(si.line_total), 0) AS total_revenue\n      FROM sale_items si\n      JOIN sales    s ON s.id = si.sale_id\n      JOIN products p ON p.id = si.product_id\n      WHERE s.status != 'voided' AND si.is_cancelled = 0\n      ".concat(sCond.length ? 'AND ' + sCond.join(' AND ') : '', "\n    "))).get.apply(_d, sParams);
        var non_voided_non_return = counts.count_retail + counts.count_wholesale + counts.count_rx;
        var return_rate = non_voided_non_return > 0
            ? counts.count_return / (non_voided_non_return + counts.count_return)
            : 0;
        var void_rate = counts.count_all > 0 ? counts.count_voided / counts.count_all : 0;
        var discount_rate = non_voided_non_return > 0
            ? counts.count_discounted / non_voided_non_return
            : 0;
        var bundle_share = bundle.total_revenue > 0
            ? bundle.bundle_revenue / bundle.total_revenue
            : 0;
        return {
            counts: {
                all: counts.count_all,
                retail: counts.count_retail,
                wholesale: counts.count_wholesale,
                rx: counts.count_rx,
                return: counts.count_return,
                voided: counts.count_voided,
            },
            return_amount: counts.return_amount,
            avg_basket: basket.avg_basket,
            avg_item_kinds: basket.avg_item_kinds,
            avg_units_per_bill: basket.avg_units_per_bill,
            unique_customers: customers.unique_customers,
            new_customers: customers.new_customers,
            returning_customers: Math.max(0, customers.unique_customers - customers.new_customers),
            return_rate: return_rate,
            void_rate: void_rate,
            discount_rate: discount_rate,
            bundle_revenue: bundle.bundle_revenue,
            bundle_share: bundle_share,
        };
    });
    // Products with stock on hand but no sale_items within window. Drives the
    // "สินค้าไม่เคลื่อนไหวในช่วงนี้" panel. avg_monthly_6m is a 6-month rolling
    // window (not affected by the date filter) so users see how badly the SKU
    // is stalled relative to its own baseline.
    ipcMain.handle('reports:inactiveProducts', function (_e, filters) {
        var _a;
        var _b;
        var db = getDb();
        var date_from = filters.date_from, date_to = filters.date_to;
        var limit = (_b = filters.limit) !== null && _b !== void 0 ? _b : 50;
        var stockExpr = "COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)";
        var costExpr = "COALESCE((SELECT SUM(qty_on_hand * cost_price) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)";
        var sCond = ["s.status != 'voided'", "si.is_cancelled = 0"];
        var sParams = [];
        if (date_from) {
            sCond.push("date(s.sold_at) >= ?");
            sParams.push(date_from);
        }
        if (date_to) {
            sCond.push("date(s.sold_at) <= ?");
            sParams.push(date_to);
        }
        var inactiveCondition = "NOT EXISTS (\n      SELECT 1 FROM sale_items si\n      JOIN sales s ON s.id = si.sale_id\n      WHERE si.product_id = p.id AND ".concat(sCond.join(' AND '), "\n    )");
        return (_a = db.prepare("\n      SELECT p.id                                  AS product_id,\n             p.trade_name,\n             u.name                                AS unit_name,\n             ".concat(stockExpr, "                          AS qty_on_hand,\n             ").concat(costExpr, "                           AS cost_value,\n             (SELECT MAX(s2.sold_at)\n                FROM sale_items si2\n                JOIN sales s2 ON s2.id = si2.sale_id\n                WHERE si2.product_id = p.id AND s2.status != 'voided' AND si2.is_cancelled = 0\n             )                                     AS last_sold_at,\n             (SELECT COALESCE(SUM(sil3.qty), 0) / 6.0\n                FROM sale_item_lots sil3\n                JOIN sale_items si3 ON si3.id = sil3.sale_item_id\n                JOIN sales s3 ON s3.id = si3.sale_id\n                WHERE sil3.product_id = p.id\n                  AND sil3.is_cancelled = 0\n                  AND si3.is_cancelled = 0\n                  AND s3.status != 'voided'\n                  AND date(s3.sold_at) >= date('now','-6 months')\n             )                                     AS avg_monthly_6m\n      FROM products p\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      WHERE p.is_disabled = 0\n        AND p.is_bundle   = 0\n        AND ").concat(stockExpr, " > 0\n        AND ").concat(inactiveCondition, "\n      ORDER BY cost_value DESC\n      LIMIT ?\n    "))).all.apply(_a, __spreadArray(__spreadArray([], sParams, false), [limit], false));
    });
    // Sales velocity per product (6-month rolling base, not affected by date
    // filter) + suggested safety_stock / reorder_point for the operator. We
    // explicitly do NOT persist the suggestions — owner reviews and edits the
    // value on the product page if they agree.
    //
    // avg_monthly_6m subtracts returns ('sale_return' movements would double the
    // count, so we filter by sale_type and use sale_item_lots qty as the canonical
    // base-unit consumption — non-base unit sales are already converted at POS
    // save). bundles: consumption hits component lots, so summing by
    // sale_item_lots.product_id naturally rolls component velocity.
    ipcMain.handle('reports:productVelocity', function (_e, filters) {
        var _a;
        var _b, _c;
        var db = getDb();
        var limit = (_b = filters.limit) !== null && _b !== void 0 ? _b : 50;
        var sort_by = (_c = filters.sort_by) !== null && _c !== void 0 ? _c : 'days_cover';
        var conds = ["p.is_disabled = 0", "p.is_bundle = 0"];
        var params = [];
        if (filters.q) {
            conds.push("(p.trade_name LIKE ? OR p.code LIKE ?)");
            var lq = "%".concat(filters.q, "%");
            params.push(lq, lq);
        }
        var where = "WHERE ".concat(conds.join(' AND '));
        // Build per-product consumption (returns SUBTRACTED) over the last 6 months.
        // months_with_data = distinct yyyy-mm in that window — informs the "ข้อมูลยังน้อย" flag.
        var rows = (_a = db.prepare("\n      SELECT p.id AS product_id,\n             p.trade_name,\n             p.reorder_point,\n             p.safety_stock,\n             u.name AS unit_name,\n             COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0) AS current_stock,\n             COALESCE((\n               SELECT SUM(CASE WHEN s.sale_type = 'return' THEN -sil.qty ELSE sil.qty END)\n                 FROM sale_item_lots sil\n                 JOIN sale_items si ON si.id = sil.sale_item_id\n                 JOIN sales s ON s.id = si.sale_id\n                WHERE sil.product_id = p.id\n                  AND sil.is_cancelled = 0\n                  AND si.is_cancelled = 0\n                  AND s.status != 'voided'\n                  AND date(s.sold_at) >= date('now','-6 months')\n             ), 0) AS total_6m_qty,\n             COALESCE((\n               SELECT COUNT(DISTINCT strftime('%Y-%m', s.sold_at))\n                 FROM sale_item_lots sil\n                 JOIN sale_items si ON si.id = sil.sale_item_id\n                 JOIN sales s ON s.id = si.sale_id\n                WHERE sil.product_id = p.id\n                  AND sil.is_cancelled = 0\n                  AND si.is_cancelled = 0\n                  AND s.status != 'voided'\n                  AND date(s.sold_at) >= date('now','-6 months')\n             ), 0) AS months_with_data\n      FROM products p\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      ".concat(where, "\n    "))).all.apply(_a, params);
        // Project derived values JS-side — cleaner than nested CASEs and avoids
        // recomputing avg_daily three times in SQL.
        var enriched = rows.map(function (r) {
            var _a;
            var avg_monthly_6m = Math.max(0, ((_a = r.total_6m_qty) !== null && _a !== void 0 ? _a : 0) / 6);
            var avg_daily = avg_monthly_6m / 30;
            var days_cover = avg_daily > 0 ? r.current_stock / avg_daily : null;
            var suggested_safety_stock = Math.ceil(avg_daily * 30);
            var suggested_reorder_point = Math.ceil(avg_daily * 14);
            return {
                product_id: r.product_id,
                trade_name: r.trade_name,
                unit_name: r.unit_name,
                current_stock: r.current_stock,
                reorder_point: r.reorder_point,
                safety_stock: r.safety_stock,
                avg_monthly_6m: avg_monthly_6m,
                avg_daily: avg_daily,
                days_cover: days_cover,
                months_with_data: r.months_with_data,
                suggested_safety_stock: suggested_safety_stock,
                suggested_reorder_point: suggested_reorder_point,
            };
        });
        // Sort by days_cover ASC (urgent first) or avg_monthly DESC (high-velocity first).
        enriched.sort(function (a, b) {
            if (sort_by === 'days_cover') {
                var ax = a.avg_daily > 0 ? a.days_cover : Number.POSITIVE_INFINITY;
                var bx = b.avg_daily > 0 ? b.days_cover : Number.POSITIVE_INFINITY;
                if (ax !== bx)
                    return ax - bx;
                return b.current_stock - a.current_stock;
            }
            return b.avg_monthly_6m - a.avg_monthly_6m;
        });
        return enriched.slice(0, limit);
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
