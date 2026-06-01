---
name: Modal interaction rule (project-wide)
description: All modals must NOT close on outside-click. Esc closes; Enter triggers the primary OK action. Enforced via the shared Dialog component.
type: feedback
originSessionId: 6d8cd046-26a2-4d4d-b767-ba71accf1556
---
All modals in this project follow the same interaction contract:

1. **Outside-click does NOT close.** Clicking the backdrop is a no-op.
2. **Esc closes.** Standard Radix behaviour, kept on.
3. **Enter triggers the primary OK action** when the modal has one. For multi-step modals (e.g. POS return/adjust where Enter on the qty input adds an item to the list), Enter on the primary working input advances the natural next step; the final confirm still needs a click. Use judgment per modal.

**Why:** Pharmacy POS users frequently click outside a modal by accident while reaching for the keyboard or scanner. Losing in-progress state (cart edits, return lines, adjust batches) was a common complaint. Esc is explicit; outside-click is not.

**How to apply:**
- The shared `src/components/ui/dialog.tsx` `DialogContent` already calls `e.preventDefault()` in `onPointerDownOutside` and `onInteractOutside` — every modal that uses it inherits the rule. **Do not bypass** this by writing raw `<div>` modals or by overriding those handlers.
- When adding a new modal, also wire Enter on the primary input (or on the modal root via a `keydown` handler) to call the same function the OK button calls. Skip for modals where Enter would conflict with text/number input semantics inside textareas.
