---
name: project_gr_discount_model
description: GR line-item discount/bill-adjust cost model — invariants, one-way merge-discount-into-cost, one-way surcharge, reports net-sum fix
metadata:
  type: project
---

**DONE 2026-06-20; updated 2026-06-24 (tsc PASS, Priest PASS; in-app click-test pending)**
Files: `src/pages/Purchase/index.tsx`, `src/pages/Purchase/AddProductWizard.tsx`, `src/stores/grDraftStore.ts`

## Cost field contract

`ReceiptRow.cost_price` = current unit cost (gross-before-discount, INCLUDING any committed surcharge). Never reduced by discount; raised one-way by "เพิ่มต้นทุน". Lets "ทุน/หน่วย" show the real cost and keeps row re-entry clean.

Field on `ReceiptRow`:
- `discount` — per-line discount (บาท); **only field** — `bill_discount` was REMOVED 2026-06-24.

There is **no `bill_surcharge` field** — surcharge bakes into `cost_price` (see below). There is **no `bill_discount` field** — bill-level discount is redistributed into each row's `discount` (see "ส่วนลดท้ายบิล" below).

## Per-row math invariant

```
net total = qty * cost_price − discount
cost/unit displayed = cost_price (always; becomes net after "รวมส่วนลดในต้นทุน" fold)
```

`grossSubtotal = Σ (qty * cost_price)` (before any discount)
Footer "ส่วนลด" = `Σ row.discount`

## Per-row discount (DiscountDialog)

`applyLineDiscount(i, d)` sets `rows[i].discount = d` (clear → 0 exactly). Changes only the targeted row; other rows untouched. See [[discount-dialog-shared]].

## "ส่วนลดท้ายบิล" modal — BULK redistribute (2026-06-24)

Takes a single total-discount amount and **distributes it proportionally** by `qty*cost_price` across ALL rows into `row.discount` (overwrites each row's existing discount — not reversible/separate). Rows with `qty*cost<=0` are skipped. Re-opening the modal seeds from `Σ row.discount`. Amber AlertTriangle callout warns the user it redistributes all discounts. `baseRowTotals` + `appliedDiscount` draft fields were REMOVED; `bill_discount` was REMOVED from `ReceiptRow` and `GRDraft`.

## Legacy draft migration

Drafts created before 2026-06-24 may carry old `bill_discount` per row. The rows `useState` lazy initializer folds `bill_discount` into `discount` (adds, then zeros) so they load correctly without double-subtracting.

## Surcharge = one-way merge into cost ("เพิ่มต้นทุน")

SEPARATE dialog (not the discount modal), RED "ย้อนกลับไม่ได้" warning + `destructive` confirm. `applySurcharge` distributes by cost-value weight (`qty*cost_price`), ADDS into each row's `cost_price` permanently (one-way — no undo path). **Guards weight-0 rows** so a blank cost field is never coerced to `'0'`. Surcharge is shown ONLY via the raised "ทุน/หน่วย" column. `surcharge_amount` save payload was REMOVED previously (surcharge is inside `cost_price`).

## "รวมส่วนลดในต้นทุน" — real one-way fold (was display toggle, changed 2026-06-24)

NO LONGER a display toggle. Now a one-way ACTION (`applyMergeDiscount`) behind a `warning` ConfirmDialog ("ย้อนกลับไม่ได้"): for each row with `discount>0`, sets `cost_price = total/qty` (ทุนสุทธิต่อหน่วย) and clears `discount` to `''`; `total` unchanged. Guards `qty<=0 || disc<=0` rows (blank→0 ban). Button `disabled={lineDiscountTotal<=0}`. `mergeCost` display-state + the `netCost`/`displayCost` toggle branches were REMOVED — `displayCost` is now always `cost_price` (which becomes net after fold).

**Saved item cost is unchanged by this** — `purchase:save` already uses `total/qty` (line ~624), so folding before save produces the identical inventory cost / `last_cost_price`. The real effect: the form/document `discount_amount` header drops to 0 (no separate discount line — it lives inside the cost now). See [[project_cost_model]].

## Bill-header stored amounts

`discount_amount` = `Σ row.discount` (all per-row discounts). `surcharge_amount` is not sent on save (left at column default 0).

## VAT exclusive mode

VAT exclusive mode was fully removed. Purchase save / reports / receipt now only recognise `none` / `inclusive`.

## Reports net-sum — double-count FIXED (2026-06-20, Priest PASS)

`electron/ipc/reports.ts` `PURCHASE_NET_SUB` uses `SELECT COALESCE(SUM(pri.qty*pri.cost_price),0) …` because `purchase_receipt_items.cost_price` is ALREADY net (`total/qty`, discounts baked in at save). Header `discount_amount` is a document record only — never re-subtracted from a cost sum. The single `PURCHASE_NET_SUB` definition feeds ~8 finance/dashboard aggregates. See [[project_cost_model]].
