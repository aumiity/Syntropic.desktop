---
name: project_gr_price_edit
description: GR wizard price-edit — audit leak fixed, Phase 1+2 DONE (2026-06-13), invariants & pitfalls
metadata:
  type: project
---

**Phase 1 DONE 2026-06-13 (tsc PASS, e2e 6/6 PASS). Phase 2 DONE 2026-06-13 (tsc PASS, e2e 11/11 PASS).**

## Closed audit leak (non-obvious history)

`purchase.save` USED TO run `UPDATE products SET price_retail = sell_price` on every GR receive — unconditionally, with **no `price_logs` entry and no admin gate**. That block is **removed** as of commit a10b91e. From now on:

- **`products.price_retail` is owned SOLELY by `products:updatePrice`** — the only path that writes `price_logs` + enforces admin gate. Any future code that tries to write `price_retail` directly in a GR handler must be rejected.
- `product_lots.sell_price` and `last_cost_price` are still written by GR as before (correct — lot price ≠ master retail).

## New IPC: `auth:verifyAdmin`

Added in `electron/ipc/auth.ts` + `electron/preload.ts`. Validates a manager-override credential **up front** (returns success/fail before any write), so the caller can stash the token and forward it to `products:updatePrice` later. Use this instead of nesting an override dialog inside a confirm flow. See [[ipc-role-enforcement]] for the general override pattern.

## Phase 1 decisions (do not revert)

- **D1 — price edit persists even if GR bill is cancelled.** `products:updatePrice` fires on row-confirm in the wizard (not at bill-save). If the user later voids the GR, the master retail price change stays — this is intentional (price changes are independent of inventory transactions).
- **D2 — admin gate is up-front unlock, not per-write.** Non-admin sees the sell-price input `readOnly` + an unlock button; clicking it calls `auth:verifyAdmin(override)`, stashes the credential, then unlocks the field. The stashed override is forwarded when the row is confirmed.
- **R2 — cost-change alert.** Step 4 shows a banner when typed unit cost differs from `stored_last_cost` (the product's `last_cost_price` snapshotted into `ReceiptRow` at search time). Banner is informational only — does not block save.

## Phase 2 — all-units price editor (DONE 2026-06-13)

Step 4 is now an all-units × (ราคาปลีก / ส่ง1 / ส่ง2) grid.

### New IPC: `products:updateUnitPrice(productUnitId, {price_retail?, price_wholesale1?, price_wholesale2?}, override)`

- Admin-gated via `requireAdmin`.
- Allow-listed to exactly those 3 columns — no other keys accepted.
- **INTENTIONALLY does NOT write `price_logs` (decision R5).** Price history stays base-unit-only; no schema change needed. Do not add logging here in the future without revisiting R5.

### Write routing on row-confirm

- Base unit price changes → `products:updatePrice` per changed `price_type` (logged as before).
- Variant unit price changes → `products:updateUnitPrice` with only the changed fields (not logged).

### Sellable-units sourcing — CRITICAL

The price-editor table is built from **`prod.units` (enrichProduct, `is_for_sale=1`)** via `buildSellUnits()` (exported from `AddProductWizard.tsx`, also used in `index.tsx` `buildRowFromProduct`). Do **not** use `purchase_units` (receiving units) for this — they are a different set. The caution was in spec §7 and was honored.

### State management

Phase 1's single `sellPrice` field was removed entirely. Step 4 now uses a `priceDrafts` map keyed by unit.

### clearProduct reset rule (pitfall — fixed during review)

`clearProduct` (the "เปลี่ยนสินค้า" button) must reset **both** `priceDrafts` AND `row.sell_units`. If only one is cleared:
- The draft-seed effect is gated on `prev` being empty — it won't re-seed for the new product.
- Product A's prices leak onto product B (wrong displayed price + wrong `price_logs` entries for the base unit).

### e2e test gotcha: `products:addUnit`

`products:addUnit` requires `unit_id` (FK to `item_units` — fetch via `settings.listUnits`) **and** a `barcode` field. Passing `unit_name` alone throws a NOT NULL / FK error. Fetch the unit list first, resolve the `id`, then pass `{ unit_id, barcode, ... }`.

## Related

- [[project_purchase_wizard]] — wizard structure, search-dialog decisions
- [[project_cost_model]] — three-cost model; `last_cost_price` is the pricing ref shown in the banner
- [[ipc-role-enforcement]] — `requireAdmin` / `auth:verifyAdmin` pattern
