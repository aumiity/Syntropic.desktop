---
name: project_tag_printing
description: Barcode-sticker + price-tag printing tab — architecture decisions, POS scan fix, pitfalls
metadata:
  type: project
---

# Barcode-sticker + price-tag printing

**DONE 2026-06-10 (tsc PASS + hunter click-test in-app PASS).** New tab `/products/print` prints barcode stickers (on the label printer) and A4/A5 price tags. SSOT plan = `docs/plans/Barcode_Price_Tag_Printing.html` Section B (2 audit rounds, 19 findings). Built in 3 rounds: A = schema/handlers/preload/lib, B = POS scan fix, C = UI/shell/docs.

---

## Architecture: who owns what

**Why split settings vs. per-job options?** Printer selection and paper size are shop-wide decisions (admin sets once). Layout preference (preset, content toggles) changes every job — putting it in Settings would force staff to navigate away mid-workflow.

- **Sticker printer + paper W×H** → `label_settings` (existing, Settings tab)
- **Price-tag printer + paper size A4/A5** → `document_settings.paper_size` (no longer hardcoded A4 — **do not re-hardcode**)
- **Preset + content toggles** → stored per-mode in print tab state, auto-persist to DB (debounce 800ms, no Save button, not admin-gated → see carve-out below)

---

## Preset design: fixed grid, not free cols/rows

**Why fixed presets instead of free input?** Free cols×rows lets users create illegibly small cells. Presets encode safe minimum cell size as a compile-time constraint.

SSOT: `src/lib/tags/presets.ts` — `resolveStickerPreset` / `resolvePriceTagPreset`.

- Sticker: 1/2/4/6/8-up; price tag: 4/8/12/24-up
- `tooSmall` flag: computed from `cellWmm × cellHmm` vs. `MIN_CELL` (18×10mm) against the actual paper dimensions → preset disabled in UI with Tooltip "ช่องเล็กเกินอ่านบนกระดาษนี้"
- **How to apply:** when adding new presets, always set `tooSmall` via the computed check, never by hand-annotating

---

## Barcode fallback chain + warning strategy

Resolve chain per cell: `unit?.barcode || p.barcode || p.code`
Result tagged as `barcode_source: 'own' | 'base' | 'code'`

**Why NOT a toast?** Toasts vanish. A printed tag with a wrong barcode silently breaks POS scanning. Persistent visual is required.

- `barcode_source !== 'own'` → `TriangleAlert` (text-warning) corner icon on the cell → `Popover` on hover/click explaining impact:
  - `'base'` = unit has no own barcode; prints base-unit barcode; scanning in POS yields base-unit price, not unit price
  - `'code'` = no barcode at all; product code used as fallback barcode
- Both code-and-barcode absent → **block assign + toast error** (the only case where toast is appropriate; nothing to pin a popover on)

---

## POS scan fix — critical gotcha

**Problem:** `pos:searchProducts` only searched `products.barcode`. Stickers printed for a specific unit (e.g. "กล่อง") use `product_units.barcode`. Scanning yielded no result.

**Fix:** `pos:searchProducts` now also queries `product_units.barcode` via EXISTS subquery, and returns `matched_unit_id` in the result row.

**Positional binding pitfall (the actual hard part):**
SQLite `?` bindings are positional. The subquery param appears before the outer WHERE clause params. Count every `?` in declaration order — if you move a subquery, recount. Getting this wrong silently returns wrong results or throws at runtime (param count mismatch). In this query the subquery params come first → total 14 params; order matters.

**ProductSearchDialog `initialIdx` prop:**
- New prop sets the initial highlight index when the dialog opens with a pre-matched unit
- Keyboard-ownership is unchanged: `highlightIdx` resets only on `query` change, never from mouse
- Base unit row remains first (`id: -1` synthesized from `product.unit_name`) — `flatItems` order must not change
- POS forwards `matched_unit_id` → the dialog highlights the scanned unit row so price matches the printed tag

---

## `font_family` removed from price-tag config

**Why:** `document_settings` stored a `tag_font_family` column but there is no UI to let the user change it — it was dead config. Keeping a key with no picker violates the allow-list discipline (any future `products:update`-style handler that reads `Object.keys(data)` would generate invalid SQL). Price tags are hardcoded to Sarabun.

**Contrast:** sticker font is still user-selectable via `label_settings` (has a real picker in Settings → Printer → ฉลากยา).

---

## Reuse chain (don't duplicate)

Builders reuse existing primitives — do not create parallel implementations:

- `barcodeSvg(value, options)` — barcode SVG generator (shared with drug-label)
- `LABEL_FIT_SCRIPT` / `window.__labelFitReady` — auto shrink-to-fit (from `src/lib/label/fit.ts`)
- `buildPrintFontFaceCss()` — inlined @font-face (shared across all print builders)
- `esc(str)` — HTML-escape for builder strings
- `printer.ts` uses `WAIT_FOR_RENDER_JS` to await `__labelFitReady` (optional guard; backward-safe if fit script absent)

---

## Admin-gate carve-out

`saveBarcodeStickerSettings` and `savePriceTagSettings` are NOT admin-gated.

**Why:** layout preference (which preset, what to show on tag) is a shop-floor decision made by staff per job. Auto-persist fires on every preset switch — gating would spam FORBIDDEN to non-admin users doing normal work.

**Documented at:** handler comments in `electron/ipc/settings.ts` + `docs/claude/ipc-api.md` (both must stay in sync).

---

## Known cosmetic warning (not a regression)

Barcode SVG emits `viewBox="0 0 190px 49px"` (with `px` suffix) → DevTools console warning. This comes from the upstream barcode library (same lib used in drug labels). It is a warning, not an error; rendering is unaffected. Do not attempt to post-process the SVG string to strip `px` — the library may change the format.

---

## Files

- `src/pages/Products/PrintTab/index.tsx` — main tab shell, preset/toggle/copies controls
- `src/pages/Products/PrintTab/GridEditor.tsx` — cell grid, TriangleAlert warnings
- `src/components/dialogs/TagProductSearchDialog.tsx` — thin consumer of shared `ProductSearchDialog` (not a standalone copy — do not duplicate search logic)
- `src/lib/tags/presets.ts` — preset SSOT
- `src/lib/tags/buildBarcodeStickerHtml.ts` — sticker HTML builder
- `src/lib/tags/buildPriceTagHtml.ts` — price-tag HTML builder

---

## Pending real-world tests (click-test in-app passed; these require hardware)

- Print to label printer and verify physical output
- Scan printed unit-barcode sticker in POS → confirm correct unit pre-highlighted
- Assign a product with no barcode and no code → confirm TriangleAlert appears (not just toast)
