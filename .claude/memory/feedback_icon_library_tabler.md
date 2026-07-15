---
name: feedback-icon-library-tabler
description: lucide-react stays the default outline icon set; @tabler/icons-react added for opt-in solid/filled icons (user's pick over Phosphor)
metadata:
  type: feedback
---

`lucide-react` is outline-only — it has no filled/solid icon variants, and setting `fill="currentColor"` on its icons looks broken (most paths aren't designed to be filled). When a solid look is wanted (first case: Sidebar nav icons, 2026-07-15), add `@tabler/icons-react` and import the `Icon<Name>Filled` component directly instead of the outline `Icon<Name>`.

**Why:** user asked for solid sidebar icons. First pass used `@phosphor-icons/react` (one component, a `weight` prop covers every icon in every style — no coverage gaps). Built a side-by-side comparison artifact of 5 candidate libraries (Phosphor/Solar/Remix/Font Awesome/Heroicons rendering the actual 13 sidebar icon concepts) to let the user pick visually. User's answer was outside that set: **"Tabler ดีกว่า"** — explicitly preferred Tabler's look over all 5, despite Tabler's filled coverage being inconsistent (confirmed gaps: no `IconUsersFilled` for plural people, no `IconBracesFilled`, no filled storefront/shop icon, no filled `chart-line`). Style preference won over completeness — when that happens, pick the closest available filled icon per gap (don't silently fall back to outline).

**How to apply:** default to `lucide-react` for new icons (still the HARD invariant baseline). Reach for `@tabler/icons-react` only when a solid treatment is the point — import `Icon<Name>Filled` directly, no context/weight-provider mechanism (unlike Phosphor, each filled icon is its own component). Current gap workarounds in `src/components/layout/Sidebar.tsx`: `IconShoppingCartFilled` (no storefront/shop filled icon — sales/checkout concept instead), `IconUserFilled` (singular — no plural users filled icon), `IconChartAreaLineFilled` (no plain chart-line filled — closest trending/report visual), `IconCodeCircleFilled` (no braces filled — closest code concept). Codified in `CLAUDE.md` HARD invariants + `docs/claude/ui-theming.md` rule 8b. Don't introduce a third icon package without updating both.
