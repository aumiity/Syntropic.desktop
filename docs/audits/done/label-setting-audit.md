# LabelSetting Plan Audit

Source plan: `docs/plans/LabelSetting.md`

## Verdict

Needs revision before implementation. The print/test-print direction is reasonable, but the plan carries forward existing label-settings key drift that will make save/reload and print sizing unreliable. It also leaves several implementation details underspecified enough that the preview may not actually match the printed label.

## Findings

### High - Form keys still do not match `label_settings` columns

The plan says no settings IPC change is needed because `saveLabelSettings` builds dynamic SQL from `Object.keys(data)` (`docs/plans/LabelSetting.md:73-75`). That is only safe if every renderer form key is a real DB column.

Current DB columns are `width_mm`, `height_mm`, `pad_top`, `pad_right`, `pad_bottom`, and `pad_left` (`electron/db/schema.ts:407-412`). Current `LabelSettingsTab` uses `paper_width`, `paper_height`, `padding_top`, `padding_right`, `padding_bottom`, and `padding_left` (`src/pages/Settings/LabelSettingsTab.tsx:24-30`, `src/pages/Settings/LabelSettingsTab.tsx:68-76`). `saveLabelSettings` only strips `id`, then emits every remaining key as `SET ${key} = @${key}` (`electron/ipc/settings.ts:183-185`).

The plan repeats the UI-side names in its preview and print handler (`docs/plans/LabelSetting.md:172`, `docs/plans/LabelSetting.md:190-197`, `docs/plans/LabelSetting.md:208-213`). If implemented as written, saving the redesigned form will still attempt to update non-existent columns such as `paper_width` and `padding_top`.

Required fix: either rename the form state to the DB column names everywhere (`width_mm`, `height_mm`, `pad_*`) or add an explicit mapping layer in `getLabelSettings`/`saveLabelSettings`. The lowest-risk path is to use DB column names in the form and derive UI labels from them.

### High - The plan assumes the existing settings row is complete and usable

The plan says to "merge over data from the IPC load just like today" (`docs/plans/LabelSetting.md:143-145`). Today, that merge leaves both DB keys and UI keys in the object when a row exists, because loaded `width_mm` does not replace default `paper_width` (`src/pages/Settings/LabelSettingsTab.tsx:34-37`). That makes the UI display default paper/padding values while the DB row contains different persisted values.

Required fix: make load normalization explicit. Do not keep duplicate canonical keys in `form`. Add a regression check for loading a row with non-default `width_mm`/`pad_top` and confirming the inputs, preview, and printed HTML use those persisted values.

### Medium - `@page size` with `auto` is contradictory to the print IPC contract

The plan generates `@page { size: ${form.paper_width}mm ${form.paper_height || 'auto'}mm; }` (`docs/plans/LabelSetting.md:190`) but then says Electron requires a number and falls back to width for `paperHeightMm` (`docs/plans/LabelSetting.md:211-213`). This means the CSS page size and Electron `pageSize` can disagree when height is `0`.

Required fix: decide the invariant. For label printing, require a numeric height and validate it before printing, or consistently map `height_mm <= 0` to a concrete fallback in both CSS and `webContents.print`. Do not emit mixed `auto` CSS with a square Electron page size.

### Medium - Preview and print markup are not actually guaranteed to be identical

The plan asks for a helper that renders HTML for printing while keeping JSX preview "alongside" it (`docs/plans/LabelSetting.md:220-223`). Unless both paths share one section model and one style builder, the preview can drift from the printed HTML. The plan already has separate concerns: JSX preview with React styles and print HTML string composition.

Required fix: define `SECTION_ROWS` with text, visibility key, offset keys, font-size key, bold key, and class/style generation in one place. Use the same generated section descriptors for JSX and HTML string output. Escape any dynamic text before inserting it into HTML, even if the first version uses sample data.

### Medium - Hidden print window lifecycle may print before fonts/layout settle

The proposed `printLabel` handler prints immediately after `loadURL` resolves (`docs/plans/LabelSetting.md:98-113`). For system fonts this may be fine, but the output depends on CSS layout and fonts. Electron print bugs often show up as clipped or default-font output if printing fires before layout is fully ready.

Required fix: after `loadURL`, wait for the page to finish layout, for example by evaluating `document.fonts?.ready` and a `requestAnimationFrame` before calling `webContents.print`. Keep the window destroyed in `finally`.

### Low - `electron/preload.d.ts` is generated but may need build verification

The plan says to update the matching TS type declaration in `electron/preload.ts` (`docs/plans/LabelSetting.md:124-135`). In this repo, `src/lib/utils.ts` types `window.api` from `@electron/preload`, and there is also a generated `electron/preload.d.ts` in the tree. A normal TypeScript build may regenerate it, but an implementation that only edits `preload.ts` should verify renderer type checking sees `window.api.printer.listPrinters` and `printLabel`.

Required fix: run the repo's type/build command after implementation and confirm no renderer type errors for the new printer methods.

## Recommended Plan Changes

1. Add a first implementation step to normalize label-settings field names. Use DB names as canonical form keys, or add a deliberate mapping layer. Update all examples in the plan from `paper_width`/`padding_top` to the chosen canonical names.
2. Add validation before save/print: positive width, positive concrete height for test print, non-negative padding, finite font sizes/spacing, and finite X/Y offsets.
3. Make preview and print render from one section descriptor model, with a shared style-generation helper.
4. Add a print-readiness wait in `printer:printLabel` before `webContents.print`.
5. Expand verification to include a non-default persisted DB row, a save/reload test for the canonical field names, and a type/build check.

## Notes

The scope boundary around POS/EditProduct workflow printing is appropriate. The added `printer_name`, visibility flags, and per-section offset columns are compatible with the current migration pattern, provided the form only sends columns that actually exist.
