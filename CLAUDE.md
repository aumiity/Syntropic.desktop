# Syntropic Desktop — Claude Context

## Project
Pharmacy POS desktop app. Electron 31 + React 18 + Vite 5 + TypeScript + better-sqlite3 + Tailwind + Zustand.
Rebuilt from a Laravel/Blade/MySQL PHP original at `D:\Syntropic.Project\Syntropic.php` (authoritative SQL: `syntropic_rx.sql`).

## Dev
```bash
npm run electron:dev
```
> Do NOT run `npm install` again — it will break the native sqlite3 binary.
> If node_modules is deleted, see PROGRESS.md for recovery steps.

---

## Architecture

| Layer | Location |
|-------|----------|
| Electron main | `electron/main.ts` |
| IPC handlers | `electron/ipc/*.ts` |
| Database | `electron/db/` (index.ts, schema.ts, seed.ts) |
| Preload bridge | `electron/preload.ts` → `window.api` |
| React pages | `src/pages/` |
| UI components | `src/components/ui/` |
| Types | `src/types/index.ts` |
| Stores | `src/stores/` (cartStore, themeStore) |

---

## Database

The runtime SQLite schema lives in `electron/db/schema.ts` — **always read it before writing save/update code**. The PHP `syntropic_rx.sql` is the *intent* spec, not what ships; the desktop schema is a strict subset with deliberate divergences:

- **Renamed:** `products.is_vat` → `has_vat`
- **Dropped from `products`:** `dosage_form_id`, `no_discount` (formerly `is_not_discount`), `unit_id` (formerly `unit_name`)
- **Added `products.is_drug`** (Hygeia-style): explicit "this product is a drug under the law" flag, gates the "ข้อมูลยา" section in EditProduct. `category` is purely for sorting/filtering. Migration backfills `is_drug=1` for products with a `drug_type_id`.
- **Base unit lives directly on `products`:** `products.unit_id` (FK → `item_units`) is the single source of truth for the base unit. `product_units` holds **only non-base variants** (แผง, กล่อง, …). `unit_name` for product list / POS / purchase / reports resolves via `LEFT JOIN item_units u ON u.id = p.unit_id`. There is no `is_base_unit` flag and no synthetic base row in `product_units`.
- **PHP-only, not in SQLite:** `default_qty`, `has_wholesale1`, `has_wholesale2`, `drug_generic_name_id`, `old_item_key`

`products:update` (and similar generic update handlers) builds dynamic SQL from `Object.keys(data)`. Any payload key that isn't a real column throws `no such column: X` and aborts the entire UPDATE. **Allow-list your save payload — never spread `...form` blindly.**

### Lookup tables (seeded on first run)
`drug_types`, `drug_generic_names` (~4253 rows), `drug_groups`, `dosage_forms`, `product_categories`, `label_frequencies`, `label_dosages`, `label_times`, `label_meal_relations`, `label_advices`.

---

## Key Business Logic

### FEFO (First Expiry First Out)
Used in `saveBill`. Deduct from lots ordered by `expiry_date ASC`. Create `sale_item_lots` rows linking each sale_item to specific lots. Span multiple lots if needed. Update `product_lots.qty_on_hand`. Log `stock_movements` (movement_type = 'sale').

### Stock receive (GR)
- Auto-generate `GR-YYYYMMDD-NNN` (sequential per day)
- Per line: product, lot_number, expiry_date, manufactured_date, cost_price, sell_price, qty
- Header: supplier_id, payment_type (cash/credit), due_date, supplier_invoice_no
- On save: insert `product_lots`, update `products.cost_price` (weighted avg across open lots), log `stock_movements` (`receive`)
- History grouped by `invoice_no`

### Running codes
Customers `C0001…`, suppliers `S0001…`, GR `GR-YYYYMMDD-001…`, sales `INV-YYYYMMDD-001…`.

### Barcode uniqueness
Products have 4 barcode fields (barcode, barcode2, barcode3, barcode4) plus `product_units.barcode`. Validate uniqueness across ALL of these before save.

### Pricing
- **Base unit prices live on `products`** — `price_retail`, `price_wholesale1`, `price_wholesale2`. Single source of truth, no mirroring.
- `has_wholesale1` / `has_wholesale2` flags (PHP-only, not in SQLite) historically gated whether wholesale prices were active. The desktop app shows a wholesale row in the price dialog only when its value is `> 0`.
- Non-base ProductUnit variants (แผง, กล่อง, …) own their own `price_*` / `barcode` / `qty_per_base` / `is_for_sale` / `is_for_purchase`. These override the products table when that unit is selected in POS.
- `cost_price` per lot; `products.cost_price` = weighted avg of open lots

### Base unit storage (HARD)
The base unit is `products.unit_id` — a plain FK column. `product_units` holds **only non-base variants**. There is no `is_base_unit` flag anywhere.
- **`products:create`** writes `unit_id` directly to the products row. Falls back to `'ชิ้น'` if the caller omits it.
- **`products:addUnit` / `updateUnit` / `deleteUnit`** all operate on non-base variants only. No special-case guards.
- **EditProduct units tab** renders a synthetic base row at the top (sourced from `product.unit_name` + `product.price_*`) followed by `product.units`. The base row has no edit/delete buttons — base unit pricing and unit selection are edited on the General tab (`unit_id` selector + the price inputs).
- **POS unit dialog** synthesizes a base entry with `id: -1` for display, then appends `product.units`. `changeCartUnit` detects `id === -1` and clears `selectedUnit` (so the cart pulls base prices from `product.*`). For non-base units, `selectedUnit` is set and the cart uses its `price_*`.
- **POS search modal** `flatItems` emits `{ product, unit: null }` first (base row) then one entry per non-base unit. `handleSelectItem(p, null)` sets `selectedUnit: undefined`.

### Cost/profit in reports
Record cost at sale time from lot cost_price. Profit = `line_total − (qty × lot cost_price)`.

### Void sale
Read `sale_item_lots`, restore qty to each `product_lots.qty_on_hand`, insert `stock_movements` (`sale_return`), set `sales.status = 'voided'`, store `void_reason`. Requires reason text.

### Customer fields
- Health coverage: `hc_uc` = บัตรทอง (UC), `hc_gov` = ข้าราชการ, `hc_sso` = ประกันสังคม (boolean flags)
- Alert: `is_alert` + `alert_note` + `warning_note` shown as warning during POS checkout
- Drug allergy: `drug_allergies` links customer to `drug_generic_names` (or free text via `drug_name_free`); has Naranjo score and severity

### Product label (pharmacy dispensing)
Each product can have multiple label templates combining dose_qty, frequency, meal_relation/timing, dosage, label_time, advice, multilingual indication+notes (Thai/Burmese/Chinese). Printed with `label_settings` singleton (paper size, fonts, spacing, row_styles JSON).

---

## IPC API (`window.api`)

| Namespace | Key methods |
|-----------|-------------|
| `pos` | searchProducts, searchCustomers, addCustomer, saveBill, getDailyStats |
| `products` | list, get, create, update, adjustStock, addUnit/updateUnit/deleteUnit, saveLabel/deleteLabel, searchGenericNames, getLots |
| `purchase` | nextGRNumber, save, history, getReceipt |
| `people` | customers CRUD, suppliers CRUD, staff/users CRUD, allSuppliers |
| `reports` | salesList, getSale, voidSale, purchaseList |
| `settings` | shopSettings, updateShopSettings, categories, itemUnits, drugTypes, dosageForms, allLabelLookups, labelSettings, updateLabelSettings |
| `printer` | printReceipt, openCashDrawer |

---

## UI Conventions

### Theming rules (HARD — do not break)
The app must be re-themable by editing one file (`src/index.css`). To keep that guarantee:

1. **Never use Tailwind palette literals for colors.** Forbidden: `bg-blue-500`, `text-slate-600`, `border-amber-200`, `from-red-50`, `hover:bg-emerald-100`, `ring-sky-400`, etc. Use semantic tokens only:
   - Brand: `bg-primary`, `bg-primary-soft`, `bg-primary-soft-hover`, `border-primary-soft-border`, `bg-primary-strong`, `text-primary-foreground`, `hover:bg-primary-hover`
   - Text: `text-foreground` (strong), `text-muted-foreground` (secondary), `text-foreground-subtle` (placeholder/disabled)
   - Surface: `bg-background`, `bg-card`, `bg-muted`, `bg-surface-hover`, `border-border`, `border-border-strong`
   - Status: `bg-success`/`bg-success-soft`/`text-success`, `bg-warning`/`bg-warning-soft`/`text-warning-strong`, `bg-destructive`/`bg-destructive-soft`/`text-destructive`
   - Sidebar: `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `text-sidebar-primary-foreground`
   - Opacity modifiers on semantic tokens are allowed: `bg-primary/30`, `border-warning/40`, `text-destructive/80`
2. **Need a token that doesn't exist? Add it.** Add the variable to BOTH `:root` and `.dark` in `src/index.css`, then register it under `colors` in `tailwind.config.js`. Token names describe the *role* (`--success`, `--primary-soft`) — never the shade (`--blue-500` is forbidden).
3. **No local UI components in page files (HARD).** Any JSX helper component defined at module scope inside `src/pages/` is forbidden — no exceptions. If it could be used in more than one place, add it to `src/components/ui/`. Available global helpers: `SectionCard` (card.tsx), `FormField` (label.tsx), `NativeSelect` (select.tsx), `Toggle` (switch.tsx). Before writing a new helper in a page file, check `src/components/ui/` first.
4. **Never write raw HTML UI elements.** Use `src/components/ui/` components exclusively:
   - `<button>` → `<Button variant="...">` — always, no exceptions
   - `<input>` → `<Input>`
   - `<select>` → use `Select` component or `<Input>` workaround
   - custom toggle div → `<Switch>`
   - raw dialog/modal → `<Dialog>` with `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogBody>`, `<DialogFooter>`
   - If a needed variant is missing, add it to the existing component file (e.g., new entry in `buttonVariants.variant`). Do not work around it with raw elements.
5. **Dialog structure is mandatory.** Every `<DialogContent>` must contain `<DialogHeader>` + `<DialogTitle>` (accessible title — Radix requirement), `<DialogBody>` (main content), `<DialogFooter>` (action buttons). Body layout inside `DialogBody` may use flex/grid as needed. Override default padding with `className` (twMerge handles conflicts).
6. **Modal interaction contract (HARD).** Applies to every modal — no exceptions.
   - **Outside-click does NOT close.** Already enforced inside `dialog.tsx` via `onPointerDownOutside`/`onInteractOutside` `preventDefault()`. Do NOT pass replacements that re-enable closing.
   - **Esc closes** (Radix default — leave on).
   - **Enter triggers the primary OK action** when the modal has one. For multi-step modals where Enter on a working input advances to the next step (e.g. POS return/adjust qty → "เพิ่มในรายการ"), that's fine; the final confirm still needs a click.
   - When adding a new modal, wire Enter on the primary input or via `onKeyDown` on the dialog body — call the same handler the OK button calls.
7. Tailwind utilities for layout/spacing/typography (`flex`, `gap-2`, `text-sm`, `rounded-xl`, `tabular-nums`) are encouraged — only **color literals** are banned.
8. **Icon sizing inside `<Button>` — use `size-N`, never `h-N w-N`.** `button.tsx` has `[&_svg:not([class*='size-'])]:size-4`, which silently snaps any descendant svg without `size-` in its className to 16px. `h-7 w-7` does not contain `size-`, so the rule still matches and — being more specific — overrides your value. Always write `<Icon className="size-7" />`, including arbitrary values (`size-[22px]`, not `h-[22px] w-[22px]`). Doesn't apply to icons in `<Input>`/`<Label>`/`<DialogTitle>`/plain `<div>`/raw `<button>` (not the Button component), or to the Button element's own outer dimensions.

### Other conventions
- Thai UI language throughout
- Inter + Sarabun fonts (Noto Sans Thai fallback); base font-size 15px
- Dark/light theme via CSS variables (toggled via themeStore)
- Frameless Electron window — `frame: false` in `electron/main.ts`. Custom `TitleBar.tsx` uses `WebkitAppRegion: 'drag' | 'no-drag'` inline styles and IPC via `window.api.window.{minimize,maximize,close,isMaximized}`.
- Toast notifications via `useToast()` hook
- Pagination: `pagination.tsx`
- Tables: `table.tsx` components.
  - **Sticky headers:** the `<Table>` wrapper renders `<div data-slot="table-container" className="… overflow-x-auto">`, which auto-promotes to a vertical scroll container too — meaning `sticky` on `<thead>` pins to *that* div, not the page-level scroll wrapper, so the header rides up with the rows. Fix: (a) on the parent, target the inner div via `[&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto` so it becomes the actual scroll element; (b) put `sticky top-0 z-10 bg-muted` on each `<th>` (NOT on `<thead>` — many renderers ignore sticky there). For a hairline that scrolls with the sticky cell, add `shadow-[0_1px_0_var(--border)]` per `<th>` (a plain `border-b` doesn't move with sticky and leaves a gap).
- **Standard table-card layout (Products list and EditProduct tabs):**
  - Outer wrapper: `bg-card rounded-2xl shadow-card overflow-hidden`
  - Inner header bar: `px-5 py-2.5 text-sm font-semibold text-muted-foreground flex items-center justify-between` — left = description/count, right = Add button (`h-9 rounded-lg px-2 text-sm` with `<Plus className="size-4" />`)
  - Table area: `[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card` (the side borders match the card bg = 8px inset effect without padding)
  - `<Table className="table-fixed">` with explicit `w-XX` widths on every `<TableHead>` (table-fixed forces children to obey those widths)
  - Header sticky: `[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:text-foreground-subtle`
  - Row hover: `hover:bg-primary-soft/60 transition-colors`
  - Action buttons in rows: `<Button size="icon-xl" variant="outline">` (NOT `size="sm" variant="ghost"`)
  - Optional status bar at bottom: `border-t border-border px-5 py-2.5 text-xs text-muted-foreground` with counts/breakdown
  - Empty state: lucide icon (`size-10 opacity-30`) + Thai message, `py-16` padding inside a `<TableCell colSpan={N}>`
- **`[scrollbar-gutter:stable]` for tab/page scroll shifts:** if you have a horizontally centered element (like a `w-fit` segmented Tabs) inside a vertically-scrollable container, switching content between short and tall tabs makes the scrollbar appear/disappear and shifts the centered element by ~12-15px. Apply `[scrollbar-gutter:stable]` (Tailwind arbitrary value) to the scroll container — reserves the gutter even when no scrollbar is needed.

### Card components (`src/components/ui/card.tsx`)
- `SectionCard` — main grouping card for form sections. Props: `icon`, `title`, `tint`, `right` (action slot), `children`.
- `MetricCard` — fixed-height (`h-32`) card with label, big value (`text-3xl tabular-nums leading-none`), optional sub line. Icon is **absolute** top-right (`absolute top-4 right-4`), content has `pr-14` so text doesn't overlap. Three escape-hatch props for sub-element overrides: `labelClassName`, `valueClassName`, `subClassName` — merged via `cn()`, so `subClassName="text-success font-semibold"` cleanly overrides the default muted color. Use `valueClassName` if you need to break out of the tint's `valColor`.
- `StatCard` — like MetricCard but clickable filter shortcut. Renders a `<button>` with `ring-2 ring-{tint}` when `isActive`. Used in Products list for the 3 stock filter cards.

### Tabs (`src/components/ui/tabs.tsx`)
- Variants on `<TabsList>`: `default` (gray bar with white active), `line` (underline-only), `pill` (transparent bar with colored primary active), `segmented` (Apple-style with equal-width tabs).
- **`segmented`**: container is `bg-card rounded-xl p-1`, triggers use `inline-grid grid-flow-col auto-cols-fr` so they all match the width of the longest one. Active state is `bg-tertiary text-tertiary-foreground shadow-sm` in both light and dark. Default for the EditProduct page.
- Tab icons: just put a lucide `<Icon />` as the first child of `<TabsTrigger>` — auto-sized to `size-4` via the existing `[&_svg:not([class*='size-'])]:size-4` rule.

## POS Search UX Rules (mirrors PHP behaviour)
- **Search input is always focused.** `mainInputRef` on the POS page + `modalInputRef` in the search modal. A global `click` listener refocuses whichever is active when the user clicks a non-interactive area. `refocusSearch()` is called after cart unit/price changes. Respects `showPayment/showCustomerSearch/showQuickAdd/showSuccess` — doesn't steal focus from those dialogs.
- **Modal is fixed size.** 600×480 via inline `style`. Header + column-header + footer are `shrink-0`; result list is `flex-1 overflow-y-auto`. Empty space stays empty; overflow scrolls internally — never reflows.
- **Highlight state is owned by keyboard only.** `highlightIdx` resets **only** in `useEffect(() => setHighlightIdx(0), [query])` — never in `onChange`, scroll handlers, or mouse events. Do **not** add `onMouseEnter={() => setHighlightIdx(i)}` to rows: `scrollIntoView` makes rows pass under a stationary cursor and mouseenter would fire spuriously, resetting the highlight. Hover visuals come from Tailwind `hover:bg-primary-soft`, not state.
- **Keyboard scroll.** `activeRowRef` attached to the active row, `useEffect(() => activeRowRef.current?.scrollIntoView({ block: 'nearest' }), [highlightIdx])`. `block: 'nearest'` keeps scroll inside the list container.
- **Arrow keys call `e.preventDefault()`** to stop page/input default behaviour.

## POS Unit Selection Rules (HARD — main unit always at top)
The base ("หลัก") unit must always be the first option in BOTH the cart unit dialog and the search modal. Selection state must NEVER influence ordering.

- **Synthesize the base unit from `product.unit_name` only.** Do NOT fall back to `item.unit_name` — that's the currently-selected unit and would put the selected unit at top with the "หลัก" badge. Use `product?.unit_name ?? ''`.
- **Unit dialog (`POS/index.tsx`)** — `allUnits = [syntheticBase, ...product.units]`. The synthetic base row has `id: -1`; `product.units` contains only non-base variants (the API never returns base rows).
- **Search modal `flatItems`** — emit `{ product, unit: null }` first, then one entry per `product.units`. The display fallback `it.unit?.unit_name ?? it.product.unit_name ?? '-'` resolves correctly per row. `handleSelectItem(p, null)` sets `selectedUnit: undefined`, which the cart treats as the base — pulling price/name from `product.*`.
- **`changeCartUnit` clears `selectedUnit` for the base.** Detects `unit.id === -1` and writes `selectedUnit: undefined` so the cart always reads base prices from `product.*` (single source of truth). For non-base units, `selectedUnit` is set and `unit.price_*` is used.
- **Where `product.unit_name` comes from:** `pos:searchProducts` SELECTs `u.name as unit_name` via `LEFT JOIN item_units u ON u.id = p.unit_id`. The base unit lives directly on `products.unit_id`.
- **Invariant: every product SHOULD have `products.unit_id` set.** Enforced by `products:create` (writes `unit_id` directly, falls back to `'ชิ้น'` if missing). Bypass via raw SQL → `unit_name` resolves to NULL (no fallback in the queries).

## Known Issues
- `postcss.config.js` ESM warning — harmless
- DevTools Autofill errors — harmless Chromium noise
- VS 2026 missing C++ workload — cannot recompile native modules from source
