# Syntropic Desktop — Claude Context

## Project
Pharmacy POS desktop app. Electron 31 + React 18 + Vite 5 + TypeScript + better-sqlite3 + Tailwind + Zustand.
Rebuilt from a Laravel/Blade/MySQL PHP original at `D:\Syntropic.Project\Syntropic.php`.
Authoritative SQL schema: `D:\Syntropic.Project\Syntropic.php\syntropic_rx.sql`

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

## Exact Database Schema (from syntropic_rx.sql)

### products
```
id, old_item_key, barcode, barcode2, barcode3, barcode4, code,
trade_name, name_for_print, category_id, unit_name, dosage_form_id,
default_qty (int, def 1), is_stock_item (bool, def 1),
price_retail, price_wholesale1, price_wholesale2, cost_price,
is_vat, is_not_discount, reorder_point, safety_stock,
expiry_alert_days1 (def 90), expiry_alert_days2 (def 60), expiry_alert_days3 (def 30),
drug_type_id, strength (decimal 10,4), registration_no, tmt_id,
is_original_drug, is_antibiotic, max_dispense_qty,
indication_note, side_effect_note,
is_fda_report, is_fda13_report, is_sale_control, sale_control_qty,
search_keywords (comma-separated aliases),
has_wholesale1, has_wholesale2,
drug_generic_name_id, note, is_hidden, is_disabled,
created_at, updated_at
```
Unique: barcode, code. Indexes on trade_name, drug_type_id, category_id.

### product_lots
```
id, old_lot_key, product_id, supplier_id,
invoice_no, supplier_invoice_no,
payment_type (enum: cash/credit, def cash),
due_date, is_paid (def 0), paid_date,
lot_number, manufactured_date, expiry_date,
cost_price, sell_price,
qty_received, qty_on_hand, qty_reserved (def 0),
is_closed, is_cancelled, cancelled_at, cancel_note, closed_at,
note, created_at, updated_at
```
Unique: (product_id, lot_number). Index on expiry_date.

### product_units
```
id, product_id, unit_name, barcode,
qty_per_base (decimal 10,4),
is_base_unit, price_retail, price_wholesale1, price_wholesale2,
is_for_sale, is_for_purchase, is_disabled,
created_at, updated_at
```
Unique: barcode.

### product_labels
```
id, product_id, label_name,
dose_qty (decimal 5,2),
frequency_id → label_frequencies,
timing_id → label_meal_relations,   ← legacy FK (same table as meal_relation_id)
dosage_id → label_dosages,
meal_relation_id → label_meal_relations,
label_time_id → label_times,
advice_id → label_advices,
indication_th, indication_mm, indication_zh,
note_th, note_mm, note_zh,
show_barcode (def 0), is_default (def 0), is_active (def 1),
sort_order, created_at, updated_at
```

### customers
```
id, old_customer_key, code (C0001…), full_name, id_card, hn, dob, phone, address,
hc_uc, hc_gov, hc_sso (health coverage types: บัตรทอง/ข้าราชการ/ประกันสังคม),
food_allergy, other_allergy, chronic_diseases,
is_alert, alert_note, warning_note,
is_hidden, created_at, updated_at
```
Unique: code.

### drug_allergies
```
id, customer_id, generic_name_id → drug_generic_names,
drug_name_free (free text if no generic_name_id),
reaction (text), severity (enum: mild/moderate/severe/life_threatening, def moderate),
naranjo_score (tinyint), noted_by → users, noted_at
```

### suppliers
```
id, old_vendor_key, code (S0001…), name, tax_id, phone, address,
contact_name, is_disabled, created_at, updated_at
```
Unique: code.

### users
```
id, name, email (unique), email_verified_at, password,
remember_token, created_at, updated_at
```

### sales
```
id, old_sale_key, invoice_no (unique, INV-YYYYMMDD-NNN),
sale_type (enum: retail/wholesale/rx/return, def retail),
customer_id → customers, customer_name_free,
sold_by → users, sold_at,
age_range, symptom_note,
subtotal, total_discount, total_vat, total_amount,
cash_amount, card_amount, transfer_amount, change_amount,
is_credit, due_date,
is_fda13_report, sale_report_note,
status (enum: completed/voided/refunded, def completed),
void_reason, note, created_at, updated_at
```

### sale_items
```
id, sale_id, product_id,
item_name, unit_name,
qty (decimal 10,2), unit_price, discount (def 0),
unit_vat (def 0), line_total,
item_note, is_cancelled (def 0)
```

### sale_item_lots
```
id, sale_item_id, lot_id → product_lots,
product_id, qty (decimal 10,2), is_cancelled (def 0)
```
FEFO tracing — links each sale line to specific lots deducted.

### stock_movements
```
id, product_id, lot_id,
movement_type (enum: receive/sale/sale_return/purchase_return/
                     adjust_in/adjust_out/expired/
                     transfer_in/transfer_out/destroy),
ref_type (varchar 30), ref_id,
qty_change (int), qty_before (int), qty_after (int),
unit_cost (decimal 10,2),
note, created_by → users, created_at
```

### stock_returns
```
id, product_id, lot_id, sale_id,
qty (int), unit_name, reason, note, created_at
```

### price_logs
```
id, product_id,
price_type (enum: retail/wholesale1/wholesale2),
old_price, new_price (decimal 10,4),
note, created_at
```

### settings (singleton id=1)
```
id, shop_name, shop_address, shop_phone,
shop_license_no, shop_line_id, shop_tax_id,
created_at, updated_at
```

### label_settings (singleton id=1)
```
id, paper_width (def 100mm), paper_height (def 75mm),
padding_top/right/bottom/left (def 3),
font_family (def Tahoma),
font_size_shop (def 13), font_size_product (def 14),
font_size_dosage (def 16), font_size_small (def 10),
bold_shop (def 1), bold_product (def 1), bold_dosage (def 1),
line_spacing (def 1.4), section_gap (def 4),
row_styles (JSON), created_at, updated_at
```

### Lookup tables (seeded on first run)
- **drug_types**: code, name_th, is_fda9/10/11/13 flags
- **drug_generic_names**: code, name, indication_note, is_antibiotic, is_pregnancy_lactation, is_pregnancy_category, pregnancy_category_type_key, drug_group_id (~4253 rows)
- **drug_groups**: id, name
- **dosage_forms**: name_th, name_en, is_disabled
- **product_categories**: code, name, description, sort_order, is_disabled
- **label_frequencies**: code, name_th/en/mm/zh, sort_order
- **label_dosages**: name_th/en/mm/zh, sort_order
- **label_times**: name_th/en/mm/zh, sort_order
- **label_meal_relations**: code, name_th/en/mm/zh, sort_order
- **label_advices**: name_th/en/mm/zh, sort_order

---

## Key Business Logic

### FEFO (First Expiry First Out)
Used in `saveBill`. Deduct from lots ordered by `expiry_date ASC`. Create `sale_item_lots` rows linking each sale_item to specific lots. Span multiple lots if qty needed exceeds one lot. Update `product_lots.qty_on_hand`. Log `stock_movements` (movement_type = 'sale').

### Stock receive (GR)
- Auto-generate GR invoice_no: `GR-YYYYMMDD-NNN` (sequential per day)
- Per line: product, lot_number, expiry_date, manufactured_date, cost_price, sell_price, qty
- Header: supplier_id, payment_type (cash/credit), due_date, supplier_invoice_no
- On save: insert `product_lots` rows, update `products.cost_price` (weighted avg across open lots), log `stock_movements` (movement_type = 'receive')
- History grouped by `invoice_no`

### Running codes
- Customers: C0001, C0002…
- Suppliers: S0001, S0002…
- GR invoices: GR-YYYYMMDD-001…
- Sales invoices: INV-YYYYMMDD-001…

### Barcode uniqueness
Products have 4 barcode fields (barcode, barcode2, barcode3, barcode4) plus `product_units.barcode`. Validate uniqueness across ALL of these before save.

### Pricing
- Base product: price_retail, price_wholesale1, price_wholesale2
- `has_wholesale1` / `has_wholesale2` flags control whether wholesale prices are active
- ProductUnit variants override all three prices
- cost_price per lot; `products.cost_price` = weighted avg of open lots

### Cost/profit in reports
Record cost at sale time from lot cost_price. Profit = line_total − (qty × lot cost_price).

### Void sale
Read `sale_item_lots`, restore qty to each `product_lots.qty_on_hand`, insert `stock_movements` (movement_type = 'sale_return'), set `sales.status = 'voided'`, store `void_reason`. Requires reason text.

### Customer health coverage
`hc_uc` = บัตรทอง (UC), `hc_gov` = ข้าราชการ, `hc_sso` = ประกันสังคม. Boolean flags on customers table.

### Customer alert
`is_alert` + `alert_note` + `warning_note` shown as warning during POS checkout.

### Drug allergy
`drug_allergies` links to customer and optionally to `drug_generic_names` (or free text via `drug_name_free`). Has Naranjo score and severity.

### Product label (pharmacy dispensing)
Each product can have multiple label templates. A label combines: dose_qty, frequency, meal_relation/timing, dosage, label_time, advice, multilingual indication+notes (Thai/Burmese/Chinese). Labels printed with settings from `label_settings` singleton (paper size, fonts, spacing, row_styles JSON).

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

## Pages Status

| Route | Page | Status |
|-------|------|--------|
| `/` | POS | ✅ Complete |
| `/purchase` | Stock Receive (GR) | ✅ Complete |
| `/products` | Product List | ✅ Complete |
| `/products/:id/edit` | Edit Product | ✅ Complete |
| `/people` | People (3 tabs) | ✅ Complete |
| `/reports/sales` | Sales Report | ✅ Complete |
| `/reports/purchases` | Purchase Report | ✅ Complete |
| `/settings` | Settings | ✅ Complete |

## Build order
1. `Purchase/index.tsx`
2. `Products/index.tsx`
3. `Products/EditProduct.tsx` (large — may need 2 sessions)
4. `People/index.tsx`
5. `Reports/Sales.tsx`
6. `Reports/Purchases.tsx`
7. `Settings/index.tsx`

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
2. **Need a token that doesn't exist? Add it.** Add the variable to BOTH `:root` and `.dark` in `src/index.css`, then register it under `colors` in `tailwind.config.js`. Token names describe the *role* (`--success`, `--primary-soft`) — never the shade (`--blue-500` is forbidden).
3. **Never write inline UI primitives.** Forbidden: raw `<button>`, `<input>`, custom toggle div, custom dialog, custom select. Always use `src/components/ui/` (Button, Input, Switch, Dialog, Badge, Toast, Card, Table, Pagination, etc.). If a needed variant is missing, add it to the existing component (e.g., new entry in `buttonVariants.variant`).
4. Tailwind utilities for layout/spacing/typography (`flex`, `gap-2`, `text-sm`, `rounded-xl`, `tabular-nums`) are encouraged — only **color literals** are banned.

### Other conventions
- Thai UI language throughout
- Inter + Sarabun fonts (Noto Sans Thai fallback); base font-size 15px
- Dark/light theme via CSS variables (toggled via themeStore)
- Frameless Electron window — `frame: false` in `electron/main.ts`. Custom `TitleBar.tsx` uses `WebkitAppRegion: 'drag' | 'no-drag'` inline styles and IPC via `window.api.window.{minimize,maximize,close,isMaximized}`.
- All dialogs use custom `dialog.tsx` (no Radix)
- Toast notifications via `useToast()` hook
- Pagination: `pagination.tsx`
- Tables: `table.tsx` components

## POS Search UX Rules (important — mirrors PHP behaviour)
- **Search input is always focused.** `mainInputRef` on the POS page + `modalInputRef` in the search modal. A global `click` listener refocuses whichever is active when the user clicks a non-interactive area. `refocusSearch()` is called after cart unit/price changes. Respects `showPayment/showCustomerSearch/showQuickAdd/showSuccess` — doesn't steal focus from those dialogs.
- **Modal is fixed size.** 600×480 via inline `style`. Header + column-header + footer are `shrink-0`; result list is `flex-1 overflow-y-auto`. Empty space stays empty; overflow scrolls internally — never reflows.
- **Highlight state is owned by keyboard only.** `highlightIdx` resets **only** in `useEffect(() => setHighlightIdx(0), [query])` — never in `onChange`, scroll handlers, or mouse events. Do **not** add `onMouseEnter={() => setHighlightIdx(i)}` to rows: `scrollIntoView` makes rows pass under a stationary cursor and mouseenter would fire spuriously, resetting the highlight. Hover visuals come from Tailwind `hover:bg-primary-soft`, not state.
- **Keyboard scroll.** `activeRowRef` attached to the active row, `useEffect(() => activeRowRef.current?.scrollIntoView({ block: 'nearest' }), [highlightIdx])`. `block: 'nearest'` keeps scroll inside the list container — does not scroll the page.
- **Arrow keys call `e.preventDefault()`** to stop page/input default behaviour.

## Known Issues
- `postcss.config.js` ESM warning — harmless
- DevTools Autofill errors — harmless Chromium noise
- VS 2026 missing C++ workload — cannot recompile native modules from source
