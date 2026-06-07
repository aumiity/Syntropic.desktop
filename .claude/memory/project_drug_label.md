---
name: project_drug_label
description: Drug-label system architecture, section order, dual-render paths, known gaps, and a critical better-sqlite3 INSERT pitfall
metadata:
  type: project
---

## Status — 2026-06-07

Core restructure DONE. Preview works in both Settings designer and per-product LabelsTab. Printing from per-product tab NOT yet wired.

---

## Architecture

| Concern | File |
|---------|------|
| Section layout metadata (SSOT) | `src/lib/label/sections.ts` |
| Sample text (Settings preview) | `src/lib/label/content.ts` — `SAMPLE_CONTENT` |
| Real label content (product) | `src/lib/label/content.ts` — `composeLabelContent()` + `todayBE()` |
| React preview component | `src/components/label/LabelPaper.tsx` |
| HTML print builder | inside `src/pages/Settings/LabelSettingsTab.tsx` — `buildLabelHtml()` |
| Plan + audit doc | `docs/plans/label-restructure.md` |

`LabelPaper.tsx` is shared by BOTH the Settings designer preview and the per-product LabelsTab preview — do not duplicate it.

---

## Locked section order

`shop` (+ date right, special flex row) → `shop_address` → `header_line` → `product` → `dosage` (ปริมาณ+ความถี่) → `timing` (มื้อ+เวลา) → `indication` → `advice` → `barcode` (default off)

Removed sections: `notes`, `footer_line`, `lot_expiry`.

**IMPORTANT:** `label_settings` DB columns for the removed sections (`show_notes`, `notes_text`, `show_footer_line`, `footer_line_text`, `show_lot_expiry`) are kept as DEAD columns — they are NOT removed from `LabelSettingsForm` defaults (`LABEL_DEFAULTS`) or the load-filter. If they were dropped from defaults the form would strip them from the loaded row and overwrite them as `undefined` on next save, corrupting any existing stored value. Keep them in the allow-list; just don't render them.

---

## Dual-render pitfall — shop+date row

The `shop` section with the date on the right is a **special flex layout** implemented in TWO separate code paths that can drift:

1. `LabelPaper.tsx` (React, JSX) — used for on-screen preview
2. `buildLabelHtml()` in `LabelSettingsTab.tsx` (HTML string) — used for actual printing

They share `SECTIONS`, `buildSectionStyle()`, and the content map, but the render logic is hand-duplicated by necessity (React vs raw HTML). If you add a new special-layout section, update BOTH places.

---

## better-sqlite3 INSERT — named params must match exactly

**Bug fixed this session:** `products:saveLabel` INSERT was missing columns that the payload object contained (`advice_id`, `label_time_id`, `is_default`, `show_barcode`, `is_active`). better-sqlite3 `.run(obj)` throws **"Too many parameter values"** if the bound object has ANY named key the SQL statement does not reference. The fix: add the columns to `product_labels` (schema + migration) and list every key explicitly in the INSERT column list.

Rule: when using `.run(namedParamObj)`, the object's keys must be a **subset** of (or exactly match) the parameters the statement declares. Extra keys = hard throw, not silent ignore. Unlike the dynamic UPDATE path, INSERT column lists must be kept in sync with the payload manually.

---

## Deferred / not yet done

### "ชื่อสามัญ" (generic drug name) section — DEFERRED

`products` has NO `drug_generic_name_id` column — it exists only on the TS type and is stripped before save in `EditProduct/index.tsx`. `products:get` does not join `drug_generic_names`.

Full end-to-end work required before adding a `generic` label section (between `product` and `dosage`):
1. Add `drug_generic_name_id` column to `products` + migration
2. Stop stripping it in EditProduct save payload
3. Add it to create/update column allow-lists
4. Join `drug_generic_names` in `products:get`
5. Wire to `composeLabelContent()`
6. Add the section to `SECTIONS`

Do not add the section until the DB wiring is complete — it will silently render blank.

### Per-product label printing — NOT YET WIRED

The per-product LabelsTab shows a live preview via `LabelPaper.tsx` + `composeLabelContent()`, but there is NO print action that fires `buildLabelHtml()` with real product data. The Settings designer is the only working print path (sample text only). Next step: wire a "Print" button in LabelsTab that calls `buildLabelHtml()` with the real label + product + shop data.
