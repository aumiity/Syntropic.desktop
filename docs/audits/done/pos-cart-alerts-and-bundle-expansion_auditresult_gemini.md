# Audit Result: POS Cart — Expiry/Stock Alerts + Bundle Expansion

**Auditor:** Gemini CLI
**Date:** Thursday, May 21, 2026
**Status:** Approved with Corrections

---

## 🔍 Technical Findings & Corrections

### 1. Stock Alert Logic — Unit Conversion Missing
- **🔴 Severity: Critical**
- **Location:** `src/pages/POS/cartAlerts.ts` (proposed)
- **Finding:** The plan's logic for `low_stock` alert (`cart_qty > sum(qty_on_hand of open lots)`) fails for products sold in non-base units. If a user sells 1 "Pack" (10 units) but only 5 units are in stock, `1 > 5` is false, and no alert triggers.
- **Correction:** The comparison must multiply `item.qty` by its unit conversion factor:
  ```ts
  const soldBaseQty = item.qty * (item.selectedUnit?.qty_per_base ?? 1)
  const isLowStock = soldBaseQty > sum(lots.map(l => l.qty_on_hand))
  ```

### 2. Expanded State Instability
- **🟡 Severity: Minor**
- **Location:** `src/pages/POS/index.tsx`
- **Finding:** Keying `expandedBundles` by `idx` (array index) is unstable. If an item is removed from the cart, the indices of subsequent items shift. An item that was expanded might "pass" its expanded state to the next item in the list.
- **Correction:** Since `CartItem` currently lacks a unique ID, continue using `idx` but consider clearing or adjusting the `Set` when `removeItem` is called, or ideally, add a temporary `uid` to `CartItem` in `cartStore.ts`.

### 3. Settings Tab — Inconsistent Naming Template
- **🟡 Severity: Minor**
- **Location:** `src/pages/Settings/SalesTab.tsx` (proposed)
- **Finding:** The plan suggests mirroring the `LabelSettingsTab.tsx` skeleton. However, `LabelSettingsTab.tsx` has inconsistent naming: UI state uses `paper_width`/`padding_top` while DB columns are `width_mm`/`pad_top`. Copying this verbatim might lead to broken saves if the `saveSalesSettings` IPC uses the same dynamic `Object.keys` UPDATE pattern.
- **Correction:** Ensure the `form` state keys in `SalesTab.tsx` exactly match the column names defined in the `sales_settings` table in `schema.ts`.

### 4. UI Consistency — Toggle vs Switch
- **🟢 Severity: Suggestion**
- **Location:** `src/pages/Settings/SalesTab.tsx`
- **Finding:** The plan mentions using `<Switch>` rows. To match the existing "Settings" look (e.g., `LabelSettingsTab`), the `<Toggle>` component from `@/components/ui/switch` should be used instead, as it provides the standard framed-row-with-label pattern.

### 5. Expiry Comparison Precision
- **🟢 Severity: Suggestion**
- **Location:** `src/pages/POS/cartAlerts.ts`
- **Finding:** The comparison `expiry_date < today` might flag items as expired on their final day of validity depending on how `today` (current time) is compared to the date string (start of day).
- **Correction:** Use Dayjs for a stable "before today" check: `dayjs(expiry_date).isBefore(today, 'day')`.

---

## ✅ Final Assessment
The plan is well-aligned with the project's architecture and leverages existing data structures (e.g., `prod.bundle_items` and `prod.lots` already returned by `pos:searchProducts`). Once the unit conversion logic and naming consistency are addressed, it will provide a robust warning system for cashiers.

**Recommendation:** Proceed to implementation with the corrected stock logic and naming.
