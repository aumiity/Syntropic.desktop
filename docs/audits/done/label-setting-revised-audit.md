# LabelSetting Revised Plan Audit

Source: revised Claude plan pasted in chat after `docs/audits/label-setting-audit.md`.

## Verdict

Substantially improved. The revised plan resolves the original high-severity DB/form key drift by making `width_mm`, `height_mm`, and `pad_*` canonical. It is implementable after a few corrections, mainly around the shared style helper and verification commands.

## Findings

### High - Shared style object is not valid for React `style`

The plan proposes:

```ts
function buildSectionStyle(def: SectionDef, form: any): Record<string, string> {
  return {
    'font-size': `${form[def.fontSizeKey]}pt`,
    'font-weight': ...,
    'transform': ...,
    'margin-top': ...,
  }
}
```

and says both JSX preview and print HTML consume that object. React inline styles require camelCase keys such as `fontSize`, `fontWeight`, and `marginTop`. Hyphenated CSS keys are for serialized HTML/CSS, not React's `style` prop, and will warn or fail type checking if tightened to `React.CSSProperties`.

Required fix: make the shared helper return a typed neutral model or React-style object:

```ts
function buildSectionStyle(def: SectionDef, form: LabelSettingsForm): React.CSSProperties {
  return {
    fontSize: `${form[def.fontSizeKey]}pt`,
    fontWeight: def.boldKey && form[def.boldKey] ? 'bold' : 'normal',
    transform: `translate(${form[`offset_x_${def.key}`]}mm, ${form[`offset_y_${def.key}`]}mm)`,
    marginTop: `${form.section_gap}pt`,
  }
}
```

Then serialize camelCase to kebab-case for print HTML, or use a separate `styleToCss()` helper. This preserves the single source of truth without breaking React.

### Medium - The sample `shop` string must not be copied as a multiline single-quoted string

The plan shows the `shop` sample split across lines inside single quotes. If implemented literally, TypeScript will not parse it. Use a template literal or an explicit `\n` escape:

```ts
sample: 'ร้านยา ซินโทรปิก เภสัช\n123/4 ถ.สุขุมวิท กรุงเทพ โทร. 02-xxx-xxxx'
```

### Medium - Verification command should be explicit for this repo

`package.json` has no `typecheck` script. `npm run build` runs `tsc -p tsconfig.node.json && vite build`, which type-checks Electron/config TS but does not clearly run full renderer type checking from `tsconfig.json`.

Recommended verification:

```sh
npx tsc -p tsconfig.json --noEmit
npm run build
```

If avoiding `npx`, use the local binary directly:

```sh
./node_modules/.bin/tsc -p tsconfig.json --noEmit
npm run build
```

### Low - Printer-list handler should prefer the IPC sender

The plan uses `BrowserWindow.getAllWindows()[0]` for `printer:listPrinters`. That will usually work, but it can pick the wrong window if hidden print windows exist or multiple windows are added later.

Lower-risk implementation:

```ts
ipcMain.handle('printer:listPrinters', async (event) => {
  return await event.sender.getPrintersAsync()
})
```

Keep `BrowserWindow` for the hidden print window in `printer:printLabel`.

### Low - Validation notes around cleared number inputs are slightly inaccurate

The plan says clearing padding can produce `NaN`. The current code often uses `Number(e.target.value)`, and `Number('')` becomes `0`. If the implementation wants empty numeric inputs to be invalid, use a parsing helper that treats `''` as `NaN` or temporarily stores input strings. Otherwise, update the verification wording to test a real invalid value such as `-1`.

### Low - PDF printer expectations are OS-dependent

The plan says macOS printer listing includes "Save as PDF". In practice, macOS "Save as PDF" is commonly part of the print dialog workflow, not necessarily a device returned by `getPrintersAsync`, and silent printing may not show the same dialog behavior across OSes. Keep PDF testing, but phrase it as "if available" and also verify with the system default or a physical/stub printer.

## Recommended Plan Edits

1. Change `buildSectionStyle` to return `React.CSSProperties` with camelCase keys, and add `styleToCss()` for print HTML serialization.
2. Make the multiline sample strings syntactically valid TypeScript.
3. Replace the typecheck instruction with `./node_modules/.bin/tsc -p tsconfig.json --noEmit` plus `npm run build`.
4. Use `event.sender.getPrintersAsync()` for listing printers.
5. Adjust validation/PDF verification wording so it reflects actual browser/Electron behavior.

## Conclusion

After the style-helper correction, this plan is good enough to implement. The canonical DB-key normalization directly addresses the previous audit's blocking issue, and the numeric `@page`/`pageSize` invariant is the right direction for label printing.
