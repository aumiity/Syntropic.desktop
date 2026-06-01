---
name: feedback-text-size
description: "Minimum text size is `text-sm` — never use `text-xs` or arbitrary smaller values in new Syntropic.desktop UI."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bf67ef5d-a531-4c14-9d83-8c05c39fbedd
---

`text-sm` is the smallest text size allowed in new code. Don't use `text-xs`, `text-[10px]`, `text-[11px]`, `text-[13px]`, or any arbitrary smaller value. Scale up from `text-sm` → `text-base` → `text-lg` → `text-xl`, etc.

**Why:** User explicitly set this as a project-wide rule on 2026-05-13 during the Products adjust-stock modal redesign. The Thai/Inter/Sarabun font stack at smaller sizes becomes hard to read, and consistency at the floor size keeps spacing/rhythm predictable.

**How to apply:**
- All new features and any UI you actively edit — use `text-sm` minimum.
- Existing legacy `text-xs` (table row index, FDA badges, etc.) can be cleaned up opportunistically but is not a blocker.
- The rule is codified in CLAUDE.md (Theming rules #9) as HARD — link there before suggesting alternatives.
- Related: [[feedback-button-icon-size]] (same project, similar "size constraint that's easy to miss" pattern).
