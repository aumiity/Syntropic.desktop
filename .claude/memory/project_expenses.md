---
name: project-expenses
description: ค่าใช้จ่าย (shop expenses/bookkeeping) system — new tab in /reports, expense_categories + expenses tables, running code EX-YYYYMMDD-NNNN, Finance KPI integration
metadata:
  type: project
---

## Status
**DONE 2026-06-03** — code complete, tsc clean both configs, Priest PASS. NOT operator click-tested yet.

## Placement
New TAB in `/reports` ("ค่าใช้จ่าย", route `/reports/expenses`, between ซื้อ and รายงาน อย.). Hybrid report+entry page, NOT a top-level nav item and NOT under /manage. Decided with operator.

## Data model

### `expense_categories` (lookup table)
- Columns: `id`, `name`, `sort_order`, `is_active` (unlike `product_categories`, NO `code` column; uses `is_active` not `is_disabled`)
- Seeded 9 categories (via `COUNT===0` guard in `seed.ts` — won't resurrect deleted ones):
  - ค่าเช่า / ค่าน้ำ / ค่าไฟ / เงินเดือน-ค่าแรง / ค่าการตลาด / ค่าขนส่ง / ค่าอุปกรณ์ / ภาษี-ค่าธรรมเนียม / อื่นๆ

### `expenses` (transaction table)
- Columns: `id`, `expense_date`, `category_id`, `amount`, `payment_method`, `vendor`, `reference_no`, `note`, `created_at`, `updated_at`
- Running code format: **`EX-YYYYMMDD-NNNN`** via MAX-suffix + retry-on-UNIQUE-collision pattern (SUBSTR offset 13), same as Quotation numbering

## Key files
- `electron/ipc/expenses.ts` — IPC handlers: `list`, `summary`, `save`, `delete` (hard delete + confirm Dialog), category CRUD (admin-only)
- `src/pages/Reports/Expenses.tsx` — main entry tab (read-only staffside, admin can add/edit/delete)
- `src/components/dialogs/ExpenseFormDialog.tsx` — form dialog for add/edit
- `src/pages/Settings/ExpenseCategoriesTab.tsx` — new Settings tab for managing lookup table
- `electron/db/schema.ts`, `seed.ts`, `electron/ipc/main.ts`, `electron/preload.ts`, `src/types/index.ts`, `src/pages/Reports/index.tsx`, `src/pages/Settings/index.tsx` — supporting edits

## Finance integration
- `computeFinanceWindow` in `electron/ipc/reports.ts` now sums `expense_total` over `expense_date` within the reporting window
- Flows into BOTH current AND previous window (PoP comparison)
- `Reports/Finance.tsx` gained 2 new KPI cards → now 6 total:
  - **ค่าใช้จ่าย** (warm badge)
  - **กำไรสุทธิ** (= `sales_profit − expense_total`; success-soft if positive, destructive-soft if negative)
- "กำไร" on the overview report is now **net profit** (after expenses), not gross

## Access control & role gates
- Add/edit/delete: **admin-only** (`isOwner`)
- Staff: read-only access + 7-day range clamp (mirrors Finance role gate)

## UX decisions
- **Delete = hard delete** + confirm Dialog (bookkeeping transaction, not a legal document — no soft void/cancel)
- **Amount field:** uses bare `Input type="number"`, NOT `PriceInput` (PriceInput silently coerces blank→0, breaks the [[Input never blank coercion]] invariant)

## Future hook
This `expenses` table is the natural home for **purchase-side VAT (ภาษีซื้อ / ภ.พ.30)** later. v1 stores a flat `amount`; can add `vat_amount` / `has_vat` columns in Phase 2. See [[project_vat_phasing]].

## Related
- [[project_next_systems_backlog]] — this feature was the "Finance (expense entry)" NEXT candidate
- [[project_sales_documents]] — context for why document work (quotation/invoice) is offloaded to FlowAccount; expenses stay in-app
- [[project_vat_phasing]] — purchase-side VAT planning
