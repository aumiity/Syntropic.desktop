# POS UX Rules

## Search UX (mirrors PHP behaviour)

- **Search input is always focused.** `mainInputRef` on the POS page + `modalInputRef` in the search modal. A global `click` listener refocuses whichever is active when the user clicks a non-interactive area. `refocusSearch()` is called after cart unit/price changes. Respects `showPayment/showCustomerSearch/showQuickAdd/showSuccess` — doesn't steal focus from those dialogs.
- **Modal is fixed size.** 600×480 via inline `style`. Header + column-header + footer are `shrink-0`; result list is `flex-1 overflow-y-auto`. Empty space stays empty; overflow scrolls internally — never reflows.
- **Highlight state is owned by keyboard only.** `highlightIdx` resets **only** in `useEffect(() => setHighlightIdx(0), [query])` — never in `onChange`, scroll handlers, or mouse events. Do **not** add `onMouseEnter={() => setHighlightIdx(i)}` to rows: `scrollIntoView` makes rows pass under a stationary cursor and mouseenter would fire spuriously, resetting the highlight. Hover visuals come from Tailwind `hover:bg-primary-soft`, not state.
- **Keyboard scroll.** `activeRowRef` attached to the active row, `useEffect(() => activeRowRef.current?.scrollIntoView({ block: 'nearest' }), [highlightIdx])`. `block: 'nearest'` keeps scroll inside the list container.
- **Arrow keys call `e.preventDefault()`** to stop page/input default behaviour.

## Unit Selection Rules (HARD — main unit always at top)

The base ("หลัก") unit must always be the first option in BOTH the cart unit dialog and the search modal. Selection state must NEVER influence ordering.

- **Synthesize the base unit from `product.unit_name` only.** Do NOT fall back to `item.unit_name` — that's the currently-selected unit and would put the selected unit at top with the "หลัก" badge. Use `product?.unit_name ?? ''`.
- **Unit dialog (`POS/index.tsx`)** — `allUnits = [syntheticBase, ...product.units]`. The synthetic base row has `id: -1`; `product.units` contains only non-base variants (the API never returns base rows).
- **Search modal `flatItems`** — emit `{ product, unit: null }` first, then one entry per `product.units`. The display fallback `it.unit?.unit_name ?? it.product.unit_name ?? '-'` resolves correctly per row. `handleSelectItem(p, null)` sets `selectedUnit: undefined`, which the cart treats as the base — pulling price/name from `product.*`.
- **`changeCartUnit` clears `selectedUnit` for the base.** Detects `unit.id === -1` and writes `selectedUnit: undefined` so the cart always reads base prices from `product.*` (single source of truth). For non-base units, `selectedUnit` is set and `unit.price_*` is used.
- **Where `product.unit_name` comes from:** `pos:searchProducts` SELECTs `u.name as unit_name` via `LEFT JOIN item_units u ON u.id = p.unit_id`. The base unit lives directly on `products.unit_id`.
- **Invariant: every product SHOULD have `products.unit_id` set.** Enforced by `products:create` (writes `unit_id` directly, falls back to `'ชิ้น'` if missing). Bypass via raw SQL → `unit_name` resolves to NULL (no fallback in the queries).
