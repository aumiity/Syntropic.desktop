import type { Database } from 'better-sqlite3';
/**
 * Defense in depth — every stock/lot mutation handler asserts the target
 * is NOT a bundle. UI hides these affordances for bundles, but direct IPC
 * callers (and now the Purchase intake which uses pos:searchProducts without
 * an is_bundle filter) could otherwise corrupt the "bundles have no lots"
 * invariant. Lives in pricing.ts so both electron/ipc/products.ts and
 * electron/ipc/purchase.ts can use it without cross-IPC imports.
 */
export declare function assertNotBundle(db: Database, productId: number): void;
/**
 * Weighted-average cost over OPEN lots. Call after any event that
 * changes a product's lot composition (receive, cancel, adjust, lot edit).
 * No-op when the product has no open lots — leaves cost_price alone
 * rather than zeroing it out.
 */
export declare function recomputeAvgCost(db: Database, productId: number): void;
/**
 * Bundle cost = Σ(component.cost_price × qty_per_bundle).
 * Also mirrors the value to last_cost_price so the "ราคาทุนล่าสุด" UI
 * row reads consistently (bundles never have purchase transactions to
 * stamp a last cost on their own).
 */
export declare function recomputeBundleCost(db: Database, bundleId: number): void;
/**
 * When a component's cost changes, every bundle that contains it needs
 * to re-derive its own cost. Call immediately after recomputeAvgCost.
 * No-op when the product is in no bundles (the common case).
 */
export declare function propagateCostToBundles(db: Database, componentId: number): void;
