---
name: project_drug_label
description: Drug-label system architecture, section order, dual-render paths, known gaps, and a critical better-sqlite3 INSERT pitfall
metadata:
  type: project
---

## Status — 2026-06-07

Core restructure DONE. **Section-split DONE 2026-06-07** (plan `docs/plans/label-section-split.md`): per-section model — EVERY text section now owns `font_size_<key>` + `bold_<key>` + `show_<key>` + `offset_x/y_<key>` (no shared tier; old `font_size_small` is now a DEAD column). 3 new sections added: `shop_phone`, `shop_line_id` (composed from shop info), `custom_text` (free-text LAST line, config not content — pulled from `label_settings.custom_text`, special-cased in BOTH LabelPaper + buildLabelHtml). Defaults flipped: all fonts 10pt, bold on shop/shop_address/shop_phone/product only. tsc + 2-round audit pass; interactive click-test still pending. Preview works in both Settings designer and per-product LabelsTab. Printing from per-product tab NOT yet wired.

---

## Architecture

| Concern | File |
|---------|------|
| Section layout metadata (SSOT) | `src/lib/label/sections.ts` |
| Sample text (Settings preview) | `src/lib/label/content.ts` — `SAMPLE_CONTENT` (product/วิธีใช้ rows only) |
| Settings preview shop header | REAL shop data via `getShop()` + `composeLabelContent` — `previewContent` useMemo in `LabelSettingsTab.tsx` overrides the 4 shop sections; test-print/PDF use the same `previewContent` (preview = print 1:1) |
| Real label content (product) | `src/lib/label/content.ts` — `composeLabelContent()` + `todayBE()` |
| React preview component | `src/components/label/LabelPaper.tsx` |
| HTML print builder | `src/lib/label/html.ts` — `buildLabelHtml()` |
| Per-size style defaults | `sizeDefaults(w,h)` in `LabelSettingsTab.tsx` — FIT-BASED on HEIGHT with TIGHT spacing. Solves the largest font where TARGET_LINES=11 fit, then floors it: `font = floor((avail/(11·0.3528) − gap)/lineSpacing)`, clamp 7–14; **lineSpacing 1.15, gap 1pt, thin pad (h/25, 2–3mm)**. Result: 70×50/80×50→9pt, 80×60→11pt, 100×75→14pt — all fit ~11 lines without overflow. Tuning history (real-label feedback): `h/5` proportional → 80×60 hit 12pt OVERFLOW; line-fit w/ loose spacing → too small (8pt); gentle-linear 10pt → still overflowed (real labels are line-dense). The win was tightening **lineSpacing to 1.15** so 9pt fits 11 lines instead of shrinking the font more. Owner tunes the constants directly (font line: `0.13·h`→ now the fit formula; lineSpacing/gap/pad are plain numbers). Applied via `applySizeTemplate` (sets every text section's font + pads + gap + line_spacing) behind a ConfirmDialog on preset pick, or the "ใช้ค่าเริ่มต้นของขนาดนี้" button (covers custom sizes). Presets: 70×50, 80×50, 80×60, 100×75 (others → กำหนดเอง). **No per-size persistence** — `label_settings` stays a singleton (decided 2026-06-07). |
| Plan + audit doc | `docs/plans/label-restructure.md` |

`LabelPaper.tsx` is shared by BOTH the Settings designer preview and the per-product LabelsTab preview — do not duplicate it.

---

## Locked section order

`shop` → `print_date` → `shop_address` → `shop_phone` → `shop_line_id` → `header_line` → `product` → `dosage` (ปริมาณ+ความถี่) → `timing` (มื้อ+เวลา) → `indication` → `advice` → `barcode` (default off) → `custom_text` (LAST line, from `label_settings.custom_text`)

**`print_date` is special:** it has its OWN settings columns (show/font/bold/offset → appears as its own row in the settings table) but is **NOT rendered as its own line** — it's folded into the `shop` flex row (right side), styled by `font_size_print_date` / `bold_print_date` / `offset_*_print_date`. The shop row shows when `show_shop` OR `show_print_date`. The date string itself is still the `date` PROP (todayBE), not a content-map key. Both render paths (LabelPaper + buildLabelHtml) skip `print_date` in the section loop and draw the date span inside the shop row.

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
