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
- **ELEVATED is now the DEFAULT for inputs — you get it for free.** `Input`/`Textarea`/`SelectTrigger` default to the house elevated look (`bg-card` + `border` + `shadow-sm`), so a bare `<Input>` is already correct — do NOT keep hand-adding `variant="elevated"` (it's a kept alias, identical to default). The old flat `bg-input`/`bg-muted` look is opt-in via `variant="filled"`, only where a recessed/inset field is deliberately wanted. **Button is unaffected** — its `default` is still the primary teal CTA, never elevated. Reference: `EditProduct/GeneralTab.tsx`. **Dialog footer buttons by role:** a *lone* button = primary → `default` (neutral/positive: ปิด/ตกลง/บันทึก) or `destructive` (negative); *two* buttons = primary + secondary `elevated` (ยกเลิก/กลับ). `elevated` is NEVER used as the only button — it's always the secondary beside a `default`/`destructive` primary (`destructive2` = secondary beside a destructive primary). → `docs/claude/ui-theming.md`
- **Never use Tailwind palette literals for colors** (`bg-blue-500`, `text-slate-600`, etc.). Use semantic tokens only (`bg-primary`, `text-foreground`, `bg-success-soft`, …). Missing role? Add a token to `:root` + `.dark` in `src/index.css`, register under `colors` in `tailwind.config.js`. → `docs/claude/ui-theming.md`
- **Tailwind v3 syntax for CSS vars: bracketed only.** ✅ `w-[var(--x)]` ❌ `w-(--x)` (v4 shorthand, silently dropped). Audit `src/components/ui/*` for this when touching primitives. → `docs/claude/ui-theming.md`
- **Never write raw HTML UI elements.** Always use `src/components/ui/` — `<Button>`, `<Input>`, `<Switch>`, `<Dialog>`, etc. Missing variant? Add it to the component file, don't work around with raw elements. → `docs/claude/ui-theming.md`
- **No local UI helper components in `src/pages/`.** If reusable, add to `src/components/ui/`. Available helpers: `SectionCard`, `FormField`, `NativeSelect`, `Toggle`. → `docs/claude/ui-theming.md`
- **Modal contract:** outside-click does NOT close (enforced in `dialog.tsx` — don't bypass), Esc closes, Enter triggers primary OK. Every `<DialogContent>` needs `<DialogHeader>`+`<DialogTitle>`+`<DialogBody>`+`<DialogFooter>`. → `docs/claude/ui-theming.md`
- **Dialog height is fixed — never auto/content-driven.** `<DialogContent>` must declare `h-[Npx]` or `max-h-[Xvh]`; `<DialogBody>` scrolls with `overflow-y-auto`. Exception: confirm/alert-only dialogs (no body, just message + buttons) may use `h-auto` with `max-h-[80vh]`. → `docs/claude/ui-theming.md`
- **Icon sizing inside `<Button>`: use `size-N`, never `h-N w-N`.** A `:not([class*='size-'])` rule in `button.tsx` silently snaps icons without `size-` to 16px. Applies to arbitrary values too (`size-[22px]`, not `h-[22px] w-[22px]`). → `docs/claude/ui-theming.md`
- **Text-size hierarchy by role:** title ≥ `text-base`, body/table/label/button = `text-sm`, helper/caption/badge = `text-xs`. Nothing smaller than `text-xs`. → `docs/claude/ui-theming.md`
- **Use the full color palette — don't default to primary/secondary/destructive everywhere.** Variants exist by role: `accent` (yellow), `primary-soft`, `info-soft`, `warm`, `success`, `outline`, `ghost`, `destructive2`, plus the rich `*-outline` family. (No `tertiary`/`brand-soft` — `tertiary`→`accent`, `brand-soft`→`primary-soft`.) → `docs/claude/ui-theming.md`
- **Scrollbars are THIN (6px) everywhere — one size, no exceptions.** The global `::-webkit-scrollbar` is 6px (`src/index.css`) and the `scrollbar-thin` utility matches it. Never define a different scrollbar width, a custom `::-webkit-scrollbar` size, or a thicker/thinner variant anywhere. → `docs/claude/ui-theming.md`
- **Table-card has 4 background zones** — only the column-header band is `bg-muted`; bottom status bar gets `border-t` only. List tables use elastic `min-w-`; spreadsheet grids use `table-fixed`+`w-[%]`. Row action buttons = square `size="icon-lg" variant="elevated"` (kebab "ตัวเลือก" + Popover menu; single action = direct elevated button) — neutral actions never role-tinted. **Exception:** delete + disable(Ban) actions use `elevated-destructive`, the paired enable(RotateCcw) uses `elevated-success`. → `docs/claude/ui-table-card.md`
- **EVERY bar = `h-12`, EVERY control inside = `h-9` — ONE rule, no exceptions.** Header/title bar, filter strip, status/total bar — all `h-12`; every button/Input/Select/Combobox/DateInput/Switch inside = `h-9`. Button = `size="lg"` (already `h-9`); icon-only = `size="lg" className="h-9 w-9 p-0"`. The old split (filter strip `h-14`/`h-10`) is DEAD. Primitives that still bake `h-10` (combobox, date-input, date-range-picker, switch frame, NativeSelect) must read `h-9`. → `docs/claude/ui-table-card.md`
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

- **Thai UI language throughout.** Primary fonts (HARD): **Inter** (Latin) + **IBM Plex Sans Thai** (Thai), Noto Sans Thai fallback — the SAME in light AND dark (`--font-latin`/`--font-thai` in both `:root` and `.dark`). Other bundled faces are picker options only, not the default. Base 15px.
- **Dark/light theme** via CSS variables (toggled via themeStore).
- **Frameless Electron window** — custom `TitleBar.tsx`, IPC via `window.api.window.*`.
- **Toast notifications** via `useToast()` hook.

## Hidden / parked features
- **Quotation (ใบเสนอราคา) — DELETED 2026-06-11.** The module was parked/hidden from 2026-06-02, then fully removed: pages `src/pages/Quotation/*`, IPC `electron/ipc/quotation.ts`, convert flow `src/lib/quotation/*`, print builder `src/lib/receipt/buildQuotationHtml.ts`, search dialog `QuotationProductSearchDialog.tsx`, the `quotations`/`quotation_items` schema tables + indexes + `converted_invoice_no` ALTER, the `window.api.quotation` namespace, `Quotation*` types, the POS "convert quotation → sale" flow (cartStore `sourceQuotation`, POS banner/markConverted), routes, and the Sidebar link. Table *definitions* were dropped from `schema.ts` (fresh DBs won't create them); no `DROP TABLE` migration was added, so any existing DB keeps its now-orphan tables harmlessly. **Reason:** sales-document work (quotation/invoice) is offloaded to **FlowAccount** (cloud accounting) via its Open API — the app keeps POS + cash bill + tax invoice + financial summaries only. The in-app Invoice subsystem (was Phase B/C) stays **cancelled**. FlowAccount integration is **not started** (no account yet). Full context: `.claude/memory/project_sales_documents.md`.

## Before a production build — remove DEV-only code
These exist for development convenience and MUST be stripped before compiling a real build:
- **Setup-wizard preview in `src/pages/Settings/ShopTab.tsx`** — the "ดูตัวอย่าง Setup (DEV)" button + the full-screen overlay block + the `SetupWizard` import (3 spots, each tagged `DEV ONLY`). The `dryRun` prop on `SetupWizard` itself can stay (defaults false, no prod effect).
- **Login-screen mockup preview in `src/pages/Settings/ShopTab.tsx`** — the "ดูตัวอย่าง Login (DEV)" button + the `previewLogin` overlay block + the `LoginScreen` import (3 spots, each tagged `DEV ONLY`). `LoginScreen.tsx` itself stays (becomes the real login in Phase 2); only the Settings preview wiring is DEV. The `preview` prop / `PREVIEW_USERS` / `PREVIEW_PASSWORD` mock inside `LoginScreen` are placeholders until Phase 2 wires `window.api.auth.*`.
- **Seed test data in `electron/db/seed.ts`** — the `PRODUCTS` + `CUSTOMERS` imports and their insert blocks (Hygeia exports, tagged "Temporary dev seed … remove before compiling a production build").

## Known harmless warnings
- `postcss.config.js` ESM warning
- DevTools Autofill errors (Chromium noise)
- VS 2026 missing C++ workload (cannot recompile native modules from source)

## น้ำเสียง (ใช้กับทุกข้อความที่สื่อสารกับผู้ใช้)

หนูเป็นน้องสาวตัวเล็ก ๆ พูดจาอ้อนหวาน นอบน้อม สุภาพ และใจเย็นเสมอค่ะ
- แทนตัวเองว่า **"หนู"** เสมอ และเรียกผู้ใช้อย่างให้เกียรติ ให้ผู้ใช้งานเป็นพี่ เสมอ
- ลงท้ายประโยคด้วย **"ค่ะ"** (บอกเล่า) หรือ **"คะ"** (คำถาม) ให้ถูกหลัก
- เป็นผู้หญิง พูดเพราะ อ่อนโยน ไม่ห้วน ไม่ใช้คำหยาบ
- ยังรายงานผลครบถ้วน ตรงไปตรงมา และแม่นยำตามหน้าที่ทุกอย่าง — แค่ห่อด้วยน้ำเสียงที่อ่อนหวาน
- ส่วนที่เป็นโครงสร้างทางเทคนิค (path, ชื่อ section, PASS/FAIL, โค้ด) คงรูปแบบเดิมไว้ให้ถูกต้องเสมอ
