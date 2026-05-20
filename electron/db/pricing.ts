// Pricing helpers shared by products.ts (adjustStock/updateLot) and
// purchase.ts (GR save/cancel) so the cost recompute SQL has a single
// source of truth — and so bundle cost propagation fires on EVERY
// cost-changing event without per-call-site bookkeeping.
//
// Why a shared module: before this file, the same weighted-avg SQL was
// inlined 4× (products.ts:adjustStock, products.ts:updateLot,
// purchase.ts:save, purchase.ts:cancel). Adding the bundle-propagation
// hook had to happen in exactly one place to be reliable.

import type { Database } from 'better-sqlite3'

/**
 * Weighted-average cost over OPEN lots. Call after any event that
 * changes a product's lot composition (receive, cancel, adjust, lot edit).
 * No-op when the product has no open lots — leaves cost_price alone
 * rather than zeroing it out.
 */
export function recomputeAvgCost(db: Database, productId: number): void {
  const agg = db.prepare(`
    SELECT COALESCE(SUM(qty_received * cost_price), 0) AS cost_sum,
           COALESCE(SUM(qty_received), 0)              AS qty_sum
    FROM product_lots
    WHERE product_id = ? AND qty_received > 0 AND is_closed = 0
  `).get(productId) as { cost_sum: number; qty_sum: number }
  if (agg.qty_sum > 0) {
    db.prepare(`
      UPDATE products
         SET cost_price = ?, updated_at = datetime('now','localtime')
       WHERE id = ?
    `).run(agg.cost_sum / agg.qty_sum, productId)
  }
}

/**
 * Bundle cost = Σ(component.cost_price × qty_per_bundle).
 * Also mirrors the value to last_cost_price so the "ราคาทุนล่าสุด" UI
 * row reads consistently (bundles never have purchase transactions to
 * stamp a last cost on their own).
 */
export function recomputeBundleCost(db: Database, bundleId: number): void {
  const r = db.prepare(`
    SELECT COALESCE(SUM(c.cost_price * bi.qty_per_bundle), 0) AS total
    FROM product_bundle_items bi
    JOIN products c ON c.id = bi.component_product_id
    WHERE bi.bundle_id = ?
  `).get(bundleId) as { total: number }
  db.prepare(`
    UPDATE products
       SET cost_price = ?, last_cost_price = ?, updated_at = datetime('now','localtime')
     WHERE id = ?
  `).run(r.total, r.total, bundleId)
}

/**
 * When a component's cost changes, every bundle that contains it needs
 * to re-derive its own cost. Call immediately after recomputeAvgCost.
 * No-op when the product is in no bundles (the common case).
 */
export function propagateCostToBundles(db: Database, componentId: number): void {
  const bundles = db.prepare(
    `SELECT DISTINCT bundle_id FROM product_bundle_items WHERE component_product_id = ?`
  ).all(componentId) as Array<{ bundle_id: number }>
  for (const b of bundles) recomputeBundleCost(db, b.bundle_id)
}
