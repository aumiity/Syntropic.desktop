---
name: project_gr_discount_model
description: GR line-item discount/bill-adjust cost model — invariants, display toggle, one-way surcharge, reports net-sum fix
metadata:
  type: project
---

**DONE 2026-06-20 (tsc PASS, Priest PASS ×3; in-app click-test pending)**
Files: `src/pages/Purchase/index.tsx`, `src/pages/Purchase/AddProductWizard.tsx`, `src/stores/grDraftStore.ts`

## Cost field contract

`ReceiptRow.cost_price` = current unit cost (gross-before-discount, INCLUDING any committed surcharge). Never reduced by discount; raised one-way by "เพิ่มต้นทุน". Lets "ทุน/หน่วย" show the real cost and keeps row re-entry clean.

Fields on `ReceiptRow`:
- `discount` — per-line product discount (wizard)
- `bill_discount` — distributed share of bill-level discount (reversible)

Kept SEPARATE so the discount-cell tooltip breaks down: ส่วนลดสินค้า / ส่วนลดท้ายบิล.
There is **no `bill_surcharge` field** — surcharge bakes into `cost_price` (see below).

## Per-row math invariant

```
net total = qty * cost_price − discount − bill_discount
gross cost displayed = cost_price (toggle off) | total/qty (toggle on, net)
cost_price * qty − (discount + bill_discount) = net total
```

`grossSubtotal = totalCost + lineDiscountTotal`

## Surcharge = one-way merge into cost ("เพิ่มต้นทุน")

SEPARATE dialog (not the discount modal), RED "ย้อนกลับไม่ได้" warning + `destructive` confirm. `applySurcharge` distributes by cost-value weight (`qty*cost_price`), ADDS into each row's `cost_price` permanently (one-way — no undo path), and BUMPS `baseRowTotals` by each row's share so an active discount's bounce-back keeps the surcharge. **Guards weight-0 rows** so a blank cost field is never coerced to `'0'`. Surcharge is shown ONLY via the raised "ทุน/หน่วย" column — **NO footer/bill-bottom line, and NOT tracked as a separate amount anywhere** (user: once merged into the per-unit cost it's indistinguishable from manually typing a higher cost, so there is nothing to keep). `committedSurcharge` state + draft field + `surcharge_amount` save payload were all REMOVED. The old "ปรับยอดท้ายบิล" modal is now DISCOUNT-ONLY (renamed "ส่วนลดท้ายบิล").

## `mergeCost` display toggle

`mergeCost` ("รวมส่วนลดในต้นทุน") is DISPLAY-ONLY — flips cost column to net (`total/qty`) and blanks the discount cell. **Saved values are identical regardless of toggle.** Saved item cost is always net (`total/qty`), so inventory cost and `last_cost_price` are unaffected. See [[project_cost_model]].

## Bill-header stored amounts

`discount_amount` = Σ row-derived `bill_discount` (consistent with rows after edits). `surcharge_amount` is NO LONGER sent on save (left at the column default 0) — surcharge lives entirely inside each row's `cost_price`, so there is no separate figure to store.

## Reversibility rule

`baseRowTotals` snapshots per-row totals before bill adjustment; setting bill discount to 0 and re-applying restores original cost — **only if no row was edited in between**. Editing a row CLEARS its `bill_discount` and recomputes `total = qty * cost − discount` (fresh re-entry), which also nulls `baseRowTotals`. (Surcharge stays — it's already inside `cost_price`.) This "แบบเดิม" behavior is accepted.

## Dead state removed

`adjustSubtotal` / `adjustDiscountAmt` / `adjustSurchargeAmt` became write-only after the footer went row-derived — deleted from `index.tsx` + `grDraftStore`.

## VAT exclusive mode

VAT exclusive mode was fully removed in the same session. Purchase save / reports / receipt now only recognise `none` / `inclusive`.

## Reports net-sum — double-count FIXED (2026-06-20, Priest PASS)

`electron/ipc/reports.ts` `PURCHASE_NET_SUB` used to do `SUM(qty*cost_price) − discount_amount + surcharge_amount`, but `purchase_receipt_items.cost_price` is ALREADY net (`total/qty`, discounts baked in at save) → double-counted on bill-adjusted GRs. Fixed: now just `SELECT COALESCE(SUM(pri.qty*pri.cost_price),0) …`. The header `discount_amount`/`surcharge_amount` are document records only — never re-subtract them from a cost sum. Verified: all writers store net; backfill/seed headers carry `discount_amount=0` so the old terms were harmless there; cost is VAT-inclusive (money-owed figure) while `product_lots` is ex-VAT. The single `PURCHASE_NET_SUB` definition feeds ~8 finance/dashboard aggregates. See [[project_cost_model]] for the three-cost model context.
