import { ipcMain } from 'electron';
import { getDb } from '../db';
import { walkInCustomerId, WALKIN_CUSTOMER_CODE } from './codes';
import { orderByBucket } from '../db/sortName';
import dayjs from 'dayjs';
// FEFO deduction shared by single-product sales and bundle-component sales.
// Takes BASE-unit qty — the caller multiplies by qty_per_base for non-base
// unit sales. Bundles iterate this helper once per component.
//
// Behavior (intentionally preserved from the pre-refactor inline loop):
// - Walks open lots ordered by expiry_date ASC.
// - Each take inserts a sale_item_lots row + a stock_movements 'sale' row,
//   tagged with the COMPONENT's product_id (independent of sale_items.product_id).
//   This makes void/return work for bundles with no reports.ts changes.
// - Oversell remainder is written as ONE sale_item_lots row with lot_id=NULL.
// - Does NOT auto-close lots at qty_on_hand=0 — FEFO queries filter
//   `qty_on_hand > 0 AND is_closed=0` already; adjustStock/updateLot owns
//   the close-toggle behavior. Adding it here would change semantics.
function deductFefo(db, productId, baseQty, saleItemId, saleId, invoiceNo, soldBy) {
    var lots = db.prepare("\n    SELECT * FROM product_lots\n    WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0\n    ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC\n  ").all(productId);
    var remaining = baseQty;
    for (var _i = 0, lots_1 = lots; _i < lots_1.length; _i++) {
        var lot = lots_1[_i];
        if (remaining <= 0)
            break;
        var deduct = Math.min(lot.qty_on_hand, remaining);
        var qtyBefore = lot.qty_on_hand;
        db.prepare("UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?").run(deduct, lot.id);
        db.prepare("INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty) VALUES (?, ?, ?, ?)")
            .run(saleItemId, lot.id, productId, deduct);
        db.prepare("INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n      VALUES (?, ?, 'sale', 'sale', ?, ?, ?, ?, ?, ?, ?)").run(productId, lot.id, saleId, -deduct, qtyBefore, qtyBefore - deduct, lot.cost_price, "\u0E02\u0E32\u0E22: ".concat(invoiceNo), soldBy);
        remaining -= deduct;
    }
    if (remaining > 0) {
        // Oversold — record the unfulfilled portion against no lot.
        db.prepare("INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty) VALUES (?, NULL, ?, ?)")
            .run(saleItemId, productId, remaining);
    }
}
// Attach the POS-facing detail to a product row: open lots (expiry-ASC),
// sellable non-base units, and (for bundles) composition + component lots.
// Shared by pos:searchProducts and pos:getProductsByIds so a cart line rebuilt
// from a quotation is identical to one added via the POS search.
function enrichProduct(db, prod) {
    prod.lots = db.prepare("\n    SELECT * FROM product_lots\n    WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0\n    ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC\n  ").all(prod.id);
    prod.units = db.prepare("\n    SELECT pu.*, u.name as unit_name FROM product_units pu\n    JOIN item_units u ON u.id = pu.unit_id\n    WHERE pu.product_id = ? AND pu.is_disabled = 0 AND pu.is_for_sale = 1\n    ORDER BY pu.qty_per_base ASC\n  ").all(prod.id);
    if (prod.is_bundle === 1) {
        var items = db.prepare("\n      SELECT bi.*,\n             c.trade_name as component_name,\n             u.name as component_unit_name,\n             c.cost_price as component_cost\n      FROM product_bundle_items bi\n      JOIN products c ON c.id = bi.component_product_id\n      LEFT JOIN item_units u ON u.id = c.unit_id\n      WHERE bi.bundle_id = ?\n      ORDER BY bi.sort_order, bi.id\n    ").all(prod.id);
        for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
            var it = items_1[_i];
            it.lots = db.prepare("\n        SELECT * FROM product_lots\n        WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0\n        ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC\n      ").all(it.component_product_id);
        }
        prod.bundle_items = items;
    }
    return prod;
}
export function registerPosHandlers() {
    // Search products for POS
    ipcMain.handle('pos:searchProducts', function (_e, query) {
        var db = getDb();
        var q = "%".concat(query, "%");
        var prefix = "".concat(query, "%");
        var kwMid = "%,".concat(query, "%");
        var kwMidSp = "%, ".concat(query, "%");
        var products = db.prepare("\n      SELECT p.*, c.name as category_name, dt.name_th as drug_type_name,\n             u.name as unit_name\n      FROM products p\n      LEFT JOIN product_categories c ON c.id = p.category_id\n      LEFT JOIN drug_types dt ON dt.id = p.drug_type_id\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      WHERE p.is_disabled = 0\n        AND (p.trade_name LIKE ? OR p.barcode LIKE ? OR p.barcode2 LIKE ?\n             OR p.barcode3 LIKE ? OR p.barcode4 LIKE ?\n             OR p.code LIKE ? OR p.search_keywords LIKE ?)\n      ORDER BY\n        CASE\n          WHEN p.trade_name LIKE ? THEN 1\n          WHEN p.code LIKE ? THEN 2\n          WHEN p.search_keywords LIKE ? OR p.search_keywords LIKE ? OR p.search_keywords LIKE ? THEN 3\n          ELSE 4\n        END,\n        ".concat(orderByBucket('p.trade_name'), "\n      LIMIT 30\n    ")).all(q, q, q, q, q, q, q, prefix, prefix, prefix, kwMid, kwMidSp);
        for (var _i = 0, _a = products; _i < _a.length; _i++) {
            var prod = _a[_i];
            enrichProduct(db, prod);
        }
        return products;
    });
    // Fetch enabled products by ids in the same enriched shape as searchProducts.
    // Used to rebuild POS cart lines when converting a quotation to a sale.
    // Disabled/missing products are simply omitted — the caller treats any id it
    // asked for but didn't get back as "cannot sell" and blocks the conversion.
    ipcMain.handle('pos:getProductsByIds', function (_e, ids) {
        var _a;
        var db = getDb();
        var unique = Array.from(new Set((ids !== null && ids !== void 0 ? ids : []).filter(function (n) { return Number.isInteger(n); })));
        if (unique.length === 0)
            return [];
        var placeholders = unique.map(function () { return '?'; }).join(',');
        var products = (_a = db.prepare("\n      SELECT p.*, c.name as category_name, dt.name_th as drug_type_name, u.name as unit_name\n      FROM products p\n      LEFT JOIN product_categories c ON c.id = p.category_id\n      LEFT JOIN drug_types dt ON dt.id = p.drug_type_id\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      WHERE p.is_disabled = 0 AND p.id IN (".concat(placeholders, ")\n    "))).all.apply(_a, unique);
        for (var _i = 0, products_1 = products; _i < products_1.length; _i++) {
            var prod = products_1[_i];
            enrichProduct(db, prod);
        }
        return products;
    });
    // Search customers
    ipcMain.handle('pos:searchCustomers', function (_e, query) {
        var q = "%".concat(query, "%");
        return getDb().prepare("\n      SELECT * FROM customers\n      WHERE is_disabled = 0\n        AND code != '".concat(WALKIN_CUSTOMER_CODE, "'\n        AND (full_name LIKE ? OR phone LIKE ? OR code LIKE ?)\n      ORDER BY ").concat(orderByBucket('full_name'), "\n      LIMIT 20\n    ")).all(q, q, q);
    });
    // Save sale (main POS transaction)
    ipcMain.handle('pos:saveBill', function (_e, payload) {
        var _a;
        var db = getDb();
        // Walk-in (null from the renderer) is persisted as the C0000 row, never
        // NULL — see walk-in invariant in CLAUDE.md.
        var customerId = (_a = payload.customer_id) !== null && _a !== void 0 ? _a : walkInCustomerId(db);
        var saveBill = db.transaction(function () {
            var _a, _b, _c, _d, _f, _g, _h;
            // Generate invoice number — LIKE prefix already encodes today's date.
            // (Don't filter by sold_at: it stores 'YYYY-MM-DD HH:MM:SS' but `today`
            // is 'YYYYMMDD', so a string-range comparison silently excludes every row.)
            var today = dayjs().format('YYYYMMDD');
            var countRow = db.prepare("SELECT COUNT(*) as c FROM sales WHERE invoice_no LIKE ?")
                .get("RC-".concat(today, "-%"));
            var invoiceNo = "RC-".concat(today, "-").concat(String(countRow.c + 1).padStart(4, '0'));
            var saleResult = db.prepare("\n        INSERT INTO sales (invoice_no, sale_type, customer_id, customer_name_free,\n          sold_by, sold_at, subtotal, total_discount, total_vat, total_amount,\n          cash_amount, card_amount, transfer_amount, change_amount,\n          symptom_note, age_range, note, status)\n        VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')\n      ").run(invoiceNo, payload.sale_type, customerId, payload.customer_name_free, payload.sold_by, payload.subtotal, payload.total_discount, (_a = payload.total_vat) !== null && _a !== void 0 ? _a : 0, payload.total_amount, payload.cash_amount, payload.card_amount, payload.transfer_amount, payload.change_amount, (_b = payload.symptom_note) !== null && _b !== void 0 ? _b : '', (_c = payload.age_range) !== null && _c !== void 0 ? _c : '', (_d = payload.note) !== null && _d !== void 0 ? _d : '');
            var saleId = saleResult.lastInsertRowid;
            for (var _i = 0, _j = payload.items; _i < _j.length; _i++) {
                var item = _j[_i];
                var itemResult = db.prepare("\n          INSERT INTO sale_items (sale_id, product_id, item_name, unit_name, qty, unit_price, discount, unit_vat, line_total, item_note)\n          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n        ").run(saleId, item.product_id, item.item_name, item.unit_name, item.qty, item.unit_price, item.discount, (_f = item.unit_vat) !== null && _f !== void 0 ? _f : 0, item.line_total, (_g = item.item_note) !== null && _g !== void 0 ? _g : '');
                var saleItemId = itemResult.lastInsertRowid;
                // Resolve bundle status from authoritative source — payload could be
                // stale (the client may have searched before the product was flipped).
                var prod = db.prepare("SELECT is_bundle FROM products WHERE id = ?")
                    .get(item.product_id);
                if ((prod === null || prod === void 0 ? void 0 : prod.is_bundle) === 1) {
                    // Bundle: 1 sale_items row (the bundle) + N sale_item_lots rows
                    // (one per component lot, tagged with the COMPONENT's product_id).
                    // Void/return restoration in reports.ts iterates these rows by
                    // sale_item_lots.product_id, so each component lot returns to its
                    // own product automatically — no special-case there.
                    var components = db.prepare("\n            SELECT component_product_id, qty_per_bundle\n            FROM product_bundle_items\n            WHERE bundle_id = ?\n          ").all(item.product_id);
                    // qty_per_base is irrelevant for v1 bundles (always sold in base unit).
                    for (var _k = 0, components_1 = components; _k < components_1.length; _k++) {
                        var comp = components_1[_k];
                        var componentBaseQty = Number(comp.qty_per_bundle) * item.qty;
                        deductFefo(db, comp.component_product_id, componentBaseQty, saleItemId, saleId, invoiceNo, payload.sold_by);
                    }
                }
                else {
                    // Regular product — qty_per_base converts sold-unit qty into base qty.
                    deductFefo(db, item.product_id, item.qty * ((_h = item.qty_per_base) !== null && _h !== void 0 ? _h : 1), saleItemId, saleId, invoiceNo, payload.sold_by);
                }
            }
            // Daily summary — sold_at is stored as 'YYYY-MM-DD HH:MM:SS', so the
            // range must use the dashed date (NOT `today`, which is 'YYYYMMDD' for
            // invoice numbering — string-comparing it against sold_at excludes every
            // row because '-' < '0').
            var dateStr = dayjs().format('YYYY-MM-DD');
            var dailySummary = db.prepare("\n        SELECT COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total,\n               MAX(sold_at) as latest\n        FROM sales WHERE sold_at >= ? AND sold_at < ? AND status = 'completed'\n      ").get("".concat(dateStr, " 00:00:00"), "".concat(dateStr, " 23:59:59"));
            return { success: true, invoice_no: invoiceNo, daily_bills: dailySummary.bills, daily_total: dailySummary.total, latest_bill_time: dailySummary.latest };
        });
        return saveBill();
    });
    // Return items — Option B: negative sales record + stock restore + movements
    ipcMain.handle('pos:returnItems', function (_e, payload) {
        var _a;
        var db = getDb();
        // Walk-in (null) → C0000 row, never NULL (walk-in invariant).
        var customerId = (_a = payload.customer_id) !== null && _a !== void 0 ? _a : walkInCustomerId(db);
        var doReturn = db.transaction(function () {
            // Generate RT-YYYYMMDD-NNN invoice number (see saveBill for why the
            // sold_at date filter is omitted — format mismatch makes it always-false).
            var today = dayjs().format('YYYYMMDD');
            var countRow = db.prepare("SELECT COUNT(*) as c FROM sales WHERE invoice_no LIKE ?").get("RT-".concat(today, "-%"));
            var invoiceNo = "RT-".concat(today, "-").concat(String(countRow.c + 1).padStart(4, '0'));
            var totalAmount = payload.items.reduce(function (s, i) { return s + i.line_total; }, 0);
            // Negative sales record — total_amount is negative, decreases daily stats automatically
            var saleResult = db.prepare("\n        INSERT INTO sales (invoice_no, sale_type, customer_id, sold_by, sold_at,\n          subtotal, total_discount, total_vat, total_amount,\n          cash_amount, card_amount, transfer_amount, change_amount,\n          note, status)\n        VALUES (?, 'return', ?, ?, datetime('now','localtime'),\n          ?, 0, 0, ?,\n          0, 0, 0, 0,\n          ?, 'completed')\n      ").run(invoiceNo, customerId, payload.created_by, -totalAmount, -totalAmount, payload.reason);
            var saleId = saleResult.lastInsertRowid;
            for (var _i = 0, _a = payload.items; _i < _a.length; _i++) {
                var item = _a[_i];
                var lot = db.prepare("SELECT * FROM product_lots WHERE id = ?").get(item.lot_id);
                if (!lot)
                    throw new Error("Lot not found: ".concat(item.lot_id));
                // Negative sale_items row
                var saleItemResult = db.prepare("\n          INSERT INTO sale_items (sale_id, product_id, item_name, unit_name, qty, unit_price, discount, line_total, item_note)\n          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)\n        ").run(saleId, item.product_id, item.product_name, item.unit_name, -item.qty, item.unit_price, -item.line_total, item.reason);
                var saleItemId = saleItemResult.lastInsertRowid;
                // Lot tracing — negative qty mirrors sale_items
                db.prepare("\n          INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty)\n          VALUES (?, ?, ?, ?)\n        ").run(saleItemId, item.lot_id, item.product_id, -item.qty);
                // Restore stock
                var qtyBefore = lot.qty_on_hand;
                var qtyAfter = qtyBefore + item.qty;
                db.prepare("UPDATE product_lots SET qty_on_hand = qty_on_hand + ? WHERE id = ?").run(item.qty, item.lot_id);
                // Stock movement — ref_id links back to the return sales record
                db.prepare("\n          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n          VALUES (?, ?, 'sale_return', 'return', ?, ?, ?, ?, ?, ?, ?)\n        ").run(item.product_id, item.lot_id, saleId, item.qty, qtyBefore, qtyAfter, lot.cost_price, item.reason, payload.created_by);
            }
            return { success: true, invoice_no: invoiceNo, count: payload.items.length, total_amount: totalAmount };
        });
        return doReturn();
    });
    // Get daily stats
    ipcMain.handle('pos:getDailyStats', function () {
        var db = getDb();
        // sold_at is 'YYYY-MM-DD HH:MM:SS' — must match that format in the range,
        // not 'YYYYMMDD' (string-comparing the latter excludes every row).
        var dateStr = dayjs().format('YYYY-MM-DD');
        return db.prepare("\n      SELECT COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total, MAX(sold_at) as latest\n      FROM sales WHERE sold_at >= ? AND sold_at < ? AND status = 'completed'\n    ").get("".concat(dateStr, " 00:00:00"), "".concat(dateStr, " 23:59:59"));
    });
}
