# POS Cart — Expiry/Stock Alerts + Bundle Expansion

## Context

The POS cart currently shows products as flat rows with no signal about lot health. Cashiers can sell items whose only available lot expires next week, or whose total stock is less than what the customer is buying, with no in-line warning. Bundles render as a single row with no way to see their components in the cart — components live in `item.product.bundle_items[]` but are never surfaced.

Two changes:
1. **Per-row alert icons** in the cart for: expired / <3 months / <6 months to expiry / insufficient stock (cart qty > available). Thresholds and on/off flags are user-configurable under a new **Settings → การขาย** tab so they can be tuned and the section can grow over time.
2. **Bundle expand toggle** on the row number cell — click `▸` to reveal sub-rows listing the bundle's components (read-only).

## Approach

### Part 1 — Sales settings (singleton table, mirrors `label_settings`)

**New table** in `electron/db/schema.ts` (next to `label_settings`):

```sql
CREATE TABLE IF NOT EXISTS sales_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expiry_alert_enabled    INTEGER NOT NULL DEFAULT 1,
  expiry_warn_months      INTEGER NOT NULL DEFAULT 6,
  expiry_danger_months    INTEGER NOT NULL DEFAULT 3,
  expired_alert_enabled   INTEGER NOT NULL DEFAULT 1,
  low_stock_alert_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

Designed so future POS options (e.g. default discount, rounding, payment defaults) drop in as new columns without a fresh table.

**IPC handlers** in `electron/ipc/settings.ts` — copy the `getLabelSettings` / `saveLabelSettings` shape exactly (lines 174–189):
- `settings:getSalesSettings` → `SELECT * FROM sales_settings LIMIT 1`, insert default row on first call if missing.
- `settings:saveSalesSettings` → upsert (same `Object.keys(rest)` dynamic UPDATE pattern).

**Preload bridge** in `electron/preload.ts` (after line 99):
```ts
getSalesSettings: () => ipcRenderer.invoke('settings:getSalesSettings'),
saveSalesSettings: (data: any) => ipcRenderer.invoke('settings:saveSalesSettings', data),
```

**Type** in `src/types/index.ts` — add `SalesSettings` interface mirroring columns above.

### Part 2 — Settings tab `การขาย`

**New file** `src/pages/Settings/SalesTab.tsx` — copy the `LabelSettingsTab.tsx` skeleton (singleton load + buffered form + save toast).

**Important — form keys must match DB columns 1:1.** `LabelSettingsTab` has historic key drift (`paper_width` ↔ `width_mm`) that required a manual mapping layer before `saveLabelSettings`. The dynamic `Object.keys(rest)` UPDATE in the IPC handler treats unknown keys as columns and will throw `no such column: X`. For `SalesTab` use the DB column names verbatim as the `form` state keys: `expiry_alert_enabled`, `expiry_warn_months`, `expiry_danger_months`, `expired_alert_enabled`, `low_stock_alert_enabled`.

Layout under one `SectionCard` titled "การแจ้งเตือนในตะกร้า":

- `<Toggle framed="input" label="แจ้งเตือนเมื่อสินค้าใกล้หมดอายุ" … />` (`expiry_alert_enabled`) — `Toggle` from `@/components/ui/switch` is the canonical framed-row pattern (label-left + switch-right), not a bare `Switch`.
- 2 numeric `<Input type="number" />` (months) inside a nested `<div>`: เหลือกี่เดือน (warn) / กี่เดือน (danger) — `disabled` when expiry alert is off.
- `<Toggle framed="input" label="แจ้งเตือนสินค้าหมดอายุแล้ว" … />` (`expired_alert_enabled`)
- `<Toggle framed="input" label="แจ้งเตือนสต๊อกไม่พอ" … />` (`low_stock_alert_enabled`)

Wire into `src/pages/Settings/index.tsx`:
- Import `SalesTab` and a lucide icon (e.g. `ShoppingCart`).
- Add `<TabsTrigger value="sales">` between `drugtypes` and `labels`.
- Add `{tab === 'sales' && <SalesTab />}` in the body switch.

### Part 3 — Alert computation helper

**New file** `src/pages/POS/cartAlerts.ts` — colocated pure helper (no `src/lib/` exists yet; matches existing per-page colocation in `POS/`).

```ts
type AlertLevel = 'expired' | 'low_stock' | 'danger' | 'warn'
type CartAlert = { level: AlertLevel; reason: string } | null

function getCartItemAlert(item: CartItem, settings: SalesSettings, today: Date): CartAlert
```

Logic (severity highest-wins; tooltip text in Thai). Use `dayjs` for all date math — `dayjs(expiry_date).isBefore(today, 'day')` is whole-day-precise and avoids midnight edge cases where a same-day expiry flips on its final day:

1. **expired** (if `expired_alert_enabled`): soonest open-lot `dayjs(expiry_date).isBefore(today, 'day')`.
2. **low_stock** (if `low_stock_alert_enabled`): the cart quantity must be normalized to the **base unit** before comparing to lot stock. Lot `qty_on_hand` is in base units; cart `qty` is in `selectedUnit` (or base when `selectedUnit` is undefined). Computation:
   ```ts
   const factor = item.selectedUnit?.qty_per_base ?? 1   // base = 1
   const soldBaseQty = item.qty * factor
   const stockBaseQty = (product.lots ?? []).reduce((s, l) => s + l.qty_on_hand, 0)
   const isLowStock = soldBaseQty > stockBaseQty
   ```
   For bundles: cart `qty` is in bundles; per component, required base qty = `item.qty * c.qty_per_bundle`, compared to `sum(c.lots[].qty_on_hand)`. If any component fails → `low_stock` (tooltip names the component).
3. **danger** (if `expiry_alert_enabled`): soonest open-lot `dayjs(expiry_date).isBefore(today.add(expiry_danger_months, 'month'), 'day')`.
4. **warn** (if `expiry_alert_enabled`): soonest open-lot `dayjs(expiry_date).isBefore(today.add(expiry_warn_months, 'month'), 'day')`.

For **bundles**, evaluate per component (`item.product.bundle_items[].lots[]`) and take the most severe across all components — explains why a bundle is flagged ("Paracetamol หมดอายุ 2026-08-01").

Data is already available — `pos:searchProducts` returns `product.lots[]` (FEFO order) and `product.bundle_items[].lots[]` (`electron/ipc/pos.ts:59–127`). No new IPC needed.

### Part 4 — Cart rendering (`src/pages/POS/index.tsx`)

**Settings loading**: add `useState<SalesSettings | null>` + `useEffect` on mount → `window.api.settings.getSalesSettings()`. Reload after returning from settings is out of scope (rare; user can refresh).

**Alert icon** in the product-name cell (line 898–900) — prefix the `<div>` with a `<Tooltip>`-wrapped lucide icon. `TooltipProvider` already wraps the app in `src/App.tsx:45`, so no extra plumbing.

Icon + color mapping:

| Level     | Icon (lucide)   | Color class             |
|-----------|------------------|-------------------------|
| expired   | `AlertOctagon`   | `text-destructive`      |
| low_stock | `PackageX`       | `text-destructive`      |
| danger    | `AlertTriangle`  | `text-warning-strong`   |
| warn      | `AlertCircle`    | `text-warning`          |

Render inline in the cart row — no helper component (CLAUDE.md: "No local UI components in page files"):

```tsx
<TableCell className="min-w-0 pr-2">
  <div className="font-medium truncate text-sm flex items-center gap-1.5">
    {alert && (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={alertColorClass(alert.level)}>
            {alert.level === 'expired'   && <AlertOctagon  className="size-4" />}
            {alert.level === 'low_stock' && <PackageX      className="size-4" />}
            {alert.level === 'danger'    && <AlertTriangle className="size-4" />}
            {alert.level === 'warn'      && <AlertCircle   className="size-4" />}
          </span>
        </TooltipTrigger>
        <TooltipContent>{alert.reason}</TooltipContent>
      </Tooltip>
    )}
    <span className="truncate">{item.item_name}</span>
  </div>
</TableCell>
```

`alertColorClass` is a one-line `switch` returning the class string — colocated in `cartAlerts.ts` (it's a pure utility, not JSX, so the page-file rule doesn't apply).

**Bundle expand toggle** — add local state at the POS component:
```ts
const [expandedBundles, setExpandedBundles] = useState<Set<number>>(new Set())
```
Keyed by cart row `idx`. Toggle on click.

**Index drift on remove (HARD).** `CartItem` has no stable id (`src/types/index.ts:125–131`); when `cart.removeItem(idx)` shifts the array, the kept-around `Set<number>` would point at the wrong rows. Wrap the existing delete handler at line 952 so it remaps the Set: drop `idx` itself, and decrement every key `> idx` by one. Keep this wrapper inline in the POS component (the cart-store change to add a `uid` field is out of scope for this PR).

```ts
const removeCartItem = (idx: number) => {
  setExpandedBundles(prev => {
    const next = new Set<number>()
    prev.forEach(k => { if (k < idx) next.add(k); else if (k > idx) next.add(k - 1) })
    return next
  })
  cart.removeItem(idx)
  refocusSearch()
}
```

Replace the `#` cell content (line 897) for bundles using the `<Button>` primitive (CLAUDE.md: no raw `<button>`). `size="icon-lg"` is the square-cell action style used throughout the app; combined with `variant="ghost"` and `className="w-full"` it fills the column without overflowing the row:

```tsx
<TableCell className="text-center text-sm text-muted-foreground p-0">
  {item.product?.is_bundle ? (
    <Button
      variant="ghost"
      size="icon-lg"
      onClick={() => toggleExpand(idx)}
      title={isExpanded ? 'ย่อรายการ' : 'ขยายรายการ'}
      className="w-full h-8 gap-0.5 rounded"
    >
      {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      <span className="tabular-nums">{idx + 1}</span>
    </Button>
  ) : (
    <>{idx + 1}</>
  )}
</TableCell>
```

If the `h-8` override doesn't sit cleanly inside the row, the correct remediation is to add a smaller variant to `button.tsx` (matches the existing `icon-xs` / `icon-sm` ladder), not to drop to a raw `<button>`.

**Sub-rows for expanded bundles** — after the bundle `<TableRow>`, conditionally render a sub-row per component:

```tsx
{item.product?.is_bundle && isExpanded && item.product.bundle_items?.map((c, ci) => (
  <TableRow key={`${idx}-c-${ci}`} className="bg-muted/30 hover:bg-muted/40 [&_td]:py-1">
    <TableCell />
    <TableCell className="pl-6 text-xs text-foreground-subtle truncate">
      • {c.component_name}
    </TableCell>
    <TableCell className="text-center text-xs text-foreground-subtle">
      {c.component_unit_name}
    </TableCell>
    <TableCell className="text-center text-xs text-foreground-subtle tabular-nums">
      {c.qty_per_bundle * item.qty}
    </TableCell>
    <TableCell colSpan={4} />
  </TableRow>
))}
```

`text-xs` is permitted per CLAUDE.md for "ข้อความที่รองจากเนื้อหา". Sub-rows have no editable controls — pricing/discount belong to the bundle parent.

## Critical files

- `electron/db/schema.ts` — add `sales_settings` table (next to `label_settings` around line 405)
- `electron/ipc/settings.ts` — add `getSalesSettings` / `saveSalesSettings` handlers (mirror lines 174–189)
- `electron/preload.ts` — expose IPC on `window.api.settings` (after line 99)
- `src/types/index.ts` — add `SalesSettings` interface (near `CartItem` at line 125)
- `src/pages/Settings/SalesTab.tsx` — **new file** (mirror `LabelSettingsTab.tsx`)
- `src/pages/Settings/index.tsx` — register tab (lines 12, 19–25, 29–33)
- `src/pages/POS/cartAlerts.ts` — **new file** (pure alert helper)
- `src/pages/POS/index.tsx` — load settings, alert icon prefix (line 898), `#`-cell chevron + sub-rows (line 897 + after 957)

## Reused utilities

- `pos:searchProducts` already returns `product.lots[]` (FEFO) and `product.bundle_items[].lots[]` — no new IPC needed for alert computation.
- `LabelSettingsTab.tsx` is the canonical singleton-settings tab — copy its **load/save/toast structure** but use DB column names verbatim for form keys (see Part 2 note).
- `Tooltip` / `TooltipTrigger` / `TooltipContent` (`@/components/ui/tooltip`) — `TooltipProvider` already mounted in `App.tsx:45`.
- `Toggle` (`@/components/ui/switch`) — framed label-left + switch-right row, the canonical settings-form control.
- `Input`, `SectionCard`, `Tabs`, `Button` (`variant="ghost" size="icon-lg"`).
- `dayjs` (already a dependency: `package.json` v1.11.11) for date-precise expiry comparisons.
- Lucide icons: `AlertOctagon` (new import), `AlertTriangle`, `AlertCircle`, `PackageX` (new imports in POS/index.tsx), `ChevronRight`, `ChevronDown` (already imported). `ShoppingCart` for the new tab trigger.

## Verification

1. **Settings tab loads & saves**: `npm run electron:dev`, open Settings → การขาย, toggle switches and edit thresholds, click "บันทึก", reload the app — values persist (singleton row in `sales_settings`).
2. **Alert: expired** — manually edit a `product_lots` row to set `expiry_date = '2025-01-01'`, add that product to cart, confirm red `AlertOctagon` icon appears with tooltip "หมดอายุแล้ว …".
3. **Alert: warn / danger** — set lot expiry within 5 months / 2 months of today (2026-05-21 → 2026-10-15 / 2026-07-15), confirm yellow `AlertCircle` / orange `AlertTriangle` respectively.
4. **Alert: low_stock** — pick a product with total open-lot qty = 3, set cart qty to 5, confirm red `PackageX`.
5. **Alert respects toggles** — turn off "เปิดใช้แจ้งเตือนใกล้หมดอายุ" in settings; warn/danger icons vanish on cart but expired & low-stock remain (separate flags).
6. **Bundle expand** — add a bundle to cart, click the `▸` next to its row number; verify component sub-rows appear with correct `qty_per_bundle × bundle_qty`, no editable cells. Click `▾` to collapse.
7. **Bundle alert propagation** — set one component lot to expire in 2 months; confirm the bundle parent row shows a danger icon and the tooltip names the offending component.
8. **Low-stock with non-base unit** — sell a product in "แผง" where `qty_per_base = 10`: cart qty 1 (= 10 base) against a product with `qty_on_hand = 5` base → red `PackageX` shows. Cart qty 1 against stock 20 → no alert. Confirms the `qty * qty_per_base` normalization.
9. **Expand state stability on remove** — add 3 items to cart (bundle at idx 0, regular at idx 1, bundle at idx 2). Expand bundle at idx 2. Delete the regular item at idx 1. The bundle previously at idx 2 (now idx 1) should remain expanded; the bundle at idx 0 should remain in its original state. (Validates the Set remap in `removeCartItem`.)
10. **No regression** — sale flow (`บันทึก & ปริ้น`), unit/qty/price/discount modals, customer search all still work.
