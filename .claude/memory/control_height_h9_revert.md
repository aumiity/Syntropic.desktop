---
name: control-height-h9-revert
description: 2026-07-24 operator reverted core control primitives h-8→h-9; do not auto-flip back
metadata:
  type: project
---

**2026-07-24** — Operator explicitly reverted the core control primitives back to **`h-9`** (the old "ตามเดิม" height) by request, undoing the h-9→h-8 experiment for these specific primitives:

- `button.tsx` — `size="default"` and `size="lg"` = h-9
- `input.tsx` — Input / SearchInput = h-9
- `select.tsx` — SelectTrigger + NativeSelect = h-9
- `date-input.tsx` = h-9
- `date-range-picker.tsx` = h-9 (also `rounded-lg`→`rounded-md`)
- `combobox.tsx` = h-9 (also `rounded-lg`→`rounded-md`)
- `status-filter.tsx` = h-9 w-9

radius `md` is already the base default on Button + all field primitives — nothing changed there except the two stray `rounded-lg` overrides above. `/theme` showcase demos + prose synced to h-9.

**Do NOT auto-revert these back to h-8.** This overrides the still-paused h-9→h-8 note in CLAUDE.md and [[feedback_read_doc_before_ui_edit]] — the operator chose h-9 for these primitives.

**Still open (operator will do page-by-page while redesigning — don't sweep proactively):** ~33 app call sites hardcode `className="h-8"` (mostly filter-strip icon buttons `h-8 w-8 p-0` in list tables, plus POS dense cart, Dashboard mini-controls, CSS dev tool). These pin h-8 so they won't inherit the new h-9 base; they stay shorter than form fields until the operator retunes each page. POS/CSS h-8 are likely intentional (dense/dev contexts).
