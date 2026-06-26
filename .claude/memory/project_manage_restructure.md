---
name: manage-reports-restructure
description: Active priority — split old Reports into operational /manage vs analytics /reports; phased
metadata: 
  node_type: memory
  type: project
  originSessionId: 28df6a4c-3287-4366-b97f-183881c109cf
---

The old `Reports` section mixed two jobs (operational doc/stock mgmt vs analytics/compliance). Being split by user role. Full phased plan + IA diagram in PROGRESS.md "Session 2026-05-19".

**Why:** `Reports/Purchases.tsx` was a weaker duplicate of the Purchase history tab — root cause was the mixed-concern Reports section.

**How to apply:** Active priorities are in the PROGRESS.md top block. As of 2026-05-19 (branch `refactor/phase2-extract-purchase-history` merged to main via `fa4ea0b`): **Phase 1–4 DONE, Phase 5 is a stub**. tsc clean, but **Phase 1–4 NOT click-tested**. Phase 5 (รายงาน อย. = [[project_kho10_kho11]]) blocked on operator providing exact อย. form specs.

Done: `/manage` has 4 tabs (Sales w/ void · Purchases · LowStock · Expiry); `Purchase/index.tsx` gutted to receive-form-only; `/reports` rebuilt = finance dashboard (`Reports/{Finance,Payables,index}.tsx`) + FdaReports stub; "รายงาน" back in Sidebar; old redirects removed. POS "ยกเลิกบิล" fix (Session 2026-05-19b) + FEFO unit-conversion bug fix both shipped in `3a4b16e`.

Still pending: click-test Phase 1–4; Phase 5 (blocked on spec); delete DEV-ONLY role toggle in `Reports/Finance.tsx` (2 spots) when real login lands; Product Bundle/Kit feature Phase 1 (Session 2026-05-19c, designed+approved, not started).

**Update 2026-06-04 — dashboard consolidation + expense register relocation (tsc clean, NOT click-tested):**
- `/reports` now has ONE dashboard = `Reports/NewDashboard.tsx` (the `index` route). Old `Reports/Dashboard.tsx` DELETED; the "แดชบอร์ด (ใหม่)" tab + `/reports/new` route removed. `/reports` tabs are now just แดชบอร์ด + รายงาน อย.
- The ค่าใช้จ่าย **register** (table + add/edit/delete via `ExpenseFormDialog`, category filter, sort) moved OUT of the dashboard into its own page **`Manage/Expenses.tsx`** → route `/manage/expenses`, tab "ค่าใช้จ่าย" (Wallet icon), placed **last**. NO summary/MetricCard band — it's a bare table-card tab like NegativeStock (count + total live in the table footer; the page never calls setSummary). The dashboard keeps only a read-only ค่าใช้จ่าย breakdown card.
- `Manage` page header renamed **"ประวัติ & สต็อก" → "การจัดการ"** (matches the folder); Sidebar link + two toast strings (Purchase/POS) updated to match. `/manage` now has 6 tabs in order: ประวัติการขาย · ประวัติการซื้อ · ต่ำกว่าจุดสั่งซื้อ · วันหมดอายุ · สต๊อคติดลบ · ค่าใช้จ่าย.
- NewDashboard absorbed the rest of old Dashboard's content at the bottom: ทำกำไรสูงสุด (topProducts by profit), ผู้จัดจำหน่ายยอดซื้อสูงสุด (topSuppliers), สรุปลูกค้า (salesStats rollup), and the สินค้าค้างสต็อก dead-stock table (own N-month window, client-sortable). NOT carried over: hourly Traffic chart.

**Update 2026-06-26 — ยุบ 4 แท็บ stock เป็นแท็บแม่เดียว "สต็อคสินค้า" (tsc PASS; click-test pending):**

- แตะไฟล์เดียว `src/pages/Manage/index.tsx` เท่านั้น — **ไม่แตะ route ใน App.tsx** (path `/manage/dead-stock`, `/manage/low-stock`, `/manage/expiry`, `/manage/negative-stock` คงเดิมทุกตัว → Dashboard deep-link + TitleBar map ทำงานต่อ)
- โครงสร้างใหม่: `TOP_TABS` (4: sales / purchases / stock / expenses) + `STOCK_SUBTABS` (4: dead-stock / low-stock / expiry / negative-stock)
- กุญแจปลอดภัย: **ไม่แตะ `resolveTab()`/`current`** — ยังคืน 4 ค่า stock แยกตามเดิม เพื่อรักษา owner-guard granularity ของ `setSummary`/`setTabActions`; เพิ่มแค่ `resolveTopTab(current)→topTab` สำหรับไฮไลต์แท็บแม่ + `isStock` gate การ render sub strip
- TabsList สองชั้น: top `value={topTab}` / sub `value={current}`; sub strip วางนอก scroll wrapper → stock route `scrollPage=false` เสมอ
- badge `negativeStock` โชว์ 2 จุด: แท็บแม่ 'stock' + sub 'negative-stock' (เขียนทับด้วย badge เดียวกัน)
- Manage ปัจจุบันมี 4 TOP_TABS: ประวัติการขาย · ประวัติการซื้อ · สต็อคสินค้า · ค่าใช้จ่าย (6 tabs เก่า → 4 tabs ใหม่ รวม stock เข้ากลุ่ม)
- pattern เดียวกับ [[project_editbundle_tab_collapse]] (tab collapse into parent)
