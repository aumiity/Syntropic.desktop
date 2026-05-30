import type { getDb } from '../db';
/**
 * The reserved walk-in ("ลูกค้าทั่วไป") customer code. Seeded once in
 * seed.ts and guarded everywhere — never editable/deletable/listable.
 */
export declare const WALKIN_CUSTOMER_CODE = "C0000";
/**
 * Resolve the walk-in customer row id.
 *
 * Walk-in is modelled as a real row (C0000), NOT a NULL customer_id — see
 * the walk-in invariant in CLAUDE.md. Every sale-insert path funnels its
 * `customer_id ?? walkInCustomerId(db)` through here so `sales.customer_id`
 * is never NULL, keeping report joins/group-by uniform.
 *
 * Throws if C0000 is missing — seed.ts guarantees it on every launch, so a
 * miss means the DB is corrupt and we must fail loudly rather than write NULL.
 */
export declare function walkInCustomerId(db: ReturnType<typeof getDb>): number;
/**
 * Next running customer code: C0001, C0002, …
 *
 * Uses MAX of the numeric suffix across existing `C%` codes (+1) — NOT
 * `ORDER BY id DESC` — so it stays correct even when rows are imported
 * out of order or a code is edited by hand. C0000 (reserved walk-in)
 * has suffix 0, so the first real customer is C0001.
 *
 * Single source of truth for customer codes (`people:saveCustomer`, shared
 * by POS via the same handler), so codes can never diverge or collide.
 */
export declare function nextCustomerCode(db: ReturnType<typeof getDb>): string;
