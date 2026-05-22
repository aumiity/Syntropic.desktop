import { ipcMain } from 'electron';
import { getDb } from '../db';
import { recomputeAvgCost, propagateCostToBundles } from '../db/pricing';
// Negative-stock reconciliation.
//
// Background: deductFefo() in pos.ts allows oversell — when all open lots are
// exhausted it writes a single sale_item_lots row with lot_id=NULL holding the
// unfulfilled remainder. These NULL markers are the "queue" this module manages.
//
// Two operations:
//   - reconcile: walk current open lots FEFO and consume the marker (writes
//     real stock_movements, replaces the NULL row with one row per lot consumed).
//   - dismiss: mark the NULL row is_cancelled = 1 (operator decided not to
//     deduct — e.g. the actual stock was already counted somewhere else).
//
// HARD invariants:
//   - Every stock_movements INSERT carries product_id (NOT NULL). Column order
//     matches pos.ts:42-46 / purchase.ts:190-194 exactly.
//   - FEFO query excludes is_cancelled lots (audit fix).
//   - We do NOT auto-close lots whose qty_on_hand hits 0 — matches deductFefo()
//     semantics; lot lifecycle is owned by adjustStock/updateLot.
//   - Voided sales are excluded by every query (status='completed'); voidSale
//     also cancels NULL markers so they don't ghost the queue.
//   - Float-safe: use EPS instead of `remaining == 0` for marker upkeep.
var EPS = 1e-9;
function loadMarker(db, id) {
    var row = db.prepare("\n    SELECT sil.id, sil.sale_item_id, sil.product_id, sil.qty,\n           si.sale_id, s.invoice_no, s.status\n      FROM sale_item_lots sil\n      JOIN sale_items si ON si.id = sil.sale_item_id\n      JOIN sales      s  ON s.id  = si.sale_id\n     WHERE sil.id = ?\n       AND sil.lot_id IS NULL\n       AND sil.is_cancelled = 0\n  ").get(id);
    if (!row)
        throw new Error('ไม่พบรายการสต๊อกติดลบ (อาจถูกจัดการไปแล้ว)');
    if (row.status !== 'completed')
        throw new Error('บิลนี้ถูกยกเลิกแล้ว ไม่สามารถจัดการได้');
    return row;
}
export function registerNegativeStockHandlers() {
    // List of outstanding negative-stock markers. Joined with current open-lot
    // sum so the UI can show "ตัดได้กี่ชิ้น" without a second round-trip.
    ipcMain.handle('negativeStock:list', function () {
        var db = getDb();
        return db.prepare("\n      SELECT sil.id,\n             sil.sale_item_id,\n             sil.product_id,\n             sil.qty,\n             si.sale_id,\n             s.invoice_no,\n             s.sold_at,\n             COALESCE(cust.full_name, '\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B') AS customer_name,\n             p.code  AS product_code,\n             p.trade_name,\n             u.name  AS unit_name,\n             (SELECT COALESCE(SUM(qty_on_hand), 0)\n                FROM product_lots\n               WHERE product_id   = sil.product_id\n                 AND is_closed    = 0\n                 AND is_cancelled = 0\n             ) AS available_stock\n        FROM sale_item_lots sil\n        JOIN sale_items si  ON si.id  = sil.sale_item_id\n        JOIN sales      s   ON s.id   = si.sale_id\n        JOIN products   p   ON p.id   = sil.product_id\n        LEFT JOIN item_units u    ON u.id    = p.unit_id\n        LEFT JOIN customers  cust ON cust.id = s.customer_id\n       WHERE sil.lot_id      IS NULL\n         AND sil.is_cancelled = 0\n         AND si.is_cancelled  = 0\n         AND s.status         = 'completed'\n       ORDER BY s.sold_at ASC, sil.id ASC\n    ").all();
    });
    // Lightweight count for the sidebar badge.
    ipcMain.handle('negativeStock:count', function () {
        var db = getDb();
        var r = db.prepare("\n      SELECT COUNT(*) AS c\n        FROM sale_item_lots sil\n        JOIN sale_items si ON si.id = sil.sale_item_id\n        JOIN sales      s  ON s.id  = si.sale_id\n       WHERE sil.lot_id      IS NULL\n         AND sil.is_cancelled = 0\n         AND si.is_cancelled  = 0\n         AND s.status         = 'completed'\n    ").get();
        return r.c;
    });
    // FEFO-deduct a marker against current open lots.
    //
    // Outcomes:
    //   - Full reconcile: marker row is DELETEd; one new sale_item_lots row per
    //     lot consumed; stock_movements rows logged; product_lots.qty_on_hand
    //     decreased.
    //   - Partial reconcile: marker.qty decremented to the remaining amount; same
    //     side effects for whatever could be consumed.
    //   - Nothing available: throws (UI disables the button when available_stock
    //     <= 0, but we defend at the boundary too).
    ipcMain.handle('negativeStock:reconcile', function (_e, payload) {
        var db = getDb();
        var run = db.transaction(function () {
            var marker = loadMarker(db, payload.id);
            var lots = db.prepare("\n        SELECT * FROM product_lots\n         WHERE product_id   = ?\n           AND qty_on_hand  > 0\n           AND is_closed    = 0\n           AND is_cancelled = 0\n         ORDER BY CASE WHEN expiry_date IS NULL\n                       THEN '9999-99-99' ELSE expiry_date END ASC\n      ").all(marker.product_id);
            if (lots.length === 0) {
                throw new Error('ไม่มีสต๊อกพร้อมตัด — ต้องรับสินค้าก่อน');
            }
            var remaining = marker.qty;
            var deductedTotal = 0;
            for (var _i = 0, lots_1 = lots; _i < lots_1.length; _i++) {
                var lot = lots_1[_i];
                if (remaining <= EPS)
                    break;
                var deduct = Math.min(lot.qty_on_hand, remaining);
                var qtyBefore = lot.qty_on_hand;
                db.prepare("UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?")
                    .run(deduct, lot.id);
                db.prepare("\n          INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty)\n          VALUES (?, ?, ?, ?)\n        ").run(marker.sale_item_id, lot.id, marker.product_id, deduct);
                db.prepare("\n          INSERT INTO stock_movements\n            (product_id, lot_id, movement_type, ref_type, ref_id,\n             qty_change, qty_before, qty_after, unit_cost, note, created_by)\n          VALUES (?, ?, 'sale', 'sale', ?, ?, ?, ?, ?, ?, ?)\n        ").run(marker.product_id, lot.id, marker.sale_id, -deduct, qtyBefore, qtyBefore - deduct, lot.cost_price, "\u0E15\u0E31\u0E14\u0E2A\u0E15\u0E4A\u0E2D\u0E04\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07: ".concat(marker.invoice_no), payload.userId);
                remaining -= deduct;
                deductedTotal += deduct;
            }
            // Marker upkeep — epsilon-safe.
            if (remaining <= EPS) {
                db.prepare("DELETE FROM sale_item_lots WHERE id = ?").run(marker.id);
                remaining = 0;
            }
            else {
                db.prepare("UPDATE sale_item_lots SET qty = ? WHERE id = ?").run(remaining, marker.id);
            }
            // Defensive recompute. We do NOT auto-close lots here, so the weighted
            // avg pool typically won't shift — but qty_received composition can
            // matter for callers that rely on it being stamped consistently.
            recomputeAvgCost(db, marker.product_id);
            propagateCostToBundles(db, marker.product_id);
            return {
                success: true,
                deducted_qty: deductedTotal,
                remaining_qty: remaining,
            };
        });
        return run();
    });
    // Dismiss — cancel the marker without consuming any stock. Writes an audit
    // movement row (qty_change = 0, lot_id = NULL) so the action is visible in
    // the product's stock history.
    ipcMain.handle('negativeStock:dismiss', function (_e, payload) {
        var db = getDb();
        var run = db.transaction(function () {
            var marker = loadMarker(db, payload.id);
            db.prepare("UPDATE sale_item_lots SET is_cancelled = 1 WHERE id = ?").run(marker.id);
            db.prepare("\n        INSERT INTO stock_movements\n          (product_id, lot_id, movement_type, ref_type, ref_id,\n           qty_change, qty_before, qty_after, unit_cost, note, created_by)\n        VALUES (?, NULL, 'sale', 'sale', ?, 0, 0, 0, 0, ?, ?)\n      ").run(marker.product_id, marker.sale_id, 'ลบรายการขายติดลบโดยไม่ตัดสต๊อค', payload.userId);
            return { success: true };
        });
        return run();
    });
}
