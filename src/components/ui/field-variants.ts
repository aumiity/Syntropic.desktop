// Shared surface contract for the field primitives: Input / SearchInput /
// Textarea / SelectTrigger / NativeSelect. One set of names, one set of classes
// — the four variants are a pure shape x shadow matrix on the house ELEVATED
// surface (bg-card + border). There is no flat bg-input variant any more:
// "filled" was removed 2026-07-17 (it had a single real call site).
//
//   default   rounded-sm   + shadow-sm     <- house look, a bare <Input> gets this
//   flat      rounded-sm   + shadow-none
//   pill      rounded-full + shadow-sm
//   pill-flat rounded-full + shadow-none
//
// "elevated" stays as an alias of "default" for the existing call sites.
//
// The square radius is `rounded-sm` (0.125rem) by explicit operator decision
// 2026-07-17 — NOT the `--radius-control` token (0.5rem) the radius rule points
// at. Fields are deliberately tighter-cornered than buttons. Change it here and
// all five primitives follow.
type FieldVariant = "default" | "elevated" | "flat" | "pill" | "pill-flat"

const FIELD_SURFACE = "bg-card border border-border"

const FIELD_SHAPE: Record<FieldVariant, string> = {
  default: "rounded-sm shadow-sm",
  elevated: "rounded-sm shadow-sm",
  flat: "rounded-sm shadow-none",
  pill: "rounded-full shadow-sm",
  "pill-flat": "rounded-full shadow-none",
}

/** Surface + radius + shadow classes for a field primitive. */
function fieldVariant(variant: FieldVariant = "default"): string {
  return `${FIELD_SURFACE} ${FIELD_SHAPE[variant]}`
}

export { fieldVariant, FIELD_SURFACE, FIELD_SHAPE }
export type { FieldVariant }
