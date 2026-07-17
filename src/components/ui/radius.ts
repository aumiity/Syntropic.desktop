// Shared corner-radius axis for the control primitives — field (Input /
// SearchInput / Textarea / SelectTrigger / NativeSelect), Button, and Badge.
// One name -> one class, so a `radius` prop selects a corner size WITHOUT
// hardcoding a `rounded-*` literal at the call site (which twMerge would let
// win silently, and which no grep can tell apart from an unrelated radius).
//
// Values mirror the Tailwind scale (derived from --radius = 0.5rem):
//   sm  0.25rem  ·  md  0.375rem  ·  lg  0.5rem
//
// This is the "custom per-instance now, codify later" knob (operator decision
// 2026-07-17): explore with `radius="sm"`, then `grep 'radius='` to find the
// spots you liked and promote a repeated pattern to a primitive default or a
// documented convention. Prefer this prop over a raw `className="rounded-*"`.
export type Radius = "sm" | "md" | "lg"

export const RADIUS_CLASS: Record<Radius, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
}
