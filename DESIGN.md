# Design

> **Read this before designing anything in this repo.** This project is NOT a greenfield brand surface. It has a mature, locked design system enforced by `CLAUDE.md` HARD invariants, the `/theme` showcase page, and a semantic-token architecture. Your job is to work *inside* this system, not to introduce a new visual language. When a generic "best practice" in your skill rules conflicts with a House Invariant below, **the House Invariant wins** — surface the conflict, do not silently override.

---

## House Invariants — NON-NEGOTIABLE (read first)

These are copied from `CLAUDE.md` and `docs/claude/ui-*.md`. Each has an incident behind it.

1. **`/theme` (`src/pages/Theme/index.tsx`) is the source of truth.** Before adding or restyling UI, open it, find the matching pattern, match it. Changing a primitive's default means updating its showcase demo in the same change. No ad-hoc decorations, custom radii, or one-off hover states in feature pages.
2. **Semantic tokens ONLY — never Tailwind palette literals.** Forbidden: `bg-blue-500`, `text-slate-600`, `border-amber-200`, `from-red-50`, `ring-sky-400`, etc. Use role tokens: `bg-primary`, `text-foreground`, `bg-success-soft`, `text-destructive`, … Missing a role? Add the variable to BOTH `:root` and `.dark` in `src/index.css`, then register it under `colors` in `tailwind.config.js`. Token names describe the **role**, never the shade.
3. **Never write raw HTML UI elements.** Always use `src/components/ui/`: `<Button>`, `<Input>`, `<Textarea>`, `<Select>`, `<Switch>`, `<Dialog>`, `<Badge>`, `<Table>`, etc. Missing a variant? Add it to the component file — never work around with a raw `<button>`/`<input>`/`<div>` toggle.
4. **No local UI helper components inside `src/pages/`.** If reusable, it goes in `src/components/ui/`. Existing helpers: `SectionCard`, `FormField`, `NativeSelect`, `Toggle`.
5. **ELEVATED is the DEFAULT for inputs.** `Input` / `Textarea` / `SelectTrigger` already render the house elevated look (`bg-card` + `border` + `shadow-sm`) with no variant. Do NOT hand-add `variant="elevated"`. The flat look is opt-in via `variant="filled"`. **Button is the exception** — its `default` is the primary teal CTA and must stay that way.
6. **Dialog footer buttons by role.** A *lone* button = primary → `default` (neutral/positive: ปิด/ตกลง/บันทึก) or `destructive` (negative). *Two* buttons = primary + secondary `elevated` (ยกเลิก/กลับ). `elevated` is NEVER the only button. `destructive2` = secondary beside a destructive primary.
7. **Modal contract.** Outside-click does NOT close (enforced in `dialog.tsx` — do not bypass). Esc closes. Enter triggers the primary OK. Every `<DialogContent>` needs `<DialogHeader>` + `<DialogTitle>` + `<DialogBody>` + `<DialogFooter>`.
8. **Tailwind v3.4 syntax for CSS vars — bracketed only.** `w-[var(--x)]` ✅ — `w-(--x)` ❌ (v4 shorthand, silently dropped, no error).
9. **Icon sizing inside `<Button>`: use `size-N`, never `h-N w-N`** (a `:not([class*='size-'])` rule snaps non-`size-` icons to 16px). Applies to arbitrary values too: `size-[22px]`.
10. **Text-size hierarchy by role:** title ≥ `text-base`; body/table/label/button = `text-sm`; helper/caption/badge/meta = `text-xs`. **Nothing smaller than `text-xs`** (no `text-[10px]`/`[11px]`/`[13px]`).
11. **No emojis in shipped UI / source / runtime strings.** Use lucide-react icons for iconography and Badge variants + semantic tokens for status.
12. **Thai UI language throughout.** All visible strings are Thai. Respect Thai-script line-height (stacked diacritics clip under tight line-heights — `.truncate`/`line-clamp-*` carry `line-height: 1.65`).
13. **Use the FULL palette by role — don't default everything to primary/secondary/destructive.** Reach for `tertiary`, `brand-soft`, `info-soft`, `warm`, `success`, `outline`, `ghost`, `destructive2` where the role fits.

### Where your skill's generic rules need adjustment for this repo

- **"Cards are the lazy answer / nested cards are always wrong"** → does not apply here. This is a data-dense operator tool; the **table-card layout (4 background zones)** and `SectionCard`/`MetricCard`/`StatCard` are deliberate, canonical patterns. The POS redesign uses bordered cards on purpose. Match the existing card patterns; do not strip them.
- **"Use OKLCH / propose a new palette"** → do NOT. The palette is fixed in HSL tokens in `src/index.css` (light + dark). Identity preservation wins absolutely. Never introduce OKLCH values or new brand colors.
- **Motion libraries** → `framer-motion` is present (added via `npm install --ignore-scripts`; see CLAUDE.md — do NOT run a bare `npm install`, it breaks the better-sqlite3 native binary). `tailwindcss-animate` is available. Do not add gsap/lenis/anime.js without asking.
- **Aligned and welcome:** your bans on side-stripe borders, gradient text, decorative glassmorphism, hero-metric templates, uppercase eyebrows, em dashes, and marketing buzzwords all match this project. Keep enforcing those.

---

## Theme / Mood

Clinical-but-warm desktop operator tool. Near-white neutral surfaces, a deep **teal** brand, a **yellow** accent for attention/secondary CTAs, and iOS-style status colors. Full structural dark mode. Density is high (tables, lots, prices) but legibility is protected. Frameless Electron window with a custom `TitleBar`.

## Color Palette

Defined as HSL CSS variables in `src/index.css` (`:root` = light, `.dark` = dark), exposed to Tailwind via `tailwind.config.js` under `colors`. **Always reference the token, never the hex/HSL directly.**

### Brand & accent
- **Primary — teal** `--primary` `#0F5D56` (light) / `#2BA396` (dark). Tokens: `primary`, `primary-hover`, `primary-strong`, `primary-soft`, `primary-soft-hover`, `primary-soft-border`, `primary-foreground`. The main CTA, save/confirm/pay.
- **Accent — yellow** `--accent` `#F5C24A`. Used for the `tertiary` button and attention states.
- **Warm — cream/amber** `--warm` `#FCEFC8` (decorative warm surface, `warm-foreground` deep amber).

### Status (iOS-style)
- **Success — green** `--success` (`success`, `success-hover`, `success-soft`).
- **Warning — orange** `--warning` `#FF9500` (`warning`, `warning-hover`, `warning-strong`).
- **Destructive — red** `--destructive` (`destructive`, `destructive-hover`, `destructive-soft`, `destructive-strong`).
- **Info — blue** `--info` ≈ `#2563EB` (`info`, `info-soft`, `info-soft-foreground`, `info-soft-hover`).

### Decorative
- **Violet** (`violet`, `violet-soft`, `violet-strong`) and **Teal** (`teal`, `teal-soft`, `teal-strong`) — for charts, chips, tag differentiation.

### Surfaces & text
- Surfaces: `background`, `card`, `popover`, `muted`, `surface-hover`, `secondary`.
- Borders: `border`, `border-strong`; input fill: `input`; focus: `ring`.
- Text: `foreground` (strong), `muted-foreground` (secondary), `foreground-subtle` (placeholder/disabled).
- Sidebar (left nav) has its own scoped token set: `sidebar`, `sidebar-foreground`, `sidebar-border`, `sidebar-accent`, `sidebar-primary`, `sidebar-ring`.

Opacity modifiers on semantic tokens are allowed: `bg-primary/30`, `border-warning/40`, `text-destructive/80`.

## Typography

- **Font stack:** `var(--font-latin), var(--font-thai), sans-serif`, both swappable from the `/theme` page.
  - Light default: Latin **Inter**, Thai **IBM Plex Sans Thai**.
  - Dark default: Latin **Google Sans**, Thai **Sarabun**.
  - Bundled Thai alternates: IBM Plex Sans Thai (Looped), Sarabun, SF Thonburi, Bai Jamjuree, Anuphan, Noto Sans Thai (+ Looped). Thai fonts are `unicode-range`-scoped to U+0E00–0E7F so digit-only runs render in the Latin font.
  - **Printed documents default to Sarabun** (official ข.ย. forms).
- **Base size:** `html { font-size: 16px }` (effective UI base ~15px). `tabular-nums` on numeric/price/metric values.
- **Size hierarchy (HARD, role-based):** title ≥ `text-base`; body/table/label/button = `text-sm`; helper/caption/badge = `text-xs`; nothing smaller.

## Radii & Elevation

- `--radius-card` = `1rem` → `rounded-card` (every floating panel/card corner — single source of truth).
- `--radius-control` / `--radius` = `0.5rem` → `rounded-control` / `rounded-lg` (buttons, inputs, select panels, popovers).
- Do not use raw `rounded-xl`/`rounded-2xl` literals — reach for the tokens.
- `--shadow-card` → `shadow-card`; controls/inputs use `shadow-sm` as part of the elevated look.

## Components (`src/components/ui/`)

The primitive set (each demoed in `/theme`):
`avatar, badge, button, calendar, card (Section/Metric/Stat), checkbox, combobox, confirm-dialog, date-input, date-range-picker, dialog, input, label (FormField), pagination, period-picker, popover, price-input, select (NativeSelect), sortable, switch (Toggle), table, tabs, textarea, tint-icon, toast, tooltip, top-list-card, unit-picker-dialog`, plus `charts`.

### Button variants (`button.tsx`)
`default` (primary teal CTA) · `secondary` (white/gray, cancel) · `tertiary` (yellow accent CTA) · `brand-soft` (light teal) · `info-soft` (light blue, e.g. "ปรับสต็อก") · `warm` (soft amber) · `outline` (neutral; the standard for row "แก้ไข" icon buttons) · `ghost` · `destructive` · `destructive2` (soft red secondary) · `success` · `elevated` (secondary beside a primary; never lone) · `link`.

### Badge variants (`badge.tsx`)
Same names as Button, plus `warning` and `danger` (Badge-only). Used for tags, statuses, FDA labels (e.g. `ข.ย.13`), tier markers.

### Tabs (`tabs.tsx`)
`default` (segmented, equal-width grid with sliding primary pill via framer-motion) · `pill` (sub-nav) · `line` (tight underline). Active color is always `primary` (segmented active uses `tertiary`).

### Other canonical defaults
- **Table:** `TableHead` is `sticky top-0 z-10 bg-muted text-foreground-subtle`; row hover `bg-primary-soft/60`, selected `bg-primary-soft`; cells `py-1 px-2`. Use `containerClassName="max-h-[NNNpx]"` for scroll-body-with-sticky-header.
- **Dialog:** `DialogTitle` `text-xl`, footer buttons commonly `size="xl"`; in-modal `Switch` = `size="lg"`.
- **DateInput / DateRangePicker:** `h-10` wrapper; `className` targets the wrapper, not the inner input.
- **Cards:** `SectionCard` (form-section grouping, props `icon`/`title`/`tint`/`right`), `MetricCard` (`h-32`, big `text-3xl tabular-nums` value, absolute top-right icon), `StatCard` (clickable filter shortcut with active ring).

## Layout

- **App shell:** frameless Electron window, custom `TitleBar.tsx` (drag regions via `WebkitAppRegion`), left **sidebar** nav with its own token set.
- **Table-card layout (canonical for list pages):** 4 background zones — only the column-header band is `bg-muted`; the bottom status bar gets `border-t` only. Filter strip = `h-14 px-2`, every control inside = `h-10`. List tables use elastic `min-w-`; spreadsheet grids use `table-fixed` + `w-[%]`. Row action buttons are square `size="icon-lg"` with a role-tinted variant.
- **Sortable lists:** gate behind an explicit mode toggle; drafts local; commit/cancel explicit; backend renumbers in one transaction. Never leave a list permanently draggable; never persist on `onDragEnd`.
- **Print:** `@media print` hides `.no-print` chrome and expands `.print-area` to A4 landscape for official forms.

## Surfaces / key screens

`src/pages/`: **POS** (counter sales — keyboard/scanner-first, search modal with strict focus + keyboard-owned highlight invariants), **Products** (+ EditProduct/EditBundle tabbed editors — the live elevated-input reference is `Products/EditProduct/GeneralTab.tsx`), **Purchase / PurchaseIntake** (GR receiving, FEFO lots), **Manage**, **People** (customers), **Reports** (regulatory ข.ย. forms), **Quotation**, **Settings** (+ Setup wizard), **Theme** (the showcase / source of truth), **CSS**.

## Motion

- `framer-motion` (Tabs pill slide) and `tailwindcss-animate` are available; nothing else.
- Motion is task feedback, not spectacle. Ease-out curves, no bounce/elastic. Every animation needs a `prefers-reduced-motion: reduce` alternative.
- Do not animate layout properties unless genuinely needed.
