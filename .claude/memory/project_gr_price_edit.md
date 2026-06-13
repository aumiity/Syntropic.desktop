---
name: project_gr_price_edit
description: GR wizard price-edit — invariants, audit leak fixed, Phase 2 pending (2026-06-13+)
metadata:
  type: project
---

**Phase 1 DONE 2026-06-13 (tsc PASS, e2e 6/6 PASS).** Phase 2 pending — see below.

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

## Phase 2 — pending (not started as of 2026-06-13)

Edit **all units** (base + variants) incl. wholesale (ws1/ws2):

- Needs a NEW `products:updateUnitPrice(productUnitId, {...}, override)` IPC handler — admin-gated.
- **NOT logged in `price_logs` (decision R5)** — price_logs stays base-unit-only; no schema change needed.
- Step-4 single price input becomes an all-units × (retail/ws1/ws2) table.
- **CAUTION:** `row.units` in the wizard come from `purchase_units` (receiving units), but the price-editor table must key on **sellable units** (`is_for_sale=1`). Do not conflate receiving units with sellable units when building the Phase 2 table.

Spec: `docs/superpowers/specs/2026-06-13-gr-wizard-price-edit-design.md` §7.

## Related

- [[project_purchase_wizard]] — wizard structure, search-dialog decisions
- [[project_cost_model]] — three-cost model; `last_cost_price` is the pricing ref shown in the banner
- [[ipc-role-enforcement]] — `requireAdmin` / `auth:verifyAdmin` pattern
