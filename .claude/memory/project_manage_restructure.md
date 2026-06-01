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
