# Table-Card Layout

## Tables (`table.tsx`)

- **Sticky headers:** the `<Table>` wrapper renders `<div data-slot="table-container" className="… overflow-x-auto">`, which auto-promotes to a vertical scroll container too — meaning `sticky` on `<thead>` pins to *that* div, not the page-level scroll wrapper, so the header rides up with the rows. Fix: (a) on the parent, target the inner div via `[&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto` so it becomes the actual scroll element; (b) put `sticky top-0 z-10 bg-muted` on each `<th>` (NOT on `<thead>` — many renderers ignore sticky there). For a hairline that scrolls with the sticky cell, add `shadow-[0_1px_0_var(--border)]` per `<th>` (a plain `border-b` doesn't move with sticky and leaves a gap).

## Standard table-card layout (Products list, EditProduct tabs, etc.)

- Outer wrapper: `bg-card rounded-card shadow-card overflow-hidden` (`rounded-card` = the `--radius-card` token; never hardcode `rounded-2xl`/`rounded-xl` on cards)

### Background zones (HARD — don't mix up)

The card has four horizontal bands and the bg color is what tells them apart:

1. **Section header bar** (description/count + Add button row): `bg-card` — **white, NO border**. This is the "title strip" sitting above the column headers. It flows into the muted column-header row below — the muted band itself is the visual separator, so don't add `border-b`.
2. **Column header row** (`<thead>` with col names): `bg-muted text-foreground-subtle` — the **only** muted band. Sticky.
3. **Body rows** (`<tbody>`): `bg-card` (default) — **white**.
4. **Status / total bar** at the bottom of the card: `h-12 px-5 bg-card border-t border-border flex items-center justify-between` — **white WITH a top separator line**. Use this for "+ เพิ่มแถว / count / total" footers and pagination footers. NOT `bg-muted`. The `border-t border-border` is what visually divides it from the body — without it the strip disappears into the rows. This is the ONLY band that gets a border. **Bottom bar = `h-12`** — deliberately shorter than the `h-14` top bar (see the LOCKED table-card bar-height spec below); **every control inside = `h-8`** (page-size Select, pagination buttons).

Rule of thumb: only the column-header band is muted. The bottom status bar gets a top border. Top/title bar gets NO border (the muted column-header below it does the separation work).

### Inner header bar (top strip)

`h-14 px-4 flex items-center gap-3` — `px-4` (16px) matches the table's side inset so the filter controls line up with the column edges. Left = title (`h3 text-lg font-semibold` + a count `<Badge variant="outline">`), right = the filter-strip controls clustered via `ml-auto` on the first one (SearchInput → category Select → filter Popover → column Popover). **The top bar is `h-14`; every control inside is `h-8`** (`variant="elevated"`, icon-only = `h-8 w-8 p-0`). See the LOCKED bar-height spec below.

**Leading icon (IN TRANSITION 2026-07-24):** *when* a table-card header has a leading `<TintIcon>` it is always `tint="neutral"` + `bordered` (the elevated, colorless look) — NEVER a colored tint. Colored/role tints are for `SectionCard` headers only. **BUT whether the header carries a leading icon at all is being re-evaluated page-by-page:** the `/theme` "Standard Table-Card" mockup dropped its leading icon (title = `h3` + count `<Badge>` only), while existing pages still have one. Until the operator revisits each page, do NOT sweep either way — keep the neutral TintIcon on pages that have it, and don't re-add one to `/theme`. Canonical (still iconed): `Manage/Expenses.tsx` (รายการค่าใช้จ่าย header) and `Reports/NewDashboard.tsx` (สินค้าค้างสต็อก header).

### Standard table-card — bar heights are LOCKED (HARD, 2026-07-24)

The standard table-card has **two bars of intentionally DIFFERENT height** (operator decision 2026-07-24 — the asymmetry is on purpose; do NOT "fix" them to match):

- **Top bar** (title + filter strip): **`h-14 px-4`**. `px-4` = 16px, matching the table's `border-l-[16px]/r-[16px]` side inset so the filter controls align with the column edges.
- **Bottom bar** (status / total / pagination): **`h-12 px-5`** — deliberately shorter than the top bar. `bg-card border-t border-border`.
- **Every control inside EITHER bar = `h-8`**, all `variant="elevated"`. The **field** primitives (Input/Select/Combobox/DateInput/DateRangePicker/NativeSelect + the StatusFilter icon button) default to `h-8` (set 2026-07-24, see `.claude/memory/control_height_h9_revert.md`), so a bare field lands at `h-8`. **Icon buttons** in the bar (filter/column triggers) use `size="lg"` + `className="h-8 w-8 p-0"` — Button `lg` is `h-9`, so the `h-8` override is required to keep them matching the fields.

This supersedes the earlier "EVERY bar = `h-12` / EVERY control = `h-9`" single-rule *for the table-card*. That older unified rule — and its dead `h-14`-strip / `h-10`-control predecessor — is history; this `h-14` top bar is a fresh, deliberate value, not a revival of the old filter strip.

> **These heights are font-relative — do NOT convert them to fixed px.** `h-14`/`h-12`/`h-8` are Tailwind rem units, so they scale with the root font-size (`html { font-size: … }` in `src/index.css` — currently 18px, and the operator changes it up/down to taste until the real build). Bar and control grow together, so the bar/control ratio holds at *every* font size. The px figures you may see quoted in older notes ("`h-8` = 32px") are only true at a 16px root — they are illustrative, not the rule. **Never hardcode `h-[32px]`/`h-[48px]` (or any px) to "pin" a height back** — that one control would stop scaling and desync from everything around it. Always express bar/control sizing as rem tokens (`h-8`, `h-12`, `h-14`).

Field controls in a bar are `h-8` by default (set 2026-07-24, see `.claude/memory/control_height_h9_revert.md`); a bar's icon buttons pin `h-8` explicitly because Button keeps its own height ladder:

- Input / SearchInput (`h-8` — primitive default)
- Select / SelectTrigger / NativeSelect (`h-8`)
- Combobox (`h-8`)
- DateInput / DateRangePicker (`h-8`)
- Toggle `framed="input"` (`h-8`; the standard `framed` pill stays `h-12` — it's a full-bar pill, not a control-inside height)
- Icon button in a bar (filter/column trigger): `size="lg" className="h-8 w-8 p-0"` — Button `lg` = `h-9`, so the `h-8` override is what keeps it dense

**Field-primitive default height is `h-8`** across `input.tsx`, `select.tsx` (SelectTrigger + NativeSelect), `combobox.tsx`, `date-input.tsx` (incl. its inner calendar button), `date-range-picker.tsx`, and `status-filter.tsx`. **Button is separate — its ladder is `default` `h-8` / `lg` `h-9` / `xl` `h-10` (do NOT change `lg` to `h-8`).**

Padding: table-card top bar = `px-4` (matches the 16px table inset so controls align with columns), bottom status/total bar = `px-5`.

### Table area

**The inset border lives on the `<table>`, NOT on the wrapper (HARD, current since 2026-07-24 `c8f6189`):**

```
wrapper  …[&>[data-slot=table-container]]:overflow-auto
         …[&>[data-slot=table-container]]:scrollbar-thin
         …[&>[data-slot=table-container]]:[scrollbar-gutter:stable]
<Table>  className="border-l-[16px] border-r-[6px] border-card"
```

The side borders match the card bg = an inset without padding, so the muted column-header band never touches the card edge. **The scrollbar sits flush at the card's outer edge**, and the `6px` right border + the `10px` scrollbar lane add up to the same **16px** as the left. This is why `border-r` is `6` and not `16` — do NOT "correct" it to 16, that makes the right gap 26px whenever the scrollbar shows.

**`[scrollbar-gutter:stable]` on the scroll container is mandatory, not optional.** Without it the 10px lane only exists while the table actually overflows, so a short table silently drops to a 6px right inset against a 16px left one — visibly off-centre. The gutter reserves the lane in both states, so the geometry is identical whether the table scrolls or not.

> **Superseded rule — do not restore.** Until 2026-07-24 the border sat on the *wrapper* as `border-l-[16px] border-r-[16px] border-card`, which put the scrollbar 16px in from the card edge. That shape has the same defect mirrored: a classic scrollbar takes layout width, so as soon as the table scrolled the content box shrank 10px and the band landed 16px from the left but 26px from the right. The operator moved both POS and the `/theme` showcase off it in `c8f6189`; the remaining 23 pages were swept to match on 2026-08-10. An older note here claimed a flush-right scrollbar had been "tried and rejected" — that was reversed the same evening; ignore it.

### Column widths use `min-w-` NEVER `w-`/`table-fixed` (HARD) — for *display / list* tables

Every `<TableHead>` carries a `min-w-XX` (or `min-w-[NNNpx]`) and the `<Table>` has **no** `table-fixed`. This keeps columns elastic — they stretch to fill a wide screen and shrink on a narrow one, but never collapse below the minimum. `w-XX` + `table-fixed` pins columns to a hard pixel width and wastes space / clips on resize — do not use it. Canonical example: `Products/index.tsx` (`min-w-14`, `min-w-[280px]`, `min-w-28`, …). Applies to **every list/report/history table** in the app.

### EXCEPTION — spreadsheet-style data-entry grids use `table-fixed` + `w-[%]` (by design)

A grid whose cells are editable `<Input>`/`<DateInput>`/`<Button>` with keyboard cell navigation (Excel-like) is NOT a display table — elastic columns are the wrong UX there (numeric/date columns yank wide, slack lands on the wrong column, and `max-w-` on a `<th>/<td>` is silently ignored by every browser in both `table-auto` and `table-fixed`). For these grids: `<Table className="table-fixed …">` + each `<TableHead className="w-[N%]">` (percentages, not px → still fully responsive, scales with the window; the flexible column just gets the largest %). Clamp the *visible control* with `min-w-/max-w-` on the inner `<Input>` (works — it's not a table cell), e.g. `w-full min-w-16 max-w-20 mx-auto`. Canonical: the receive-items grid in `Purchase/index.tsx`. Do NOT "fix" these to elastic `min-w-` — that fight has been had; this is deliberate.

### Header sticky

`[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:text-foreground-subtle`

### Row hover

`hover:bg-primary-soft/60 transition-colors`

### Action buttons in rows = the square `elevated` icon button (HARD)

Use `<Button size="icon-lg" variant="elevated">` with a single lucide icon and **no width override** — a square, NOT a wide `w-16` rectangle and NOT `size="sm" variant="ghost"`. **Label it with the `tooltip` prop, NOT a raw `title`** — `<Button … tooltip="แก้ไข">` auto-wraps the styled `<Tooltip>` (instant 200ms, themed) AND sets `aria-label` from the string. The old native `title=` attribute (slow ~1s browser tooltip) is dead for icon buttons. `elevated` is the default variant for row-action triggers — do not role-tint the neutral ones (the old edit→outline / view→accent-soft / open→primary-soft scheme is dead).

**`tooltip` prop limits (HARD):** it only works on a *standalone* `<Button>`. Do **not** put `tooltip` on a Button that is the child of an `asChild` trigger (`<PopoverTrigger asChild>`, `DialogTrigger`, etc.) — the prop replaces the Button with a `<Tooltip>` wrapper, so the trigger would clone a Tooltip root instead of the button and break. Those (the filter "ตัวกรอง" / column "จัดการตาราง" / kebab "ตัวเลือก" triggers) keep their native `title`. Likewise a **disabled** button can't fire hover (`disabled:pointer-events-none`), so neither `tooltip` nor `title` shows — if a disabled button must explain itself, wrap a `<span>` in `<Tooltip>` manually (see `PrintTab` preset). Non-`<Button>` triggers (`<Badge>`/`<span>`, or rich multi-line content like the cost/profit cell) also stay as manual `<Tooltip>` wraps — `Badge` has no `forwardRef` so it can't be a direct `asChild` trigger.

**Exception — destructive & state-toggle row actions carry a role color.** A row's **delete** action (`Trash2`) and a row's **disable** action (`Ban` → "พักการใช้งาน") use `variant="elevated-destructive-soft"`. The paired **enable** action (`RotateCcw` → "เปิดใช้งาน") uses `variant="elevated-success-soft"`. Both stay in the `elevated-*` family: neutral elevated at rest, the role color (red / green) lands on hover + `aria-expanded` — the intent reads on interaction, not as constant noise. So a single enable/disable toggle button flips its variant with its direction: `variant={isDisabled ? 'elevated-success-soft' : 'elevated-destructive-soft'}`. Edit/view/open and every other neutral action stay `elevated`. Canonical: `Settings/UnitsTab.tsx` (delete), `Settings/CategoriesTab.tsx` / `DrugTypesTab.tsx` / `ExpenseCategoriesTab.tsx` (toggle), `Settings/LabelPresetTab.tsx` / `LabelLookupTab.tsx` (delete).

- **Standard:** a single `MoreHorizontal` ("ตัวเลือก") button that opens a `<Popover>` menu listing the row's actions. Menu items are plain `<button>`s (`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors`); a destructive item uses `text-destructive hover:bg-destructive/10` instead.
- **Single action:** skip the menu — use a direct `elevated` icon button (e.g. `Eye` for ดูรายละเอียด) whose `onClick` runs the action.

Canonical: the "ตัวเลือก" button in `Manage/Sales.tsx` (also `Manage/Purchases.tsx`, `Manage/NegativeStock.tsx`, `Manage/Expenses.tsx`). (Legacy `w-16` rectangles in `Products/index.tsx`, `EditProduct/LotsTab.tsx`, `EditProduct/HistoryTab.tsx` predate this rule — migrate to square `elevated` when you touch them.)

### Empty state

lucide icon (`size-10 opacity-30`) + Thai message, `py-16` padding inside a `<TableCell colSpan={N}>`

### Row status — Badge only, NEVER dim the row (HARD)

A disabled / inactive / paused row is signalled by its **status `<Badge>`** (e.g. `destructive-outline` "ปิดใช้งาน" beside `success-outline` "ใช้งาน") — and nothing else. Do **not** add `opacity-*`/dim to the `<TableRow>` or its cells: the Badge already carries the state, so dimming is redundant *and* it reduces the legibility of data that is still perfectly valid. Status is communicated through semantic tokens/Badges, not by fading the whole row. Canonical: the disable toggle + "ที่พักใช้งาน" filter in `Settings/CategoriesTab.tsx` / `ExpenseCategoriesTab.tsx` / `DrugTypesTab.tsx`.

## Scrollbar gutter trick

`[scrollbar-gutter:stable]` for tab/page scroll shifts: if you have a horizontally centered element (like a `w-fit` segmented Tabs) inside a vertically-scrollable container, switching content between short and tall tabs makes the scrollbar appear/disappear and shifts the centered element by ~12-15px. Apply `[scrollbar-gutter:stable]` (Tailwind arbitrary value) to the scroll container — reserves the gutter even when no scrollbar is needed.

## Sortable table (`src/components/ui/sortable.tsx`)

Drag-to-reorder for table-card lists, built on `framer-motion` `Reorder` (already a dependency — do not add a DnD lib). `<SortableTableBody values onReorder>` renders the `<tbody>`; `<SortableRow value className>` (optional `onDragEnd`) renders one `<tr>` whose **first cell is a grip handle** (`dragListener={false}` + `useDragControls` — only the handle starts a drag, so a stray row click never reorders). Caller owns the list state (`values`/`onReorder`).

- **Gate reordering behind an explicit mode toggle (HARD).** Never leave a list permanently draggable. Header strip gets a `จัดลำดับ` button (`variant="info-soft"`, disabled when `< 2` rows); while on, swap the normal `<TableBody>` for `<SortableTableBody>` and the row's action column for the grip column. Canonical: `Settings/CategoriesTab.tsx`.
- **Drafts are local; commit/cancel is explicit (HARD).** Do NOT persist on each drop (`onDragEnd`) — that strands the user with no undo. On entering reorder mode, snapshot the current order into state. Drags only mutate local `rows`. Reorder mode shows two buttons: `ยกเลิก` (`variant="elevated"`) restores the snapshot and exits with no IPC; `เสร็จสิ้น` (`variant="success"`) persists then reloads. Because the save fires from a button (not inside a drag), it reads fresh `rows` directly — no stale-closure ref needed.
- **Backend renumbers, never the client.** Persist via an IPC that takes the ordered id array and rewrites `sort_order = 1..n` in **one transaction** (`settings:reorderCategories`). The list query stays `ORDER BY sort_order, id` (no UNIQUE on `sort_order` — ties just break by `id`, which is why a manual integer field was a bad UX and got replaced by drag).
- Reorder only works where the table has a `sort_order` column. `product_categories` has one; `drug_types` does **not** (ordered by `id`) — adding it there needs a schema migration first.
