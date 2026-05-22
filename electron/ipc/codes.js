/**
 * The reserved walk-in ("ลูกค้าทั่วไป") customer code. Seeded once in
 * seed.ts and guarded everywhere — never editable/deletable/listable.
 */
export var WALKIN_CUSTOMER_CODE = 'C0000';
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
export function walkInCustomerId(db) {
    var row = db.prepare("SELECT id FROM customers WHERE code = ?")
        .get(WALKIN_CUSTOMER_CODE);
    if (!row)
        throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B (".concat(WALKIN_CUSTOMER_CODE, ") \u2014 \u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1C\u0E34\u0E14\u0E1B\u0E01\u0E15\u0E34"));
    return row.id;
}
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
export function nextCustomerCode(db) {
    var _a;
    var row = db.prepare("SELECT MAX(CAST(SUBSTR(code, 2) AS INTEGER)) AS maxNum\n     FROM customers WHERE code LIKE 'C%'").get();
    var next = ((_a = row === null || row === void 0 ? void 0 : row.maxNum) !== null && _a !== void 0 ? _a : 0) + 1;
    return "C".concat(String(next).padStart(4, '0'));
}
