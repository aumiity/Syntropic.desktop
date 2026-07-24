---
name: feedback_scrollbar_thin
description: Scrollbars are ONE size (10px) everywhere in the app — no other scrollbar width allowed.
metadata:
  type: feedback
---

Scrollbars are **one size — 10px — across the whole program, no exceptions.**

**Why:** the operator wants a single consistent scrollbar look; per-element width variants read as inconsistent/"off". The exact width is the operator's taste pick (they retune it until the real build); the durable rule is **ONE size everywhere**, not the specific number.

**How to apply:**
- The global `::-webkit-scrollbar` in `src/index.css` is set to `w-[10px] h-[10px]` so the entire app matches by default — you no longer need to remember to add the class.
- The `.scrollbar-thin` utility (also 10px, used in ~40 places) matches the global; keep using it for explicitness, it's harmless. The name is historical — at 10px it isn't literally "thin" anymore, but the class name stays.
- History: started at 6px → 7px (2026-06-27) → **10px (2026-07-24, current — operator likes it, "กำลังดี")**.
- **Never** define a different scrollbar width, a custom `::-webkit-scrollbar` size, or any thicker/thinner variant anywhere.

Codified in CLAUDE.md UI & theming invariants + `docs/claude/ui-theming.md` rule 10. Related: [[input-elevated-default-flip]], [[feedback_text_size]].
