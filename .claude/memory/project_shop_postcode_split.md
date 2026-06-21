---
name: project_shop_postcode_split
description: shop_postcode split out of shop_address into a dedicated settings column; docs append it, drug label ignores it automatically
metadata:
  type: project
---

**DONE 2026-06-21 (tsc PASS; in-app click-test pending — 5 screens: ShopTab persist, drug label excludes, receipt/tax-invoice/GR append)**

Commit: `03390cd`. Plan SSOT: `docs/plans/Shop_Postcode_Split.html`.

## What changed

| Location | Change |
|---|---|
| `electron/db/schema.ts` L38 | `CREATE TABLE settings` gains `shop_postcode TEXT NOT NULL DEFAULT ''` |
| `electron/db/schema.ts` L1044 | `ALTER TABLE` migration array gains the same column |
| `src/types/index.ts` | `Setting` type gains `shop_postcode?: string` |
| `electron/ipc/settings.ts` | `settings:saveShop` + `settings:completeSetup` carry the field with explicit column lists (allow-list invariant preserved — no `...spread`) |
| `src/pages/Settings/ShopTab.tsx` | New "รหัสไปรษณีย์" FormField with helper note |
| `src/pages/Setup/SetupWizard.tsx` | Optional "รหัสไปรษณีย์ (ไม่บังคับ)" field |

## Key design insight: zero drug-label changes needed

Drug labels read only `shop_address` → postcode is excluded automatically. No conditional, no empty-check — it just works.

## How docs append the postcode

All three document renderers join the two fields with a single filter:

```ts
[shop.shop_address, shop.shop_postcode].filter(Boolean).join(' ')
```

Files: `src/lib/receipt/buildSlipHtml.ts`, `src/pages/Sales/taxInvoiceSheet.tsx`, `src/components/dialogs/GoodsReceiptPrintDialog.tsx`.

If `shop_postcode` is empty (new default), `filter(Boolean)` drops it — so the join produces the plain address with no trailing space. No double-postcode, no crash.

## Migration of existing data — MANUAL, no auto-regex

Users who had the postcode embedded in `shop_address` must re-enter it in ShopTab. Until they do:

- Drug label: still shows embedded postcode (no regression — it always read `shop_address`)
- Docs: postcode appears once from `shop_address` (new field is empty → filter drops it)

No backfill script. No regex extraction. Deliberate.

## Build-pipeline note

Vite-plugin-electron bundles `electron/main.ts` → `dist-electron/` (git-ignored). The committed `electron/**/*.js` files are **stale artifacts** — do NOT edit them. Always edit the `.ts` source. See [[project_studio_architecture]].
