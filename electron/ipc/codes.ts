import type { getDb } from '../db'

/**
 * Next running customer code: C0001, C0002, …
 *
 * Uses MAX of the numeric suffix across existing `C%` codes (+1) — NOT
 * `ORDER BY id DESC` — so it stays correct even when rows are imported
 * out of order or a code is edited by hand. C0000 (reserved walk-in)
 * has suffix 0, so the first real customer is C0001.
 *
 * Single source of truth shared by `people:saveCustomer` and the POS
 * `pos:addCustomer` quick-add, so both can never diverge or collide.
 */
export function nextCustomerCode(db: ReturnType<typeof getDb>): string {
  const row = db.prepare(
    `SELECT MAX(CAST(SUBSTR(code, 2) AS INTEGER)) AS maxNum
     FROM customers WHERE code LIKE 'C%'`
  ).get() as { maxNum: number | null }
  const next = (row?.maxNum ?? 0) + 1
  return `C${String(next).padStart(4, '0')}`
}
