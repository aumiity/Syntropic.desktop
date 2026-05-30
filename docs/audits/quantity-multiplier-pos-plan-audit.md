# Audit: POS Quantity Multiplier Plan

Date: 2026-05-30
Scope: Review the proposed plan for adding a single-use `*N` quantity multiplier to `src/pages/POS/index.tsx`.

## Verdict

The plan is directionally sound and fits the existing POS architecture. Keeping the multiplier in `POSPage` and applying it only in `handleSelectItem` is the right integration point because both modal selection and barcode/Enter selection already converge there. `cartStore.addItem` also already increments existing rows by `item.qty`, so `*3` on an existing product will add 3 without store changes.

Do not implement the plan verbatim yet. A few details need tightening to avoid scanner races, invalid design tokens, and input/badge overlap.

## Findings

### High: Idle commit can swallow the beginning of a fast barcode scan

The plan relies on `*3` being committed after about 450 ms of idle time so the query is clean before scanning. While `mulBuffer !== null`, every digit is prevented and appended to the multiplier buffer. If the cashier types `*3` and scans immediately before the idle timer fires, the scanner's first barcode digits are indistinguishable from multiplier digits and will be swallowed or appended until the length cap is reached.

This is the main behavioral risk because the feature exists specifically for barcode scanning. Add a test case for "scan starts before the idle timeout" and decide the intended behavior. If the product workflow assumes a human pause between typing the multiplier and pulling the scanner trigger, document that assumption and consider reducing the idle delay. If no pause can be assumed, the auto-arm design needs a stronger delimiter or a scanner-aware heuristic; pure keydown parsing cannot reliably tell `*12` from `*1` followed immediately by a barcode beginning with `2`.

### Medium: `warning-soft` is not a valid local Badge variant/token

The plan mentions `bg-warning-soft text-warning` for the compose badge. The local design system has `Badge` variants such as `warm`, `warning`, `warning-outline`, and `primary-soft`, but no `warning-soft` variant and no `bg-warning-soft` token in `tailwind.config.js`.

Use one of the existing semantic variants instead:

- compose: `Badge variant="warm"` or `Badge variant="warning-outline"`
- armed: `Badge variant="primary-soft"` or `Badge variant="primary-outline"`

This keeps the implementation aligned with `src/components/ui/badge.tsx`.

### Medium: Badge placement in the main input needs explicit right padding and icon layout

The current main input has `pr-9` and a search icon absolutely positioned at `right-2.5`. Adding a multiplier badge inside the same `relative` wrapper will overlap either the input text or the search icon unless the plan also changes the spacing.

When implementing, reserve space intentionally. For example, increase the input's right padding while a badge is visible, place the search icon to the left of the badge or hide it while the badge is active, and ensure the badge uses `pointer-events-auto` while the search icon remains `pointer-events-none`.

### Medium: Timer and commit functions must avoid stale `mulBuffer`

The plan says to reset an idle timer every time `mulBuffer` changes and call `commitMultiplier()`. That is fine only if `commitMultiplier` reads the current buffer value from its dependency closure or a ref. A stale callback can commit an older buffer, especially around fast typing and immediate `Enter`/`*`.

Recommended shape:

- define `commitMultiplier` with `useCallback` and `mulBuffer` in its dependency list, or store the buffer in a ref updated on every render
- in the idle `useEffect`, do nothing when `mulBuffer === null`
- clear the previous timer before scheduling a new one
- clear the timer inside both `commitMultiplier` and `cancelMultiplierCompose`
- clean up the timer on unmount

### Low: Escape handling should explicitly coordinate with the existing global handler

`POSPage` already has a native `window` keydown handler that closes dialogs on Escape. The new main-input Escape behavior should use both `preventDefault()` and `stopPropagation()` when it cancels compose or clears an armed multiplier. This is especially important if the search modal is open and the user expects Escape to clear only the multiplier state.

The plan already mentions `stopPropagation` for compose Escape; extend that same rule to the armed-multiplier Escape path.

### Low: Clearing the badge should refocus the main input

The focus-lock logic usually keeps the search field focused, but clicking the badge's X is an interactive target and will not be prevented by the document `mousedown` handler. After `clearArmedMultiplier()`, explicitly refocus `mainInputRef.current` if no modal is active. This preserves the POS "always ready to scan" behavior.

## Implementation Notes

- `handleSelectItem` should compute `qty = multiplier ?? 1`, pass `qty`, and set `line_total: price * qty` for new rows.
- Reset `multiplier` after `cart.addItem(...)` succeeds and before/with `closeSearch()` so the badge disappears for both click and keyboard selection.
- Keep compose handling only on the main input, as planned. The modal should display the armed multiplier but should not start `*N` compose unless that is explicitly added later.
- Limit multiplier length, but document the chosen max. Three digits is reasonable for POS use, but it becomes part of behavior.
- Consider rejecting extremely large values defensively even if the UI caps typing, because future paste/programmatic paths may bypass keydown.

## Verification Additions

Keep the proposed manual checks and add these:

- Type `*3` and scan immediately before the idle delay expires; verify whether the barcode is preserved or document the limitation.
- Type `*12`, wait for commit, then scan; verify the added quantity is 12 and the query contains only the barcode/search text.
- Type `*0`, wait; verify no badge is armed and the next item adds quantity 1.
- Type `*`, press Backspace; verify compose is cancelled and `*` never appears in the query.
- Arm `*4`, open the search modal via normal text search, press Escape once; verify the intended priority between clearing multiplier and closing modal.
- With the armed badge visible, type a long search query and verify the text, search icon, badge, and X button do not overlap.

## Conclusion

Proceed after revising the plan for the scanner-before-idle edge case and replacing the nonexistent warning-soft styling. The codebase supports the feature cleanly in `POSPage`; the remaining risks are mostly input timing and UI fit rather than cart logic.
