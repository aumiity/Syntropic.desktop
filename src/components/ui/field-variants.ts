import { RADIUS_CLASS, type Radius } from "./radius"

// Shared surface contract for the field primitives: Input / SearchInput /
// Textarea / SelectTrigger / NativeSelect. One set of names, one set of classes
// — the variants are a pure shape x shadow matrix on the house ELEVATED
// surface (bg-card + border). There is no flat bg-input variant any more:
// "filled" was removed 2026-07-17 (it had a single real call site).
//
//   default   square + shadow-sm     <- house look, a bare <Input> gets this
//   flat      square + shadow-none
//   pill      rounded-full + shadow-sm
//   pill-flat rounded-full + shadow-none
//
// "elevated" stays as an alias of "default" for the existing call sites.
//
// The SQUARE corner radius is a SEPARATE axis (`radius`, default "md" =
// 0.375rem) shared with Button/Badge via radius.ts — NOT the `--radius-control`
// token the radius rule points at. Fields are deliberately tighter-cornered
// than buttons. Pill variants ignore `radius` (always rounded-full). Set it per
// instance with the primitive's `radius` prop; don't hardcode `rounded-*`.
type FieldVariant = "default" | "elevated" | "flat" | "pill" | "pill-flat"

const FIELD_SURFACE = "bg-card border border-border"

// Shadow per variant (the "flat" axis). Radius is applied separately so a
// `radius` prop can override the square corner without touching the shadow.
const FIELD_SHADOW: Record<FieldVariant, string> = {
  default: "shadow-sm",
  elevated: "shadow-sm",
  flat: "shadow-none",
  pill: "shadow-sm",
  "pill-flat": "shadow-none",
}

const PILL_VARIANTS: ReadonlySet<FieldVariant> = new Set(["pill", "pill-flat"])

/** Surface + radius + shadow classes for a field primitive.
 *  Square variants take `radius` (default "md"); pill variants are always full. */
function fieldVariant(variant: FieldVariant = "default", radius: Radius = "md"): string {
  const shape = PILL_VARIANTS.has(variant) ? "rounded-full" : RADIUS_CLASS[radius]
  return `${FIELD_SURFACE} ${shape} ${FIELD_SHADOW[variant]}`
}

export { fieldVariant, FIELD_SURFACE, FIELD_SHADOW }
export type { FieldVariant }
