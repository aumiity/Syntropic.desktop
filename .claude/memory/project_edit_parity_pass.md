---
name: project-edit-parity-pass
description: "ACTIVE 2026-05-28 — align EditBundle UX to match EditProduct, tab by tab. Tab 1 (General+Price merge) DONE; Tab 2 (ComponentsTab) NEXT. Untouched + not click-tested."
metadata: 
  node_type: memory
  type: project
  originSessionId: fcd724a7-4137-47aa-991a-ea7e0a0d09ce
---

Tab-by-tab refactor pass to bring `src/pages/Products/EditBundle/*` in line with the EditProduct patterns. Operator explicitly asked for tab-by-tab progression ("ค่อยๆทำไปทีละ tab ได้เลย").

**Why:** EditProduct and EditBundle have always shared structure but drifted in details — `variant="elevated"`, status section ordering, save button placement, validation pattern, leave-confirm, price-merge (option D from earlier in the session). Bringing them to parity makes either page easier to reason about and avoids "fixed in one, forgot in the other" bugs.

**How to apply:** Before resuming, read the **🚧 PAUSED 2026-05-28** block at the top of `PROGRESS.md` — it has the full Tab 1 changelog (every small change + 3 chunky ones) and the precise resume point for Tab 2. Don't re-read EditProduct vs EditBundle source to figure out diffs from scratch; the PAUSED block is the canonical resume sheet.

**Resume order:**
1. **Tab 2 — `EditBundle/ComponentsTab.tsx`** (519 lines, largest in EditBundle, not yet touched). Reference: `docs/claude/ui-table-card.md` (table-card 4-zone layout, `h-14 px-2` filter strip, `bg-muted` only on column-header band, `border-l-[16px]`/`r-[16px]` table inset). Verify badges flipped to `*-outline`, row actions are `size="icon-lg" variant="elevated"` (destructive2 for delete is fine — existing convention).
2. **`EditBundle/index.tsx` final review** — verify `refreshProduct` `setForm((f) => ({ ...f /* keep edits */ }))` no-op spread doesn't fight `isDirty` semantics; verify leave-confirm doesn't fire during the post-save `navigate(..., {replace:true})`.
3. **Click-test full EditBundle flow** (the PAUSED block lists the 6 scenarios).
4. **`npm run build` (or `tsc -p tsconfig.node.json`) before resuming any work** — IPC signature changes today (stockMovements returning `{rows, total}`) are non-trivial and tsc was not run after the edits.

Related: [[project-table-pattern-refactor]] (same canonical-ProductsList pattern source).
