# Syntropic Desktop — Claude Context

## Project memory
@.claude/memory/MEMORY.md

Project knowledge lives in `.claude/memory/` (repo-tracked → travels with git to every machine: MacBook / PC / Mac mini). The line above imports the index into every session — normal `claude` AND Studio. **Write project/convention memory there** (relative path, never the per-machine OS auto-memory dir). Only personal cross-project prefs (Thai language, น้องสาว pronoun) stay in OS/global auto-memory.

## Project
Pharmacy POS desktop app. Electron 31 + React 18 + Vite 5 + TypeScript + better-sqlite3 + Tailwind + Zustand.
Rebuilt from a Laravel/Blade/MySQL PHP original at `D:\Syntropic.Project\Syntropic.php` (authoritative SQL: `syntropic_rx.sql`).

## Dev
```bash
npm run electron:dev
```
> **Do NOT run `npm install`** — it rebuilds native modules and breaks the better-sqlite3 prebuilt binary. To add a library: `npm install <pkg> --ignore-scripts` and verify `node_modules/better-sqlite3/build/Release/better_sqlite3.node` still exists. If `node_modules` is deleted, see PROGRESS.md for recovery steps.

---

## Architecture

| Layer | Location |
|-------|----------|
| Electron main | `electron/main.ts` |
| IPC handlers | `electron/ipc/*.ts` |
| Database | `electron/db/` (index.ts, schema.ts, seed.ts) |
| Preload bridge | `electron/preload.ts` → `window.api` |
| React pages | `src/pages/` |
| UI components | `src/components/ui/` |
| Types | `src/types/index.ts` |
| Stores | `src/stores/` (cartStore, themeStore) |

---

## Read on demand

Detailed docs live under `docs/claude/`. Open the matching file **before** working on the area:

| Working on… | Open |
|-------------|------|
| Schema, save/update handlers, payload allow-listing, lookup tables | `docs/claude/database.md` |
| FEFO, GR receive, lot edit, pricing, walk-in, void, codes, label, customer fields | `docs/claude/business-logic.md` |
| `window.api` namespaces & methods | `docs/claude/ipc-api.md` |
| Colors, semantic tokens, Button/Badge variants, Tailwind v3 trap, dialog/modal contract, text-size hierarchy | `docs/claude/ui-theming.md` |
| Table-card layout (4 zones, filter strip, row actions, sortable, sticky headers, column-width rules) | `docs/claude/ui-table-card.md` |
| Showcase rule, Card components, Tabs, Dialog, fonts, frameless window | `docs/claude/ui-components.md` |
| POS search modal focus/highlight rules, POS unit selection ordering | `docs/claude/pos.md` |

If a topic above matches your current edit, you must read that file first — the HARD invariants below are only the headline; the file has the why and the failure modes.

---

## HARD invariants — never break these

Each line is the headline of a rule with an incident behind it. The full context is in the linked file.

### Database & business logic
- **Allow-list every save payload — never spread `...form` blindly.** `products:update` builds dynamic SQL from `Object.keys(data)`; any non-column key throws `no such column: X` and aborts the whole UPDATE. → `docs/claude/database.md`
- **Walk-in customer = real C0000 row, never NULL `customer_id`.** Backend funnels through `walkInCustomerId(db)`; renderer keeps `null` as in-memory marker only. Don't fetch C0000 into the cart; don't write NULL to `sales.customer_id`. → `docs/claude/business-logic.md`
- **Base unit lives on `products.unit_id`.** `product_units` holds only non-base variants. No `is_base_unit` flag anywhere. POS synthesizes a base entry with `id: -1`; search modal emits `{product, unit: null}` first. → `docs/claude/business-logic.md`, `docs/claude/pos.md`
- **Front-end never coerces blank → 0 for stock/cost fields.** `parseFloat('') || 0` silently wipes data. Validate explicitly: blank/NaN/negative → toast + abort. → `docs/claude/business-logic.md`
- **`is_closed` on lots auto-toggles when qty crosses 0.** Otherwise FEFO/availability queries (which filter `is_closed=0`) silently lose the lot. → `docs/claude/business-logic.md`

### UI & theming
- **No emojis in program output.** Specifically: source code, UI strings/labels, and any visible runtime text. Use lucide-react icons for iconography and Badge variants + semantic color tokens for status indicators. OK to use emojis in plans, discussion, chat, and non-code comments (e.g. PR descriptions, planning docs) — the rule is about what ships to users, not how we talk about the work.
- **`/theme` is the source of truth.** Before adding/restyling UI, open `src/pages/Theme/index.tsx`, find the matching pattern, match it. Changing a primitive's default? Update its showcase demo in the same change. → `docs/claude/ui-components.md`
- **ELEVATED is the primary surface treatment for controls.** Every form/dialog/filter-strip Input, Textarea, Select uses `variant="elevated"` (`bg-card` + `border` + `shadow-sm`) — NOT the bare `bg-input` filled look. Reference: `EditProduct/GeneralTab.tsx` (every field is `elevated`), not the (stale) showcase Modal demo. **Dialog footer buttons by role:** a *lone* button = primary → `default` (neutral/positive: ปิด/ตกลง/บันทึก) or `destructive` (negative); *two* buttons = primary + secondary `elevated` (ยกเลิก/กลับ). `elevated` is NEVER used as the only button — it's always the secondary beside a `default`/`destructive` primary (`destructive2` = secondary beside a destructive primary). → `docs/claude/ui-theming.md`
- **Never use Tailwind palette literals for colors** (`bg-blue-500`, `text-slate-600`, etc.). Use semantic tokens only (`bg-primary`, `text-foreground`, `bg-success-soft`, …). Missing role? Add a token to `:root` + `.dark` in `src/index.css`, register under `colors` in `tailwind.config.js`. → `docs/claude/ui-theming.md`
- **Tailwind v3 syntax for CSS vars: bracketed only.** ✅ `w-[var(--x)]` ❌ `w-(--x)` (v4 shorthand, silently dropped). Audit `src/components/ui/*` for this when touching primitives. → `docs/claude/ui-theming.md`
- **Never write raw HTML UI elements.** Always use `src/components/ui/` — `<Button>`, `<Input>`, `<Switch>`, `<Dialog>`, etc. Missing variant? Add it to the component file, don't work around with raw elements. → `docs/claude/ui-theming.md`
- **No local UI helper components in `src/pages/`.** If reusable, add to `src/components/ui/`. Available helpers: `SectionCard`, `FormField`, `NativeSelect`, `Toggle`. → `docs/claude/ui-theming.md`
- **Modal contract:** outside-click does NOT close (enforced in `dialog.tsx` — don't bypass), Esc closes, Enter triggers primary OK. Every `<DialogContent>` needs `<DialogHeader>`+`<DialogTitle>`+`<DialogBody>`+`<DialogFooter>`. → `docs/claude/ui-theming.md`
- **Icon sizing inside `<Button>`: use `size-N`, never `h-N w-N`.** A `:not([class*='size-'])` rule in `button.tsx` silently snaps icons without `size-` to 16px. Applies to arbitrary values too (`size-[22px]`, not `h-[22px] w-[22px]`). → `docs/claude/ui-theming.md`
- **Text-size hierarchy by role:** title ≥ `text-base`, body/table/label/button = `text-sm`, helper/caption/badge = `text-xs`. Nothing smaller than `text-xs`. → `docs/claude/ui-theming.md`
- **Use the full color palette — don't default to primary/secondary/destructive everywhere.** Variants exist by role: `tertiary`, `brand-soft`, `info-soft`, `warm`, `success`, `outline`, `ghost`, `destructive2`. → `docs/claude/ui-theming.md`
- **Table-card has 4 background zones** — only the column-header band is `bg-muted`; bottom status bar gets `border-t` only. List tables use elastic `min-w-`; spreadsheet grids use `table-fixed`+`w-[%]`. Row action buttons = square `size="icon-lg"` with role-tinted variant. → `docs/claude/ui-table-card.md`
- **Filter strip = `h-14 px-2`, every control inside = `h-10`** (Input/SelectTrigger/Button need explicit `h-10`; DateInput/DateRangePicker/Combobox have it baked in — don't override with `h-9`, it desyncs the calendar button). → `docs/claude/ui-table-card.md`
- **Sortable tables: gate behind explicit mode toggle, drafts local, commit/cancel explicit, backend renumbers in one transaction.** Never leave a list permanently draggable; never persist on `onDragEnd`. → `docs/claude/ui-table-card.md`

### POS
- **Base unit always first** in cart unit dialog AND search modal. Synthesize from `product.unit_name` only — never from `item.unit_name` (that's the selected unit and would mislabel). → `docs/claude/pos.md`
- **POS search highlight is keyboard-owned.** `highlightIdx` resets only on `query` change; no mouse handlers may touch it (`scrollIntoView` causes spurious mouseenter that would reset the highlight). → `docs/claude/pos.md`
- **POS search input is always focused.** Global click listener refocuses on non-interactive clicks; `refocusSearch()` after cart unit/price changes. Respects open dialogs. → `docs/claude/pos.md`

---

## Studio dispatch

When a quest comes in, the main session is the orchestrator — dispatch sub-agents (from `.claude/agents/`) by complexity:

1. **Trivial** (≤5 lines, no schema/IPC/invariant impact — e.g. "change color X to Y", "fix typo")
   → spawn `assassin` only.

2. **Normal feature/fix** (default)
   → `wizard` → `blacksmith` → `priest` → `hunter` → `kafra`, in sequence. Feed each the previous agent's output. If the Priest returns NEEDS-FIX, loop back to `blacksmith` before continuing.

3. **Parallel work** (disjoint files, independent changes)
   → run multiple `blacksmith` agents in the background, then a single sequential `priest` → `hunter` → `kafra` over the combined diff.

When briefing a sub-agent, give it: the exact file paths, the specific `docs/claude/*.md` to load, and the expected output shape. Agents run in the repo cwd — never hand them absolute paths.

## Quick reference

- **Thai UI language throughout.** Inter + Sarabun fonts (Noto Sans Thai fallback); base 15px.
- **Dark/light theme** via CSS variables (toggled via themeStore).
- **Frameless Electron window** — custom `TitleBar.tsx`, IPC via `window.api.window.*`.
- **Toast notifications** via `useToast()` hook.

## Before a production build — remove DEV-only code
These exist for development convenience and MUST be stripped before compiling a real build:
- **Setup-wizard preview in `src/pages/Settings/ShopTab.tsx`** — the "ดูตัวอย่าง Setup (DEV)" button + the full-screen overlay block + the `SetupWizard` import (3 spots, each tagged `DEV ONLY`). The `dryRun` prop on `SetupWizard` itself can stay (defaults false, no prod effect).
- **Seed test data in `electron/db/seed.ts`** — the `PRODUCTS` + `CUSTOMERS` imports and their insert blocks (Hygeia exports, tagged "Temporary dev seed … remove before compiling a production build").

## Known harmless warnings
- `postcss.config.js` ESM warning
- DevTools Autofill errors (Chromium noise)
- VS 2026 missing C++ workload (cannot recompile native modules from source)
