# UI Components & Conventions

## Showcase is the source of truth (HARD)

`/theme` (`src/pages/Theme/index.tsx`) is the canonical reference for every UI primitive — Button, Badge, Input, Select, Switch, Tabs, Dialog, Table, Popover, Pagination, Calendar, DateInput, DateRangePicker, Cards (Section/Metric/Stat), Standard Table-Card Layout, Modal Layout. Before adding or restyling UI:

1. **Open `/theme` first.** Find the section that matches what you're building. Match it — that IS the design system. Don't reinvent.
2. **Changing a primitive's default? Update its showcase demo in the same change.** The showcase must always reflect current truth.
3. **Page-level overrides that fight defaults are smells.** If you keep writing `className="[&_th]:bg-muted ..."` for Tables, that styling belongs in `table.tsx` — push it to the primitive, remove the override. Many existing pages carry legacy overrides; clean opportunistically.
4. **No matching pattern in the showcase?** Either use the closest adjacent pattern (90% of cases) or add the new pattern to the showcase **first**, then propagate. No ad-hoc decorations / custom radii / one-off hover states in feature pages.

## Card components (`src/components/ui/card.tsx`)

- `SectionCard` — main grouping card for form sections. Props: `icon`, `title`, `tint`, `right` (action slot), `children`.
- `MetricCard` — fixed-height (`h-32`) card with label, big value (`text-3xl leading-none`), optional sub line. Icon is **absolute** top-right (`absolute top-4 right-4`), content has `pr-14` so text doesn't overlap. Three escape-hatch props for sub-element overrides: `labelClassName`, `valueClassName`, `subClassName` — merged via `cn()`, so `subClassName="text-success font-semibold"` cleanly overrides the default muted color. Use `valueClassName` if you need to break out of the tint's `valColor`.
- `StatCard` — like MetricCard but clickable filter shortcut. Renders a `<button>` with `ring-2 ring-{tint}` when `isActive`. Used in Products list for the 3 stock filter cards.

## Tabs (`src/components/ui/tabs.tsx`)

- Variants on `<TabsList>`: `default` (gray bar with white active), `line` (underline-only), `pill` (transparent bar with colored primary active), `segmented` (Apple-style with equal-width tabs).
- **`segmented`**: container is `bg-card rounded-xl p-1`, triggers use `inline-grid grid-flow-col auto-cols-fr` so they all match the width of the longest one. Active state is the sliding `bg-primary` pill (`shadow-sm`) via framer-motion. Default for the EditProduct page.
- Tab icons: just put a lucide `<Icon />` as the first child of `<TabsTrigger>` — auto-sized to `size-4` via the existing `[&_svg:not([class*='size-'])]:size-4` rule.

## Dialog

Structure and modal-interaction rules live with the rest of the theming HARD rules — see `ui-theming.md` rules 5 & 6.

## Typography & fonts

- **Font stack:** `var(--font-latin), var(--font-thai), sans-serif` — both swappable from the `/theme` page.
  - **Light default:** Latin **Inter**, Thai **IBM Plex Sans Thai**.
  - **Dark default:** Latin **Google Sans**, Thai **Sarabun**.
  - **Bundled Thai alternates:** IBM Plex Sans Thai (Looped), Sarabun, SF Thonburi, Bai Jamjuree, Anuphan, Noto Sans Thai (+ Looped). Thai fonts are `unicode-range`-scoped to U+0E00–0E7F so digit-only runs render in the Latin font.
  - **Printed documents default to Sarabun** (official ข.ย. forms).
- **Base size:** `html { font-size: 16px }` (effective UI base ~15px). **Do NOT use `tabular-nums`** (project decision).
- **Size hierarchy** is role-based — see `ui-theming.md` rule 9.

## Other conventions

- Thai UI language throughout (respect Thai-script line-height — stacked diacritics clip under tight line-heights)
- Dark/light theme via CSS variables (toggled via themeStore)
- Frameless Electron window — `frame: false` in `electron/main.ts`. Custom `TitleBar.tsx` uses `WebkitAppRegion: 'drag' | 'no-drag'` inline styles and IPC via `window.api.window.{minimize,maximize,close,isMaximized}`.
- Toast notifications via `useToast()` hook
- Pagination: `pagination.tsx`
