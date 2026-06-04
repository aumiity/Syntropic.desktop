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
