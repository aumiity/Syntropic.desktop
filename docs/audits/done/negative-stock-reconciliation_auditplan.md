# Audit Plan — Negative-Stock Reconciliation

> Use this as a checklist when auditing the **implementation** (the plan was approved in `docs/plans/negative-stock-reconciliation.md` rev 2). Every section ends with a verdict box for the auditor to fill in.
>
> The implementation must pass *every* "must" check. "Should" checks are quality signals — flag but don't block.

---

## A. Implementation map (files claimed touched)

Confirm each file actually contains the described change. Reject if any file is missing or unchanged.

| File | What to look for |
|---|---|
| `electron/ipc/negativeStock.ts` | **NEW** — exports `registerNegativeStockHandlers()`; 4 handlers: `list`, `count`, `reconcile`, `dismiss` |
| `electron/ipc/purchase.ts` | After `recomputeAvgCost`/`propagateCostToBundles` loop: `negative_stock_alerts` query + extended return shape |
| `electron/ipc/reports.ts` | Inside `reports:voidSale` transaction: `UPDATE sale_item_lots SET is_cancelled = 1 ... WHERE lot_id IS NULL` |
| `electron/main.ts` | Import + call `registerNegativeStockHandlers()` |
| `electron/preload.ts` | New `negativeStock: { list, count, reconcile, dismiss }` group on `window.api` |
| `src/types/index.ts` | `NegativeStockRow`, `NegativeStockAlert` exported |
| `src/stores/negativeStockBadge.ts` | **NEW** — Zustand store with `count` + `refresh()` |
| `src/App.tsx` | Lazy import + `<Route path="negative-stock" .../>` under `/manage` |
| `src/pages/Manage/index.tsx` | `TABS` entry for `'negative-stock'` + `resolveTab()` branch |
| `src/pages/Manage/NegativeStock.tsx` | **NEW** — table + 2 confirm dialogs |
| `src/pages/Purchase/index.tsx` | Toast (5000 ms) on `negative_stock_alerts.length > 0` + badge refresh |
| `src/pages/POS/index.tsx` | Badge refresh after `saveBill`; badge refresh after `voidSale` |
| `src/pages/Manage/Sales.tsx` | Badge refresh after `voidSale` |
| `src/pages/Products/EditProduct/HistoryTab.tsx` | Badge refresh after `voidSale` |
| `src/components/layout/Sidebar.tsx` | Renders `<Badge variant="warning">` on `/manage` item; collapsed mode shows dot + tooltip with count |

**Verdict:** ☐ Pass · ☐ Fail · Notes:

---

## B. Critical audit fixes — must verify

These were identified as **Critical / High** in `audit_result_GPT.md`. Each must be present.

### B1. `stock_movements` INSERT includes `product_id` (NOT NULL column)

`electron/ipc/negativeStock.ts` — both `reconcile` and `dismiss` insert into `stock_movements`. Column list must match `electron/ipc/pos.ts:42-46` exactly:

```
(product_id, lot_id, movement_type, ref_type, ref_id,
 qty_change, qty_before, qty_after, unit_cost, note, created_by)
```

- ☐ `reconcile`'s INSERT lists `product_id` first and binds `marker.product_id`
- ☐ `dismiss`'s INSERT lists `product_id` first and binds `marker.product_id` (lot_id = NULL is fine)

**Quick smoke:** call `negativeStock:reconcile` once, then run:
```sql
SELECT product_id, lot_id, movement_type, qty_change, note
FROM stock_movements ORDER BY id DESC LIMIT 1;
```
`product_id` must be non-null; `note` starts with `'ตัดสต๊อคย้อนหลัง: '`.

### B2. `voidSale` cancels NULL markers

`electron/ipc/reports.ts` `voidSale` transaction must include an `UPDATE sale_item_lots SET is_cancelled = 1 WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id = ?) AND lot_id IS NULL AND is_cancelled = 0`.

- ☐ Statement exists
- ☐ Runs **inside** the same transaction as the rest of voidSale (so a failed downstream step rolls it back too)
- ☐ Runs **before** the `UPDATE sales SET status = 'voided'` (cosmetic, but keeps the read-then-write order coherent)

**Smoke:** ขายติดลบ → void สาย → `SELECT is_cancelled FROM sale_item_lots WHERE id = <marker>` → 1.

### B3. Every negative-stock query filters voided sales

In `electron/ipc/negativeStock.ts` and the `purchase:save` post-receive query in `electron/ipc/purchase.ts`, look for `s.status = 'completed'` in:

- ☐ `negativeStock:list`
- ☐ `negativeStock:count`
- ☐ `loadMarker` helper (throws if marker's sale is voided)
- ☐ `purchase:save`'s `negative_stock_alerts` query

This is defense-in-depth on top of B2. If B2 ever regresses, B3 still hides the row.

### B4. FEFO + availability queries exclude cancelled lots

In `electron/ipc/negativeStock.ts`:

- ☐ `available_stock` subquery includes `AND is_cancelled = 0`
- ☐ Reconcile's FEFO `SELECT * FROM product_lots` includes `AND is_cancelled = 0`

**Smoke:** Manually `UPDATE product_lots SET is_cancelled = 1 WHERE id = <some lot with qty_on_hand > 0>`. Reload `/manage/negative-stock`. That lot's qty must not contribute to `available_stock`; reconcile must not deduct from it.

### B5. Epsilon-safe marker upkeep

`reconcile` must not compare `remaining` to literal `0`. Search for `EPS = 1e-9` (or similar) and `remaining <= EPS`.

- ☐ `EPS` constant defined
- ☐ `remaining <= EPS` (or equivalent epsilon) is the loop-exit + delete-marker condition

**Smoke (float qty):** Sell `0.5` of a per-pack unit where `qty_per_base = 3` so base shortfall is `1.5`. Receive `1.5` then reconcile.
```sql
SELECT id, qty FROM sale_item_lots WHERE id = <marker id>;
```
Must return no row (marker deleted), not a ghost `qty = 0.00000000001`.

### B6. Reconcile does NOT auto-close lots

Reconcile must match `deductFefo()` semantics — no `is_closed = CASE WHEN qty_on_hand <= 0 ...` logic.

- ☐ Reconcile only `UPDATE product_lots SET qty_on_hand = qty_on_hand - ?` (no `is_closed` change)
- ☐ Pseudo-code / comments do not claim is_closed auto-toggling

Note: `recomputeAvgCost` is still called (cheap & idempotent) — that's expected.

### B7. Lot-id binding in `sale_item_lots` reconcile rows

`reconcile` inserts new `sale_item_lots` rows with the actual `lot.id` (not the marker's NULL).

- ☐ INSERT has `lot_id = lot.id` (not NULL)
- ☐ `sale_item_id` is the **original** marker's `sale_item_id` (so the new rows attach to the same line item)
- ☐ `product_id` is the **marker's** product_id (component id when reconciling from a bundle — NOT `si.product_id`)

**Verdict:** ☐ Pass · ☐ Fail · Notes:

---

## C. Schema & SQL invariants

### C1. Single marker per sale_item

`deductFefo()` writes one NULL row per oversold `sale_item`. After reconcile + dismiss flows, audit `sale_item_lots`:

```sql
SELECT sale_item_id, COUNT(*) FROM sale_item_lots
WHERE lot_id IS NULL AND is_cancelled = 0
GROUP BY sale_item_id HAVING COUNT(*) > 1;
```

- ☐ Returns 0 rows after any normal flow (sell, reconcile, dismiss, void)

### C2. Audit movement on dismiss

Dismiss must write a `stock_movements` row with:

- `movement_type = 'sale'`
- `ref_type = 'sale'`
- `ref_id = sale_id`
- `qty_change = 0`
- `qty_before = 0`, `qty_after = 0`, `unit_cost = 0`
- `lot_id = NULL`
- `note = 'ลบรายการขายติดลบโดยไม่ตัดสต๊อค'`

- ☐ All fields match

### C3. `purchase:save` return shape is backwards-compatible

Existing callers expecting `{ success, invoice_no }` must still work — `negative_stock_alerts` is additive only.

- ☐ Return object still has `success` and `invoice_no`
- ☐ `negative_stock_alerts` is always present (even if empty `[]`)

**Verdict:** ☐ Pass · ☐ Fail · Notes:

---

## D. Frontend contract

### D1. Zustand badge store

`src/stores/negativeStockBadge.ts`:

- ☐ Exports `useNegativeStockBadge` with `count: number` and `refresh: () => Promise<void>`
- ☐ `refresh()` calls `window.api.negativeStock.count()`
- ☐ Failure is **silently swallowed** (no toast, no throw) — badge is non-critical

### D2. Refresh fires from every mutation site

Grep for `useNegativeStockBadge` usage. Must include refresh after:

| Site | Triggering event | Found? |
|---|---|---|
| `Sidebar.tsx` | `useEffect` on mount | ☐ |
| `POS/index.tsx` | `saveBill` success | ☐ |
| `POS/index.tsx` | `voidSale` success | ☐ |
| `Purchase/index.tsx` | `purchase.save` success | ☐ |
| `Manage/Sales.tsx` | `voidSale` success | ☐ |
| `Products/EditProduct/HistoryTab.tsx` | `voidSale` success | ☐ |
| `Manage/NegativeStock.tsx` | reconcile/dismiss success | ☐ |

**Tip:** the canonical spot to call from a non-component path is `useNegativeStockBadge.getState().refresh()`.

### D3. Sidebar badge rendering

`src/components/layout/Sidebar.tsx`:

- ☐ Badge appears ONLY when `count > 0`
- ☐ Expanded: text badge to the right of "ประวัติ & สต็อก" (variant `warning`)
- ☐ Collapsed: a dot on the icon (with `ring` matching sidebar bg to keep it visible)
- ☐ Tooltip in collapsed mode includes the count, e.g. "ประวัติ & สต็อก (3)"
- ☐ Target identified by `to === '/manage'` (NOT by Thai label — labels can change)

### D4. Toast on GR

`src/pages/Purchase/index.tsx`:

- ☐ Toast fires only when `negative_stock_alerts.length > 0`
- ☐ Duration is **5000 ms** (audit-required, not 8000)
- ☐ Toast type is `'info'`
- ☐ Message names the first product + "+N" overflow
- ☐ Wording points to "ประวัติ & สต็อก" menu (not "จัดการ")

### D5. Page UI conforms to CLAUDE.md

`src/pages/Manage/NegativeStock.tsx`:

- ☐ Outer wrapper: `bg-card rounded-card shadow-card overflow-hidden`
- ☐ Inner header bar: `h-12 px-5`, NO border
- ☐ `<thead>` rows: `sticky top-0 z-10 bg-muted` (via primitive defaults — no override)
- ☐ Columns use `min-w-*`, NOT `w-*`/`table-fixed`
- ☐ Bottom status bar: `h-12 px-5 bg-card border-t border-border` (the ONLY band with border)
- ☐ Action buttons: `size="icon-lg"`, no width override — square icons (success / destructive2)
- ☐ Reconcile button is **disabled** when `available_stock <= 0`, with a `title` explaining why
- ☐ Empty state inside `<TableCell colSpan>`: lucide icon + Thai message + `py-16`
- ☐ Color tokens — no Tailwind palette literals (`bg-blue-500`, `text-amber-...`); only semantic tokens

### D6. Confirm dialogs follow Modal interaction contract

- ☐ Outside-click does NOT close (relies on Dialog primitive — no `onPointerDownOutside={false}` overrides being re-enabled)
- ☐ Esc closes
- ☐ Enter triggers primary OK (via `onKeyDown` wrapper or autofocus on primary button)
- ☐ Cancel button uses `variant="destructive2"`
- ☐ `<DialogContent>` wraps `<DialogHeader>` + `<DialogTitle>` + `<DialogBody>` + `<DialogFooter>`
- ☐ Confirm dialog cannot be dismissed while `busy` (button disabled + `onOpenChange` guarded)

### D7. Tab integration in `/manage`

`src/pages/Manage/index.tsx`:

- ☐ `TABS` array length is now 5
- ☐ `COLS_BY_COUNT[5]` resolves to `xl:grid-cols-5` (already exists in the file — verify summary grid still renders without overflow when 5 cards appear from a different tab; for this tab only 1 card)
- ☐ `resolveTab()` returns `'negative-stock'` for `/manage/negative-stock`

**Verdict:** ☐ Pass · ☐ Fail · Notes:

---

## E. End-to-end smoke (manual)

Run `npm run electron:dev`. Walk through each scenario in order — many depend on state from the previous one.

| # | Scenario | Pass? |
|---|---|---|
| 1 | Sell a product with 0 open-lot qty → bill saves, cart showed red "สต๊อกไม่พอ" alert | ☐ |
| 2 | DB: `SELECT * FROM sale_item_lots WHERE sale_item_id = <last> AND lot_id IS NULL` returns one row with `qty = shortfall` | ☐ |
| 3 | Sidebar badge appears with count `1` next to "ประวัติ & สต็อก" | ☐ |
| 4 | `/manage/negative-stock` lists the row, `available_stock = 0`, reconcile button disabled | ☐ |
| 5 | GR-receive 10 units of that product → toast (5s) "สินค้า X มียอดติดลบรอตัด..."; sidebar badge unchanged | ☐ |
| 6 | Return to `/manage/negative-stock` → `available_stock = 10`, reconcile button enabled | ☐ |
| 7 | Reconcile → confirm dialog opens; Esc closes it; reopen → click "ตัดสต๊อค" → toast success → row disappears → badge `0` | ☐ |
| 8 | DB: new `sale_item_lots` row(s) with real `lot_id` & matching `sale_item_id`; `product_lots.qty_on_hand` decreased; new `stock_movements` row has `product_id` set + note `'ตัดสต๊อคย้อนหลัง: RC-...'` | ☐ |
| 9 | Create another oversell → "ลบรายการ" → row disappears; DB: marker `is_cancelled = 1`; `product_lots.qty_on_hand` unchanged; audit `stock_movements` row with `qty_change = 0` | ☐ |
| 10 | Bundle: create bundle B with component C (stock 0); sell B → `/manage/negative-stock` lists C (component) not B; receive C → reconcile works | ☐ |
| 11 | Partial reconcile: outstanding 10, receive 3 → reconcile → marker `qty = 7`, `available_stock = 0`; receive 7 → reconcile → marker gone | ☐ |
| 12 | Float qty: sell 0.5 of a unit with `qty_per_base = 3` → base shortfall 1.5; receive 1.5 → reconcile → marker DELETEs (no floating-point ghost) | ☐ |
| 13 | **Void-before-reconcile:** create oversell → void the sale from `/manage` (Sales tab) → badge decrements; `/manage/negative-stock` no longer lists it; DB: marker `is_cancelled = 1` | ☐ |
| 14 | Defense in depth: `UPDATE sales SET status = 'voided' WHERE id = <some sale with marker>` directly in DB → reload `/manage/negative-stock` → marker hidden | ☐ |
| 15 | Cancelled-lot exclusion: `UPDATE product_lots SET is_cancelled = 1 WHERE id = <lot with qty_on_hand > 0>`; that lot's qty must NOT contribute to `available_stock`, and reconcile must NOT deduct from it | ☐ |
| 16 | Badge refresh across all five sites: POS save / Purchase save / void (any source) / reconcile / dismiss — badge value matches `SELECT COUNT(*) FROM sale_item_lots WHERE lot_id IS NULL AND is_cancelled = 0` after each | ☐ |
| 17 | Collapsed sidebar: dot indicator shows on the "/manage" icon when count > 0; tooltip text includes count | ☐ |

**Verdict:** ☐ Pass · ☐ Fail · Notes:

---

## F. Regression guard — things that must NOT have changed

These are anti-checks. If any of these changed, raise a flag — the implementer may have over-reached.

- ☐ `electron/ipc/pos.ts:deductFefo()` body is byte-for-byte the same (silent oversell still allowed)
- ☐ `src/pages/POS/cartAlerts.ts` is unchanged
- ☐ POS cart submit flow: still no confirmation modal for "selling into negative" (decision Q1)
- ☐ Toast primitive (`src/components/ui/toast.tsx`) is unchanged (the feature works with the existing API — no action button added)
- ☐ No new tables, no new columns added to `sale_item_lots` / `product_lots` / `stock_movements` / `sales`
- ☐ Migration block in `purchase.ts`'s `ALTER TABLE / CREATE TABLE` loop is unchanged
- ☐ `recomputeAvgCost` / `propagateCostToBundles` signatures unchanged
- ☐ No new colour tokens added to `src/index.css` (we only used existing `warning` / `success` / `destructive` tokens)

**Verdict:** ☐ Pass · ☐ Fail · Notes:

---

## G. Build & type safety

- ☐ `npx tsc --noEmit -p tsconfig.json` → exit 0
- ☐ `npx tsc --noEmit -p tsconfig.node.json` → exit 0
- ☐ App launches via `npm run electron:dev` (no IPC handler registration errors in DevTools console)
- ☐ No new `console.error` spam on startup or during the smoke flow

**Verdict:** ☐ Pass · ☐ Fail · Notes:

---

## H. Audit handover

Auditor must reply with:

1. **Overall verdict** — Pass / Pass with notes / Fail
2. **Critical findings** (must-fix before ship)
3. **Minor findings** (nice-to-fix)
4. **Anything that surprised you** — undocumented design choices, code that goes beyond the plan, or plan items that were silently dropped

Save the response at `docs/audits/negative-stock-reconciliation_audit_<source>.md` (e.g. `_audit_gpt2.md`, `_audit_gemini2.md`).
