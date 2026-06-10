---
name: feedback_modifier_className_specificity
description: A plain className utility can be silently outranked by a cva primitive's group-data/state modifier of the same property — set the override at the same modifier level
metadata:
  type: feedback
---

A plain Tailwind utility passed via `className` (e.g. `h-9`) can be **silently overridden** by a base class inside a cva primitive when that base class is a *modifier* (`group-data-[…]:`, `data-[…]:`, `md:`, `hover:`, …) setting the same CSS property. Modifiers compile to descendant/attribute selectors with **higher specificity** than a single utility class, so `cn(base, className)` order does NOT save you — specificity wins over source order.

**Incident (2026-06-10):** `<TabsList variant="toggle" className="h-9">` rendered ~30px, not 36px. `tabs.tsx` base had `group-data-[orientation=horizontal]/tabs:h-8` (specificity ~0,3,0) which outranked the plain `h-9` className (0,1,0). The list stayed `h-8`; the `h-full` triggers minus the 1px borders measured 30px. The user caught it by measuring the element.

**Why:** matters because it makes a control look wrong (squished) with no error, and the "obvious" fix (pass `className="h-9"`) does nothing.

**How to apply:** when a primitive already sets a property via a modifier (height, padding, bg…), override it at the **same modifier level** inside the variant, not via a plain className. Fix was `data-[variant=toggle]:group-data-[orientation=horizontal]/tabs:h-9` baked into the `toggle` variant (mirrors how `segmented` sets `…:h-auto`). Before assuming a className "isn't applying", grep the primitive for a `group-data`/`data-`/responsive modifier touching that property. See [[feedback_read_doc_before_ui_edit]].
