# Audit Request — Product Bundle (ชุดสินค้า) Phase 1 + 2

> **For external code-reviewing LLMs (Deepseek, Gemini, etc.) reviewing the implemented bundle feature.**
> Status: code-complete, tsc clean across all changes, **NOT click-tested yet**.
> Pre-audited at the **plan stage** by 3 reviewers — every finding folded into the plan before code was written.
> This request asks you to audit the **shipped code** against the plan, and to find anything the plan missed.

---

## What this feature does

Lets the pharmacy sell a **"ชุดสินค้า"** (kit/bundle) — e.g. *ชุดยาแก้ปวด = Ibuprofen ×1 + Norgesic ×1* — as **one cart line** with its own barcode / retail+wholesale price / unit / dispensing label, while still:
- Deducting each component's stock correctly via FEFO at sale time
- Recording cost-of-goods per component for accurate profit reports
- Supporting void of the whole bill (existing flow, ZERO code change)
- Supporting whole-bundle return (Phase 2 — new RT- bill restores to original lots)

Bundles are **separate** from regular products in the UI: `/products` now has 2 tabs (สินค้า / ชุดสินค้า), and bundles get their own dedicated `EditBundle` page (vs. an `is_bundle` toggle inside EditProduct). The existing EditProduct is untouched.

## Tech stack
Electron 31 + React 18 + TypeScript + better-sqlite3 + Tailwind v3 + Zustand + React Router v6 (HashRouter).

## Commits to review
- **Phase 1** (sell-as-one, deduct-as-many): `1d794e1` — `feat(bundle): implement Product Bundle Phase 1`
- **Phase 2** (whole-bundle return): `034d887` — `feat(bundle): Phase 2 — whole-bundle return from sale detail`

## Reference docs
- [`docs/plans/product-bundle-phase1.md`](../plans/product-bundle-phase1.md) — full design + plan-stage audit findings
- [`PROGRESS.md`](../../PROGRESS.md) → "Session 2026-05-20c" — shipped log
- [`CLAUDE.md`](../../CLAUDE.md) → project-wide invariants (walk-in customer C0000, base-unit storage, UI conventions, theming, etc.)

---

## Load-bearing assumptions to challenge

These are the architectural pillars. If any of these is wrong, much of the design collapses. Please verify against the actual code.

### 1. `sale_item_lots.product_id` is independent of `sale_items.product_id`
**Why it matters:** the whole "sell as one bundle, restore as many components" design rests on this. Each `sale_item_lots` row carries its own `product_id` (the component's id), independent of the parent `sale_items.product_id` (which is the bundle's id).

**Verify in:**
- `electron/db/schema.ts` → `CREATE TABLE sale_item_lots`
- `electron/ipc/reports.ts:145-173` (`reports:voidSale`) — restore loop uses `sil.product_id`, not the joined `si.product_id`
- `electron/ipc/pos.ts:deductFefo` (helper at module scope) — writes `sale_item_lots` with the COMPONENT's product_id even when called from the bundle branch in `saveBill`

### 2. Bundles have `is_stock_item = 0` and NO own `product_lots` rows
Stock is **derived** from components: `MIN(component_open_qty ÷ qty_per_bundle)`. The SQL expression is centralized in `STOCK_EXPR` (`electron/ipc/products.ts` near the top) and used by `products:list` + `products:stockStats`.

**Verify:**
- Backend guards on 5 stock/lot handlers (`adjustStock`, `adjustLot`, `adjustLotBatch`, `updateLot`, `getLots`) — see `assertNotBundle()` helper in `products.ts`
- UI: BundlesList doesn't show "low stock" / "out" filters; EditBundle has no Lots tab; POS hides unit chevron for bundles

### 3. Cost propagation is now centralized in `electron/db/pricing.ts`
Before this feature, the weighted-avg cost SQL was **inlined 4× across 2 files** (`products.ts` adjustStock + updateLot; `purchase.ts` GR-save + GR-cancel). This was a latent bug: any new cost-changing path would have had to copy the SQL again.

The shared module exposes:
- `recomputeAvgCost(db, productId)` — weighted-avg over open lots
- `recomputeBundleCost(db, bundleId)` — Σ(component.cost_price × qty_per_bundle); mirrors to `last_cost_price`
- `propagateCostToBundles(db, componentId)` — fans out to every bundle containing this component

**Critical question:** is there any path that mutates a product's cost which does NOT call `recomputeAvgCost` + `propagateCostToBundles`? Greps to consider:
- `UPDATE products SET cost_price` — should only happen in pricing.ts now
- Direct `product_lots` mutations that affect open-lot composition

### 4. Walk-in customer (C0000) invariant preserved across the new return flow
Existing project rule (CLAUDE.md HARD): `sales.customer_id` is NEVER NULL; walk-in is the real C0000 row. The new `pos:returnBundle` IPC must respect this.

**Verify:** `electron/ipc/pos.ts` → `pos:returnBundle` uses `payload.customer_id ?? si.orig_customer ?? walkInCustomerId(db)` — the chain never lands on NULL.

---

## Files to audit (with code paths)

### Backend
- `electron/db/schema.ts` — new column + table + migration
- `electron/db/pricing.ts` — NEW shared cost-recompute module
- `electron/ipc/products.ts` — bundle filter on list/stockStats/lowStock; new IPCs (`getBundleItems`, `saveBundleItems`); guards on 5 handlers; cost recompute now via shared helper
- `electron/ipc/purchase.ts` — GR + GR-cancel now via shared helper (was inlined 2×)
- `electron/ipc/pos.ts` — `deductFefo` extracted; `saveBill` branches on `is_bundle`; `searchProducts` attaches `bundle_items[]` with lots; NEW `pos:returnBundle`
- `electron/ipc/reports.ts` — `getSaleByInvoice` extended with `is_bundle` + `component_lots[]` for bundle rows
- `electron/preload.ts` — new bindings

### Frontend
- `src/types/index.ts` — `Product.is_bundle / bundle_items`; new `ProductBundleItem` interface
- `src/pages/Products/index.tsx` — restructured to Tabs shell with `<Outlet />`
- `src/pages/Products/ProductsList.tsx` — extracted; passes `is_bundle: 0` to both list + stockStats
- `src/pages/Products/BundlesList.tsx` — new; `is_bundle: 1` filter + quick-create
- `src/pages/Products/EditProduct/index.tsx` — cross-redirect guard
- `src/pages/Products/EditBundle/{index,GeneralTab,PriceTab,ComponentsTab}.tsx` — new page
- `src/pages/POS/index.tsx` — bundle cost preview, cart row breakdown, unit chevron hide, manual-return modal toast
- `src/components/dialogs/SaleDetailDialog.tsx` — bundle expand + "คืนชุด" button
- `src/App.tsx` — nested routes

---

## Focus areas (please rank issues by severity)

🔴 **Critical** (data loss / incorrect stock / incorrect money):
- Race conditions inside a transaction that span multiple SQL statements
- Any cost-mutation path that bypasses `recomputeAvgCost` + `propagateCostToBundles`
- Double-restore bugs in the void/return interplay (Phase 2 marks `is_cancelled=1` to prevent this — verify completeness)
- Oversold (`lot_id IS NULL`) edge cases — what happens when a bundle is sold with a partially-stocked component, then voided, then someone restocks, then voided again?
- Transaction rollback safety on `pos:saveBill` bundle branch

🟡 **Minor** (UX inconsistency, potential UX foot-gun):
- Guards that catch the user on the UI side but not on the backend, or vice versa
- Error messages that fail to identify what went wrong
- React Router v6 path scoring — does `/products/bundles/new` correctly land on EditBundle (not BundlesList)?
- Cross-redirect guards: any way for a user to land in the "wrong" editor?
- Allow-listed vs. spread-form payloads in EditBundle's `handleSave` (defensive vs. legacy Object.keys trap)

🟢 **Suggestion** (code quality / future-proofing):
- Naming, JSDoc, comment clarity for non-obvious behavior
- Test scenarios we should script before letting this near production
- Migration safety on existing DBs (was the `ALTER TABLE products ADD COLUMN is_bundle` placed in a try/catch block that survives "column already exists"?)
- Indexes — `idx_pbi_bundle` and `idx_pbi_component` are in place; any other paths that need indexing?

---

## Specific questions for the audit

1. **Cost-propagation coverage:** Did we miss any code path that mutates `product_lots.cost_price`, `product_lots.qty_received`, or `product_lots.is_closed` in a way that affects the weighted-avg, but which doesn't call `recomputeAvgCost`/`propagateCostToBundles`? Grep the codebase for `UPDATE product_lots` / `INSERT INTO product_lots` and verify each site.

2. **`pos:returnBundle` correctness:**
   - It marks `sale_item_lots.is_cancelled = 1` on the originals. Does `reports:voidSale` correctly skip these (`WHERE is_cancelled = 0`)? (Should — current voidSale already filters this.)
   - It marks `sale_items.is_cancelled = 1` on the bundle. Does the daily-stats sum-of-total_amount logic handle this correctly? (No — `getDailyStats` filters by `status='completed'` only, not is_cancelled. Is that a problem?)
   - If the operator returns the same bundle twice (after a refetch race), what happens? (`is_cancelled=1` check in the IPC should throw "ถูกคืนแล้ว" — verify.)
   - `lot_id IS NULL` rows are skipped for stock restore. Is the customer effectively "refunded for stock the store never had"? Is that the right semantic? (Currently shared with `pos:returnItems` behavior.)

3. **Bundle save-items validation:**
   - `saveBundleItems` validates `component.is_bundle === 0`, `is_disabled === 0`, `qty_per_bundle > 0`. Any other validation we should add? (e.g. "component is is_stock_item=1"? Currently a bundle's components could themselves be non-stock items, which makes no sense for FEFO.)
   - Should saving an empty `items[]` array (deleting all components) be allowed, or should it throw? Currently: allowed → bundle becomes "0-component" which has cost=0 and derived_stock=0 (effectively unsalable but the row exists).

4. **`STOCK_EXPR` correctness for bundles:**
   - The CASE WHEN uses integer division: `CAST(... / bi.qty_per_bundle AS INTEGER)`. This rounds DOWN, which is correct ("you can make 3.7 bundles → you can sell 3"). But `qty_per_bundle` is REAL, so a bundle with `qty_per_bundle=0.5` (half-bottle per kit) would have its component's stock effectively multiplied by 2. Is that semantically what we want? (Likely yes, but worth a thought.)

5. **POS cost preview FEFO simulation:**
   - The `lotRemaining` Map is shared across all cart items so multi-line carts don't double-count. Does the bundle branch correctly add to (not bypass) this map?
   - Does the cost preview match what `saveBill` will actually do? Walk through a 2-bundle-line cart where both bundles share Ibuprofen as a component.

6. **Cross-redirect guards:** When a user navigates to `/products/<bundleId>/edit`:
   - EditProduct loads the product (one IPC round-trip)
   - Sees `is_bundle === 1` → redirects to `/products/bundles/<bundleId>/edit`
   - EditBundle loads the product (second IPC round-trip)
   - Sees `is_bundle === 1` → proceeds
   Is there a way to skip the first round-trip? (Probably not worth the complexity.) Any way for the user to see a flash of the "wrong" form? Should the guard happen before `setLoading(false)`?

7. **React Router v6 path scoring:** The plan claims `/products/bundles/:id/edit` (sibling) outscores the nested `/products/bundles` (child) under the Tabs layout. Verify via a quick test: typing `/products/bundles/5/edit` in the URL bar should land on EditBundle, NOT show BundlesList with a child route that doesn't exist.

8. **Bundle creation flow:** `BundlesList.tsx` "+ เพิ่มชุดสินค้า" calls `products.create({ trade_name: 'ชุดสินค้าใหม่', is_bundle: 1, is_stock_item: 0, ... })`. Is there a guard that prevents this from creating a non-bundle product via the regular flow if someone accidentally passes `is_bundle: 1`? (There isn't — the dialog UI just doesn't expose it. Is that OK?)

9. **Backend guards completeness:** The 5 handlers that throw on bundle (adjustStock/adjustLot/adjustLotBatch/updateLot/getLots) — did we cover all stock-touching paths? Specifically check:
   - `purchase:save` — can someone GR a bundle? (Would write to product_lots which the system doesn't expect.) Currently NO guard.
   - `purchase:cancel` — same question.
   - `products:expireLot` — same question (System C disposal flow).
   - Direct sale of a bundle via POS — `pos:saveBill` doesn't FEFO the bundle id itself (only components), but does it explicitly assert the bundle has zero lots?

10. **Schema migration on existing DBs:** When the app starts with an existing pre-bundle database, does the migration apply cleanly? Verify `electron/db/schema.ts` migrations block — the new `is_bundle` ALTER is in the safe try/catch, so it should survive both fresh and re-runs.

---

## Out of scope for this audit (please do NOT flag)

- **Click-testing** — not done, scheduled by the operator
- **Feature extensions** — non-base bundle units, FDA propagation through bundles, component label merging, B-prefix code sequence (all explicitly deferred to future phases)
- **Pre-existing limitations** — `lot_id=NULL` oversold rows leaking through voidSale (this is documented as carrying forward from single-product handling)
- **Performance benchmarking** — the system handles ~10K products max; the indexes added on `product_bundle_items` are sufficient for that scale
- **`/products` Tabs UX** vs. a dedicated `/bundles` route — already debated and locked in plan

---

## Provide feedback as

For each issue:
- **Severity**: 🔴 critical / 🟡 minor / 🟢 suggestion
- **Location**: `path/to/file.ts:LINE-RANGE`
- **What's wrong**: 1–2 sentences
- **Suggested fix**: code snippet or grep-validated alternative
- **Evidence**: the actual lines or grep output that reveal the issue (so the operator can verify without re-running your search)

Group findings by file or by severity, whichever flows better for your reasoning. If you find that an entire area is clean, say so explicitly — silence is ambiguous.

If the audit reveals new requirements or design changes that should be made, flag them as **🟣 design feedback** separate from bugs.

---

## Verification cheat sheet (for self-checking your findings)

```bash
# Bundle SQL across the codebase — should appear in pricing.ts, products.ts, pos.ts, schema.ts
grep -rn "is_bundle\|product_bundle_items\|recomputeBundleCost\|propagateCostToBundles\|deductFefo" --include="*.ts" --include="*.tsx" electron src

# Pre-bundle cost recompute SQL should NOT exist outside pricing.ts (i.e. no duplicate inline blocks)
grep -rn "SUM(qty_received \* cost_price)" --include="*.ts" electron

# UPDATE product_lots paths — verify each is covered by a downstream recomputeAvgCost call
grep -rn "UPDATE product_lots\|INSERT INTO product_lots" --include="*.ts" electron

# Backend guards
grep -rn "assertNotBundle\|ทำรายการสต็อกกับชุดสินค้าไม่ได้" --include="*.ts" electron

# Cross-redirect guards
grep -rn "is_bundle === 1\|is_bundle !== 1" --include="*.tsx" src
```

Run any of these to validate or augment your findings. Cite the output in your report.
