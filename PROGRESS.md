# Syntropic Desktop - Build Progress

## Status: ~55% Complete
## Last updated: 2026-04-21
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

## Known Issues / Notes
- VS 2026 installed but missing "Desktop development with C++" workload — cannot compile native modules from source
- better-sqlite3 prebuilt binary obtained via prebuild-install targeting Electron 31.7.7
- `postcss.config.js` ESM warning — harmless, can be silenced by adding `"type": "module"` to package.json
- DevTools Autofill errors — harmless Chromium noise
