# Audit: First-Run Setup Wizard Plan (Phase 1)

**Auditor:** Gemini CLI
**Date:** วันอาทิตย์ที่ 31 พฤษภาคม 2569
**Overall Verdict:** ✅ PASS

---

## 🔍 Audit Checklist Summary

| Section | Check | Status | Notes |
|---|---|---|---|
| **1** | Data Model | **PASS** | `settings` table additions and migration pattern are consistent with project standards. |
| **2** | Fresh Seed | **PASS** | Emptying default shop name in `seed.ts` correctly triggers mandatory input. |
| **3** | Backend IPC | **PASS** | `settings:completeSetup` ensures atomic updates to shop and VAT settings. |
| **4** | Renderer Gate | **PASS** | `App.tsx` implementation is idiomatic and integrates well with existing user hydration. |
| **5** | Wizard UI | **PASS** | Step logic, validation (Tax ID), and component reuse align with `CLAUDE.md`. |

---

## 🛠️ Detailed Findings

### 🔴 Critical (Must Fix)
*None.*

### 🟡 Minor (Improvements/Deviations)

#### 1. Migration Order
- **Observation:** In `electron/db/index.ts`, `initializeSchema(db)` is called before `seedDatabase(db)`. 
- **Verification:** The plan's backfill `UPDATE settings ... WHERE ... EXISTS sales` runs inside `initializeSchema`. On a fresh install, the `settings` table will be empty (since seed hasn't run), so 0 rows are updated. After seed runs, `setup_completed` will be the default (0). This works perfectly.
- **Note:** Ensure the `setup_completed` ALTER comes before the `UPDATE` in the migration array.

#### 2. VAT Registration Date
- **Observation:** The plan stores `vat_registered_date` in `settings`.
- **Note:** Since `vat_enabled` and `vat_rate` are in `sales_settings`, verify if `vat_registered_date` should also move there for consistency. However, keeping it in `settings` (Shop Identity) is also acceptable as it's a registration detail.

### 🟢 Suggestions

#### 1. Tax ID Re-validation
- **Suggestion:** Use the same regex `/^\d{13}$/` and `replace(/\D/g, '')` logic as seen in `TaxInvoiceBuyerDialog.tsx` to maintain UI consistency.

#### 2. PageLoader Consistency
- **Suggestion:** `App.tsx` already has a `PageLoader` component. Ensure the Wizard uses a similar or reused loading state if needed during the final "Start" transition.

---

## 🧐 Surprises & Observations
- **`EXISTS (SELECT 1 FROM sales LIMIT 1)`:** This is an excellent heuristic for detecting "live" installations without relying on timestamps which might be unreliable in local dev environments.
- **Atomicity:** The decision to use a single IPC handler `completeSetup` for a multi-table update is a strong architectural choice.

---

## 🏁 Conclusion
The plan is robust, technically accurate, and respects all project-wide invariants (including the walk-in customer C0000 rule and VAT-inclusive calculation logic). The migration strategy safely handles existing databases while providing a seamless onboarding experience for new users.

**Recommendation:** Proceed to implementation.
