---
name: table-pattern-refactor
description: "List-page pattern (ProductsList) rolled out across the app on 2026-05-27. What's done, what's pending, and the conventions to follow when continuing."
metadata: 
  node_type: memory
  type: project
  originSessionId: c9c33eea-7439-4684-883d-15ecc515f60e
---

**ACTIVE 2026-05-27 — paused, resume tomorrow on edit/settings sub-tabs.**

## Why

Visual + UX consistency across all list pages — one filter strip layout, one row-action menu, one footer, one stat-card style. Drove this from `ProductsList.tsx` as the reference.

**Why:** การ์ดเดิม Manage ทำเป็น clickable StatCard ตัดสลับกับ Products ที่ใช้ passive MetricCard. ผู้ใช้ตัดสินใจให้ Sales/Purchases ย้าย filter ลงปุ่ม Filter popover แทน clickable card → ทุกหน้าใช้ MetricCard เป็น dashboard อย่างเดียว.

**How to apply:** ก่อนแก้ตารางใหม่ อ่านไฟล์อ้างอิงคู่ — `src/pages/Products/ProductsList.tsx` (full canonical) + `src/components/ui/card.tsx` (MetricCard primitive) + `src/components/ui/table.tsx` (TableRow with `has-[td[colspan]]:hover:bg-transparent` for empty-state) + `src/components/ui/avatar.tsx` (new). ใช้ pattern ที่ปักไว้แล้ว ไม่ต้องคิดใหม่.

## Pattern parts (HARD invariants for any list page)

1. **Title cluster** (filter strip left) — `<span size-8 rounded-lg border border-border bg-card shadow-sm>` icon-in-box + `<h3 text-lg font-semibold>` heading + `<Badge variant="neutral-outline">` count
2. **Filter strip** `px-4 h-14` — search/select/date controls use `variant="elevated"` + `className="h-9"`, action popovers use `<Button size="lg" variant="elevated" className="h-9 w-9 p-0">`
3. **Two popovers (right cluster)** — Filter (`<Filter/>` icon) for status filters, Settings2 (`<Settings2/>`) for column visibility
4. **Table card** wrapper — `bg-card rounded-card shadow-card border border-border overflow-hidden` + inner table `border-l-[16px] border-r-[16px] border-card`
5. **TableRow** for data — `[&_td]:py-2.5 [&_td]:font-medium` (no per-cell font-medium/font-semibold)
6. **Row action** — `<TableHead className="text-center">` + `<TableCell><div className="flex justify-center"><Popover>` with MoreHorizontal ghost button → menu items
7. **Footer** `px-5 h-12` — left = "จำนวนแถว + Select elevated h-9 + แสดง start-end" (computed inline IIFE), right = `<Pagination className="w-auto" />`
8. **Stat cards (shell-level)** — passive MetricCard (no onClick), `sub: 'รายการ'` + `subClassName: 'text-base text-foreground'` + `valueClassName: 'text-foreground'` (when tint=success/warning otherwise tints the value). Disabled-style card uses `tint: 'destructive'`.

## Components added/changed today

- **`src/components/ui/avatar.tsx`** (NEW) — `<InitialAvatar name size>` renders rounded User icon tinted by name hash (8-color palette). Used in Sales customer column. Initials abandoned: Thai leading vowels (เแโใไ) read awkwardly.
- **`src/components/ui/card.tsx`** — uses the `destructive` MetricTint for disabled cards (the old `destructive2` name no longer exists), MetricCard inner content uses `justify-start` (label aligns with top of icon-box), value hardcoded `text-3xl` (cqi container query was unreliable).
- **`src/components/ui/table.tsx`** — `TableRow` gets `has-[td[colspan]]:hover:bg-transparent` so empty/loading rows skip the hover highlight automatically.
- **`src/components/ui/date-range-picker.tsx`** + **`src/components/ui/date-input.tsx`** — both got `variant="elevated"` matching SelectTrigger/SearchInput.
- **`src/pages/Products/index.tsx`** — shell owns shared stats via `refreshSummary()` in outlet context (replaces per-tab `setSummary`).
- **`src/pages/Manage/index.tsx`** — render branches: `c.onClick` → StatCard, else → MetricCard. Plus `valueClassName`/`subClassName` on the summary interface.

## Files converted (full pattern unless noted)

- Products/ProductsList ✓ Products/BundlesList ✓
- People/index.tsx (3 tabs: Customers/Suppliers/Staff) ✓ — shell hosts 4 MetricCards + add button next to tabs, `addNonce` nonce drives each tab's add dialog
- Manage/Sales ✓ — filter moved from cards into Filter popover today, cards became MetricCard
- Manage/Purchases ✓ Manage/LowStock ✓ Manage/NegativeStock ✓ Manage/Expiry ✓ (cards still clickable StatCard — only Sales did the migration; others can follow same path if desired)
- Reports/Sales ⚠️ partial (dashboard not list — just title cluster + border + font-medium row)
- Reports/Purchases ⚠️ partial (same)

## Skipped — different shape, don't force pattern

- Purchase/index.tsx — workflow data-entry spreadsheet
- POS/index.tsx — cart spreadsheet
- PurchaseIntake/index.tsx — paste-and-match form
- Reports/Dashboard.tsx — section tables, not a list

## Pending tomorrow — edit/settings sub-tabs

User said "พรุ่งนี้มาทำ tab อื่นๆ". Likely targets:

- `src/pages/Settings/{UnitsTab,CategoriesTab,DrugTypesTab}.tsx` — settings spreadsheets, may or may not benefit from the pattern (they're lookup tables, no pagination)
- `src/pages/Products/EditProduct/{UnitsTab,PriceTab,LotsTab,HistoryTab}.tsx` — sub-tabs inside edit product
- `src/pages/Products/EditBundle/{PriceTab,ComponentsTab,HistoryTab}.tsx`

Confirm with user first — sub-tabs often use spreadsheet-style `table-fixed` inline editing which differs from list pattern. Ask about scope before applying.

## Remaining migrations (if asked later)

- Convert clickable status cards in Purchases/LowStock/Expiry to passive MetricCard + Filter popover, like Sales got today.
- Wire BundlesList add-button into shell (currently shell already covers it — verified).

## Related

[[products-list-pattern]] (this is essentially that — keep as the canonical reference) · [[theme-tokenization]] (the elevated/destructive/border tweaks fed into this) · [[modal-behavior]] (no changes to modals today)
