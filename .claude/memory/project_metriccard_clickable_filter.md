---
name: project-metriccard-clickable-filter
description: "DONE 2026-07-01 (commit 428b0cc); UPDATED 2026-07-02 — MetricCard เองกดเป็นตัวกรองได้แล้ว (prop isActive); เลิกสลับไป StatCard เพื่อความ clickable; Products/index.tsx การ์ดสถานะเป็น mutual-exclusive + 3-stage cycle"
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

## Update 2026-07-02 — mutual-exclusive + 3-stage cycle (Products/index.tsx)

Owner reviewed `/products` and disliked that the 4 summary cards (ทั้งหมด/สินค้า/ชุดสินค้า/ปิดการใช้งาน) could highlight two at once — the old code deliberately ran them as two independent facets (`typeFilter` + `statusFilter`), which was intentional per the old comment but read as a bug visually. Reworked to be strictly mutual-exclusive: only one card active at a time. File touched: **`src/pages/Products/index.tsx` only** — `card.tsx` and `ProductsList.tsx` were not modified (the `badge` prop used below already existed on `MetricCard`, no new prop needed).

- "ทั้งหมด"/"สินค้า"/"ชุดสินค้า" cards still drive `typeFilter`, but clicking any of them now also resets `disabledStage=0` + `statusFilter='all'`.
- `isActive` for "สินค้า"/"ชุดสินค้า" changed from `typeFilter===v` to `typeFilter===v && statusFilter==='all'` — otherwise they'd render active while the disabled-card stages were showing (same `typeFilter` value, different `statusFilter`).
- "ปิดการใช้งาน" card is no longer a boolean toggle — it's a **3-stage cycle** via new local state `disabledStage: 0|1|2` (kept as its own explicit state, not derived from `typeFilter`/`statusFilter`, because deriving it would be ambiguous with the product/bundle cards being clicked directly): `0 (off) → 1 (ปิดการใช้งานสินค้า: typeFilter=product + statusFilter=disabled) → 2 (ปิดการใช้งานชุดสินค้า: typeFilter=bundle + statusFilter=disabled) → 0`.
- The card shows which stage is active via `<Badge variant="destructive-soft">` passed into `MetricCard`'s existing `badge?: React.ReactNode` prop.
- A sync `useEffect` resets `disabledStage=0` whenever `StatusFilterButton` inside `ProductsList.tsx` changes `statusFilter` to something other than what the cycle set (e.g. table's own filter dropdown flips to 'enabled'/'all' directly) — otherwise the badge/ring on the disabled card would go stale.

**Reusable pattern for future multi-stage filter cards:** keep an explicit `stage` state separate from the derived filter values it maps to (don't try to back-derive the stage from `typeFilter`/`statusFilter` combos — ambiguous when other cards can produce the same combo), and remember `MetricCard` already has a `badge` prop for showing cycle position — don't add a new one.

Verified: tsc PASS + Playwright e2e 18/18 (`/verify` skill run, throwaway script not committed to repo).
