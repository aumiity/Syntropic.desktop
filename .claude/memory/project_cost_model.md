---
name: project-cost-model
description: The 3-cost model for products (weighted-avg vs last-paid vs FEFO-lot) and which is used where
metadata: 
  node_type: memory
  type: project
  originSessionId: b4cc2d38-af7d-42f7-bfc8-ed9fd70cf4f7
---

Syntropic uses three distinct product costs, each with one purpose — do not conflate them:

- **`products.cost_price`** = weighted avg of open lots. Auto-managed by every stock flow (receive recompute, lot-edit, adjust, GR-cancel). **Never hand-edited.** Drives inventory valuation + report/COGS profit.
- **`products.last_cost_price`** (column added 2026-05-17) = last cost actually PAID. Free goods (cost 0) do NOT overwrite it — it self-tracks "last non-zero paid". Pricing reference only (set sell price off replacement cost so a cost rise doesn't underprice).
- **FEFO front-lot cost** = cost of the specific lot about to be dispensed. Used for the true margin of *this* sale.

Usage map: Reports/POS-payment → `cost_price` (avg) or FEFO actual lot cost. EditProduct cost field + Purchase price modal "ทุนเก่า" → `last_cost_price` (editable in EditProduct, writes last_cost_price only, never clobbers avg). POS price modal margin → FEFO front lot cost.

**Why:** purchase.ts used to overwrite cost_price with last-in cost (jumpy display); pricing off the avg underprices when cost rises; profit reports must use real/avg cost per IAS 2.

**How to apply:** any cost figure on screen → ask "valuation/report?" → avg; "pricing decision?" → last_cost_price; "this sale's margin?" → FEFO lot. Never put a hand-edited value into cost_price.

Open follow-up: GR-cancel / `products:updateLot` recompute the avg but do NOT refresh `last_cost_price` (can go stale). Reports page cost audit still pending. See PROGRESS.md Session 2026-05-16→17.
