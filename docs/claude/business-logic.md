# Key Business Logic

## FEFO (First Expiry First Out)

Used in `saveBill`. Deduct from lots ordered by `expiry_date ASC`. Create `sale_item_lots` rows linking each sale_item to specific lots. Span multiple lots if needed. Update `product_lots.qty_on_hand`. Log `stock_movements` (movement_type = 'sale').

## Stock receive (GR)

- Auto-generate `GR-YYYYMMDD-NNN` (sequential per day)
- Per line: product, lot_number, expiry_date, manufactured_date, cost_price, sell_price, qty
- Header: supplier_id, payment_type (cash/credit), due_date, supplier_invoice_no
- On save: insert `product_lots`, update `products.cost_price` (weighted avg across open lots), log `stock_movements` (`receive`)
- History grouped by `invoice_no`

## Lot direct edit (EditProduct → Lots tab, `products:updateLot`)

Backend admin edit for lots — qty_on_hand, cost_price, lot_number, expiry/manufactured dates. Distinct from POS-side stock adjust (`products:adjustStock` from Products list).

- **No reason/note prompt — by design.** The note is hardcoded `'แก้ไขโดยตรง'` (stock_movements) and `'แก้ไขราคาทุนผ่านหน้าล็อต'` (lot_cost_logs). This is an admin-level edit performed directly by the operator; reasons for stock movements that need accountability (sale, void, return) are captured in the POS flow that owns them. Do NOT add a reason field here.
- **`is_cancelled` lots are blocked.** UI hides the edit button; backend also throws — guard against direct IPC.
- **`is_closed` auto-toggles when qty crosses 0.** `qty → 0` closes the lot (`is_closed=1, closed_at=now`); `qty 0 → >0` on a closed lot reopens it (`is_closed=0, closed_at=NULL`). Without this the stock movement is logged but the lot stays invisible to FEFO/availability queries (which all filter `is_closed=0`).
- **`products.cost_price` is recomputed** (weighted avg of open lots, by `qty_received`) whenever `cost_price` or `qty_on_hand` changes — qty changes affect the avg because they toggle `is_closed`, which gates inclusion. Same query shape as the receive and GR-cancel flows.
- **Front-end never coerces blank → 0.** `parseFloat('') || 0` would silently wipe stock or zero out cost on an accidentally cleared field. Validate explicitly: blank, NaN, or negative → toast error and abort.

## Running codes

Customers `C0001…`, suppliers `S0001…`, products `P0001…`, GR `GR-YYYYMMDD-0001…`, sales (receipts) `RC-YYYYMMDD-0001…`, returns `RT-YYYYMMDD-0001…`. C0000 is reserved for "ลูกค้าทั่วไป" (walk-in).

`INV-` is reserved for the future unpaid-invoice flow (issue invoice → collect payment later) and is **not** currently in use. Don't repurpose the prefix for completed sales — those are `RC-`.

## Barcode uniqueness

Products have 4 barcode fields (barcode, barcode2, barcode3, barcode4) plus `product_units.barcode`. Validate uniqueness across ALL of these before save.

## Pricing

- **Base unit prices live on `products`** — `price_retail`, `price_wholesale1`, `price_wholesale2`. Single source of truth, no mirroring.
- `has_wholesale1` / `has_wholesale2` flags (PHP-only, not in SQLite) historically gated whether wholesale prices were active. The desktop app shows a wholesale row in the price dialog only when its value is `> 0`.
- Non-base ProductUnit variants (แผง, กล่อง, …) own their own `price_*` / `barcode` / `qty_per_base` / `is_for_sale` / `is_for_purchase`. These override the products table when that unit is selected in POS.
- `cost_price` per lot; `products.cost_price` = weighted avg of open lots
- **GR ไม่ตั้งราคาขายหลักอีกต่อไป.** `purchase.save` ไม่เขียน `products.price_retail` แล้ว — ราคาขายหลักเป็นของ `products:updatePrice` (log `price_logs` + admin gate) เจ้าเดียว ที่เรียกจาก Wizard step 4 (เขียนทันทีตอนยืนยัน row). `product_lots.sell_price` + `last_cost_price` ยังเขียนจาก GR ตามเดิม.

## Base unit storage (HARD)

The base unit is `products.unit_id` — a plain FK column. `product_units` holds **only non-base variants**. There is no `is_base_unit` flag anywhere.

- **`products:create`** writes `unit_id` directly to the products row. Falls back to `'ชิ้น'` if the caller omits it.
- **`products:addUnit` / `updateUnit` / `deleteUnit`** all operate on non-base variants only. No special-case guards.
- **EditProduct units tab** renders a synthetic base row at the top (sourced from `product.unit_name` + `product.price_*`) followed by `product.units`. The base row has no edit/delete buttons — base unit pricing and unit selection are edited on the General tab (`unit_id` selector + the price inputs).
- **POS unit dialog** synthesizes a base entry with `id: -1` for display, then appends `product.units`. `changeCartUnit` detects `id === -1` and clears `selectedUnit` (so the cart pulls base prices from `product.*`). For non-base units, `selectedUnit` is set and the cart uses its `price_*`.
- **POS search modal** `flatItems` emits `{ product, unit: null }` first (base row) then one entry per non-base unit. `handleSelectItem(p, null)` sets `selectedUnit: undefined`.

## VAT (ภาษีมูลค่าเพิ่ม) — full structure 2026-06-10

- **VAT mode changes only through guarded flows, never a toggle.** Upgrade = setup wizard or `settings:upgradeToVat`; downgrade = `settings:downgradeFromVat` (the logged-in admin re-enters their OWN password — verified main-side with the login lockout backoff — plus a mandatory reason). `saveSalesSettings` strips `vat_enabled`/`vat_rate` main-side; every transition is audited in `vat_audit_log` (action `'upgrade'`/`'downgrade'`, who/when/why). Downgrade keeps registration data in `settings` (re-upgrade prefills) and never touches old bills' VAT snapshots. The Reports ภาษี tab stays visible after downgrade when `settings:hasVatHistory` is true (past periods stay inspectable).
- **Output VAT (ภาษีขาย):** prices are VAT-inclusive; `extractVat` (`src/lib/vat.ts`) backs the tax out. Snapshotted per sale (`sales.total_vat` / `sale_items.unit_vat`) — never recompute old bills from current settings. **Returns write `total_vat = 0`** (no credit-note/ใบลดหนี้ yet) — known gap.
- **Per-bill sale VAT checkbox (POS payment dialog, 2026-06-10):** VAT shops get a "คิดภาษีมูลค่าเพิ่ม (VAT)" checkbox above the print toggle — **default CHECKED, re-armed every time the payment dialog opens** (operator decision: ต้องติ๊กออกเองทุกบิลที่ไม่เอา VAT, ไม่จำค่า). Unticked = `total_vat`/`unit_vat` saved as 0 (customer pays the same — inclusive prices), bill excluded from the ภาษีขาย report, and the tax-invoice action is hidden for that bill (`total_vat > 0` gate in SaleDetailDialog + Manage/Sales). The single `vatApplied = vatEnabled && vatChecked` flag in `POS/index.tsx` feeds pendingVat, the receipt preview, and the saveBill payload — keep all three on the same flag.
- **Input VAT (ภาษีซื้อ) on GR — per bill:** `purchase_receipts.vat_mode` = `'none' | 'inclusive' | 'exclusive'` (some suppliers aren't VAT-registered, so the operator declares it per bill). `vat_amount` computed main-side in `purchase:save`; base = line sum (renderer distributes bill discount/surcharge into lines first). NO-VAT shop is forced `'none'` server-side.
- **Cost rule (HARD):** the items ledger (`purchase_receipt_items.cost_price`) keeps the **entered invoice price** (document fidelity); the cost model (`product_lots.cost_price`, weighted avg, `last_cost_price`, `stock_movements.unit_cost`) stores **ex-VAT** cost — for `'inclusive'` bills the handler divides by `(1 + rate/100)` because claimable VAT is not cost. For `'exclusive'` bills entered prices are already ex-VAT; payable adds VAT on top (`PURCHASE_NET_SUB` in reports.ts includes it).
- **Input VAT on expenses:** `expenses.vat_amount` + `has_tax_invoice` — claimable only with a full tax invoice; `vat_amount` is forced 0 main-side when the flag is off, so reports can trust the column.
- **UI gating:** `useShopVat()` hook hides all VAT UI (tax-invoice actions, GR VAT card, expense VAT fields, the ภาษี report tab) when the shop is NO-VAT. Gating is UX only — main-side guards are the enforcement.

## Cost/profit in reports

Record cost at sale time from lot cost_price. Profit = `line_total − (qty × lot cost_price)`.

## Void sale

Read `sale_item_lots`, restore qty to each `product_lots.qty_on_hand`, insert `stock_movements` (`sale_return`), set `sales.status = 'voided'`, store `void_reason`. Requires reason text.

## Walk-in customer (C0000) — HARD invariant

"ลูกค้าทั่วไป" is a **real reserved row** (`customers.code = 'C0000'`, seeded every launch), **never a NULL `customer_id`**. This keeps every report join / group-by uniform — no `COALESCE(...,'ลูกค้าทั่วไป')` or `customer_id IS NULL` special-casing anywhere.

- **Persistence chokepoint:** every sale-insert path resolves `payload.customer_id ?? walkInCustomerId(db)` (helper in `electron/ipc/codes.ts`). `sales.customer_id` is **never written NULL** — `pos:saveBill`, `pos:returnItems`, and `dev:seedSalesHistory` all funnel through this.
- **Renderer keeps `null` as an in-memory walk-in marker only.** `cartStore.customer = null` + the `cart.customer ? … : 'ลูกค้าทั่วไป'` display fallback. Clicking "ลูกค้าทั่วไป" = `setCustomer(null)` → reverts to walk-in; the backend maps it to C0000 on save. Do NOT fetch/inject the C0000 row into the cart.
- **C0000 is guarded:** excluded from `people:listCustomers` + `pos:searchCustomers` (`code != 'C0000'`); `people:saveCustomer` (edit) and `people:setCustomerStatus` throw if targeting it. Never editable/deletable/disablable/listable. The People page needs no special-casing — it just never receives the row.
- **Legacy heal:** `seed.ts` backfills `UPDATE sales SET customer_id = C0000 WHERE customer_id IS NULL` every launch (idempotent) for DBs written before this model.
- `sales.customer_id` stays schema-nullable (SQLite NOT-NULL retrofit is risky); the invariant is enforced at the app layer, not by a constraint.

## Customer fields

- Health coverage: `hc_uc` = บัตรทอง (UC), `hc_gov` = ข้าราชการ, `hc_sso` = ประกันสังคม (boolean flags)
- Alert: `is_alert` + `alert_note` + `warning_note` shown as warning during POS checkout
- Drug allergy: `drug_allergies` links customer to `drug_generic_names` (or free text via `drug_name_free`); has Naranjo score and severity

## Product label (pharmacy dispensing)

Each product can have multiple label templates combining dose_qty, frequency, meal_relation/timing, dosage, label_time, advice, multilingual indication+notes (Thai/Burmese/Chinese). Printed with `label_settings` singleton (paper size, fonts, spacing, row_styles JSON).
