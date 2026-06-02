---
name: feedback_scrollbar_thin
description: Scrollbars are thin (6px) everywhere in the app — one size, no other scrollbar width allowed.
metadata:
  type: feedback
---

Scrollbars are **thin (6px) across the whole program — one size, no exceptions.**

**Why:** the operator wants a single consistent scrollbar look; a fatter scrollbar (the old 10px global default) read as inconsistent/"off".

**How to apply:**
- The global `::-webkit-scrollbar` in `src/index.css` is set to `w-[6px] h-[6px]` so the entire app is thin by default — you no longer need to remember to add the class.
- The `.scrollbar-thin` utility (also 6px, used in ~40 places) now matches the global; keep using it for explicitness, it's harmless.
- **Never** define a different scrollbar width, a custom `::-webkit-scrollbar` size, or any thicker/thinner variant anywhere.

Codified in CLAUDE.md UI & theming invariants. Related: [[input-elevated-default-flip]], [[feedback_text_size]].
