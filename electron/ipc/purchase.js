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
import { assertNotBundle, recomputeAvgCost, propagateCostToBundles } from '../db/pricing';
import dayjs from 'dayjs';
import { requireAdmin } from '../auth/session';
export function registerPurchaseHandlers() {
    var db = getDb();
    // Migrations (safe to call repeatedly)
    for (var _i = 0, _a = [
        "ALTER TABLE purchase_receipts ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0",
        "ALTER TABLE purchase_receipts ADD COLUMN surcharge_amount REAL NOT NULL DEFAULT 0",
        "ALTER TABLE purchase_receipts ADD COLUMN vat_mode TEXT NOT NULL DEFAULT 'none'",
        "ALTER TABLE purchase_receipts ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0",
        "ALTER TABLE purchase_receipts ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0",
        "ALTER TABLE purchase_receipts ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'",
        "ALTER TABLE purchase_receipts ADD COLUMN cancelled_at TEXT",
        "ALTER TABLE purchase_receipts ADD COLUMN cancelled_by INTEGER",
        "ALTER TABLE purchase_receipts ADD COLUMN cancel_reason TEXT",
        "ALTER TABLE purchase_receipts ADD COLUMN supplier_id INTEGER",
        "ALTER TABLE purchase_receipts ADD COLUMN supplier_invoice_no TEXT",
        "ALTER TABLE purchase_receipts ADD COLUMN order_date TEXT",
        "ALTER TABLE purchase_receipts ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'cash'",
        "ALTER TABLE purchase_receipts ADD COLUMN due_date TEXT",
        "ALTER TABLE purchase_receipts ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE purchase_receipts ADD COLUMN paid_date TEXT",
        "ALTER TABLE product_lots ADD COLUMN order_date TEXT",
        "CREATE TABLE IF NOT EXISTS purchase_receipt_items (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      invoice_no TEXT NOT NULL,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      lot_id INTEGER REFERENCES product_lots(id),\n      lot_number TEXT NOT NULL,\n      manufactured_date TEXT,\n      expiry_date TEXT,\n      cost_price REAL NOT NULL DEFAULT 0,\n      sell_price REAL NOT NULL DEFAULT 0,\n      qty REAL NOT NULL DEFAULT 0,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    )",
        "CREATE INDEX IF NOT EXISTS idx_pri_invoice ON purchase_receipt_items(invoice_no)",
        "CREATE INDEX IF NOT EXISTS idx_pri_lot ON purchase_receipt_items(lot_id)",
    ]; _i < _a.length; _i++) {
        var sql = _a[_i];
        try {
            db.exec(sql);
        }
        catch (_b) { }
    }
    // One-time backfill of purchase_receipt_items from existing product_lots.
    // Best-effort: for each lot with an invoice_no, create a single line using
    // current qty_received as the contribution. GRs that were overwritten by
    // later top-ups (the lot-merge bug) cannot be recovered; only the most
    // recent invoice_no on each lot survives in product_lots.
    var itemsBackfillNeeded = db.prepare("SELECT COUNT(*) as c FROM purchase_receipt_items").get().c === 0;
    if (itemsBackfillNeeded) {
        db.exec("\n      INSERT INTO purchase_receipt_items\n        (invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date,\n         cost_price, sell_price, qty, note, created_at)\n      SELECT pl.invoice_no, pl.product_id, pl.id, pl.lot_number, pl.manufactured_date, pl.expiry_date,\n             pl.cost_price, pl.sell_price, pl.qty_received, pl.note, COALESCE(pl.created_at, datetime('now','localtime'))\n      FROM product_lots pl\n      WHERE pl.invoice_no IS NOT NULL AND pl.invoice_no <> ''\n    ");
    }
    // Backfill purchase_receipts header metadata (supplier/payment/dates) from
    // any matching product_lots row, only for receipts where these fields are
    // still empty (idempotent on re-runs).
    db.exec("\n    UPDATE purchase_receipts\n    SET supplier_id        = COALESCE(supplier_id,        (SELECT pl.supplier_id        FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1)),\n        supplier_invoice_no= COALESCE(supplier_invoice_no,(SELECT pl.supplier_invoice_no FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1)),\n        order_date         = COALESCE(order_date,         (SELECT pl.order_date         FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1)),\n        payment_type       = COALESCE(NULLIF(payment_type,''), (SELECT pl.payment_type FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1), 'cash'),\n        due_date           = COALESCE(due_date,           (SELECT pl.due_date           FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1)),\n        is_paid            = COALESCE(NULLIF(is_paid, 0), (SELECT pl.is_paid           FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1), 0),\n        paid_date          = COALESCE(paid_date,          (SELECT pl.paid_date          FROM product_lots pl WHERE pl.invoice_no = purchase_receipts.invoice_no LIMIT 1))\n    WHERE supplier_id IS NULL OR supplier_invoice_no IS NULL OR order_date IS NULL\n  ");
    ipcMain.handle('purchase:nextGRNumber', function () {
        var db = getDb();
        var today = dayjs().format('YYYYMMDD');
        var count = db.prepare("\n      SELECT COUNT(DISTINCT invoice_no) as c FROM purchase_receipts\n      WHERE invoice_no LIKE ?\n    ").get("GR-".concat(today, "%")).c;
        return "GR-".concat(today, "-").concat(String(count + 1).padStart(4, '0'));
    });
    ipcMain.handle('purchase:save', function (_e, payload) {
        var _a, _b;
        var db = getDb();
        // Input VAT (ภาษีซื้อ) — declared PER BILL because not every supplier is
        // VAT-registered. Only a VAT-registered shop can claim input VAT, so a
        // NO-VAT shop is forced to 'none' here regardless of payload (everything
        // it pays IS cost). The VAT base is the line sum as sent — the renderer
        // already distributes bill discount/surcharge into the line totals.
        var shopVatEnabled = ((_b = (_a = db.prepare("SELECT vat_enabled FROM sales_settings LIMIT 1").get()) === null || _a === void 0 ? void 0 : _a.vat_enabled) !== null && _b !== void 0 ? _b : 0) === 1;
        var vatMode = shopVatEnabled && (payload.vat_mode === 'inclusive' || payload.vat_mode === 'exclusive')
            ? payload.vat_mode : 'none';
        var vatRate = vatMode === 'none' ? 0 : (Number(payload.vat_rate) > 0 ? Number(payload.vat_rate) : 7);
        var lineSum = payload.items.reduce(function (s, it) { return s + it.qty * it.cost_price; }, 0);
        var vatAmount = vatMode === 'inclusive' ? lineSum * vatRate / (100 + vatRate)
            : vatMode === 'exclusive' ? lineSum * vatRate / 100
                : 0;
        // Claimable VAT is not cost: for VAT-inclusive bills the cost model
        // (product_lots, weighted avg, stock_movements, last_cost_price) stores
        // the ex-VAT cost. The purchase_receipt_items ledger keeps the entered
        // cost untouched — document fidelity with the supplier invoice. For
        // 'exclusive' bills the entered prices are already ex-VAT.
        var costFactor = vatMode === 'inclusive' ? 100 / (100 + vatRate) : 1;
        var save = db.transaction(function () {
            var _a;
            var _b, _c, _d, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
            // Header is the authoritative source for GR-level metadata
            db.prepare("INSERT OR REPLACE INTO purchase_receipts\n        (invoice_no, supplier_id, supplier_invoice_no, order_date,\n         payment_type, due_date, is_paid, paid_date,\n         note, discount_amount, surcharge_amount,\n         vat_mode, vat_rate, vat_amount, status, created_at)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)")
                .run(payload.invoice_no, payload.supplier_id, payload.supplier_invoice_no, (_b = payload.order_date) !== null && _b !== void 0 ? _b : null, payload.payment_type, (_c = payload.due_date) !== null && _c !== void 0 ? _c : null, payload.is_paid ? 1 : 0, (_d = payload.paid_date) !== null && _d !== void 0 ? _d : null, (_f = payload.note) !== null && _f !== void 0 ? _f : '', (_g = payload.discount_amount) !== null && _g !== void 0 ? _g : 0, (_h = payload.surcharge_amount) !== null && _h !== void 0 ? _h : 0, vatMode, vatRate, vatAmount, payload.receive_date);
            for (var _i = 0, _u = payload.items; _i < _u.length; _i++) {
                var item = _u[_i];
                // Bundles have no own lots — block GR'ing a bundle. UI hides them via
                // pos:searchProducts result filtering, but Purchase/PurchaseIntake call
                // searchProducts without an is_bundle filter so this is the only
                // backstop. assertNotBundle throws inside the transaction → rollback.
                assertNotBundle(db, item.product_id);
                // Cost-model cost (ex-VAT for inclusive bills) — see costFactor above.
                var costEx = item.cost_price * costFactor;
                var existing = db.prepare("SELECT * FROM product_lots WHERE product_id = ? AND lot_number = ?").get(item.product_id, item.lot_number);
                var lotId = void 0;
                var qtyBefore = 0;
                if (existing) {
                    var totalQty = existing.qty_received + item.qty;
                    var avgCost = (existing.qty_received * existing.cost_price + item.qty * costEx) / totalQty;
                    qtyBefore = existing.qty_on_hand;
                    lotId = existing.id;
                    db.prepare("\n            UPDATE product_lots SET\n              qty_received = qty_received + ?,\n              qty_on_hand = qty_on_hand + ?,\n              cost_price = ?,\n              sell_price = ?,\n              supplier_id = ?,\n              invoice_no = ?,\n              supplier_invoice_no = ?,\n              order_date = ?,\n              payment_type = ?,\n              due_date = ?,\n              is_paid = ?,\n              paid_date = ?,\n              updated_at = ?\n            WHERE id = ?\n          ").run(item.qty, item.qty, avgCost, item.sell_price, payload.supplier_id, payload.invoice_no, payload.supplier_invoice_no, (_j = payload.order_date) !== null && _j !== void 0 ? _j : null, payload.payment_type, (_k = payload.due_date) !== null && _k !== void 0 ? _k : null, payload.is_paid ? 1 : 0, (_l = payload.paid_date) !== null && _l !== void 0 ? _l : null, payload.receive_date, existing.id);
                }
                else {
                    var lotResult = db.prepare("\n            INSERT INTO product_lots (product_id, supplier_id, lot_number, manufactured_date, expiry_date,\n              cost_price, sell_price, qty_received, qty_on_hand,\n              invoice_no, supplier_invoice_no, order_date, payment_type, due_date, is_paid, paid_date, note, created_at, updated_at)\n            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n          ").run(item.product_id, payload.supplier_id, item.lot_number, (_m = item.manufactured_date) !== null && _m !== void 0 ? _m : null, item.expiry_date, costEx, item.sell_price, item.qty, item.qty, payload.invoice_no, payload.supplier_invoice_no, (_o = payload.order_date) !== null && _o !== void 0 ? _o : null, payload.payment_type, (_p = payload.due_date) !== null && _p !== void 0 ? _p : null, payload.is_paid ? 1 : 0, (_q = payload.paid_date) !== null && _q !== void 0 ? _q : null, (_r = item.note) !== null && _r !== void 0 ? _r : '', payload.receive_date, payload.receive_date);
                    lotId = Number(lotResult.lastInsertRowid);
                }
                db.prepare("\n          INSERT INTO purchase_receipt_items\n            (invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date,\n             cost_price, sell_price, qty, note, created_at)\n          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n        ").run(payload.invoice_no, item.product_id, lotId, item.lot_number, (_s = item.manufactured_date) !== null && _s !== void 0 ? _s : null, item.expiry_date, item.cost_price, item.sell_price, item.qty, (_t = item.note) !== null && _t !== void 0 ? _t : null, payload.receive_date);
                db.prepare("INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)\n          VALUES (?, ?, 'receive', 'stock_receive', ?, ?, ?, ?, ?, ?, ?)").run(item.product_id, lotId, item.qty, qtyBefore, qtyBefore + item.qty, costEx, "\u0E23\u0E31\u0E1A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32: ".concat(payload.invoice_no), payload.userId, payload.receive_date);
                db.prepare("UPDATE products SET price_retail = ?, updated_at = datetime('now','localtime') WHERE id = ?")
                    .run(item.sell_price, item.product_id);
                // last_cost_price = the last cost we actually PAID (display-only).
                // Skip when receiving free goods (cost 0) so a freebie doesn't wipe
                // the real prior cost — the scalar naturally tracks the latest
                // non-zero cost. Stays 0 only for products never paid for (new, or
                // only ever received free). cost_price is NOT touched here — it's
                // recomputed as a weighted average below.
                if (costEx > 0) {
                    db.prepare("UPDATE products SET last_cost_price = ?, updated_at = datetime('now','localtime') WHERE id = ?")
                        .run(costEx, item.product_id);
                }
            }
            // Recompute products.cost_price as the weighted average of open lots,
            // then fan out to any bundle that uses these products as components.
            var affectedIds = Array.from(new Set(payload.items.map(function (i) { return i.product_id; })));
            for (var _v = 0, affectedIds_1 = affectedIds; _v < affectedIds_1.length; _v++) {
                var pid = affectedIds_1[_v];
                recomputeAvgCost(db, pid);
                propagateCostToBundles(db, pid);
            }
            // Surface negative-stock markers that the just-received product(s) now
            // make eligible for retroactive deduction. The renderer uses this to
            // toast the operator + refresh the sidebar badge.
            // Build the IN-list dynamically — better-sqlite3 has no array binding.
            var placeholders = affectedIds.map(function () { return '?'; }).join(',');
            var negativeStockAlerts = affectedIds.length === 0 ? [] : (_a = db.prepare("\n        SELECT sil.product_id,\n               p.trade_name,\n               COUNT(*)                 AS marker_count,\n               COALESCE(SUM(sil.qty),0) AS total_qty\n          FROM sale_item_lots sil\n          JOIN sale_items si ON si.id = sil.sale_item_id\n          JOIN sales      s  ON s.id  = si.sale_id\n          JOIN products   p  ON p.id  = sil.product_id\n         WHERE sil.lot_id      IS NULL\n           AND sil.is_cancelled = 0\n           AND si.is_cancelled  = 0\n           AND s.status         = 'completed'\n           AND sil.product_id IN (".concat(placeholders, ")\n         GROUP BY sil.product_id, p.trade_name\n      "))).all.apply(_a, affectedIds);
            return {
                success: true,
                invoice_no: payload.invoice_no,
                negative_stock_alerts: negativeStockAlerts,
            };
        });
        return save();
    });
    ipcMain.handle('purchase:history', function (_e, filters) {
        var _a, _b, _c;
        var db = getDb();
        var q = filters.q, supplier_id = filters.supplier_id, date_from = filters.date_from, date_to = filters.date_to, payment_type = filters.payment_type, _d = filters.page, page = _d === void 0 ? 1 : _d, limitOpt = filters.limit, _f = filters.status, status = _f === void 0 ? 'all' : _f, sort_by = filters.sort_by, sort_dir = filters.sort_dir;
        // Whitelist sort fields to keep ORDER BY injection-proof.
        var SORT_COLS = {
            created_at: 'pr.created_at',
            invoice_no: 'pr.invoice_no',
            total_cost: 'total_cost',
        };
        var sortCol = sort_by && SORT_COLS[sort_by] ? SORT_COLS[sort_by] : 'pr.created_at';
        var sortDir = sort_dir === 'ASC' ? 'ASC' : 'DESC';
        var limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 20);
        var offset = limit ? (page - 1) * limit : 0;
        var conditions = [];
        var params = [];
        if (q) {
            conditions.push("(pr.invoice_no LIKE ? OR pr.supplier_invoice_no LIKE ?)");
            params.push("%".concat(q, "%"), "%".concat(q, "%"));
        }
        if (date_from) {
            conditions.push("date(pr.created_at) >= ?");
            params.push(date_from);
        }
        if (date_to) {
            conditions.push("date(pr.created_at) <= ?");
            params.push(date_to);
        }
        if (supplier_id) {
            conditions.push("pr.supplier_id = ?");
            params.push(supplier_id);
        }
        var baseWhere = conditions.length ? "WHERE ".concat(conditions.join(' AND ')) : "";
        // Summary uses base filters only (no payment_type / status chip). These are
        // receipt COUNTS per status — no finance figures (kept to a restricted
        // finance page). The cash/credit/unpaid counts exclude cancelled so each
        // card's number matches the rows shown when its filter is clicked.
        var NOT_CANCELLED = "COALESCE(pr.status,'completed') != 'cancelled'";
        var summary = (_a = db.prepare("\n      SELECT\n        COUNT(DISTINCT pr.invoice_no) as count,\n        COUNT(DISTINCT CASE WHEN ".concat(NOT_CANCELLED, " AND pr.payment_type = 'cash'   THEN pr.invoice_no END) as cash_count,\n        COUNT(DISTINCT CASE WHEN ").concat(NOT_CANCELLED, " AND pr.payment_type = 'credit' THEN pr.invoice_no END) as credit_count,\n        COUNT(DISTINCT CASE WHEN ").concat(NOT_CANCELLED, " AND pr.payment_type = 'credit' AND pr.is_paid = 0 THEN pr.invoice_no END) as unpaid_count,\n        COUNT(DISTINCT CASE WHEN pr.status = 'cancelled' THEN pr.invoice_no END) as cancelled_count\n      FROM purchase_receipts pr\n      ").concat(baseWhere, "\n    "))).get.apply(_a, params);
        var rowConditions = __spreadArray([], conditions, true);
        var rowParams = __spreadArray([], params, true);
        if (payment_type === 'unpaid') {
            rowConditions.push("pr.payment_type = 'credit'", "pr.is_paid = 0", NOT_CANCELLED);
        }
        else if (payment_type === 'cash' || payment_type === 'credit') {
            rowConditions.push("pr.payment_type = ?", NOT_CANCELLED);
            rowParams.push(payment_type);
        }
        if (status === 'completed') {
            rowConditions.push("COALESCE(pr.status,'completed') = 'completed'");
        }
        else if (status === 'cancelled') {
            rowConditions.push("pr.status = 'cancelled'");
        }
        var rowWhere = rowConditions.length ? "WHERE ".concat(rowConditions.join(' AND ')) : "";
        var limitClause = limit ? "LIMIT ? OFFSET ?" : '';
        var limitParams = limit ? [limit, offset] : [];
        var rows = (_b = db.prepare("\n      SELECT pr.invoice_no,\n             pr.created_at,\n             COALESCE(pr.status,'completed') as status,\n             pr.cancelled_at, pr.cancel_reason,\n             pr.payment_type, pr.is_paid, pr.due_date,\n             s.name as supplier_name,\n             COALESCE((SELECT COUNT(*) FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no), 0) as item_count,\n             COALESCE((SELECT SUM(pri.qty * pri.cost_price) FROM purchase_receipt_items pri WHERE pri.invoice_no = pr.invoice_no), 0) as total_cost\n      FROM purchase_receipts pr\n      LEFT JOIN suppliers s ON s.id = pr.supplier_id\n      ".concat(rowWhere, "\n      ORDER BY ").concat(sortCol, " ").concat(sortDir, ", pr.invoice_no DESC\n      ").concat(limitClause, "\n    "))).all.apply(_b, __spreadArray(__spreadArray([], rowParams, false), limitParams, false));
        var total = (_c = db.prepare("\n      SELECT COUNT(DISTINCT pr.invoice_no) as c\n      FROM purchase_receipts pr\n      ".concat(rowWhere, "\n    "))).get.apply(_c, rowParams).c;
        return {
            rows: rows,
            total: total,
            page: page,
            limit: limit !== null && limit !== void 0 ? limit : total,
            summary: {
                count: summary.count,
                cash_count: summary.cash_count,
                credit_count: summary.credit_count,
                unpaid_count: summary.unpaid_count,
                cancelled_count: summary.cancelled_count,
            }
        };
    });
    ipcMain.handle('purchase:getReceipt', function (_e, invoice_no) {
        var db = getDb();
        return db.prepare("\n      SELECT pri.id, pri.invoice_no, pri.product_id, pri.lot_id, pri.lot_number,\n             pri.manufactured_date, pri.expiry_date,\n             pri.cost_price, pri.sell_price,\n             pri.qty as qty_received, pri.note,\n             pri.created_at,\n             p.trade_name, p.code as product_code,\n             iu.name as unit_name,\n             pr.supplier_id, pr.supplier_invoice_no, pr.order_date,\n             pr.payment_type, pr.due_date, pr.is_paid, pr.paid_date,\n             s.name as supplier_name,\n             pr.discount_amount, pr.surcharge_amount,\n             COALESCE(pr.vat_mode,'none') as vat_mode, pr.vat_rate, pr.vat_amount,\n             COALESCE(pr.status,'completed') as status,\n             pr.cancelled_at, pr.cancel_reason\n      FROM purchase_receipt_items pri\n      JOIN products p ON p.id = pri.product_id\n      LEFT JOIN item_units iu ON iu.id = p.unit_id\n      LEFT JOIN purchase_receipts pr ON pr.invoice_no = pri.invoice_no\n      LEFT JOIN suppliers s ON s.id = pr.supplier_id\n      WHERE pri.invoice_no = ?\n      ORDER BY pri.id\n    ").all(invoice_no);
    });
    ipcMain.handle('purchase:updateHeader', function (_e, payload) {
        var _a;
        var db = getDb();
        var header = db.prepare("SELECT status FROM purchase_receipts WHERE invoice_no = ?").get(payload.invoice_no);
        if (!header)
            return { success: false, error: 'not_found' };
        if (header.status === 'cancelled')
            return { success: false, error: 'cancelled' };
        if (!payload.supplier_id)
            return { success: false, error: 'supplier_required' };
        if (!((_a = payload.supplier_invoice_no) === null || _a === void 0 ? void 0 : _a.trim()))
            return { success: false, error: 'supplier_invoice_required' };
        if (!payload.receive_date)
            return { success: false, error: 'receive_date_required' };
        if (payload.payment_type === 'credit' && !payload.due_date)
            return { success: false, error: 'due_date_required' };
        var tx = db.transaction(function () {
            var _a, _b, _c;
            db.prepare("\n        UPDATE purchase_receipts SET\n          supplier_id = ?,\n          supplier_invoice_no = ?,\n          order_date = ?,\n          payment_type = ?,\n          due_date = ?,\n          is_paid = ?,\n          paid_date = ?,\n          created_at = ?\n        WHERE invoice_no = ?\n      ").run(payload.supplier_id, payload.supplier_invoice_no.trim(), (_a = payload.order_date) !== null && _a !== void 0 ? _a : null, payload.payment_type, payload.payment_type === 'credit' ? ((_b = payload.due_date) !== null && _b !== void 0 ? _b : null) : null, payload.is_paid ? 1 : 0, payload.is_paid ? ((_c = payload.paid_date) !== null && _c !== void 0 ? _c : null) : null, payload.receive_date, payload.invoice_no);
            // Keep receive_date in sync on the per-line ledger so detail panel shows it consistently
            db.prepare("UPDATE purchase_receipt_items SET created_at = ? WHERE invoice_no = ?")
                .run(payload.receive_date, payload.invoice_no);
        });
        tx();
        return { success: true };
    });
    ipcMain.handle('purchase:cancel', function (_e, payload, override) {
        var _a;
        requireAdmin(_e, override);
        var db = getDb();
        var reason = ((_a = payload.reason) !== null && _a !== void 0 ? _a : '').trim();
        if (!reason)
            return { success: false, error: 'reason_required' };
        var header = db.prepare("SELECT status FROM purchase_receipts WHERE invoice_no = ?").get(payload.invoice_no);
        if (!header)
            return { success: false, error: 'not_found' };
        if (header.status === 'cancelled')
            return { success: false, error: 'already_cancelled' };
        var lines = db.prepare("SELECT * FROM purchase_receipt_items WHERE invoice_no = ?").all(payload.invoice_no);
        if (lines.length === 0)
            return { success: false, error: 'no_lines' };
        // Defense in depth — once purchase:save asserts no bundles, no GR line
        // can carry a bundle product_id. Recheck here so a legacy row from before
        // the guard surfaces as a clear error rather than silently corrupting cost.
        for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
            var line = lines_1[_i];
            assertNotBundle(db, line.product_id);
        }
        var blockers = [];
        for (var _b = 0, lines_2 = lines; _b < lines_2.length; _b++) {
            var line = lines_2[_b];
            if (!line.lot_id) {
                blockers.push({ product_id: line.product_id, lot_id: null, lot_number: line.lot_number, need: line.qty, have: 0 });
                continue;
            }
            var lot = db.prepare("SELECT id, qty_on_hand, qty_received FROM product_lots WHERE id = ?").get(line.lot_id);
            if (!lot) {
                blockers.push({ product_id: line.product_id, lot_id: line.lot_id, lot_number: line.lot_number, need: line.qty, have: 0 });
                continue;
            }
            if (lot.qty_on_hand < line.qty - 1e-9) {
                blockers.push({ product_id: line.product_id, lot_id: line.lot_id, lot_number: line.lot_number, need: line.qty, have: lot.qty_on_hand });
            }
        }
        if (blockers.length > 0) {
            var detailed_1 = db.prepare("\n        SELECT b.product_id, b.lot_number, b.need, b.have, p.trade_name, p.code as product_code\n        FROM (SELECT ? as product_id, ? as lot_number, ? as need, ? as have) b\n        JOIN products p ON p.id = b.product_id\n      ");
            var enriched = blockers.map(function (b) { return detailed_1.get(b.product_id, b.lot_number, b.need, b.have); });
            return { success: false, error: 'stock_consumed', blockers: enriched };
        }
        var cancel = db.transaction(function () {
            for (var _i = 0, lines_3 = lines; _i < lines_3.length; _i++) {
                var line = lines_3[_i];
                if (!line.lot_id)
                    continue;
                var lot = db.prepare("SELECT qty_on_hand, qty_received FROM product_lots WHERE id = ?").get(line.lot_id);
                var qtyBefore = lot.qty_on_hand;
                var qtyAfter = qtyBefore - line.qty;
                var newReceived = lot.qty_received - line.qty;
                db.prepare("\n          UPDATE product_lots SET\n            qty_on_hand = ?,\n            qty_received = ?,\n            is_closed = CASE WHEN ? <= 0 THEN 1 ELSE is_closed END,\n            closed_at  = CASE WHEN ? <= 0 THEN datetime('now','localtime') ELSE closed_at END,\n            updated_at = datetime('now','localtime')\n          WHERE id = ?\n        ").run(qtyAfter, newReceived, newReceived, newReceived, line.lot_id);
                db.prepare("\n          INSERT INTO stock_movements\n            (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)\n          VALUES (?, ?, 'purchase_return', 'gr_cancel', ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))\n        ").run(line.product_id, line.lot_id, line.id, -line.qty, qtyBefore, qtyAfter, line.cost_price, "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E1A\u0E34\u0E25: ".concat(payload.invoice_no, " \u2014 ").concat(reason), payload.userId);
            }
            var productIds = Array.from(new Set(lines.map(function (l) { return l.product_id; })));
            for (var _a = 0, productIds_1 = productIds; _a < productIds_1.length; _a++) {
                var pid = productIds_1[_a];
                recomputeAvgCost(db, pid);
                propagateCostToBundles(db, pid);
            }
            db.prepare("\n        UPDATE purchase_receipts SET\n          status = 'cancelled',\n          cancelled_at = datetime('now','localtime'),\n          cancelled_by = ?,\n          cancel_reason = ?\n        WHERE invoice_no = ?\n      ").run(payload.userId, reason, payload.invoice_no);
        });
        cancel();
        return { success: true };
    });
}
