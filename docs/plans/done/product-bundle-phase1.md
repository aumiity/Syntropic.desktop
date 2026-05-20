# Product Bundle (ชุดสินค้า) — Phase 1

## Context

Operator wants to sell **ชุดสินค้า** (e.g. *ชุดยาแก้ปวด* = Ibuprofen ×1 + Norgesic ×1) as **one cart line** with its own barcode / retail+wholesale price / unit / dispensing label, while still deducting each component's stock correctly (FEFO) and supporting **void + return exactly like a single product**. "Just create a standalone product" was rejected — component stock wouldn't move.

The data model from PROGRESS.md "Session 2026-05-19c" is preserved (one `products` row with `is_bundle=1` + N rows in new `product_bundle_items` table), but the **UI strategy is revised per operator**:

- Bundles are **separated** in the UI — own tab on Products page + dedicated `EditBundle` page
- Existing `EditProduct` stays untouched (no `is_bundle` toggle, no Lots-tab hiding)
- Regular products list never mixes with bundles

**Load-bearing assumption verified** (`electron/ipc/reports.ts:145-173`): `voidSale` restores by `sale_item_lots.product_id` (independent column), so writing 1 `sale_items` row (bundle) + N `sale_item_lots` rows (each tagged with the component's `product_id`) makes void work for free, with zero code change in reports.ts.

**`qty_per_base` FEFO fix** (commit `3a4b16e`) confirmed present at `electron/ipc/pos.ts:150`.

## Locked design decisions

| Topic | Decision |
|---|---|
| Data model | `products.is_bundle INTEGER DEFAULT 0` + new `product_bundle_items(bundle_id, component_product_id, qty_per_bundle, sort_order, …)` |
| Bundle row shape | `is_bundle=1`, `is_stock_item=0` (no own lots) |
| Price | **Manual** on bundle row (`price_retail / price_wholesale1 / price_wholesale2`) |
| Cost | **Auto** = `Σ(component.cost_price × qty_per_bundle)` — propagates when any component cost changes |
| Stock on hand | **Derived** = `MIN(component_open_stock ÷ qty_per_bundle)` — never below 0 |
| Overselling | Allowed (same as single products) — short component → `sale_item_lots.lot_id = NULL` |
| Return | Whole bundle only — Phase 2 |
| Nested bundles | Not allowed — validate at save (`component.is_bundle === 0`) |
| Units | v1 bundle is sold in **base unit only** (no non-base bundle units) |
| Codes | v1 reuses the `P` product sequence — separate `B` prefix is out of scope |
| Mutability | Bundles are **immutable as bundles** — no toggle in/out. Created via "+ เพิ่มชุดสินค้า" only |
| Component picker | Extend `products:list` with `is_bundle` filter param (vs. dedicated IPC) |
| Cost recompute | **Extract `recomputeAvgCost` to a shared module** (`electron/db/pricing.ts`) — currently duplicated **4×** across products.ts + purchase.ts. Add `recomputeBundleCost` + `propagateCostToBundles` next to it. |
| Page split | `/products` becomes Tabs (สินค้า / ชุดสินค้า), each tab is its own list component |
| Routes (match existing convention) | `/products/bundles/new` + `/products/bundles/:id/edit` (mirrors existing `/products/new` + `/products/:id/edit` from App.tsx:50-51) |
| Labels reuse | EditBundle imports `EditProduct/LabelsTab.tsx` as-is |
| Guards | (a) Cross-redirect bundle/non-bundle in EditProduct vs EditBundle; (b) **Backend reject `is_bundle=1` in all stock/lot handlers** — defense in depth, not just UI hiding |
| Bundle unit | `"ชุด"` already in `item_units` seed (`electron/db/seed.ts:79`) — no new seeding |

## Implementation steps

### A. Schema — `electron/db/schema.ts`

1. Add `is_bundle INTEGER NOT NULL DEFAULT 0` inside `CREATE TABLE products` next to `is_stock_item` (line ~93–94).
2. Add `CREATE TABLE IF NOT EXISTS product_bundle_items` after `product_units` block (after line 137):
   ```sql
   CREATE TABLE IF NOT EXISTS product_bundle_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     bundle_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     component_product_id INTEGER NOT NULL REFERENCES products(id),
     qty_per_bundle       REAL NOT NULL DEFAULT 1,
     sort_order           INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
     UNIQUE(bundle_id, component_product_id)
   );
   CREATE INDEX IF NOT EXISTS idx_pbi_bundle ON product_bundle_items(bundle_id);
   CREATE INDEX IF NOT EXISTS idx_pbi_component ON product_bundle_items(component_product_id);
   ```
3. Add safe-ALTER migration in try/catch block (line ~505): `ALTER TABLE products ADD COLUMN is_bundle INTEGER NOT NULL DEFAULT 0`.

### B. Shared pricing helpers — NEW `electron/db/pricing.ts`

**Why a new file**: `recomputeAvgCost`-shape SQL is currently inlined **4 times** across 2 files:
- `electron/ipc/products.ts:357` (named `recomputeAvgCost` inside `products:adjustStock`)
- `electron/ipc/products.ts:760` (inlined in `products:updateLot`)
- `electron/ipc/purchase.ts:210` (inlined in `purchase:save` GR path)
- `electron/ipc/purchase.ts:454` (inlined in `purchase:cancel` GR-cancel path)

Extracting to a shared module gives one place to add `propagateCostToBundles` so the bundle cost stays in sync on every cost-changing event.

Create `electron/db/pricing.ts`:
```typescript
import type { Database } from 'better-sqlite3'

// Weighted-avg cost of OPEN lots — must run for every cost-changing event.
export function recomputeAvgCost(db: Database, productId: number): void {
  const agg = db.prepare(`
    SELECT COALESCE(SUM(qty_received * cost_price), 0) AS cost_sum,
           COALESCE(SUM(qty_received), 0)              AS qty_sum
    FROM product_lots
    WHERE product_id = ? AND qty_received > 0 AND is_closed = 0
  `).get(productId) as { cost_sum: number; qty_sum: number }
  if (agg.qty_sum > 0) {
    db.prepare(`UPDATE products SET cost_price = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(agg.cost_sum / agg.qty_sum, productId)
  }
}

// Bundle cost = Σ(component.cost_price × qty_per_bundle). Also mirrors
// to last_cost_price for UI consistency (so "ราคาทุนล่าสุด" displays right).
export function recomputeBundleCost(db: Database, bundleId: number): void {
  const r = db.prepare(`
    SELECT COALESCE(SUM(c.cost_price * bi.qty_per_bundle), 0) AS total
    FROM product_bundle_items bi
    JOIN products c ON c.id = bi.component_product_id
    WHERE bi.bundle_id = ?
  `).get(bundleId) as { total: number }
  db.prepare(`
    UPDATE products
       SET cost_price = ?, last_cost_price = ?, updated_at = datetime('now','localtime')
     WHERE id = ?
  `).run(r.total, r.total, bundleId)
}

// When a component's cost changes, recompute every bundle that contains it.
export function propagateCostToBundles(db: Database, componentId: number): void {
  const bundles = db.prepare(
    `SELECT DISTINCT bundle_id FROM product_bundle_items WHERE component_product_id = ?`
  ).all(componentId) as Array<{ bundle_id: number }>
  for (const b of bundles) recomputeBundleCost(db, b.bundle_id)
}
```

All 4 inlined SQL sites replace their local block with:
```typescript
recomputeAvgCost(db, productId)
propagateCostToBundles(db, productId)
```

Affects: `products.ts` lines 354–366 (delete the named fn) + 757–769 + `purchase.ts` lines 207–218 + 450–462.

### C. Backend — `electron/ipc/products.ts`

1. Import the 3 helpers from `electron/db/pricing.ts`.
2. **Replace** the inlined cost recompute at lines 354–366 (in `products:adjustStock`) and 757–769 (in `products:updateLot`) with `recomputeAvgCost(db, pid) + propagateCostToBundles(db, pid)`. All 3 call sites in adjustStock (lines 412, 461, 514) now call the shared helper.
3. **`products:create`** (lines 190–236): add `is_bundle` to INSERT columns (line 205) + VALUES (line 214) + named-param mapping. Defaults to `0` when missing.
4. **`products:list`** (lines 5–78):
   - SELECT add `p.is_bundle`
   - SELECT add `(SELECT COUNT(*) FROM product_bundle_items WHERE bundle_id = p.id) AS component_count` (returns `0` for non-bundles — used by `BundlesList` "ส่วนประกอบ" column)
   - New optional payload key `is_bundle?: 0 | 1` — when defined, add `AND p.is_bundle = @is_bundle` to WHERE
   - Wrap the existing `stock_qty` subquery in:
     ```sql
     CASE WHEN p.is_bundle = 1 THEN
       COALESCE((
         SELECT MIN(CAST(
           (SELECT COALESCE(SUM(qty_on_hand),0) FROM product_lots
            WHERE product_id = bi.component_product_id AND is_closed = 0) / bi.qty_per_bundle
         AS INTEGER))
         FROM product_bundle_items bi WHERE bi.bundle_id = p.id
       ), 0)
     ELSE <existing-subquery>
     END
     ```
   - **`stock_filter='out' | 'low'`**: when combined with `is_bundle=1`, evaluate the filter against the bundle-derived expression (not the plain SUM). Simplest: refactor `stockExpr` into the same `CASE WHEN` form and reuse it everywhere. (Defense-in-depth — BundlesList won't use these filters, but the IPC stays correct.)
5. **`products:stockStats`** (lines 80–115): add `is_bundle?: 0 | 1` filter param. Default behavior unchanged (no filter = count everything → would mis-classify bundles as "out"). **`ProductsList` MUST pass `is_bundle: 0`** to get correct "out" / "low" counts; BundlesList skips this IPC entirely (the bundle tab has different summary needs — derived stock totals).
   - **Also gate `total_all`** (lines 110–112) by the same `is_bundle` param — currently it's a separate `SELECT COUNT(*) FROM products` that ignores the filter, so the "สินค้าทั้งหมด" stat card would slightly over-count by the number of bundles when ProductsList passes `is_bundle: 0`. Add `AND is_bundle = @is_bundle` when defined.
6. **`products:lowStock`** (lines 120–162): hardcode `AND p.is_bundle = 0` in the WHERE clause. The `reorder_point > 0` filter already excludes bundles in practice (bundles have no reorder_point set), but the explicit guard makes intent clear.
7. **`products:get`** (lines 164–188): when `product.is_bundle = 1`, attach `bundle_items` array via a join that returns: `bi.*` + component `trade_name` + component `unit_name` (via `LEFT JOIN item_units u ON u.id = c.unit_id`) + component `cost_price` + component open-lot sum (as `component_stock`). `ORDER BY bi.sort_order, bi.id`.
8. **New** `ipcMain.handle('products:getBundleItems', (_, bundleId) => …)` — same query shape as the attachment in step 7.
9. **New** `ipcMain.handle('products:saveBundleItems', (_, bundleId, items) => …)` — in **one transaction**:
   - Validate `bundleId` references an `is_bundle=1` row (defense against direct IPC abuse).
   - For each `items[i]`: validate `component_product_id` exists, `is_bundle=0`, `is_disabled=0`, and `qty_per_bundle > 0` (throw with field-specific error for each).
   - `DELETE FROM product_bundle_items WHERE bundle_id = ?`
   - Re-insert each row with explicit `sort_order` (1..n by array order)
   - Call `recomputeBundleCost(db, bundleId)` from shared helper

### C′. Backend guards — reject bundles in stock/lot handlers (still products.ts)

Defense in depth for the "bundles are not stock items" invariant. Each handler below adds an early check `if (SELECT is_bundle FROM products WHERE id=?) === 1 → throw new Error('ทำรายการสต็อกกับชุดสินค้าไม่ได้')`:

| Handler | File:line | Why |
|---|---|---|
| `products:adjustStock` | products.ts:336 | Bundles have no lots |
| `products:adjustLot` | products.ts:601 | Bundles have no lots |
| `products:adjustLotBatch` | products.ts:637 | Bundles have no lots |
| `products:updateLot` | products.ts:678 | Bundles have no lots |
| `products:getLots` | products.ts:592 | Optional — could just return empty array; throwing makes accidental bug visible |

### D. Backend — `electron/ipc/purchase.ts`

Import shared helpers from `electron/db/pricing.ts`. Replace both inlined cost-recompute blocks:
- Lines 207–218 (in `purchase:save` GR path) — after the receive transaction, for each touched product call `recomputeAvgCost(db, productId) + propagateCostToBundles(db, productId)`
- Lines 450–462 (in `purchase:cancel` GR-cancel path) — same pattern after stock-restoration

This is the critical fix from audit Source 2 — without these calls, **GR / GR-cancel would skip bundle cost propagation entirely**, leaving bundle prices stale until the next adjustStock fires on a component.

### E. Backend — `electron/ipc/pos.ts`

1. **Extract** the FEFO loop (lines 142–163 of `pos:saveBill`) into a module-scope helper:
   ```typescript
   const deductFefo = (
     db: any, productId: number, baseQty: number,
     saleItemId: number, saleId: number, invoiceNo: string, soldBy: number,
   ) => { /* identical loop body; oversell branch keeps lot_id NULL */ }
   ```
   The helper accepts **base-unit qty** (caller multiplies by `qty_per_base`).

   **Preserve existing POS behavior** (audit minor #4): the FEFO loop in `saveBill` **does NOT auto-close lots** at `qty_on_hand=0` — FEFO queries filter `qty_on_hand > 0 AND is_closed=0` already, so the open-but-empty lot is invisible until adjustStock/updateLot toggles `is_closed`. Don't add auto-close in the extracted helper.

2. **`pos:saveBill` item loop** (lines 76–182):
   - Resolve `prod = SELECT is_bundle FROM products WHERE id = ?`
   - If `prod.is_bundle === 0`: `deductFefo(db, item.product_id, item.qty * (item.qty_per_base ?? 1), saleItemId, …)` — unchanged behavior
   - If `prod.is_bundle === 1`: load `product_bundle_items` for the bundle; for each component call `deductFefo(db, comp.component_product_id, comp.qty_per_bundle * item.qty, saleItemId, …)` (no `qty_per_base` multiplier — v1 bundles are base-unit-only, the helper's caller still owns the math)
   - `sale_items` row is **always** the bundle (1 row, bundle's product_id + bundle price) — receipt and reports see one line
3. **`pos:searchProducts`** (lines 8–52):
   - SELECT add `p.is_bundle`
   - In the loop that attaches `prod.lots` + `prod.units`, also attach:
     - If `prod.is_bundle`: `prod.bundle_items` = same shape as `products:get` returns, **plus** each item also gets `lots: ProductLot[]` (so POS cost preview can FEFO-walk component lots without a second IPC round-trip)

### F. Backend — `electron/preload.ts`

In `products` namespace add (after `getLots` block):
```typescript
getBundleItems: (bundleId: number) => ipcRenderer.invoke('products:getBundleItems', bundleId),
saveBundleItems: (bundleId: number, items: any[]) => ipcRenderer.invoke('products:saveBundleItems', bundleId, items),
```

### G. Frontend types — `src/types/index.ts`

```typescript
export interface ProductBundleItem {
  id: number
  bundle_id: number
  component_product_id: number
  qty_per_bundle: number
  sort_order: number
  // Joined display fields
  component_name?: string
  component_unit_name?: string
  component_cost?: number
  component_stock?: number
  lots?: ProductLot[]     // attached only in pos:searchProducts payload, for cost preview
}
```
Extend `Product`:
```typescript
is_bundle: number
bundle_items?: ProductBundleItem[]
```

### H. Frontend — Products page tabs split

**Restructure `src/pages/Products/index.tsx`** following the `src/pages/Manage/index.tsx` precedent:
- `<PageHeader title="สินค้า" />` + `<Tabs>` (สินค้า / ชุดสินค้า) + `<Outlet />`
- Routes register two children (App.tsx step below)
- Provide outlet context if both tabs need to share helpers (probably not needed — they're independent)

**Extract** the current product-list body to `src/pages/Products/ProductsList.tsx`:
- IPC call: `products.list({ ...filters, is_bundle: 0 })`
- Everything else unchanged
- Add/edit routes to `/products/new` and `/products/edit/:id`

**Create** `src/pages/Products/BundlesList.tsx`:
- Same standard table-card layout (top bar `h-14 px-2`, bottom bar `h-12 px-5`)
- IPC call: `products.list({ q, is_bundle: 1, limit, page })`
- Toolbar: search input + "+ เพิ่มชุดสินค้า" button (no category/drug-type chips — N/A for bundles)
- Columns: `# / รหัส / barcode / ชื่อชุด / ส่วนประกอบ (count) / ราคาขาย / ต้นทุน (auto) / สต็อกประกอบได้ / [edit btn]`
- Add bundle dialog (quick-add): name + barcode → calls `products.create({ trade_name, barcode, is_bundle: 1, is_stock_item: 0, unit_id: <ชุด> })` → navigate to `/products/bundles/edit/:id`

**`App.tsx` route updates** (match the existing convention from App.tsx:49-51):

Current convention is `path/new` and `path/:id/edit`. Mirror it for bundles.

```tsx
<Route path="products" element={<ProductsLayout />}>
  <Route index element={<ProductsList />} />
  <Route path="bundles" element={<BundlesList />} />
</Route>
<Route path="products/new" element={<EditProduct />} />          {/* unchanged */}
<Route path="products/:id/edit" element={<EditProduct />} />      {/* unchanged */}
<Route path="products/bundles/new" element={<EditBundle />} />    {/* NEW */}
<Route path="products/bundles/:id/edit" element={<EditBundle />} />  {/* NEW */}
```

React Router v6 scores `path/bundles/new` higher than the nested `path="bundles"` inside ProductsLayout — `/products/bundles/new` correctly lands on EditBundle, not BundlesList. (Verify during impl.)

**Cross-redirect guards** (in each page's load effect):
- `EditProduct`: if loaded product `is_bundle === 1` → `<Navigate to={\`/products/bundles/\${id}/edit\`} replace />`
- `EditBundle`: if loaded product `is_bundle === 0` → `<Navigate to={\`/products/\${id}/edit\`} replace />`

### I. Frontend — NEW `src/pages/Products/EditBundle/`

Directory mirrors `EditProduct/` but with reduced surface. Files:

**`index.tsx`** — Tabs layout
- Loads the bundle via `products.get(id)` (returns row + `bundle_items[]`)
- Header row of MetricCards: trade_name card | price retail | cost (auto) | derived stock
- Tabs (`segmented` variant):
  - `general` — `<FileText />` ข้อมูลทั่วไป
  - `price` — `<Tag />` ราคา
  - `components` — `<Boxes />` ส่วนประกอบ (count)
  - `labels` — `<Pill />` ฉลาก (count)
- doSave allow-list (explicit, NOT `...rest`): build payload with only fields the bundle uses (see GeneralTab below). Always force `is_bundle: 1, is_stock_item: 0` in the payload.

**`GeneralTab.tsx`** — bundle-appropriate fields only
- `trade_name` (required), `name_for_print`
- 4 barcodes (`barcode/2/3/4`) with same uniqueness validation as EditProduct
- `code` (auto-generated on create, editable display)
- `category_id` (optional Select)
- `unit_id` Select (defaults to "ชุด" or first available; bundles are base-unit-only in v1)
- `has_vat` Toggle
- `note` Textarea
- `search_keywords` Input
- Status: `is_disabled` Toggle (existing pattern)
- **Excluded fields** (don't render): `is_stock_item`, `is_drug`, `drug_type_id`, `tmt_id`, `is_antibiotic`, `is_fda9/10/11/13`, `reorder_point`, `safety_stock`, `last_cost_price`, drug indication/side-effect notes, drug_generic_name_id

**`PriceTab.tsx`**
- `price_retail` (required, editable)
- `price_wholesale1`, `price_wholesale2` (editable)
- `cost_price` **read-only** display (auto-computed) + small "อัปเดตเมื่อราคาทุนของส่วนประกอบเปลี่ยน" hint
- Live profit % preview (`(price_retail - cost_price) / price_retail`)

**`ComponentsTab.tsx`** — the heart of the feature
- Props: `{ product: FullProduct, productId: number, onRefresh: () => Promise<void> }` (matches `UnitsTab` contract)
- Local state: `items: ProductBundleItem[]` (seeded from `product.bundle_items`)
- Standard table-card layout:
  - **Top bar** (`h-14 px-2`): autocomplete search input — debounced calls `products.list({ q, is_bundle: 0, limit: 20 })` and renders a dropdown of matches. Click result → appends to `items` with `qty_per_bundle=1`. Auto-skips components already in the list. Plus a `Button size="lg" variant="info-soft"` "จัดลำดับ" (drag mode toggle — same Categories pattern).
  - **Table**: drag handle (sort_order) | component name | base unit | `qty_per_bundle` Input | cost each | stock on hand | delete `Button size="icon-lg" variant="destructive"`
  - Drag-reorder via `SortableTableBody / SortableRow` (`src/components/ui/sortable.tsx`)
  - **Bottom bar** (`h-12 px-5`): auto-total `ต้นทุนรวม ฿X.XX` (computed live from `Σ comp_cost × qty_per_bundle`) + Save button → `products.saveBundleItems(productId, items)` → `await onRefresh()`
- Empty state: lucide icon + "ยังไม่มีส่วนประกอบ — ค้นหาแล้วเพิ่มจากด้านบน"
- Drafts are local until Save (no auto-persist on each change). Operator's pattern from CategoriesTab snapshot/cancel/save.

**Labels tab** — `import { LabelsTab } from '../EditProduct/LabelsTab'`. The `product_labels` table is product-agnostic; the existing tab works as-is. If `LabelsTab` props type narrows to `FullProduct`, just pass it (a bundle is a `FullProduct` row).

### J. Frontend — POS — `src/pages/POS/index.tsx`

1. **Cost preview** (lines 1375–1398, the `cart.items.reduce(...)`):
   After computing `lineCost` for the single-product FEFO branch, **also** handle the bundle case:
   ```typescript
   if (i.product?.is_bundle && i.product.bundle_items) {
     // bundle: FEFO-walk EACH component's lots; reuse the same lotRemaining Map
     for (const bi of i.product.bundle_items) {
       let cmpRemaining = bi.qty_per_bundle * i.qty  // base units of this component
       for (const lot of bi.lots ?? []) {
         if (cmpRemaining <= 0) break
         if (!lotRemaining.has(lot.id)) lotRemaining.set(lot.id, lot.qty_on_hand)
         const avail = lotRemaining.get(lot.id)!
         if (avail <= 0) continue
         const take = Math.min(avail, cmpRemaining)
         lineCost += take * lot.cost_price
         lotRemaining.set(lot.id, avail - take)
         cmpRemaining -= take
       }
       if (cmpRemaining > 0) lineCost += cmpRemaining * (bi.component_cost ?? 0)
     }
   }
   ```
   (`bi.lots` requires the `pos:searchProducts` attachment from step C.3.)

2. **Cart row breakdown** (lines 1461–1471, inside the cart `.map(item => …)` in payment modal):
   After the line_total row, conditionally insert:
   ```tsx
   {item.product?.is_bundle && item.product.bundle_items?.length ? (
     <div className="text-xs text-muted-foreground">
       ประกอบด้วย: {item.product.bundle_items
         .map(b => `${b.component_name} ×${b.qty_per_bundle}`)
         .join(', ')}
     </div>
   ) : null}
   ```

3. **Cart unit dialog** — `changeCartUnit` does NOT need logic changes: v1 bundles are base-unit-only, so `product.units` is empty → the unit dialog only shows the synthetic base entry. **But the chevron/button that opens the unit picker should be HIDDEN when `product.is_bundle === 1`** (it would render an interactive control that produces only one useless option). Audit Source 2 minor #1.

4. **Search modal** — handled automatically: `flatItems` already emits `{ product, unit: null }` for the base entry. Bundles have no non-base units to emit. `handleSelectItem(p, null)` works unchanged.

## Code reuse

| Reuse | Where | Why |
|---|---|---|
| `recomputeAvgCost` (extracted to `electron/db/pricing.ts`) | products.ts adjustStock/updateLot + purchase.ts GR/GR-cancel | Single source of truth — replaces 4 inlined duplicates |
| `recomputeBundleCost` / `propagateCostToBundles` (`electron/db/pricing.ts`) | Called immediately after every `recomputeAvgCost` invocation | Bundle cost stays in sync with components automatically |
| `deductFefo` (extracted from `pos:saveBill`) | Single + bundle component sales in saveBill | qty_per_base / oversell logic in one place |
| `products:list` (extended with `is_bundle` filter + bundle-aware stockExpr) | ProductsList (`is_bundle:0`), BundlesList (`is_bundle:1`), ComponentsTab component picker (`is_bundle:0`) | Same filter+pagination machinery |
| `EditProduct/LabelsTab.tsx` | Imported as-is by EditBundle | `product_labels` is product-agnostic |
| `SortableTableBody / SortableRow` (`src/components/ui/sortable.tsx`) | ComponentsTab drag reorder | Same pattern as Settings CategoriesTab |
| `Manage/index.tsx` Tabs+Outlet pattern | New Products page Tabs | Already-proven layout |
| Standard table-card top/bottom bar (Session 2026-05-20) | BundlesList, ComponentsTab | Showcase-tracked pattern |
| Seeded `"ชุด"` unit (`electron/db/seed.ts:79`) | Default `unit_id` for newly-created bundles | No new seeding required |

## Verification

After implementing all sections, run `npm run electron:dev` and verify end-to-end:

1. **Create bundle** — `/products` → tab "ชุดสินค้า" → "+ เพิ่มชุดสินค้า" → name "ชุดยาแก้ปวด" + barcode → save → routed to EditBundle. Add Ibuprofen ×1 + Norgesic ×1 → set retail+wholesale → save. Verify `cost_price` updates to `Σ(component cost × qty_per_bundle)` and `last_cost_price` mirrors it.
2. **Bundle list** — derived `stock_qty` shows MIN(component capacities). Search by name finds the bundle. The regular "สินค้า" tab does NOT show this row. ProductsList summary cards ("สินค้าหมดสต็อก" / "สินค้าใกล้หมด") do NOT inflate (`stockStats({ is_bundle: 0 })` excludes bundles).
3. **POS sell** — scan bundle barcode → 1 cart line at bundle price → "ประกอบด้วย: Ibuprofen ×1, Norgesic ×1" sub-text visible. Cart row's unit chevron is **hidden** (bundle is base-only). Pay. DB check:
   - `sales` row created (status='completed')
   - `sale_items`: **1** row, `product_id = bundle_id`, `unit_price = bundle price`
   - `sale_item_lots`: **≥2** rows, each with the **component's** `product_id` + correct FEFO lot
   - `product_lots.qty_on_hand` decreases on the components, NOT the bundle
   - `stock_movements`: 'sale' rows per component
4. **Oversell** — manually starve Ibuprofen via adjust → still sells; `sale_item_lots` has a `lot_id IS NULL` row for the Ibuprofen remainder.
5. **Profit** — Manage/Sales detail shows: bundle line, `line_total` = bundle price, `cost` = Σ component-lot cost, `profit` = correct.
6. **Void** — POS → "ยกเลิกบิล" → enter invoice → ConfirmDialog with reason → confirm. Both components' `qty_on_hand` restored; `stock_movements` 'sale_return' per component; `sales.status='voided'`. **Zero code change in reports.ts — this verifies the load-bearing assumption.**
7. **Cost propagation — GR path** — Purchase page: GR a new Ibuprofen lot at a higher cost → reopen the bundle in EditBundle → `cost_price` reflects the new component cost (proves `purchase.ts` calls the shared helper).
8. **Cost propagation — adjust path** — adjustStock on Ibuprofen (different cost) → bundle `cost_price` updates (proves `products.ts:adjustStock` calls the shared helper).
9. **Cost propagation — lot edit path** — edit a lot's cost via EditProduct → LotsTab on Ibuprofen → bundle `cost_price` updates (proves `products.ts:updateLot` calls the shared helper).
10. **Cross-redirect guards** — manually navigate to `/products/<bundleId>/edit` → bounces to `/products/bundles/<bundleId>/edit`. And vice versa.
11. **Nested-bundle rejection** — try to add a bundle as a component of another bundle → search filter hides it; if forced via direct payload, backend `saveBundleItems` throws.
12. **Disabled component rejection** — disable Ibuprofen → try to add to a bundle via direct payload → throws (search dropdown excludes disabled by default already).
13. **`qty_per_bundle > 0` validation** — try saveBundleItems with `qty_per_bundle: 0` → throws with field-specific error.
14. **Backend stock-handler guards** — invoke `products.adjustStock` / `adjustLot` / `updateLot` directly via DevTools on a bundle id → throws "ทำรายการสต็อกกับชุดสินค้าไม่ได้".
15. `npx tsc --noEmit` — must stay green (baseline is clean as of last session).

## Out of scope for Phase 1

- SaleDetailDialog whole-bundle return (Phase 2)
- Per-component partial return
- Bundles sold in non-base units (e.g. "แพ็ค 3 ชุด")
- FDA propagation through bundles to อย. reports (Phase 5)
- Bundle dispensing label = merge of components' labels (Phase 2+)
- B-prefix code sequence (v1 reuses P-sequence)
- Re-classifying an existing product as a bundle, or unbundling
- Reorder UI inside ComponentsTab (drag-reorder is included; explicit "Move up/down" buttons are out)

## Known limitations carried forward

- **Oversell + void leaves the NULL-lot row uncancelled** (audit Source 1 #3): when a sale oversells, `sale_item_lots` writes a row with `lot_id IS NULL` for the remainder. `reports:voidSale` only iterates rows with `lot_id IS NOT NULL`, so the NULL row stays "owed" after void. This is a **pre-existing limitation for single products** — bundles inherit it via component oversell. Out of scope to fix in Phase 1 (would need a separate write-off mechanism). Flag for the operator if they hit it.

## Critical files to modify / create

**Modify:**
- `electron/db/schema.ts` — add `is_bundle` column, `product_bundle_items` table, migration ALTER
- `electron/ipc/products.ts` — switch cost recompute to shared helper, add bundle filter + stockExpr to list/stockStats/lowStock, add bundle IPCs, **add `is_bundle=1` rejection guards** in 5 stock/lot handlers
- `electron/ipc/purchase.ts` — switch cost recompute to shared helper (2 sites: GR + GR-cancel), so bundle costs propagate after every GR / GR-cancel
- `electron/ipc/pos.ts` — extract `deductFefo`, branch on bundle in `saveBill`, attach `bundle_items` (with lots) in `searchProducts`
- `electron/preload.ts` — bind `getBundleItems` / `saveBundleItems`
- `src/types/index.ts` — `Product.is_bundle`, `Product.bundle_items`, `ProductBundleItem` types
- `src/pages/Products/index.tsx` — convert to Tabs layout with Outlet
- `src/pages/POS/index.tsx` — bundle cost preview + cart row component breakdown + hide unit chevron for bundles
- `src/App.tsx` — register `/products/bundles` (list), `/products/bundles/new`, `/products/bundles/:id/edit`
- `src/pages/Products/EditProduct/index.tsx` — add cross-redirect guard when `is_bundle === 1`

**Create:**
- `electron/db/pricing.ts` — shared `recomputeAvgCost` + `recomputeBundleCost` + `propagateCostToBundles` (replaces 4 inlined SQL duplicates)
- `src/pages/Products/ProductsList.tsx` — extracted from old `Products/index.tsx`
- `src/pages/Products/BundlesList.tsx` — bundle list view
- `src/pages/Products/EditBundle/index.tsx` — Tabs layout + load + save
- `src/pages/Products/EditBundle/GeneralTab.tsx` — bundle-appropriate fields
- `src/pages/Products/EditBundle/PriceTab.tsx` — retail/wholesale; cost is read-only auto
- `src/pages/Products/EditBundle/ComponentsTab.tsx` — component picker + table + drag-reorder

**Unchanged (but referenced):**
- `electron/ipc/reports.ts` (voidSale — no edit, but its restore loop at lines 145-173 is load-bearing for bundles)
- `src/pages/Products/EditProduct/LabelsTab.tsx` (imported by EditBundle)
- `src/components/ui/sortable.tsx`
- `electron/db/seed.ts` (no edit — `"ชุด"` already seeded at line 79)
