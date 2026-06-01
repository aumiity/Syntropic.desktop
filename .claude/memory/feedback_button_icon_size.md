---
name: Button icon sizing — use size-N, not h-N w-N
description: Icons inside the shared Button component must use Tailwind size-N; h-N w-N is silently overridden to 16px.
type: feedback
originSessionId: aa7647c3-787e-4265-b94d-98be579bb33f
---
Icons (lucide-react / any `<svg>`) placed inside `<Button>` from `src/components/ui/button.tsx` must use `size-N` (e.g. `size-5`, `size-[22px]`), **never** `h-N w-N`.

**Why:** `button.tsx` has the rule `[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`. The `:not([class*='size-'])` escape hatch only excludes svgs whose className contains the literal substring `size-`. `h-7 w-7` does not contain `size-`, so the descendant rule still matches and — being more specific than the user's `.h-7 .w-7` rules — wins. Result: every icon written as `h-N w-N` is silently snapped to 16px (`size-4`) regardless of the value.

**How to apply:**
- When writing or editing any icon inside a `<Button>`: use `size-N`. Same for arbitrary values — `size-[22px]`, not `h-[22px] w-[22px]`.
- Does **not** apply to: icons inside `<Input>`, `<Label>`, `<Badge>` (when not nested in a Button), `<DialogTitle>`, plain `<div>`/`<span>` rows, raw `<button>` (not the Button component), or `className` on the Button element itself (which sets the button's outer size, not a child SVG).
- When auditing a file: grep for `<Icon className="h-\d+(\.\d+)? w-\d+(\.\d+)?` and check whether the parent (or any ancestor up to the Button boundary) is `<Button>`. Fix only those.
- Same trap exists for `Badge` (`[&>svg]:size-3`) but that's a fixed value, less surprising; the Button rule is what catches you off guard because `h-N w-N` *looks* like it should work.
