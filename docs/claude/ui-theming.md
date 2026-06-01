# UI Theming

## Tailwind syntax trap (HARD)

Project is on **Tailwind v3.4.4**, not v4. Arbitrary values for CSS variables must use **bracketed syntax**:

- ✅ `w-[var(--radix-select-trigger-width)]`
- ❌ `w-(--radix-select-trigger-width)` ← v4 shorthand, **silently dropped** in v3 (no error, just no CSS emitted)

Same trap for `min-w-`, `max-w-`, `h-`, `min-h-`, `max-h-`, `bg-`, `text-`, `origin-`, etc. with CSS vars. shadcn CLI generated several primitives with v4 syntax — when touching `src/components/ui/*`, audit for this pattern. If a class "isn't doing anything", check whether it's v4 shorthand first.

## Dependency installation

`npm install` rebuilds native modules and breaks the `better-sqlite3` prebuilt binary. To add a library, use `npm install <pkg> --ignore-scripts` and verify `node_modules/better-sqlite3/build/Release/better_sqlite3.node` still exists. `framer-motion` was added this way for Tabs animation.

## Theming rules (HARD — do not break)

The app must be re-themable by editing one file (`src/index.css`). To keep that guarantee:

1. **Never use Tailwind palette literals for colors.** Forbidden: `bg-blue-500`, `text-slate-600`, `border-amber-200`, `from-red-50`, `hover:bg-emerald-100`, `ring-sky-400`, etc. Use semantic tokens only:
   - Brand: `bg-primary`, `bg-primary-soft`, `bg-primary-soft-hover`, `border-primary-soft-border`, `bg-primary-strong`, `text-primary-foreground`, `hover:bg-primary-hover`
   - Text: `text-foreground` (strong), `text-muted-foreground` (secondary), `text-foreground-subtle` (placeholder/disabled)
   - Surface: `bg-background`, `bg-card`, `bg-muted`, `bg-surface-hover`, `border-border`, `border-border-strong`
   - Status: `bg-success`/`bg-success-soft`/`text-success`, `bg-warning`/`bg-warning-soft`/`text-warning-strong`, `bg-destructive`/`bg-destructive-soft`/`text-destructive`
   - Sidebar: `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `text-sidebar-primary-foreground`
   - Opacity modifiers on semantic tokens are allowed: `bg-primary/30`, `border-warning/40`, `text-destructive/80`
2. **Need a token that doesn't exist? Add it.** Add the variable to BOTH `:root` and `.dark` in `src/index.css`, then register it under `colors` in `tailwind.config.js`. Token names describe the *role* (`--success`, `--primary-soft`) — never the shade (`--blue-500` is forbidden).
3. **No local UI components in page files (HARD).** Any JSX helper component defined at module scope inside `src/pages/` is forbidden — no exceptions. If it could be used in more than one place, add it to `src/components/ui/`. Available global helpers: `SectionCard` (card.tsx), `FormField` (label.tsx), `NativeSelect` (select.tsx), `Toggle` (switch.tsx). Before writing a new helper in a page file, check `src/components/ui/` first.
4. **Never write raw HTML UI elements.** Use `src/components/ui/` components exclusively:
   - `<button>` → `<Button variant="...">` — always, no exceptions
   - `<input>` → `<Input>`
   - `<select>` → use `Select` component or `<Input>` workaround
   - custom toggle div → `<Switch>`
   - raw dialog/modal → `<Dialog>` with `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogBody>`, `<DialogFooter>`
   - If a needed variant is missing, add it to the existing component file (e.g., new entry in `buttonVariants.variant`). Do not work around it with raw elements.
5. **Dialog structure is mandatory.** Every `<DialogContent>` must contain `<DialogHeader>` + `<DialogTitle>` (accessible title — Radix requirement), `<DialogBody>` (main content), `<DialogFooter>` (action buttons). Body layout inside `DialogBody` may use flex/grid as needed. Override default padding with `className` (twMerge handles conflicts).
6. **Modal interaction contract (HARD).** Applies to every modal — no exceptions.
   - **Outside-click does NOT close.** Already enforced inside `dialog.tsx` via `onPointerDownOutside`/`onInteractOutside` `preventDefault()`. Do NOT pass replacements that re-enable closing.
   - **Esc closes** (Radix default — leave on).
   - **Enter triggers the primary OK action** when the modal has one. For multi-step modals where Enter on a working input advances to the next step (e.g. POS return/adjust qty → "เพิ่มในรายการ"), that's fine; the final confirm still needs a click.
   - When adding a new modal, wire Enter on the primary input or via `onKeyDown` on the dialog body — call the same handler the OK button calls.
7. Tailwind utilities for layout/spacing/typography (`flex`, `gap-2`, `text-sm`, `rounded-xl`, `tabular-nums`) are encouraged — only **color literals** are banned.
8. **Icon sizing inside `<Button>` — use `size-N`, never `h-N w-N`.** `button.tsx` has `[&_svg:not([class*='size-'])]:size-4`, which silently snaps any descendant svg without `size-` in its className to 16px. `h-7 w-7` does not contain `size-`, so the rule still matches and — being more specific — overrides your value. Always write `<Icon className="size-7" />`, including arbitrary values (`size-[22px]`, not `h-[22px] w-[22px]`). Doesn't apply to icons in `<Input>`/`<Label>`/`<DialogTitle>`/plain `<div>`/raw `<button>` (not the Button component), or to the Button element's own outer dimensions.
9. **ขนาดตัวอักษร — ลำดับชั้นตามบทบาท (ไม่ใช่ห้าม `text-xs` อีกต่อไป).** ใช้ขนาดตามบทบาทของข้อความ ไม่ใช่ตาม "อันไหนดูดี":
   - **หัวข้อ / title → `text-base` ขึ้นไป** (`text-base`, `text-lg`, `text-xl`, …)
   - **เนื้อหาหลัก (body, ค่าในตาราง, label, ปุ่ม) → `text-sm`** — ขนาดมาตรฐานของเนื้อหา
   - **`text-xs` = ข้อความที่ *รองจากเนื้อหา*** — อนุญาตให้ใช้ได้กับ: คำอธิบายย่อย/helper text, caption, status bar แสดงสถานะ, meta/timestamp, chip & status ใน `<Badge>`. อย่าใช้ `text-xs` กับเนื้อหาหลักหรือหัวข้อ.
   - ห้ามใช้เล็กกว่า `text-xs` (เช่น `text-[10px]`, `text-[11px]`, `text-[13px]`) — `text-xs` คือเล็กสุด.

## ELEVATED — the primary surface treatment (HARD)

The house style for controls and panels is the elevated look: `bg-card` + `border border-border` + `shadow-sm`. It reads as a raised card sitting on the background.

**This is now the DEFAULT for inputs — `Input` / `Textarea` / `SelectTrigger` render elevated when you pass no variant.** The migration flipped each primitive's `default` code to the elevated styling and added a separate `variant="filled"` for the old flat `bg-input`/`bg-muted` look. So:
- A bare `<Input>` / `<Textarea>` / `<SelectTrigger>` (and `SearchInput`) is already correct — **do NOT hand-add `variant="elevated"`** any more (it's a kept alias, identical to default; redundant on new code, harmless on old).
- The bare flat look is the *exception*, opt in with `variant="filled"`, only where a recessed/inset field is deliberately wanted (e.g. dense inline-edit cells). When you spot a field that looks wrong after the flip (was intentionally flat), add `variant="filled"`.
- Why flip the `default` value instead of deleting the `"default"` token? Non-breaking: no call site hardcoded `variant="default"` on these three (all bare inputs just omit the variant), and `"default"`/`"elevated"` both still compile. See [[input-elevated-default-flip]].

Secondary action **Buttons** (the one paired *next to* a primary action, e.g. "ยกเลิก/กลับ" beside "บันทึก") still use `variant="elevated"` explicitly — Button was NOT part of the flip. See [[dialog-button-convention]]. **`elevated` is never used as the only button** — a lone footer button takes the primary role (`default` for neutral/close/OK, `destructive` for negative). Filter-strip controls are the `h-9` cluster (search + category select + filter/column popovers).

**The live reference is `src/pages/Products/EditProduct/GeneralTab.tsx`.**

**The one exception — Button `default`.** Button's `default` variant is the primary teal CTA (save / confirm / pay) and must stay that way. The default-flip above is about *inputs/surfaces*, not action buttons. Do NOT swap Button defaults to elevated.

> **Why not just make `elevated` the literal default value of the variant prop?** Considered and rejected: (1) Button's default can't move (it's the CTA). (2) Flipping Input/Select/Textarea defaults would silently restyle every existing call site that relies on `bg-input`, with no type-checker to catch regressions — you'd have to audit and re-tag every inset field by hand. The convention + showcase + copying from EditProduct is the lower-risk enforcement. If the codebase ever reaches ~95% elevated, revisit as a deliberate migration (rename `default`→`inset`/`filled`, flip the default value, sweep call sites).

## Color palette & variants — USE THE FULL RANGE (HARD)

We have a rich palette far beyond `primary` / `secondary` / `destructive`. **Don't default to those three everywhere — the app should feel colorful and varied.** Pick variants by *role*, not "what's the most neutral option."

### `<Button>` variants (`button.tsx`)

- `default` — primary teal · main CTA, save, confirm
- `secondary` — white/gray · cancel, dismiss
- `tertiary` — yellow `#F5C24A` · accent CTA, attention
- `brand-soft` — light teal soft · subtle brand emphasis (was `quaternary`)
- `info-soft` — light blue · info-style action, e.g. "ปรับสต็อก" (was `quinary`)
- `warm` — soft amber/yellow · warm secondary (was `senary`)
- `outline` — muted bg with border · neutral icon buttons · **the standard for row "แก้ไข" (edit) action buttons**
- `ghost` — transparent · tertiary minor actions
- `destructive` — solid red · delete, void
- `destructive2` — soft red tint · destructive secondary (the secondary slot next to a `destructive` primary)
- `success` — green · positive confirm (e.g. "เพิ่มสต็อก")
- `link` — text-only

> **No more ordinal names.** `quaternary/quinary/senary` were renamed by *role* → `brand-soft/info-soft/warm`. The Button `warning` variant was removed (unused); use `warm` for caution-ish CTAs or `Badge variant="warning"` for status. Token values are unchanged.

### `<Badge>` variants (`badge.tsx`)

Same names as Button, **plus** `warning` (status) and `danger` (solid destructive) — both Badge-only. Use for tags, statuses, FDA labels (`ข.ย.13`), tier markers.

### Semantic color tokens (`index.css` — defined in both `:root` and `.dark`)

- Brand: `primary`, `primary-soft`, `primary-soft-hover`, `primary-soft-border`, `primary-strong`, `primary-hover`, `primary-foreground`
- Accent (yellow): `tertiary`, `accent`, `accent-soft`
- Neutrals: `background`, `card`, `muted`, `muted-hover`, `popover`, `secondary`
- Decorative surfaces: `brand-soft` (light teal), `info-soft` (light blue), `warm` (warm amber) — each with `-foreground` / `-hover`
- Radius: `--radius-card` (→ `rounded-card`, the single source of truth for card/panel corners) and `--radius-control` (→ `rounded-control`, buttons/inputs). Change card roundness app-wide by editing `--radius-card` in `index.css` only.
- Status: `success`/`success-soft`, `warning`/`warning-soft`/`warning-strong`, `destructive`/`destructive-soft`/`destructive-strong`
- Text: `foreground`, `muted-foreground`, `foreground-subtle`
- Sidebar: `sidebar`, `sidebar-accent`, `sidebar-primary`, `sidebar-ring`

### When writing new UI — guidelines

1. **Differentiate actions by tint.** "Edit" `outline`, info/details icon `warm`, external-link icon `primary-soft`, "Adjust stock" `info-soft`, "Delete" `destructive`, primary save `default`, secondary toggle `tertiary`. See the row-action rule in `ui-table-card.md` for the canonical square icon-button pattern.
2. **Decorative chips/status badges** → reach for `tertiary`/`brand-soft`/`info-soft`/`warm` before falling back to `secondary` or grey.
3. **Section accents / soft backgrounds** → `bg-primary-soft`, `bg-info-soft`, `bg-warm` (NOT `bg-muted` for everything).
4. **Hover states** → use the matching `-hover` token (`primary-hover`, `brand-soft-hover`, etc.) — already wired into the Button variants.
5. **Missing role?** Add a new variant to `buttonVariants`/`badgeVariants` AND a matching token to `:root` + `.dark` in `index.css`. Never hardcode hex or Tailwind palette literals.

## Canonical primitive defaults

These are baked into the components — **no override needed**:

- **`Tabs`** — default variant = segmented (equal-width grid, sliding `primary` pill via `framer-motion` `layoutId` per-`TabsList` `useId()`). `pill` for sub-nav, `line` for tight underline. All variants use `primary` as the active color. Three variants only — `segmented` was renamed to `default`.
- **`Select`** — popper position with `sideOffset={6}`, chevron rotates 180° when open (via `group-data-[state=open]:rotate-180`), panel width = trigger width, items have inset highlight (panel `p-2`), check icon on the right when selected (`pr-9` on items).
- **`Table`** — `TableHead` is `sticky top-0 z-10 bg-muted text-foreground-subtle shadow-[0_1px_0_var(--border)]`. `TableRow` hover `bg-primary-soft/60`, selected `bg-primary-soft`. `TableCell` `py-1 px-2`. `<Table containerClassName="max-h-[NNNpx]">` makes the body scroll while the header stays.
- **`Dialog`** — `DialogTitle` `text-xl` aligned with the X close button (`min-h-8 flex items-center`). Footer buttons commonly `size="xl"`. **Button roles by footer shape:** a *lone* button = primary role → `default` for neutral/positive ("ปิด/ตกลง/บันทึก/รับทราบ"), `destructive` for negative; *two* buttons = primary (`default`/`destructive`) + a secondary `elevated` ("ยกเลิก/กลับ"). `elevated` is never the only button; `destructive2` is the secondary slot beside a `destructive` primary. `Switch` inside modals = `size="lg"`. → see [[dialog-button-convention]] in `docs/claude/ui-theming.md`.
- **`DateInput` / `DateRangePicker`** — `h-10` wrapper default, `bg-input rounded-lg`, calendar icon absolute on the right (`right-2.5`). **`className` targets the wrapper** (sizes the whole component); the inner Input/Button is `h-full w-full`. Don't pass `className="h-X"` to the Input — it'll desync the calendar button position.
- **Card radius** — every floating panel-card uses `rounded-card` (`--radius-card`, 1rem). Every control / control-panel (Button, Input, SelectContent, PopoverContent) uses `rounded-lg` / `rounded-control` (`--radius`, 0.5rem). Don't mix `rounded-xl` / `rounded-2xl` literals; reach for the tokens.
