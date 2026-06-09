---
name: project_drug_label
description: Drug-label system architecture, section order, dual-render paths, known gaps, and a critical better-sqlite3 INSERT pitfall
metadata:
  type: project
---

## Status — 2026-06-09 (POS label print + 4 languages)

**POS label printing DONE + 4-language support DONE** (plan `docs/plans/POS_Label_Print.html`, audit 3 รอบ, tsc ผ่าน, ผู้ใช้ทดสอบจริงผ่าน 2026-06-09). What shipped:

- **POS "พิมพ์ฉลาก" button now live** (`src/pages/POS/index.tsx` — เดิม disabled ถาวร). เปิด `src/pages/POS/LabelPrintDialog.tsx`: ดึงสินค้าในตะกร้า (dedupe ตาม `product_id`, ข้าม `is_bundle`), แยกกลุ่มมีฉลาก/ไร้ฉลาก, Checkbox auto-check + Select เลือกฉลาก (default `is_default`) + Input จำนวนสำเนา (clamp 1..99, **ไม่ผูก qty** — มติ default 1/สินค้า), Toggle เผยรายการไร้ฉลาก + quick add. พิมพ์รวมเป็น sheet หลายหน้าผ่าน `printer.printLabel` (งานเดียว). `showLabelPrint` อยู่ใน `anyModalOpen` + `refocusSearch()` ตอนปิด.
- **`LabelFormDialog` extracted** (`src/components/label/LabelFormDialog.tsx`) = ฟอร์มเพิ่ม/แก้ฉลากร่วม ใช้ทั้ง LabelsTab และ POS quick-add (SSOT). LabelsTab ลบฟอร์มเดิม ใช้ตัวนี้แทน. **saveLabel payload keys ต้อง = INSERT column list** (named-param subset) — เพิ่ม key ใหม่ต้องแก้ทั้ง 2 ที่.
- **4 ภาษา (th/en/mm/zh):** lookup ทั้ง 5 มี `name_th/en/mm/zh` + seed ครบอยู่แล้ว. เพิ่มคอลัมน์ **`product_labels.indication_en`** (schema CREATE + ALTER migration ใน try/catch array + saveLabel INSERT + ProductLabel type + ช่องกรอกในฟอร์ม) → สรรพคุณครบ 4 ภาษา. `composeLabelContent(label, product, shop, lookups, lang='th')` เลือกคอลัมน์ตาม lang, resolve ชื่อ lookup จาก id+lang (fallback joined `*_name` เมื่อไม่ส่ง lookup), indication fallback `indication_th`. **default lang='th' = ผลเท่าเดิมเป๊ะ** (callers เก่า LabelsTab×2 + LabelSettingsTab:219 ไม่พัง). ภาษาเลือกครั้งเดียวใช้ทั้งบิล (POS เท่านั้น).
- **ฟอนต์ fallback พม่า/จีน:** bundle `NotoSansMyanmar-*` + `NotoSansSC-*` (Regular+Bold ครบ) ใน `src/assets/fonts/`. `buildFallbackFontFaceCss(text)` ใน `fonts.ts` สแกน Unicode range (Myanmar U+1000–109F / CJK U+4E00–9FFF…) แล้ว **ฝัง @font-face เฉพาะอักษรที่ปรากฏจริง** (Thai-only ไม่อืด). `buildLabelSheetHtml` (ใหม่ ใน `html.ts`) ต่อ family เข้า stack ก่อน `sans-serif`. `renderLabelSectionsHtml` แยกออกจาก `buildLabelHtml` (sync, ใช้ร่วม single + sheet). **พิมพ์หลายหน้าใช้ `break-after:page` + pageSize microns — ไม่ต้อง `preferCSSPageSize` (เป็น option ของ printToPDF เท่านั้น) → ไม่แตะ printer.ts**.

**⏭️ Next (2026-06-10):** ปรับ UI หน้าต่างพิมพ์ฉลาก POS + เพิ่ม**ตัวเลือกแสดงตัวอย่าง 4 ภาษาภายในหน้าสินค้า** (ตอนนี้ LabelsTab preview ยัง fix `lang='th'` — `composeLabelContent` รับ lang แล้ว เหลือต่อ UI สลับภาษาใน preview).

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

**`barcode` is folded the same way (2026-06-09):** it is NOT its own line anymore — it renders on the RIGHT of the `shop_phone` flex row (phone left, barcode right, `alignItems:center`). The `shop_phone` row shows when `show_shop_phone` OR `show_barcode`; both paths skip `barcode` in the loop and special-case `shop_phone`. Gate = `settings.show_barcode` (per-product path = `effectiveSettings.show_barcode` = the label switch) AND an encodable `content.barcode`. The PHONE truncates (`minWidth:0`+ellipsis); the barcode box is `flexShrink:0`.

**Barcode is a FIXED BOX (2026-06-09), not natural-width:** `font_size_barcode` = HEIGHT (mm), new column `barcode_width_mm` = WIDTH (mm, default 40). The SVG STRETCHES to fill the box — `barcodeSvg` adds `viewBox` + `preserveAspectRatio="none"` so a short code and a long code occupy the SAME footprint (bars still scan — width ratios scale uniformly). Reason: the sample (EAN13, 13 digits) looked wide in the Settings designer while a real short product code looked tiny — inconsistent. Width input lives in LabelSettingsTab under the section table (shown only when `show_barcode`). `maxWidth:100%` is the overflow guard.

Removed sections: `notes`, `footer_line`, `lot_expiry`.

**IMPORTANT:** `label_settings` DB columns for the removed sections (`show_notes`, `notes_text`, `show_footer_line`, `footer_line_text`, `show_lot_expiry`) are kept as DEAD columns — they are NOT removed from `LabelSettingsForm` defaults (`LABEL_DEFAULTS`) or the load-filter. If they were dropped from defaults the form would strip them from the loaded row and overwrite them as `undefined` on next save, corrupting any existing stored value. Keep them in the allow-list; just don't render them.

---

## Dual-render pitfall — shop+date row & shop_phone+barcode row

The `shop` section (date on the right) AND the `shop_phone` section (barcode on the right) are **special flex layouts** implemented in TWO separate code paths that can drift:

1. `LabelPaper.tsx` (React, JSX) — used for on-screen preview
2. `buildLabelHtml()` in `LabelSettingsTab.tsx` (HTML string) — used for actual printing

They share `SECTIONS`, `buildSectionStyle()`, and the content map, but the render logic is hand-duplicated by necessity (React vs raw HTML). If you add a new special-layout section, update BOTH places.

---

## better-sqlite3 INSERT — named params must match exactly

**Bug fixed this session:** `products:saveLabel` INSERT was missing columns that the payload object contained (`advice_id`, `label_time_id`, `is_default`, `show_barcode`, `is_active`). better-sqlite3 `.run(obj)` throws **"Too many parameter values"** if the bound object has ANY named key the SQL statement does not reference. The fix: add the columns to `product_labels` (schema + migration) and list every key explicitly in the INSERT column list.

Rule: when using `.run(namedParamObj)`, the object's keys must be a **subset** of (or exactly match) the parameters the statement declares. Extra keys = hard throw, not silent ignore. Unlike the dynamic UPDATE path, INSERT column lists must be kept in sync with the payload manually.

---

## Barcode control model (wired 2026-06-09)

Two gates were confused before — now split by ROLE (owner decision 2026-06-09, option "per-product switch decides"):

- **Per-label `product_labels.show_barcode`** = the REAL on/off for the barcode section on a printed/previewed label. Lives on each product's ฉลาก tab (LabelsTab dialog toggle "แสดงบาร์โค้ด"). Previously SAVED BUT DEAD (no render path read it).
- **Global `label_settings.show_barcode`** = governs the Settings **designer preview only** (so the owner can see + position the SAMPLE bars). Default 0. Must NOT gate real output.
- **Barcode VALUE** = `products.barcode` (content.ts `out.barcode = product.barcode`). Empty ⇒ `barcodeSvg → ''` ⇒ row self-hides even when the switch is on.

**How it's wired:** the shared renderers (`LabelPaper` / `buildLabelHtml`) STILL gate the barcode section on `settings.show_barcode` — unchanged. `LabelsTab` builds an `effectiveSettings = { ...labelSettings, show_barcode: selected.show_barcode ? 1 : 0 }` (useMemo) and passes THAT to both the preview and `selectedLabelHtml()`. So the per-label switch overrides the global for real labels; the Settings designer keeps the global toggle for positioning. Offset/height (`offset_*_barcode`, `font_size_barcode`) always come from labelSettings.

Hints added: Settings barcode row has an Info note ("ติ๊กที่นี่ = ตัวอย่างเท่านั้น"); LabelsTab dialog warns when switch on but `product.barcode` blank.

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

~~Was unwired~~ — **DONE.** LabelsTab now has working "พิมพ์ฉลาก" + "ดู PDF" buttons (`handlePrintLabel` / `handlePreviewPdf`) that call `selectedLabelHtml()` → `buildLabelHtml()` with the real selected label + product + shop data, gated by `canPrint()` (needs a selected label + a paper size set in ตั้งค่า > ฉลากยา). Print path === preview (same builder).
