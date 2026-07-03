---
name: input-elevated-default-flip
description: Input/Textarea/SelectTrigger now default to ELEVATED; flat look is opt-in variant="filled"; don't hand-add variant="elevated"
metadata:
  type: project
---

**DONE 2026-06-01.** Flipped the default surface treatment for the three input primitives so the house ELEVATED look is what you get for free.

`src/components/ui/input.tsx`, `textarea.tsx`, `select.tsx` (SelectTrigger):
- The `default` variant code now renders the elevated styling (`bg-card` + `border border-border` + `shadow-sm`; SelectTrigger drops `bg-muted`).
- Added a new `variant="filled"` = the OLD flat look (`bg-input`, or `bg-muted` for SelectTrigger).
- `variant="elevated"` is kept as an identical alias so the ~existing `variant="elevated"` call sites still compile and look right.

**Why this migration shape (the user's idea):** non-breaking. A grep showed *zero* call sites hardcode `variant="default"` on these three — every bare input just omits the variant. So flipping `default`→elevated only upgrades the omit-variant sites (the suspected leaks) and touches nothing explicit. We kept the `"default"` token (didn't delete it) precisely so nothing breaks; downside is `default`/`elevated` are now duplicate styles (acceptable).

**How to apply going forward:**
- Write a bare `<Input>` / `<Textarea>` / `<SelectTrigger>` — it's elevated automatically. Do NOT keep adding `variant="elevated"` (redundant now).
- Need the flat/recessed look (dense inline-edit cells, deliberate inset field)? Opt in with `variant="filled"`.
- Button was NOT touched — its `default` is still the primary teal CTA. Only inputs/surfaces flipped.
- Visual-review pass still pending: omit-variant fields that were *intentionally* flat now read elevated; fix on sight by adding `variant="filled"`.

**NativeSelect joined the standard 2026-07-03.** `NativeSelect` in `select.tsx` was the last flat holdout (`bg-input`, `rounded-xl`, `focus:ring-[2px]`). Gave it the same `variant?: 'elevated' | 'filled'` prop, default `'elevated'` (`bg-card` + `border` + `shadow-sm` + `rounded-control` + `focus-visible:border-ring ring-3 ring-ring/50`, mirroring SelectTrigger). Both call sites — `PermissionsTab.tsx` (role matrix dropdowns) + `manager-override-dialog.tsx` (ผู้อนุมัติ, now matches the elevated password Input beside it) — upgraded for free. `variant="filled"` = old recessed look, opt-in. NativeSelect is NOT in `/theme` showcase (neither are the charts) so no demo to update.

Card/Table missing-border slips are a *separate* root cause — border lives on composite cards (`SectionCard`/`MetricCard`/`StatCard`) and on the wrapper `<div className="border ...">` around `<Table>`, not on the `Card`/`Table` primitives. Not addressed by this flip.

Docs updated in the same change: CLAUDE.md ELEVATED invariant + `docs/claude/ui-theming.md` ELEVATED section + `/theme` showcase (Input/Textarea/Select demos now show default=elevated and a `filled` row). Relates to [[dialog-button-convention]].
