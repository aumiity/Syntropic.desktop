---
name: project-metriccard-clickable-filter
description: "DONE 2026-07-01 (commit 428b0cc) — MetricCard เองกดเป็นตัวกรองได้แล้ว (prop isActive); เลิกสลับไป StatCard เพื่อความ clickable"
metadata:
  type: project
---

## What changed

`MetricCard` (`src/components/ui/card.tsx`) got a new `isActive?: boolean` prop. When the card also has `onClick`, it renders as a `<button>` (already did) and now shows a **tinted ring** matching its `tint` when `isActive` is true — same visual language `StatCard` already had, but on `MetricCard` itself. Hover/active styling, size, layout are otherwise unchanged from the passive card.

`activeRing` map (both the `size="sm"` and default branches read this):
```
success → ring-success · warning → ring-warning · destructive → ring-destructive
secondary → ring-border-strong · amber → ring-amber-strong · violet → ring-violet-strong
info-soft / info → ring-info-soft-foreground · default → ring-primary
```

**This supersedes the split documented in [[table-pattern-refactor]]** ("Manage renders StatCard when a card has onClick, else MetricCard") — that branch is gone. `Manage/index.tsx` now always renders `<MetricCard {...c} />`; `ManageSummaryCard` interface carries `onClick?`/`isActive?` directly. The showcase page (`/theme`) still demos `StatCard` separately — StatCard is not dead, just no longer the only clickable option.

## Where it's used

Clickable filter cards now live in: `Manage/Sales.tsx`, `Manage/Purchases.tsx`, `Manage/DeadStock.tsx` (via the stock sub-tab), `Manage/Expiry.tsx`, and `Products/index.tsx` (typeFilter/statusFilter cards — see [[project_products_bundles_merge]]).

**Toggle pattern used everywhere:**
```ts
const pick = (v: FilterValue) => () =>
  setFilter(cur => (cur === v && v !== 'all' ? 'all' : v))
```
Clicking the active card again resets to `'all'`; clicking a different one switches; the `'all'` card itself is not exclusive-toggled (clicking it just re-selects `'all'`). Time-range filters stay exclusive (not part of this toggle).

**Gotcha:** `Manage/Purchases.tsx` has no shared filter `useEffect` reacting to state changes — its `onClick` must call `loadHistory()` itself after setting the filter, or the table won't refresh.

Related: [[table-pattern-refactor]] (superseded StatCard-branch note), [[project_products_bundles_merge]] (same click-to-filter pattern applied to Products page type/status cards)
