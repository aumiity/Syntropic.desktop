# Audit Request — LabelSettingsTab Redesign + Silent Label Printing

> **For external code-reviewing LLMs reviewing the implemented feature.**
> Status: code-complete, `./node_modules/.bin/tsc -p tsconfig.json --noEmit` clean, `npm run build` clean (renderer + electron main + preload), **NOT click-tested in Electron yet** — no physical printer or PDF dump verified.
> Pre-audited at the **plan stage** through two review rounds — every finding folded into the plan before code was written. This request asks you to audit the **shipped code** against the plan, and to find anything the plan or earlier audits missed.

---

## What this feature does

`src/pages/Settings/LabelSettingsTab.tsx` used to be config-only — it edited paper / font / spacing rows and rendered a static preview with hardcoded "Paracetamol 500mg" sample text. There was no print path anywhere in the repo for labels (only an ESC/POS *receipt* pipeline that talks TCP to a thermal printer).

After this change:

1. **Per-line section editor** — seven label sections (`shop`, `product`, `dosage`, `indication`, `notes`, `lot_expiry`, `barcode`) each have an independent visibility toggle AND independent X/Y nudge (mm). Per-section font size + bold remain.
2. **Test print button** — silently prints one sample label via `webContents.print({ silent: true, deviceName, pageSize })` to a user-selected OS printer, picked from a dropdown populated by `getPrintersAsync()`.
3. **Pre-existing key-drift bug fixed** — the old form used UI-only keys `paper_width`, `paper_height`, `padding_*` while DB columns are `width_mm`, `height_mm`, `pad_*`. `saveLabelSettings` builds dynamic SQL from `Object.keys(data)`, so save *was silently failing* before this PR. Form keys are now canonical DB column names.

Per-product label *content* (dosage / frequency / timing / notes in TH/MM/ZH) is unchanged — already managed in `src/pages/Products/EditProduct/LabelsTab.tsx`. Workflow integration (e.g. "print label" from POS after a sale) is **out of scope** for this PR.

## Tech stack
Electron 31 + React 18 + TypeScript + better-sqlite3 + Tailwind v3 + Zustand + Radix UI. No new deps.

## Working tree to review
No commit yet — review the dirty tree. Relevant changes only:
```
electron/db/schema.ts                       (label_settings CREATE TABLE + 22 ALTER TABLE migrations)
electron/ipc/printer.ts                     (added BrowserWindow import + 2 IPC handlers)
electron/preload.ts                         (added listPrinters + printLabel on window.api.printer)
src/pages/Settings/LabelSettingsTab.tsx     (full rewrite)
```

## Reference docs
- [`docs/plans/LabelSetting.md`](../plans/LabelSetting.md) — full design + plan-stage audit findings (already folded in)
- [`docs/audits/done/label-setting-audit.md`](done/label-setting-audit.md) — first plan-stage audit
- [`docs/audits/done/label-setting-revised-audit.md`](done/label-setting-revised-audit.md) — second plan-stage audit (folded in before code)
- [`CLAUDE.md`](../../CLAUDE.md) → no-color-literal rule, ELEVATED control style, dialog/button contracts, no-raw-HTML rule

---

## Load-bearing assumptions to challenge

These are the architectural pillars. If any is wrong, the design has a hole.

### 1. `Object.keys(form)` is safe to feed into `saveLabelSettings`'s dynamic SQL
The whole "key-drift fix" rests on this. `settings:saveLabelSettings` (`electron/ipc/settings.ts:179–190`) does `Object.keys(rest).map(k => '${k} = @${k}')`. The form must contain ONLY real `label_settings` columns. Any stray key (e.g. a transient UI flag dropped into `form` later) will throw `no such column`.

**Verify:**
- Every key in `LABEL_DEFAULTS` (`LabelSettingsTab.tsx:46`) matches a column declared in `electron/db/schema.ts:404–447` (the new CREATE TABLE) AND has a matching `ALTER TABLE ... ADD COLUMN` in the migration array (`electron/db/schema.ts:553–576`).
- Nothing in `LabelSettingsTab.tsx` ever assigns to `form` outside the canonical keys (no `setF('foo' as any, ...)` etc.).
- The load merge at `LabelSettingsTab.tsx:113–123` only copies keys *that already exist on `prev`* — confirm it cannot smuggle a non-canonical key from `data` into `form`.

### 2. Migration applies cleanly to existing DBs and is idempotent
The 22 new `ALTER TABLE label_settings ADD COLUMN` statements are wrapped in `try { db.exec(sql) } catch {}` (`schema.ts:554–556`). SQLite `ADD COLUMN` is fast and non-blocking, and re-running throws `duplicate column name`, which the empty catch swallows.

**Verify:**
- Migration block lives inside the existing migration loop body — no statement is outside the try/catch.
- Defaults on `ALTER TABLE` columns are valid for SQLite (constant only) — they are (numeric literals + `''`).
- Fresh-install defaults bumped `width_mm 62→100` and `height_mm 0→75`. This affects NEW installs only; the migration cannot retroactively change existing rows. Acceptable behaviour, but confirm intentional.

### 3. Hidden BrowserWindow lifecycle in `printer:printLabel` is leak-proof
`electron/ipc/printer.ts` opens a hidden `BrowserWindow`, loads a `data:` URL, waits for fonts + double rAF, calls `webContents.print`, then destroys the window in `finally`.

**Verify:**
- `w.destroy()` runs on EVERY exit path including the early invalid-size return (it currently does *not* — early return happens before the window is created, which is correct, but confirm).
- `webContents.print` callback signature is `(success: boolean, failureReason: string)` in Electron 31 — verify against the installed Electron version (`package.json`).
- `loadURL` with `data:text/html;charset=utf-8,${encodeURIComponent(html)}` handles arbitrary HTML including Thai characters. URL length: a real label HTML is maybe 1–2 KB; data-URL limit is ample.
- `executeJavaScript` returns a Promise that resolves on the inner async IIFE — if `document.fonts.ready` rejects, the inner `try {} catch {}` swallows; verify the outer `executeJavaScript` doesn't error and skip the print.

### 4. CSS `@page size` and Electron `pageSize` are guaranteed numeric + equal
The plan called out a previous bug where one path could be `auto` while the other was a number. Current code:
- CSS: `@page { size: ${form.width_mm}mm ${form.height_mm}mm; margin: 0; }`
- Electron: `pageSize: { width: Math.round(args.paperWidthMm * 1000), height: Math.round(args.paperHeightMm * 1000) }` (microns)
- Renderer validates `width_mm > 0 && height_mm > 0` before invoking IPC; IPC re-validates as defence-in-depth.

**Verify** the renderer validation (`LabelSettingsTab.tsx:144–151`) cannot be bypassed by a save without test-print (it can't — save doesn't print) and that `Number(e.target.value)` for cleared inputs coerces to `0`, which the `> 0` check rejects.

### 5. Preview matches print 1:1 because they share `SECTIONS` + `buildSectionStyle`
The JSX preview iterates `SECTIONS.filter(...)` and applies `buildSectionStyle(s, form)` directly as `React.CSSProperties`. The print HTML iterates the same array and serialises the same style object via `styleToCss()` (camelCase → kebab-case). The only divergence-by-design is the preview wrapper's dashed border + bg-muted backdrop, which exist only in the preview path.

**Verify:**
- No section-specific styling lives outside `buildSectionStyle` in either path.
- `styleToCss` correctly handles all key cases used (`fontSize`, `fontWeight`, `transform`, `marginTop`, `position`, `whiteSpace`). `whiteSpace: 'pre-line'` is critical — the shop sample has `\n` and renders multi-line. Print HTML converts `\n` → `<br>` separately because data-URL CSS `pre-line` would also work but `<br>` is more portable; confirm both paths produce the same visual result.
- `marginTop: 0` override for the first section (`LabelSettingsTab.tsx:282–283`) matches the print HTML's `div:first-child { margin-top: 0 !important; }` (`LabelSettingsTab.tsx:178`).

### 6. Toggling `show_*` correctly disables the X/Y inputs but does NOT zero the offset
Section rows render X/Y `Input`s with `disabled={!visible}`. The offset values persist in state when toggled off, so toggling back on restores the previous nudge.

**Verify** there is no `useEffect` or onChange that resets offsets when a section toggles off — this would silently destroy work.

---

## Specific things to look for

### Defensive integer coercion of toggles
`show_*` columns are `INTEGER` in SQLite. UI emits `(v ? 1 : 0)` from `Switch.onCheckedChange`. After load, the value comes back as `number` (better-sqlite3 native). The `!!form[showKey]` check at `LabelSettingsTab.tsx:295` coerces back to boolean for the Switch. Verify the round-trip cleanly — no `'1'` (string) or `true` (boolean) ever sneaks into `form`.

### `parseFloat` vs `Number` inconsistency
`line_spacing` uses `parseFloat`; everything else uses `Number`. For decimal step inputs (X/Y offsets at `step={0.5}`) `Number` works (`Number('1.5')` = 1.5), but `Number('')` = 0 while `parseFloat('')` = NaN. Confirm that an empty offset input coercing to `0` is the intended behaviour (it is — `0` = no nudge, which is the default).

### Printer name persistence and the "default" sentinel
Empty `printer_name` = use OS default. The Select uses `'__default__'` as the option value (because Radix `Select` cannot accept `''` as a value). The `onValueChange` maps `__default__` → `''` before writing to state. Verify:
- The dropdown correctly shows the default item selected when `form.printer_name === ''`.
- Saving with the default selected persists `''` in DB, not `'__default__'`.
- Loading a row with `printer_name = ''` does not crash the Select (it shouldn't — `'__default__'` is the visible value, `''` is the underlying state).

### HTML escape coverage
`esc()` (`LabelSettingsTab.tsx:106`) handles `& < > " '`. Sample data today is static and contains none of these. When EditProduct content flows through this same path in a future PR, indication/note text may contain `&`, `<`, `>` from copy-paste — the escape must apply. Verify the escape is applied to BOTH the section body AND not, e.g., the printer name (which is unused in HTML — it's passed as `deviceName` to Electron, not interpolated).

### Style/Token compliance (CLAUDE.md)
- `bg-white text-black` literals in the preview wrapper (`LabelSettingsTab.tsx:271`) — comment explicitly notes the exemption for physical-paper preview. Confirm no other color literals.
- Test Print button uses `variant="elevated"` — but it's the SECONDARY action beside the save button. The lone CTA (save) on the printer card uses `default` (correct). The Test Print on the preview card is the lone CTA there — per CLAUDE.md, "*lone* button = primary → default". Flag whether it should be `default` instead of `elevated`.
- `LayoutList`, `Printer`, `Eye`, `Type`, `MoveVertical`, `Save` icons all exist in lucide-react.

### Toast call signature mismatch (potential bug)
`handleSave` uses `toast({ title, description, variant })` (object form). Older code in the same file used `toast(message, 'error')` (positional form). Check `src/components/ui/toast.tsx` for `useToast` signature — both forms may be supported (overload) or only one. If only object form is supported, all calls are fine. If only positional, every call here is broken.

### Form state typed as `LabelSettingsForm` but accessed with `as keyof LabelSettingsForm` casts
The section rows index into `form` via computed keys like `form[\`show_${def.key}\`]`. TS can't narrow a template literal index, so the code uses `as keyof LabelSettingsForm` casts. Verify those casts always reference real keys (typo-prone — `show_lot_expiry` etc.) by manually enumerating against `LABEL_DEFAULTS`.

---

## Regression scenarios to run

1. **Existing-DB migration**: open app on a DB that had a pre-existing `label_settings` row with `width_mm = 62, height_mm = 0`. New columns should populate with defaults; old columns retained. Inputs should show 62 / 0 (NOT the new 100 / 75 defaults — those apply only to fresh installs).
2. **Save → reload round-trip**: change every section's toggle + X/Y, save, reload app, confirm all 22 new values persist exactly.
3. **Validation**:
   - `height_mm = 0` + Test Print → toast "กรุณาตั้งขนาดกระดาษ", no print attempt.
   - `pad_top = -1` + Test Print → toast "ระยะขอบไม่ถูกต้อง".
4. **Silent print to PDF printer**: open the resulting PDF, measure with a PDF reader's ruler — paper dimensions, padding, section offsets must match preview at 1:1 mm scale.
5. **Thai font rendering**: confirm Thai glyphs in the printed output use the chosen `font_family` (not a fallback box-glyph) — this is the `document.fonts.ready` wait paying off.
6. **Stale printer name**: set `printer_name` to a deleted device, click Test Print → error toast with OS reason, UI stays interactive, no hidden BrowserWindow leaked (check `BrowserWindow.getAllWindows().length` in main-process console).
7. **Multiple rapid Test Prints**: spam-click the button → no race, no overlapping windows leaked. (Currently no in-flight guard exists — verify whether one is needed.)

---

## Out of scope (do NOT flag)

- POS / EditProduct workflow integration ("print label" after a sale, from product editor, etc.) — deferred to a later PR per the user.
- Replacing the ESC/POS receipt path with HTML print — receipts and labels have different requirements; the ESC/POS path stays.
- Real barcode rendering (currently a plaintext placeholder `8851234567890`) — deferred until a barcode library is added.
- Multi-language label content (TH/MM/ZH already exist in `product_labels` schema but template currently renders English sample) — out of scope; pull-from-product happens in the workflow-integration PR.
- Per-printer paper-size presets (Brother QL-820, etc.) — `paper_width × paper_height` are user-entered.
- Printer auto-detection or USB enumeration beyond what `getPrintersAsync` returns.

---

## Quick verification commands

```sh
# Renderer typecheck (must be clean)
./node_modules/.bin/tsc -p tsconfig.json --noEmit

# Electron main + preload typecheck (must be clean)
./node_modules/.bin/tsc -p tsconfig.node.json --noEmit

# Full production build (must succeed)
npm run build

# Inspect new schema columns at runtime (in DevTools console):
await window.api.settings.getLabelSettings()

# Inspect available printers (in DevTools console):
await window.api.printer.listPrinters()
```
