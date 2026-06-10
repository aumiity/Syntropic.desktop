---
name: feedback_popover_scroll_in_dialog
description: A portaled Popover/Combobox scrollable list inside a Radix Dialog won't scroll — the Dialog's react-remove-scroll blocks it; fix = stopPropagation on wheel/touch
metadata:
  type: feedback
---

A scrollable list inside a Radix **Popover/Combobox that is rendered inside a Dialog** silently refuses to scroll. The Popover content is portaled to `document.body` (outside the Dialog DOM), and the Dialog's `react-remove-scroll` adds a document-level (bubble-phase) `wheel`/`touchmove` listener that `preventDefault`s scrolling on anything outside the dialog — including the portaled popover.

**Incident (2026-06-10, verified fixed):** the `Combobox` (autocomplete) in `LabelFormDialog` couldn't scroll its option list. Combobox's `PopoverContent` (`src/components/ui/popover.tsx`) uses `PopoverPrimitive.Portal` → body.

**Fix (in `src/components/ui/combobox.tsx`):** on the scrollable list div, stop the event from bubbling to document so react-remove-scroll's handler never fires and the list scrolls natively:
```tsx
onWheel={(e) => e.stopPropagation()}
onTouchMove={(e) => e.stopPropagation()}
```
Harmless outside a dialog (nothing to block). `touchmove` matters because the POS terminals are touchscreens.

**Why:** tsc can't catch this — it's a runtime DOM-event interaction; only a real in-app scroll test reveals it. **How to apply:** any time you put a scrollable portaled popover/combobox/custom dropdown inside a `<Dialog>`, add the stopPropagation handlers. (Radix `Select`'s own content already handles this; this only bites custom Popover-based scroll areas.) Fallback if stopPropagation ever fails: portal the popover into the dialog content node via `PopoverPrimitive.Portal container={…}`. See [[feedback_modal_behavior]].
