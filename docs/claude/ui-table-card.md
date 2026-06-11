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
4. **Status / total bar** at the bottom of the card: `h-12 px-5 bg-card border-t border-border flex items-center justify-between` — **white WITH a top separator line**. Use this for "+ เพิ่มแถว / count / total" footers and pagination footers. NOT `bg-muted`. The `border-t border-border` is what visually divides it from the body — without it the strip disappears into the rows. This is the ONLY band that gets a border. **Bar = `h-12`; any button inside = `h-9` (Button `size="lg"`)** — same rule as the top header bar.

Rule of thumb: only the column-header band is muted. The bottom status bar gets a top border. Top/title bar gets NO border (the muted column-header below it does the separation work).

### Inner header bar (top strip)

`h-12 px-5 text-sm font-semibold text-muted-foreground flex items-center justify-between` — left = description/count, right = Add button. **The bar is `h-12`; any button inside is `h-9`** — use `<Button size="lg" className="px-2">` (lg = h-9 with proper text-sm). Do NOT hand-size with `h-9` className overrides on `size="sm"` (that gave us h-9 with small text).

**Leading icon (HARD):** a table-card header's `<TintIcon>` is always `tint="neutral"` + `bordered` (the elevated, colorless look) — NEVER a colored tint. Colored/role tints are for `SectionCard` headers only. Canonical: `Manage/Expenses.tsx` (รายการค่าใช้จ่าย header) and `Reports/NewDashboard.tsx` (สินค้าค้างสต็อก header).

### ONE bar height rule (HARD): EVERY bar = `h-12`, EVERY control inside = `h-9`

**There is no longer a separate "filter strip" height.** Whatever the bar holds — a title + count + Add button, OR a search field + a row of filters, OR a status/total footer — the bar is **`h-12`** and *every* control sitting in it is **`h-9`**. No exceptions, no `h-14`, no `h-10` in a bar. The old filter-strip split (`h-14` strip / `h-10` controls) is DEAD — do not reintroduce it.

Every control in a bar is `h-9`:

- Input (`className="h-9 pl-9 rounded-lg text-sm bg-input"`)
- Select / SelectTrigger (`h-9` — primitive default already)
- Combobox (`h-9`)
- DateInput / DateRangePicker (`h-9`)
- Toggle `framed` / `framed="input"` (`h-9`)
- NativeSelect (`h-9`)
- Button (`size="lg"` — already `h-9`; add only `px-2 shrink-0`, never an `h-` override)
- Icon-only button (`size="lg" className="h-9 w-9 p-0 shrink-0"` + a `title`)

**Primitive defaults must be `h-9`.** These primitives historically baked `h-10` for the old filter strip and must now read `h-9` so the rule holds without per-call overrides: `combobox.tsx`, `date-input.tsx` (incl. its inner calendar button so it doesn't desync), `date-range-picker.tsx`, `switch.tsx` (framed pills), `select.tsx` NativeSelect. After fixing the default, **never** pass an `h-` override to them in a bar.

Padding: bars use `px-5` (inner header / status bar) or `px-2` (filter strip with a leading search Input) — height is the invariant, horizontal padding follows the existing per-bar convention.

### Table area

`[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card` (the side borders match the card bg = 8px inset effect without padding)

### Column widths use `min-w-` NEVER `w-`/`table-fixed` (HARD) — for *display / list* tables

Every `<TableHead>` carries a `min-w-XX` (or `min-w-[NNNpx]`) and the `<Table>` has **no** `table-fixed`. This keeps columns elastic — they stretch to fill a wide screen and shrink on a narrow one, but never collapse below the minimum. `w-XX` + `table-fixed` pins columns to a hard pixel width and wastes space / clips on resize — do not use it. Canonical example: `Products/index.tsx` (`min-w-14`, `min-w-[280px]`, `min-w-28`, …). Applies to **every list/report/history table** in the app.

### EXCEPTION — spreadsheet-style data-entry grids use `table-fixed` + `w-[%]` (by design)

A grid whose cells are editable `<Input>`/`<DateInput>`/`<Button>` with keyboard cell navigation (Excel-like) is NOT a display table — elastic columns are the wrong UX there (numeric/date columns yank wide, slack lands on the wrong column, and `max-w-` on a `<th>/<td>` is silently ignored by every browser in both `table-auto` and `table-fixed`). For these grids: `<Table className="table-fixed …">` + each `<TableHead className="w-[N%]">` (percentages, not px → still fully responsive, scales with the window; the flexible column just gets the largest %). Clamp the *visible control* with `min-w-/max-w-` on the inner `<Input>` (works — it's not a table cell), e.g. `w-full min-w-16 max-w-20 mx-auto`. Canonical: the receive-items grid in `Purchase/index.tsx`. Do NOT "fix" these to elastic `min-w-` — that fight has been had; this is deliberate.

### Header sticky

`[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:text-foreground-subtle`

### Row hover

`hover:bg-primary-soft/60 transition-colors`

### Action buttons in rows = the square `elevated` icon button (HARD)

Use `<Button size="icon-lg" variant="elevated">` with a single lucide icon and **no width override** — a square, NOT a wide `w-16` rectangle and NOT `size="sm" variant="ghost"`. Always give it a `title` for the tooltip/aria. `elevated` is the variant for ALL row-action triggers — do not role-tint them (the old edit→outline / view→warm / open→primary-soft scheme is dead).

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
- **Drafts are local; commit/cancel is explicit (HARD).** Do NOT persist on each drop (`onDragEnd`) — that strands the user with no undo. On entering reorder mode, snapshot the current order into state. Drags only mutate local `rows`. Reorder mode shows two buttons: `ยกเลิก` (`variant="destructive2"`) restores the snapshot and exits with no IPC; `เสร็จสิ้น` (`variant="success"`) persists then reloads. Because the save fires from a button (not inside a drag), it reads fresh `rows` directly — no stale-closure ref needed.
- **Backend renumbers, never the client.** Persist via an IPC that takes the ordered id array and rewrites `sort_order = 1..n` in **one transaction** (`settings:reorderCategories`). The list query stays `ORDER BY sort_order, id` (no UNIQUE on `sort_order` — ties just break by `id`, which is why a manual integer field was a bad UX and got replaced by drag).
- Reorder only works where the table has a `sort_order` column. `product_categories` has one; `drug_types` does **not** (ordered by `id`) — adding it there needs a schema migration first.
