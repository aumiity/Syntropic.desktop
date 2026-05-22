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
// Dev-only handlers. Triggered from the /theme → "เครื่องมือ Dev" tab.
export function registerDevHandlers() {
    // dev:seedSalesHistory
    // -------------------
    // Backdates ~500 GRs + ~9000 sales across the last 90 days using the REAL
    // seeded products / suppliers / customers. Every product gets a lot
    // (≤3 per product); FEFO is enforced day-by-day so
    // movements/lots/sale_item_lots are internally consistent — same shape as a
    // user clicking through POS + GR 9000+ times.
    //
    // Idempotent via the '[DEV-SEED]' marker on purchase_receipts.note,
    // product_lots.note, and sales.note. Re-running wipes prior seed and
    // regenerates. Refuses to wipe if any non-dev sale references a dev lot.
    ipcMain.handle('dev:seedSalesHistory', function () {
        var db = getDb();
        var rand = function (min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        };
        var randF = function (min, max) { return Math.random() * (max - min) + min; };
        var pick = function (arr) { return arr[rand(0, arr.length - 1)]; };
        var weighted = function (opts) {
            var total = opts.reduce(function (s, _a) {
                var w = _a[1];
                return s + w;
            }, 0);
            var r = Math.random() * total;
            for (var _i = 0, opts_1 = opts; _i < opts_1.length; _i++) {
                var _a = opts_1[_i], v = _a[0], w = _a[1];
                r -= w;
                if (r <= 0)
                    return v;
            }
            return opts[opts.length - 1][0];
        };
        // ---- Pre-flight ----
        var products = db.prepare("\n      SELECT p.id, p.trade_name, p.name_for_print, p.cost_price, p.price_retail, p.unit_id,\n             u.name AS unit_name\n      FROM products p\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      WHERE p.is_disabled = 0 AND p.is_stock_item = 1 AND p.price_retail > 0\n    ").all();
        if (products.length === 0)
            throw new Error('ไม่มีสินค้าที่ขายได้ — รัน seed หลักก่อน');
        var suppliers = db.prepare("SELECT id FROM suppliers WHERE is_disabled = 0").all()
            .map(function (r) { return r.id; });
        if (suppliers.length === 0)
            throw new Error('ไม่มี suppliers');
        var allCustomers = db.prepare("SELECT id, code FROM customers WHERE is_disabled = 0")
            .all();
        var walkIn = allCustomers.find(function (c) { return c.code === 'C0000'; });
        if (!walkIn)
            throw new Error('ไม่มีลูกค้าทั่วไป (C0000)');
        var namedCustomers = allCustomers.filter(function (c) { return c.code !== 'C0000'; }).map(function (c) { return c.id; });
        var users = db.prepare("SELECT id FROM users WHERE is_disabled = 0").all()
            .map(function (r) { return r.id; });
        if (users.length === 0)
            throw new Error('ไม่มี users');
        // ---- Safety: any non-dev sale referencing a dev lot? ----
        var conflict = db.prepare("\n      SELECT COUNT(*) c FROM sale_item_lots sil\n      JOIN product_lots pl ON pl.id = sil.lot_id\n      JOIN sale_items si ON si.id = sil.sale_item_id\n      JOIN sales s ON s.id = si.sale_id\n      WHERE pl.note = '[DEV-SEED]'\n        AND (s.note IS NULL OR s.note != '[DEV-SEED]')\n    ").get().c;
        if (conflict > 0) {
            throw new Error("\u0E1E\u0E1A ".concat(conflict, " sale_item_lots \u0E02\u0E2D\u0E07\u0E08\u0E23\u0E34\u0E07\u0E2D\u0E49\u0E32\u0E07\u0E16\u0E36\u0E07 lot dev-seed \u2014 void/\u0E25\u0E1A\u0E1A\u0E34\u0E25\u0E1E\u0E27\u0E01\u0E19\u0E31\u0E49\u0E19\u0E01\u0E48\u0E2D\u0E19"));
        }
        // ---- Phase 1: Wipe previous dev seed ----
        var wiped = db.transaction(function () {
            var oldSaleIds = db.prepare("SELECT id FROM sales WHERE note = '[DEV-SEED]'")
                .all().map(function (r) { return r.id; });
            var oldGRs = db.prepare("SELECT invoice_no FROM purchase_receipts WHERE note = '[DEV-SEED]'")
                .all().map(function (r) { return r.invoice_no; });
            var oldLotIds = db.prepare("SELECT id FROM product_lots WHERE note = '[DEV-SEED]'")
                .all().map(function (r) { return r.id; });
            var wipeIn = function (sql, ids) {
                var _a;
                if (ids.length === 0)
                    return;
                var ph = ids.map(function () { return '?'; }).join(',');
                (_a = db.prepare(sql.replace('IN_PLACEHOLDER', ph))).run.apply(_a, ids);
            };
            wipeIn("DELETE FROM stock_movements WHERE lot_id IN (IN_PLACEHOLDER)", oldLotIds);
            wipeIn("DELETE FROM sales WHERE id IN (IN_PLACEHOLDER)", oldSaleIds);
            wipeIn("DELETE FROM purchase_receipt_items WHERE invoice_no IN (IN_PLACEHOLDER)", oldGRs);
            wipeIn("DELETE FROM purchase_receipts WHERE invoice_no IN (IN_PLACEHOLDER)", oldGRs);
            wipeIn("DELETE FROM product_lots WHERE id IN (IN_PLACEHOLDER)", oldLotIds);
            return { sales: oldSaleIds.length, grs: oldGRs.length, lots: oldLotIds.length };
        })();
        // ---- Phase 2: Generate 90 days ----
        var today = dayjs();
        var DAYS = 90;
        // Per-day rates (spec): GR 3-8 ใบ/วัน, ขาย 90-100 ใบ/วัน over ~91 days
        // → ≈500 GR / ≈9000 sales total. No exact-total distribution: each day
        // draws its own count so the volume looks organic, not perfectly flat.
        var GR_PER_DAY_MIN = 3, GR_PER_DAY_MAX = 8;
        var SALES_PER_DAY_MIN = 90, SALES_PER_DAY_MAX = 100;
        // "ทุก SKU active" — every sellable product participates (no subset cap)
        var inventory = products;
        // "มี Lot ทุกสินค้า — สินค้าละ ไม่เกิน 3 Lot": hard cap. The opening GR
        // gives every product lot #1; regular GRs may add lot #2/#3 only. A
        // product already at 3 lots is excluded from further GR lines, so the
        // 5-50 lines/GR target clamps to the remaining candidate pool — the lot
        // cap always wins over the line-count target.
        var MAX_LOTS_PER_PRODUCT = 3;
        var lotCountByProduct = new Map();
        // Lot number = plain running 6-digit (000001, 000002, …). Globally
        // unique, so it never collides on the (product, lot_number) UNIQUE index.
        var lotSeq = 0;
        var nextLotNo = function () { return String(++lotSeq).padStart(6, '0'); };
        var grSeqByDate = new Map();
        var saleSeqByDate = new Map();
        var insReceipt = db.prepare("\n      INSERT INTO purchase_receipts\n        (invoice_no, supplier_id, supplier_invoice_no, order_date,\n         payment_type, due_date, is_paid, paid_date, note,\n         discount_amount, surcharge_amount, status, created_at)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[DEV-SEED]', 0, 0, 'completed', ?)\n    ");
        var insReceiptItem = db.prepare("\n      INSERT INTO purchase_receipt_items\n        (invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date,\n         cost_price, sell_price, qty, note, created_at)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)\n    ");
        var insLot = db.prepare("\n      INSERT INTO product_lots\n        (product_id, supplier_id, lot_number, manufactured_date, expiry_date,\n         cost_price, sell_price, qty_received, qty_on_hand,\n         invoice_no, supplier_invoice_no, order_date,\n         payment_type, due_date, is_paid, paid_date,\n         note, created_at, updated_at)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[DEV-SEED]', ?, ?)\n    ");
        var insMove = db.prepare("\n      INSERT INTO stock_movements\n        (product_id, lot_id, movement_type, ref_type, ref_id,\n         qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ");
        var insSale = db.prepare("\n      INSERT INTO sales\n        (invoice_no, sale_type, customer_id, sold_by, sold_at,\n         subtotal, total_discount, total_amount,\n         cash_amount, card_amount, transfer_amount, change_amount,\n         note, status, created_at)\n      VALUES (?, 'retail', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[DEV-SEED]', 'completed', ?)\n    ");
        var insSaleItem = db.prepare("\n      INSERT INTO sale_items\n        (sale_id, product_id, item_name, unit_name, qty, unit_price, discount, line_total, item_note)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)\n    ");
        var insSaleItemLot = db.prepare("INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty) VALUES (?, ?, ?, ?)");
        var selLotsFEFO = db.prepare("\n      SELECT id, qty_on_hand, cost_price FROM product_lots\n      WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0 AND is_cancelled = 0\n      ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC, id ASC\n    ");
        var updLotAfterSale = db.prepare("\n      UPDATE product_lots\n      SET qty_on_hand = ?,\n          is_closed = CASE WHEN ? <= 0 THEN 1 ELSE is_closed END,\n          closed_at = CASE WHEN ? <= 0 AND closed_at IS NULL THEN ? ELSE closed_at END\n      WHERE id = ?\n    ");
        var result = db.transaction(function () {
            var _a, _b, _c, _d, _e;
            var grCount = 0, lotCount = 0, saleCount = 0, saleItemCount = 0;
            // ---- Day 0: opening-stock GR ----
            // One bootstrap receipt on the oldest day that stocks EVERY inventory
            // SKU, so sales have stock to draw from from day one (no ramp). Counted
            // as seq 1 of that day; the regular day-loop GRs continue from seq 2.
            {
                var openDay = today.subtract(DAYS, 'day');
                var openDate = openDay.format('YYYY-MM-DD');
                var openYmd = openDay.format('YYYYMMDD');
                var openSeq = 1;
                grSeqByDate.set(openYmd, openSeq);
                var grNo = "GR-".concat(openYmd, "-").concat(String(openSeq).padStart(4, '0'));
                var supplierId = pick(suppliers);
                var dtStr = "".concat(openDate, " 08:00:00");
                insReceipt.run(grNo, supplierId, "INV-MOCK-".concat(grNo), openDate, 'cash', null, 1, openDate, dtStr);
                for (var _i = 0, inventory_1 = inventory; _i < inventory_1.length; _i++) {
                    var product = inventory_1[_i];
                    var cost = Math.max(0.5, +(product.cost_price * randF(0.85, 1.15)).toFixed(2));
                    var qty = rand(200, 800);
                    var expiry = openDay.add(rand(6, 24) * 30, 'day').format('YYYY-MM-DD');
                    var mfg = openDay.subtract(rand(30, 360), 'day').format('YYYY-MM-DD');
                    var lotNo = nextLotNo();
                    var lotRes = insLot.run(product.id, supplierId, lotNo, mfg, expiry, cost, product.price_retail, qty, qty, grNo, "INV-MOCK-".concat(grNo), openDate, 'cash', null, 1, openDate, dtStr, dtStr);
                    var lotId = Number(lotRes.lastInsertRowid);
                    lotCount++;
                    lotCountByProduct.set(product.id, 1); // lot #1 for every product
                    insReceiptItem.run(grNo, product.id, lotId, lotNo, mfg, expiry, cost, product.price_retail, qty, dtStr);
                    insMove.run(product.id, lotId, 'receive', 'stock_receive', null, qty, 0, qty, cost, "\u0E23\u0E31\u0E1A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32: ".concat(grNo, " [DEV-SEED]"), users[0], dtStr);
                }
                grCount++;
            }
            for (var d = DAYS; d >= 0; d--) {
                var day = today.subtract(d, 'day');
                var dateStr = day.format('YYYY-MM-DD');
                var yymmdd = day.format('YYYYMMDD');
                // ---- GRs (3-8 ใบ/วัน → ~500 total) ----
                var grPerDay = rand(GR_PER_DAY_MIN, GR_PER_DAY_MAX);
                for (var g = 0; g < grPerDay; g++) {
                    // Only products under the 3-lot cap can receive more stock. Once
                    // every product is capped, no further GR lines are possible — stop
                    // creating GRs for the rest of the run.
                    var candidates = inventory.filter(function (p) { var _a; return ((_a = lotCountByProduct.get(p.id)) !== null && _a !== void 0 ? _a : 0) < MAX_LOTS_PER_PRODUCT; });
                    if (candidates.length === 0)
                        break;
                    var seq = ((_a = grSeqByDate.get(yymmdd)) !== null && _a !== void 0 ? _a : 0) + 1;
                    grSeqByDate.set(yymmdd, seq);
                    var grNo = "GR-".concat(yymmdd, "-").concat(String(seq).padStart(4, '0'));
                    var supplierId = pick(suppliers);
                    var hour = rand(8, 17);
                    var min = rand(0, 59);
                    var dtStr = "".concat(dateStr, " ").concat(String(hour).padStart(2, '0'), ":").concat(String(min).padStart(2, '0'), ":00");
                    var isPaid = Math.random() < 0.6 ? 1 : 0;
                    var paymentType = isPaid ? 'cash' : 'credit';
                    var dueDate = !isPaid ? day.add(30, 'day').format('YYYY-MM-DD') : null;
                    insReceipt.run(grNo, supplierId, "INV-MOCK-".concat(grNo), dateStr, paymentType, dueDate, isPaid, isPaid ? dateStr : null, dtStr);
                    var lineCount = Math.min(rand(5, 50), candidates.length);
                    var lineProducts = __spreadArray([], candidates, true).sort(function () { return Math.random() - 0.5; }).slice(0, lineCount);
                    for (var _f = 0, lineProducts_1 = lineProducts; _f < lineProducts_1.length; _f++) {
                        var product = lineProducts_1[_f];
                        var cost = Math.max(0.5, +(product.cost_price * randF(0.85, 1.15)).toFixed(2));
                        var sellPrice = product.price_retail;
                        var qty = rand(50, 500);
                        var expiry = day.add(rand(6, 24) * 30, 'day').format('YYYY-MM-DD');
                        var mfg = day.subtract(rand(30, 360), 'day').format('YYYY-MM-DD');
                        var lotNo = nextLotNo();
                        var lotRes = insLot.run(product.id, supplierId, lotNo, mfg, expiry, cost, sellPrice, qty, qty, grNo, "INV-MOCK-".concat(grNo), dateStr, paymentType, dueDate, isPaid, isPaid ? dateStr : null, dtStr, dtStr);
                        var lotId = Number(lotRes.lastInsertRowid);
                        lotCount++;
                        lotCountByProduct.set(product.id, ((_b = lotCountByProduct.get(product.id)) !== null && _b !== void 0 ? _b : 0) + 1);
                        insReceiptItem.run(grNo, product.id, lotId, lotNo, mfg, expiry, cost, sellPrice, qty, dtStr);
                        insMove.run(product.id, lotId, 'receive', 'stock_receive', null, qty, 0, qty, cost, "\u0E23\u0E31\u0E1A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32: ".concat(grNo, " [DEV-SEED]"), users[0], dtStr);
                    }
                    grCount++;
                }
                // ---- Sales (90-100 ใบ/วัน → ~9000 total) ----
                var salesPerDay = rand(SALES_PER_DAY_MIN, SALES_PER_DAY_MAX);
                for (var s = 0; s < salesPerDay; s++) {
                    var seq = ((_c = saleSeqByDate.get(yymmdd)) !== null && _c !== void 0 ? _c : 0) + 1;
                    saleSeqByDate.set(yymmdd, seq);
                    var rcNo = "RC-".concat(yymmdd, "-").concat(String(seq).padStart(4, '0'));
                    var hour = weighted([
                        [rand(9, 11), 25], [rand(12, 15), 40], [rand(16, 19), 30], [rand(20, 21), 5],
                    ]);
                    var min = rand(0, 59);
                    var dtStr = "".concat(dateStr, " ").concat(String(hour).padStart(2, '0'), ":").concat(String(min).padStart(2, '0'), ":00");
                    var customerId = Math.random() < 0.7
                        ? walkIn.id
                        : (namedCustomers.length ? pick(namedCustomers) : walkIn.id);
                    var userId = pick(users);
                    var itemCount = rand(1, 10); // 1-10 รายการ/ใบ
                    // Pick `itemCount` distinct products that currently have stock
                    var shuffled = __spreadArray([], inventory, true).sort(function () { return Math.random() - 0.5; });
                    var items = [];
                    for (var _g = 0, shuffled_1 = shuffled; _g < shuffled_1.length; _g++) {
                        var product = shuffled_1[_g];
                        if (items.length >= itemCount)
                            break;
                        var lots = selLotsFEFO.all(product.id);
                        if (lots.length === 0)
                            continue;
                        var avail = lots.reduce(function (s, l) { return s + l.qty_on_hand; }, 0);
                        if (avail < 1)
                            continue;
                        var desired = weighted([
                            [1, 30], [2, 30], [3, 15], [rand(4, 5), 15], [rand(6, 10), 8], [rand(10, 25), 2],
                        ]);
                        var qty = Math.min(desired, Math.floor(avail));
                        if (qty < 1)
                            continue;
                        // Plan FEFO deduction
                        var used = [];
                        var remaining = qty;
                        for (var _h = 0, lots_1 = lots; _h < lots_1.length; _h++) {
                            var lot = lots_1[_h];
                            if (remaining <= 0)
                                break;
                            var deduct = Math.min(lot.qty_on_hand, remaining);
                            used.push({
                                id: lot.id, qty: deduct, cost: lot.cost_price, qtyBefore: lot.qty_on_hand,
                            });
                            remaining -= deduct;
                        }
                        items.push({ product: product, qty: qty, lots: used });
                        // Apply deduction to lots immediately so the next item's FEFO query
                        // sees the right state (prevents over-selling across items in the
                        // same sale even though items are distinct products)
                        for (var _j = 0, used_1 = used; _j < used_1.length; _j++) {
                            var u = used_1[_j];
                            var after = u.qtyBefore - u.qty;
                            updLotAfterSale.run(after, after, after, dtStr, u.id);
                        }
                    }
                    if (items.length === 0)
                        continue;
                    var subtotal = 0;
                    for (var _k = 0, items_1 = items; _k < items_1.length; _k++) {
                        var it = items_1[_k];
                        subtotal += it.qty * it.product.price_retail;
                    }
                    var discountPct = Math.random() < 0.15 ? randF(0.05, 0.15) : 0;
                    var totalDiscount = +(subtotal * discountPct).toFixed(2);
                    var totalAmount = +(subtotal - totalDiscount).toFixed(2);
                    var cashAmount = 0, transferAmount = 0, cardAmount = 0, changeAmount = 0;
                    var pay = Math.random();
                    if (pay < 0.7) {
                        var paid = Math.ceil(totalAmount / 10) * 10;
                        cashAmount = paid;
                        changeAmount = +(paid - totalAmount).toFixed(2);
                    }
                    else if (pay < 0.85) {
                        transferAmount = totalAmount;
                    }
                    else if (pay < 0.95) {
                        var splitCash = Math.floor(totalAmount * 0.5);
                        cashAmount = splitCash;
                        transferAmount = +(totalAmount - splitCash).toFixed(2);
                    }
                    else {
                        cardAmount = totalAmount;
                    }
                    var saleRes = insSale.run(rcNo, customerId, userId, dtStr, subtotal, totalDiscount, totalAmount, cashAmount, cardAmount, transferAmount, changeAmount, dtStr);
                    var saleId = Number(saleRes.lastInsertRowid);
                    for (var _l = 0, items_2 = items; _l < items_2.length; _l++) {
                        var it = items_2[_l];
                        var gross = it.qty * it.product.price_retail;
                        var lineDiscount = +(gross * discountPct).toFixed(2);
                        var lineTotal = +(gross - lineDiscount).toFixed(2);
                        var siRes = insSaleItem.run(saleId, it.product.id, (_d = it.product.name_for_print) !== null && _d !== void 0 ? _d : it.product.trade_name, (_e = it.product.unit_name) !== null && _e !== void 0 ? _e : '', it.qty, it.product.price_retail, lineDiscount, lineTotal);
                        var saleItemId = Number(siRes.lastInsertRowid);
                        saleItemCount++;
                        for (var _m = 0, _o = it.lots; _m < _o.length; _m++) {
                            var u = _o[_m];
                            insSaleItemLot.run(saleItemId, u.id, it.product.id, u.qty);
                            insMove.run(it.product.id, u.id, 'sale', 'sale', saleId, -u.qty, u.qtyBefore, u.qtyBefore - u.qty, u.cost, "\u0E02\u0E32\u0E22: ".concat(rcNo, " [DEV-SEED]"), userId, dtStr);
                        }
                    }
                    saleCount++;
                }
            }
            return { grCount: grCount, lotCount: lotCount, saleCount: saleCount, saleItemCount: saleItemCount };
        })();
        // ---- Phase 3: Recompute products.cost_price (weighted avg of open lots) ----
        var affected = db.prepare("\n      SELECT DISTINCT product_id FROM product_lots WHERE note = '[DEV-SEED]'\n    ").all().map(function (r) { return r.product_id; });
        var recompute = db.prepare("\n      UPDATE products SET cost_price = (\n        SELECT COALESCE(SUM(qty_received * cost_price) / NULLIF(SUM(qty_received), 0),\n                        products.cost_price)\n        FROM product_lots\n        WHERE product_id = ? AND qty_received > 0 AND is_closed = 0\n      )\n      WHERE id = ?\n    ");
        db.transaction(function () {
            for (var _i = 0, affected_1 = affected; _i < affected_1.length; _i++) {
                var pid = affected_1[_i];
                recompute.run(pid, pid);
            }
        })();
        return __assign(__assign({ wiped: wiped }, result), { message: "\u2713 \u0E25\u0E1A\u0E02\u0E2D\u0E07\u0E40\u0E01\u0E48\u0E32 ".concat(wiped.grs, " GR / ").concat(wiped.sales, " sales / ").concat(wiped.lots, " lots \u2014 \u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48 ").concat(result.grCount, " GR (\u0E23\u0E27\u0E21 GR \u0E40\u0E1B\u0E34\u0E14\u0E2A\u0E15\u0E47\u0E2D\u0E01 1 \u0E43\u0E1A, ").concat(result.lotCount, " lots, \u22643/\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32), ").concat(result.saleCount, " sales (").concat(result.saleItemCount, " items)") });
    });
}
