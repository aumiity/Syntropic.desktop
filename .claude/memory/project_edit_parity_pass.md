---
name: project-edit-parity-pass
description: "SUPERSEDED 2026-06-19 — Tab-by-tab parity plan replaced; EditBundle ComponentsTab merged into Tab 1 (see [[project-editbundle-tab-collapse]]). Tab 1 polish (General+Price) = DONE 2026-05-28."
metadata: 
  node_type: memory
  type: project
  originSessionId: fcd724a7-4137-47aa-991a-ea7e0a0d09ce
---

Tab-by-tab refactor pass to bring `src/pages/Products/EditBundle/*` in line with the EditProduct patterns. Operator explicitly asked for tab-by-tab progression ("ค่อยๆทำไปทีละ tab ได้เลย").

**Why:** EditProduct and EditBundle have always shared structure but drifted in details — `variant="elevated"`, status section ordering, save button placement, validation pattern, leave-confirm, price-merge (option D from earlier in the session). Bringing them to parity makes either page easier to reason about and avoids "fixed in one, forgot in the other" bugs.

**DIRECTION CHANGE 2026-06-19:** Tab 2 (ComponentsTab) was NOT done as a separate parity step. Instead the entire EditBundle was restructured: ComponentsTab merged into Tab 1, save unified to one atomic button. See [[project-editbundle-tab-collapse]] for full detail. The Tab 2 resume plan below is OBSOLETE — do not follow it.

~~**Resume order (OBSOLETE):**~~
~~1. Tab 2 — `EditBundle/ComponentsTab.tsx`~~
~~2. `EditBundle/index.tsx` final review~~
~~3. Click-test full EditBundle flow~~
~~4. `npm run build` / tsc before resuming~~

Related: [[project-table-pattern-refactor]] (same canonical-ProductsList pattern source); [[project-editbundle-tab-collapse]] (superseding work).
