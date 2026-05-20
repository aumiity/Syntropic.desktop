# Audit Result: รายงาน ขย.9 (บัญชีการซื้อยา)

**Auditor:** Gemini CLI
**Date:** Wednesday, May 20, 2026
**Status:** Approved with Corrections

---

## 🔍 Technical Findings & Corrections

### 1. Database Schema Join Correction
- **Original Plan:** `JOIN purchase_receipts pr ON pr.id = pri.receipt_id`
- **Finding:** In `electron/db/schema.ts`, the `purchase_receipt_items` table uses `invoice_no` as the link to `purchase_receipts`. There is no `receipt_id` column.
- **Correction:** The query must use:
  ```sql
  JOIN purchase_receipts pr ON pr.invoice_no = pri.invoice_no
  ```

### 2. File Path Correction
- **Original Plan:** `src/pages/Reports/Fda.tsx`
- **Finding:** The actual file in the codebase is `src/pages/Reports/FdaReports.tsx`.

### 3. IPC Handler Location
- **Original Plan:** "Create `electron/ipc/reports.ts` if absent."
- **Finding:** The file `electron/ipc/reports.ts` already exists and handles other report-related IPCs (e.g., `salesList`, `financeSummary`).
- **Correction:** Append the `reports:khorYor9` handler to the existing `electron/ipc/reports.ts` instead of creating a new file.

### 4. Shop Settings Data Source
- **Original Plan:** `shop_settings.shop_name`
- **Finding:** Shop settings should be retrieved via the existing `settings:getShop` IPC call, which returns an object containing the `shop_name`.

---

## ✅ Final Assessment
The implementation plan is technically sound and follows the project's architectural conventions. Once the above corrections are applied, the implementation will be consistent with the existing codebase and database schema.

**Recommendation:** Proceed to implementation using the corrected SQL and file paths.
