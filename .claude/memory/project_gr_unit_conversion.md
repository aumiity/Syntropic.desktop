---
name: project_gr_unit_conversion
description: GR receive converts entered unit (กล่อง/โหล) to BASE unit server-side at purchase:save; ledger keeps entered unit for document fidelity
metadata:
  type: project
---

**DONE 2026-06-20 (tsc PASS; in-app click-test pending — 7 checks in `docs/plans/GR_Unit_Conversion.html` Section B)**

## Core invariant: money total is invariant

```
qpb      = item.qty_per_base (fallback 1, never 0)
qtyBase  = item.qty  × qpb
costBaseEx = costEx ÷ qpb        // costEx already strips VAT via costFactor
```

`qtyBase × costBaseEx == item.qty × costEx` — the money total is unchanged, so `PURCHASE_NET_SUB` and all finance/dashboard aggregates are unaffected. See [[project_gr_discount_model]].

## What lives where

| Table / field | Value stored |
|---|---|
| `purchase_receipt_items.qty` | Entered qty (document fidelity) |
| `purchase_receipt_items.cost_price` | Entered cost incl-VAT (document fidelity) |
| `purchase_receipt_items.unit_name` | Entered unit name |
| `purchase_receipt_items.qty_per_base` | Conversion factor (default 1) |
| `product_lots.qty_received / qty_on_hand / cost_price` | BASE ex-VAT |
| `stock_movements.qty_change / unit_cost` | BASE ex-VAT |
| `products.last_cost_price` | BASE ex-VAT (written as `costBaseEx`) |

The ledger row faithfully mirrors the supplier invoice; inventory rows are always in base units.

## Schema — THREE places that must stay in sync

`purchase_receipt_items` gained `unit_name TEXT` and `qty_per_base REAL NOT NULL DEFAULT 1`. Declared in:

1. `electron/db/schema.ts` — `CREATE TABLE` block
2. `electron/db/schema.ts` — `ALTER TABLE` list (for existing DBs)
3. `electron/ipc/purchase.ts:11-49` migration block — its own inline `CREATE TABLE` + `ALTER TABLE` array (runs every startup; guarded by try/catch)

If you add a column to this table, touch all three or the column will be missing on some machines.

## purchase:cancel — reads stored qty_per_base

Cancel reverses in BASE units using the stored ledger values:

```ts
const qpb = line.qty_per_base > 0 ? line.qty_per_base : 1
const baseQty = line.qty * qpb
// stock_movements.unit_cost:
(line.cost_price * costFactor) / qpb
```

`costFactor` is recomputed from the header `vat_mode`/`vat_rate` (not from the line). This also fixed a pre-existing latent bug: before this feature, cancel logged the entered incl-VAT cost as `unit_cost` instead of the ex-VAT base cost. Old GRs (qty_per_base=1) are unaffected.

## Old GRs: backward-compatible

Rows inserted before this feature have `qty_per_base DEFAULT 1` and `unit_name NULL`. The fallback `qpb=1` means conversion is identity — they behave as if entered in base units (which they were). No backfill needed. `getReceipt` uses `COALESCE(pri.unit_name, iu.name)` for display; `khorYor9` uses `COALESCE(pri.unit_name, u.name, '')`.

## Wizard renderer — no conversion, only default cost

`AddProductWizard.tsx` sends entered qty/cost + `unit_name` + `qty_per_base` to backend.  
`pickProduct` / `selectUnit` default the cost field to `last_cost_price × qty_per_base` (the per-unit cost for the chosen receiving unit), with the blank→0 guard:

```ts
const costDefault = lastCost != null && lastCost > 0
  ? (lastCost * chosen.qty_per_base).toFixed(2)
  : ''   // free/never-bought: field stays blank — never ?? 0
```

The renderer does NOT convert qty or cost; all conversion happens exclusively in `purchase:save`. See [[project_purchase_wizard]] for wizard architecture.

## ข.ย.10/11 — qty_received is now base (intended)

`product_lots.qty_received` stores base qty as of this feature. ข.ย.10/11 reports read `pl.qty_received` — this is correct and intentional (the register counts base dispensing units). See [[project_kho10_kho11]].
