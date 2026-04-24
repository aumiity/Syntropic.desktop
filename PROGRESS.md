# Syntropic Desktop - Build Progress

## Status: 100% Complete + UI Polish ✅
## Last updated: 2026-04-24
## App is RUNNABLE — run `npm run electron:dev` to launch

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
  - Supplier dropdown, supplier invoice no, receive date
  - Payment type: cash / credit (with due date + paid tracking)
  - Multi-row item entry with live product search + lot/expiry/cost/sell/qty fields
  - Running total per row + grand total footer
  - Save with validation → success dialog → form reset
  - History table with filters (search, supplier, date range) + pagination
  - Receipt detail modal
  - Product search (barcode/name/code, live results with lot info + expiry warnings)
  - Cart: add/merge duplicate items, qty +/- inline, remove, per-item discount
  - Customer search dialog (name/phone/HN), alert badge, quick-clear
  - Sale type selector (retail/wholesale/rx)
  - Payment dialog: cash + card + transfer, change calculation, disabled until paid enough
  - Saves bill via IPC (FEFO deduction), shows daily stats (bills count, total, last time)
  - Success dialog with invoice number

---

## PENDING 🔧

### Pages — Stubs only (show "กำลังพัฒนา"), need full implementation:

| Page | File | Key Features Needed |
|------|------|---------------------|
| รับสินค้า | `src/pages/Purchase/index.tsx` | GR# auto, supplier select, line items table, lot/expiry/cost inputs, save + history table |
| สินค้า (list) | `src/pages/Products/index.tsx` | Search/filter, stock qty, category filter, link to edit |
| แก้ไขสินค้า | `src/pages/Products/EditProduct.tsx` | All product fields, unit variants tab, medicine labels tab, lots tab |
| บุคคล | `src/pages/People/index.tsx` | 3 tabs: Customers (with allergy info) / Suppliers / Staff |
| รายงานการขาย | `src/pages/Reports/Sales.tsx` | Date filter, summary cards (subtotal/discount/cost/profit), list, sale detail modal, void with reason |
| รายงานการซื้อ | `src/pages/Reports/Purchases.tsx` | Date/supplier filter, receipt list, receipt detail modal |
| ตั้งค่า | `src/pages/Settings/index.tsx` | 3 tabs: Categories / Units / Drug Types + Shop info form |

---

## NEXT SESSION — Build order (1 page per prompt, ask to continue each time)

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

## Known Issues / Notes
- VS 2026 installed but missing "Desktop development with C++" workload — cannot compile native modules from source
- better-sqlite3 prebuilt binary obtained via prebuild-install targeting Electron 31.7.7
- `postcss.config.js` ESM warning — harmless, can be silenced by adding `"type": "module"` to package.json
- DevTools Autofill errors — harmless Chromium noise
