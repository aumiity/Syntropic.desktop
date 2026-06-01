---
name: project_next_systems_backlog
description: "Next major systems to build in Syntropic Desktop (operator's backlog as of 2026-05-30)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4074acda-bd2d-4089-9f47-36946c51306b
---

Operator's stated backlog of next systems to build (noted 2026-05-30, before sleep — "เหลืองานอีกหลายระบบ"). NOT started, priority order NOT fixed. Ask which to tackle when resuming.

- **ระบบ VAT** — proper VAT calc/display/reporting. Schema groundwork exists but unused: `sales.total_vat`, `sale_items.unit_vat`, `products.has_vat`.
- **พิมพ์สลิป/บิลการขาย** — receipt printing, two forms: full ใบกำกับภาษี (tax invoice) + short สลิปเงินสด (cash slip). Printer infra partial (`window.api.printer.*`).
- **ฉลากยา UX/UI** — still unsatisfactory after the LabelSettingsTab redesign; collect specifics before reworking.
- **ระบบ Finance** — record OTHER shop expenses beyond drug purchases (rent/utilities/etc.); `/reports/finance` is aggregates only, this is expense entry/bookkeeping.
- **ระบบออกใบเสนอราคา** — quotation generation/printing.
- **Dashboard rebuild** — `/reports/dashboard` works but operator not satisfied with UX/design (PARKED). Collect what's off first.

Full detail lives in PROGRESS.md `📋 BACKLOG 2026-05-30` block. Related: [[project_pos_qty_multiplier]] just shipped same day.
