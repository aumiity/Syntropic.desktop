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

- Variants on `<TabsList>`: `default` (gray bar with white active), `line` (underline-only), `pill` (transparent bar with colored primary active), `segmented` (Apple-style with equal-width tabs), `toggle` (connected segmented group, active presses in).
- **`toggle`**: connected segmented button group — a `bg-card` track framed with `ring-1 ring-inset ring-border` (NOT `border` — a real border is box-box and eats 1px top+bottom, shrinking the `h-full` triggers to 34px inside a 36px bar; ring costs zero layout height so triggers fill the full `h-9` 36px, matching standalone h-9 buttons), `rounded-lg` + `overflow-hidden`, with flush, equal-width (`flex-1`) triggers; only the outer ENDS are rounded (the list rounds + clips the square inner buttons), and a left border on each but the first (`border-0 border-l … first:border-l-0`) is the shared divider (a vertical border adds width, not height — safe). Triggers fill the row (`h-full`); the list height is baked at **`h-9`** inside the variant (via a `data-[variant=toggle]:group-data-[orientation=horizontal]/tabs:h-9` modifier — a plain `h-9` *className* is outranked by the base `…:h-8` modifier's specificity, so it must be set at the same modifier level). The active one presses IN (recessed `bg-muted` + `shadow-inner`, `transition-all` so the press fades). No sliding pill — the depress IS the active affordance. Use for a small set of mutually-exclusive choices wanting a tactile pressed-button feel (e.g. the label-language switch in LabelsTab).
- **`segmented`**: container is `bg-card rounded-xl p-1`, triggers use `inline-grid grid-flow-col auto-cols-fr` so they all match the width of the longest one. Active state is the sliding `bg-primary` pill (`shadow-sm`) via framer-motion. Default for the EditProduct page.
- Tab icons: just put a lucide `<Icon />` as the first child of `<TabsTrigger>` — auto-sized to `size-4` via the existing `[&_svg:not([class*='size-'])]:size-4` rule.

## Dialog

Structure and modal-interaction rules live with the rest of the theming HARD rules — see `ui-theming.md` rules 5 & 6.

## Typography & fonts

- **Font stack:** `var(--font-latin), var(--font-thai), sans-serif` — both swappable from the CSS font picker (`src/pages/CSS`).
  - **Primary default (HARD) — light AND dark:** Latin **Inter**, Thai **IBM Plex Sans Thai**. Both `:root` and `.dark` carry the same `--font-latin`/`--font-thai`; do NOT let dark drift to a different face (it used to be Google Sans / Sarabun — that's retired).
  - **Latin picker options:** Inter, Plus Jakarta Sans, FC Sara Samkan, FC Mission, Google Sans, Sarabun, IBM Plex Sans Thai, Noto Sans Thai, Noto Sans Thai Looped, Anuphan — picker choices only, not the default. The scoped Thai faces (IBM Plex / Noto, + Noto Looped) expose an UNSCOPED `'… Latin'` twin (e.g. `'Noto Sans Thai Looped Latin'`) for the Latin slot — same split as `'Sarabun Latin'` — so the Latin option renders the real face, not a fallback.
  - **Bundled Thai alternates:** IBM Plex Sans Thai, FC Sara Samkan, FC Mission, Sarabun, Anuphan, Noto Sans Thai (+ Looped). Every picker font carries both scripts EXCEPT Inter and Plus Jakarta Sans, which have no Thai glyphs.
  - **Picker layout:** the `/css` Fonts card renders ONE row per typeface (`FONT_ROWS`) so the Latin and Thai columns line up by font. A face that exists in only one script leaves the other column's slot empty; the special `thaiUnsupported` flag (Inter) instead renders a disabled `FontCard` with a `secondary` Badge ("ไม่รองรับภาษาไทย"). The base `html font-size` control lives in this same Fonts section header. Thai fonts are `unicode-range`-scoped to U+0E00–0E7F so digit-only runs render in the Latin font — which is why Sarabun-as-Latin needs the separate unscoped `'Sarabun Latin'` family.
  - **Printed documents default to Sarabun** (official ข.ย. forms).
- **Base size:** `html { font-size: 16px }` (effective UI base ~15px). **Do NOT use `tabular-nums`** (project decision).
- **Size hierarchy** is role-based — see `ui-theming.md` rule 9.

## Other conventions

- Thai UI language throughout (respect Thai-script line-height — stacked diacritics clip under tight line-heights)
- Dark/light theme via CSS variables (toggled via themeStore)
- Frameless Electron window — `frame: false` in `electron/main.ts`. Custom `TitleBar.tsx` uses `WebkitAppRegion: 'drag' | 'no-drag'` inline styles and IPC via `window.api.window.{minimize,maximize,close,isMaximized}`.
- Toast notifications via `useToast()` hook
- Pagination: `pagination.tsx`
