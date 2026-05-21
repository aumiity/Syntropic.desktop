# Plan: Negative-Stock Sales & Retroactive Stock Deduction

> **Revision 2** — incorporates fixes from Gemini and GPT audits (`docs/audits/`). Critical issues found: `stock_movements.product_id NOT NULL` was missing from example SQL, void-sale path leaves `lot_id=NULL` markers orphaned, FEFO queries must exclude `is_cancelled=1` lots, and floating-point qty comparison needs an epsilon.

## Context

In the pharmacy, system stock sometimes reads `0` for a product whose physical stock has just arrived at the shop — the operator hasn't yet entered the GR. A customer wants to buy that product *now*; the operator needs to ring the sale immediately, then enter the GR later and reconcile.

**`deductFefo()` in `electron/ipc/pos.ts:19-55` already supports oversell.** When it exhausts open lots before satisfying the requested qty, it writes a single `sale_item_lots` row with `lot_id = NULL` to mark the unfulfilled remainder (no `stock_movements` row, since there is no lot to attribute it to).

What's missing:

1. **Visibility** — NULL markers sit in the DB unnoticed.
2. **Reconciliation flow** — when stock arrives via GR, nothing connects the new lot to the outstanding marker.
3. **Operator UX** — no UI to see what's outstanding or to decide what to do (deduct retroactively vs. dismiss).

**Goal:** Keep silent oversell on the POS path. When a GR comes in, surface affected products via a toast plus a badge on the "ประวัติ & สต็อก" (`/manage`) sidebar item. From a new `/manage/negative-stock` page, the operator can either:

- **"ตัดสต๊อคย้อนหลัง" (Reconcile)** — FEFO-deduct outstanding qty from current open lots, write proper `stock_movements`, replace the NULL marker with real `lot_id` references.
- **"ลบรายการ" (Dismiss)** — set `sale_item_lots.is_cancelled = 1` on the marker without touching inventory (no reason text required).

## Decisions

| Question | Decision |
|---|---|
| POS behavior when selling beyond stock | Allow silently (existing behavior — no extra dialog) |
| GR-time notification | Toast (5000 ms) + numeric badge on the "ประวัติ & สต็อก" sidebar entry |
| Page location | New tab inside `/manage` |
| Dismiss requires a reason? | No — confirm dialog only |
| Sidebar badge state | Zustand store (locked, not "Option A/B"). See §10. |
| Lot lifecycle | **Reconcile MUST match current `deductFefo()` semantics — do NOT auto-close a lot when `qty_on_hand` hits 0.** That belongs to `adjustStock`/`updateLot`, not the FEFO path. Reconcile still calls `recomputeAvgCost` because lot `qty_received` weights still need to reflect the current pool (defensive — cheap, idempotent). |

## Data model

**No new tables.**

- **Marker** = `sale_item_lots` row where `lot_id IS NULL AND is_cancelled = 0`.
  - `is_cancelled` already exists on `sale_item_lots` (schema.ts:278-285).
  - `deductFefo()` writes at most one marker per `sale_item` (the trailing remainder).
- **Bundles handled automatically** — `deductFefo()` tags `sale_item_lots.product_id` with the *component's* product_id (not the bundle's). All queries join on `sale_item_lots.product_id`.
- **Reconcile** = walk current open *non-cancelled* lots FEFO → insert new `sale_item_lots` rows with real `lot_id` → decrement (or delete) the NULL marker → write `stock_movements`.
- **Dismiss** = `UPDATE sale_item_lots SET is_cancelled = 1` on the NULL marker + insert a zero-qty `stock_movements` audit row.

## Backend changes

### 1. `electron/ipc/purchase.ts` — extend `purchase:save`

Inside the existing transaction (handler at lines 86-221), **after** `recomputeAvgCost` + `propagateCostToBundles` (around line 217), query for outstanding markers among the affected products:

```sql
SELECT sil.product_id,
       p.trade_name,
       COUNT(*)                 AS marker_count,
       COALESCE(SUM(sil.qty),0) AS total_qty
FROM sale_item_lots sil
JOIN sale_items si ON si.id = sil.sale_item_id
JOIN sales      s  ON s.id  = si.sale_id
JOIN products   p  ON p.id  = sil.product_id
WHERE sil.lot_id IS NULL
  AND sil.is_cancelled = 0
  AND si.is_cancelled  = 0
  AND s.status = 'completed'                      -- exclude voided sales (audit fix)
  AND sil.product_id IN (?, ?, ...)               -- affectedIds from the GR
GROUP BY sil.product_id, p.trade_name
```

Extend return:

```ts
{
  success: true,
  invoice_no,
  negative_stock_alerts: Array<{
    product_id: number; trade_name: string;
    marker_count: number; total_qty: number;
  }>
}
```

### 2. `electron/ipc/reports.ts` — fix `voidSale` (audit GPT — Critical)

The current `voidSale` (lines 167-204) restores stock for `sale_item_lots` where `lot_id IS NOT NULL`. NULL markers are skipped — leaving them as ghosts that the new negative-stock page would still surface for a voided sale.

**Fix:** inside the same transaction, also cancel NULL markers for this sale:

```ts
db.prepare(`
  UPDATE sale_item_lots
     SET is_cancelled = 1
   WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id = ?)
     AND lot_id IS NULL
     AND is_cancelled = 0
`).run(id)
```

(Defense in depth — the negative-stock queries also filter `s.status = 'completed'`, so even pre-fix legacy data won't surface. But the cancel keeps the marker semantically correct.)

Also call the badge-refresh store after voiding (see §10).

### 3. `electron/ipc/negativeStock.ts` — new file, four handlers

**Important — every `stock_movements` INSERT must include `product_id` (NOT NULL).** The schema's INSERT shape, mirroring `electron/ipc/pos.ts:42-46`:

```
(product_id, lot_id, movement_type, ref_type, ref_id,
 qty_change, qty_before, qty_after, unit_cost, note, created_by)
```

```ts
// 'negativeStock:list' → NegativeStockRow[]
//
// SELECT
//   sil.id, sil.sale_item_id, sil.product_id, sil.qty,
//   si.sale_id, s.invoice_no, s.sold_at,
//   COALESCE(cust.full_name, 'ลูกค้าทั่วไป') AS customer_name,
//   p.code AS product_code, p.trade_name,
//   u.name AS unit_name,
//   (SELECT COALESCE(SUM(qty_on_hand), 0)
//      FROM product_lots
//     WHERE product_id  = sil.product_id
//       AND is_closed   = 0
//       AND is_cancelled = 0                                 -- audit fix
//   ) AS available_stock
// FROM sale_item_lots sil
// JOIN sale_items si  ON si.id  = sil.sale_item_id
// JOIN sales      s   ON s.id   = si.sale_id
// JOIN products   p   ON p.id   = sil.product_id
// LEFT JOIN item_units u ON u.id = p.unit_id
// LEFT JOIN customers cust ON cust.id = s.customer_id
// WHERE sil.lot_id      IS NULL
//   AND sil.is_cancelled = 0
//   AND si.is_cancelled  = 0
//   AND s.status         = 'completed'                       -- audit fix
// ORDER BY s.sold_at ASC, sil.id ASC

// 'negativeStock:count' → number
//
// Same WHERE as above. Used by the sidebar badge store.

// 'negativeStock:reconcile' ({ id, userId }) → { success, deducted_qty, remaining_qty }
//
// db.transaction:
//   const EPS = 1e-9                                          -- audit fix (floats)
//
//   1) Load marker:
//        SELECT sil.id, sil.sale_item_id, sil.product_id, sil.qty,
//               si.sale_id, s.invoice_no, s.status
//          FROM sale_item_lots sil
//          JOIN sale_items si ON si.id = sil.sale_item_id
//          JOIN sales      s  ON s.id  = si.sale_id
//         WHERE sil.id = ? AND sil.lot_id IS NULL AND sil.is_cancelled = 0
//      throw if missing OR if s.status != 'completed'.
//
//   2) Walk open lots FEFO (matches deductFefo pattern; adds is_cancelled filter):
//        SELECT * FROM product_lots
//         WHERE product_id   = ?
//           AND qty_on_hand  > 0
//           AND is_closed    = 0
//           AND is_cancelled = 0                              -- audit fix
//         ORDER BY CASE WHEN expiry_date IS NULL
//                       THEN '9999-99-99' ELSE expiry_date END ASC
//
//   3) For each lot until remaining <= EPS:
//        const deduct = Math.min(lot.qty_on_hand, remaining)
//        const qtyBefore = lot.qty_on_hand
//        UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = lot.id
//        INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty)
//             VALUES (orig.sale_item_id, lot.id, orig.product_id, deduct)
//        INSERT INTO stock_movements
//             (product_id, lot_id, movement_type, ref_type, ref_id,
//              qty_change, qty_before, qty_after, unit_cost, note, created_by)
//             VALUES (?, ?, 'sale', 'sale', ?,
//                     ?, ?, ?, ?, ?, ?)
//          [ product_id = orig.product_id
//          ; lot_id     = lot.id
//          ; ref_id     = orig.sale_id
//          ; qty_change = -deduct
//          ; qty_before, qty_after, unit_cost = lot.cost_price
//          ; note       = `ตัดสต๊อคย้อนหลัง: ${orig.invoice_no}`
//          ; created_by = userId ]
//        remaining -= deduct
//
//      -- NOTE: do NOT toggle is_closed when qty_on_hand hits 0. POS FEFO does
//      -- not auto-close, and this path must match. (Audit fix.)
//
//   4) Marker upkeep (epsilon-safe):
//        if (remaining <= EPS)
//          DELETE FROM sale_item_lots WHERE id = orig.id
//        else
//          UPDATE sale_item_lots SET qty = ? WHERE id = orig.id   -- remaining
//
//   5) recomputeAvgCost(db, orig.product_id)
//      propagateCostToBundles(db, orig.product_id)
//      -- Defensive: weighted avg uses sum(qty_received * cost_price)/sum(qty_received)
//      -- with is_closed = 0; since we don't toggle is_closed here, the value
//      -- typically won't change. Still cheap to call and keeps consistency.
//
// return { success: true, deducted_qty: (orig.qty - max(remaining, 0)), remaining_qty: max(remaining, 0) }

// 'negativeStock:dismiss' ({ id, userId }) → { success }
//
// db.transaction:
//   1) SELECT sil.product_id, sil.sale_item_id, si.sale_id, s.status
//        FROM sale_item_lots sil
//        JOIN sale_items si ON si.id = sil.sale_item_id
//        JOIN sales      s  ON s.id  = si.sale_id
//       WHERE sil.id = ? AND sil.lot_id IS NULL AND sil.is_cancelled = 0
//      throw if missing OR s.status != 'completed'.
//
//   2) UPDATE sale_item_lots SET is_cancelled = 1 WHERE id = ?
//
//   3) Audit movement row (lot_id = NULL is valid in schema):
//        INSERT INTO stock_movements
//             (product_id, lot_id, movement_type, ref_type, ref_id,
//              qty_change, qty_before, qty_after, unit_cost, note, created_by)
//             VALUES (?, NULL, 'sale', 'sale', ?, 0, 0, 0, 0,
//                     'ลบรายการขายติดลบโดยไม่ตัดสต๊อค', ?)
//          [ product_id, ref_id = sale_id, created_by = userId ]
```

### 4. `electron/main.ts` — register handlers

Add `registerNegativeStockHandlers()` after `registerPurchaseHandlers()`.

### 5. `electron/preload.ts` — expose IPC

```ts
negativeStock: {
  list:      () => ipcRenderer.invoke('negativeStock:list'),
  count:     () => ipcRenderer.invoke('negativeStock:count'),
  reconcile: (payload: { id: number; userId: number }) =>
               ipcRenderer.invoke('negativeStock:reconcile', payload),
  dismiss:   (payload: { id: number; userId: number }) =>
               ipcRenderer.invoke('negativeStock:dismiss', payload),
}
```

## Frontend changes

### 6. `src/types/index.ts`

```ts
export interface NegativeStockRow {
  id: number                // sale_item_lots.id (the NULL marker)
  sale_item_id: number
  sale_id: number
  invoice_no: string
  sold_at: string
  customer_name: string
  product_id: number
  product_code: string
  trade_name: string
  unit_name: string
  qty: number               // outstanding qty (base units)
  available_stock: number   // sum qty_on_hand of open non-cancelled lots NOW
}
```

### 7. `src/App.tsx` — route

Inside the `/manage` outlet (after line 66):

```tsx
<Route path="negative-stock" element={<ManageNegativeStock />} />
```

Plus `const ManageNegativeStock = lazy(() => import('./pages/Manage/NegativeStock'))`.

### 8. `src/pages/Manage/index.tsx` — tab

Append to `TABS` (lines 10-15):

```ts
{ value: 'negative-stock', to: '/manage/negative-stock',
  label: 'สต๊อคติดลบ', icon: PackageMinus }
```

Extend `resolveTab()` (lines 19-24). Import `PackageMinus` from `lucide-react`.

### 9. `src/pages/Manage/NegativeStock.tsx` — new page

Mirror the shape of `src/pages/Manage/LowStock.tsx`. Key rules (from CLAUDE.md "Standard table-card layout"):

- Outer wrapper: `bg-card rounded-card shadow-card overflow-hidden`
- Top header bar (`h-12 px-5`, `bg-card`, no border)
- `<thead>` cells: `sticky top-0 z-10 bg-muted text-foreground-subtle shadow-[0_1px_0_var(--border)]`
- Row hover: `hover:bg-primary-soft/60 transition-colors`
- Bottom status bar: `h-12 px-5 bg-card border-t border-border`
- Columns use `min-w-*` (never `w-*`/`table-fixed`)
- Use `useOutletContext<ManageOutletContext>()` + one `StatCard` summary: label "รายการค้างทั้งหมด", value `rows.length`, tint `warning`

Columns: เลขที่บิล | วันที่ขาย | ลูกค้า | รหัสสินค้า | ชื่อสินค้า | จำนวนค้าง (with unit) | สต๊อกปัจจุบัน | การจัดการ

Action cell — flex row of square icon buttons:

- `<Button size="icon-lg" variant="success" title="ตัดสต๊อคย้อนหลัง">` → `PackageCheck` icon → opens reconcile confirm dialog. Disable when `available_stock <= 0` and tooltip explains why.
- `<Button size="icon-lg" variant="destructive2" title="ลบรายการโดยไม่ตัดสต๊อค">` → `Trash2` icon → opens dismiss confirm dialog.

Confirm dialogs follow the Modal interaction contract: `<DialogHeader>` + `<DialogTitle>`, `<DialogBody>`, `<DialogFooter>`. No outside-click close, Esc closes, Enter triggers primary OK. Cancel button uses `variant="destructive2"`.

After every successful action: reload list + toast result + call `useNegativeStockBadge.refresh()` (see §10).

Empty state inside `<TableCell colSpan>`: `PackageCheck` icon (`size-10 opacity-30`) + "ไม่มีรายการสต๊อคติดลบค้างอยู่", `py-16`.

### 10. Sidebar badge — Zustand store (locked)

**Create `src/stores/negativeStockBadge.ts`:**

```ts
import { create } from 'zustand'

interface NegativeStockBadgeState {
  count: number
  refresh: () => Promise<void>
}

export const useNegativeStockBadge = create<NegativeStockBadgeState>((set) => ({
  count: 0,
  refresh: async () => {
    try {
      const c = await window.api.negativeStock.count()
      set({ count: c ?? 0 })
    } catch { /* swallow — badge is non-critical */ }
  },
}))
```

**Wire `refresh()` calls from these sites:**

| Site | When |
|---|---|
| `src/components/layout/Sidebar.tsx` | Once on mount (the badge owner) |
| `src/pages/POS/index.tsx` | After `pos:saveBill` succeeds |
| `src/pages/Purchase/index.tsx` | After `purchase:save` succeeds (regardless of toast) |
| `src/pages/Manage/NegativeStock.tsx` | After every reconcile/dismiss |
| `src/pages/Manage/Sales.tsx` | After void completes (to catch the voidSale path) |

**`src/components/layout/Sidebar.tsx` — render the badge:**

The sidebar already exposes a "ประวัติ & สต็อก" (`to: '/manage'`) item. Identify the nav item by `to === '/manage'` (not by label string — the label is "ประวัติ & สต็อก", which is shared between the sidebar entry and the page header). Render `<Badge variant="warning">{count}</Badge>` next to the label when `count > 0`.

**Collapsed-sidebar visibility (Gemini suggestion):** when the sidebar is in icon-only mode, surface the count via the existing tooltip wrapper used by the nav items (append `(${count})` to the tooltip text) plus a small dot indicator on the icon. Implementation: check whether the sidebar already has a collapse state; if not, the dot is the minimum acceptable surface — extend the Tooltip primitive later if needed.

### 11. `src/pages/Purchase/index.tsx` — toast after GR save

After `window.api.purchase.save()` returns with `negative_stock_alerts.length > 0`:

```ts
const head = alerts[0].trade_name
const more = alerts.length > 1 ? ` (+${alerts.length - 1})` : ''
toast(
  `สินค้า ${head}${more} มียอดติดลบรอตัด — กดเมนู "ประวัติ & สต็อก" เพื่อตรวจสอบ`,
  'info',
  5000,                       // audit fix: 5000ms, not 8000ms
)
```

Then call `useNegativeStockBadge.getState().refresh()`.

> Future: extend the toast primitive with a clickable action so the toast itself navigates to `/manage/negative-stock`. Out of scope for v1 — the badge is the wayfinding.

## What does NOT change

- **`deductFefo()`** — silent oversell is correct; matches the Q1 decision.
- **`src/pages/POS/cartAlerts.ts`** — the existing red "สต๊อกไม่พอ" cart alert is sufficient.
- **Lot lifecycle (`is_closed` semantics)** — reconcile must NOT auto-close lots; it matches POS FEFO behavior. Any change to lot-close lifecycle is a separate cross-cutting refactor and is explicitly out of scope.

## Files to touch

| File | Change |
|---|---|
| `electron/ipc/purchase.ts` | Inside `purchase:save` (~line 217): outstanding-marker query (joined to sales for `status='completed'` filter) + extend return shape |
| `electron/ipc/reports.ts` | `voidSale` (lines 167-204): cancel NULL markers for the voided sale inside the same transaction |
| `electron/ipc/negativeStock.ts` | **NEW** — `list`/`count`/`reconcile`/`dismiss` |
| `electron/main.ts` | Register `registerNegativeStockHandlers()` |
| `electron/preload.ts` | Expose `window.api.negativeStock.*` |
| `src/types/index.ts` | `NegativeStockRow` |
| `src/stores/negativeStockBadge.ts` | **NEW** — Zustand store with `count` + `refresh()` |
| `src/App.tsx` | Route + lazy import |
| `src/pages/Manage/index.tsx` | Tab entry + `resolveTab()` branch |
| `src/pages/Manage/NegativeStock.tsx` | **NEW** page |
| `src/pages/Purchase/index.tsx` | Post-save toast (5000 ms) + badge refresh |
| `src/pages/POS/index.tsx` | Badge refresh after `pos:saveBill` |
| `src/pages/Manage/Sales.tsx` | Badge refresh after void completes |
| `src/components/layout/Sidebar.tsx` | Render badge + dot for collapsed mode (locate item by `to === '/manage'`) |

## Reuse from existing code

- **FEFO loop pattern** — copy the shape from `electron/ipc/pos.ts:28-48` (cannot reuse the function — signature differs; we need to derive `sale_id`/`invoice_no` from a JOIN, not parameters).
- **`recomputeAvgCost` + `propagateCostToBundles`** from `electron/db/pricing.ts`.
- **`stock_movements` INSERT column order** — match `electron/ipc/pos.ts:42-46` and `electron/ipc/purchase.ts:190-194` exactly.
- **Toast** — `useToast()` from `src/components/ui/toast.tsx`.
- **Standard table-card / square icon-button rules** — `CLAUDE.md` + pattern from `src/pages/Manage/Sales.tsx`.
- **Dialog primitives & Modal interaction contract** — `src/components/ui/dialog.tsx`.
- **Walk-in fallback** — `COALESCE(cust.full_name, 'ลูกค้าทั่วไป')` covers legacy rows; new sales carry C0000.

## Verification — end-to-end test plan

Run `npm run electron:dev`.

1. **Sell into negative (silent)**
   - POS: pick a product with total open-lot qty = 0; cart shows red "สต๊อกไม่พอ" alert; save bill.
   - DB: `SELECT * FROM sale_item_lots WHERE sale_item_id = <last>` → one row with `lot_id IS NULL`, `qty = shortfall`.

2. **Badge appears**
   - Sidebar's "ประวัติ & สต็อก" entry shows numeric badge.

3. **`/manage/negative-stock` lists the row**
   - Click the new tab → row appears, `available_stock = 0`. "ตัดสต๊อคย้อนหลัง" button is disabled.

4. **GR triggers toast (5000 ms)**
   - Purchase: receive 10 units of the same product. Toast: "สินค้า X มียอดติดลบรอตัด...". Badge unchanged (still 1).
   - Return to `/manage/negative-stock` → `available_stock` now reflects new on-hand qty. Reconcile button enabled.

5. **Reconcile (full)**
   - Click "ตัดสต๊อคย้อนหลัง" → confirm. Toast confirms. Row disappears.
   - DB:
     - `sale_item_lots` for the original `sale_item_id` — new rows with real `lot_id`; qty totals match outstanding.
     - `product_lots.qty_on_hand` decreased correctly.
     - `stock_movements` — new row, `movement_type='sale'`, `product_id` set, note `'ตัดสต๊อคย้อนหลัง: RC-...'`.
   - Badge decreases by 1.

6. **Dismiss**
   - Create another oversell → "ลบรายการ" → confirm. Row disappears.
   - DB: `sale_item_lots.is_cancelled = 1` on marker; `product_lots.qty_on_hand` unchanged; `stock_movements` audit row with `qty_change=0`, `product_id` set, `lot_id=NULL`, note `'ลบรายการขายติดลบโดยไม่ตัดสต๊อค'`.

7. **Bundle case**
   - Bundle B with component C (stock 0). Sell B. Negative-stock row shows under C (the component), not B.
   - Receive C → toast fires → reconcile works.

8. **Partial reconcile (multi-pass)**
   - Outstanding qty 10; receive only 3 → reconcile → `available_stock=0`, marker `qty=7`.
   - Receive 7 more → reconcile → marker disappears.

9. **Floating-point qty (audit GPT)**
   - Sell qty `0.5` of a per-pack product where `qty_per_base=3` → base shortfall `1.5`. Receive `1.5` → reconcile → marker deletes cleanly (no `0.0000000001` ghost). Inspect `sale_item_lots` to confirm.

10. **Void sale with outstanding marker (audit GPT)**
    - Create an oversell. **Before reconciling**, void the sale from `/manage` (Sales).
    - `/manage/negative-stock` no longer lists the row. Badge decrements. DB: marker has `is_cancelled = 1`.

11. **Voided sale never appears (defense in depth)**
    - Manually toggle a `sale.status` to `'voided'` in DB (DevTools or sqlite); refresh `/manage/negative-stock` — that sale's markers must not appear (the WHERE filter blocks them).

12. **Cancelled lot is not used for reconcile (audit GPT)**
    - Manually set a `product_lots.is_cancelled = 1` with `qty_on_hand > 0`; reconcile a marker for that product — the cancelled lot must be skipped (FEFO query has `AND is_cancelled = 0`).

13. **Badge refresh on every entry point (audit GPT)**
    - Open the app fresh → badge hydrates correctly on mount.
    - After POS save / Purchase save / reconcile / dismiss / void — badge value matches `negativeStock:count`.
