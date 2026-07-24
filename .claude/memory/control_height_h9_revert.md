---
name: control-height-h9-revert
description: 2026-07-24 field/input primitives = h-8; Button keeps its ladder (default h-8 / lg h-9 / xl h-10) — do NOT touch Button
metadata:
  type: project
---

**2026-07-24 — the FIELD / input primitives are `h-8`** (operator found `h-9` fields too big/clunky — "ดูใหญ่เกิน เทอะทะ"). These are now `h-8`:

- `input.tsx` — Input / SearchInput (SearchInput wraps Input)
- `select.tsx` — SelectTrigger + NativeSelect
- `date-input.tsx`
- `date-range-picker.tsx`
- `combobox.tsx`
- `status-filter.tsx` — the filter icon button = `h-8 w-8` (a bar control, matches the fields beside it)

**Button is NOT in this set — it keeps its own size ladder, UNCHANGED: `default` = `h-8`, `lg` = `h-9`, `xl` = `h-10`.** `lg` staying `h-9` is correct — it is the deliberate one-notch-bigger button. Do NOT collapse `lg`→`h-8` (I made that mistake once and the operator caught it — "button lg h-9 ก็ถูกแล้วดิ" — reverted same day).

`switch.tsx` `framed="input"` was already `h-8`; standard `framed` pill = `h-12` (full-bar pill, not a control-inside height). `textarea.tsx` = multi-line (`min-h`), untouched. radius unchanged (`md` base).

**History (why the confusing filename):** the FIELD primitives went `h-9 → h-8` (experiment) earlier in the 2026-07 redesign; on 2026-07-24 morning the operator briefly reverted them to `h-9`; then — same day — reversed that and returned to `h-8`. So do NOT flip the FIELD primitives back to `h-9`. (Button was never part of this churn.)

Related: [[table-card-bar-heights-locked]].
