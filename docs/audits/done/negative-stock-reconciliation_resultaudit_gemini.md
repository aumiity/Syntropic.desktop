# Audit Result: Negative-Stock Reconciliation

**Auditor:** Gemini CLI
**Date:** Thursday, May 21, 2026
**Status:** Approved with Suggestions

---

## 🔍 Technical Findings & Logic Verification

### 1. `deductFefo` and Oversell Marker
- **Confirmation:** Verified in `electron/ipc/pos.ts:49-54`. The system correctly records unfulfilled quantities as a `sale_item_lots` row with `lot_id = NULL`.
- **Logic:** The reconciliation plan correctly targets these NULL markers (`lot_id IS NULL AND is_cancelled = 0`).

### 2. Reconciliation Traceability
- **Confirmation:** The plan correctly inserts new `sale_item_lots` rows with real `lot_id` and records `stock_movements` with a specific note (`ตัดสต๊อคย้อนหลัง: <invoice_no>`).
- **Edge Case Check:** If a `sale_item` was partially fulfilled and partially oversold, the reconciliation will result in multiple rows for the same `sale_item_id` and potentially the same `lot_id`.
  - **Verification:** `reports:getSaleByInvoice` (in `electron/ipc/reports.ts:121-133`) fetches all `sale_item_lots` for a `sale_item`. Multiple rows for the same lot will simply appear as separate "take" events in the detail view, which is acceptable and provides better auditability than updating existing rows.

### 3. Cost Propagation
- **Confirmation:** The plan includes calls to `recomputeAvgCost` and `propagateCostToBundles` after reconciliation.
- **Importance:** This is critical because deducting stock from a lot can trigger its closure (`is_closed=1`), which changes the weighted-average cost pool for the product and its dependent bundles.

### 4. Database Schema
- **Verification:** `sale_item_lots` table in `electron/db/schema.ts:278-285` has `lot_id` as nullable and includes `is_cancelled`.
- **Verification:** `sales_settings` table exists with correct defaults (verified in `schema.ts:429-437`).

---

## ✅ Final Assessment
The implementation plan is technically sound, respects the project's architectural invariants (especially regarding FEFO and Bundles), and addresses a significant UX gap for inventory management.

### 🟡 Minor Suggestions
1. **Sidebar Badge Visibility:** Ensure the badge on the "จัดการ" (Manage) sidebar item remains visible or indicated via Tooltip even when the sidebar is collapsed. The current `Sidebar.tsx` implementation for Tooltips should be extended to support badges.
2. **Reconcile Movement Type:** While `movement_type='sale'` is technically correct (it completes a sale event), consider if `negative_reconcile` or a similar type would be better for filtering. However, keeping it as `sale` with a clear note is consistent with the current ledger structure.
3. **Toast Duration:** 8000ms is a bit long. 5000ms is usually the sweet spot for informational toasts that don't require immediate action.

### 🟢 Code Quality / Future-proofing
- The plan correctly uses `db.transaction` for both `reconcile` and `dismiss` operations, ensuring data integrity across `product_lots`, `sale_item_lots`, and `stock_movements`.
- The use of `affectedIds` in `purchase:save` is an efficient way to trigger negative stock checks.

**Recommendation:** Proceed to implementation. The plan is ready for coding.
