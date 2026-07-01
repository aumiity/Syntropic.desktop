---
name: project-products-bundles-merge
description: "DONE 2026-07-01 (commit 93f8cbb) — BundlesList.tsx ถูกลบทิ้ง; ชุดสินค้ารวมเข้า ProductsList.tsx เป็นตารางเดียว แยกด้วย typeFilter"
metadata:
  type: project
---

## BundlesList.tsx no longer exists — do not look for it

Products and bundles (products with `is_bundle=1`) now live in **one table**: `src/pages/Products/ProductsList.tsx`. `src/pages/Products/BundlesList.tsx` was deleted; the `/products/bundles` **list** route was removed from `App.tsx`.

**Still exists (kept):** `/products/bundles/new` and `/products/bundles/:id/edit` (the `EditBundle` create/edit flow itself is unchanged, just no longer has its own list page to navigate back to). `EditBundle`'s back-navigation now points at `/products` instead of `/products/bundles`.

## How the merge works

- `src/pages/Products/index.tsx` (shell) owns `typeFilter` (`'all' | 'product' | 'bundle'`) and `statusFilter`, lifted into `ProductsOutletContext` so `ProductsList` reads them instead of owning local state.
- Shell renders **4 summary cards**: ทั้งหมด / สินค้า / ชุด (drive `typeFilter`) + ปิดการใช้งาน (drives `statusFilter`) — clickable via the [[project-metriccard-clickable-filter]] pattern (`isActive` ring, toggle-to-`'all'` on re-click).
- The "ชุดสินค้า" tab is gone from the Products tab strip — only "สินค้า" and "พิมพ์บาร์โค้ด" remain.
- The "เพิ่ม" (add) button is now a `Popover` menu with two entries: เพิ่มสินค้า → `/products/new`, เพิ่มชุด → `/products/bundles/new`.
- `ProductsList.tsx` maps `typeFilter` to the `is_bundle` param sent to `products:list`: `all` → omit (fetches both), `product` → `0`, `bundle` → `1`. Backend was **not touched** — `products:list` already accepted an optional `is_bundle` and always returned `component_count`; the count cards derive their numbers from `stockStats` queried with `is_bundle` 0 and 1 separately.

## New table columns/behavior in ProductsList

- New "ประเภท" column: `Badge variant="neutral-outline"` for a plain product, `Badge variant="info-outline"` + `Boxes` icon for a bundle.
- Bundle rows' stock cell shows "สินค้าในชุด N รายการ" (from `component_count`) instead of a stock number.
- Bundle row actions: แก้ไข (→ `/products/bundles/:id/edit`) + เปิด/ปิดการใช้งาน only — **no** "ปรับสต็อค" action (bundles don't hold their own stock).

## Studio audit result

Priest PASS + Hunter PASS (tsc exit 0) on this change — no outstanding fixes.

Related: [[project-metriccard-clickable-filter]] (the click-to-filter mechanism used by the 4 summary cards here), [[project-editbundle-tab-collapse]] (the EditBundle create/edit page this list still routes into, unaffected by this merge), [[table-pattern-refactor]] (BundlesList retirement noted there too)
