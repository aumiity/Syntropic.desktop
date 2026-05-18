# Syntropic Desktop - Build Progress

## Status: ✅ Runnable — `EditProduct.tsx` 2,155-line monolith split into per-tab files under `src/pages/Products/EditProduct/` (parent + 5 tabs + shared). Pure refactor, no behavior change. Type-clean (same pre-existing baseline). **Not click-tested yet — verify each tab end-to-end before relying on it.**
## Last updated: 2026-05-17
## Run: `npm run electron:dev`
## ⚠️ Next session:
##   1. **Click-test the EditProduct split** — exercise all 5 tabs (general/units/labels/lots/history) + new product flow. See Session 2026-05-17 (EditProduct split) below.
##   2. **Reports page cost audit** — last page in the cost-sourcing sweep (still pending from 2026-05-16→17).
##   3. **Phase-2 sweep** — `Reports/*` then `Settings/index.tsx` onto the table-card standard.

---

## HOW TO START DEV

```bash
cd D:\Syntropic.Project\Syntropic.desktop
npm run electron:dev
```

> Note: `better-sqlite3` prebuilt binary for Electron 31 is already in
> `node_modules/better-sqlite3/build/Release/better_sqlite3.node`
> Do NOT run `npm install` again without `--ignore-scripts`, it will break the native binary.
> If node_modules is ever deleted, run:
>   1. `npm install --ignore-scripts`
>   2. Re-download Electron binary: `node node_modules/electron/install.js`
>   3. Re-download sqlite binary: `cd node_modules/better-sqlite3 && npx prebuild-install --target=31.7.7 --runtime=electron --arch=x64 --dist-url=https://electronjs.org/headers`

---

## DONE ✅

### Config & Tooling
- `package.json` — Electron 31, React 18, Vite 5, TS, better-sqlite3 v12, Tailwind, Zustand, react-router-dom v6
- `vite.config.ts` — vite-plugin-electron setup (main + preload bundles to dist-electron/)
- `tsconfig.json` + `tsconfig.node.json`
- `tailwind.config.js` + `postcss.config.js`
- `index.html` — Noto Sans Thai + Sarabun Google Fonts

### Electron Main Process
- `electron/main.ts` — BrowserWindow (1400×900), dev=localhost:5173 / prod=dist/index.html, registers all IPC handlers
- `electron/preload.ts` — Full contextBridge API exposing `window.api` with namespaces: pos, products, purchase, people, reports, settings, printer, app

### Database Layer (electron/db/)
- `index.ts` — Opens SQLite at userData/database/syntropic.db, WAL mode, runs schema + seed on first launch
- `schema.ts` — 25+ tables: users, settings, product_categories, item_units, drug_types, dosage_forms, drug_generic_names, products, product_units, product_lots, customers, drug_allergies, suppliers, sales, sale_items, sale_item_lots, stock_movements, label_frequencies, label_dosages, label_times, label_meal_relations, label_advices, product_labels, label_settings
- `seed.ts` — Seeds all lookup tables on first run (categories, units, drug types, dosage forms, label data, default admin user C0000 general customer)

### IPC Handlers (electron/ipc/)
- `pos.ts` — searchProducts (with lots+units), searchCustomers, addCustomer, saveBill (FEFO algorithm), getDailyStats
- `products.ts` — list (paginated, filterable), get, create, update, adjustStock, addUnit/updateUnit/deleteUnit, saveLabel/deleteLabel, searchGenericNames, getLots
- `purchase.ts` — nextGRNumber, save (weighted avg cost price, updates product prices), history (grouped by invoice), getReceipt
- `people.ts` — CRUD for customers (with allergies), suppliers, staff/users; allSuppliers dropdown
- `reports.ts` — salesList (with cost+profit calc), getSale (with item costs), voidSale (reverses stock via sale_item_lots), purchaseList
- `settings.ts` — shop settings, categories, item units, drug types, dosage forms, all label lookup tables, label print settings; dropdown helpers (allUnits, allCategories, allDrugTypes, allDosageForms)
- `printer.ts` — printReceipt (ESC/POS to TCP printer), openCashDrawer (ESC/POS pulse)

### React Frontend — Core
- `src/main.tsx` — Entry, applies saved theme before render
- `src/index.css` — Tailwind base + full CSS variable system (light + dark themes)
- `src/App.tsx` — HashRouter + lazy-loaded Routes for all 8 pages + ToastProvider
- `src/types/index.ts` — All TS types: Product, ProductUnit, ProductLot, ProductLabel, Customer, DrugAllergy, Supplier, User, Sale, SaleItem, CartItem, Setting, ProductCategory, ItemUnit, DrugType, DosageForm, LabelFrequency, etc.
- `src/lib/utils.ts` — cn(), formatCurrency(), formatDate(), formatDateTime(), getExpiryStatus(), formatExpiry()
- `src/stores/themeStore.ts` — Zustand + localStorage persist, toggleTheme()
- `src/stores/cartStore.ts` — Zustand cart: items[], customer, saleType, addItem (merges duplicates), updateItem, removeItem, clearCart, subtotal/totalDiscount/totalAmount computed

### UI Components (src/components/ui/)
- `button.tsx` — variants: default, destructive, outline, secondary, ghost, link, success, warning; sizes: default, sm, lg, xl, icon, icon-sm
- `input.tsx`
- `textarea.tsx`
- `label.tsx`
- `badge.tsx` — variants: default, secondary, destructive, outline, success, warning, danger
- `card.tsx` — Card, CardHeader, CardTitle, CardContent, CardFooter
- `dialog.tsx` — custom modal (no Radix), size variants: sm/md/lg/xl/2xl/full, DialogContent/Header/Title/Body/Footer
- `select.tsx` — native select with chevron icon
- `tabs.tsx` — custom tabs (context-based), Tabs/TabsList/TabsTrigger/TabsContent
- `table.tsx` — Table/TableHeader/TableBody/TableRow/TableHead/TableCell
- `switch.tsx`
- `checkbox.tsx`
- `toast.tsx` — ToastProvider context + useToast() hook, success/error/info variants
- `confirm-dialog.tsx` — reusable confirm with optional reason input field
- `pagination.tsx` — prev/next with "หน้า X / Y" display

### Layout (src/components/layout/)
- `Sidebar.tsx` — 72px icon sidebar, NavLink active states, 6 nav items, theme toggle at bottom
- `Layout.tsx` — flex row: Sidebar + `<Outlet />`

### Pages — Implemented
- `src/pages/POS/index.tsx` ✅ FULL
- `src/pages/Settings/index.tsx` ✅ FULL
  - Tab ข้อมูลร้าน: shop name, address, phone, license no, tax ID, LINE ID
  - Tab หมวดหมู่: list with code/sort_order, CRUD dialog, toggle enable/disable
  - Tab หน่วยนับ: list with usage count, CRUD dialog
  - Tab ประเภทยา: list with อย.9/10/11/13 flags, CRUD dialog with checkboxes, toggle
  - Tab การพิมพ์ฉลาก: paper size, padding, font family, font sizes + bold per row, line/section spacing, live label preview
- `src/pages/Reports/Sales.tsx` ✅ FULL
  - Date range + text search filters, sortable columns
  - 6 summary cards: bill count, subtotal, discount, net total, cost, profit (with %)
  - Table with sale type badges, void badge, profit colouring
  - Detail modal: header info + items with cost/profit per line + totals footer
  - Void with require-reason ConfirmDialog, restores stock automatically
- `src/pages/Reports/Purchases.tsx` ✅ FULL
  - Date range + supplier + text search filters
  - Summary strip: total receipts, page value, overdue credit count
  - Table with payment type badges (cash/credit/paid), due dates
  - Receipt detail modal with full line items + total
- `src/pages/People/index.tsx` ✅ FULL
  - Tab ลูกค้า: search, paginated table with health coverage badges + alert icon, full CRUD dialog (id_card, HN, DOB, phone, address, UC/Gov/SSO toggles, allergies, alert flags), read-only drug allergy list
  - Tab ผู้จัดจำหน่าย: search, paginated table, full CRUD dialog (name, contact, phone, tax_id, address)
  - Tab พนักงาน: table with roles, CRUD dialog (name, email, password, role), soft-delete (is_disabled)
- `src/pages/Products/EditProduct.tsx` ✅ FULL
  - Tab 1 ข้อมูลทั่วไป: all product fields (barcodes x4, prices, drug type, dosage form, generic name autocomplete, strength, registration, flags, stock alerts, notes, status)
  - Tab 2 หน่วยนับ: CRUD table of product_units with unit dropdown, barcode, qty_per_base, prices, sale/purchase/base flags
  - Tab 3 ฉลากยา: card list of product_labels + add/edit dialog (dosage, frequency, meal timing, time, advice, multilingual indication/notes)
  - Tab 4 ล็อต: read-only lot history with expiry colour coding
- `src/pages/Products/index.tsx` ✅ FULL
  - Search by name/barcode/code, filter by category + drug type
  - Table: trade name, dosage form, code, category, drug type, price, stock qty with low/out badges
  - Drug flags: antibiotic, sale control, FDA13
  - Quick-create product dialog → redirects to EditProduct
  - Adjust stock dialog (in/out) with note, updates via IPC
  - Pagination (50 per page)
- `src/pages/Purchase/index.tsx` ✅ FULL
  - GR# auto-generated (GR-YYYYMMDD-NNNN)
  - Supplier dropdown, supplier invoice no, วันที่สั่งซื้อตามบิล (bill order date) in header
  - วันที่รับสินค้า moved to สรุปใบรับสินค้า sidebar as compact editable field
  - Payment type: cash / credit (with due date + paid tracking)
  - วันครบกำหนด quick-pick buttons: 15 / 30 / 60 / 90 วัน (sets date from today)
  - ชำระแล้ว quick-fill buttons: วันนี้ / วันครบกำหนด (fills paid date)
  - Multi-row item entry with live product search + lot/expiry/cost/sell/qty fields
  - Active row highlight: emerald-100 bg + left border accent (matches POS UX)
  - Running total per row + grand total footer
  - หมายเหตุ textarea in sidebar, saved to `purchase_receipts` table (invoice_no PK + note)
  - Save with validation → success dialog → form reset
  - History table with filters (search, supplier, date range) + pagination
  - Receipt detail modal
  - Banner top-right: live date/time clock (Thai locale, ticking every second, matches POS)

---

## PENDING 🔧

### Pages — Stubs only (show "กำลังพัฒนา"), need full implementation:

All pages are now complete. No pending stubs.

---

## NEXT SESSION — ข.ย.10 / ข.ย.11 Reports

### Background
อ.ย. กำหนดให้ร้านยาที่จำหน่ายยาควบคุมพิเศษและยาอันตรายต้องบันทึกบัญชีการขายรายวัน:
- **ข.ย.10** — บัญชีการขายยาควบคุมพิเศษ
- **ข.ย.11** — บัญชีการขายยาอันตราย ตามที่ อ.ย. กำหนด

### Data model (updated 2026-05-11)
Per-product flags on `products` table now drive report inclusion — NOT drug_type code matching:
- `products.is_fda10 = 1` → product appears in ข.ย.10
- `products.is_fda11 = 1` → product appears in ข.ย.11

Default values come from `drug_types.is_fda10` / `drug_types.is_fda11` when a drug type is selected in EditProduct. Pharmacist can override per-product. This means:
- SPCL_CTRL / PSYCHO_3/4 / NARCOTIC_3 → `is_fda10=1` by default on new products
- DANGEROUS → `is_fda11=0` by default; pharmacist ticks manually per regulation

### Data source
```sql
-- ข.ย.10
SELECT s.sold_at, s.invoice_no, p.trade_name, p.tmt_id,
       si.qty, si.unit_name, si.unit_price,
       COALESCE(s.customer_name_free, c.full_name) AS buyer_name,
       c.id_card
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN products p ON p.id = si.product_id
LEFT JOIN customers c ON c.id = s.customer_id
WHERE p.is_fda10 = 1
  AND s.status = 'completed'
  AND s.sold_at BETWEEN @from AND @to
ORDER BY s.sold_at

-- ข.ย.11 — identical but WHERE p.is_fda11 = 1
```
- Filter by date range (รายวัน/รายเดือน)
- Columns: วันที่, เลขที่ใบเสร็จ, ชื่อยา, TMT ID, ปริมาณ, หน่วย, ราคา, ชื่อผู้ซื้อ/เลขบัตรปชช.

### Pages to build
1. `src/pages/Reports/Kho10.tsx` — ข.ย.10 พร้อม print/export
2. `src/pages/Reports/Kho11.tsx` — ข.ย.11 พร้อม print/export

### IPC needed
- `reports:kho10List({ from, to })` — query sales WHERE `p.is_fda10 = 1`
- `reports:kho11List({ from, to })` — query sales WHERE `p.is_fda11 = 1`

### Routes
- `/reports/kho10`
- `/reports/kho11`

---

## Build order (remaining)

1. `Purchase/index.tsx` — stock receive
2. `Products/index.tsx` — product list
3. `Products/EditProduct.tsx` — product edit (large, may need 2 prompts)
4. `People/index.tsx` — people management
5. `Reports/Sales.tsx` — sales report
6. `Reports/Purchases.tsx` — purchase report
7. `Settings/index.tsx` — settings

---

## PHP Source Reference
Original project: `D:\Syntropic.Project\Syntropic.php`
Stack: Laravel + Blade + SQLite + Tailwind
Full schema + business logic analysis in conversation history.

## UI Polish (2026-04-21)
- `src/index.css` — theme updated to emerald green (primary emerald-600, sidebar emerald-700) matching PHP version; background changed to gray-100 equivalent; Inter + Sarabun Google Fonts; base font-size 15px
- `tailwind.config.js` — `fontFamily.sans: ['Inter', 'Sarabun', 'sans-serif']`
- `src/components/layout/Sidebar.tsx` — widened to w-20, rounded-xl nav items (w-16 h-16), PHP-style "Rx / Syntropic" text logo, emerald-200/hover-emerald-600 colors
- `src/pages/POS/index.tsx` — gradient header banner (from-emerald-600 to-sky-600) with shop name + live date/time clock matching PHP POS header
- `src/components/ui/card.tsx` — rounded-lg → rounded-xl (matches PHP)
- `src/components/ui/table.tsx` — TableHeader gets bg-muted/60 (matches PHP's bg-slate-100 thead); header height h-12 → h-10

## Frameless Window + Custom Title Bar (2026-04-21)
- `electron/main.ts` — `frame: false`; IPC handlers `window:minimize/maximize/close/isMaximized`
- `electron/preload.ts` — added `window` namespace on `window.api`
- `src/components/layout/TitleBar.tsx` (new) — 36px drag bar (`WebkitAppRegion: 'drag'`) with "SYNTROPIC RX" title, Min/Max/Close buttons (`WebkitAppRegion: 'no-drag'`), red hover on close
- `src/components/layout/Layout.tsx` — stacks TitleBar + (Sidebar + Outlet)

## POS Search UX (2026-04-21, matches PHP behaviour)
- **Always-focused main input** — `mainInputRef` with `autoFocus`; global `click` listener on document refocuses it when user clicks any non-interactive area (skips `input, button, select, textarea, a, [role=button]`). `refocusSearch()` is also called after `changeCartUnit` / `changeCartPrice`.
- **Auto-opens modal** — typing in main input opens the fixed-size modal and transfers focus to `modalInputRef`; both inputs share the same `query` state.
- **Fixed-size modal** — `width: 600px, height: 480px` via inline style; header/column-header/footer are `shrink-0`, list is `flex-1 overflow-y-auto` so empty space stays empty and overflow scrolls internally.
- **Column layout** — grid `1fr 80px 100px 70px`: ชื่อสินค้า / หน่วย / ราคาขาย / คงเหลือ. Active row `bg-emerald-100`, hover `hover:bg-emerald-50`.
- **Keyboard nav** — ArrowUp/Down/Enter/Escape with `preventDefault()`. `activeRowRef` + useEffect on `[highlightIdx]` calls `scrollIntoView({ block: 'nearest' })` to keep the highlight visible inside the list container only.
- **Highlight persistence fix** — `setHighlightIdx(0)` lives in a dedicated `useEffect` keyed on `[query]` so it resets ONLY when the query text actually changes. Removed `onMouseEnter={() => setHighlightIdx(i)}` on rows — it was firing on rows passing under the stationary cursor during `scrollIntoView`, resetting the highlight.
- **Unit / price popovers in cart rows** — inline `Popover` component (no Radix); click a cart row's unit/price chevron to switch between product_units or retail/wholesale1/wholesale2 tiers.
- **Quick-add customer** — `UserPlus` button next to the customer selector; dialog captures name/phone/alert_note and assigns to cart.
- **Sale types** — retail / wholesale only (Rx removed per product decision).

## POS Cart Row Touch UX (2026-04-22)
- `src/index.css` — global rule strips number-input spinner arrows (WebKit + Firefox)
- `src/pages/POS/index.tsx` — cart row redesigned for touchscreen pharmacy use:
  - **Larger qty +/- buttons** — `w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600` with `h-4 w-4` icons (was `w-7 h-7`); qty input gets `style={{ MozAppearance: 'textfield' }}`
  - **Unit Popover → Modal** — `unitModalIdx` state; centred overlay (`fixed inset-0 z-50 bg-black/40`), panel `bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm`. Lists each `product_units` row, highlights current selection, calls `changeCartUnit` on click
  - **Price Popover → Modal with cost/profit** — `priceModalIdx` state; same overlay pattern. Each price option (ราคาปลีก / ราคาส่ง 1 / ราคาส่ง 2) shows price + cost (`product.cost_price`) + profit (₿ + %, green when positive). Selected option highlighted emerald. Calls `changeCartPrice` on click
  - **Discount input → Modal** — `discountModalIdx` + `discountInput` state; row now shows a button with current discount or `—`. Modal shows unit price, large no-spinner number input (autoFocus, Enter applies), live "ราคาหลังหักส่วนลด". Buttons: ล้าง (zero) / ยกเลิก / ตกลง
  - **Focus management** — `refocusSearch` and the global non-interactive-click handler now skip refocusing while any of the three new modals are open (mirrors how `showPayment`/`showCustomerSearch` are already gated)
  - Removed `openUnitPopover` / `openPricePopover` state. Inline `Popover` helper component left in place (unused) per scoping constraint

## POS Wholesale Price Fallback (2026-04-23)
- `src/stores/cartStore.ts` — `setSaleType` now falls back to retail price when wholesale is selected but the item (or its selected unit) has no `price_wholesale1` (0/null). Previously toggling to wholesale would zero out prices for items without a wholesale rate.
- `src/pages/POS/index.tsx`:
  - `handleSelectItem` — same wholesale → retail fallback when adding an item while in wholesale mode
  - `changeCartUnit` — same fallback when switching units on an existing cart row in wholesale mode
  - Search result list price display — always shows retail price regardless of `cart.saleType` (wholesale pricing is applied only when added to cart, not in the search list)

## POS Customer Info Button (2026-04-22)
- `src/pages/POS/index.tsx` — added "ข้อมูล" (Info) button next to the customer selector, mirroring PHP `btn-customer-info`
  - Disabled (slate-300, cursor-not-allowed) when no customer selected; enabled (slate-500, hover:bg-slate-50) when one is
  - 52×52 white rounded-xl with `Info` icon (lucide-react) + "ข้อมูล" text label
  - Opens `showCustomerInfo` Dialog (size sm) showing: full_name (with red AlertTriangle if `is_alert`), code + HN, phone, address, health coverage badges (บัตรทอง/ข้าราชการ/ประกันสังคม — only if any flag set), food_allergy / other_allergy / chronic_diseases (only if filled), alert_note (red box) and warning_note (amber box)
  - `refocusSearch` + global non-interactive-click handler updated to gate on `showCustomerInfo` so the search input doesn't steal focus while the modal is open

## Database Location
`C:\Users\ANYA\AppData\Roaming\syntropic-desktop\database\syntropic.db`
Use DB Browser for SQLite to inspect or import data from PHP version.

## shadcn/ui Install + Compatibility Patch (2026-04-23)
- `shadcn` v4 CLI + `tw-animate-css` + `@fontsource-variable/geist` added to `package.json`; CLI regenerated all 13 primitives in `src/components/ui/` (badge, button, card, checkbox, dialog, input, label, pagination, select, switch, table, tabs, textarea).
- **CSS rollback** — shadcn overwrote `src/index.css` with Tailwind v4 syntax (`@import "shadcn/tailwind.css"`, `oklch()` color values, `@theme` directives). The project is still on Tailwind **v3.4.4** and `tailwind.config.js` consumes variables via `hsl(var(--primary))`, so the v4 `oklch()` values produced invalid CSS (`hsl(oklch(...))`) and nothing rendered. Reverted `src/index.css` to the HSL-based v3 version.
- **Custom API preserved on shadcn primitives**:
  - `src/components/ui/button.tsx` — added `success` and `warning` variants + `xl` size back to the CVA config
  - `src/components/ui/badge.tsx` — added `success`, `warning`, `danger` variants back
  - `src/components/ui/dialog.tsx` — added `size` prop (`sm | md | lg | xl | 2xl | full`) via a `dialogSizeMap`, wired `onClose` through to the built-in X button, re-exported `DialogBody`
  - `src/components/ui/pagination.tsx` — replaced shadcn's composed-parts API with a simple `<Pagination page totalPages onPageChange />` wrapper (shadcn `Button` + lucide chevrons), matching what every consumer page already calls it with
- Pre-existing type errors left alone: toast call sites use `toast({ title, description, variant })` but the hook signature is `toast(message, type)`; `FullProduct` / `ProductLabel` / `ProductLot` types missing several fields; `adjustStock` called with 4 args when API expects 1. None of these were caused by the shadcn install.

## POS Cart Table → shadcn Table (2026-04-23)
- `src/pages/POS/index.tsx` — replaced the hand-rolled grid-div cart table with shadcn `Table / TableHeader / TableBody / TableRow / TableHead / TableCell`
- Column widths locked via `<colgroup>` (36 / flex / 110 / 110 / 100 / 110 / 110 / 60 px) instead of `gridTemplateColumns` inline style
- `TableHeader` gets `sticky top-0 z-10 bg-slate-100` so the header pins while rows scroll — same UX as before
- All interactive pill buttons preserved: slate unit selector, yellow qty, emerald price, red discount, trash icon
- Empty-state (shopping-bag SVG + "ยังไม่มีรายการสั่งซื้อ") and summary footer (รายการ count / ราคารวม / ส่วนลด) untouched

## POS shadcn/ui Pass (2026-04-24)
Incremental migration of POS page from hand-rolled primitives to shadcn components, plus several UX/style fixes.

- **Sticky cart header fix** — `src/pages/POS/index.tsx` cart table now uses a raw `<table>` (still with shadcn `TableHeader`/`Body`/etc). The shadcn `Table` wrapper adds an `overflow-x-auto` div that became the sticky ancestor, so the `sticky top-0` thead was pinned to that inner div — not the outer `overflow-y-auto` scroll container — and rode up with the rows. Keeping the thead + cells under a plain `<table>` lets sticky attach to the right scroll container.
- **Raw → shadcn primitive swaps in POS**:
  - 7 raw `<input>` → `Input` (main search, modal search, custom price, qty, discount %, discount ฿, final price)
  - 4 raw `<label>` → `Label`
  - 3 right-panel action buttons → `Button` (รับชำระเงิน payment, เปิดลิ้นชัก cash drawer, ยกเลิกบิล clear cart). Colorful cart-row pill buttons (unit/qty/price/discount chips) left as raw `<button>` — they're styled toggle-chips, not standard buttons.
- **`src/components/ui/input.tsx` — removed `md:text-sm`** from the base className. The shadcn default shrinks font-size at `md+` breakpoints (to avoid iOS zoom on focus), but this is a desktop-only Electron app and the responsive override was silently winning over any `text-2xl`/`text-3xl` className consumers passed. Base now stays at `text-base` at all widths; page-level overrides land.
- **Modal title sizes** — unit / price / discount modal headers were `text-sm` (and price had an invalid `text-m` that rendered as default). All three bumped to `text-lg` to match the qty modal.
- **Label sizes** — the four Labels in qty + discount modals bumped from `text-xs` to `text-sm` for a less cramped feel.
- **Discount modal layout** — restructured: % preset buttons (3/5/10/15/20) as a standalone top row, then ส่วนลด (%) + ส่วนลด (บาท) inputs side-by-side in a `grid-cols-2` (both `h-14 text-2xl` for alignment), then ราคาสุดท้าย below. The % input keeps its trailing `%` glyph and two-way sync with baht/final-price is preserved.
- **`Card` on customer info** — the identity + contact block in the customer info modal now uses shadcn `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent`. Name as the title, `รหัส` and `HN` in the description, `เบอร์โทร` and `ที่อยู่` in a compact 2-column label→value grid. Coverage badges, allergies, and warning notes below remain flat (red/amber boxes for warnings keep their semantic styling).
- **Customer modals → hand-rolled shell** — converted the 3 customer dialogs (`showCustomerSearch`, `showCustomerInfo`, `showQuickAdd`) from shadcn `Dialog`/`DialogContent` to the same `fixed inset-0 z-50 flex items-center justify-center bg-black/40` shell used by the unit/qty/price/discount modals (`bg-white rounded-2xl shadow-2xl border border-slate-200`, header with X button + border-b, body, footer with border-t). Customer info body gets `max-h-[70vh] overflow-y-auto` since it can grow tall. Payment and success modals still use shadcn `Dialog`.
- **Unified Esc handler** — the global ESC `useEffect` in POS now also closes the 3 newly hand-rolled customer modals (previously Radix handled Esc for them). Close cascade: qty → discount → price → unit → quickAdd → customerInfo → customerSearch → searchOpen.
- **`popover` component installed** — `src/components/ui/popover.tsx` added via `npx shadcn@latest add popover`. Not yet wired to any feature. The dead inline `Popover` helper at the top of POS/index.tsx (declared but never rendered) was removed.

## POS Payment Modal Overhaul + Discount Redistribution (2026-04-24)
Rebuilt the payment dialog to match the PHP reference screen (two-section layout with editable total discount that redistributes across cart lines). Pure redistribution logic extracted for testability.

- **`src/pages/POS/redistributeDiscount.ts` (new)** — pure `redistributeDiscounts(items, newTotal)` → new discount array.
  - **Case A (increase):** single-pass weighted distribution by line gross (`qty × unit_price / subtotal`), **no per-line cap** — discounts can legitimately exceed a line's gross, pushing its `line_total` negative (matches PHP behaviour where typing 2,222 discount on 335 subtotal yields net `-1,887`).
  - **Case B (decrease):** Phase 1 reduces proportionally (weighted by line gross) among lines with `discount > 0`, capped per-line at current discount, iterating to re-distribute the cap overflow to remaining discounted lines. Phase 2 (spec's catch-all across ALL products) is unreachable because input clamps to ≥ 0, left as a comment.
  - Results rounded to 2 decimals via `Math.round(n * 100) / 100`.
- **`src/stores/cartStore.ts`** — removed the three `Math.max(0, qty*price - discount)` clamps on `line_total` in `addItem`, `updateItem`, and `setSaleType`. Line totals and `totalAmount()` can now go negative. IPC `pos:saveBill` does no positivity check, so negative sales flow through intact.
- **`src/pages/POS/index.tsx`** — replaced the old `size="sm"` payment Dialog (cash + change + paid total) with a `size="lg"` modal:
  - **Section 1 (card):** `ราคาขายรวม` (gross, read-only) over `ส่วนลดรวม` (editable `Input`). The discount input uses a red style (`bg-red-50 border-red-300 text-red-600`, `w-52 h-12 text-xl`) to signal it's a subtraction.
  - **Real-time redistribution** — `onChange` calls `applyTotalDiscount(raw)` which parses, redistributes, and updates per-line `cart.discount` + re-seeds `cashAmount` to `max(0, net)` on every keystroke. `onBlur` / Enter calls `normalizeTotalDiscount()` which reformats the input string to `X.XX`. The raw typed string is preserved during typing so partial input (`"1."`, empty) isn't clobbered.
  - **Section 2 (gradient card):** `เป็นเงินทั้งสิ้น` net total, `text-5xl font-extrabold`, emerald→red gradient + red text when net < 0.
  - **Single-line breakdown + toggle** — one flex row with `text-sm`: shadcn `Button variant="outline"` toggles "คลิกเพื่อแสดง" ↔ "คลิกเพื่อซ่อน" (ChevronDown rotates 180°). When expanded, ต้นทุน / กำไร / % กำไร render inline on the left, separated by bullets. Modal height stays constant either way — no layout shift on toggle.
  - **Cost estimate** — `ต้นทุน = Σ qty × product.cost_price` (recent weighted-avg cost from products table, not actual lot FEFO cost which is only resolved at save time). `กำไร = net − cost`, `% กำไร = profit / net × 100` (0 when net ≤ 0).
  - **Cash input** — `h-16 text-3xl font-bold` big-ticket field, auto-seeded to `max(0, net)` when the modal opens and after every discount redistribution.
  - **เงินทอน row with inline alert** — box bg flips red when `netNegative || change < 0`; right side swaps between the green change amount (`text-3xl`) and a red "⚠ ตรวจสอบ" block (AlertTriangle + tracking-wider) on the same line. No separate warning section — keeps the modal at a fixed height.
  - **Save button gated by the alert** — `disabled={saving || totalPaid < cart.totalAmount() || cart.totalAmount() < 0}`. First predicate covers `change < 0`, second covers `net < 0` — together they block save whenever ตรวจสอบ is showing.
  - Card / transfer payment state (`cardAmount`, `transferAmount`) kept but no UI; saved as `0` through the existing `saveBill` payload.
  - Modal-open handler now seeds `totalDiscountInput`, `cashAmount`, and `showBreakdown=false` in one go.
- **`src/pages/POS/redistributeDiscount.ts` + cart store line_total downstream effects** — `sale_items.line_total` can now persist negative in the DB when a bill is saved with a discount ≥ subtotal; Reports/Sales.tsx just renders whatever's there (`formatCurrency` handles negatives). Save button block on `net < 0` is the primary guard, so this only happens if someone types exactly `net = 0` (not negative) with partial line overshoots, which `redistributeDiscounts` already balances.

## Purchase Page UX Polish (2026-04-25)

- **Active row highlight** — `activeRow` state tracks which row has focus; focused row gets `bg-emerald-100` + `border-l-2 border-emerald-400` left accent (same pattern as POS search modal highlight). All 7 inputs per row set `activeRow` on `onFocus`. Unfocused rows retain `hover:bg-emerald-50/40`; partial rows keep amber tint with transparent left border.
- **Live clock in banner** — `now` state with `setInterval` 1 s tick; top-right of the gradient banner now shows วันที่ + เวลา in Thai locale (matches POS header, replaces static เลขที่ใบรับ).
- **วันที่สั่งซื้อตามบิล** — new `orderDate` state (defaults today) replaces วันที่รับสินค้า in the header field grid; represents the date printed on the supplier's bill.
- **วันที่รับสินค้า moved to sidebar** — compact date input added to สรุปใบรับสินค้า card under ผู้จัดจำหน่าย; still bound to `receiveDate` and saved as `receive_date` in the IPC payload.
- **วันครบกำหนด quick buttons** — four amber pills (15ว / 30ว / 60ว / 90ว) appear below the due date input when เครดิต is selected; each sets `dueDate` to today + N days.
- **ชำระแล้ว quick buttons** — วันนี้ (emerald) and วันครบกำหนด (amber, disabled when no due date) appear below the paid date input; วันครบกำหนด copies `dueDate` into `paidDate`.
- **หมายเหตุ section** — textarea card in sidebar between การชำระเงิน and save button; bound to `grNote` state. Saved via new `purchase_receipts` table (`invoice_no TEXT PRIMARY KEY, note TEXT, created_at`). IPC `purchase:save` now accepts optional `note` and does `INSERT OR REPLACE INTO purchase_receipts` inside the existing transaction. Schema added `CREATE TABLE IF NOT EXISTS purchase_receipts` — non-breaking for existing DBs. `grNote` reset on both save success and ล้างฟอร์ม.

## Purchase Page — Two-Row Table + Import Overhaul (2026-04-26)

### Line Items Table Redesigned (two-row layout per product)
- Each product entry now spans two `<tr>` wrapped in `<React.Fragment key={i}>`.
- **Row 1 (main):** # · ชื่อสินค้า · หน่วย · จำนวน · ราคาทุน · ราคาขาย · ส่วนลด · รวม · ×  — 9 columns total (was 12).
- **Row 2 (sub-row):** `colSpan={9}`, `bg-slate-50/50`, no border-top. Contains three compact inline fields — Lot No. input, วันผลิต DateInput, วันหมดอายุ DateInput — each with a tiny `text-[10px]` label above, indented `pl-10` to align under the product name column. Expiry color-coding (red/orange/yellow border) preserved.
- Active row highlight (`border-l-emerald-400 bg-emerald-100`) and partial row tint (`bg-amber-50/60`) applied to both rows in the pair; `border-l-2` indicator only on row 1.
- Removed Lot No. / วันผลิต / วันหมดอายุ column headers from `<thead>`.
- `<tfoot>` colSpan values updated: 12→9 (duplicates alert row), 10→7 (adjust subtotal rows + totals footer row).

### Import Modal — Custom Column Mapping
- Added `IMPORT_FIELD_OPTIONS` constant with 8 mappable field types: `Barcode/ชื่อ`, `จำนวน`, `Lot No.`, `วันผลิต`, `วันหมดอายุ`, `ราคารวม`, `ราคาทุน/หน่วย`, `— ข้าม —`.
- `importColumns` state (default `['key','qty','lot','mfg','exp','total']`) drives a row of compact dropdowns in the modal — one per column position, with `+` / `−` buttons to add/remove slots.
- Parser switched from fixed positional destructuring to mapping-based extraction (`colIdx` map + `pick(field)` helper). Minimum-6-cells guard removed; shorter rows parse correctly.
- New `ราคาทุน/หน่วย` field type supported; falls back to `total ÷ qty` when absent.
- Validation: import blocked (toast + greyed button + inline red badge) when no column is mapped to `Barcode/ชื่อ`.

### Import — Unmatched Rows Land in Table
- Previously: products not found in DB were blocked (toast error or resolve modal).
- Now: unmatched rows are added as empty rows with the supplier key text pre-filled in the product search input. They appear as partial (amber dot) so the user can immediately see which need manual product selection.
- Toast reports both counts: "นำเข้า N รายการ (พบ M · ไม่พบ K — กรุณาเลือกสินค้าด้วยตนเอง)".

## Purchase — Receive Ledger Refactor + Cancel + Edit Bill (2026-04-26)

Three-part rework around the GR data model. The first part fixes a long-standing data-loss bug in ประวัติการรับสินค้า where older GRs would silently disappear; the second adds a cancel-bill workflow on top; the third moves header metadata onto `purchase_receipts` so the new "edit bill" modal is coherent.

### Part 1 — `purchase_receipt_items` ledger (fixes the lot-merge bug)
- **The bug.** `purchase:save` used `(product_id, lot_number)` as a UNIQUE key on `product_lots`. When the same lot was received twice (top-up), the existing row's `qty_received`/`qty_on_hand` were incremented BUT `invoice_no`, `supplier_invoice_no`, `payment_type`, etc. were **overwritten** with the new GR's values. The history page read from `product_lots GROUP BY invoice_no`, so older GRs whose only lots got reused vanished from history; the newer GR also displayed the wrong `created_at` (still the lot's original creation date).
- **Schema** (`electron/db/schema.ts`, `electron/ipc/purchase.ts` migrations) — new `purchase_receipt_items` table: `id, invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date, cost_price, sell_price, qty, note, created_at`. Indexes on `invoice_no` and `lot_id`. This is an **immutable receive ledger** — one row per line per GR, never mutated by subsequent top-ups. `product_lots` stays as the mutable stock-state table.
- **One-time backfill** runs on startup when `purchase_receipt_items` is empty: copies one row per `(invoice_no, lot_id)` from existing `product_lots` using current `qty_received` as the contribution. GRs that were already overwritten by the lot-merge bug cannot be recovered — only the most recent `invoice_no` on each lot survives in `product_lots`. Going forward this never happens again because every save writes a fresh `purchase_receipt_items` row independently.
- **`purchase:save`** — still merges `product_lots` for stock state (intentional), but additionally inserts an immutable `purchase_receipt_items` row per line. Stock movement uses the resolved `lotId` from either the UPDATE or INSERT branch.
- **`purchase:nextGRNumber`** now reads from `purchase_receipts` (the actual GR header table) instead of the lots table.
- **`purchase:history`** rewritten to read from `purchase_receipts` joined to `purchase_receipt_items` for counts/totals. Old GRs no longer disappear when their lots are reused.
- **`purchase:getReceipt`** rewritten to read `pri.qty as qty_received` (the exact qty contributed by THIS GR, not whatever the lot currently holds), `pri.created_at` (the receive date for this specific GR), etc.

### Part 2 — Cancel-bill workflow
- **Header columns added to `purchase_receipts`**: `status TEXT NOT NULL DEFAULT 'completed'`, `cancelled_at TEXT`, `cancelled_by INTEGER REFERENCES users(id)`, `cancel_reason TEXT`. Migrated via idempotent ALTERs.
- **`purchase:cancel({ invoice_no, reason, userId })`** — soft-cancel handler mirroring the sales-void pattern:
  - Validates: header exists, not already cancelled, reason text required.
  - Stock check: each line's contribution qty must still be on hand. If any blocker is found (sold/consumed), returns `{ success: false, error: 'stock_consumed', blockers: [...] }` with `trade_name`, `lot_number`, `need`, `have` per blocking line. The transaction is **not** opened until validation passes, so cancellation is all-or-nothing.
  - On success in one transaction: subtracts `pri.qty` from each lot's `qty_on_hand` + `qty_received`, marks the lot `is_closed=1` if exhausted, inserts `stock_movements` with `movement_type='purchase_return'` + `ref_type='gr_cancel'`, recomputes `products.cost_price` as weighted avg over remaining open lots per touched product, sets `purchase_receipts.status='cancelled'` + `cancelled_at` + `cancelled_by` + `cancel_reason`.
- **`purchase:history`** — added `status` filter (`completed | cancelled | all`). Summary cards (`total_cost`, `unpaid_cost`) exclude rows where `status='cancelled'`.
- **UI — history list** ([src/pages/Purchase/index.tsx](src/pages/Purchase/index.tsx))
  - Filter chips now include "ยกเลิกแล้ว" (red when active, slate border otherwise). `loadHistory` sends `status='cancelled'` when this chip is picked.
  - List rows: cancelled bills get `opacity-70`, slate left border, line-through on the invoice number and total amount, plus a red "ยกเลิก" pill in the metadata strip.
- **UI — detail panel**
  - Red banner at the top of cancelled bills (`AlertTriangle` icon + `บิลถูกยกเลิก · <date>` + `เหตุผล: <reason>`).
  - "ยกเลิกบิล" red outline button in the header (hidden when already cancelled).
  - Confirm dialog: required reason `Textarea`, warning copy explaining stock will be returned. If backend returns `stock_consumed`, the blocker list renders inline as a red bordered box listing each product/lot/need-vs-have so the user knows exactly what to do.
- **Preload** — `window.api.purchase.cancel({ invoice_no, reason, userId })`.

### Part 3 — Edit-bill (header) modal
The "edit bill" feature (supplier, supplier invoice no, order date, receive date, payment type) required the same fix as part 1 but for header metadata: those fields lived on `product_lots` (last-write-wins across shared lots), so editing GR-A could corrupt GR-B's view of a shared lot.
- **Header columns added to `purchase_receipts`**: `supplier_id`, `supplier_invoice_no`, `order_date`, `payment_type`, `due_date`, `is_paid`, `paid_date`. Migrated via ALTER + idempotent backfill that copies from any matching `product_lots` row when fields are still NULL.
- **`purchase:save`** — now writes header metadata to `purchase_receipts` (still writes the same fields to `product_lots` for stock-display compatibility, but reads no longer depend on it).
- **`purchase:history` / `purchase:getReceipt`** — now read supplier/payment/dates straight from `purchase_receipts`. No more subqueries on `product_lots` for header data. History list search now matches against `pr.invoice_no` and `pr.supplier_invoice_no`.
- **`purchase:updateHeader({ invoice_no, supplier_id, supplier_invoice_no, order_date?, receive_date, payment_type, due_date?, is_paid, paid_date?, userId })`** — new handler.
  - Refuses with `error: 'cancelled'` when the GR is cancelled. Field-level errors: `supplier_required`, `supplier_invoice_required`, `receive_date_required`, `due_date_required`.
  - In one transaction: updates `purchase_receipts` (header metadata + `created_at = receive_date`), and updates every `purchase_receipt_items.created_at` for this invoice so the detail panel's วันที่รับสินค้า stays consistent. **Never touches `product_lots`** — edits cannot corrupt other GRs that share a lot.
- **UI — detail panel** — "แก้ไขบิล" emerald outline button next to "ยกเลิกบิล" (hidden when cancelled).
- **UI — edit modal** — `Dialog` with: supplier `<select>`, supplier invoice no `Input`, order date + receive date `DateInput`s in a 2-col grid, payment-type chips (cash/credit), and a credit sub-panel that appears when credit is selected: due date `DateInput`, ชำระแล้ว `Checkbox`, paid date `DateInput` (only when `is_paid` is checked). On save: refreshes both the detail panel and the history list.
- **Preload** — `window.api.purchase.updateHeader(payload)`.

### Smaller related changes
- New `order_date TEXT` column on `product_lots` and `purchase_receipts` (วันที่สั่งซื้อตามบิล — the supplier's bill date, distinct from receive date). The receive form already had this field but was discarding it; it's now persisted on save and read back in the detail panel.
- Detail panel now shows BOTH วันที่สั่งซื้อตามบิล and วันที่รับสินค้า in a 2×2 grid (with ผู้จำหน่าย and เลขที่ใบกำกับสินค้า).

## Date Pickers — Shadcn Calendar + Range Picker (2026-04-26)

Replaced the custom hidden-native `<input type="date">` calendar trigger with a shadcn-style Popover+Calendar, and added a range picker with presets for the GR history filter.

### Dependency
- `react-day-picker@^8` installed via `npm install react-day-picker --ignore-scripts` so the prebuilt `better-sqlite3` native binary stays intact. `date-fns` and `@radix-ui/react-popover` were already installed.

### `src/components/ui/calendar.tsx` (new)
- Shadcn Calendar wrapper around `react-day-picker` v8. Themed via `buttonVariants({ variant: 'ghost' })` for day cells and `outline` for nav arrows so it picks up the project's emerald primary automatically.
- Standard shadcn classNames (head_cell, day_selected, day_today, day_outside, day_range_*) — works for both `mode="single"` and `mode="range"`.

### `src/components/ui/date-input.tsx` (rewritten internals)
- **Public API unchanged** — same `<DateInput value={iso} onChange={(iso) => ...} />` shape, all callers work as before.
- Typeable `dd/mm/yyyy` input preserved (auto-formatting via `autoFormat`, `displayToIso`, `isoToDisplay` helpers). Copy/paste workflow for mfd/exp on the GR receive form intact.
- The calendar icon button now opens a shadcn `Popover` with `Calendar` (mode="single") instead of triggering a hidden native `<input type="date">`. Picking a day writes the ISO out and closes the popover.
- The hidden native input was removed entirely.

### `src/components/ui/date-range-picker.tsx` (new)
Reusable range picker for filtering by date intervals.
- **Trigger:** button styled to match `Input` (h-8, border-input, rounded-md), shows `dd/mm/yyyy – dd/mm/yyyy` or single date if same day, or the placeholder when empty.
- **Popover layout:** preset rail on the left + 2-month `Calendar` (`mode="range"`, `numberOfMonths={2}`) on the right.
- **8 presets (Thai):** วันนี้, เมื่อวาน, 7 วันล่าสุด, 30 วันล่าสุด, เดือนนี้, เดือนที่แล้ว, ปีนี้, ทั้งหมด (the last clears the range).
- **Behaviour:**
  - Preset click → fires onChange, closes popover immediately.
  - First click in calendar → writes start ISO so the trigger label updates to a single date, popover stays open.
  - Second click in calendar (range complete) → fires onChange, closes popover.
- **API:** `<DateRangePicker from={iso} to={iso} onChange={(from, to) => ...} />` — both empty strings when cleared.

### Wired into ประวัติการรับสินค้า filter ([src/pages/Purchase/index.tsx](src/pages/Purchase/index.tsx))
- `loadHistory` now accepts an optional third arg `dateOverride: { from: string; to: string }` (same pattern as the existing `filterOverride` for payment chips) so preset clicks reload immediately without stale-state issues from the memoized callback.
- The two `DateInput` fields (`จากวันที่` / `ถึงวันที่`) replaced with a single `DateRangePicker` labelled `ช่วงวันที่`. `onChange` sets state AND calls `loadHistory(1, undefined, { from, to })` — no extra search-button press needed for date filter changes.
- Mfd / exp / receive-date / order-date / due-date / paid-date fields elsewhere in the page still use `DateInput` — unchanged.

---

## Products/EditProduct UI Overhaul (2026-05-12)

### card.tsx — Three exported card components share an absolute-icon layout
- `StatCard` (was a local helper in `pages/Products/index.tsx`) moved to `src/components/ui/card.tsx`. Clickable filter card. Props: `label`, `value`, `icon` (lucide ComponentType), `tint`, `isActive`, `onClick`. Active state draws a `ring-2` in the tint family (primary/warning/destructive/success/secondary).
- `MetricCard` redesigned for the EditProduct top row. Icon is now `absolute top-4 right-4` (out of layout flow), text container has `pr-14` so it doesn't overlap the icon, content flows from the top — value remains big (`text-3xl tabular-nums leading-none`). Added three className escape hatches: `labelClassName`, `valueClassName`, `subClassName`. Use them to override individual elements via `cn()` without touching the component (e.g. profit-color sub: `subClassName={profit >= 0 ? 'text-success font-semibold' : 'text-destructive font-semibold'}`).
- `SectionCard` unchanged.
- **Layout pattern memo:** when a card has a fixed `h-32` and you want headline + supporting text + an icon, prefer absolute-positioned icon over flex-row layout. Flex-row makes the icon's height (size-11 = 44px) dominate the row, pushing text content down. Absolute icon keeps text starting at the top of the content box.

### tabs.tsx — New `segmented` variant (Apple-style segmented control)
- TabsList: `bg-card rounded-xl p-1 gap-1`, `inline-grid grid-flow-col auto-cols-fr` so every trigger is forced to the width of the longest one (set on the data-attribute variant selector so it overrides the base `inline-flex` due to higher specificity).
- TabsTrigger active: `bg-tertiary text-tertiary-foreground shadow-sm` (works in both light + dark — light tertiary is yellow `43 100% 64%`, dark tertiary is dark gray).
- Used in `EditProduct.tsx` with lucide icons inline: `<TabsTrigger><FileText /> ข้อมูลทั่วไป</TabsTrigger>` etc. Icons auto-size to `size-4` via the existing `[&_svg:not([class*='size-'])]:size-4` rule on the trigger.

### Products/index.tsx — "สินค้าทั้งหมด" stat always shows absolute total
- `products:stockStats` IPC now returns `total_all` alongside `out` / `low`. The first two respect q/category_id/drug_type_id, but `total_all` is just `SELECT COUNT(*) FROM products [WHERE is_disabled=0]` — only the `include_disabled` toggle affects it, never the search/category filters. Reason: the headline number shouldn't shrink as the user narrows the list.
- StatCard rendered inline (no local component definition in the page file).

### EditProduct.tsx — top row + tabs + tab tables all redesigned
- Meta card (col 1 of 4): `bg-card rounded-2xl p-4 h-32 overflow-hidden relative`. Trade name is the prominent header (`text-base font-bold truncate`), second line is `<font-mono>{code}</font-mono> · {category}`, badges row below. Icon `Package size-11` absolute top-right. Long names get truncated + `title={trade_name}` for hover.
- 4 cards reordered: meta → ราคาทุน → ราคาขาย → คงเหลือ.
- ราคาขาย card sub uses the new `subClassName` to color profit green/red and format `+53.00 (+74%)`.
- Tabs use `variant="segmented"` with icons (FileText/Boxes/Pill/Package). Tabs root has `className="items-center"` so the `w-fit` TabsList sits centered horizontally on the page.
- All three tabs (units/labels/lots) now use the **Products-list table pattern**:
  - Outer wrapper: `bg-card rounded-2xl shadow-card overflow-hidden`
  - Inner top: white header bar `px-5 py-2.5 text-sm font-semibold text-muted-foreground flex items-center justify-between` — title + Plus button on units/labels, info banner with Edit2 icon on lots
  - Table wrapper: `[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card` (the 8px borders blend with the card bg, creating an inset)
  - `<Table className="table-fixed">` with explicit `w-XX` widths on every TableHead
  - Header sticky: `[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted`
  - Row hover: `hover:bg-primary-soft/60 transition-colors`
  - Action buttons in rows: `size="icon-xl" variant="outline"` (not `size="sm" variant="ghost"` anymore)
  - Status bar at bottom: `border-t border-border px-5 py-2.5 text-xs text-muted-foreground` with count/breakdown stats
  - Empty state: lucide icon + Thai message, `py-16` padding
- Labels tab is a list (not a table) so it skips `table-fixed`, but follows the same wrapper/header/status-bar/inset pattern. Label rows separated by `divide-y divide-border`.
- Units table: removed `บาร์โค้ด` column, added `ราคาส่ง 2`. Header "จำนวนต่อหน่วยหลัก" shortened to "ต่อหน่วยหลัก" (the column data already says "จำนวน" by being a number).

### `[scrollbar-gutter:stable]` on tab content scroller
- Symptom: switching between tabs caused a ~12-15px horizontal shift because some tabs' content was tall enough to show a vertical scrollbar and others weren't, so the centered tab list moved as the scrollbar appeared/disappeared.
- Fix: `[scrollbar-gutter:stable]` reserves the scrollbar gutter even when not scrolling. Applied to the parent scroll container that wraps both the Tabs and the tab content.

### Base unit invariant — now hard-enforced at IPC layer
- **`products:addUnit`** — payload's `is_base_unit` is overwritten to 0. Only `products:create` may insert a base unit row.
- **`products:updateUnit`** — `is_base_unit` is stripped from the payload. If the row being edited has `is_base_unit=1`, the handler only accepts `unit_id` from the rest (everything else is rejected — pricing/barcode/qty_per_base for the base unit live in the products table now).
- **`products:deleteUnit`** — throws `"ลบหน่วยหลักไม่ได้ — ทุกสินค้าต้องมีหน่วยหลัก 1 รายการเสมอ"` if the row is the base unit. (Frontend already hides the delete button for base units; this is defense in depth for direct IPC callers.)
- **`products:update`** — now runs inside a `db.transaction()`. After updating `products`, mirrors `price_retail`/`price_wholesale1`/`price_wholesale2` to the `product_units` row where `is_base_unit=1`, so legacy joins that read prices from `product_units` keep getting the same numbers as the products table.
- **Frontend (EditProduct unit dialog):**
  - Title: "เพิ่มหน่วยนับ" / "แก้ไขหน่วยนับ" / "แก้ไขหน่วยหลัก" — branched on `editingUnit?.is_base_unit`.
  - Base-unit edit body: only the unit_id `<SelectField>` is shown, with a note "หน่วยหลักดึงราคา/บาร์โค้ดจากตัวสินค้าโดยอัตโนมัติ — แก้ไขได้ที่แท็บ ข้อมูลทั่วไป". All price/barcode/qty/sale/purchase inputs hidden.
  - Non-base edit + add: removed the `หน่วยหลัก` Toggle entirely. Only `ใช้ขาย` / `ใช้ซื้อ` remain.
  - `handleSaveUnit`: three branches now — base-unit edit sends only `{ unit_id }`, non-base edit sends everything except `is_base_unit`, add sends everything except `is_base_unit`.

### Source of truth (consolidated)
- **Base unit** (`product_units` row with `is_base_unit=1`): `unit_id` is editable. Pricing/barcode/qty_per_base mirror the `products` table — `products:update` syncs the mirror columns automatically.
- **Non-base units** (alternative units like แผง, กล่อง): own their `barcode`/`price_*`/`qty_per_base`/`is_for_sale`/`is_for_purchase`. Independent of products table.
- **POS join** (unchanged): `pos:searchProducts` still resolves the base unit's display name via `LEFT JOIN product_units pu_base ON pu_base.product_id = p.id AND pu_base.is_base_unit = 1 LEFT JOIN item_units u ON u.id = pu_base.unit_id`. Pricing read from `products.*` for the base, `product_units.*` for non-base.

---

## 🚧 IN PROGRESS — Theme tokenization (start here next session)

### Goal
Make the entire app re-themable by editing **only** `src/index.css`. Remove all Tailwind palette literals (`bg-blue-500`, `text-slate-600`, `border-amber-200`, etc.) and replace with semantic CSS-variable-backed classes (`bg-primary`, `text-foreground`, `bg-warning-soft`, etc.).

### Why
User wants easy brand-color switching. Originally emerald green; today changed to blue `#0485F7`. Going forward, theme swaps should be one-file edits. Hard rules now codified in [CLAUDE.md](CLAUDE.md) under "UI Conventions → Theming rules (HARD)".

### What's already done (this session, 2026-04-30)
1. **Theme color** — emerald → blue `#0485F7` (HSL `208 97% 49%`). Both `:root` and `.dark` blocks updated in [src/index.css](src/index.css). All `emerald-*` literals across [POS](src/pages/POS/index.tsx), [Purchase](src/pages/Purchase/index.tsx), [UIComponents](src/pages/UIComponents/index.tsx), [Sidebar](src/components/layout/Sidebar.tsx), [TitleBar](src/components/layout/TitleBar.tsx) renamed to `blue-*` (1 stale `'emerald'` color-name string remains in UIComponents palette picker — intentionally left).
2. **Switch component** ported to HeroUI visual style ([src/components/ui/switch.tsx](src/components/ui/switch.tsx)) — pill-shaped thumb, margin-based slide, added `lg` size variant.
3. **17 new semantic tokens** added to [src/index.css](src/index.css) (light + dark) and registered in [tailwind.config.js](tailwind.config.js):
   - `--foreground-subtle`, `--surface-hover`, `--border-strong`
   - `--primary-soft`, `--primary-soft-hover`, `--primary-soft-border`, `--primary-strong`
   - `--success` + `-foreground` + `-hover` + `-soft`
   - `--warning` + `-foreground` + `-hover` + `-soft` + `-strong`
   - `--destructive-soft`, `--destructive-strong`
4. **CLAUDE.md updated** with "Theming rules (HARD — do not break)" subsection: no palette literals, add tokens when missing, no inline UI primitives, layout utilities still allowed.
5. **Pilot conversion** done on [Sidebar.tsx](src/components/layout/Sidebar.tsx) (1 line) — verified pattern works.

### Remaining files (in suggested order — easiest → hardest)
**Decisions already locked in:** include `src/components/ui/*`, file-by-file (not batch), collapse `slate-500/600` → single `--muted-foreground`.

| Order | File | Lit count | Notes |
|------:|------|----------:|-------|
| 1 | [src/components/layout/TitleBar.tsx](src/components/layout/TitleBar.tsx) | 4 | Sidebar context — use `--sidebar-*` tokens like the Sidebar pilot |
| 2 | [src/components/ui/badge.tsx](src/components/ui/badge.tsx) | 4 | `success`/`warning`/`danger` variants → use new `bg-success`/`bg-warning`/`bg-destructive` |
| 3 | [src/components/ui/button.tsx](src/components/ui/button.tsx) | 3 | Same pattern as badge variants |
| 4 | [src/components/ui/toast.tsx](src/components/ui/toast.tsx) | 3 | Same pattern |
| 5 | [src/components/ui/date-input.tsx](src/components/ui/date-input.tsx) | 1 | quick |
| 6 | [src/components/ui/date-range-picker.tsx](src/components/ui/date-range-picker.tsx) | 3 | quick |
| 7 | [src/pages/Reports/Sales.tsx](src/pages/Reports/Sales.tsx) | 17 | mostly status colors |
| 8 | [src/pages/Reports/Purchases.tsx](src/pages/Reports/Purchases.tsx) | 1 | trivial |
| 9 | [src/pages/Products/index.tsx](src/pages/Products/index.tsx) | 1 | trivial |
| 10 | [src/pages/Products/EditProduct.tsx](src/pages/Products/EditProduct.tsx) | 2 | trivial |
| 11 | [src/pages/UIComponents/index.tsx](src/pages/UIComponents/index.tsx) | 4 | demo page |
| 12 | [src/pages/POS/index.tsx](src/pages/POS/index.tsx) | 136 | the search-result row hover/highlight is the tricky part — see CLAUDE.md POS rules |
| 13 | [src/pages/Purchase/index.tsx](src/pages/Purchase/index.tsx) | 270 | biggest — many soft/strong brand bg + amber warning + green profit chips |

**Total remaining: ~449 literal occurrences across 13 files.**

### Mapping cheat sheet (use this when converting)
| Tailwind literal | Semantic token |
|---|---|
| `bg-blue-50` / `bg-blue-100` | `bg-primary-soft` / `bg-primary-soft-hover` |
| `border-blue-200` / `border-blue-300` | `border-primary-soft-border` |
| `text-blue-600` / `text-blue-700` / `text-blue-800` | `text-primary` / `text-primary-strong` |
| `bg-blue-500` / `bg-blue-600` | `bg-primary` / `bg-primary-hover` |
| `text-slate-700` / `text-slate-800` / `text-slate-900` | `text-foreground` |
| `text-slate-500` / `text-slate-600` | `text-muted-foreground` (collapsed) |
| `text-slate-400` / placeholder | `text-foreground-subtle` |
| `bg-slate-50` | `bg-surface-hover` |
| `bg-slate-100` | `bg-muted` |
| `border-slate-200` / `border-slate-100` | `border-border` |
| `border-slate-300` | `border-border-strong` |
| `bg-green-600` / `bg-green-700` | `bg-success` / `bg-success-hover` |
| `bg-green-50` / `bg-green-100` | `bg-success-soft` |
| `text-green-600` / `text-green-700` | `text-success` |
| `bg-amber-50` / `bg-yellow-50` | `bg-warning-soft` |
| `bg-amber-500` / `bg-yellow-500` | `bg-warning` |
| `bg-amber-600` / `bg-yellow-600` | `bg-warning-hover` |
| `text-amber-700` / `text-amber-800` | `text-warning-strong` |
| `bg-red-50` / `bg-red-100` | `bg-destructive-soft` |
| `bg-red-500` / `bg-red-600` | `bg-destructive` |
| `text-red-600` / `text-red-700` | `text-destructive` |
| `bg-white` (cards) | `bg-card` |
| `text-white` | `text-primary-foreground` (on brand bg) or `text-sidebar-accent-foreground` (on sidebar) |

### Sidebar context exception
Anything that lives on the dark sidebar surface uses `--sidebar-*` token family, NOT `--primary-*`. See completed Sidebar.tsx for pattern: `text-blue-300` → `text-sidebar-primary-foreground`, `hover:bg-blue-600` → `hover:bg-sidebar-accent`, `hover:text-white` → `hover:text-sidebar-accent-foreground`.

### Verification command (after each file)
```bash
# from project root, should drop monotonically toward 0:
grep -rE "(bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]" src/ | wc -l
```
Last reading: **450** (before any conversion). After Sidebar pilot: **449** (only the 1 `'emerald'` palette-name string remains as a non-class literal).

### Not started — uncommitted git state
Today's session left everything as **uncommitted working changes**. Files modified:
```
M src/components/ui/button.tsx          (still has 3 lits — to be converted)
M src/components/ui/switch.tsx          (HeroUI port — done)
M src/index.css                         (blue brand + 17 new tokens — done)
M src/pages/POS/index.tsx               (emerald→blue done; 136 lits remain)
M src/pages/Purchase/index.tsx          (emerald→blue done; 270 lits remain)
M src/components/layout/Sidebar.tsx     (1 lit converted — pilot done)
M src/components/layout/TitleBar.tsx    (emerald→blue done; 4 lits remain)
M src/pages/UIComponents/index.tsx      (emerald→blue done; 4 lits remain)
M tailwind.config.js                    (new tokens registered — done)
M CLAUDE.md                             (theming rules added — done)
M PROGRESS.md                           (this entry — done)
```
Suggested commit at any natural break: `style: tokenize colors — sidebar+titlebar+ui` etc.

### Open question for next session
Should `src/components/ui/button.tsx`'s `secondary` variant `border-gray-300 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/60` collapse to `border-border hover:bg-surface-hover`? Loses the dark-mode-specific shade tweaks. User said "collapse" — leaning yes, but worth a 5-second eyeball after conversion.

---

## Session 2026-05-01 — Return Items System

### Goal
Add a full freeform return-items flow to the POS page. Staff scans a barcode, selects the lot, enters qty, builds a return list, enters a reason, and confirms. Daily totals decrease automatically.

### Implementation strategy: Option B
Create a **negative `sales` record** (`sale_type='return'`, `total_amount = -sum`) so `getDailyStats`'s `SUM(total_amount)` decreases without any query change. No payment dialog needed.

Invoice series: **RT-YYYYMMDD-NNN**

### Files changed

#### `electron/ipc/pos.ts`
- Replaced stub `pos:returnItems` with full Option B transaction:
  - Generates `RT-YYYYMMDD-NNN` invoice number
  - Inserts negative `sales` row (`total_amount = -totalAmount`)
  - Per item: inserts negative `sale_items` (qty, line_total negated) + `sale_item_lots` (qty negated) + restores `product_lots.qty_on_hand` + inserts `stock_movements` (`movement_type='sale_return'`, positive `qty_change`, `ref_id = saleId`)
  - Returns `{ success, invoice_no, count, total_amount }`

#### `electron/preload.ts`
- Added `returnItems: (payload: any) => ipcRenderer.invoke('pos:returnItems', payload)` to `pos` namespace

#### `src/pages/POS/index.tsx`
- New `ReturnLineItem` interface: `{ product_id, lot_id, product_name, unit_name, lot_number, expiry_date, qty, sell_price, line_total }` — uses `lot.sell_price` (not cost) as refund price
- 12 new state vars: `showReturn`, `returnQuery`, `returnResults`, `returnSearching`, `returnSelectedProduct`, `returnProductLots`, `returnSelectedLotId`, `returnQtyInput`, `returnList`, `returnReason`, `returnSaving`, `returnInputRef`
- `handleAddReturnItem`: merges duplicate product+lot entries; `line_total = qty × sell_price`
- `handleConfirmReturn`: sends payload to `window.api.pos.returnItems`, calls `loadDailyStats()` on success, resets state
- "คืนสินค้า" button in right panel with warning styling
- Return dialog: `DialogContent size="2xl"` → two-column `DialogBody` (`flex gap-0 p-0 overflow-hidden rounded-xl h-[460px]`)
  - Left column: barcode search input → product results or lot picker
  - Right column: return list, `ยอดคืนรวม` total, reason textarea, confirm button
  - Big +/− qty buttons (`h-12 w-12`) with large centered input (`text-2xl font-bold`)

#### `CLAUDE.md`
- Theming Rule 1: added "Opacity modifiers allowed: `bg-primary/30`, `border-warning/40`"
- Theming Rule 3: explicit mappings — `<button>` → `<Button variant="...">`, `<input>` → `<Input>`, raw dialog → `<Dialog>` with all sub-components
- Theming Rule 4 (new): mandatory dialog structure — every `DialogContent` must contain `DialogHeader` + `DialogTitle` + `DialogBody` + `DialogFooter`

### Key decisions
- `sell_price` (lot's sell price) used as refund unit price — mirrors what customer paid
- Two-column layout inside `DialogBody` achieved by overriding default `p-4` with `p-0` via `cn()` (twMerge)
- `loadDailyStats()` called post-confirm — header total updates immediately without page reload

### Uncommitted changes (continuation from previous session)
All changes above are uncommitted working tree modifications.

---

## Session 2026-05-02 — POS Reskin (Teal + Yellow design from claude_design/POS Sales.html)

### Goal
Reskin the POS page (colors + layout rearrangement) to match a high-fidelity HTML design dropped in `claude_design/POS Sales.html`. **Visual only — no logic, IPC, or interaction redesign.** User explicitly said "keep current cell-btn interaction style and change only color" — so unit/qty/price/discount editors stay as inputs/dropdowns.

### Brand color change (global — affects all pages)
Primary swapped **blue `#0485F7` → teal `#0F5D56`** (light) / `#2BA396` (dark). Accent swapped **blue-tinted → yellow `#F5C24A`**. Other pages still need adjustment (user said they'll do those later — Q2).

### Files changed

#### `src/index.css`
- `--primary` → teal `175 72% 21%` light / `173 58% 40%` dark
- `--primary-soft` → teal-tint `168 22% 91%` light / `173 24% 13%` dark
- `--primary-soft-hover`, `--primary-soft-border`, `--primary-strong`, `--primary-hover` retinted teal
- `--accent` → yellow `42 90% 63%` (was blue tint)
- `--accent-foreground` → dark brown `44 100% 8%` (was blue text)
- `--ring` → teal tint `175 35% 75%`
- `--sidebar-accent` → yellow (was near-black) so active nav row turns yellow
- `--sidebar-accent-foreground` → dark brown
- `--selection-bg` → teal-tinted
- **Added** `--accent-soft` (`#FCEFC8` light / `#2C2410` dark) for soft yellow surfaces
- **Added** `--shadow-card` for the design's soft card shadow (light + dark variants)
- Comment header changed from "Blue brand" → "Teal brand / Yellow accent"

#### `tailwind.config.js`
- Registered `accent.soft: 'hsl(var(--accent-soft))'`
- Registered `boxShadow.card: 'var(--shadow-card)'` (use as `shadow-card`)

#### `src/components/layout/Sidebar.tsx`
- Logo block: `bg-sidebar-accent-foreground` (dark brown) → `bg-primary` (teal). The "Rx Syntropic" mark now sits on a teal block.
- Active nav item: `bg-sidebar-accent/10 text-sidebar-accent-foreground` (10% blue tint) → `bg-sidebar-accent text-sidebar-accent-foreground font-semibold` (full yellow + dark brown).
- Inactive hover: `hover:bg-sidebar-accent/10` → `hover:bg-accent-soft`.
- **Bug fix:** removed the inner `<span class="text-sidebar-foreground">` color override that was making active-state label text wrong (parent text color now inherited correctly).

#### `src/pages/POS/index.tsx` (the bulk of the work)
Layout rearrangement (matches `claude_design/POS Sales.html`):

- **Header** simplified — was "Rx Syntropic / หน้าจอขายสินค้า" + `วันที่: ... เวลา: ...` two-line block. Now a single row: `<h1>หน้าจอการขายสินค้า</h1>` left + `dateStr · timeStr` meta on the right (`text-foreground-subtle text-[13px]`).
- **Toolbar card** restructured into a 2-column grid (`minmax(0,1fr) minmax(260px,320px)`):
  - Left col stacks: search input row (`bg-muted` pill with `Search` icon + `<Input>` + `F2` kbd badge) over a full-width retail/wholesale segmented control (2 buttons in a `bg-muted` track, white pill on active). Replaced the previous horizontal switch UI.
  - Right col: customer card with 44×44 avatar circle (`bg-primary-soft`, shows initials or `<User>`), name + meta lines, and a vertical action stack: `ดูข้อมูล` (outline) + `+ เพิ่มลูกค้า` (primary teal). Avatar + name area both clickable → `setShowCustomerSearch(true)`.
- **Customer alert banner** (when `is_alert`) now sits between the toolbar and cart card as its own rounded pill (was inside the cart container).
- **Cart card** is now a single `bg-card border rounded-2xl shadow-card` wrapper holding tabs + table + footer (was three loose elements).
  - **Tab strip + clear-all** in one row at the top of the cart card. Tabs are pill-style (`px-3.5 py-2 rounded-lg border`), active = `bg-primary-soft text-primary border-transparent`. Each tab shows: 1.5px dot + `รายการขาย {n}` + inline mono count (only when count > 0). Reverted from the badge-above-label tab-6 style we added two commits ago to match the HTML design's inline-count layout. The `ลบสินค้าทั้งหมด` clear-all button sits on the right of the same row (`bg-destructive-soft text-destructive`).
  - **Table header** restyled: column labels are now 11px uppercase `tracking-wider text-foreground-subtle` (was bold muted). Renamed "รายการสินค้า" → "ชื่อสินค้า", "ราคา/หน่วย" → "ราคา", "รวมเงิน" → "รวม" to match the design's column names.
  - **Cart footer** restructured to 3 cells per design: `จำนวนรายการ` left (e.g. `5 / 12 ชิ้น`), spacer flex-1, `ส่วนลด` right (red, only when > 0), `ราคารวม` right (15px semibold). Removed the old single-row summary line.
- **Right column** widened from `w-64` (256px) to `w-80` (320px). Top → bottom:
  1. **Total card** — `bg-primary text-primary-foreground rounded-2xl p-6 shadow-card`. Label "ยอดสุทธิ" + giant 48px IBM Plex Mono–style amount with a 26px ฿ symbol at 70% opacity. Meta row with top-divider: "รวม N รายการ · M ชิ้น" + ส่วนลด (only when > 0). VAT was in the design but the cart store doesn't track it — substituted with discount info; if VAT is wanted later, add `totalVat()` to the cart store.
  2. **Pay button** — `bg-accent text-accent-foreground rounded-2xl` with a yellow glow `shadow-[0_8px_20px_-10px_rgba(245,194,74,0.6)]`. Label "ชำระเงิน" + sublabel "เงินสด · โอน · บัตร · QR" + right `<ChevronRight>`. Hover lifts 1px.
  3. **Quick actions** — vertical stack of 4 outline buttons (per HTML — NOT a 2×2 grid as the README said): `เปิดลิ้นชัก` / `พิมพ์ฉลาก` / `รับคืนสินค้า` / `ยกเลิกบิล`. `พิมพ์ฉลาก` is `disabled` (no flow yet, per Q1). The "F9" payment button keybinding hint was dropped from the pay button — keybinding still works.
  4. **Daily summary card** — `bg-card border rounded-2xl shadow-card`. Head row: `สรุปยอดขายวันนี้` + date pill (`bg-muted` rounded-full, today's `dateStr`). 2-col grid: `บิลล่าสุด` / `จำนวนบิล`, then full-width `ยอดรวมของวัน` row above a top-border, value in `text-primary` mono.
- **Imports** — added `Tag` from lucide-react for the พิมพ์ฉลาก quick action icon.

### What was NOT touched (per user)
- **Cell-btn interaction redesign** — the HTML design uses click-to-edit pill buttons for unit/qty/price/discount that open popovers. Current code uses inline `<Input>`s and `<Button>` chips that open modals. User explicitly said "keep current style, change only color" — so the existing chip-styled buttons stay as-is. Only their backgrounds harmonize with the new teal/yellow palette via existing `bg-primary-soft` / `bg-warning-soft` / `bg-destructive-soft` tokens.
- **Fonts** — user said "Font touch font setting" meaning *don't touch fonts*. GoogleSans stays as the default. The HTML uses IBM Plex Sans Thai + Plex Mono — not adopted.
- **Layout sidebar width** — design shows a 220px text+icon sidebar. Current shared `Sidebar` is 80px icon-only and used by every page. Left as-is; user is OK with global brand color change but didn't ask for sidebar width change.
- **Other pages** — primary color change ripples to every page that uses `bg-primary` / `text-primary` / `bg-accent` etc. User confirmed they'll adjust those next.

### TypeScript verification
- 68 pre-existing errors before, 68 after the changes. Zero new errors in `src/pages/POS/index.tsx`. The one error in `src/components/layout/Sidebar.tsx` line 38 (`Type '{ className: string; }' is not assignable to type 'IntrinsicAttributes'`) is pre-existing — `icon: React.ComponentType` type signature missing the `<{ className?: string }>` generic — not introduced this session.

### Visual testing
- **NOT done** — Claude Code can't render the Electron UI. User must run `npm run electron:dev` to verify. Per CLAUDE.md "If you can't test the UI, say so explicitly rather than claiming success."

### Reference files
- `claude_design/POS Sales.html` — the design source. **This is the authoritative reference**, not the README in the same folder. The README description differed from the HTML in three important places: cart table column layout (HTML is unit/qty/price/discount cell-buttons + no thumbnails; README implied a thumbnail and a qty stepper), cart footer (HTML has 3 cells, README said 4), quick actions (HTML is vertical stack, README said 2×2 grid).
- `claude_design/README.md` — design tokens reference (color tables, typography, spacing). Useful for spec-level info but trumped by the HTML for actual layout decisions.

### Uncommitted changes
All changes above are uncommitted working tree modifications.

---

## Session 2026-05-04 — POS Customer Card Redesign + Button Icon Sizing Fix

### Goal
Redesign the customer card in POS so it stops looking like a 4th cart slot, and fix a hidden Tailwind/Button bug that was silently shrinking icons.

### Customer card redesign (`src/pages/POS/index.tsx:615-648`)
Iterated four times against user direction:

1. **Removed cart-slot mimicry** — was identical h-40 card with header label + corner icon + big number. Replaced with a 2-column internal layout (profile column / actions column).
2. **Matched user sketch** (`sketch.png`) — restructured into a vertical split:
   - **Top: profile box** — horizontal layout. Avatar circle (`size-14 rounded-full bg-primary-soft text-primary`) on the left, name + phone text on the right. Allergy badge "แพ้ยา" (`bg-destructive-soft text-destructive`) absolutely positioned at top-right of the box, shown when `food_allergy || other_allergy`.
   - **Bottom: action row** — 2-column grid of `ดูข้อมูล` (quaternary, disabled when no customer) + `เพิ่มลูกค้า` (tertiary), equal width, `h-9`.
3. **Main card wrap** — wrapped both sections in `bg-card rounded-2xl p-3` so the whole customer cell reads as one card matching the cart slots' visual weight. Inner profile box's own `bg-card` removed (no double-card).
4. **Alert moved inside the card** — the standalone destructive-soft banner that previously sat between the top row and the cart card was deleted. `alert_note` now renders as a small `text-xs text-destructive font-medium` row below the phone number, with an inline `AlertTriangle` icon. Single-line truncated; full text remains in the customer info dialog.

Renamed the `+ เพิ่ม` button to `เพิ่มลูกค้า` per sketch.

### Button icon sizing fix (`src/pages/POS/index.tsx`, 24 icons across the file)
**The bug** — `button.tsx:18` has `[&_svg:not([class*='size-'])]:size-4`. The `:not()` only excludes svgs whose className contains the literal substring `size-`. `h-7 w-7` doesn't contain `size-`, so the descendant rule still matches and — because it's more specific than the `.h-7 .w-7` rules — wins. Result: every lucide icon written as `h-N w-N` inside a `<Button>` was silently snapped to 16px regardless of the value. User noticed when extending the cart-slot icon from `h-5 w-5` to `h-8 w-8` and seeing zero visual change.

**The fix** — rewrite all icons inside `<Button>` from `h-N w-N` → `size-N`:

| Class / icon | Sites |
|---|---|
| `<User size-7>` | customer avatar |
| `<AlertTriangle size-3 shrink-0>` | inside แพ้ยา badge (now removed by the alert-row refactor — kept the new size on the alert-row icon) |
| `<Info size-3.5>` / `<UserPlus size-3.5>` | ดูข้อมูล / เพิ่มลูกค้า |
| `<Trash2 size-3.5>` | clear-all + cart-row delete |
| `<ChevronRight size-[22px]>` | pay button |
| `size-4 text-foreground-subtle` | 5 quick-action icons (เปิดลิ้นชัก / พิมพ์ฉลาก / ตัดสต็อก / รับคืนสินค้า / ยกเลิกบิล) |
| `<Minus size-5>` / `<Plus size-5>` | qty steppers in adjust + return + qty modals (×3 each) |
| `<Plus size-4>` / `<Minus size-4>` / `<RotateCcw size-4>` | confirm-add / confirm-cut / confirm-return footers |
| `<Trash2 size-3>` | small delete buttons in adjust/return list rows |

Skipped icons that aren't inside `<Button>` (icons in `<Input>`, `<Label>`, `<DialogTitle>`, empty-state divs, raw `<button>` elements) — the override doesn't apply to them, and `h-N w-N` continues to work.

### Documented the trap
- **`CLAUDE.md`** — added rule #7 under "Theming rules (HARD)" so future sessions reading project instructions see the rule alongside other hard UI conventions.
- **Memory** — saved `feedback_button_icon_size.md` and indexed in `MEMORY.md` for cross-session recall (the *why* and an audit checklist).

### Visual testing
**NOT done** — Claude Code can't render the Electron UI. User must run `npm run electron:dev` to verify the redesigned customer card and the icon-size fixes.

### Uncommitted changes
All changes above are uncommitted working tree modifications.

---

## Session 2026-05-06 — POS Unit Logic Hardening + Products Redesign + EditProduct Save Fix

### Goal
Three things in one session: tighten the "main unit always on top" logic in POS (both the cart unit dialog and the search modal), redesign the Products list page in POS style, and find why EditProduct save was silently failing.

### POS unit dialog — synthetic base unit (`src/pages/POS/index.tsx:1666-1680`)
**Bug** — synthetic `baseUnit.unit_name` fell back to `item?.unit_name` when `product.unit_name` was null. Since `item.unit_name` is the *currently selected* unit's name, the synthetic "หลัก" button at position 0 could end up displaying the SELECTED unit's name. The filter `units.filter(u => u.unit_name !== baseUnit.unit_name)` then removed that name from the rest of the list, so the selected unit visually appeared as the main unit at the top. Also, the filter only compared by name — if the DB had a `product_units` row with `is_base_unit=1` but a different `unit_name` than `products.unit_name`, both the synthetic base and the DB base would render (duplicate "main" entries).

**Fix**
- `baseUnitName = product?.unit_name ?? ''` — no longer falls back to `item?.unit_name`.
- Filter expanded to `units.filter(u => !u.is_base_unit && u.unit_name !== baseUnitName)` — drops both the renamed DB base and any name-collision.
- Synthetic baseUnit `is_base_unit: true` → `1` to match the field type (`number` per `ProductUnit`).

### POS search modal — flatItems base row (`src/pages/POS/index.tsx:280-289`)
**Parallel issue** — when `p.units.length > 0`, the search modal showed only DB `product_units`. The "base" row came from the DB's `is_base_unit=1` row whose `unit_name` is sourced via `product_units → item_units` JOIN. If a product had product_units with NO `is_base_unit=1` entry at all (data anomaly), the base unit was completely missing from search.

**Fix** — `flatItems` now always emits a synthetic base row `{ product: p, unit: null }` first, and excludes any DB unit with `is_base_unit=1` from the rest. The existing display fallback `it.unit?.unit_name ?? it.product.unit_name ?? '-'` then naturally:
- resolves to `it.product.unit_name` for the base row
- resolves to `it.unit.unit_name` for non-base rows

`handleSelectItem` already handles the `unit: null` case correctly (sets `unit_name = product.unit_name`, `selectedUnit: undefined`), so no downstream changes were needed.

### Products page redesign (`src/pages/Products/index.tsx` — full rewrite, backup at `index.tsx.bak`)
Goal: bring the back-office product list visually in line with POS while fixing CLAUDE.md hard-rule violations.

**Hard-rule violations fixed**
- 3× raw `<select>` → `Select` component (toolbar Category/DrugType, Create dialog Category)
- 2× raw `<button>` (in/out segmented control in Adjust dialog) → `<Button>` with `success`/`destructive`/`secondary` variants
- All colors stayed on semantic tokens — no Tailwind palette literals introduced
- Icons inside `<Button>` rely on Button's own `size-N` rule (no `h-N w-N`)

**Visual / behavioral changes**
- **Stats strip** (3 POS-style cards): `สินค้าทั้งหมด` (total from API), `ใกล้หมด (หน้านี้)`, `หมดสต็อก (หน้านี้)` — counts derived from current page rows. Each card uses a tinted icon box (`bg-primary-soft text-primary` / `bg-warning-soft text-warning-strong` / `bg-destructive-soft text-destructive`) and is rendered via a small local `StatCard` helper component at the bottom of the file.
- **Live debounced search** (300 ms) — submit button removed; filter selects also reactive. Initial load happens 300 ms after mount (acceptable trade-off).
- **Toolbar** — `h-10 rounded-xl bg-card` on every control, magnifier icon anchored inside the search Input.
- **Sticky table header** — see "Sticky header fix" below; per-cell sticky on `<th>` plus a child-selector wrapper that promotes the Table component's inner `data-slot=table-container` div to the actual scroll container.
- **Stock cell** — three states: out-of-stock = `Badge variant="destructive"` with white dot; low-stock = `bg-warning-soft text-warning-strong` chip with `AlertTriangle`; healthy = bare tabular number.
- **Action buttons** → `size="icon-sm"` ghost.
- **Adjust dialog** — in/out is a 2-column `Button` segmented control; Confirm button color follows the chosen direction; note input gains Enter-to-submit.
- **Create dialog** — raw `<select>` for category replaced with `Select`. All inputs `h-10 rounded-xl` for visual consistency.
- **Removed** unused `formatExpiry` / `getExpiryStatus` imports from the original file.

**Sticky header fix** — first attempt put `sticky top-0 z-10 bg-muted` on `TableHeader`. It didn't stick because the `Table` component's inner `<div data-slot="table-container" className="... overflow-x-auto">` creates its own scroll context (per CSS overflow spec, `overflow-x: auto` with no constraint also auto-promotes `overflow-y` to auto). The thead was sticking inside that inner container, but the inner container itself rode up with the outer `overflow-y-auto` wrapper. Fix: outer wrapper now uses `[&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin` to make the table-container itself the scroll element, and `sticky` was moved to each `<th>` directly via `[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:shadow-[0_1px_0_var(--border)]`. The shadow paints a hairline under the sticky row so it visually separates from scrolling rows (a normal `border-b` doesn't move with the sticky cell, leaving a gap).

> Note: PageHeader's `right` slot (Add product button) was put back in by my edit; the user's subsequent local edit removed it again — keeping the user's preference in current code.

### EditProduct save bug — found + fixed (`src/pages/Products/EditProduct.tsx:212-249`)
**User report:** "can't save product edit."

**Root cause** — `products:update` IPC handler builds dynamic SQL:
```js
const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
db.prepare(`UPDATE products SET ${fields}, ...`).run({ ...data, id })
```
Any payload key that isn't an actual column on `products` causes SQLite to throw `no such column: X` and abort the entire UPDATE. The form spread `...form` in `handleSave` was leaking several non-columns:

| Payload key (form) | Reality (`schema.ts:81-124`) |
|---|---|
| `is_vat` | column is `has_vat` |
| `is_not_discount` | column is `no_discount` |
| `unit_name` | column is `unit_id` (FK to `item_units`); `unit_name` only comes back via JOIN |
| `drug_generic_name_id` | **not in schema** |
| `has_wholesale1`, `has_wholesale2` | **not in schema** |
| `default_qty` | **not in schema** |

CLAUDE.md's products-table description listed these as if they existed, but neither `CREATE TABLE products` nor any later `ALTER TABLE products …` defines them. The existing `has_vat: form.is_vat` / `no_discount: form.is_not_discount` overrides in handleSave didn't help — they ran *after* the spread, so both the bad and good keys ended up in the payload, and SQLite died on whichever ghost column it hit first.

**Fix applied** — destructure the bad keys out of `form` before spreading, then map the renamed flags explicitly:
```ts
const { is_vat, is_not_discount,
        unit_name, drug_generic_name_id, has_wholesale1, has_wholesale2, default_qty,
        ...rest } = form
const payload = { ...rest, /* overrides */, has_vat: is_vat ? 1 : 0, no_discount: is_not_discount ? 1 : 0 }
```
Also changed `cost_price` default from `|| null` → `|| 0` (column is `REAL NOT NULL DEFAULT 0`; null would have hit a NOT NULL constraint if anyone cleared the field).

**Known consequence** — the four form fields with no schema column (`unit_name` free-text, `drug_generic_name_id`, `has_wholesale1/2`, `default_qty`) now silently drop their values on save. The UI still accepts input but nothing persists. To make any of these stick, schema migration + IPC update + UI mapping is required (e.g. `unit_name` → `unit_id` Select). Deferred until the user signals which of these they actually need.

### Visual testing
**NOT done** — Claude Code can't render the Electron UI. User must run `npm run electron:dev` to verify:
- POS unit dialog: open with a product where the selected unit isn't the main one, confirm "หลัก" still sits on top.
- POS search: confirm a single base row shows per product, with non-base units below.
- Products page: stats strip renders, sticky header pins while scrolling, action buttons work, Adjust + Create dialogs save.
- EditProduct: change any field on the General tab and verify save now succeeds (toast "บันทึกสำเร็จ").

### Uncommitted changes
All changes above are uncommitted working tree modifications.

---

## Known Issues / Notes
- VS 2026 installed but missing "Desktop development with C++" workload — cannot compile native modules from source
- better-sqlite3 prebuilt binary obtained via prebuild-install targeting Electron 31.7.7
- `postcss.config.js` ESM warning — harmless, can be silenced by adding `"type": "module"` to package.json
- **EditProduct ghost columns** — `unit_name` (free-text), `drug_generic_name_id`, `has_wholesale1`, `has_wholesale2`, `default_qty` are accepted by the UI but silently discarded on save (no matching column in `products` table). Either remove the inputs or migrate the schema. CLAUDE.md's schema notes still list these as if they exist — should be reconciled. **2026-05-07 update:** full audit + four additional label-table phantom columns documented in `docs/EditProduct-field-mapping.txt` and "Session 2026-05-07" below; resolution deferred to the in-flight redesign.
- DevTools Autofill errors — harmless Chromium noise

---

## Session 2026-05-07 — EditProduct field-mapping audit, 100-product mock fixture, redesign in flight

### Goal
Two threads: (1) cross-check every field on `src/pages/Products/EditProduct.tsx` against the **actual** `electron/db/schema.ts` (not the PHP intent in CLAUDE.md), and (2) generate a realistic mock-data fixture so the redesign can be visually tested against populated rows. Mid-session the user pivoted off generating sister fixture files (customers / purchases / sales / returns) to redesigning EditProduct itself — the user is currently filling in `docs/Redesign EditProduct.txt` with the new field arrangement and will hand it back for implementation.

### Field-mapping audit → `docs/EditProduct-field-mapping.txt`
One row per form key, mapped to the real `products` / `product_units` / `product_lots` / `product_labels` columns in `schema.ts`. Confirmed the previously-known products ghost columns (`unit_name` free-text, `drug_generic_name_id`, `has_wholesale1/2`, `default_qty`) are correctly stripped at `EditProduct.tsx:218-222` and the `is_vat → has_vat` / `is_not_discount → no_discount` renames work because the bad keys are destructured out before the override runs (L239-240).

Four **new** Tier-1 bugs surfaced — all in the labels flow:

1. **Label save sends 4 non-existent columns**: `label_time_id`, `advice_id`, `show_barcode`, `is_default`. The label dialog renders dropdowns/toggles for all four (`EditProduct.tsx:1067, 1076, 1107, 1109`).
   - **Add label** path: `electron/ipc/products.ts:207-212` uses an explicit INSERT column list, so these four are silently dropped — the dialog accepts input that never persists.
   - **Edit label** path: `electron/ipc/products.ts:202-204` builds dynamic SQL via `Object.keys(rest)`, so the same payload throws `no such column: label_time_id` and aborts the entire UPDATE. Editing labels is *broken*, not just incomplete.
2. **Label INSERT omits `is_active`** (`electron/ipc/products.ts:208-211`). New labels inherit the schema default (1) so they're active by default — but the `is_active` toggle in the dialog (`EditProduct.tsx:1108`) has no effect on first save.
3. **`drug_generic_name_id`** is fully wired with autocomplete + auto-tick antibiotic side-effect (`EditProduct.tsx:266-273`) and renders an `ID: {n}` hint (L634-636), but the value never persists (column missing). The selected name is also lost on reload — `loadAll` sets `genericQuery('')` with a `// will be resolved by generic_name_id lookup later` TODO at L194 that was never followed up.
4. **`unit_name`** on the general tab is edited as a free-text Input (`EditProduct.tsx:551-553`) but the `products` table has `unit_id` as an FK to `item_units` — `unit_name` only resolves via JOIN. The input value never persists.

Resolution choice (deferred — part of the redesign): for each phantom field either (a) strip it in the IPC handler / hide its UI control, or (b) `ALTER TABLE` the schema to add the column. Per-field decisions belong in the user's `docs/Redesign EditProduct.txt`.

### 100-product mock-data fixture → `docs/EditProduct-mock-data.sql`
Single SQL file, idempotent against any seeded db, exercising every persistable column in all four EditProduct tables. Skips phantom columns by design (so the file still loads if columns are added later).

**Coverage per table:**
- `products` — 100 rows (`MED001`–`MED100`) across 10 therapeutic groups (pain/fever, antibiotics, antihistamines, GI, cough/cold, vitamins, topical, controlled, ORS, supplies). FK columns resolved by code/name subqueries — independent of seed auto-increment ids.
- `product_units` — base unit per product (auto-derived from `products.unit_id`), strip variants (`แผง`, qty=10) for tablets/caps, box variants (`กล่อง`, qty=100, purchase-only) for 10 high-runners.
- `product_lots` — 1 healthy lot per product + 10 mixed-expiry lots (expired / red / orange / yellow / green) anchored to `date('now')` so the colour bands at `EditProduct.tsx:937-941` light up.
- `product_labels` — 30 rows on dispensable drugs, exercising `dose_qty`, `dosage_id`, `frequency_id`, `timing_id`, multilingual `indication_th/mm/zh` + `note_th/mm/zh`, `is_active`, `sort_order`. Phantom columns omitted.

A "Coverage extras" UPDATE block at the bottom touches every other column at least once: `has_vat`, `no_discount`, `is_original_drug`, `is_fda_report`, `is_fda13_report`, `tmt_id`, `name_for_print`, `barcode2/3/4`, `side_effect_note`, `note`, `expiry_alert_days*`, `is_hidden`, `is_disabled`, `safety_stock` overrides.

**SQLite syntax fix during initial run** — first version used `FROM (VALUES (...), (...)) AS v(col1, col2, ...)` to alias VALUES columns. SQLite 3.51 rejected the column-list aliasing on VALUES clauses (parse error near `(`). Rewrote both bulk INSERTs (products + product_labels) as `WITH v(col1, col2, ...) AS (VALUES (...), (...)) INSERT INTO target SELECT ... FROM v JOIN ...`. Pattern works against any modern SQLite.

### Dev DB state after this session
- DB path: `~/Library/Application Support/syntropic-desktop/database/syntropic.db`
- **Backup before fixture load:** `…/syntropic.db.backup-20260507-094709` (278 KB, identical to pre-fixture state)
- Counts (after fixture load):

| table | before | after |
|---|---|---|
| products | 30 | 130 (100 new MED%) |
| product_units | 0 | 174 |
| product_lots | 30 | 140 |
| product_labels | 0 | 30 |
| suppliers | 0 | 3 |
| customers | 2 | 2 (untouched) |
| sales | 0 | 0 (untouched) |

**Idempotency caveat** — `products.code` and `products.barcode` are non-UNIQUE indexes in `schema.ts` (despite CLAUDE.md saying otherwise). `INSERT OR IGNORE` on products acts as plain INSERT; re-running the file would duplicate the 100 rows. The `product_units` / `product_lots` / `product_labels` `NOT EXISTS` guards still hold. To re-run safely: `DELETE FROM products WHERE code LIKE 'MED%'` first.

### Sister fixture files — paused
The plan was to follow up with `docs/mock-customers.sql`, `docs/mock-purchases.sql`, `docs/mock-sales.sql`, `docs/mock-returns.sql` (each its own idempotent file, in dependency order). User opted to redesign EditProduct first; these are still queued for after the redesign lands.

### Pickup plan for next session
1. **Read `docs/Redesign EditProduct.txt`** — user is filling in the desired field arrangement, sections, and any logic changes. The header preview (`Product card / [Price and Cost detail] [Stock] [Product.unit/Product.type]`) suggests a card-based 3-column upper area replacing the current single-column form.
2. **Decide schema strip-vs-add per phantom field**, per what the user wrote — this includes the labels phantom columns (`label_time_id`, `advice_id`, `show_barcode`, `is_default`), `drug_generic_name_id`, `unit_name → unit_id` swap, and possibly `default_qty` / `has_wholesale1/2` (PHP-only).
3. **Implement the redesign** in `src/pages/Products/EditProduct.tsx`. Honour CLAUDE.md hard rules: semantic colour tokens only, project UI components (Switch over local Toggle at L59-71, etc.), Dialog Esc-closes / Enter-confirms contract, Button icon `size-N` not `h-N w-N`.
4. **Patch IPC** in `electron/ipc/products.ts` — at minimum (a) strip the 4 phantom keys in `saveLabel` (or remove them from the UI payload), and (b) add `is_active` to the INSERT column list.
5. **Test in browser** — `npm run electron:dev`, open a MED-prefixed product, verify save round-trips, open the labels dialog, add + edit a label end-to-end, check the lots tab colour bands against the 10 mixed-expiry lots.

### Files created this session
- `docs/EditProduct-field-mapping.txt` — full per-field mapping report with status legend
- `docs/EditProduct-mock-data.sql` — 100-product fixture (loaded into dev db)
- `docs/Redesign EditProduct.txt` — user-authored redesign spec (in progress as of session end)

### Uncommitted changes
The three files above are uncommitted (only `docs/`). No source code changes this session — `src/` and `electron/` working tree is unchanged from the 2026-05-06 state.

---

## Session 2026-05-08 — POS payment dialog redesign + invoice-no & rounding bug fixes

### Goal
User asked to add a left column to the payment dialog (customer info + transaction details list) mirroring a reference mock. Mid-session, two pre-existing bugs surfaced and were fixed: a SQLite `UNIQUE constraint failed: sales.invoice_no` thrown by the second sale of any day, and a "type 10, blur to 10.01" total-discount rounding drift.

### Payment dialog redesign — `src/pages/POS/index.tsx:1126-1335`
- **Two-column layout** (`grid grid-cols-2 gap-4`). Dialog widened from `size="lg"` → `size="full"` (max-w-5xl) and pinned to `h-[78vh]` with `grid-rows-[auto_1fr_auto]` so the body fills the modal regardless of cart length. DialogBody has `min-h-0 overflow-hidden`; left and right columns each use `min-h-0 h-full` with internal scroll.
- **Left column:**
  - Customer header — avatar tile, customer name (or `ลูกค้าทั่วไป` walk-in), customer code if any, **sale-type Badge** (`variant="senary"` for ขายส่ง / `"quaternary"` for ขายปลีก — mirrors the cart slot card style at L612-616 of the same file), date + time on the right.
  - Transaction details card — scrollable list (`flex-1 min-h-0 overflow-y-auto`), each row: `item_name` + `฿line_total` on left, `qty unit_name` on right.
- **Right column** is the existing payment controls (gross + editable discount, net total, cash input, change row, breakdown toggle, save button), wrapped in `flex flex-col gap-4 overflow-y-auto … h-full`.
- **Quick-pay UX** — Enter on an empty cash input now auto-fills `pendingNet` (`Math.max(0, pendingNet).toFixed(2)`); Enter on a non-empty cash input submits via `handleCompleteSale`. Two-keystroke exact-change flow.

### Bug fixes

**1. `sales.invoice_no` UNIQUE collision on every second sale of the day** — `electron/ipc/pos.ts:108-112` (and the parallel `pos:returnItems` at L194-199).
   - Root cause: count query filtered `sold_at >= '${today} 00:00:00'` where `today = dayjs().format('YYYYMMDD')`. But `sold_at` stores `'YYYY-MM-DD HH:MM:SS'` (via `datetime('now','localtime')`). String compare: `'2026-05-08 14:30:00' < '20260508 00:00:00'` because `'-'` (0x2D) < `'0'` (0x30) — so the date filter excludes every today-row. Count was always 0, every sale got `RX-${today}-0001`, second sale collided.
   - Fix: drop the `sold_at` range filter; rely solely on `WHERE invoice_no LIKE 'RX-${today}-%'` (matches the working `purchase:nextGRNumber` pattern at `electron/ipc/purchase.ts:78-82`). Same fix applied to RT- prefix in `returnItems`.
   - **Watch out:** main-process changes don't HMR — restart Electron after editing `electron/ipc/*.ts`.

**2. `redistributeDiscounts` rounding drift — type 10 in total-discount, blur to 10.01** — `src/pages/POS/redistributeDiscount.ts:42-51`.
   - Root cause: per-line discounts are rounded individually with `round2` after proportional split, but `Σ round2(xᵢ) ≠ round2(Σ xᵢ)`. e.g. 7 lines at gross 14.29 each, target 10 → each gets 1.43, sum 10.01 (over). 3 equal lines, target 10 → each 3.33, sum 9.99 (under).
   - Fix: after rounding, compute `residual = round2(target − Σ rounded)` and add it to the line with the largest gross. Now `Σ rounded == target` exactly. Display path (`pendingTotalDiscount.toFixed(2)`) lands on the typed value.

**3. Bug-check pass on the redesigned dialog** — three more issues caught and fixed:
   - `w-82` and `w-86` (used on the change-amount and "กรุณาตรวจสอบ" spans) **don't exist in default Tailwind** (scale jumps 80 → 96). Classes were silently dropped, spans fell back to intrinsic width and didn't align. Fixed: `w-80` for the alert ("กรุณาตรวจสอบ" needs the room — `w-52` wraps it to two lines), `w-52` for the change number (matches the cash input above).
   - **Enter on cash bypassed the disabled state.** The Save button at L1325 disables on `change < 0 || pendingNet < 0`, but Enter called `handleCompleteSale` directly, which only checked for empty cart. Fix: validation moved *into* `handleCompleteSale` (`if (saving) return; if (cart.items.length === 0) …; if (pendingNet < 0) …; if (change < 0) …`) — single source of truth for both onClick and onKeyDown=Enter.
   - Save button now also disables on `cart.items.length === 0` (defence-in-depth; the pay button at L828 already prevents opening with an empty cart).

### Memory implications
Two non-obvious traps worth retaining for future work in this codebase:
- **`datetime` format mismatch** — `dayjs().format('YYYYMMDD')` vs SQLite `datetime('now','localtime')` (which is `YYYY-MM-DD HH:MM:SS`). String-range filters that mix the two are silently always-false. Prefer `LIKE 'PREFIX-YYYYMMDD-%'` for daily-counter queries — matches the working `purchase:nextGRNumber`.
- **Per-line `round2` doesn't preserve totals** — anywhere a typed total is split across N lines and each rounded to 2dp, the rounded sum drifts ±0.01 from the typed value. The reconcile-to-largest-gross trick at `redistributeDiscount.ts:45-50` is the pattern; reuse it if a similar split shows up elsewhere (e.g. VAT distribution).

### Uncommitted changes
- `src/pages/POS/index.tsx` — payment dialog two-column redesign + bug fixes
- `src/pages/POS/redistributeDiscount.ts` — rounding-residual reconcile
- `electron/ipc/pos.ts` — invoice-no LIKE-only filter (saveBill + returnItems)
- `src/pages/Theme/index.tsx` — pre-existing modification carried over from before the session (untouched by today's work)

### Pickup plan
The EditProduct redesign remains the open headline — pickup is unchanged from the 2026-05-07 plan above. If POS regressions surface, sanity-check by running `npm run electron:dev`, ringing two sales in a row (verifies invoice-no fix, requires Electron restart not HMR), opening payment dialog with 3+ items and typing `10` in the total-discount field then blur (verifies rounding fix), and pressing Enter twice on an empty cash field with items in cart (verifies quick-pay Enter shortcut).

---

## Session 2026-05-09→10 — products schema cleanup, Hygeia-style is_drug, Products list overhaul

### Goal
Several intertwined threads landed in one long session:
1. Audit + verify Deepseek's earlier UI removal of `dosage_form_id` / `is_not_discount` / `unit_name` fields from EditProduct, then drop the matching columns from the products table.
2. Decide what to do about `products.unit_id` (the half-dead "main unit" column that EditProduct could no longer set) — chose to move base-unit storage entirely into `product_units` (`is_base_unit=1`) and rewrite all 5 read-side JOINs.
3. Seed a realistic 1000-product, 10-GR test fixture for visual + perf testing.
4. Implement Hygeia-style toggle pattern: an explicit "this product is a drug under the law" flag that gates the "ข้อมูลยา" section, with `category` reduced to a sort/filter dimension.
5. Make the Products list table sortable, fix the column-jumping artefact when rows re-render, replace static stat cards with clickable filter shortcuts, and add a recovery path for `is_disabled=1` products (which were silently invisible).

A late-session bug surfaced when the user clicked "บันทึก" in EditProduct for the first time and got a white screen — the toast hook had a long-standing API mismatch (signature accepted `string`, every call site passed `{title, variant}`); fixed at the component layer so all ~50 sites work now.

### Schema changes — `electron/db/schema.ts`

**Dropped columns (CREATE TABLE + idempotent ALTER block):**
- `products.dosage_form_id` — was joined in `products:list` and `pos:searchProducts` to surface `dosage_form_name`. UI no longer references it; both JOINs removed.
- `products.no_discount` (formerly `is_not_discount`) — UI no longer references it; no read-side consumers.
- `products.unit_id` (formerly `unit_name`) — replaced by `product_units WHERE is_base_unit=1`. See migration below.

**Added column:**
- `products.is_drug INTEGER NOT NULL DEFAULT 0` — Hygeia-style "this product is a drug" flag. Backfill migration sets `is_drug=1` for any product that already had a `drug_type_id` so existing data lights up automatically.

**Critical migration order** — the new ALTER block at the bottom of `schema.ts`:
```sql
INSERT OR IGNORE INTO item_units (name) VALUES ('ชิ้น');  -- fallback
INSERT INTO product_units
  (product_id, unit_id, qty_per_base, is_base_unit, is_for_sale,
   price_retail, price_wholesale1, price_wholesale2)
SELECT p.id,
       COALESCE(p.unit_id, (SELECT id FROM item_units WHERE name='ชิ้น')),
       1, 1, 1,
       p.price_retail, p.price_wholesale1, p.price_wholesale2
  FROM products p
 WHERE NOT EXISTS (SELECT 1 FROM product_units pu
                    WHERE pu.product_id = p.id AND pu.is_base_unit = 1);
ALTER TABLE products DROP COLUMN unit_id;
```
Each statement wrapped in `try { db.exec(sql) } catch {}` so it's idempotent — fresh installs swallow the "no such column: p.unit_id" error from the backfill (no products to backfill anyway), re-runs after migration silently no-op on the IGNORE / NOT EXISTS / already-dropped cases.

### Read-side JOIN rewrite (5 files)
Every `LEFT JOIN item_units u ON u.id = p.unit_id` replaced with:
```sql
LEFT JOIN product_units pu_base ON pu_base.product_id = p.id AND pu_base.is_base_unit = 1
LEFT JOIN item_units u ON u.id = pu_base.unit_id
```
Touched: `electron/ipc/products.ts:33` (list), `electron/ipc/pos.ts:20` (search), `electron/ipc/purchase.ts:281` (history), `electron/ipc/reports.ts:150` (expiring), `electron/ipc/settings.ts:127` (`listUnits` usage_count — now uses `COUNT(DISTINCT pu.product_id)` from `product_units`, semantic shift from "products using as base" to "products using as any unit", which is more correct for the deletability check anyway).

### Write-side rewrite — `products:create` transaction
`electron/ipc/products.ts:85` now wraps the product INSERT and the base `product_units` INSERT in a single `db.transaction(...)`. Falls back to `'ชิ้น'` if the caller didn't pick a unit (shouldn't happen via the UI dropdown, but defends against legacy callers and tests).

The quick-add dialog in `src/pages/Products/index.tsx` was simultaneously fixed — it had been sending `unit_name: '...'` (free text) where the prepared INSERT expected `@unit_id`, which would have thrown "Missing named parameter 'unit_id'". Replaced with a `<Select>` dropdown bound to `itemUnits` from `settings:allUnits`.

### Hygeia-style is_drug toggle — `src/pages/Products/EditProduct.tsx:588-642`
Section header "ข้อมูลยา" rebuilt as a flex row with a `<Toggle>` on the right labelled "สินค้านี้เป็นยาตามกฎหมาย". Toggle off → fields (ประเภทยา / ชื่อสามัญ / TMT ID / รายงาน อย. / รายงาน อย.13) hidden via `{!!form.is_drug && (<>…</>)}`. Toggle re-on → fields reappear with their previous values still in `form` state (we never clear, so flipping the toggle is non-destructive). `is_drug` flows through the `...rest` spread in the save payload to the dynamic-SQL `products:update`.

`category` is now purely for sorting/filtering — never gates drug UI. Documented in CLAUDE.md.

### Dev test fixture — `electron/ipc/dev.ts` (new file)
Dev-only IPC handler for seeding test stock, gated in `main.ts` to `isDev=true`. (The original `dev:seedTestStock` 1000-synthetic-product handler was later removed; only `dev:seedSalesHistory` — backdated GR/sales over a real-product window — remains.)

### Toast hook bug — white-screen on first save
**User report**: clicking "บันทึก" in EditProduct → blank page + console error "Objects are not valid as a React child (found: object with keys {title, variant})".

**Root cause**: `src/components/ui/toast.tsx` signature was `toast(message: string, type?, duration?)` but every call site (~50 across People, Products, Reports, Settings, EditProduct) used the shadcn-style `toast({ title: '...', variant: 'success' })`. The hook stored the object verbatim as `message`, then JSX rendered `<span>{t.message}</span>` — React threw at the object child and unmounted from the root upward.

The pre-existing TS errors (`Argument of type '{ title: string; variant: string; }' is not assignable to parameter of type 'string'`) had been silently filtered out by my earlier typecheck-grep filters because I had assumed they were known-and-fine. The first user-facing toast invocation of the redesign session blew up in production code.

**Fix** at `src/components/ui/toast.tsx` — overload the hook to accept both:
```ts
type ToastInput = string | { title: string; description?: string; variant?: 'success' | 'error' | 'info' | 'destructive' | 'default' }
toast(input: ToastInput, type?: ToastType, duration?: number)
```
Normalised inside the hook (`variantToType`: `destructive`/`error`→error, `success`→success, else info). Toast renderer split into title (font-medium) + optional description (xs, opacity-80). All 50 call sites work without edit.

**Lesson for future audits**: when filtering pre-existing TS errors during a refactor, check whether they're actually inert. Toast errors that "have always been there" can fire the moment a new code path triggers them.

### Products list overhaul — `src/pages/Products/index.tsx`

**Sortable columns** (server-side, respects pagination):
- Added `sort_by` + `sort_dir` to `products:list`. Whitelisted 6 columns mapped to SQL expressions in a `SORT_MAP` object — `trade_name`, `unit_name` (via `u.name`), `cost_price`, `price_retail`, `profit` (computed `(p.price_retail - p.cost_price)`), `stock_qty` (alias from the `COALESCE SUM` subquery — SQLite supports alias in ORDER BY). Tie-break on `p.trade_name ASC` so paginated results are stable when the primary sort has duplicates (many products with `cost_price=0`).
- Frontend has `sort` state + `toggleSort(field)` (click new column = asc; click same column = flip). `<SortableHead>` component renders the column label + `ArrowUp`/`ArrowDown`/`ArrowUpDown` icons (active = full opacity, inactive = 40%).
- All filter/sort changes go through the same 300 ms debounce + load(1) — pagination resets to page 1 when sort flips.

**Column-jump fix** — when rows re-rendered after sort, columns visibly resized because table-layout was browser-default `auto` (sizes from content). Switched to `<Table className="table-fixed">` and gave every non-`trade_name` column an explicit Tailwind width (`w-14` / `w-24` / `w-28` / `w-36`); `trade_name` keeps no width and gets the remainder. Trade-name cell now uses `truncate` + `title={trade_name}` so long names ellipsize but reveal on hover.

**Clickable stat cards as filter shortcuts**:
- `StatCard` is now a `<button>` accepting `onClick` + `isActive` props.
- 3-card layout: `สินค้าทั้งหมด` (clears filter), `ใกล้หมด` (toggles `low`), `หมดสต็อก` (toggles `out`).
- Active card gets a 2-px ring matching its tint (`ring-primary` / `ring-warning` / `ring-destructive`).
- `products:list` accepts `stock_filter: 'all'|'low'|'out'`. The same `COALESCE SUM` subquery from `stockStats` is reused inline as a WHERE condition.

A 4-card financial layout (cost / retail-value / profit) was prototyped mid-session then explicitly removed — user wants those gated to a Reports page with role-based access so staff don't see margins. The `success` tint added to `StatCard` was reverted along with it (no longer needed).

**Recovery path for `is_disabled=1` products** — they had been silently invisible because `products:list` always added `WHERE p.is_disabled = 0`. Both `products:list` and `products:stockStats` now accept `include_disabled?: boolean` (default false). The Products toolbar gained a `<Switch size="sm">` labelled "แสดงที่ปิดใช้งาน" (right-aligned via `ml-auto`). When on, disabled rows render with `opacity-60` + a `<Badge variant="secondary">ปิดใช้งาน</Badge>` so they're clearly separable. Workflow to recover: toggle on → click Edit → toggle "ปิดการใช้งาน" off in the Status section → save.

`electron/preload.ts` — `stockStats` type signature updated to include `include_disabled` so the renderer compiles.

### CLAUDE.md updates
Three rule changes documented in the divergence note + POS Unit Selection Rules section:
1. Removed `unit_name → unit_id` rename note (column gone).
2. Added "**Base unit lives only in `product_units`**" invariant — every product MUST have exactly one `is_base_unit=1` row, enforced by `products:create` transaction + seed loader + migration backfill. There is no fallback anymore; the previous `products.unit_id` JOIN is gone.
3. Added "**Added `is_drug` (Hygeia-style)**" flag note — explicit toggle, `category` reduced to sort/filter only.
4. POS Unit Selection Rules' "Why this matters" updated — the synthetic-base in the renderer still works (still keys off `product.unit_name`), only the SQL source changed. Added a hard "invariant: every product MUST have an `is_base_unit=1` row" line.

### Files changed
- `electron/db/schema.ts` — drop `dosage_form_id`/`no_discount`/`unit_id` from CREATE; add `is_drug`; new migration block with `'ชิ้น'` fallback + product_units backfill + `unit_id` DROP COLUMN
- `electron/db/seed.ts` — products INSERT loses `dosage_form_id`/`unit_id`; new `insBaseUnit` prepared statement run after each product insert; `fallbackUnitId` lookup with insert-on-miss
- `electron/ipc/products.ts` — `list` query rewrites JOINs, adds `sort_by`/`sort_dir`/`stock_filter`/`include_disabled` params; `create` wrapped in transaction, drops `dosage_form_id`/`no_discount`/`unit_id` from INSERT, inserts base `product_units` row; `stockStats` accepts `include_disabled`
- `electron/ipc/pos.ts` — search query JOIN rewrite, `dosage_form_name` SELECT removed
- `electron/ipc/purchase.ts` — receipt-items query JOIN rewrite
- `electron/ipc/reports.ts` — expiring-lots query JOIN rewrite
- `electron/ipc/settings.ts` — `listUnits` usage_count via `product_units`
- `electron/ipc/dev.ts` — **new**, dev seed handler
- `electron/main.ts` — `registerDevHandlers()` gated on `isDev`
- `electron/preload.ts` — expose `window.api.dev`; `stockStats` type adds `include_disabled`
- `src/components/ui/toast.tsx` — accept both string and `{title, description, variant}` forms
- `src/types/index.ts` — `Product` drops `dosage_form_id`, `no_discount`, `unit_id`; adds `is_drug`; drops `dosage_form_name`
- `src/pages/Products/index.tsx` — quick-add unit Select; sort state + `<SortableHead>`; `table-fixed` + explicit widths + `truncate` on trade_name; clickable `StatCard` + `stockFilter` state; `showDisabled` toggle + `<Switch>` + opacity/badge for disabled rows
- `src/pages/Products/EditProduct.tsx` — `is_drug` in form init; "ข้อมูลยา" section header rebuilt as flex row with `<Toggle>` + conditional render; cleanup of redundant `dosage_form_id` from save destructure
- `CLAUDE.md` — divergence note rewrite + POS rules + `is_drug` invariant

### Pickup plan for next session
1. **Restart Electron and verify the migration ran cleanly** — open the dev DB (path is in PROGRESS top-of-file) and confirm: (a) `products` table has no `unit_id` / `dosage_form_id` / `no_discount` columns and has `is_drug`; (b) every row in `products` has exactly one matching row in `product_units` with `is_base_unit=1`; (c) POS search, Products list, Purchase history, expiring-lots report all show unit names. If any view shows blank units, the backfill missed that product — re-run the migration manually or insert the missing base row.
2. **Visual smoke test the Products list** — sort by every column (asc + desc), confirm columns don't jump width. Click stat cards (toggle on/off), verify the row list narrows correctly. Toggle "แสดงที่ปิดใช้งาน" with at least one disabled product to confirm the badge + opacity render.
3. **EditProduct round-trip** — open a product, toggle `is_drug` off → save → reload → confirm fields are still in DB but section is hidden. Toggle back on → save → confirm section reappears with values intact.
4. **Test fixture** — run the dev seed from the /theme → "เครื่องมือ Dev" tab, walk through Products list (filter, sort, paginate, edit one), POS search, then re-run the seed (verifies the wipe path).
5. **Financial Reports page** — deferred from this session per user. Plan: copy the cost_value / retail_value / profit_value SQL from the prototype IPC (already removed from `stockStats` but visible in git blame); add 4 stat cards to a new `src/pages/Reports/Inventory.tsx` (or extend an existing reports page); gate by `user.role === 'admin'` once auth is wired. Filters should mirror Products list (q / category / drug_type) so the user can answer "what's the profit on antibiotics specifically?".
6. **Pre-existing TS noise to clean up someday** — `EditProduct.tsx` references `drug_generic_name_id`, `tmt_id`, `default_qty`, `label_time_id`, `advice_id`, `show_barcode`, `is_default` on `FullProduct` / `ProductLabel` types that don't declare them. They work at runtime (these are form-only ghost fields) but every typecheck run flags them. Either widen the types with optional fields or strip the unused form keys.

### Uncommitted changes
All of the above are uncommitted working-tree modifications.

---

## Session 2026-05-10 (cont.) — Runtime font switcher + Thai stacked-mark clipping fix

### Goal
ผู้ใช้ลองหลายฟอนต์ไทยเพื่อปรับลุค (IBM Plex → Thonburi → SF Thonburi → Inter+Sarabun) เจอปัญหา rendering หลายตัว สุดท้ายตัดสินใจทำระบบสลับฟอนต์ใน CSS settings page แทนการ hardcode

### Trap: Apple system Thai fonts ใช้ใน Electron ไม่ได้
Thonburi (และ Krungthep, Silom, Ayuthaya) ของ macOS ใช้ตาราง **AAT** (`morx`/`feat`) สำหรับ Thai mark positioning ไม่มีตาราง **OpenType** (`GPOS`/`GSUB`) Chromium ignore AAT → สระ + วรรณยุกต์ตกตำแหน่ง default = ทับตัวอักษร เลือก export ใหม่ก็ไม่ช่วย เพราะข้อมูลไม่อยู่ในไฟล์ ตรวจได้ด้วย `python3 -c "from fontTools.ttLib import TTFont; f=TTFont('x.ttf'); print('GPOS' in f.keys())"` — ถ้า `False` → render ผิดบน Chromium แน่นอน. **อย่าเสียเวลาแก้** — เปลี่ยนฟอนต์
- ✅ ใช้ได้บน Electron: Inter, Sarabun, IBM Plex Sans Thai Looped (CDN/local), SF Thonburi (มี GPOS/GSUB)
- ❌ ใช้ไม่ได้: Thonburi (Apple), Krungthep, Silom, Ayuthaya, ฟอนต์ Apple system Thai ทั้งหมด

### Universal fix: `.truncate` / `.line-clamp-*` clips Thai stacked marks (`src/index.css:182-197`)
Tailwind's `text-{xs,sm,base}` ratio 1.33–1.5 — `overflow:hidden` ของ truncate ตัดส่วนบนของ tone mark เมื่อมี stacked marks (เช่น `ขมิ้น` = ม + ิ + ้). Fix: `.truncate, [class*="line-clamp-"] { line-height: 1.65 }` ใน `@layer utilities`. ครอบคลุม 28 จุด truncate + 52 จุด line-clamp ทั่วโปรเจกต์อัตโนมัติ — **อย่าไปใส่ leading-X รายจุด** (จุดใหม่ในอนาคตจะพังอีก). Reverted earlier surgical fix at `src/pages/Products/index.tsx:356`

### Font switcher architecture (CSS vars + existing IPC pattern)
ลอกแบบมาจาก `getThemeFontSize`/`saveThemeFontSize` เดิม — เขียนค่าลง `:root` block ของ `src/index.css` โดยใช้ `updateSelectorBlock` helper ที่มีอยู่
- **CSS vars** (`src/index.css:81-84`): `--font-latin` + `--font-thai` (ค่า quoted เช่น `'Inter'` เพื่อ substitute ตรงเข้า `font-family` lists)
- **`*` rule** (`src/index.css:280`): `font-family: var(--font-latin), var(--font-thai), sans-serif`
- **Tailwind** (`tailwind.config.js`): `fontFamily.sans: ['var(--font-latin)', 'var(--font-thai)', 'sans-serif']`
- **`@font-face` declarations** (`src/index.css:204-279`): Google Sans (4w), IBM Plex Sans Thai Looped (5w), SF Thonburi (3w) — ทั้งหมด 12 รายการ, browser โหลด lazy เมื่อใช้จริง
- **IPC** (`electron/ipc/settings.ts`): `settings:getThemeFonts` / `saveThemeFonts` — payload `{ latin, thai }` ส่งทั้งคู่ทุกครั้ง
- **Preload** (`electron/preload.ts:102-104`): exposed at `window.api.settings.getThemeFonts/saveThemeFonts`
- **Picker UI** (`src/pages/CSS/index.tsx`): Section "Fonts" บนสุด, 2 columns Latin/Thai, แต่ละการ์ดแสดง sample text (`The quick brown fox · 0123` / `ขมิ้นชัน 300 มก. · กขฃคฅฆง`) ใน fontFamily ของตัวเอง. คลิก → instant preview ผ่าน `documentElement.style.setProperty()` + auto-save ผ่าน IPC. Sample ภาษาไทยจงใจมี stacked marks เพื่อให้เห็นปัญหา rendering ทันที

ตัวเลือก: Latin = Inter / Google Sans / SF Thonburi · Thai = Sarabun / IBM Plex Sans Thai Looped / SF Thonburi (JetBrains Mono ตัดออกเพราะ monospace ไม่เหมาะ body text)

### License caveat (สำคัญก่อน ship production)
- **Google Sans** = proprietary Google font ไม่มี license สำหรับ third-party commercial use ตามที่ตรวจสอบได้ ผู้ใช้บอกว่าเห็นข่าวว่าใช้ได้แต่ไม่มี source ทางการของ Google ยืนยัน — ก่อน build production ควรลบ `GoogleSans-*.ttf` ออกจาก `src/assets/fonts/` และเอา 'Google Sans' ออกจาก LATIN_FONTS
- **SF Thonburi** = ที่มาไม่ชัด (user download มาเอง) ควรตรวจสอบ license ก่อน ship
- ✅ OFL ปลอดภัย: Inter (CDN), Sarabun (CDN), IBM Plex Sans Thai Looped (local)

### Files changed
- `src/index.css` — font vars, 12 @font-face, `*` rule, `.truncate`/`.line-clamp-*` line-height
- `tailwind.config.js` — `fontFamily.sans` ใช้ vars
- `index.html` — preconnect + Google Fonts link สำหรับ Inter + Sarabun (display=swap)
- `electron/ipc/settings.ts` — handlers ใหม่ 2 ตัว
- `electron/preload.ts` — expose 2 ตัว
- `src/pages/CSS/index.tsx` — Section "Fonts" + `FontCard` component + state/handlers
- `src/pages/Products/index.tsx:356` — revert leading-6 (ตอนนี้แก้ที่ root แล้ว)

ไฟล์ฟอนต์ใน `src/assets/fonts/` (Google Sans, IBM Plex Thai Looped, SF Thonburi, JetBrains Mono x2) เก็บไว้ทั้งหมด ไม่ได้ลบ — เผื่ออยากใช้

### Pickup plan
1. **Restart Electron** หลังแก้ `electron/ipc/settings.ts` + `preload.ts` (main process restart, ไม่ใช่ HMR)
2. **Test picker** — เปิด `/css` page, คลิกการ์ดทั้ง Latin + Thai, ตรวจ instant preview ทำงาน, refresh แล้วค่ายังคงอยู่ (เปิด `src/index.css` ดู `--font-latin`/`--font-thai` อัพเดตจริง)
3. **Test stacked-mark fix** — ดูตาราง Products หา product ที่ชื่อมี ม + ิ + ้ (เช่น "ขมิ้น") สลับฟอนต์ผ่าน picker แล้วดูว่าวรรณยุกต์ไม่ถูกตัด
4. **License cleanup ก่อน production** — ลบ Google Sans `.ttf` + เอาออกจาก `LATIN_FONTS` array ใน `src/pages/CSS/index.tsx`. ตรวจ SF Thonburi license. ถ้า user ยังต้องการ Google Sans แนะนำใช้ Plus Jakarta Sans หรือ Manrope (OFL, look ใกล้เคียง)
5. **Default font** — `:root` ตั้ง default `--font-latin: 'Google Sans'` (ผู้ใช้ปรับเองตอน test) ถ้าจะ ship ควรเปลี่ยนเป็น `'Inter'` (license-safe)

### Uncommitted changes
All of the above + earlier session changes.

---

## Session 2026-05-11 — FDA report schema refactor + EditProduct/Settings wiring

### Goal
ย้าย "binding logic" ระหว่างประเภทยากับรายงาน ออกจาก EditProduct ไปไว้ที่ Settings หน้า DrugTypes แทน ให้ EditProduct เป็นการ override รายตัว, ค่า default กำหนดโดย drug_type settings

### Design decisions
| Report | หลักการ | default |
|--------|---------|---------|
| ข.ย.9 | ยาทุกชนิดที่ซื้อเข้า | ผูกกับ `is_drug` เสมอ (ไม่มี toggle แยก) |
| ข.ย.10 | ยาควบคุมพิเศษที่ขาย | `drug_type.is_fda10` (SPCL_CTRL/PSYCHO/NARCOTIC = 1) |
| ข.ย.11 | ยาอันตรายที่ถูกกำหนดให้รายงาน | `drug_type.is_fda11` (DANGEROUS = 0, ปรับรายตัวตามกฎหมาย) |
| ข.ย.13 | ขายส่ง (เฉพาะร้านขายส่ง) | `drug_type.is_fda13` (0 ทุกประเภท, ผู้ใช้ปรับเอง) |

### Schema changes — `electron/db/schema.ts`

**`drug_types` table:**
- ลบ `khor_yor_report TEXT` → แทนด้วย `is_fda9/10/11/13 INTEGER NOT NULL DEFAULT 0`
- Migration backfill: `khor_yor_report='ขย.9'` → `is_fda9=1`; `khor_yor_report='ขย.10'` → `is_fda9=1, is_fda10=1`
- Migration: `ALTER TABLE drug_types DROP COLUMN khor_yor_report`

**`products` table:**
- RENAME `is_fda_report` → `is_fda9`
- RENAME `is_fda13_report` → `is_fda13`
- ADD `is_fda10 INTEGER NOT NULL DEFAULT 0`
- ADD `is_fda11 INTEGER NOT NULL DEFAULT 0`
- Backfill: `is_fda9=1` สำหรับ `is_drug=1` ทุกตัว
- Backfill `is_fda10/11` จาก drug_type JOIN

Note: `sales.is_fda13_report` คงเดิม (คนละ table, คนละความหมาย)

### Seed changes — `electron/db/seed.ts`
```
GENERAL/OTC/DANGEROUS → is_fda9=1, is_fda10=0, is_fda11=0, is_fda13=0
SPCL_CTRL/PSYCHO_3/4/NARCOTIC_3 → is_fda9=1, is_fda10=1, is_fda11=0, is_fda13=0
```
DANGEROUS เจตนา `is_fda11=0` — pharmacist ปรับรายตัวตามกฎหมาย ไม่ใช่ default auto-on

### IPC changes
- `electron/ipc/settings.ts` — `saveDrugType` INSERT ใช้ `is_fda9/10/11/13` แทน `khor_yor_report`; UPDATE branch ใช้ dynamic SQL อยู่แล้ว → ทำงานอัตโนมัติ
- `electron/ipc/products.ts` — `products:create` INSERT column list อัพเดต
- `electron/ipc/dev.ts` — test seed INSERT อัพเดต (+2 params, ทุก test product `is_fda9/10/11/13=0`)

### Types — `src/types/index.ts`
- `Product`: `is_fda_report` / `is_fda13_report` → `is_fda9/10/11/13`
- `DrugType`: `khor_yor_report?` → `is_fda9/10/11/13`

### Settings/index.tsx — DrugTypesTab
- `openEdit`: ไม่ต้อง `(d as any)` อีกต่อไป เพราะ `DrugType` type มี is_fda9/10/11/13 แล้ว
- Dialog checkbox labels เปลี่ยนเป็นชื่อรายงานจริง + description "ค่าเริ่มต้นสำหรับสินค้าประเภทนี้"
- Table header: `ขย.*` → `ข.ย.*`

### EditProduct.tsx
- **`is_drug` toggle** — auto-sync `is_fda9 = is_drug` (เดิม: auto-set is_fda_report=1 ตาม is_drug on/off แบบ hard-coded)
- **`drug_type_id` select** — `onChange` ใหม่: เมื่อเลือก drug type → auto-fill `is_fda10/11/13` จาก drug_type defaults ใน `drugTypes` array ที่โหลดไว้แล้ว; `is_fda9` ไม่ถูก override (ผูกกับ is_drug เสมอ)
- **Report toggles section** — เปลี่ยนจาก 2 toggles (is_fda_report, is_fda13_report) → 4 toggles:
  - **ข.ย.9** — แสดง `<Switch disabled>` (ค่าตาม is_drug, ผู้ใช้ไม่แก้ไขได้), opacity-70
  - **ข.ย.10** — editable switch
  - **ข.ย.11** — editable switch
  - **ข.ย.13** — editable switch
- Meta card badge: `is_fda13_report` → `is_fda13`, label `อย.13` → `ข.ย.13`

### Products/index.tsx
- Quick-create payload: `is_fda_report/is_fda13_report` → `is_fda9/10/11/13` (ทุกตัว default 0)
- Products list badge: `is_fda13_report` → `is_fda13`, label `อย.13` → `ข.ย.13`

### Files changed
- `electron/db/schema.ts` — CREATE TABLE + migration block ใหม่
- `electron/db/seed.ts` — drugTypes array + INSERT
- `electron/ipc/settings.ts` — saveDrugType INSERT
- `electron/ipc/products.ts` — products:create INSERT
- `electron/ipc/dev.ts` — insProduct INSERT + run() args
- `src/types/index.ts` — Product + DrugType interfaces
- `src/pages/Settings/index.tsx` — DrugTypesTab labels + openEdit typing
- `src/pages/Products/EditProduct.tsx` — is_drug toggle, drug_type onChange, 4 report toggles, meta badge
- `src/pages/Products/index.tsx` — quick-create payload + list badge

---

## Session 2026-05-12 — Base unit storage refactor: audit + hardening

### Goal
ย้าย base unit ออกจาก `product_units` (เดิม `is_base_unit=1` mirroring prices) → ฝัง `products.unit_id` เป็น single source of truth. ตรวจสอบ refactor + แก้ issue ที่ค้าง.

### Static audit findings (6 issues, all resolved)
1. **Migration steps 2+3 not atomic** — backfill + DELETE were independent `try/catch`. Mid-failure could strand products with `unit_id=NULL`. Fix: wrap in `db.transaction()` with orphan gate (`schema.ts:546-566`).
2. **`products:get` missing unit_name join** — inconsistent with `products:list` / `pos:searchProducts`. Fix: `LEFT JOIN item_units u ON u.id = p.unit_id` (`products.ts:116-121`).
3. **`doSave` could send `unit_id=0`** — placeholder value violates FK. Fix: coerce `0 → null` in payload (`EditProduct.tsx:208-209`).
4. **Dead `default_qty` read** — column doesn't exist; stripped before save but cluttered loadAll. Fix: removed.
5. **CLAUDE.md self-contradiction** — line 36 still listed `unit_id` as "Dropped from products" while line 38 made it the source of truth. Fix: bullet removed.
6. **(Retracted)** `drug_generic_name_id` is actually used in UI (autocomplete display) — kept.

### UI verification — 9/9 scenarios passed
Schema sanity, product list, EditProduct General + Units tabs, POS search modal, cart unit dialog, price dialog, Purchase GR, expiry report. Base row always at top with "หลัก" badge; price dialog correctly hides wholesale rows when value=0; `unit_id` round-trips through save/reload.

### Toggle/Switch sizing pass
- `src/components/ui/switch.tsx` — `Toggle` gained `size?: "sm" | "default" | "lg"` prop, passes through to inner `Switch`.
- `src/pages/Products/EditProduct.tsx` — 13 Switch/Toggle instances bumped to `size="lg"` (VAT, stock, is_drug, ข.ย.9/10/11/13, is_hidden, is_disabled, unit dialog is_for_sale/is_for_purchase, label dialog is_default/is_active/show_barcode).

### Files changed
- `electron/db/schema.ts` — migration transaction + orphan gate
- `electron/ipc/products.ts` — `products:get` JOIN
- `src/pages/Products/EditProduct.tsx` — `unit_id` coerce, drop `default_qty`, switches → `size="lg"`
- `src/components/ui/switch.tsx` — `Toggle.size` prop
- `src/components/ui/card.tsx` — `senary` tint support (MetricCard + StatCard)
- `src/components/ui/tabs.tsx` — segmented active uses `senary`
- `CLAUDE.md` — stale bullet removed

### Commit
`832ef90` — refactor: harden base unit storage and polish EditProduct UI (pushed to `origin/main`)

---

## Session 2026-05-13 — Product create: modal → EditProduct page (with validation + dirty guard)

### Goal
Replace the cramped 5-field "เพิ่มสินค้า" modal on the Products list with the full EditProduct form, so users can enter complete info in one place. Add required-field validation (with `*` markers + red ring + alert) and a dirty guard so accidental back-clicks don't lose work.

### Design decisions
- **Reuse EditProduct, don't fork a new page.** General-tab form has ~30 fields, autocomplete, FDA flags, etc. A separate `AddProduct.tsx` would duplicate all of that and need to be kept in sync forever. Single component, dual mode (`isNew = id === undefined`).
- **Route:** `products/new` (no `:id` param). Same `EditProduct` component handles both `products/new` and `products/:id/edit`.
- **MetricCards in create mode:** stay in place but `opacity-50` + values rendered as `—`. Hiding would shift layout; user explicitly wanted no shift.
- **Other 3 tabs (หน่วยนับ / ฉลากยา / ล็อต):** `disabled={isNew}` with `title` tooltip "บันทึกสินค้าก่อนเพื่อจัดการ..." — they need a product_id to attach to, so save-first-then-manage is the only correct flow.
- **No cancel button → back arrow is cancel.** Dirty-guard alert is the safety net.

### Required fields validation
3-field minimum for save (both modes):
| Field | Reason |
|---|---|
| `trade_name` | Used everywhere for display |
| `unit_id` | Base unit FK; without it `unit_name` resolves to NULL in every list/POS/report query |
| `price_retail` | Can't sell without a price |

Behavior:
- `*` ดาวแดง บน label — `FormField` already supports `required` prop. Added to "หน่วยหลัก" (previously only trade_name + price_retail had the marker but no actual check).
- `errors: Set<string>` — keys of missing fields.
- On save: `validate()` → if non-empty, toast list + scroll/focus first missing field via `document.querySelector('[data-field="..."]')`. Save button stays clickable (doesn't disable).
- `aria-invalid={errors.has(key)}` on Input/SelectTrigger — they already have red border + ring destructive styling under that attribute.
- `setF()` removes the key from `errors` immediately on edit (no wait until next save).

### Dirty guard
- `isDirty` flag — set true by every `setF` call. Initial form load (`loadAll`) writes form via `setForm()` directly so it doesn't mark dirty.
- Back arrow → if dirty, open styled `<Dialog>` ("ยังไม่ได้บันทึก" / [กลับไปแก้ไข] · [ออกจากหน้านี้]); else navigate immediately. Started with `window.confirm()` but switched to the app's Dialog component to match the rest of the UI.
- `beforeunload` listener for refresh/close — Chromium forces a native dialog there; unavoidable.
- Applied to **both** create and edit modes. Edit previously had no guard; now it protects unsaved edits the same way.

### Backend tweak
`products:create` INSERT didn't include `is_drug` — the toggle in the form would be silently lost on create. Added `is_drug` to both the column list and VALUES clause in `electron/ipc/products.ts`.

`is_hidden` / `is_disabled` are stripped from the create payload in the renderer (`doSave`) — they're not part of the INSERT (schema defaults to 0) and including them would risk superfluous-binding errors.

### Default unit pre-select
On create mode, `loadAll` finds the `ชิ้น` row in the loaded `itemUnits` list and pre-selects it as `form.unit_id`. Users can save immediately without picking a unit.

### Files changed
- `src/App.tsx` — new route `products/new` → `EditProduct`
- `src/pages/Products/index.tsx` — removed `showCreate` state, `newProduct` state, `creating`, `handleCreate`, and the entire create dialog. Button "เพิ่มสินค้า" now `navigate('/products/new')`. Dropped unused `itemUnits` state + `ItemUnit` import (only adjust-stock dialog remains, doesn't need units).
- `src/pages/Products/EditProduct.tsx` — `isNew` mode throughout: `loadAll` branch (skip `products.get`, init defaults, pre-select ชิ้น), `setF` flags dirty + clears errors, `validate()` + `REQUIRED_FIELDS` constant, `goBack` + `<Dialog>` leave-confirm, `beforeunload` listener, conditional PageHeader title/button text, MetricCards opacity, tabs disabled, `aria-invalid` + `data-field` on 3 required inputs, `required` prop added to "หน่วยหลัก", create branch in `doSave` calls `products.create` + `navigate(replace:true)` to edit URL.
- `electron/ipc/products.ts` — `products:create` INSERT now includes `is_drug` column.

### Verification
- `npx tsc --noEmit` — 19 errors, same as baseline before this session (no new TS errors introduced).
- Not user-tested in Electron yet — pending manual run-through.

---

## Session 2026-05-14 — Adjust-stock rewrite: kill ADJ phantom lot, proper FEFO + lot-aware increase

### Goal
The old "ปรับสต็อก" button on the Products list used a synthetic `ADJ` lot per product to absorb every adjustment. That broke FEFO (real lots' qty never moved, so closest-to-expiry stock didn't get touched on shortage), let qty go arbitrarily negative, and lost cost provenance — free/promotional stock never had its zero cost reflected in the weighted-avg `products.cost_price`. Rebuild the flow with proper per-lot accounting.

### Design decisions
Three operator-picked modes, driven by delta direction:

| Mode | When | Backend behavior |
|---|---|---|
| **decrease** | target < current | Auto-FEFO. Sort open lots by `expiry_date ASC NULLS LAST, id ASC` and deduct in order, spanning multiple lots if needed. Auto-close lots whose qty hits 0. |
| **increase_new_lot** | target > current, separate source / different expiry | Create a brand-new `product_lot`. Operator supplies lot_number (auto-generated `ADJ-YYYYMMDD-NNN` if blank), expiry, cost (default 0 for freebies). |
| **increase_existing_lot** | target > current, supplier bundled freebies with an existing batch | Add qty into a chosen lot. `qty_received` grows; `cost_price` is recomputed as weighted-avg within the lot. Same total contribution to `products.cost_price` as creating a new lot — the math is `(old_qty × old_cost + added_qty × added_cost) / new_qty`. |

All three paths recompute `products.cost_price` at the end, validate `userId`/`note`/`qty > 0`, and write `stock_movements` rows. The existing-lot merge path also writes `lot_cost_logs` when cost moves materially.

### Why not just guard the ADJ approach
Adding `qty >= 0` checks would stop the negative spiral but not fix the underlying issues: real lots' FEFO order is still ignored on decrease, and ADJ has no expiry/cost so free stock still gets lost in reporting. The rewrite was cheaper than the half-fix.

### Frontend modal design
`Products/index.tsx` adjust-stock dialog rewritten:
- **Fixed height `h-[860px] max-h-[92vh]`** + `grid-rows-[auto_1fr_auto]` so header/body/footer rows are stable. Body uses `flex flex-col overflow-y-auto`; the note section has `mt-auto` to stay pinned at the bottom regardless of which conditional section is showing.
- **Top:** product info + per-lot breakdown (lot_number / expiry / qty) — shows the operator the current FEFO order before they pick a target.
- **Target input** unchanged in semantics; delta badge moved to left, input to right.
- **Decrease:** red-bordered FEFO preview lists each lot that will be hit, with `qty_before → qty_after` and `−deducted` count.
- **Increase:** two-button mode picker (`สร้างล็อตใหม่` / `เพิ่มเข้าล็อตเดิม`). New-lot form has lot_number + DateInput expiry + cost. Existing-lot form has a `font-mono` dropdown showing only lot_number; the lot's expiry/qty/cost render in a `bg-card` box to the right of the dropdown. Cost-input and merged-lot cost preview live in the same `grid-cols-[180px_1fr]` row so widths match the dropdown row above.
- Note section preserved (quick reasons + free text). Enter submits.

### Backend
`electron/ipc/products.ts` — `products:adjustStock` handler completely rewritten:
- Dispatches on `data.mode` (`decrease` / `increase_new_lot` / `increase_existing_lot`).
- Local `recomputeAvgCost(pid)` helper runs at end of every branch.
- Auto-generated lot numbers use `ADJ-YYYYMMDD-NNN` (NNN unique per product per day) — same pattern as GR but with `ADJ-` prefix.
- `increase_existing_lot` reopens closed lots (`is_closed = 0, closed_at = NULL`) when qty crosses back above 0.

### New project-wide rule: minimum text size = `text-sm` (HARD)
Operator pushback during this session: `text-xs` and arbitrary smaller values (`text-[10px]`, `text-[11px]`) are harsh on the Thai/Inter/Sarabun stack and break rhythm. Codified:
- `CLAUDE.md` theming rule #9 — banned `text-xs` and smaller arbitrary values in new code; existing legacy can be cleaned up opportunistically but is not a blocker.
- Memory: `feedback_text_size.md`.

### Files changed
- `electron/ipc/products.ts` — `products:adjustStock` rewritten (lines ~214 onward); ~200 LOC delta.
- `src/pages/Products/index.tsx` — modal rewritten; new state (`productLots`, `lotsLoading`, `increaseMode`, `newLotNumber`, `newLotExpiry`, `newLotCost`, `targetLotId`, `addedCost`), `useMemo` derivations (`fefoPreview`, `mergedLotPreview`, `mergeCandidates`, `selectedTargetLot`, `openLotsSummary`), `openAdjust` loads lots via `products.getLots`, `handleAdjust` builds mode-specific payload. Imports gained `useMemo`, `DateInput`, `ProductLot`, `Layers`/`FolderInput`/`Info` icons.
- `CLAUDE.md` — added rule #9 (`text-sm` minimum).
- `memory/feedback_text_size.md` — new memory entry; index updated in `MEMORY.md`.

### Verification
- `npx tsc --noEmit` filtered to changed files — zero new errors. (Pre-existing 19 baseline errors elsewhere unchanged.)
- Not Electron-tested by Claude. Verify manually:
  1. **Decrease across multiple lots** — set target below `Lot A.qty` and confirm FEFO splits to Lot B.
  2. **Increase, new lot, cost = 0** — verify new `ADJ-...-001` lot appears in EditProduct → ล็อต tab; `products.cost_price` weighted-avg drops appropriately.
  3. **Increase, existing lot, cost = 0** — verify chosen lot's `qty_received` grows, `cost_price` is the new weighted average, and `lot_cost_logs` got a row.
  4. **Modal layout** — switch between modes; verify height stays at 860px and the note section stays pinned at the bottom.

---

## Session 2026-05-15 — Design-system consolidation (phase 1: foundation + showcase)

Operator: app UI felt scattered; wants uniform look editable from one place (colors, radius, borders, card structure). Decisions made this session: card = `rounded-2xl` **via token**; ordinal color tokens **renamed by role** (values unchanged); unused Button variants **cut**; **showcase-first** — bring the Theme page to standard before touching other pages.

### Done
- **Radius tokenized.** Added `--radius-card: 1rem` + `--radius-control: 0.5rem` to `:root` + `.dark` (`index.css`); registered `rounded-card` / `rounded-control` in `tailwind.config.js`. Card roundness is now a one-file edit.
- **Card components unified.** `Card` / `SectionCard` / `MetricCard` / `StatCard` → `rounded-card` + `shadow-card` (dropped `Card`'s odd `rounded-xl`+ring). Fixed `MetricTint`/`SectionTint` type to match impl.
- **Ordinal tokens renamed by role** (pure rename, values unchanged — dark-mode-safe): `quaternary→brand-soft`, `quinary→info-soft`, `senary→warm`. Applied across `index.css`, `tailwind.config.js`, `button.tsx`, `badge.tsx`, `card.tsx`, `tabs.tsx`, `select.tsx`, `pages/{Products,Products/EditProduct,POS,Purchase,Theme}`. Residual ordinal tokens = 0.
- **Button `warning` variant removed** (0 real uses; Purchase had 2 ternary uses → switched to `warm`). `Badge variant="warning"` kept (status). 
- **Theme page (`/theme` → "คอมโพเนนต์") is now the standard showcase**: Section frame → `rounded-card`+`shadow-card`; all `text-xs`/`text-[11px]`/`text-[9px]` → `text-sm`; removed `bg-neutral-900` literal; added showcase sections for **SectionCard / MetricCard / StatCard**, **Standard Table-Card Layout**, and **Modal Layout** (2-col form + scrolling body).
- **CLAUDE.md** updated: new variant names, Button-vs-Badge `warning` note, `--radius-card`/`rounded-card` standard, guideline examples re-pointed to `warm`/`info-soft`.

### Verification
- `npx tsc -p tsconfig.json --noEmit` — no NEW errors. Pre-existing baseline unchanged (EditProduct field props, `dialog.tsx` `icon-m`, `themeStore.ts` line 57).
- Dev server boots clean (Vite + Electron). **Not visually verified by Claude** — operator to eyeball `/theme`, esp. dark-mode `brand-soft`/`warm`.

### Next (phase 2 — consistency sweep, after operator reviews the showcase)
1. Replace raw `<button>`/`<input>` with `Button`/`Input` — POS (2), EditProduct (1), Settings (input).
2. Kill duplicated page-local helpers → shared components: `SummaryCard`→`MetricCard`, `NumInput`→`Input`, `FieldGroup`→`FormField`, `SectionTitle`; relocate `SortableHead`/`DaysCell`/`ExpiryDateCell` into `components/ui`.
3. Remaining `text-xs` sweep (~115 across non-demo pages) → `text-sm`.
4. Ad-hoc card wrappers (`rounded-lg/xl/2xl` mix in Purchase/POS/Products/Reports) → `rounded-card shadow-card`.

---

## Session 2026-05-16→17 — Cost-price model overhaul (weighted-avg vs last-paid vs FEFO-lot)

Operator audited *where every cost figure on screen comes from*, page by page. Root problems found: (1) `purchase.ts` on receive overwrote `products.cost_price` with the **last-in** lot cost, not a weighted avg — so the displayed cost jumped on receive then "snapped back" to the real avg on the next lot-edit/adjust/GR-cancel (which *do* recompute). (2) POS profit used `products.cost_price` (avg) **and** had a unit bug: `qty (selected unit) × cost (per base unit)` → margin off by `qty_per_base` for แผง/กล่อง. (3) EditProduct let the operator hand-type `cost_price`, clobbering the auto-managed avg.

**Decided 3-cost model (the canonical reference for all future cost work):**
| Cost | Meaning | Used for |
|---|---|---|
| `products.cost_price` | weighted avg of open lots, **auto-managed by every stock flow, never hand-edited** | inventory valuation + report/COGS profit |
| `products.last_cost_price` (**NEW column**) | last cost we actually **PAID** (free goods cost=0 do NOT overwrite it) | pricing reference (set sell price off replacement cost) |
| FEFO front-lot cost | cost of the specific lot about to be dispensed | true margin of *this* sale at POS |

### Done
- **`schema.ts`** — added `products.last_cost_price REAL NOT NULL DEFAULT 0` (CREATE + idempotent migration). Backfill = newest lot with `cost_price > 0`, else `0` (free-only / never-received → 0).
- **`purchase.ts` receive** — `price_retail` updated as before; `last_cost_price` set **only when `item.cost_price > 0`** (a freebie no longer wipes the real prior cost — the scalar self-tracks "last non-zero paid"); `cost_price` is NOT set inline anymore — recomputed as the weighted avg of open lots **after** the item loop (same query shape as lot-edit / GR-cancel). Cost is now consistent on every path.
- **`types/index.ts`** — `Product.last_cost_price`.
- **POS payment dialog** (`POS/index.tsx`) — `totalCost` is now a **FEFO simulation** mirroring `saveBill` (lot remaining tracked across the whole cart, oversold remainder → avg) **+ fixed unit conversion** (`baseQty = qty × qty_per_base`). Preview profit now == reports profit.
- **POS price modal** — margin reference switched from avg → **FEFO front lot cost** (`product.lots[0]`, fallback `last_cost_price` → `cost_price`), `× qty_per_base`.
- **Purchase price modal** — "ทุนเก่า" baseline (`prevCost`) switched from avg → `last_cost_price`, **no fallback** (genuine 0 from free goods stays 0, not hidden behind the avg).
- **`products:create`** — INSERT now includes `last_cost_price`; a new product (no lots) seeds **both** `cost_price` and `last_cost_price` from the entered value.
- **EditProduct** — General-tab "ราคาทุน (ล่าสุด)" field loads/edits `last_cost_price`, **editable always (Hygeia-style)**; on save it writes `last_cost_price` only and **`cost_price` is stripped from the payload** (never clobbers the avg); new product seeds both. "ราคาทุน" MetricCard shows last cost with a `เฉลี่ย ฿X` sub-line; profit/% glance now vs last cost.

### Verification
- `npx tsc --noEmit -p tsconfig.json` — **no NEW errors**. Same 8 pre-existing baseline (dialog.tsx `icon-m`, EditProduct `FullProduct`/`ProductLabel` props, `themeStore.ts` line 61).
- **Not run / click-tested by Claude** — operator to dev-run and eyeball: receive a lot → cost stays put (avg, not jumpy); free-goods receive doesn't zero "ทุนเก่า"; POS profit for a กล่อง item is sane; EditProduct cost edit doesn't move the avg.

### Known follow-ups (display-only, NOT done — flagged to operator)
- **GR-cancel** and **`products:updateLot`** recompute `cost_price` (avg) but do **not** refresh `last_cost_price` → it can go stale after cancelling the GR that set it, or editing a lot's cost. Decide whether to refresh.

### Next — Reports page cost audit (last page in the sweep)
1. Trace every cost/profit/valuation figure in `Reports/*` + `reports.ts`: confirm COGS uses **FEFO lot cost** via `sale_item_lots → product_lots` (it does at `reports.ts:39,70`), inventory valuation uses lot cost (`reports.ts:141`), purchase report uses `purchase_receipt_items.cost_price`.
2. Hunt the **same unit-conversion class of bug** (selected-unit qty × per-base cost) anywhere reports compute line cost.
3. Then decide the GR-cancel / lot-edit `last_cost_price` refresh question above.

---

## Session 2026-05-17 — Design-system sweep (phase 2): People page refine

Continuing phase 2 consistency sweep page-by-page. This session = `People/index.tsx` brought fully onto the showcase/table-card standard, plus one backend fix surfaced during the audit.

### Done — `src/pages/People/index.tsx` (UI only, all 3 tabs: ลูกค้า / ผู้จำหน่าย / พนักงาน)
- **Standard table-card layout** adopted (matches `Products/index.tsx` canonical): removed outer `rounded-2xl` card-in-card; Tabs sit on background (`default` variant); each tab = toolbar → `bg-card rounded-card shadow-card` card with `h-12` header bar (count left + `h-9` Add button right), table area `border-l-8 border-r-8 border-card`, `h-12 border-t` footer pagination bar.
- **Primitives per convention**: raw `<select>`/`<textarea>`/`<label>` → `Select` / `Textarea` / `Label`; row actions `size="sm" variant="ghost"` → `className="w-16" size="icon-lg"` split by role (`warm` แก้ไข / `destructive2` ลบ); `Edit2`→`Edit` icon; Button-icon `w-N h-N` → `size-N`.
- **Token/text rules**: `rounded-2xl`/`rounded` literals → `rounded-card`/`rounded-lg`; all `text-xs` outside Badge → `text-sm`; redundant Badge `text-xs` overrides dropped; empty states → lucide icon `size-10 opacity-30` + `py-16`.
- **Realtime search**: debounced 300ms `useEffect([q])` (mirrors Products); search button + Enter handler removed (Customers + Suppliers tabs).
- **All 3 modals → showcase Modal Layout**: `DialogContent` `onClose` wired (X button now closes); fields `<div className="space-y-1.5"><Label>…</Label><control/></div>` (dropped `FormField` — its uppercase-bold doesn't match the showcase); `DialogDescription` added to every header; Select `className="w-full"` (no h-10/rounded override); Switch in modals `size="lg"` + inline `<Label>`; Enter→primary-OK wired via `submitOnEnter` (Textarea exempted); footer already `destructive2`+`size="xl"`.

### Done — backend fix (surfaced during People audit)
- **Customer running code unified.** Two divergent generators (`people:saveCustomer` used `WHERE code LIKE 'C%' ORDER BY id DESC`; POS `pos:addCustomer` used `ORDER BY id DESC` *unfiltered* → could collide on `C0001`). Replaced both with a single shared helper `electron/ipc/codes.ts` → `nextCustomerCode(db)` using `MAX(CAST(SUBSTR(code,2) AS INTEGER))+1` (immune to out-of-order import / hand-edited codes; C0000 walk-in keeps suffix 0 so first real customer = C0001).
- Confirmed (no change needed): customer/supplier/staff delete is **soft** (`is_hidden`/`is_disabled`), not a hard DELETE — preserves FK history.

### Open question flagged to operator (NOT actioned)
- **C0000 "ลูกค้าทั่วไป" is a real selectable row** (`is_hidden=0`) but POS walk-in default is a hardcoded string with `customer_id = NULL` — same label, two buckets. Recommended: seed C0000 with `is_hidden=1` and treat `customer_id IS NULL` as the only walk-in path. Operator edited the C0000 name but the `is_hidden` decision is still pending.

### Verification
- `npx tsc --noEmit -p tsconfig.json` — **no NEW errors** in `People/index.tsx`, `codes.ts`, `people.ts`, `pos.ts`. Same pre-existing baseline (dialog.tsx `icon-m`, EditProduct props, `themeStore.ts` line 61).
- **Not click-tested by Claude** — operator to dev-run and eyeball People (all 3 tabs + modals), and verify new-customer code = next C-number with no collision from POS quick-add.

### Next — remaining phase-2 pages, then detail-fix round
1. **`Reports/*`** — bring onto table-card / showcase standard (overlaps with the Reports cost audit queued in the previous session — do together).
2. **`Settings/index.tsx`** — same sweep (raw `<input>` flagged in phase-2 plan; tab/card/modal standardization).
3. **Detail-fix round (after all pages swept):** re-run each page fresh from the top, eyeball-by-eyeball, and fix the fine-grained issues that only show at runtime (spacing, alignment, edge-state polish) — a dedicated pass, not folded into the structural sweep.

---

## Session 2026-05-17 — `EditProduct.tsx` split into per-tab files

Operator noticed Reports already splits each tab into its own file but `EditProduct.tsx` was still a single **2,155-line / 117KB** monolith with 5 tabs (general, units, labels, lots, history) sharing the file. Asked: should we do the same here? Decision: yes — pure structural refactor, no behavior change, one tab at a time to keep risk low.

### Strategy
Order chosen by coupling, least → most: **History → Lots → Labels → Units → General**. History is read-only with self-contained state (movements + filters + sale/GR detail dialogs) — safest first move. General last because it owns the form and feeds save logic.

Parent (`index.tsx`) keeps the cross-cutting bits: `form` + `setF` + `validate` + `handleSave`/`doSave`, `product` + `loadAll`, `tab` state, lookups (`categories`/`drugTypes`/`itemUnits`/label-*), PageHeader, 4 MetricCards, Tabs nav, and the 3 cross-cutting dialogs (PriceWarning, LeaveConfirm, AdjustStockDialog).

Each extracted tab owns its own dialog state, form draft, in-tab handlers, and the dialog markup. Mutation IPCs inside a tab call back through `onRefresh()` (prop), which re-fetches `product` in the parent — preserves the single source of truth.

### Done
- **Folder layout** — `src/pages/Products/EditProduct.tsx` → `src/pages/Products/EditProduct/` via `git mv` (rename preserves history). Vite/lazy import (`./pages/Products/EditProduct` in `App.tsx`) resolves to the folder's `index.tsx` automatically — no route change needed.
- **`shared.ts`** — extracted types/constants used by multiple files: `FullProduct`, `StockMovement`, `MovementSortKey`, `MOVEMENT_META`, `GenericNameSuggestion`, `REQUIRED_FIELDS`, `REQUIRED_LABEL`.
- **`HistoryTab.tsx`** — owns `movements`/`movementsLoading`/filters/sort/date-range state, lazy-load effect (`active` prop gates the first fetch), `reloadMovements`/`filteredMovements`/`toggleMovementSort`/`openMovementDetail`. SaleDetail + PurchaseReceipt detail dialogs moved into the tab (they're history-only).
- **`LotsTab.tsx`** — owns lot inline-edit state (`editingLotId`/`lotEditForm`/`lotSaving`/`confirmLot`) + handlers (`startEditLot`/`handleSaveLot`/`getLotEditChanges`/`confirmSaveLot`) + confirm dialog. Recomputes `activeLotList`/`totalStock` locally for the footer; parent also computes them for the MetricCards (cheap, no shared state needed).
- **`LabelsTab.tsx`** — owns `labelDialog`/`editingLabel`/`labelForm`/`labelSaving` + add/edit/delete + the giant label dialog (multi-language indication/notes, 5 lookup selects). Receives the 5 label lookups via props.
- **`UnitsTab.tsx`** — owns `unitDialog`/`editingUnit`/`unitForm`/`unitSaving` + add/edit/delete + the unit dialog (qty_per_base math, profit/per-piece calc). Synthetic base row at top rendered from `product.unit_name` + `product.price_*` with "แก้ไขที่แท็บข้อมูลทั่วไป" hint. Takes `defaultPriceRetail={form.price_retail}` so "add new unit" still seeds the price from the General tab's current value (preserving the cross-tab coupling).
- **`GeneralTab.tsx`** — owns generic-name autocomplete state (`genericQuery`/`genericSuggestions`/`showGenericSugg`/`genericTimer` ref) + `handleGenericSearch`/`selectGeneric`. Receives `form`/`setF`/`setForm`/`errors`/lookups. `setForm` (not just `setF`) is passed because the drug-type select does a compound multi-field update.
- **Parent `index.tsx`** — added `refreshProduct()` helper (re-fetches product after a tab mutation). Cleaned unused imports after each extraction.

### Final shape
```
src/pages/Products/EditProduct/
├── index.tsx       557  (parent: form state, save, tab routing, 4 metric cards)
├── shared.ts        58  (types/constants)
├── GeneralTab.tsx  458
├── HistoryTab.tsx  323
├── LotsTab.tsx     301
├── LabelsTab.tsx   300
└── UnitsTab.tsx    362
```
Before: 2,155 LOC in one file. After: 7 files, largest 557. Total grew by ~200 LOC (per-file imports + prop interfaces) — fair trade.

### Files changed
- `src/pages/Products/EditProduct.tsx` → **moved** to `src/pages/Products/EditProduct/index.tsx` (git tracks as rename) and slimmed by removing each tab's state/handlers/JSX as they were extracted.
- **New:** `src/pages/Products/EditProduct/shared.ts`, `HistoryTab.tsx`, `LotsTab.tsx`, `LabelsTab.tsx`, `UnitsTab.tsx`, `GeneralTab.tsx`.

### Verification
- `npx tsc --noEmit -p tsconfig.json` — **no new errors**. Same pre-existing baseline (dialog.tsx `icon-m`, `themeStore.ts` line 61, `FullProduct.drug_generic_name_id` / `tmt_id` in `loadAll`, `ProductLabel.label_time_id`/`advice_id`/`show_barcode`/`is_default` — all pre-existed in the type defs and were untouched).
- **NOT click-tested by Claude.** Operator MUST exercise each tab end-to-end before relying on the refactor:
  1. **General** — create new product, required-field validation, generic-name autocomplete (auto-tick antibiotic), drug-type select → ข.ย.10/11/13 auto-fill, save → redirect to edit URL, leave-confirm if dirty.
  2. **Units** — synthetic base row at top, add/edit/delete non-base, qty_per_base math + profit preview in dialog.
  3. **Labels** — add/edit/delete, all 5 dropdowns (dosage / frequency / timing / label_time / advice), multi-language indication.
  4. **Lots** — inline edit, validation blocks blank/NaN, confirm dialog shows diff, `is_cancelled` lots have no edit button, qty crossing 0 closes/reopens lot.
  5. **History** — filter chips, date range, sort by created_at + lot_number, "ดูข้อมูล" opens SaleDetail or PurchaseReceipt dialog.
  6. **Cross-tab** — save in General → switch to Units → confirm price_retail still default for new unit; save Lots/Units/Labels mutation → parent product refreshes (MetricCard counts update).

### Why this matters for next time
Adding a feature or hunting a bug in EditProduct is now a single-file edit. Pre-refactor, any change meant scrolling through 2k lines with state for all 5 tabs in scope. Same goes for HMR: changing a tab no longer re-parses the whole monolith.

### Architectural rules baked in
1. Tabs are **owners of their dialog state**, not the parent — keeps each tab self-contained.
2. Mutation refresh is via the **`onRefresh` callback prop** — parent stays the single source of truth for `product`.
3. **Form state lives in the parent** because the save button (PageHeader) and the cross-cutting price-warning dialog both need it; only the General tab reads/writes it via `setF`/`setForm`.
4. **Cross-tab couplings stay explicit** as named props (e.g. `defaultPriceRetail` to UnitsTab) — no module-level singletons, no context.
