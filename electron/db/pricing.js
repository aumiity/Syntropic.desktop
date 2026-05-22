// Pricing helpers shared by products.ts (adjustStock/updateLot) and
// purchase.ts (GR save/cancel) so the cost recompute SQL has a single
// source of truth — and so bundle cost propagation fires on EVERY
// cost-changing event without per-call-site bookkeeping.
//
// Why a shared module: before this file, the same weighted-avg SQL was
// inlined 4× (products.ts:adjustStock, products.ts:updateLot,
// purchase.ts:save, purchase.ts:cancel). Adding the bundle-propagation
// hook had to happen in exactly one place to be reliable.
/**
 * Defense in depth — every stock/lot mutation handler asserts the target
 * is NOT a bundle. UI hides these affordances for bundles, but direct IPC
 * callers (and now the Purchase intake which uses pos:searchProducts without
 * an is_bundle filter) could otherwise corrupt the "bundles have no lots"
 * invariant. Lives in pricing.ts so both electron/ipc/products.ts and
 * electron/ipc/purchase.ts can use it without cross-IPC imports.
 */
export function assertNotBundle(db, productId) {
    var r = db.prepare("SELECT is_bundle FROM products WHERE id = ?").get(productId);
    if ((r === null || r === void 0 ? void 0 : r.is_bundle) === 1)
        throw new Error('ทำรายการสต็อกกับชุดสินค้าไม่ได้ — ชุดสินค้าไม่มีล็อต');
}
/**
 * Weighted-average cost over OPEN lots. Call after any event that
 * changes a product's lot composition (receive, cancel, adjust, lot edit).
 * No-op when the product has no open lots — leaves cost_price alone
 * rather than zeroing it out.
 */
export function recomputeAvgCost(db, productId) {
    var agg = db.prepare("\n    SELECT COALESCE(SUM(qty_received * cost_price), 0) AS cost_sum,\n           COALESCE(SUM(qty_received), 0)              AS qty_sum\n    FROM product_lots\n    WHERE product_id = ? AND qty_received > 0 AND is_closed = 0\n  ").get(productId);
    if (agg.qty_sum > 0) {
        db.prepare("\n      UPDATE products\n         SET cost_price = ?, updated_at = datetime('now','localtime')\n       WHERE id = ?\n    ").run(agg.cost_sum / agg.qty_sum, productId);
    }
}
/**
 * Bundle cost = Σ(component.cost_price × qty_per_bundle).
 * Also mirrors the value to last_cost_price so the "ราคาทุนล่าสุด" UI
 * row reads consistently (bundles never have purchase transactions to
 * stamp a last cost on their own).
 */
export function recomputeBundleCost(db, bundleId) {
    var r = db.prepare("\n    SELECT COALESCE(SUM(c.cost_price * bi.qty_per_bundle), 0) AS total\n    FROM product_bundle_items bi\n    JOIN products c ON c.id = bi.component_product_id\n    WHERE bi.bundle_id = ?\n  ").get(bundleId);
    db.prepare("\n    UPDATE products\n       SET cost_price = ?, last_cost_price = ?, updated_at = datetime('now','localtime')\n     WHERE id = ?\n  ").run(r.total, r.total, bundleId);
}
/**
 * When a component's cost changes, every bundle that contains it needs
 * to re-derive its own cost. Call immediately after recomputeAvgCost.
 * No-op when the product is in no bundles (the common case).
 */
export function propagateCostToBundles(db, componentId) {
    var bundles = db.prepare("SELECT DISTINCT bundle_id FROM product_bundle_items WHERE component_product_id = ?").all(componentId);
    for (var _i = 0, bundles_1 = bundles; _i < bundles_1.length; _i++) {
        var b = bundles_1[_i];
        recomputeBundleCost(db, b.bundle_id);
    }
}
