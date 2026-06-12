---
name: project_tax_invoice_flow
description: Tax Invoice Flow Rework v2 — deferred lock, read-only buyer, hub pattern, id_card-as-tax-id
metadata:
  type: project
---

# Tax Invoice Flow Rework v2

**Status:** DONE 2026-06-12 (tsc PASS; in-app click-test pending — owner runs it).
Full plan: `docs/plans/Tax_Invoice_Flow_Rework.html` (Section B), passed 2 audit rounds.

Related: [[project_vat_phasing]], [[project_receipt_sections]], [[project_sales_documents]]

---

## Core invariants

### 1. Buyer is READ-ONLY in the print dialog

`TaxInvoiceBuyerDialog` (`src/components/dialogs/TaxInvoiceBuyerDialog.tsx`) shows
buyer fields as disabled `<Input readOnly disabled>`. There is NO customer picker and
NO free-text editing inside this dialog. Buyer resolves as:

- If a `tax_invoices` row already exists → use its snapshot values (legal record wins).
- Else → pull from the bill's linked customer passed in as the `buyer` prop.

To change the buyer: reassign the bill's customer via `reports:updateSaleCustomer`
(admin-gated via `useManagerOverride`) in `SaleDetailDialog` BEFORE issuing the invoice.
**Do NOT re-add a picker or editable fields to `TaxInvoiceBuyerDialog` — this was
deliberately removed in v2 (v1 had it and it was wrong).**

### 2. Deferred lock — a cancelled print must NOT lock the bill (P0)

`tax:issueOrGet` INSERTs with `original_printed = 0` (snapshot only). Its UPDATE
branch does NOT touch `original_printed`. The flag is set to 1 only by
`tax:confirmOriginalPrinted`, which is called from the renderer **only inside
`if (res.success && !copy)`** — meaning:

- Failed print → `confirmOriginalPrinted` never called → bill stays unlocked.
- Cancelled window → same.
- Second print of an already-locked bill → `copy = true` → skips `confirmOriginalPrinted`.

`copy` is determined at `issueOrGet` time: `!!existing && existing.original_printed === 1`.

### 3. Lock definition and enforcement (2 layers)

`locked = detail.tax_original_printed === 1` (joined from `tax_invoices` in
`reports:getSaleByInvoice`).

- **Backend:** `reports:voidSale` and `reports:updateSaleCustomer` both throw when
  `tax_invoices.original_printed = 1`.
- **UI:** `SaleDetailDialog` hides "แก้ไขรายชื่อลูกค้า" and disables "ยกเลิกบิล"
  (with explanation text) when `locked`. Button label flips to "พิมพ์สำเนาใบกำกับ".

Locked bills: only พิมพ์สำเนา (สำเนา stamp), พิมพ์ใบเสร็จ, and ดูรายละเอียด.

**Migration caveat:** any `tax_invoices` rows that existed before this deploy already
have `original_printed = 1`, so they lock immediately on first run — this is intended;
there is no unlock path.

### 4. `id_card` doubles as เลขประจำตัวผู้เสียภาษี

Pharmacy stores every member as a person — the 13-digit national ID is the same as
the tax ID. There is **no separate `customers.tax_id` column**. `customers.branch`
was added in this rework (สาขา for tax invoices, e.g. "สำนักงานใหญ่").

`CustomerFormDialog` label = "เลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี" plus a สาขา
field. Do NOT add a separate tax_id column — that would duplicate data and break the
single-source rule.

---

## Hub pattern — SaleDetailDialog owns all tax/edit-customer actions

`SaleDetailDialog` (`src/components/dialogs/SaleDetailDialog.tsx`) is the single hub:

- Houses `TaxInvoiceBuyerDialog` (nested, controlled by `taxOpen`).
- Houses `CustomerSearchDialog` (for reassignment, controlled by `reassignOpen`).
- Shows VAT breakdown (`มูลค่าก่อนภาษี / ภาษีมูลค่าเพิ่ม / รวมสุทธิ`) when
  `detail.total_vat > 0`.
- `taxEligible` gate: `vatEnabled && total_vat > 0 && status !== 'voided' && sale_type !== 'return'`.

Manage/Sales table kebab was reduced to: ดูรายละเอียด / พิมพ์ใบเสร็จ / ยกเลิกบิล.
VatReport row clicks also open `SaleDetailDialog`.

**Reassign flow** (for unlocked bills): `CustomerSearchDialog` → `ov.run(updateSaleCustomer)`
— admin manager-override required; `showWalkIn={false}` (walk-in has no tax info).
Reassigning retroactively moves the bill in customer-segmented reports.

---

## IPC surface

| Handler | What it does |
|---|---|
| `tax:get(saleId)` | Returns the `tax_invoices` row or null |
| `tax:issueOrGet(payload)` | Upserts buyer snapshot; returns `{record, copy}` |
| `tax:confirmOriginalPrinted(saleId)` | Sets `original_printed=1` idempotently (WHERE original_printed=0) |
| `reports:updateSaleCustomer({sale_id, customer_id}, override?)` | Reassigns customer; rejects if locked |

Preview uses a transient in-memory `TaxInvoice` object — does NOT call `issueOrGet`,
does NOT advance the lock state.
