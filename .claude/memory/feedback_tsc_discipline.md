---
name: feedback-tsc-discipline
description: "Don't run tsc after every small edit — only for type/logic/import changes when unsure"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1b60e7c7-3829-418a-b099-61beb4478a8f
---

Don't run `npx tsc --noEmit` after every change. Skip it for markup/className/JSX-text-only edits — the Vite dev server hot-reloads and surfaces those immediately.

**Why:** User pushed back ("จะ tsc ทำไมทุกรอบอะ") — running it on trivial CSS/markup tweaks just wastes time.

**How to apply:** Only type-check when an edit touches types, logic, or adds/removes imports AND there's real uncertainty about cross-file impact. For pure visual/text edits, make the change and stop.
