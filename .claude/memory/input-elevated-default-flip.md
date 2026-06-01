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

Card/Table missing-border slips are a *separate* root cause — border lives on composite cards (`SectionCard`/`MetricCard`/`StatCard`) and on the wrapper `<div className="border ...">` around `<Table>`, not on the `Card`/`Table` primitives. Not addressed by this flip.

Docs updated in the same change: CLAUDE.md ELEVATED invariant + `docs/claude/ui-theming.md` ELEVATED section + `/theme` showcase (Input/Textarea/Select demos now show default=elevated and a `filled` row). Relates to [[dialog-button-convention]].
