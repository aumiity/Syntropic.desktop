# Syntropic Desktop - Build Progress

## Status: 100% Complete + UI Polish ✅ — 🚧 Theme refactor in progress · Products page redesigned + EditProduct save bug fixed (2026-05-06)
## Last updated: 2026-05-06
## App is RUNNABLE — run `npm run electron:dev` to launch
## ⚠️ Pick up next session: see "🚧 IN PROGRESS — Theme tokenization" below — and the new "Session 2026-05-06 — POS Unit Logic Hardening + Products Redesign + EditProduct Save Fix" entry for what just changed

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
- **EditProduct ghost columns** — `unit_name` (free-text), `drug_generic_name_id`, `has_wholesale1`, `has_wholesale2`, `default_qty` are accepted by the UI but silently discarded on save (no matching column in `products` table). Either remove the inputs or migrate the schema. CLAUDE.md's schema notes still list these as if they exist — should be reconciled.
- DevTools Autofill errors — harmless Chromium noise
