# Syntropic Desktop - Build Progress

## Status: ✅ Runnable — **Negative-stock sales + retroactive reconciliation shipped** (Session 2026-05-21b). `deductFefo()` already supported oversell (writes `sale_item_lots.lot_id=NULL` markers) — feature wraps that with detection on GR receive + a new `/manage/negative-stock` tab to reconcile (FEFO-deduct against current open lots) or dismiss (mark `is_cancelled=1`, audit row written). Sidebar gets a tiny warning dot on `/manage`; the page tab itself gets the same dot suffix. Two-pass audit (GPT + Gemini) — GPT caught the critical `stock_movements.product_id` omission, void-sale orphan markers, FEFO cancelled-lot exclusion, and float-qty epsilon — all folded into rev-2 plan before coding. Both auditors **PASS** post-impl. Earlier today: POS cart alert system + bundle expansion shipped. **Phase 5 / ขย.9** + Bundle (Phase 1 + 2 + 6 audit fixes + min-2 atomic) still standing. Type-clean across the board. **Negative-stock + POS alerts + bundle expand + Bundle min-2 + ขย.9 + Bundle base + Manage/Reports Phase 1–4 + h-10 sweep all NOT click-tested yet.**
## Last updated: 2026-05-30
## Run: `npm run electron:dev`

## ✅ DONE 2026-05-30: **POS quantity-multiplier system + sales-setting toggle** — 7-Eleven-style "พิมพ์จำนวนแล้วกด `*` ก่อนสแกน" (เช่น `5*` แล้วสแกน/เลือก → ได้ 5 ชิ้น). **Final convention = number-first THEN `*` as the commit key** (NOT `*N` prefix — operator corrected mid-build: "ปกติเขาใช้ 5 * [สแกน]"). All in `src/pages/POS/index.tsx`:
##   - `multiplier` state (armed qty, single-use). `handleMultiplierKey` intercepts `*` **only when the search box holds pure digits 1..999** → `setMultiplier(n)`, clears the box. Out of range (`0` / `>999`) or any non-digit content → `*` falls through as normal text (so product names containing `*` stay searchable, and over-999 just becomes a normal query — operator: "เกินก็ปล่อยเป็นข้อความ ไม่ต้องปัดลง"). **NO idle timer / compose buffer** — `*` is the explicit commit, so zero scanner-race. (Earlier `*N`-prefix + 400/500/700ms idle-auto-arm approaches were ALL scrapped — kept here as a note so nobody re-adds them.)
##   - `handleSelectItem` uses `qty = multiplier ?? 1`, `line_total = price*qty`; `cart.addItem` (cartStore) already merges same product+unit lines by ADDING qty. Armed badge `ตัวคูณ × N` (`primary-soft`) shows in the **search-modal** input row (placed AFTER the clear-query X, before the Esc button) + appended to the footer status — **NO badge/clear-X on the main POS search input** (operator wanted it modal-only + no double-X confusion).
##   - **multiplier resets on EVERY modal close** — centralized in `closeSearch()` (`...; setMultiplier(null)`), covering both product-select and Esc; `handleSelectItem` just calls `closeSearch()`. Global ESC handler routed through `closeSearch()` too.
##   - **Search modal no longer auto-closes when the query goes empty** (operator request) — `handleSearch` empty-branch only `setResults([])`, never `setSearchOpen(false)`. Modal closes solely via **Esc** or **selecting a product**; outside-click already no-close per dialog contract. Once opened it stays open.
##   - **Sales-setting toggle `qty_multiplier_enabled`** (INTEGER, DEFAULT 1 = on): added to `SalesSettings` type, `sales_settings` table (CREATE TABLE col + safe `ALTER TABLE ... ADD COLUMN` migration so existing DBs default-on), and `SalesTab.tsx` (new **"การขายหน้าร้าน (POS)"** SectionCard `tint="primary"` + `Toggle`, icon `Calculator`). POS reads `salesSettings?.qty_multiplier_enabled !== 0` → `multiplierEnabled` gate (null while loading = treated on). **IPC untouched** — `settings:saveSalesSettings` builds SQL from `Object.keys()`, new field flows through; **only `.ts` files edited** (vite-plugin-electron bundles from `electron/*.ts`, the committed `electron/**/*.js` are stale artifacts, NOT runtime). `tsc` clean both configs.
##   - **NOT formally click-tested** — built live this session, operator iterated on the UX (badge placement, no-close-on-empty, the `5*` convention, `*`-in-names, >999 passthrough) but no full checklist run. Plan file: `C:\Users\ANYA\.claude\plans\src-pages-pos-index-tsx-linear-finch.md` (note: plan documents the SCRAPPED `*N` design — code is the source of truth, not the plan).
##
## 📋 BACKLOG 2026-05-30 (operator noted before sleep — "เหลืองานอีกหลายระบบ"; next systems to build, NOT started, priority order NOT fixed):
##   - **ระบบ VAT** — proper VAT calc + display + reporting. Schema groundwork already exists but unused: `sales.total_vat`, `sale_items.unit_vat`, `products.has_vat`.
##   - **พิมพ์สลิป/บิลการขาย** — receipt printing in two forms: full **ใบกำกับภาษี** (tax invoice) + short **สลิปเงินสด** (cash slip). Printer infra partially exists (`window.api.printer.*`, label-printing path).
##   - **ฉลากยา UX/UI ยังไม่ถูกใจ** — drug-label UI still unsatisfactory even after the recent LabelSettingsTab redesign. Collect specifics from operator before reworking.
##   - **ระบบ Finance** — record OTHER shop expenses beyond drug purchases (rent, utilities, etc.). `/reports/finance` currently shows aggregates only; this is expense *entry/bookkeeping*.
##   - **ระบบออกใบเสนอราคา** — quotation generation/printing.
##   - **Dashboard rebuild** — `/reports/dashboard` functions but operator NOT satisfied with UX/design (already PARKED per 2026-05-29 block L9). Full rework still pending; collect what's off first.

## ✅ DONE 2026-05-29: **EditBundle + HistoryTab click-tests PASS + elevated-UI rollout committed** — operator click-tested and confirmed working: (1) **EditBundle all 6 flows** (open existing → all sections + price-history dialog; edit → save → toast → re-fetch; edit → ย้อนกลับ → leave-confirm both branches; new bundle → blank form, default unit ชุด, add ≥2 → atomic create; required ชื่อชุดสินค้า blank → toast + scroll + aria-invalid; price-history dialog disabled when isNew); (2) **HistoryTab pagination** on BOTH EditProduct + EditBundle (pageSize/page/date-filter/type-filter/sort all reload server-side, total recomputes, page resets — the silent-truncation bug fix verified). No issues reported. **EditBundle parity sweep + HistoryTab pagination are now CLOSED.**
##   - **4 commits that landed after 2026-05-28b but were never logged here are now in main:** `5b30b80` elevated UI rollout (TintIcon component + bordered cards + elevated controls), `1916ca0` dialog conventions (divided strips + elevated cancel buttons), `c0339e8` rework EditProduct layout + extract shared delta helper, `3fbd68f` merge PriceTab into GeneralTab + price-history dialog, `3acda9b` POS bordered cards + cart slot redesign + customer dialog polish, `9639a56` POS right-column visible borders. The dirty-tree items flagged in the 2026-05-28b ⚠️ block (card.tsx / POS / Purchase / Reports / Theme / src/lib/delta.ts) all committed via these — working tree now clean.
##   - **Dashboard ใหม่ (`/reports/dashboard`) — click-tested, FUNCTIONS OK but operator NOT satisfied with the UX/design. PARKED for a later revision pass — do not treat as closed.** Operator: "ทำแล้ว แต่ยังไม่ถูกใจ ทิ้งไว้แบบนั้นก่อน ค่อยแก้ไขทีหลัง". No specifics captured yet — collect what's off before reworking.
##   - **Click-tested PASS this round (operator confirmed, no issues):** negative-stock sales + retroactive reconciliation (full checklist — oversell marker, reconcile, dismiss, bundle case, partial, float qty, void-before-reconcile), POS cart alerts + bundle expansion, Bundle atomic create + min-2 guard. These are now CLOSED.
##   - **Remaining click-test queue:** ขย.9 (`/reports/fda`) is the only item left. See ⚠️ Next session item 4. (Items 7–8 are forward feature work / DEV-toggle cleanup, not click-tests.)

## ✅ DONE 2026-05-28b: **EditBundle tab-by-tab parity sweep (Tab 2 + HistoryTab port + tsc cleanup)** — Tab 2 (ComponentsTab) audited against the table-card 5-criteria checklist and brought into line; pre-existing tsc blockers from the prior session's pause fixed; EditBundle/HistoryTab ported from its broken chip-filter layout to the canonical Popover+Checkbox pattern so it now mirrors EditProduct/HistoryTab; index.tsx code smell cleaned. tsc clean both configs. **NOT click-tested yet.** Detail below.
##   - **Pre-existing tsc blockers fixed (left over from 2026-05-28 pause):**
##     - `src/components/ui/tabs.tsx` — `TabsListCtx.Provider` was being handed `variant` (type `TabsListVariant | null | undefined` via VariantProps) but context demands non-nullable. Added a `safeVariant = variant ?? "default"` coerce; context now receives the narrowed type, `data-variant` attribute and CVA call still tolerate the original. Pure type-only fix.
##     - `src/pages/Products/EditBundle/HistoryTab.tsx` — chip-button filter rendered `<Button variant={meta.variant}>` where `meta.variant` is Badge-only (`success-outline` / `destructive-outline` / …). Button variant union doesn't include these → TS2322. Folded into the HistoryTab Popover port below (chips deleted entirely).
##   - **`EditBundle/HistoryTab` ported to canonical Popover+Checkbox filter pattern (parity with EditProduct/HistoryTab):**
##     - Module-level `BUNDLE_MOVE_TYPES = ['sale', 'sale_return']` and `MOVEMENT_FILTER_GROUPS` (label-deduped, same shape as EditProduct's) replace the in-component constant.
##     - Initial `movementTypeFilter` flipped from empty-set ("show all by default" via implicit logic) to **full set of `BUNDLE_MOVE_TYPES`** — whitelist semantics now match EditProduct exactly (full = show all, narrower = filtered, empty = show none, with empty-set short-circuit in `loadMovements` skipping the IPC).
##     - `loadMovements` sends `movement_types` only when narrowing (`size < BUNDLE_MOVE_TYPES.length`); full whitelist = no `movement_types` param.
##     - Header strip rewritten to mirror EditProduct: `px-4 h-14` with icon+title+count Badge cluster on the left, `DateRangePicker variant="elevated"` + `ล้างวันที่` ghost button + Filter Popover trigger + Refresh icon-button on the right. **Filter chips deleted** — type narrowing now lives entirely in the Popover.
##     - Filter Popover trigger: `<Button size="lg" variant="elevated" h-9 w-9 p-0 relative>` with Lucide `Filter` icon; counter dot (`text-xs`, NOT `text-[10px]` — keeps to the "nothing smaller than text-xs" rule per CLAUDE.md, minor divergence from EditProduct/HistoryTab which uses `text-[10px]` — flagged for separate cleanup pass).
##     - PopoverContent: w-56, PopoverHeader with title + `ทั้งหมด`/`ล้างทั้งหมด` toggle button (`variant="elevated" size="xs"`), then `MOVEMENT_FILTER_GROUPS.map` to checkbox rows. Identical interaction model to EditProduct.
##     - RotateCcw refresh button moved **from the bottom status bar into the header strip** (parity); bottom bar now follows the canonical `จำนวนแถว / Select / range / Pagination` layout with no embedded refresh.
##     - Empty-state subtitle flipped from `movementTypeFilter.size > 0` (legacy empty-default semantics) to `movementTypeFilter.size < BUNDLE_MOVE_TYPES.length` (whitelist semantics).
##     - Table inset border bumped `border-l-8 border-r-8` → `border-l-[16px] border-r-[16px]` matching the EditProduct/LabelsTab/HistoryTab pattern.
##   - **`ComponentsTab` 5-criteria audit + fixes applied:**
##     - (Criterion 1 — 4-zone table-card layout) Top strip padding `px-1.5` → `px-2` to match the `h-14 px-2` filter-strip standard; controls inside bumped `h-9` → `h-10` (Search Input + Save Button) — Save Button also `px-3` → `px-2` to align with the canonical `size="lg" h-10 px-2` button width. Table inset `border-l-8 border-r-8` → `border-l-[16px] border-r-[16px]` (parity).
##     - (Criterion 2 — soft+outline badges) N/A; ComponentsTab table rows carry no Badges.
##     - (Criterion 3 — row action buttons) Delete button kept `size="icon-lg"` (already square) but variant `destructive` → `destructive2` to match the LabelsTab convention (the spec doc says destructive, but PROGRESS.md L23 explicitly notes destructive2 is the established convention here; existing convention wins).
##     - (Criterion 4 — text-size) Clean; all body cells `text-sm`, "หมด" search-result badge `text-xs` (the floor, allowed); code line `text-xs` (allowed). No `text-[10px]` or smaller anywhere.
##     - (Criterion 5 — Modal contract) Search Dialog uses the shared `Dialog` component (outside-click=no-close enforced by `dialog.tsx`; Esc closes via custom button + onClose; Enter triggers `addComponent` via `handleModalKeyDown`). `DialogTitle` is `sr-only` because the search modal owns its own visible header — acceptable for the POS-search pattern. No changes needed.
##   - **`EditBundle/index.tsx` cleanup:** `refreshProduct` previously did `setForm((f: any) => ({ ...f, /* keep edits */ }))` — a no-op spread the operator flagged as code smell. Removed; comment rewritten to explain why `setForm` isn't needed (cost_price is read from `product.cost_price` directly, never managed in `form`).
##   - **What's NOT done (carry-forward — same items as the 2026-05-28 PAUSED list, minus the now-resolved code items):** click-test EditBundle (all 6 flows), click-test EditProduct sanity, click-test HistoryTab (both pages — verify pagination + filter Popover + sort reload + "ทั้งหมด" pageSize unbounded). All of these blocked on operator hands-on; tsc + type-system audits all pass.
##
## ⚠️ Uncommitted working-tree state on session start 2026-05-28b (separate from EditBundle parity work — likely from an in-flight Dashboard/MetricCard delta refactor that wasn't logged): `M src/components/ui/card.tsx`, `M src/pages/POS/index.tsx`, `M src/pages/Purchase/index.tsx`, `M src/pages/Reports/Dashboard.tsx`, `M src/pages/Reports/Finance.tsx`, `M src/pages/Reports/index.tsx`, `M src/pages/Theme/index.tsx`, untracked `src/lib/delta.ts` (new helper exporting a `delta(curr, prev)` → `{ sub, cls, icon }` for MetricCard.sub lines with TrendingUp/Down icons). These changes were NOT touched in 2026-05-28b — surface to the operator when resuming so they can decide commit / continue / drop.

## 🚧 PAUSED 2026-05-28 (operator went to sleep mid-EditBundle refactor): **Align EditBundle UX to match EditProduct.** Operator asked for tab-by-tab parity. **Tab 1 (General + Price merge) was DONE; Tab 2 (ComponentsTab) + HistoryTab port + tsc cleanup completed in session 2026-05-28b above.** Original session block kept below for context. NOT click-tested. tsc not run yet — verify before resuming.
##   - **What's done this session (lots of small changes, plus 3 chunky ones — chunky listed last):**
##     - `EditProduct/GeneralTab`: moved **สถานะ** section to top of right column (above บาร์โค้ด).
##     - `Layout.tsx`: every page except POS (`path !== '/'`) now wrapped in `max-w-7xl mx-auto w-full` (1280px content cap). POS keeps full width (its own grid layout).
##     - `EditProduct/LotsTab`: (a) sort added for **Lot No. / วันหมดอายุ / ราคาทุน / สถานะ**, default = `expiry_date desc` + filter `active` (operator: "วันหมดอายุไกลที่สุดขึ้นก่อนสิ" — most-recently-received first); (b) filter popover (สถานะ): ทั้งหมด / ใช้งาน / **ปิด** (รวม `qty=0 && !is_closed` "หมด" เข้าไป — semantic เดียวกัน, only differs as legacy edge case) / ยกเลิก, default = active; (c) **วันหมดอายุ column** = Badge with icon: `Clock` + `success-outline` (≥90 days), `ClockFading` + `warning-outline` (<90d), `ClockAlert` + `destructive-outline` (expired). Removed "หมดอายุแล้ว (date)" text — color+icon carry status; (d) สถานะ "ปิด" Badge = `muted-outline` (was `destructive-outline` — closed isn't a problem, just lifecycle); (e) แก้ไข button = `variant="elevated"`.
##     - `EditProduct/LabelsTab`: **เพิ่มฉลาก** button = `variant="elevated"`.
##     - `EditProduct/shared.ts` MOVEMENT_META: **all variants → soft+outline** (`success-outline` / `destructive-outline` / `info-outline` / `warning-outline` / `violet-outline` / `muted-outline`); `purchase_return` re-tinted `muted-outline` (admin cancel, not loss); `expired` + `near_expiry` collapsed to single label **"หมดอายุ"** with same variant/icon (`ClockAlert`/`destructive-outline`) — DB still writes both types distinctly (audit cares), UI merges them.
##     - `EditProduct/HistoryTab` + `EditBundle/HistoryTab`: filter popover dedupes by label (merged "หมดอายุ" appears once, toggles both `expired` + `near_expiry` together); counter badge counts groups not raw types.
##     - **CHUNKY 1 — Server-side pagination for product history (HistoryTab fully rewritten in BOTH EditProduct and EditBundle).** Backend `electron/ipc/products.ts:products:stockMovements` now accepts `page / pageSize / sort_dir` (drops `limit`), returns `{ rows, total }` with COUNT(*) under active filters; date/movement_types filters were already server-side, now actually reachable. The old "load 500 rows then filter client-side" pattern was silently breaking: date pickers filtered only the loaded 500, so digging into older periods returned phantom-empty results. Frontend now reloads on every filter/page/pageSize/sort change; Pagination component in footer (50/100/250/500/ทั้งหมด). `pageSize <= 0` (sent for "ทั้งหมด") = no LIMIT clause. Bundle branch (UNION ALL from sale_items) wraps its inner SELECT for the COUNT. **Preload `electron/preload.ts` + `electron/preload.d.ts` signatures updated** — vite-plugin-electron rebuilds the TS at dev, so the stale `.js` mirrors in `electron/` directory are not used. Operator's reaction: "มันเป็นแบบนี้มาได้ไงตั้งนาน ไม่เคยเช็คเลย".
##     - **Survey of other pages for the same silent-truncation bug** (operator-requested): only HistoryTab was broken. Reports/Sales|Purchases|Finance return aggregates (1 row/day), Reports/Dashboard uses `limit:10/30` deliberately (Top-N lists), Reports/KhorYor9 is print-only with month-default scope. `Manage/LowStock` loads the full low-stock universe — acceptable for now, flagged as future concern. `Manage/NegativeStock` = a queue (process should keep small). **No other fix needed.**
##     - **CHUNKY 2 — Merge Price tab into General tab on EditProduct (option D — operator's pick: history stays accessible but as on-demand dialog, not inline).** `EditProduct/PriceTab.tsx` was rewritten to export **two components instead of a Tab**: `PriceSection` (the SectionCards: ราคาขายปลีก & ต้นทุน + ราคาขายส่ง, with profit boxes) and `PriceHistoryDialog` (the history table wrapped in a Dialog, lazy-loaded on `open=true` only — no IPC on every keystroke). Dialog uses the SectionCard `right` prop for the "ประวัติ" trigger button (`variant="elevated"`). `EditProduct/GeneralTab.tsx` now receives `avgCost / baseUnit / reloadToken` props, renders `<PriceSection>` in the left column after ข้อมูลพื้นฐาน, and renders `<PriceHistoryDialog>` at the bottom (state-controlled via local `priceHistoryOpen`). `EditProduct/index.tsx` dropped: the `price` `TabsTrigger`, the `tab === 'price'` save-button gate (now `tab === 'general'` only), the per-field-tab-switch logic in validate→scrollIntoView (everything required is on General now). Required-field validation + scroll-to-field still works; clicking "ประวัติ" on a fresh `isNew=true` product shows the button as disabled with tooltip "บันทึกสินค้าก่อนเพื่อดูประวัติราคา".
##     - **CHUNKY 3 — Same merge applied to EditBundle (Tab 1 of operator's tab-by-tab pass).** `EditBundle/PriceTab.tsx` refactored identically — exports `PriceSection` + `PriceHistoryDialog`. Bundle-specific quirks preserved: `cost_price` is read-only (server-computed by `recomputeBundleCost`), uses `product.cost_price` (not form state) so it stays in sync after a save without an edit. Badge variants in dialog also flipped to `*-outline`. `EditBundle/GeneralTab.tsx` rewritten to mirror EditProduct/GeneralTab structure exactly — `variant="elevated"` everywhere, **สถานะ moved to top of right column** (was at bottom under barcodes), `data-field` + `aria-invalid` on required inputs, PriceSection embedded inline (left column, after ข้อมูลพื้นฐาน, before หมายเหตุ), PriceHistoryDialog at the bottom. Took new props: `errors / product / productId / isNew / reloadToken`. `EditBundle/index.tsx` got the full EditProduct treatment: added `REQUIRED_FIELDS` + `REQUIRED_LABEL` + `validate()` returning a missing-Set, `errors` state, `isDirty` state with `beforeunload` guard + leave-confirm dialog (`AlertTriangle / warning-strong` per the EditProduct pattern), `goBack()` routes through leave-confirm if dirty, `setF` wrapper clears errors + sets dirty + works as the canonical mutation (any `setForm` call that should mark dirty must go via `setF`). **Save + Back buttons moved out of PageHeader's `right` prop into the TabStrip ml-auto cluster** so the chrome is identical to EditProduct. Save gate `tab === 'general'` (no `||tab === 'price'` needed anymore). **Removed the `price` TabsTrigger** entirely — bundle tab list is now: ข้อมูลทั่วไป / รายการ / ฉลาก / ความเคลื่อนไหว. `setIsDirty(false)` called on both new-mode and edit-mode save success paths.
##     - **Files no longer imported anywhere** (defensive cleanup needed next session): none — both `PriceTab.tsx` files still export valid surface (`PriceSection` + `PriceHistoryDialog`), just nothing imports the old `PriceTab` default anymore. **Do not delete the files** — GeneralTab imports from them.
##   - **What's NOT done (resume here):**
##     - **Tab 2 — `EditBundle/ComponentsTab.tsx` review.** 519 lines, largest file in EditBundle. Need to verify: (1) follows the table-card 4-zone layout per `docs/claude/ui-table-card.md` (`h-14 px-2` filter strip, `h-10` controls, `bg-muted` column header band only, `border-l-[16px]`/`r-[16px]` table inset, bottom `border-t` status bar — no `bg-muted` reuse), (2) badges flipped to soft+outline if they aren't already, (3) row action buttons use `size="icon-lg" variant="elevated"` (or role-tinted equivalent — destructive2 for delete is OK per existing convention), (4) text-size discipline (no `text-xs` smaller, no `text-[10px]` etc), (5) Modal contract on any dialogs (Esc closes, Enter triggers primary OK, no outside-click close — but shared Dialog component enforces this; only flag if custom Dialog primitives used). NOT YET STARTED.
##     - **`EditBundle/index.tsx` index-final review** after Tab 2: verify the `setForm` calls in `refreshProduct` don't unset isDirty silently (current code has a `/* keep edits */` no-op spread that's a code smell). Check that the leave-confirm doesn't fire when the page legitimately replaces itself on save success (it shouldn't — `setIsDirty(false)` runs before the `navigate(..., {replace:true})`).
##     - **Click-test everything in EditBundle.** Specifically: (a) open existing bundle → all sections render, price history dialog opens + shows entries + refresh button works; (b) edit a field → save button enabled → click → toast success → re-fetch shows updated values; (c) edit then click "ย้อนกลับ" → leave-confirm dialog appears → "กลับไปแก้ไข" keeps page, "ออกจากหน้านี้" navigates; (d) new bundle: open `/products/bundles/new` → form blank, default unit=ชุด, components tab gets `draftItems` → add 2+ → save creates atomically; (e) leave required `ชื่อชุดสินค้า` blank → save shows toast + scrolls to + focuses the field + the field shows `aria-invalid` ring; (f) verify price history dialog `disabled` state when `isNew=true`.
##     - **EditProduct sanity click-test** — verify the option-D merge didn't break anything: tab bar no longer shows "ราคา", General tab scrolls past the new PriceSection without weird height issues, history dialog opens from the "ประวัติ" button at top-right of the price section, "ประวัติ" disabled when isNew=true.
##     - **HistoryTab click-test (both EditProduct + EditBundle)** — after-pagination sanity: pick a product with >100 movements, set pageSize=50, paginate forward to last page, set date filter to a narrow range mid-history → results refresh, total recomputes, page resets to 1. Set type filter to only "หมดอายุ" → backend filters by both `expired` + `near_expiry` (one IN clause, two params). Switch pageSize to "ทั้งหมด" → no LIMIT clause hit on backend (sanity: load takes >1s for a busy product is fine, but shouldn't OOM). Sort direction toggle should reload (not just reverse client-side).
##     - **Run `npm run build` (or at minimum `tsc -p tsconfig.node.json`) before resuming work** — backend signature changes are non-trivial; ensure both configs are clean.
##   - **Carry-forward (NOT touched today, still valid from prior sessions): everything below in the older 🚧 PAUSED + ⚠️ Next session blocks.**
##
## 🚧 PAUSED 2026-05-25 (operator went to sleep): **Column-visibility / table-restyle pass.** Started reworking list tables to give operators per-column show/hide control via a Settings ⚙️ popover (checkboxes) in the filter strip. Shipped today on `ProductsList` + `BundlesList`; **operator wants the same treatment rolled out to the other list tables — list to be picked next session.**
##   - **Settings ⚙️ popover** (new pattern): outline icon-button `h-10 w-10` in filter strip → `PopoverContent align="end" w-56` with `PopoverTitle "ตัวเลือกการแสดงผล"` + `<label><Checkbox/>...</label>` rows. Each checkbox toggles a column's `show*` boolean state; columns conditionally render in both `<TableHeader>` and the rows.map body; `colSpan` of the loading/empty cell is computed dynamically (`3 + Σ show*`).
##   - **ProductsList columns**: `แสดงต้นทุน` (on), `แสดงราคาขาย` (on), `แสดงกำไร` (off), `แสดงสต็อก` (on). Removed `หน่วย` column (unit moved into the new stock bar). Removed legacy stock-as-number renderer entirely — bar is the only mode.
##   - **BundlesList columns**: `แสดงต้นทุน` (on), `แสดงกำไร` (off). `หน่วย` left in but de-sortified (`SortableTableHead` → plain `TableHead`); no stock column (bundles have `รายการ` instead).
##   - **Stock bar** (`renderStockCell` in ProductsList): `{qty} {unit_name} · {status}` text-sm over `h-1.5 bg-muted` progress bar. Status `qty<=0 → หมด` (destructive, 0%), `qty<=reorder_point → ใกล้หมด` (destructive), else `ปกติ` (success). Bar width = `min(100, qty / safety_stock * 100)`; if `safety_stock` unset → 100% green "ปกติ". `min-w-[160px]`, align left.
##   - **Price tooltip**: when `showPrice` is on AND (showCost off OR showProfit off), the price cell wraps in `<Tooltip side="left">` showing only the hidden of the two (`ต้นทุน`, `กำไร + %`). Grid `grid-cols-[auto_1fr] gap-x-4 gap-y-1`. Cost+profit both shown → no tooltip.
##   - **Removed `"แสดงที่ปิดใช้งาน"` toggle** from both lists (operator: "ไม่ได้ใช้หรอก"). Replaced with derivation `include_disabled: stockFilter === 'disabled'` in the list query (so clicking the "ปิดการใช้งาน" stat card still flips to disabled-only view); `stockStats` IPC now always called with `include_disabled: true` so the stat cards count both groups accurately.
##   - **Global sort icon swap** (`src/components/ui/table.tsx` — affects every `SortableTableHead` in the app): `ArrowUp / ArrowDown / ArrowUpDown` → single `ChevronDown` with `transition-transform duration-200`; inactive = down opacity-40, active asc = `rotate-180` opacity-100, active desc = down opacity-100. (Remaining `ArrowUpDown` icon in `Settings/CategoriesTab.tsx` "จัดลำดับ" reorder button left as-is — semantically a reorder action, not a sort indicator. Ask operator if they also want this swapped.)
##   - **Row height** bumped via `[&_td]:py-2.5` on each rendered `<TableRow>` (TableCell default is `py-1` → too tight for the stock bar's 2-line layout).
##   - **TODO when resuming**: ask operator which tables to do next (candidates: `Manage/Sales`, `Manage/Purchases`, `Manage/LowStock`, `Manage/Expiry`, `Reports/*` tables, `Purchase/index` GR table, `Settings/CategoriesTab`, `Settings/DrugTypesTab`, etc.). Decide per-table which columns are toggleable and which are mandatory. Consider extracting the popover into a shared `<ColumnVisibilityMenu />` component if pattern repeats.
##   - tsc clean both configs (no new tsc run yet for today's edits — verify before resuming). **NOT click-tested.**
## ⚠️ Next session:
##   0. **Click-test แดชบอร์ดใหม่ (`/reports/dashboard`)** end-to-end — เปิดแท็บ "แดชบอร์ด" (ตัวแรกใน Reports) → default = วันนี้, summary 6 cards (ยอดขายสุทธิ/กำไร/บิล/คืน/ซื้อ/หนี้) โผล่ครบ, granularity ของแนวโน้มควรเป็น "ชั่วโมง", Traffic chart โหมด `single_day` (24 bars แนวตั้ง). คลิก DateRangePicker → "7 วันที่ผ่านมา" → granularity auto-เปลี่ยนเป็น "วัน" + Traffic chart โหมด `aggregated` (hour-of-day เฉลี่ย). เลือก "30 วัน" → "วัน", 90 → "สัปดาห์", 1 ปี → "เดือน". กดแท็บ granularity เองได้แต่พอเปลี่ยน date มัน reset เป็น auto. Top 3 cards (ขายดี/กำไรสูง/กำไรต่ำ) → คลิกแถว navigate ไป `/products/:id/edit`. Stock risk 4 cards → คลิกไป `/manage/low-stock`, `/manage/expiry`, `/manage/expiry`, `/manage/negative-stock` ตามตัว; ค่านับใน card ต้องตรงกับหน้าปลายทาง (lowStock count, expired count from `reports:expiringLots` filter='expired', 30d count from filter=30, negativeStock count from `negativeStock:count`). ตาราง "สินค้าค้างสต็อก" → คลิกแถวไปหน้า edit; ตรวจ `last_sold_at` ของสินค้าที่ขายล่าสุดในประวัติ. ตาราง Velocity → คลิกชื่อสินค้า + ไอคอน `ExternalLink` ไปหน้า edit; ลองหาสินค้าที่ขายน้อยกว่า 3 เดือน → Badge `warning` "ข้อมูลยังน้อย" โผล่; เช็คสูตร `suggested_safety_stock = ceil(avg_daily * 30)`, `suggested_reorder_point = ceil(avg_daily * 14)` ด้วยมือ; `days_cover` <7 = แดง, <30 = ส้ม. AP aging 4 tiles + รวมยอด — สร้างบิลซื้อเครดิตเลย due_date แล้วกลับมาเช็ค bucket. Sale type breakdown 5 tiles — สร้าง retail+wholesale+rx+return+voided แล้วเช็คตัวนับ. **Regression**: เปิด `/reports` (Finance เดิม) — ทำงานเหมือนเดิมทุกอย่าง; `/reports/sales|purchases|fda` ไม่กระทบ; สลับ tab แล้วกลับมา → summary cards + toolbar ของ Dashboard โผล่ถูก (per-tab `setSummary`/`setToolbar` guard). Role gate: สลับเป็น staff (DEV button จาก Finance) → คลิก date range > 7 วัน → toast clamp 7 วัน. Walk-in (C0000) — สถิติ `unique_customers` ต้องนับ C0000 รวมเป็นลูกค้าจริง (ไม่หายไป). หน่วยฐาน: สินค้าที่ขายเป็นแผง/กล่อง → avg/month ใน Velocity ต้องเป็นหน่วยฐาน (POS แปลงตอน save แล้ว). Plan: `docs/plans/Reports_New_Dashboard.md`.
##   1. **Click-test negative-stock sales + reconciliation** end-to-end — POS sell a product with `0` open-lot qty → cart shows red "สต๊อกไม่พอ" alert; save bill → `SELECT * FROM sale_item_lots WHERE sale_item_id=<last>` returns one row with `lot_id IS NULL, qty=shortfall`; sidebar `/manage` icon gets a tiny `bg-warning` dot (collapsed tooltip = `"ประวัติ & สต็อก (1)"`); click → tab "สต๊อคติดลบ" also has the dot suffix → page shows row with `available_stock=0`, reconcile button disabled with title `"ไม่มีสต๊อกพร้อมตัด — ต้องรับสินค้าก่อน"`. Receive 10 via `/purchase` → toast `"สินค้า X มียอดติดลบรอตัด — กดเมนู ประวัติ & สต็อก เพื่อตรวจสอบ"` (5s, info); badge stays (1 marker still). Return to negative-stock → `available_stock=10` → click reconcile → confirm dialog opens (Esc closes; reopen → press Enter triggers OK) → row disappears, badge clears, toast `"X — ตัดครบ N <unit>"`. DB check: new `sale_item_lots` rows with real `lot_id` + matching `sale_item_id`; `product_lots.qty_on_hand` decreased; new `stock_movements` row has `product_id` non-NULL + note `"ตัดสต๊อคย้อนหลัง: RC-..."`. Then test dismiss: create another oversell → click trash → confirm → marker `is_cancelled=1`, lot qty unchanged, audit `stock_movements` row with `qty_change=0` + note `"ลบรายการขายติดลบโดยไม่ตัดสต๊อค"`. Bundle case: bundle B with component C (stock 0); sell B → page lists C not B; receive C → reconcile works. Partial: outstanding 10, receive 3, reconcile → marker `qty=7`; receive 7 → reconcile → marker gone. Float qty: sell 0.5 of a unit with `qty_per_base=3` (base shortfall 1.5); receive 1.5 → reconcile → marker DELETEs cleanly (no `0.0000000001` ghost). Void-before-reconcile: create oversell → void sale from `/manage` (Sales tab) → badge decrements, marker `is_cancelled=1`. Cancelled-lot exclusion: `UPDATE product_lots SET is_cancelled=1 WHERE id=<lot with qty_on_hand>0>` → that qty must NOT contribute to `available_stock`, reconcile must NOT deduct from it. Confirm-dialog double-submit guard: hold Enter while IPC runs → only one reconcile/dismiss fires. Plan: `docs/plans/done/negative-stock-reconciliation.md`. Audits: `docs/audits/done/negative-stock-reconciliation_audit*.md`.
##   2. **Click-test POS cart alerts + bundle expansion** end-to-end — open Settings → การขาย, toggle each switch + edit warn/danger month thresholds, save, reload (verify singleton persists). In POS: add a product with `expiry_date < today` → red `AlertOctagon` + tooltip "สินค้าหมดอายุแล้ว (dd/MM/yyyy)"; lot within `expiry_danger_months` → orange `AlertTriangle`; within `expiry_warn_months` → yellow `AlertCircle`. Sell in non-base unit (qty_per_base=10) where stock < `qty * qty_per_base` → red `PackageX` "สต๊อกไม่พอ" with unit name. Toggle off the expiry switch → warn/danger icons disappear; toggle off expired switch → red AlertOctagon disappears separately. Bundle row: click `▸` on the `#` cell → component sub-rows appear with `qty_per_bundle × cart_qty`, read-only; click `▾` to collapse. Bundle alert propagation: set a component lot to expire in 2 mo → bundle parent shows danger icon with tooltip naming the component. Set-remap test: add bundle+regular+bundle, expand both bundles, delete the regular → both bundles still expanded (the index-shifted one stays expanded). Sale flow → `clearCart` → expandedBundles resets (next bundle isn't auto-expanded from a stale Set).
##   3. **Click-test Bundle atomic create + min-2 guard** end-to-end — `/products/bundles` → "+ เพิ่มชุดสินค้า" → URL = `/products/bundles/new`, page shows form + "ยังไม่บันทึก" warning badge in meta card. Try saving with 0/1 components → main button "สร้างชุดสินค้า" is disabled with tooltip; if you somehow trigger it (e.g. via DevTools), the toast shows "ชุดสินค้าต้องมีรายการอย่างน้อย 2 รายการ". Add 2 components → button enables → click → atomic create → URL `replace`s to `/products/bundles/:id/edit` with success toast. **Back button on /new** → return to BundlesList; verify NO orphan row in DB. Edit-mode side: open an existing bundle, remove components until 1 left → ComponentsTab Save button disables + footer shows "ต้องมีรายการอย่างน้อย 2 รายการ (1/2)" in destructive color; backend `saveBundleItems` throws if bypassed.
##   4. **Click-test ขย.9** end-to-end — `/reports/fda` shows 3 cards (9 enabled, 11/13 disabled badged) → click ขย.9 → A4 preview shows shop name (from `settings.getShop`) + 8 columns matching the official template. Change date range; verify only drug + non-bundle GR lines appear (`is_drug=1 AND is_bundle=0`); cancel a GR → row disappears. Click "พิมพ์" → print dialog opens with landscape orientation, sidebar/titlebar/tabs/filter strip hidden, `<thead>` repeats on page 2 when rows overflow. Diff against the official PDF template (title, column wording, column order).
##   5. **Click-test Product Bundle Phase 1 + 2 + audit fixes** end-to-end — create bundle in `/products/bundles` → sell in POS (verify 1 cart line + FEFO per component) → void (verify stock_movements.product_id = component, NOT bundle, after C1) → return bundle line via SaleDetailDialog `คืนชุด` (verify lots restored + reports.salesList total_cost nets to 0 across original+RT- after C2; "คืนชุด" button HIDDEN on the new RT- bill after C3) → expire a component lot via /manage/expiry (verify bundle cost_price updates after C5) → restock then return bundle (verify reopened lot triggers bundle cost recompute after C6) → try GR a bundle from Purchase page (verify backend throws ทำรายการสต็อกกับชุดสินค้าไม่ได้ after C4). Verify ProductsList stat cards don't inflate from bundles; EditProduct/EditBundle cross-redirect guards work.
##   6. **Click-test Phase 1–4** — /manage 4 tabs (sales w/ void; purchases w/ payment cards + receipt + edit + cancel GR; low-stock w/ search+shortfall+ไปหน้ารับสินค้า; expiry); `/purchase` pure receive flow; **/reports** (date range → 6 finance cards + payment-mix + daily trend; เจ้าหนี้การค้า aging buckets + outstanding list). Also the topbar `h-10` sweep from Session 2026-05-20b.
##   7. **Phase 5 continuation** — ขย.11 (บัญชีการขายยา) + ขย.13 (บัญชีการขายยาควบคุมพิเศษ): templates + IPC + page. Hub cards already wired; just need template PDFs + the matching sales-side SQL. Reuse `src/lib/thaiDate.ts`, the `.print-area` / `.no-print` infra in `src/index.css`, and the page shape of `KhorYor9.tsx`.
##   8. **When real login lands: delete the ⚠️ DEV-ONLY role toggle in `Reports/Finance.tsx`** (2 marked spots — see "Reports/Finance — 7-day access gate" 2026-05-19).
## (Carried over, lower priority: click-test EditProduct split [2026-05-17]; cost-audit Manage/Sales+Expiry.)
## ✅ DONE 2026-05-21b: **Negative-stock sales + retroactive reconciliation** (Session 2026-05-21b below) — new feature wrapping existing oversell support in `deductFefo()`. Backend: new `electron/ipc/negativeStock.ts` with 4 handlers (`list` / `count` / `reconcile` / `dismiss`); `purchase:save` extended to return `negative_stock_alerts[]` for affected products; `reports:voidSale` now cancels NULL markers in the same transaction so a void doesn't leave ghost queue entries. Frontend: new `/manage/negative-stock` page with square icon-button row actions (`success` reconcile / `destructive2` dismiss) + confirm dialogs (Modal contract — Esc closes, Enter triggers OK, no outside-click close, busy-guard on Enter to prevent double-submit); Zustand `useNegativeStockBadge` store refreshed from POS save, Purchase save, every voidSale call site (Sales/POS/HistoryTab), and reconcile/dismiss; Purchase page toasts "สินค้า X มียอดติดลบรอตัด..." (5000 ms, info) when GR fills a marker product. Sidebar shows a `h-2 w-2` warning dot on the `/manage` icon when count > 0 (tooltip in collapsed mode includes the count); Manage page tab "สต๊อคติดลบ" gets the same absolute dot suffix — no layout impact. All `stock_movements` INSERTs carry `product_id` (NOT NULL); FEFO query excludes `is_cancelled=1` lots; `EPS = 1e-9` for float-safe marker upkeep; reconcile does NOT auto-close lots (matches `deductFefo()` semantics — lot lifecycle still belongs to `adjustStock`/`updateLot`); every query filters `s.status='completed'` for defense in depth. Two-pass audit before/after impl. **No new tables, no new colour tokens.** tsc clean both configs, **click-test pending**.
## ✅ DONE 2026-05-21: **POS cart alerts (expiry + stock) + bundle expansion + Settings การขาย tab** (Session 2026-05-21 below) — new `sales_settings` singleton table + 2 IPC handlers wired into `Settings → การขาย` with `Toggle framed` rows + month-threshold Inputs (validates `warn ≥ danger`). Pure helper `src/pages/POS/cartAlerts.ts` computes per-row severity (`expired` > `low_stock` > `danger` > `warn`) using `dayjs(...).isBefore(today.add(N, 'month'), 'day')` + base-unit normalization via `selectedUnit?.qty_per_base ?? 1`; bundle branch loops `bundle_items[].lots[]` and surfaces the worst component. POS cart rewritten from `map` to `flatMap` so a bundle row can yield itself + N read-only component sub-rows when expanded; chevron toggle lives on the `#` cell (`<Button variant="ghost" size="icon-lg">`). Alert icon prefixes product name with `<Tooltip>` (Radix Portal — escapes the `overflow-auto` container). Index-stable `expandedBundles: Set<number>` via `removeCartItem` wrapper (drop key === idx, decrement keys > idx) + reset on both `cart.clearCart()` call sites. Plan-stage audit (Sonnet + Gemini) + code-stage audit (Opus) — 1 🟡 (clearCart reset, fixed) + 2 🟢 (unit-name in low_stock message, SEVERITY comment) folded; 1 🟢 (server-side validation) deferred as Electron-trusted-renderer + plan rule "ship what's specified". tsc clean both configs, **click-test pending**.
## ✅ DONE 2026-05-20f: **Bundle creation: atomic + min-2-components invariant** (Session 2026-05-20f below) — orphan empty-bundle rows are now impossible. New IPC `products:createBundle` commits product row + ≥2 `product_bundle_items` + `recomputeBundleCost` in one transaction (rollback on any failure). `BundlesList.tsx:handleCreate` no longer creates a DB row — just `navigate('/products/bundles/new')`. `EditBundle/index.tsx` handles `:id === 'new'` (or absent) — empty form, draft components lifted to parent state, default unit = "ชุด", Labels tab hidden until first save, badge "ยังไม่บันทึก" on meta card, main button reads "สร้างชุดสินค้า" and `disabled` when `draftItems.length < 2`. `ComponentsTab` gained controlled mode via `controlledItems` + `onControlledItemsChange` props; when controlled, hides its own Save button (parent commits atomically). Edit-mode `products:saveBundleItems` IPC also throws on `< 2` (defends against IPC-direct callers). Five defensive layers: UI button disable → UI handleSave pre-validate → createBundle backend → saveBundleItems backend → atomic transaction rollback. tsc clean, **click-test pending**.
## ✅ DONE 2026-05-20e: **Phase 5 / ขย.9 — บัญชีการซื้อยา shipped** (Session 2026-05-20e below) — 2-source audit (Gemini + Deepseek) on v1 plan caught: SQL join col (`purchase_receipts.invoice_no` is PK, not `id`), wrong filename (`FdaReports.tsx` not `Fda.tsx`), nested route needed (the flat `<Route path="fda">` couldn't host children), missing `is_bundle=0` filter (bundles can carry `is_drug=1` but aren't bought as a single SKU), and `reports.ts` already exists with 8 handlers (append, don't create). All folded into v2 plan before coding. Shipped: `reports:khorYor9` IPC, `window.api.reports.khorYor9`, `src/lib/thaiDate.ts` (`formatThaiShortBE` → "20 พ.ค. 2569"), `src/pages/Reports/KhorYor9.tsx` (A4 landscape WYSIWYG preview + `window.print()`), rewrote `FdaReports.tsx` from placeholder to 3-card hub, restructured `/reports/fda` route in App.tsx into parent + index + `khor-yor-9` children, added first `@media print` block in `src/index.css` (A4 landscape, `.no-print` hides chrome, `.print-area` expands to full page, `<thead>` repeats across pages). `no-print` markers on Sidebar, TitleBar, ReportsLayout chrome wrapper. Plan + 2 audit results moved to `docs/{plans,audits}/done/`. tsc clean (both `tsconfig` + `tsconfig.node.json`), dev server boots clean, **click-test pending**.
## ✅ DONE 2026-05-20d: **Product Bundle audit — 6 critical fixes + 1 hotfix** (Session 2026-05-20d below) — 3-source audit (CC + Deepseek + Gemini) caught C1 voidSale column collision (`SELECT sil.*, si.product_id` → bundle id leaks into stock_movements), C2 returnBundle aggregate double-removal of total_cost across original+RT- bills (fixed via Option 3 — voidSale now skips via `si.is_cancelled` instead of marking `sil.is_cancelled=1`), C3 return-of-a-return path (op could click "คืนชุด" on an RT- bill's negative bundle row → would DEDUCT stock), C4 missing `assertNotBundle` in `purchase:save`+`purchase:cancel` (bundles could be GR'd → invariant pwned), C5 `expireLot` skipped cost recompute (bundle cost stale after disposal), C6 `pos:returnBundle` skipped recompute when reopening closed lots. Helper `assertNotBundle` moved to shared `electron/db/pricing.ts`. Hotfix: `products:create` now defaults every named param (BundlesList quick-create was throwing RangeError) + enforces `is_bundle=1 ⇒ is_stock_item=0` invariant. Plan/audit docs moved to `docs/{plans,audits}/done/`. tsc clean, **click-test pending**.
## ✅ DONE 2026-05-20c: **Product Bundle (ชุดสินค้า) Phase 1 + 2** (Session 2026-05-20c below) — commits `1d794e1` + `034d887`. Schema (`is_bundle` + `product_bundle_items`), shared `electron/db/pricing.ts` replacing 4× SQL duplication, FEFO `deductFefo` refactor in `pos.ts`, new `EditBundle` page, new `/products/bundles` tab, POS bundle cost preview + cart row breakdown + return-modal toast, `SaleDetailDialog` bundle expand + `คืนชุด` button, `pos:returnBundle` IPC, 5 stock/lot handlers reject bundle. Pre-audited by 3 reviewers before implementation. Plan archived at `docs/plans/done/product-bundle-phase1.md`. tsc clean, **click-test pending**.
## ✅ DONE 2026-05-20b: **Topbar control-height standardization (`h-14` strip → `h-10` controls)** (Session 2026-05-20b) — every filter-strip control bumped to `h-10` to match the baked defaults of DateInput/DateRangePicker/Combobox; `Toggle framed="input"` primitive raised h-9 → h-10; new HARD rule added to CLAUDE.md + showcase. Also tightened `Manage/Purchases.tsx` to showcase styling (action column, column order, Badge defaults, font weights). tsc clean, **click-test pending**.
## ✅ DONE 2026-05-20: **Table-card top/bottom bar sweep + `Toggle framed="input"`** (Session 2026-05-20) — all group A+B list/report tables now match the showcase: toolbar folded into the card top bar, bottom bar = page-size·pagination·count. New borderless `framed="input"` Toggle mode that blends with the search Input. tsc clean, **click-test pending**.
## ✅ DONE 2026-05-19: **POS "ยกเลิกบิล" button fixed** (Session 2026-05-19b) — invoice-lookup → SaleDetailDialog → ConfirmDialog → voidSale. tsc clean, **click-test pending**.

---

## Session 2026-05-21 — POS cart alerts (expiry + stock) + bundle expansion + Settings การขาย tab — ✅ DONE 2026-05-21 (tsc clean, NOT click-tested)

> Self-contained. Operator asked for two things in one go: (1) per-cart-row alerts when the product being sold is expired / nearing expiry / low on stock, with thresholds configurable in a new `Settings → การขาย` tab "designed for future POS options"; (2) a way to see the components inside a bundle from the cart, with operator-asked UI design ("ช่วยออกแบบ UI ให้ผมฟังที ทำแบบไหนดี"). Three UI variants proposed (chevron toggle / always-on inline / chip→popover); operator picked chevron toggle. Plan→audit→code-with-fixes workflow. No commit yet — dirty tree ready for click-test.

### Audit chain (two passes, three reviewers)
- **Plan-stage** — Claude Sonnet (`docs/audits/pos-cart-alerts-and-bundle-expansion-audit.md`) caught: Tooltip primitive exists, must NOT use `title` attribute; raw `<button>` violates CLAUDE.md (use `Button variant="ghost" size="icon-lg"`); AlertIcon as a page-file helper component violates the no-page-level-UI rule (inline JSX instead). Gemini (`docs/audits/pos-cart-alerts-and-bundle-expansion_auditresult_gemini.md`) caught the 🔴 critical: low_stock check must normalize `cart.qty * (selectedUnit?.qty_per_base ?? 1)` BEFORE comparing to lot stock (otherwise selling 1 "แผง" of 10 against 5 base units doesn't trigger); also `expandedBundles` instability across `removeItem` (no stable CartItem id); also `LabelSettingsTab` form-key drift trap (must keep SalesTab form keys 1:1 with DB columns). All folded into the plan before coding.
- **Code-stage** — Claude Opus (results appended to `docs/audits/pos-cart-alerts-and-bundle-expansion-audit-request.md`). Verified all 5 load-bearing assumptions + all 8 cheat-sheet greps. **0 🔴, 1 🟡, 3 🟢**:
  - 🟡 `expandedBundles` not reset on `cart.clearCart()` (2 call sites at POS/index.tsx:713, :895) → folded (`setExpandedBundles(new Set())` added inline at both).
  - 🟢 Bundle low_stock message missing unit name → folded (now `"ต้องการ 6 เม็ด แต่มี 5 เม็ด"`; regular product low_stock also got the same treatment via `product.unit_name`).
  - 🟢 SEVERITY map rationale undocumented → folded (added comment `expired is the most urgent; low_stock (can't fulfill) outranks near-expiry`).
  - 🟢 Server-side validation for `expiry_warn_months` / `expiry_danger_months` → **deferred**: Electron-trusted renderer per audit's own caveat; plan rule "ship what's specified, don't over-engineer".

### Architecture
- **`sales_settings` (singleton)** mirrors `label_settings` pattern. 5 columns today (4 booleans as `INTEGER NOT NULL DEFAULT 1` + 2 month thresholds `INTEGER NOT NULL DEFAULT 6/3`) deliberately under-shipped so future POS options can land as new columns + new form rows without a new table. IPC handlers (`settings:getSalesSettings` auto-INSERTs the default row on first call; `settings:saveSalesSettings` is dynamic `Object.keys(rest)` UPDATE matching the `label_settings` shape exactly).
- **`cartAlerts.ts` is pure** — input: `(item, settings, today=dayjs())`; output: `{ level: 'expired'|'low_stock'|'danger'|'warn'; reason: string } | null`. No React, no IPC, no global state. Future unit-testable in isolation. Severity ordering `expired=4 > low_stock=3 > danger=2 > warn=1` (highest-wins). Date comparisons use `dayjs(expiry).isBefore(today.add(N, 'month'), 'day')` — whole-day precision avoids midnight edge cases. Lot reads default to `qty_on_hand` only — `pos:searchProducts` already filters `is_closed=0 AND qty_on_hand > 0`, so `sumStock` doesn't re-filter; `soonestLot` does a defensive expiry-ASC re-pick.
- **Bundle severity propagation** — `getCartItemAlert` loops `product.bundle_items[]`, evaluates each component's stock (`item.qty * c.qty_per_bundle` vs `sum(c.lots[].qty_on_hand)`) and its FEFO lot expiry, builds a candidate per component, keeps the worst across all components. Tooltip text names the offending component (e.g. `"Paracetamol ใกล้หมดอายุ (12/08/2026)"`).

### POS cart rewrite — `map` → `flatMap`
The cart's `cart.items.map((item, idx) => <TableRow .../>)` is now `cart.items.flatMap((item, idx) => { const rows = [<TableRow>...</TableRow>]; if (isBundle && isExpanded) rows.push(...componentSubRows); return rows })`. Sub-rows use `<TableRow className="bg-muted/30 hover:bg-muted/40">` with `key={`${idx}-c-${ci}`}` (string keys never collide with the parent's numeric `key={idx}`). Sub-row cells: empty `#` cell, bullet + component name (`pl-6 text-xs text-foreground-subtle truncate`), unit name, `qty_per_bundle * item.qty`, and a `colSpan={4}` placeholder for the remaining columns. Pricing/discount stay on the parent row only — sub-rows are pure read-only display.

### Bundle chevron toggle + Set-remap
- `# cell` for bundles becomes a `<Button variant="ghost" size="icon-lg" className="w-full h-8">` containing `<ChevronDown/>` or `<ChevronRight/>` + the index number. Regular products render a plain `<>{idx + 1}</>` text node — no toggle.
- `expandedBundles: Set<number>` keyed by cart array index. Because `CartItem` has no stable id (out of scope to add `uid` per the audit's defer note), the Set must stay in sync on any index-shifting mutation. Two paths exist:
  - `cart.removeItem(idx)` — wrapped in `removeCartItem` which forEach-rebuilds the Set (drops key === idx, decrements keys > idx).
  - `cart.clearCart()` — 2 call sites (post-sale success, "ล้างตะกร้า" button). Both now inline `setExpandedBundles(new Set())` immediately after the clear (audit Finding 1).
  - `cart.updateItem(idx, ...)` and `cart.addItem(...)` don't shift indices — Set is safe across them.

### Alert icon + Tooltip
`<Tooltip>` (Radix) wraps the icon in the product-name cell. `TooltipProvider` already lives at `App.tsx:45` so no new plumbing. `<TooltipTrigger asChild>` lets the icon stay a plain `<span>` for the `flex items-center gap-1.5` parent's hit testing (the truncating product-name span sits next to it). `<TooltipContent>` uses `Portal` so the popover escapes the cart's `overflow-auto` scroll container — no clipping. Severity → icon + color:

| Level | Icon | Color token |
|---|---|---|
| expired | `AlertOctagon` | `text-destructive` |
| low_stock | `PackageX` | `text-destructive` |
| danger | `AlertTriangle` | `text-warning-strong` |
| warn | `AlertCircle` | `text-warning` |

`alertColorClass(level)` is a one-line `switch` in `cartAlerts.ts` (pure utility — not JSX, so the no-page-level-UI rule doesn't apply; lives next to the helper that decides the level).

### Settings tab — `Toggle framed` over raw Switch
SalesTab uses `<Toggle framed label="..." />` (from `@/components/ui/switch` — label-left + Switch-right pill with neutral border). Form state keys mirror DB column names exactly (`expiry_alert_enabled`, `expiry_warn_months`, `expiry_danger_months`, `expired_alert_enabled`, `low_stock_alert_enabled`) so the dynamic-Object.keys UPDATE works without a mapping layer (the `LabelSettingsTab` quirk where `paper_width ↔ width_mm` requires manual remapping is explicitly NOT replicated here). Client-side validation: `warn >= danger` before save, toast on violation. Input `min={1} max={36}` is HTML-enforced.

### Files shipped
- **`electron/db/schema.ts`** — added `CREATE TABLE IF NOT EXISTS sales_settings` next to `label_settings`.
- **`electron/ipc/settings.ts`** — added `settings:getSalesSettings` (auto-INSERTs default row) + `settings:saveSalesSettings` (singleton upsert, dynamic `Object.keys(rest)` UPDATE).
- **`electron/preload.ts`** — `getSalesSettings` + `saveSalesSettings` exposed on `window.api.settings`.
- **`src/types/index.ts`** — `SalesSettings` interface (`id`, 5 columns, optional `updated_at`).
- **`src/pages/POS/cartAlerts.ts`** (new) — `getCartItemAlert`, `alertColorClass`, internal helpers `soonestLot` / `sumStock` / `evalExpiry`. SEVERITY map with rationale comment.
- **`src/pages/Settings/SalesTab.tsx`** (new) — `Toggle framed` rows + paired month Inputs + `warn ≥ danger` validation + save toast.
- **`src/pages/Settings/index.tsx`** — registered `<TabsTrigger value="sales"><ShoppingCart /> การขาย</TabsTrigger>` between `drugtypes` and `labels`; routed to `<SalesTab />`.
- **`src/pages/POS/index.tsx`** — added imports (`Tooltip*`, alert helpers, `SalesSettings`, 4 new lucide icons), `salesSettings` state + load `useEffect`, `expandedBundles` Set + `toggleBundleExpand` + `removeCartItem` wrapper, `clearCart` Set-reset at both call sites, cart row rewritten as `flatMap` with alert icon prefix + chevron `#` cell + component sub-rows.

### Plan + audit docs
- `docs/plans/pos-cart-alerts-and-bundle-expansion.md` — final plan after both plan-stage audits folded
- `docs/audits/pos-cart-alerts-and-bundle-expansion-audit.md` — Sonnet plan audit
- `docs/audits/pos-cart-alerts-and-bundle-expansion_auditresult_gemini.md` — Gemini plan audit
- `docs/audits/pos-cart-alerts-and-bundle-expansion-audit-request.md` — code-stage audit request + Opus result appended at line 244 onwards

### Forward note
When future POS options land (rounding, default discount, etc.), the recipe is: add a column to `sales_settings` with a `DEFAULT` value → add to `SalesSettings` interface → add to `DEFAULT_FORM` in SalesTab → add a `<Toggle>` or `<Input>` row → ship. The IPC handler doesn't need a code change because the dynamic UPDATE picks up the new key automatically. Settings reload-during-POS-session is deferred (would need Zustand or an event bus); current behavior is "load on POS mount" — operator switches pages to pick up new settings.

---

## Session 2026-05-20f — Bundle creation: atomic + min-2-components invariant — ✅ DONE 2026-05-20 (tsc clean, NOT click-tested)

> Self-contained follow-up to the Bundle Phase 1+2 work + audit fixes. Operator asked the conceptual question "การสร้าง bundle ทำงานยังไง — สร้าง product ใหม่ลง products table เลยหรือ?" and after walking through the design (bundles = `products` row with `is_bundle=1, is_stock_item=0` + `product_bundle_items` child rows; FEFO works on component lots; void-whole-bill covers returns), narrowed in on one weakness: `BundlesList.handleCreate` immediately INSERTed an empty product row before navigating to `EditBundle`. If the user closed the page before adding components, an orphan empty bundle (0 rows) was left in DB — would show up in POS search, couldn't be sold. Operator: "block ทุกวิธี ที่ทำให้ รายการน้อยกว่า 2 ไปเลย". Picked atomic-create over auto-delete-on-exit (cleaner — no draft state in DB at all).

### Design
- **New mode = in-memory.** Quick-create button → `navigate('/products/bundles/new')`. EditBundle detects `id === undefined || 'new'`, doesn't fetch, starts with empty form + empty `draftItems` array.
- **One atomic IPC.** `products:createBundle({ product, items })` validates `items.length >= 2` and each component (existing, non-bundle, non-disabled, `qty_per_bundle > 0`) BEFORE inserting anything. INSERT product row → INSERT bundle_items → recomputeBundleCost — all in one `db.transaction(() => {...})()`. Any throw rolls back the product row too.
- **ComponentsTab controlled mode.** Added `controlledItems` + `onControlledItemsChange` props (both optional). When provided, ComponentsTab is controlled — items live in parent (EditBundle's `draftItems`), the tab's own "บันทึกรายการ" button is hidden (parent's main "สร้างชุดสินค้า" commits everything atomically). Edit-mode keeps original uncontrolled behavior (local state + `products:saveBundleItems`).
- **Labels tab hidden in new mode.** No product id to attach labels to. Reappears after first save when route redirects to `/products/bundles/:id/edit`.

### Defense layers blocking `< 2` components
1. **UI: parent button disabled** — `disabled={saving || (isNew && draftItems.length < 2)}` on EditBundle's main button, with tooltip "ต้องเพิ่มรายการอย่างน้อย 2 รายการก่อน".
2. **UI: ComponentsTab Save button disabled** — same rule in edit mode, with footer warning "ต้องมีรายการอย่างน้อย 2 รายการ (1/2)" in destructive text when count is 1.
3. **UI: handleSave pre-validate** — both paths toast-error + switch to the components tab if user bypassed the disabled state.
4. **Backend: `products:createBundle`** — `if (!items || items.length < 2) throw new Error('ชุดสินค้าต้องมีรายการอย่างน้อย 2 รายการ')` before opening the transaction.
5. **Backend: `products:saveBundleItems`** — same guard inside the existing transaction (defends edit-mode against IPC-direct callers who'd delete components to 1).
6. **Transactional rollback** — if INSERT product succeeds but any INSERT bundle_items fails (e.g. concurrent component delete), the product row is rolled back too. No orphan.

### Why atomic-create > auto-delete-on-exit
- Auto-delete leaves edge cases: crash mid-edit, route navigation via browser back, hard refresh, electron-window-X. Each one would have to be hooked.
- Atomic-create has no "draft" state in DB to lose. The page can be force-closed at any moment with zero side effects.
- Cleaner separation: the new-mode form is just React state until the user explicitly commits. No background IPC to clean up.

### Files touched
- **`electron/ipc/products.ts`** — new handler `products:createBundle` after `products:create`; pre-existing `products:saveBundleItems` guard for `< 2` (from earlier in this session, now formally part of the layered defense).
- **`electron/preload.ts:37-38`** — exposes `products.createBundle({ product, items })`.
- **`src/App.tsx:60`** — added `<Route path="products/bundles/new" element={<EditBundle />} />` above the existing `/:id/edit` route.
- **`src/pages/Products/BundlesList.tsx:102-107`** — `handleCreate` collapsed from 18 lines (units fetch + products.create + navigate) to 1 line (`navigate('/products/bundles/new')`).
- **`src/pages/Products/EditBundle/index.tsx`** — `isNew` detection, dual-mode `loadAll` (skips product fetch + label lookups in new mode, sets default unit_id from "ชุด"), `draftItems` state, `handleSave` branches new→`createBundle` (with `navigate(..., { replace: true })`) vs edit→`update`, 4-card row computes from form/draftItems in new mode, "ยังไม่บันทึก" warning badge in meta card, Labels tab hidden in new mode, main button label "สร้างชุดสินค้า" + disabled rule.
- **`src/pages/Products/EditBundle/ComponentsTab.tsx`** — `DraftItem` exported, `Props.product` + `Props.productId` widened to nullable, added `controlledItems` + `onControlledItemsChange`, `items`/`setItems` switch between controlled+local via `isControlled` flag, seed-from-server effect skipped when controlled, search filter skips `productId` add when null, internal Save button hidden when controlled.
- **`src/pages/Products/EditBundle/PriceTab.tsx`** — `Props.product` widened to `FullProduct | null`, cost falls back to `product?.cost_price || 0`.

### Why ComponentsTab controlled-mode prop (vs lifting all state)
Edit-mode keeps two-tier saves on purpose: changes in ComponentsTab persist via `saveBundleItems` independently from changes to the bundle's name/price/etc. (mirrors LabelsTab's flow). Lifting ALL items to parent in both modes would have flattened that into one big save and broken the per-tab dirty model. The minimal change — `controlledItems` only kicks in when explicitly provided — preserves edit-mode behavior 1:1.

---

## Session 2026-05-20e — Phase 5 / ขย.9 บัญชีการซื้อยา — ✅ DONE 2026-05-20 (tsc clean, NOT click-tested)

> Self-contained. Operator dropped the official PDF template from `papc.pharmacycouncil.org` and asked for an on-screen + printable ขย.9 report inside `/reports`. The current `/reports/fda` tab was a placeholder ("อยู่ระหว่างพัฒนา"); user wanted "ทำเป็น card หลักด้านบน ยังมี ขย13 11 อีก" — so the tab was repurposed as a multi-form hub with ขย.9 as the first card, ขย.11 / ขย.13 wired as disabled-with-badge placeholders. Pre-coded via plan→audit→implement workflow: plan drafted (v1) → 2 external LLMs audited (Gemini, Deepseek) → v2 with corrections folded in → implemented. No click-test yet.

### The template (per the official PDF)
A4 landscape, single page. Top-right `แบบ ข.ย. ๙`, centered `บัญชีการซื้อยา`, dotted subtitle line filled with `(ชื่อสถานที่ขายยา)`, then ONE 8-column table — `ลำดับที่ / วัน เดือน ปี ที่ซื้อ / ชื่อผู้ขาย / ชื่อยา / เลขที่หรืออักษรของครั้งที่ผลิต / จำนวน / ปริมาณ / ลายมือชื่อผู้มีหน้าที่ปฏิบัติการ / หมายเหตุ`. No footer, no totals, no signature blocks at the bottom (operator signs per-row). Filled vs blank looks identical → filler empty rows on short result sets are part of the official look.

### Audit findings (v1 → v2 plan)
| # | Source | Fix |
|---|---|---|
| 1 | Both | SQL join wrong — `purchase_receipts.invoice_no` is the PK; `purchase_receipt_items.invoice_no` is the FK. There is NO `id` column on the header and NO `receipt_id` on items. Joined on `pr.invoice_no = pri.invoice_no`. |
| 2 | Both | Filename: `FdaReports.tsx`, not `Fda.tsx` (App.tsx imports `FdaReports`). |
| 3 | Deepseek | Route restructure: the existing flat `<Route path="fda" element={<ReportsFda/>}>` can't hold a child without ReportsFda having its own `<Outlet/>`. Refactored to a parent-without-element with index + child: `<Route path="fda"><Route index .../><Route path="khor-yor-9" .../></Route>`. `ReportsLayout.resolveTab()` already uses `startsWith('/reports/fda')` so the tab pill highlights on both URLs. |
| 4 | Deepseek | Missing `AND p.is_bundle = 0` — bundles can carry `is_drug=1` as a category hint but are never bought as one SKU (purchases hit their component lots). Without this, phantom bundle rows could appear on ขย.9. |
| 5 | Gemini | `electron/ipc/reports.ts` already exists with 8 handlers — append the new handler, don't create a new file. |
| 6 | Gemini | Settings IPC is `getShop`, not `shopSettings` (CLAUDE.md was slightly stale). |

Bonus: added explicit loading skeleton (N=16 rows pulse), `text-xs italic` empty hint inside `.no-print` (so blank prints stay clean), `qty REAL` formatter (`100`, not `100.0`; `0.5` kept; `1.25` kept).

### What shipped
- **`electron/ipc/reports.ts:389-422`** — new handler `reports:khorYor9({ date_from, date_to })`. SQL with audit-corrected join + `is_drug=1 AND is_bundle=0 AND status='completed' AND cancelled_at IS NULL`, drug name = `COALESCE(NULLIF(p.name_for_print,''), p.trade_name)`, unit = base unit via `LEFT JOIN item_units u ON u.id = p.unit_id`. Ordered by `pr.created_at, pri.invoice_no, pri.id`.
- **`electron/preload.ts:85`** — exposes `window.api.reports.khorYor9({ date_from, date_to })`.
- **`src/lib/thaiDate.ts`** (new) — `formatThaiShortBE('2026-05-20')` → `'20 พ.ค. 2569'`. Reusable for ขย.11/13.
- **`src/pages/Reports/KhorYor9.tsx`** (new) — A4 landscape preview (`width: 1123px; min-height: 794px`, padding `32px 40px`) sized to look exactly like the PDF on-screen and on the printed page (WYSIWYG — no separate print template). Filter strip on top with back-link icon + `DateRangePicker` (`w-60 shrink-0`) + Print button. Inside the preview: relative-positioned `แบบ ข.ย. ๙` top-right, centered title, dotted underline with `shop_name` (fetched once on mount via `window.api.settings.getShop()`), 8-column `<colgroup>`-fixed table with all-bordered cells, skeleton during load, filler rows to a minimum of 16 (matches official paper look on short result sets).
- **`src/pages/Reports/FdaReports.tsx`** (rewrite) — placeholder swapped for a `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` of 3 cards: ขย.9 (enabled `<Link>` with `bg-primary-soft` icon + `<ArrowRight>`), ขย.11 + ขย.13 (disabled `<div aria-disabled>` with `opacity-60 cursor-not-allowed` + `<Badge variant="warning">เร็วๆ นี้</Badge>`). Outlet-context wiring (`setSummary(null)`) preserved.
- **`src/App.tsx:25,67-72`** — `lazy(() => import('./pages/Reports/KhorYor9'))` added; `/reports/fda` route restructured per audit fix #3.
- **`src/pages/Reports/index.tsx:53-78`** — `<PageHeader>` + Tabs + summary-card grid wrapped in `<div className="no-print contents">` so the ReportsLayout chrome disappears at print time without disturbing layout otherwise (`contents` makes the wrapper transparent to flex/grid).
- **`src/components/layout/Sidebar.tsx:101`** + **`src/components/layout/TitleBar.tsx:30`** — `no-print` class added.
- **`src/index.css`** (appended after font declarations) — first `@media print` block in the codebase. `@page { size: A4 landscape; margin: 8mm }`, `.no-print { display: none !important }`, `.print-area` switches to `position: absolute; inset: 0; width: 100%; padding: 8mm 10mm` and strips shadow/radius, `thead { display: table-header-group }` repeats column headers on each printed page, `tr/td/th { page-break-inside: avoid }`.

### Why the page itself owns the table styling (not the global `Table` primitive)
`src/components/ui/table.tsx` carries the project's sticky-muted-`<thead>` defaults — correct for in-app list/report tables, wrong for a printed official form which needs an all-bordered white grid. Inlined the form-table styles (`<table className="border-collapse" style={{ tableLayout: 'fixed' }}>` + `border border-foreground/80` per cell + `<colgroup>` percentage widths) directly inside `KhorYor9.tsx` and did NOT touch the primitive. This keeps the rule "showcase is the source of truth" intact — official-form tables are a *different* category from list tables and shouldn't reshape the primitive.

### Hotfix during testing
DateRangePicker stretched past the filter strip — root cause was forgetting `w-60 shrink-0` (canonical from `Manage/Sales.tsx:163-168`). Added in same session.

### Files moved
- `docs/plans/report-khor-yor-9.md` → `docs/plans/done/`
- `docs/audits/report-khor-yor-9_auditresult_gemini.md` → `docs/audits/done/`
- `docs/audits/report-khor-yor-9_auditresult_deepseek.md` → `docs/audits/done/`

### Forward note for ขย.11 / ขย.13
The 3-card hub already exists with placeholders. To enable: add new IPC handlers in `reports.ts` (sales-side this time), new pages mirroring `KhorYor9.tsx` shape, flip the card's `enabled: false → true`, and add `<Route path="khor-yor-11/13">` next to the existing nested route. `thaiDate.ts` + `.print-area` infra are already reusable.

---

## Session 2026-05-20d — Product Bundle audit (3 sources) + 6 critical fixes + RangeError hotfix — ✅ DONE 2026-05-20 (tsc clean, NOT click-tested)

> Self-contained. Audit-driven session immediately after Phase 1+2 shipped (Session 2026-05-20c). Operator ran 3 independent code-reviewing LLMs over the bundle commits (`1d794e1` + `034d887`) and the audit-request brief at `docs/audits/done/product-bundle-audit-request.md`. The three reports were merged + de-duped; 6 critical findings were addressed in this session. Plan + audit-request docs moved to `docs/{plans,audits}/done/` as part of the wrap-up.

### Audit sources
- **CC (Claude main session)** — caught aggregate accounting (C2), return-of-a-return UX path (C3), expireLot cost gap (C5), plus 11 minor findings
- **Audit A (Deepseek-class)** — caught voidSale `SELECT sil.*, si.product_id` column collision (C1), confirmed purchase guard gap (C4), `saveBundleItems` validation gaps
- **Audit B (Gemini-class)** — caught expireLot cost gap (C5), returnBundle reopen-without-recompute (C6), confirmed purchase guard (C4)

Merge table: 5 critical confirmed by ≥2 sources, 1 unique to each. Final ordered TODO produced by CC, executed inline.

### 6 critical fixes shipped

**C1 — voidSale column collision** (`reports.ts:175-188`)
- Old: `SELECT sil.*, si.product_id FROM sale_item_lots sil JOIN sale_items si ...`
- Both tables carry `product_id`; better-sqlite3 row mapper takes the later column (= `si.product_id` = bundle id, not the component id stored on `sil`). For a voided bundle sale, the subsequent `INSERT INTO stock_movements (product_id, ...)` recorded the BUNDLE id instead of the component, corrupting the audit trail.
- Fix: drop `si.product_id` (dead column — never read in the loop body); JOIN stays for the `sale_id` filter.
- Bonus tightening: query now also filters `si.is_cancelled = 0` so a bundle that was already returned via `pos:returnBundle` is skipped at the higher level (no longer relies on a `sil.is_cancelled=1` marking — see C2).

**C2 — returnBundle aggregate accounting (Option 3 refactor)** (`pos.ts:430-450`, `reports.ts:185-189`)
- Old: returnBundle marked the original `sale_item_lots.is_cancelled=1` AND inserted RT- mirror rows at `is_cancelled=0`. Reports filter `sil.is_cancelled=0` everywhere — so the original bundle's cost was excluded (via 1) AND the RT- mirror contributed negative cost. Across any date range spanning both bills, the bundle cost was effectively subtracted TWICE → aggregate `total_cost` understated by bundle cost → aggregate profit overstated by the same amount.
- Considered "Option B" (insert mirror at `is_cancelled=1`) but rejected — it leaves the RT- bill's per-bill profit display showing `-line_total` (off by bundle cost in the other direction).
- **Option 3 (shipped):** Don't mark `sale_item_lots.is_cancelled` at all in `pos:returnBundle`. Original bundle's sil contributes positive cost; RT- mirror contributes negative cost; aggregate nets to exactly 0 cost from the bundle (matches "sold then refunded" reality). `reports:voidSale` now skips the bundle's sil via the parent `si.is_cancelled=1` flag, which `pos:returnBundle` still sets.
- Net: aggregate accounting correct, original-bill display sane (bundle row line-through, item_cost = full), RT-bill display sane (item_cost = -full, profit = -line_total + cost = recovered portion).

**C3 — return-of-a-return guard** (`pos.ts:386-398`, `SaleDetailDialog.tsx:125-138`)
- The RT- bill (sale_type='return') has a bundle `sale_items` row with `is_cancelled=0` (fresh row) and `qty<0` (mirror). All four pre-existing `pos:returnBundle` validators pass for it (`is_bundle=1` from products table, `is_cancelled=0`, `sale_status='completed'`, no double-return marker). Operator opens an RT- bill → "คืนชุด" button shows → clicks → handler proceeds → stock-restore loop does `qty_on_hand += sil.qty` where `sil.qty` is negative → **DEDUCTS** stock instead of restoring.
- Backend: added `if (Number(si.qty) <= 0) throw 'รายการนี้เป็นการคืนสินค้าอยู่แล้ว — คืนซ้ำไม่ได้'`.
- UI: `canReturn` now also returns false for `detail.sale_type === 'return'` and `item.qty <= 0`.

**C4 — purchase:save / purchase:cancel `assertNotBundle` guards** (`purchase.ts:131-132, 409`, `pricing.ts:13-24`)
- Plan called for backend rejection of bundles on every stock/lot handler. Phase 1 covered 5 in `products.ts` but missed both purchase handlers. Purchase page uses `pos:searchProducts` (no `is_bundle` filter) → bundle products show up in the GR picker → operator could (and the schema would let them) write a `product_lots` row for a bundle product, pwning the "bundles have no lots" invariant + the `STOCK_EXPR` CASE WHEN logic.
- Moved `assertNotBundle` helper from `products.ts` (where it was a local fn) to `electron/db/pricing.ts` so `purchase.ts` can use it without cross-IPC imports. `products.ts` now imports it from `pricing.ts` like the recompute helpers.
- Added guard in `purchase:save` item-loop and `purchase:cancel` line-loop (defense in depth — once save guards, cancel can never see a bundle line, but the redundant check makes any future bypass surface clearly).

**C5 — expireLot cost propagation** (`products.ts:898-905`)
- `products:expireLot` (System C disposal) sets `qty_on_hand=0, is_closed=1` but didn't call `recomputeAvgCost` / `propagateCostToBundles`. The `is_closed: 0→1` transition removes the lot from the weighted-avg pool (recompute's WHERE filter is `is_closed=0 AND qty_received>0`), so the open-lot composition changed but cost stayed stale until an unrelated stock event happened to fire a recompute. Bundles depending on this component were stale too.
- Fix: two-liner after the UPDATE — `recomputeAvgCost(db, lot.product_id) + propagateCostToBundles(db, lot.product_id)`.

**C6 — returnBundle cost recompute after lot reopen** (`pos.ts:455, 485-486`)
- When restoring stock to a closed component lot, `pos:returnBundle` correctly toggled `is_closed: 1→0` (so FEFO can see the restored qty) — but didn't trigger a cost recompute. The reopen brings the lot BACK into the weighted-avg pool, which means `products.cost_price` is now stale (was computed without this lot, should include it again).
- Captured `wasClosed = lot.is_closed === 1` BEFORE the UPDATE so we can branch on the actual transition, then `if (wasClosed) recomputeAvgCost + propagateCostToBundles`. Pure qty restores on an already-open lot DON'T recompute — `qty_received` (which is what the weighted-avg keys on) is unchanged, so the avg is identical.

### Hotfix — `products:create` RangeError on bundle quick-create
- After C4, operator clicked "+ เพิ่มชุดสินค้า" → `Missing named parameter "barcode"` from better-sqlite3. The INSERT in `products:create` uses `@`-named params (barcode, barcode2, barcode3, barcode4, name_for_print, category_id, …). `BundlesList.handleCreate` only passed a subset of fields (trade_name, is_bundle, prices, etc.) — the spread `{...data, code, ...}` left the other `@` params undefined → RangeError. EditProduct happened to fill them all so this never tripped pre-bundle.
- Fix: build params with an explicit `defaults` object covering every column the INSERT names, then spread `data` on top so caller-provided fields win. Bonus: same change folded in the M9 audit-suggestion to enforce `is_bundle=1 ⇒ is_stock_item=0` at the IPC level (no longer relies on every caller getting that right).

### Files touched
- `electron/db/pricing.ts` — exported `assertNotBundle` helper (10 lines)
- `electron/ipc/products.ts` — removed local `assertNotBundle` (now imports), C5 expireLot recompute, hotfix defaults block, force `is_stock_item=0` when bundle
- `electron/ipc/purchase.ts` — import `assertNotBundle`, guards in save loop + cancel loop
- `electron/ipc/pos.ts` — import recompute helpers, C2 (removed sil.is_cancelled mark + reverted mirror INSERT), C3 (`Number(si.qty) <= 0` guard), C6 (recompute after reopen)
- `electron/ipc/reports.ts` — C1 (dropped `si.product_id` from SELECT) + C2 (added `si.is_cancelled = 0` filter)
- `src/components/dialogs/SaleDetailDialog.tsx` — C3 UI guards (sale_type='return', qty<=0)

### Verification (audit cheat-sheet greps)
- `SUM(qty_received * cost_price)` outside `pricing.ts`: only `dev.ts` seed script — clean
- `assertNotBundle` usage: 7 sites (5 products.ts + 2 purchase.ts), plus 1 definition in pricing.ts
- Cross-redirect guards: present in EditProduct, EditBundle, POS, SaleDetailDialog
- `npx tsc --noEmit` — clean

### Minor / suggestion findings — deferred (still in TODO)
Carried forward (not blocking click-test): voidSale + returnItems don't reopen closed lots (M1+M2); `saveBundleItems` allows `items=[]` and doesn't validate `is_stock_item=1` on components (M3+M4); `expireLot` no `assertNotBundle` (M5, self-limits via lot lookup); SaleDetailDialog profit display weirdness on cancelled bundle row (M6 — addressed for aggregate by C2 but per-bill view still arguable); ComponentsTab drag-reorder UI missing (M7); `/products/bundles/new` route not registered (M8 — quick-create path works without it); `reports:getSale` doesn't return bundle fields (M10 — only `getSaleByInvoice` does); `pos:searchProducts` bundle_items query doesn't filter disabled components (M11). G1 `getDailyStats` bill-count includes RT- rows is a pre-existing concern.

---

## Session 2026-05-20c — Product Bundle (ชุดสินค้า) Phase 1 + 2 — ✅ DONE 2026-05-20 (tsc clean, NOT click-tested)

> Self-contained. Two commits: `1d794e1` (Phase 1 — sell as one, deduct as many) + `034d887` (Phase 2 — whole-bundle return from sale detail). The full design lives at [`docs/plans/done/product-bundle-phase1.md`](docs/plans/done/product-bundle-phase1.md) — pre-audited by operator + Deepseek + Gemini before any code was written; every audit finding (route convention, backend guards, 4× SQL duplication, stockStats/lowStock bundle leak, `last_cost_price` mirror, NULL-lot edge case, etc.) was folded into the plan before exit-plan-mode. Read that doc for the design rationale — this entry only logs what shipped.

### Goal
Sell a "ชุดสินค้า" (e.g. *ชุดยาแก้ปวด* = Ibuprofen ×1 + Norgesic ×1) as **one cart line** with its own barcode / retail+wholesale price / unit / dispensing label, while still deducting each component's stock via FEFO. Void + return must work as if it were a single product. The "just make it a standalone product" workaround was rejected (component stock wouldn't move).

### Load-bearing assumption (verified)
`sale_item_lots.product_id` is independent of `sale_items.product_id`. `reports:voidSale` (`electron/ipc/reports.ts:145-173`) restores per-row by **`sale_item_lots.product_id`**. So writing 1 `sale_items` row (bundle) + N `sale_item_lots` rows (each tagged with the *component's* `product_id`) makes void work for free — **zero code change in reports.ts**.

### Locked design decisions (vs. PHP-original BOM systems)
| Topic | Decision |
|---|---|
| Data model | `products.is_bundle` flag + new `product_bundle_items(bundle_id, component_product_id, qty_per_bundle, sort_order)` |
| Bundle row | `is_bundle=1`, `is_stock_item=0` (no own lots — stock derived) |
| Price | Manual on bundle row (retail/wholesale1/wholesale2) |
| Cost | Auto = Σ(component.cost_price × qty_per_bundle); propagates from GR/adjust/lot-edit via shared helper |
| Stock | Derived `MIN(component_open / qty_per_bundle)` — never below 0 |
| Overselling | Allowed (same as single products) — short component → `sale_item_lots.lot_id = NULL` |
| Return | Whole bundle only (Phase 2). No per-component partial return. |
| Nested bundles | Blocked at save (`component.is_bundle === 0`) |
| Units | v1 base-unit only. No "แพ็ค 3 ชุด" yet. |
| Codes | v1 reuses `P` sequence — no separate `B` prefix |
| Mutability | Bundles immutable as bundles — no toggle in/out (created via "+ เพิ่มชุดสินค้า" only) |
| Component picker | Extended `products:list` with `is_bundle` filter (vs. dedicated IPC) |
| Cost recompute | Extracted to shared `electron/db/pricing.ts` — replaces 4× duplication |
| Page split | `/products` is now a Tabs page (สินค้า / ชุดสินค้า), each child has its own list filter |
| Routes | Mirror existing convention: `/products/bundles/new` + `/products/bundles/:id/edit` |
| Labels | EditBundle imports `EditProduct/LabelsTab` as-is — `product_labels` is product-agnostic |
| Guards | Cross-redirect (bundle ↔ non-bundle pages); backend rejects `is_bundle=1` on 5 stock/lot handlers |
| Walk-in customer | Walk-in remains C0000 row, never NULL (existing invariant preserved across return flow) |

### What shipped — Phase 1 (commit `1d794e1`)

**Schema** (`electron/db/schema.ts`)
- `products.is_bundle INTEGER DEFAULT 0` + safe-ALTER migration
- `product_bundle_items` table (UNIQUE bundle_id+component_product_id; indexes on both)

**Shared pricing helpers** (NEW `electron/db/pricing.ts`)
- `recomputeAvgCost(db, productId)` — weighted-avg over open lots
- `recomputeBundleCost(db, bundleId)` — Σ(component_cost × qty_per_bundle); also mirrors to `last_cost_price`
- `propagateCostToBundles(db, componentId)` — fans out after every cost-changing event
- Replaces 4× inlined SQL: `products.ts:adjustStock`, `products.ts:updateLot`, `purchase.ts:save`, `purchase.ts:cancel`

**Backend** (`electron/ipc/products.ts` + `purchase.ts` + `pos.ts`)
- `STOCK_EXPR` CASE WHEN — bundle-aware stock subquery, shared by `list` + `stockStats` + filters
- `products:list` — new `is_bundle?: 0 | 1` filter param + `component_count` subquery + bundle-aware stock_qty
- `products:stockStats` — `is_bundle` filter; `total_all` gated by same filter (was leaking)
- `products:lowStock` — hardcoded `AND p.is_bundle = 0` (defense in depth — reorder_point already excluded them, but explicit is better)
- `products:get` — bundle rows attach `bundle_items[]` (joined trade_name + unit + cost + component_stock)
- `products:create` — `is_bundle` in INSERT (named-param allow-list — safe vs Object.keys trap)
- NEW `products:getBundleItems` + `products:saveBundleItems` (transactional; validates not-self / not-bundle / not-disabled / qty>0)
- Backend guards on 5 handlers: `adjustStock` / `adjustLot` / `adjustLotBatch` / `updateLot` / `getLots` throw "ทำรายการสต็อกกับชุดสินค้าไม่ได้" if target `is_bundle=1`. `getLots` returns `[]` rather than throwing (less surprising for defensive callers).
- `purchase:save` + `purchase:cancel` — switched to shared helpers; bundle cost now propagates after every GR / GR-cancel (critical fix from audit Source 2)
- `pos:saveBill` — FEFO loop extracted to `deductFefo()` at module scope; bundle branch resolves `is_bundle` from products, loops `product_bundle_items`, calls helper per component (preserves `qty_per_base` math; v1 bundles always base-unit so multiplier is 1). `sale_items` is always **1 row = the bundle**.
- `pos:searchProducts` — attaches `bundle_items[]` (each with its own `lots[]`) so POS cost preview FEFO-walks components without a second IPC round-trip

**Preload** (`electron/preload.ts`)
- `products.getBundleItems` + `products.saveBundleItems`
- `products.stockStats` payload type widened with `is_bundle`

**Frontend types** (`src/types/index.ts`)
- `Product` += `is_bundle: number`, `bundle_items?: ProductBundleItem[]`, `component_count?: number`
- NEW `ProductBundleItem` interface (id, bundle_id, component_product_id, qty_per_bundle, sort_order + joined display fields + optional `lots?: ProductLot[]` for POS payload)

**Frontend pages**
- `src/pages/Products/index.tsx` — was the products list page; now the **Tabs shell** (สินค้า / ชุดสินค้า) + `<Outlet />` (clones Manage/index.tsx precedent)
- NEW `src/pages/Products/ProductsList.tsx` — extracted from old index, with `is_bundle: 0` filter; passes `is_bundle: 0` to stockStats so cards don't inflate
- NEW `src/pages/Products/BundlesList.tsx` — bundle list with `is_bundle: 1` filter; quick-create dialog → routes to EditBundle
- `src/App.tsx` — nested `/products` with children, plus `/products/bundles/:id/edit` route (matches existing `:id/edit` convention)
- `src/pages/Products/EditProduct/index.tsx` — cross-redirect guard: if loaded product `is_bundle === 1` → `<Navigate to="/products/bundles/:id/edit" replace />`
- NEW `src/pages/Products/EditBundle/{index,GeneralTab,PriceTab,ComponentsTab}.tsx`:
  - **GeneralTab** — bundle-appropriate fields only (no drug-info, no stock-alert, no FDA flags, no antibiotic — those don't apply)
  - **PriceTab** — retail/wholesale editable; cost is **read-only** (auto-computed from components, updates after `saveBundleItems` or any component cost change)
  - **ComponentsTab** — debounced product autocomplete (calls `products:list` with `is_bundle: 0`); table with qty_per_bundle Input, cost-each, stock; "บันทึกส่วนประกอบ" persists via `saveBundleItems`. Drafts are local until save (CategoriesTab snapshot pattern). Disabled when not dirty.
  - **Labels** — reuses `EditProduct/LabelsTab` as-is — `product_labels` table is product-agnostic
  - Reciprocal cross-redirect guard back to `/products/:id/edit` if `is_bundle === 0`
- `src/pages/POS/index.tsx`:
  - **Cost preview** (payment modal) — branches on `is_bundle`; FEFO-walks EACH component's `bi.lots` reusing the same `lotRemaining` Map (so multi-line cart with shared components doesn't double-count)
  - **Cart row** (payment modal cart summary) — bundle rows show sub-text `ประกอบด้วย: Ibuprofen ×1, Norgesic ×1` under the line_total
  - **Cart row** (main cart) — bundle rows replace the unit-picker `<Button>` with a static `<div>` (base-unit-only in v1, no menu to open)

### What shipped — Phase 2 (commit `034d887`)

**Backend** (`electron/ipc/{reports,pos}.ts`)
- `reports:getSaleByInvoice` — each sale_item row now includes `is_bundle` (LEFT JOIN products); bundle rows attach `component_lots[]` — joined `sale_item_lots` × products × item_units × product_lots (component_name, lot_number, expiry, cost_price). One IPC round-trip serves the whole expand UX.
- NEW `pos:returnBundle({ sale_item_id, reason, created_by, customer_id? })`:
  - Validates: sale_item is a bundle, not already cancelled, sale not voided
  - Emits `RT-YYYYMMDD-NNN` invoice; negative `sales` row + 1 negative `sale_items` (the bundle) + N negative `sale_item_lots` (mirror originals)
  - Restores each lot's `qty_on_hand` (reopens `is_closed=1` lots so FEFO can see them again)
  - Logs `sale_return` stock movement per component
  - **Marks original `sale_item_lots.is_cancelled = 1`** so a later `voidSale` of the whole bill doesn't double-restore
  - **Marks original `sale_items.is_cancelled = 1`** so SaleDetailDialog renders line-through and re-disables the button
  - Skips `lot_id IS NULL` rows for stock restore (known shared limitation with void)

**Preload** — `pos.returnBundle`

**Frontend**
- `src/components/dialogs/SaleDetailDialog.tsx` — major refactor:
  - `SaleDetail.items` now typed as `BundleSaleItem[]` with optional `is_bundle` + `component_lots[]`
  - Bundle rows show a `Badge variant="tertiary"` "ชุด" chip + chevron toggle (`ChevronRight`/`Down`) revealing an inline `<table>` of component_lots (component / lot / expiry / qty / cost / line_total) below the bundle row (row-span trick — `<TableRow><TableCell colSpan={10}>` with the inline table inside)
  - Per-row "คืนชุด" `Button variant="warm" size="sm"` — only renders when `canReturn(item)` (bundle + not cancelled + sale not voided + `onVoidRequest` provided as host signal)
  - Wires to internal `<ConfirmDialog>` with `requireReason` + presets; calls `pos.returnBundle`; refetches detail on success; emits optional `onChanged()` so host pages refresh
  - Footer "ยกเลิกบิล" + "ปิด" buttons unchanged
- `src/pages/POS/index.tsx` — `handleReturnSelectProduct` early-returns with toast "คืนชุดสินค้าให้ทำผ่านหน้าบิล … ประวัติการขาย → คืนชุดนี้" when the picked search result is `is_bundle=1`. Prevents staff from trying to "manual return" components — which would lose the original-lot trace.

### Files

**Modified (Phase 1):** `electron/db/schema.ts`, `electron/ipc/products.ts`, `electron/ipc/purchase.ts`, `electron/ipc/pos.ts`, `electron/preload.ts`, `src/App.tsx`, `src/pages/POS/index.tsx`, `src/pages/Products/EditProduct/index.tsx`, `src/pages/Products/index.tsx`, `src/types/index.ts`

**Created (Phase 1):** `electron/db/pricing.ts`, `src/pages/Products/ProductsList.tsx`, `src/pages/Products/BundlesList.tsx`, `src/pages/Products/EditBundle/{index,GeneralTab,PriceTab,ComponentsTab}.tsx`

**Modified (Phase 2):** `electron/ipc/reports.ts`, `electron/ipc/pos.ts`, `electron/preload.ts`, `src/components/dialogs/SaleDetailDialog.tsx`, `src/pages/POS/index.tsx`

### Known limitations carried forward
- **Oversold + void/return leaves the NULL-lot row uncancelled** — pre-existing for single products too, bundles inherit. Out of scope to fix here (would need a write-off mechanism).
- **Phase 2 return is whole-bundle only** — no per-component partial return.

### Out of scope (future)
- Bundles in non-base units ("แพ็ค 3 ชุด")
- FDA propagation through bundles (Phase 5 territory once อย. spec arrives)
- Merge component dispensing labels at sale time (Phase 3?)
- B-prefix code sequence
- Re-classifying an existing product as a bundle, or unbundling

### ⚠️ Next session — click-test
Critical scenarios:
1. **Create bundle** at `/products/bundles` → quick-create → routes to EditBundle. Set price, add 2 components (Ibu + Nor), save. Verify `cost_price` updates to Σ(component_cost × qty_per_bundle).
2. **Sell** the bundle in POS — scan bundle barcode → 1 cart line, bundle price. Payment modal: "ประกอบด้วย: …" visible, cost preview matches Σ(FEFO-lot cost × qty_per_bundle), unit chevron HIDDEN on the bundle row. Pay. Check DB: 1 sale_items row (bundle_id), ≥2 sale_item_lots (component product_ids, correct FEFO lots), `product_lots.qty_on_hand` ↓ on components, `stock_movements` 'sale' per component.
3. **Manage/Sales** detail → expand the bundle row → see component breakdown. Profit = sum across components.
4. **Cost propagation** — Purchase page: GR a new Ibu lot at a higher cost → reopen bundle in EditBundle → `cost_price` reflects new component cost. Repeat via lot-edit + adjustStock to verify all 3 paths fire `propagateCostToBundles`.
5. **Void the bundle sale** (POS "ยกเลิกบิล" or Manage/Sales detail) — verify both components restored to original lots; `stock_movements` 'sale_return' per component; original sale `status='voided'`.
6. **Return ONE bundle line** (Phase 2) — Manage/Sales → detail → "คืนชุด" → confirm with reason → check: new RT- bill, components restored to original lots, original sale_item shows line-through, original sale_item_lots.is_cancelled=1.
7. **Then void the original sale** (after returning the line) — verify NO double-restore (is_cancelled=1 rows are skipped by voidSale).
8. **POS manual return modal** — scan a bundle barcode → toast appears, no row added.
9. **Backend guards** — try `products.adjustStock(bundleId)` directly via DevTools → throws.
10. **Cross-redirect** — navigate to `/products/<bundleId>/edit` → bounces to `/products/bundles/<bundleId>/edit`. And vice versa.
11. **stockStats** on `/products` (สินค้า tab) — "หมดสต็อก" / "ใกล้หมด" / "สินค้าทั้งหมด" do NOT inflate from bundles.

---

## Session 2026-05-20b — Topbar control-height standardization (`h-10`) + Purchases.tsx showcase alignment — ✅ DONE 2026-05-20 (tsc clean, NOT click-tested)

> Self-contained follow-up to Session 2026-05-20. The previous sweep folded the toolbar into the card top bar but left every control at `h-9`, which silently fought the `h-10` defaults of `DateInput` / `DateRangePicker` / `Combobox`. Spotted because `Manage/Sales.tsx` was forcing `DateRangePicker` to `h-9` to match the `h-9` search Input — fixing that one tangle unraveled the full inconsistency across the codebase. Resolved by bumping the **entire topbar control row to `h-10`**, then committing the rule to CLAUDE.md + showcase so it doesn't regress.

### What changed

**New HARD rule (CLAUDE.md → Standard table-card layout)**
- **Filter strip / topbar = `h-14 px-2`; every control inside = `h-10`.** Applies to Input, Select/SelectTrigger, Combobox, DateInput, DateRangePicker, `Toggle framed="input"`, Button. Most primitives default to `h-10` already — only Input / SelectTrigger / Button still need an explicit `h-10` className (Button `size="lg"` is still `h-9`, so override is required until a new size lands; doc'd inline). **The h-12 footer / inner header bar (pagination, page-size, count) keeps `h-9` controls** — separate rule, unchanged.

**Primitive change — `src/components/ui/switch.tsx`**
- `Toggle framed="input"` baked-in height: `h-9` → **`h-10`** (line 87) + leading comment updated to reference the CLAUDE.md rule. All call sites (`Products/index.tsx`, `People/index.tsx` ×3, showcase) inherit automatically.

**Showcase — `src/pages/Theme/index.tsx`**
- "Standard Table-Card Layout" demo: search Input + SelectTrigger + Add Button all bumped to `h-10`; description text rewritten to state the rule explicitly (topbar `h-10` vs footer `h-9`).
- "Toggle framed='input'" DemoRow: label + paired search Input updated to `h-10`.

**Files re-aligned to `h-10` in topbar (Input / SelectTrigger / Button / DateRangePicker)**
- `src/pages/Settings/UnitsTab.tsx` · `DrugTypesTab.tsx` · `CategoriesTab.tsx` (incl. reorder-mode "ยกเลิก" + "เสร็จสิ้น" buttons)
- `src/pages/Products/index.tsx` (Input + 2 SelectTriggers + Add button)
- `src/pages/Products/EditProduct/HistoryTab.tsx` (DateRangePicker — removed `h-9` override → uses default `h-10`; "ล้างวันที่" Button + movement-type filter chip Buttons get `h-10`)
- `src/pages/People/index.tsx` (3 sub-tabs: customers / suppliers / staff — Input + Add buttons)
- `src/pages/Manage/Sales.tsx` (Input bumped; DateRangePicker `h-9` override removed)
- `src/pages/Manage/Purchases.tsx` (Input bumped; Combobox + DateRangePicker now use default `h-10`)
- `src/pages/Manage/Expiry.tsx` (Input + preset filter chip Buttons + SelectTrigger)
- `src/pages/Manage/LowStock.tsx` (Input + SelectTrigger + "ไปหน้ารับสินค้า" Button)

**Verification:** `grep -rn "h-9 pl-9\|h-9 w-44\|h-9 w-60\|h-9 flex-1 min-w-0" src/pages` → no remaining stray `h-9` in any topbar control. Footer pagination Selects (`h-9 min-w-20`) intentionally left alone.

### Bonus — `Manage/Purchases.tsx` brought into full showcase compliance
While inspecting the topbar, the rest of the table was audited too. Changes:
- **Row interaction:** removed the full-row `onClick` + `cursor-pointer`; added a "จัดการ" column with a square `<Button size="icon-lg" variant="warm">` containing an `Info` icon (matches `Manage/Sales.tsx` canonical pattern).
- **Column order:** วันที่ → เลขที่ใบรับ → ผู้จัดจำหน่าย → รายการ → ยอดรวม → สถานะ → จัดการ (was: เลขที่ใบรับ → ผู้จัดจำหน่าย → วันที่ → … ).
- **Cell styling — matched showcase defaults:**
  - Removed `text-foreground-subtle` from value cells (วันที่ / ผู้จัดจำหน่าย / รายการ) → use default foreground.
  - Removed every `<Badge ... className="text-sm px-1.5 py-0">` override → plain `<Badge variant="...">` with default sizing.
  - เลขใบรับ: `font-semibold` → `font-mono` (matches the invoice column in `Sales.tsx`).
  - ยอดรวม: `font-bold` → `font-semibold`.
  - วันที่: added `whitespace-nowrap`.
  - Updated all `colSpan={6}` → `colSpan={7}` after adding the action column.

### Why the `h-10` direction (not `h-9`)?
The CSS-in-component defaults of `DateInput`, `DateRangePicker`, and `Combobox` are all `h-10`. Overriding them to `h-9` to match other controls had two costs: (a) the calendar-button position desyncs inside `DateInput` when its inner Input is forced shorter than the wrapper (already documented in CLAUDE.md primitives section); (b) every page picked up "manual h-9 override on DateRangePicker" as boilerplate. Bumping the other three (Input / Select / Button) to `h-10` is the cheaper direction and matches the primitive contract — only Button still needs an explicit override, which the new rule documents.

### Out of scope (NOT done)
- **Adding a Button `size` that is `h-10` with `lg`'s padding** — would let topbar Buttons drop the `className="h-10"` override entirely. Worth doing in a primitive sweep but didn't want to scope-creep this session.
- **`px-2` vs `px-5` symmetry between top and bottom bars** — still the open question from Session 2026-05-20.
- **`Reports/Finance.tsx`** — its toolbar is page-level, intentionally left out of the previous sweep; controls there weren't touched.
- **POS / Purchase-receive grid** — not list cards, skipped.

### ⚠️ Next session
1. **Click-test every page touched:** open each list page in the app and eyeball the topbar — search Input, filter Selects, filter chips, Toggle, and Add button should all sit at the same baseline (`h-10`). `DateRangePicker` should match its neighbors without forcing it.
2. The h-12 footer pagination strip should look unchanged.
3. Then resume the carried-over Session 2026-05-20 follow-ups (Phase 1–4 click-test, Settings/index.tsx sweep, `px-2`/`px-5` symmetry question).

---

## Session 2026-05-20 — Table-card top/bottom bar sweep + `Toggle framed="input"` — ✅ DONE 2026-05-20 (tsc clean, NOT click-tested)

> Self-contained. Goal: make every list/report table-card match the canonical showcase pattern — the toolbar that used to float **above** the card is folded **into** the card's top bar; the footer becomes a 3-zone bottom bar. **StatCard / MetricCard / SectionCard were explicitly NOT moved** (operator constraint — only "the line directly above the table" was in scope).

### Canonical pattern (now in `src/pages/Theme/index.tsx` → "Standard Table-Card Layout")
- **Top bar** (white, NO border): `className="px-2 h-14 shrink-0 flex items-center gap-3"` — search `<Input className="h-9 pl-9 rounded-lg text-sm bg-input">` wrapped in `relative flex-1 min-w-0` (left), then Select filters / `Toggle framed="input"` / action `<Button size="lg" className="px-2 shrink-0">` (right). **`px-2`** is deliberate: 8px ≈ the table's `border-l-8 border-r-8 border-card` inset, so the search edge lines up with the table content.
- **Bottom bar** (white, top border): `className="px-5 h-12 bg-card border-t border-border flex items-center justify-between gap-3 text-sm shrink-0"` — page-size Select (left, `flex items-center gap-2 text-muted-foreground shrink-0`), `<Pagination className="w-auto justify-center">` in a `flex-1 flex justify-center` wrapper (center), `พบ N รายการ` (right, `shrink-0`). **No pagination on a page → bottom bar is just the count, right-aligned (`justify-end`)** — never add a pager where the data isn't paged.
- Controls inside both bars are `h-9`. Bottom bar stayed `px-5 h-12` (only the top bar is `px-2 h-14`) — see Open question. **(superseded 2026-05-20b: top-bar controls are now `h-10` to match DateInput/DateRangePicker/Combobox defaults; bottom bar still `h-9`.)**

### Files changed (all tsc-clean)
- **Group A — toolbar folded into card + bottom bar rebuilt:** `Products/index.tsx`, `People/index.tsx` (×3 tabs: customers/suppliers/staff — **staff has no pagination → count-only bottom bar**), `Manage/Sales.tsx`, `Manage/LowStock.tsx` (no pagination), `Manage/Expiry.tsx` (no pagination; preset filter chips kept, moved into top bar right of search).
- **Group A exception — `Reports/Finance.tsx`:** its DateRangePicker is a **page-level** filter (also drives the payment-mix SectionCards above the table), so per operator decision the toolbar was **left in place**; only added a count-only bottom bar to the daily-trend card and dropped the count from its top strip.
- **Group B — already in-card, just re-laid-out:** `Manage/Purchases.tsx` (search/Combobox/DateRangePicker strip → showcase top bar; footer → 3-zone), `Products/EditProduct/HistoryTab.tsx` (its 2 filter bars standardized to `h-14 px-2`; bottom strip reordered → refresh button left, count right).
- **Groups C/D untouched** (Settings tabs / EditProduct LotsTab·PriceTab·UnitsTab have no above-table toolbar; POS/Purchase-receive-grid/PurchaseIntake are not standard list cards).

### New primitive mode — `src/components/ui/switch.tsx`
- `Toggle` prop widened: `framed?: boolean | "input"`.
- `framed="input"` = borderless `h-9 px-3 rounded-lg bg-input` pill that visually merges with the search `<Input>` beside it in a top bar (no `bg-card`/border so the row reads as one continuous control strip, not a popped-out chip). Plain `framed` (the old `h-10 bg-card border` pill for dialogs / tinted page bg) is **unchanged** — all existing `framed` call sites (Settings tabs, People dialogs) keep working.
- Adopted by: People ×3 (`framed border-0` → `framed="input"`), `Products/index.tsx` (was a raw `<label>`+`<Switch>` — converted to `<Toggle framed="input">`, import switched `Switch`→`Toggle`).

### Showcase kept as source of truth
Standard Table-Card top bar demo now includes the `Toggle framed="input"`; Switch section has a dedicated `framed="input"` DemoRow (shown next to a real search Input so the blend is visible) and the plain-`framed` label was clarified ("for dialogs / tinted bg"). Section description text updated for `h-14 px-2` + the framed switch.

### ⚠️ Next session
1. **Click-test the swept pages** in-app — especially: People **staff** tab (count-only bottom bar, no pager), `Reports/Finance` new bottom bar, `Manage/Purchases` footer (page-size + pager + count all wired to `histPageSize`/`histPage`/`histTotal`), `HistoryTab` two top bars + reordered bottom. Verify the `framed="input"` switch lines up flush with the search box at various widths.
2. **Open question for operator:** top bar is `px-2`, bottom bar still `px-5 h-12` — asymmetric by current decision. If they want them symmetric, change bottom bar to `px-2` in the showcase **and** every file above (one sweep).
3. Then resume the carried-over **Settings/index.tsx table-card sweep** using exactly this pattern.

---

## Session 2026-05-19c — ระบบชุดสินค้า (Product Bundle / Kit) — TODO, NOT started

> **Self-contained.** A future session can implement Phase 1 from this section alone — no prior chat context needed. Plan was researched against the live code (saveBill/FEFO, returnItems, voidSale, product model) and approved by the operator. Read `CLAUDE.md` first (UI conventions + the `products:update` Object.keys allow-list trap are load-bearing here).

### Goal
Sell a "ชุดสินค้า" (e.g. *ชุดยาแก้ปวด = Ibuprofen ×1 + Norgesic ×1*) as ONE item with its own barcode / retail+wholesale price / unit / dispensing label, but on sale it must **deduct each component's stock correctly (FEFO)** and support void + return **exactly like a single product**. "Just make it a new standalone product" was rejected — component stock wouldn't move. So: a **true composite/BOM bundle**.

### Why this is low-risk (the key insight)
`sale_item_lots` has its **own `product_id` column** (independent of `sale_items.product_id`), and `reports:voidSale` (`electron/ipc/reports.ts:~109`) already loops `sale_item_lots` restoring each lot by **that row's** `product_id`. So if the sale writes **1 `sale_items` row (the bundle) + N `sale_item_lots` rows (one per component lot, each tagged with the COMPONENT's product_id)**, then:
- **void works with ZERO code change** (it restores every component lot already)
- profit in reports (`line_total − Σ component-lot cost`) is correct automatically

### Decisions (locked with operator — do NOT re-litigate)
- **Price:** manual on the bundle row (`products.price_retail/wholesale1/2`). **Cost:** auto = `Σ(component.cost_price × qty_per_bundle)` — display/report only.
- **Stock on hand:** derived = `MIN( floor(component_open_stock ÷ qty_per_bundle) )`. **Overselling stays allowed** exactly like single products (short component → `sale_item_lots.lot_id = NULL`, no block).
- **Return:** whole bundle only (no per-component partial return).
- **No nested bundles:** a component must be a product with `is_bundle = 0` (validate when adding a component).
- v1 bundle is sold in its **base unit only** (no non-base `product_units` for the bundle yet — see Out of scope).

### Data model
1. **`products.is_bundle`** — add to `electron/db/schema.ts`: (a) in the `CREATE TABLE products` body next to `is_stock_item` (~schema.ts:93); (b) in the `migrations` safe-try/catch array (~schema.ts:483–504): `ALTER TABLE products ADD COLUMN is_bundle INTEGER NOT NULL DEFAULT 0`.
2. **New table `product_bundle_items`** — add a `CREATE TABLE IF NOT EXISTS` in the schema body after `product_units`:
   ```sql
   CREATE TABLE IF NOT EXISTS product_bundle_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     bundle_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     component_product_id INTEGER NOT NULL REFERENCES products(id),
     qty_per_bundle       REAL NOT NULL DEFAULT 1,   -- # of component (in component's BASE unit) per 1 bundle
     sort_order           INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
     UNIQUE(bundle_id, component_product_id)
   );
   ```
3. Bundle product row = `is_bundle=1`, `is_stock_item=0` (no lots of its own). Reuses all existing product fields incl. `product_labels` (the bundle's own dispensing label — existing label system works as-is).

### Backend — `electron/ipc/products.ts`
- [ ] `products:create` + EditProduct doSave allow-list: add `is_bundle` (it IS a real column — safe vs the Object.keys trap).
- [ ] New IPC (do NOT route through generic `products:update`): `products:getBundleItems(bundleId)` (components + joined `trade_name`/`unit_name`/`cost_price`/derived stock); `products:saveBundleItems(bundleId, items[])` (delete+re-insert in ONE transaction by `sort_order`, then `recomputeBundleCost`).
- [ ] `recomputeBundleCost(bundleId)` helper: `UPDATE products SET cost_price = Σ(c.cost_price × bi.qty_per_bundle)` from `product_bundle_items` join `products`.
- [ ] Hook into existing `recomputeAvgCost(pid)` (~products.ts:307): after a component's avg cost recomputes, find bundles containing it and `recomputeBundleCost` them (cost propagation).
- [ ] `products:list` / `products:get`: add `is_bundle`; derived stock for bundles:
  ```sql
  CASE WHEN p.is_bundle = 1 THEN (
    SELECT COALESCE(MIN(CAST(
      (SELECT COALESCE(SUM(qty_on_hand),0) FROM product_lots
       WHERE product_id = bi.component_product_id AND is_closed = 0) / bi.qty_per_bundle
    AS INTEGER)), 0)
    FROM product_bundle_items bi WHERE bi.bundle_id = p.id
  ) ELSE <existing open-lot sum> END AS stock_qty
  ```

### Backend — `electron/ipc/pos.ts`
- [ ] `pos:searchProducts` (~pos.ts:8): add `p.is_bundle` + derived stock; attach `bundle_items` (component + qty + cost) to rows where `is_bundle=1` (same pattern as it attaches `units`/`lots`).
- [ ] `pos:saveBill` (~pos.ts:131–164): inside `for (item of payload.items)`:
  - Insert the `sale_items` row as today — **1 row = the bundle** (`product_id`=bundle id, `unit_price`=bundle price, `line_total`=bundle price). Receipt/reports see one line. ✓
  - **Refactor the existing FEFO block (pos.ts:139–158) into a helper** `deductFefo(db, productId, qty, saleItemId, saleId, invoiceNo, soldBy)` and call it for single products (unchanged behaviour).
  - If `item.product_id` has `is_bundle=1`: do NOT FEFO the bundle id. Instead loop its `product_bundle_items`; for each component call `deductFefo(db, comp.component_product_id, comp.qty_per_bundle * item.qty, saleItemId, …)`. The helper writes `sale_item_lots`/`stock_movements` with the **component's** product_id and the bundle's `saleItemId`. Oversold component → `sale_item_lots (lot_id NULL, product_id=component, remaining)` (same as existing oversold branch pos.ts:161).
- [ ] `reports:voidSale` — **NO CHANGE** (already restores per `sale_item_lots.product_id`). Just verify in testing.

### Frontend
- [ ] `src/types/index.ts`: `Product` += `is_bundle: number`, `bundle_items?: ProductBundleItem[]`; new `ProductBundleItem { id; bundle_id; component_product_id; qty_per_bundle; sort_order; component_name?; component_unit_name?; component_cost?; component_stock? }`.
- [ ] `src/pages/Products/EditProduct/GeneralTab.tsx`: add Switch "เป็นชุดสินค้า (ประกอบจากหลายสินค้า)" → `is_bundle` (use the `Toggle` helper, label LEFT / switch RIGHT per memory). When on: `cost_price` field read-only (show auto value); force `is_stock_item=0`.
- [ ] `src/pages/Products/EditProduct/index.tsx`: when `is_bundle=1` show a new "ชุดสินค้า" tab and **hide the Lots tab**; add `is_bundle` to doSave allow-list payload.
- [ ] **New** `src/pages/Products/EditProduct/BundleItemsTab.tsx` — Standard table-card layout (CLAUDE.md): search/add component (filter `is_bundle=0`), columns = name / base unit / `qty_per_bundle` Input / cost-each / on-hand / wide-rectangle delete button (`w-16` `destructive`); footer bar = auto total cost + save → `products:saveBundleItems`; after mutation call `onRefresh()` (parent stays single source of truth — same pattern as the other extracted tabs documented in the 2026-05-17 EditProduct split below). No module-scope helper components (HARD rule).
- [ ] `src/pages/Products/index.tsx`: `Badge variant="tertiary"` "ชุด" on `is_bundle=1` rows; stock column uses derived qty (low/out filters then work for bundles too).
- [ ] `src/pages/POS/index.tsx`: cart structure unchanged (bundle is a normal CartItem). **Payment-modal cost preview (~index.tsx:1326)**: if `item.product.is_bundle`, loop `bundle_items` and FEFO-cost the components (mirror the new saveBill logic) else profit preview is wrong. Cart row: small sub-text `text-xs text-muted-foreground` "ประกอบด้วย: Ibuprofen ×1, Norgesic ×1".

### Phase 2 (separate, after Phase 1 verified)
- Whole-bundle **return** launched from Sales detail (sale-linked): read the bundle `sale_item`'s `sale_item_lots` and restore each component lot — reuse the `voidSale` restore loop scoped to one `sale_item`; emit one `RT-` bill, `sale_type='return'`, negative qty per component. The existing POS return modal (manual product+lot pick) does NOT support bundles in v1 — show toast "คืนชุดสินค้าให้ทำผ่านหน้าบิล/รายงานขาย".
- `src/components/dialogs/SaleDetailDialog.tsx`: bundle line = 1 row + expandable component breakdown from `sale_item_lots` grouped by `product_id`; "คืนชุดนี้" button.
- Bundle dispensing label: the existing `product_labels` on the bundle row already prints — just test; merging component labels is a later extension.

### Out of scope / risks (tell operator, don't silently absorb)
- **✅ FIXED 2026-05-19 (commit 3a4b16e):** the pre-existing latent bug — `pos:saveBill` deducted `item.qty` straight from base-unit lots **without multiplying by `qty_per_base`** (selling 1 "แผง" = 10 base under-deducted). Now: payload carries `qty_per_base?` and the FEFO loop uses `remaining = item.qty * (item.qty_per_base ?? 1)`; `sale_items.qty` stays in the sold unit (receipt unchanged), `sale_item_lots`/`stock_movements` are base-unit (void/return correct automatically). Frontend sends `i.selectedUnit?.qty_per_base ?? 1`. So when you build `deductFefo` for bundles it correctly inherits base-unit math — no separate qty_per_base fix needed. Click-test still pending. (`is_drug` / single-product non-base sales now all correct.)
- Non-base unit for the bundle itself ("แพ็ค 3 ชุด"): later — needs `qty_per_bundle × qty_per_base` nesting.
- **FDA controlled-drug reporting through bundles:** if a component is controlled (`is_fda10/13`, `drug_type_id`), the ขย.10/13 reports should "see through" the bundle to components — legal/pharmacy decision, Phase 2+. Phase 1 reports the bundle by its own flags only. Raise with operator.

### Verification (after Phase 1)
`npm run electron:dev`, then end-to-end:
1. Create bundle: new product → toggle "เป็นชุดสินค้า" → ชุดสินค้า tab add Ibuprofen ×1 + Norgesic ×1 → set price/barcode → save → `cost_price` == auto Σ.
2. Products list: "ชุด" badge + stock == min(component capacities).
3. Sell in POS: scan bundle barcode → 1 cart line @ bundle price → pay → DB: `sale_items` 1 row (product_id=bundle); `sale_item_lots` ≥2 rows (component product_ids, correct FEFO lots); both components' `product_lots.qty_on_hand` down correctly; `stock_movements` 'sale' per component.
4. Oversell: starve Ibuprofen → still sells; `sale_item_lots` has `lot_id NULL` row for Ibuprofen.
5. Profit (Manage/Sales) = bundle price − Σ component-lot cost.
6. Void the bundle bill → both components restored; `stock_movements` 'sale_return' per component; `sales.status='voided'`.
7. Receive a new Ibuprofen lot at a different cost → `recomputeAvgCost` → bundle `cost_price` updates.
8. `npx tsc --noEmit` — must stay green (baseline is clean as of 2026-05-19; see that session below).

### Files to touch
`electron/db/schema.ts` · `electron/ipc/products.ts` · `electron/ipc/pos.ts` · `electron/preload.ts` · `src/types/index.ts` · `src/pages/Products/EditProduct/{index,GeneralTab}.tsx` + new `BundleItemsTab.tsx` · `src/pages/Products/index.tsx` · `src/pages/POS/index.tsx` · (Phase 2) `src/components/dialogs/SaleDetailDialog.tsx`.

---

## Session 2026-05-19b — Fix POS "ยกเลิกบิล" button — ✅ DONE 2026-05-19

**Implemented** in `src/pages/POS/index.tsx` exactly per the plan below. tsc clean. Not click-tested yet.
- Imports `SaleDetailDialog`/`type SaleDetail` + `ConfirmDialog`. New state `showVoidLookup`/`voidQuery`/`voidLooking`/`voidDetailInvoice`/`voidDetailOpen`/`voidTarget` + `voidLookupRef` (auto-focus effect mirrors `showReturn`).
- "ยกเลิกบิล" button: removed `disabled` + `cart.clearCart()`, now `onClick → setShowVoidLookup(true)`. **Cart-clear is NOT lost** — the dedicated "ลบรายการทั้งหมด" button (cart toolbar, `destructive2`, disabled when empty) already does that.
- `doVoidLookup()` (Enter or "ค้นหาบิล" btn) → `getSaleByInvoice`: not found / already voided → toast error; else open `SaleDetailDialog`. `onVoidRequest` → set `voidTarget` + close detail → `ConfirmDialog` (`requireReason`) → `handleVoidBill` → `voidSale` → success toast → `loadDailyStats()` (drops voided bill from today's totals) → close all.
- Focus guard: `anyModalOpen` now includes `showVoidLookup || voidDetailOpen || !!voidTarget`. Esc handled by Radix `Dialog` `onOpenChange` (the new dialogs use the shared `Dialog`, not the POS custom-modal path — no global-Esc-handler entry needed; matches how `Manage/Sales.tsx` does it).

### Problem
`src/pages/POS/index.tsx:930` — the "ยกเลิกบิล" button only does `cart.clearCart()` (wipes the unsaved cart, one click, no confirm). Misleading name: operator expects it to **void an already-sold bill**. The real void already works correctly in `Manage/Sales.tsx` (`reports.voidSale`). Decision (with operator): POS button must let you **look up a completed bill by invoice no and void the WHOLE bill**. NOT per-item — whole bill only.

### No new logic — reuse everything
| Reuse | Role |
|---|---|
| `window.api.reports.getSaleByInvoice(inv)` | fetch bill by invoice no |
| `window.api.reports.voidSale(id, reason)` | the proven void (restores all lots, `status='voided'`, stock_movements) |
| `SaleDetailDialog` (`src/components/dialogs/SaleDetailDialog.tsx`) | shows bill items + `onVoidRequest` + voided badge — already complete |
| `ConfirmDialog` (`requireReason`) | confirm + reason box — copy the exact pattern from `Manage/Sales.tsx` |

### Steps (all in `src/pages/POS/index.tsx`)
- [ ] Import `SaleDetailDialog`, `ConfirmDialog` (ConfirmDialog not yet imported in POS).
- [ ] New state: `showVoidLookup`, `voidQuery`, `voidDetailInvoice`, `voidDetailOpen`, `voidTarget`.
- [ ] Button @ line ~930: `onClick` → `setShowVoidLookup(true)`; **remove** `disabled={cart.items.length === 0}` (voiding a past bill is unrelated to the cart); keep label "ยกเลิกบิล" (now accurate).
- [ ] New small lookup `Dialog`: `Input` for invoice no, auto-focus, scan-friendly, **Enter = lookup** → `getSaleByInvoice`:
      - found & not voided → open `SaleDetailDialog`
      - not found / already voided → `toast` error
- [ ] `SaleDetailDialog` `onVoidRequest` → set `voidTarget` + close detail → open `ConfirmDialog`.
- [ ] `ConfirmDialog` confirm → `reports.voidSale(id, reason)` → success toast → **refresh "สรุปยอดขายวันนี้"** (voided bill must drop out of daily totals) → close all modals.
- [ ] POS focus rules: add the 3 new modals to the focus-guard list (~line 176 / 249) so global click-refocus doesn't steal focus; Esc closes (mirror `showReturn` pattern @ line 244).

### Conventions to honor
- Modal contract: outside-click never closes (Dialog enforces), Esc closes, Enter on invoice input = lookup.
- `components/ui` only (`Button`/`Input`/`Dialog`), semantic color tokens, full `DialogHeader/Title/Body/Footer`.

### Decided UX
Invoice-number **input/scan box** (operator has the receipt in hand — fastest), NOT a today's-bills list (that duplicates Manage › ขาย and makes the modal too big).

---

## Session 2026-05-19 — Manage / Reports restructure

### Why
`Reports/Purchases.tsx` was a strict, weaker subset of the `Purchase/index.tsx` "ประวัติการรับสินค้า" tab (same group-by-invoice list + filters, but read-only, fewer filters, no edit/cancel). Root cause: the Reports section mixed **two user jobs** — operational document/stock management vs. analytics/compliance. Fix = split by user role into two top-level sections.

### Target information architecture (decided with operator)
```
Sidebar
├── การขาย        /              POS (unchanged)
├── การซื้อ        /purchase      ← Phase 2: receive-FORM only (no Tabs, history removed)
├── สินค้า         /products      unchanged
├── บุคคล          /people        unchanged
├── ประวัติ & สต็อก /manage        ← NEW operational workbench (this restructure)
│   ├── ประวัติการขาย      /manage           (Sales — keeps void) ✅ Phase 1
│   ├── ใกล้หมดอายุ         /manage/expiry    (Expiry)            ✅ Phase 1
│   ├── ประวัติการซื้อ      /manage/purchases (from Purchase tab) ✅ Phase 2
│   └── ต่ำกว่าจุดสั่งซื้อ   /manage/low-stock (new)              ✅ Phase 3
├── รายงาน         /reports       ← Phase 4+: REBUILT as analytics/compliance
│   ├── การเงิน            finance dashboard          ✅ Phase 4
│   └── รายงาน อย.         controlled-drug reg / temp 🚧 Phase 5 (placeholder; needs อย. spec)
└── ตั้งค่า         /settings      unchanged
```
Operator decisions locked: (a) `/purchase` becomes receive-form-only after Phase 2 (history NOT duplicated, NOT linked-back — fully relocated). (b) Menu label = **"ประวัติ & สต็อก"** (icon `ClipboardList`). (c) Reports section is retired now, rebuilt greenfield in Phase 4–5.

### ✅ Phase 1 — DONE this session
- `git mv src/pages/Reports → src/pages/Manage`; **deleted** `Manage/Purchases.tsx` (the redundant page — the whole reason this started).
- `Manage/index.tsx`: `ReportsLayout`→`ManageLayout`, `ReportsOutletContext`→`ManageOutletContext`, `ReportSummaryCard`→`ManageSummaryCard`. TABS now just `sales` (`/manage`) + `expiry` (`/manage/expiry`); `resolveTab` simplified; PageHeader title `"ประวัติ & สต็อก"`. **The Tabs + MetricCard-summary-slot-via-outlet-context pattern is intact and is the template Phase 2/3 tabs plug into.**
- `Manage/Sales.tsx` + `Manage/Expiry.tsx`: updated context import/type names; component fns renamed `Manage*Page`. No logic change — Sales still owns voidSale.
- `App.tsx`: lazy imports `Manage*`; route `/manage` (index=Sales, expiry=Expiry); `Navigate` redirect for `reports` and `reports/*` → `/manage` (no 404 on old bookmarks).
- `Sidebar.tsx`: `BarChart2`→`ClipboardList`; `/reports`/"รายงาน" entry → `/manage`/"ประวัติ & สต็อก".
- `npx tsc --noEmit` clean for changed files.
- **Untouched on purpose:** `Purchase/index.tsx` still has its own history tab (its relocation is Phase 2 — Phase 1 didn't break it, just didn't move it yet). The `reports:purchaseList` IPC (`electron/ipc/reports.ts:187`) is now **dead code** — leave it; Phase 2 will decide reuse vs. delete.

### ✅ Phase 2 — DONE (2026-05-19) — extracted ประวัติการซื้อ from Purchase/index.tsx
**Outcome:** `src/pages/Manage/Purchases.tsx` created (owns its history list, receipt dialog, edit-bill modal, cancel-GR modal — copied state/handlers, nothing shared via context). `Purchase/index.tsx` gutted **2,260 → 1,537 LOC** (−736): Tabs scaffold/`activeTab`/history TabsContent/3 dialogs removed; receive content reparented into a plain `<div className="flex-1 min-h-0 flex flex-col">`; receive flow (invoiceNo, rows, suppliers, unit/price/bill-adjust/import/success modals) byte-for-byte untouched; dead imports pruned. Tab registered in `Manage/index.tsx` TABS (`purchases`, icon `PackagePlus`) + `resolveTab` + `App.tsx` route `/manage/purchases`. New tab uses `purchase:history`; dead `reports:purchaseList` deleted from `reports.ts` + `preload.ts` (no type decl existed; zero refs remain). Status-filter cards kept as **in-body interactive `StatCard`s** (not the layout's passive MetricCard slot — slot is cleared via `setSlotSummary(null)`). `npx tsc --noEmit` clean (only 4 pre-existing unrelated errors in dialog.tsx/EditProduct/themeStore). **Not click-tested yet** — verify both `/purchase` (pure receive) and `/manage/purchases` (filters, payment cards, view receipt, edit bill, cancel GR + blocker list).

<details><summary>Original plan (for reference)</summary>

`src/pages/Purchase/index.tsx` is a 2,265-LOC monolith. The history tab is deeply coupled. **Use the EditProduct-split precedent (Session 2026-05-17): the extracted view OWNS its own modal/dialog state, parent passes nothing it doesn't need.**
Steps:
1. **Create `src/pages/Manage/Purchases.tsx`** consuming `ManageOutletContext` (mirror `Manage/Sales.tsx` shape: toolbar → summary cards via `setSummary` → table-card → pagination). Add the `purchases` entry back to `TABS` in `Manage/index.tsx` (`/manage/purchases`, icon `PackagePlus`) and a `resolveTab` branch.
2. **Move from `Purchase/index.tsx` into it** (state + JSX + handlers, by name): `history`/`histTotal`/`histPage`/`histPageSize`/`histQ`/`histSupplierId`/`histDateFrom`/`histDateTo`/`histPaymentFilter`/`histSummary`/`loadingHist`; the payment-status filter cards (all/cash/credit/unpaid/cancelled — currently the `histSummary` chips ~line 1359); the **edit-bill modal** (`showEditModal`+`edit*` state, ~line 1681) and **cancel-GR modal** (`showCancelModal`/`cancelReason`/`cancelBlockers`, ~line 175); receipt dialog (`selectedInvoice`/`receiptItems`/`receiptInvoice`). Backend: keep `purchase:history` / cancel / edit / `purchase:getReceipt` IPCs — only the renderer moves.
3. **Gut `Purchase/index.tsx` down to the receive form**: delete `<Tabs>/<TabsList>/<TabsContent>` wrappers (imports too — line 18), `activeTab` state (line 193), and the entire `value="history"` TabsContent (~lines 1350–1676). The `value="receive"` content becomes the page body directly. Verify the receive form's own state (invoiceNo, rows, suppliers, unit/price modals, success dialog) is untouched.
4. **Decide `reports:purchaseList` vs `purchase:history`**: the new tab should use `purchase:history` (richer — has payment-status summary + cancel/edit support). Then **delete** the now-unused `reports:purchaseList` handler (`electron/ipc/reports.ts:187-222`) + its `preload.ts:75` binding + the `window.api.reports.purchaseList` type. Grep first.
5. tsc clean; click-test BOTH: `/purchase` (pure receive flow end-to-end) and `/manage/purchases` (filters, payment cards, view receipt, edit bill, cancel GR + blocker list).
Gotchas: `Purchase/index.tsx` shares `suppliers`, `today`, toast, refocus helpers between receive & history — the extracted file needs its own copies (don't try to share via context; copy, like EditProduct tabs did). The receive-items grid is the deliberate `table-fixed`+`w-[%]` exception (CLAUDE.md) — don't touch it.

</details>

### ✅ Phase 3 — DONE (2026-05-19) — "ต่ำกว่าจุดสั่งซื้อ" tab
**Outcome:** new thin IPC `products:lowStock` (`electron/ipc/products.ts`, after `stockStats`) — flat array (no pagination, like `reports:expiringLots`), products where `reorder_point > 0 AND open-lot-sum <= reorder_point`, `ORDER BY shortfall DESC, trade_name`; returns `{ rows, count, out_count, total_shortfall }`; each row has `stock_qty`, `shortfall`, `last_supplier_name` (correlated subquery: most recent lot's supplier). `q` + `category_id` + `include_disabled` filters reuse the products:list WHERE shape. Preload binding added (`products.lowStock`). New page `src/pages/Manage/LowStock.tsx` mirrors `Manage/Expiry.tsx` (category Select + debounced search toolbar + "ไปหน้ารับสินค้า" → `navigate('/purchase')`; 3 summary cards via `setSummary`: ต้องสั่งซื้อ / หมดสต็อก / ขาดรวม; `table-fixed` list, out-of-stock rows tinted `bg-destructive-soft/30`). Registered: `Manage/index.tsx` TABS (`low-stock`, icon `PackageX`, between purchases & expiry) + `resolveTab` + `App.tsx` route `/manage/low-stock`. `npx tsc --noEmit` clean (only the 4 pre-existing unrelated errors). **Not click-tested yet.**

<details><summary>Original plan (for reference)</summary>

`products.reorder_point` + `safety_stock` exist (`electron/db/schema.ts:104-105`). Logic already lives as the `low`/`out` filter in `Products/index.tsx` (`stockFilter`, `allStats`, `renderStockCell` at :120, IPC returns `reorder_point`). Phase 3 = a dedicated actionable list tab in `/manage` (products where `reorder_point > 0 AND stock_qty <= reorder_point`, sortable by shortfall) — likely a thin new IPC or reuse the products-list query with a forced filter. Add `low-stock` to `Manage` TABS.

</details>

### ✅ Phase 4 — DONE (2026-05-19) — Reports rebuilt = finance dashboard
**Outcome:** 3 new aggregate IPCs in `electron/ipc/reports.ts` (after `expiringLots`, sharing two SQL fragments `SALE_COST_SUB` / `PURCHASE_NET_SUB`): `reports:financeSummary` (sales subtotal/discount/net/cost/profit + payment mix cash/card/transfer + credit count; purchase total/cash/credit; **current** accounts payable total/count — payable is never date-bound), `reports:salesPurchaseTrend` (per-day sales_net/cost/profit + purchase_total, merged in JS over the date union), `reports:accountsPayable` (outstanding credit GRs ordered by due date, with aging buckets not_due / 1–30 / 31–60 / 60+). Sale cost = Σ(sold-lot qty × lot cost) same shape as `salesList`; purchase bill net = Σ(receipt-item qty × cost) − header discount + surcharge from `purchase_receipts` (authoritative GR header — verified `purchase:save` writes it, `purchase:cancel` sets `status='cancelled'`, `purchase:updateHeader` updates is_paid/payment_type, so all filters stay accurate). Preload bindings added. New `src/pages/Reports/` (layout clones the Manage Tabs+summary-slot pattern): `index.tsx` (`ReportsLayout`, tabs ภาพรวมการเงิน `/reports` + เจ้าหนี้การค้า `/reports/payables`), `Finance.tsx` (DateRangePicker default = month-start→today, 6 MetricCards, 2 payment-mix `SectionCard`s, daily-trend `table-fixed`), `Payables.tsx` (5 aging MetricCards + outstanding-GR table, overdue rows tinted, footer total). `App.tsx`: redirects replaced with real nested routes (removed unused `Navigate` import). `Sidebar.tsx`: "รายงาน" re-added (icon `LineChart`). `npx tsc --noEmit` clean (only the 4 pre-existing unrelated errors). **No chart lib** — trend is a table (framer-motion is the only viz dep; charts deferred). **Not click-tested yet.**

<details><summary>Original plan (for reference)</summary>

`/reports` route currently only redirects to `/manage`. Rebuild as analytics: sales vs purchase totals over time (trend), profit, payment mix (cash/credit), **accounts payable** (outstanding credit GRs + due-date aging) and AR. Aggregate IPCs (GROUP BY day/supplier) — `reports.ts` has the join shapes to crib from. Re-add "รายงาน" to Sidebar + its own layout (clone the Manage Tabs+summary pattern). Remove the temporary `reports*`→`/manage` redirects in `App.tsx` when the real routes land.

</details>

### 🚧 Phase 5 — รายงาน อย. (placeholder shipped; build blocked on spec)
**Placeholder DONE (2026-05-19):** `src/pages/Reports/FdaReports.tsx` — an "อยู่ระหว่างพัฒนา" under-construction stub (Construction icon + warning Badge + the 3 planned sub-areas as muted chips), registered as the 3rd Reports tab `รายงาน อย.` (`/reports/fda`, icon `ShieldCheck`) + `resolveTab` + `App.tsx` route. Clears the summary slot. Keeps the feature visible so it isn't forgotten.
**Still TODO (the real work):** Controlled-drug registers (บ.ย.*), temperature logs, future regulatory exports. Build when the operator provides the exact อย. forms/columns required. New IPCs + likely new tables (e.g. temperature_logs). Replace the stub body with the real reports.

### 🔒 Reports/Finance — 7-day access gate + DEV role toggle (2026-05-19)
**`src/pages/Reports/Finance.tsx`:**
- **Default range changed** month-start→today ➜ **7 วันล่าสุด** (`daysAgoIso(FREE_RANGE_DAYS-1)`→today; `FREE_RANGE_DAYS=7`, inclusive — matches the DateRangePicker "7 วันล่าสุด" preset). *(Supersedes the "default = month-start→today" note in Phase 4.)*
- **Owner-only history gate.** Non-admin selecting a range > 7 inclusive days → `handleRangeChange` clamps back to 7 days (anchored on the chosen end date) + error toast "ดูข้อมูลย้อนหลังได้สูงสุด 7 วัน — ช่วงที่กว้างกว่านี้ต้องใช้สิทธิ์เจ้าของร้าน". `isOwner = userStore.current?.role === 'admin'` ("เจ้าของร้าน" maps to role `admin` — no separate `owner` role exists; roles are admin/pharmacist/staff). **Client-side only** (chosen UX) — the `reports:financeSummary` / `salesPurchaseTrend` IPCs still accept any range; harden backend later if direct-IPC abuse matters. Single-point change if a real `owner` role lands: the `isOwner` line.
- **⚠️ DEV-ONLY role toggle button** added to the toolbar (renderer-only hack). `auth:getCurrentUser` (electron/ipc/auth.ts) has no real login yet — it hardcodes the seeded `staff@syntropic.local` (role `staff`), so the default user is always blocked at 7 days. Button flips `userStore.current.role` staff↔admin in-place (persisted via zustand-persist, survives reload; does NOT touch backend/auth.ts/audit trail). **Marked `⚠️ DEV ONLY` in 2 spots to delete when real login lands:** (1) the `devUser/devSetCurrent/devToggleRole` block under `isOwner`, (2) the `{/* ⚠️ DEV ONLY ... */}` button in the toolbar. The 7-day gate logic stays after removal.
- `npx tsc --noEmit` clean for Finance.tsx. **Not click-tested yet.**

---

## HOW TO START DEV

Project is worked on from **both Windows and Mac** — paths differ. Pick the right one.

```bash
# Windows
cd D:\Syntropic.Project\Syntropic.desktop
npm run electron:dev

# Mac
cd /Users/CYUT/Documents/GitHub/Syntropic.desktop
npm run electron:dev
```

> Note: `better-sqlite3` prebuilt binary for Electron 31 is already in
> `node_modules/better-sqlite3/build/Release/better_sqlite3.node`
> Do NOT run `npm install` again without `--ignore-scripts`, it will break the native binary.
> If node_modules is ever deleted, run:
>   1. `npm install --ignore-scripts`
>   2. Re-download Electron binary: `node node_modules/electron/install.js`
>   3. Re-download sqlite binary: `cd node_modules/better-sqlite3 && npx prebuild-install --target=31.7.7 --runtime=electron --arch=x64 --dist-url=https://electronjs.org/headers`

---



## Database Location

Electron stores SQLite under `userData/database/syntropic.db`. Path differs per OS:

- **Windows:** `C:\Users\ANYA\AppData\Roaming\syntropic-desktop\database\syntropic.db`
- **Mac:** `/Users/CYUT/Library/Application Support/syntropic-desktop/database/syntropic.db`

Use DB Browser for SQLite to inspect or import data from PHP version.


## POS Payment Modal Overhaul + Discount Redistribution (2026-04-24)
Rebuilt the payment dialog to match the PHP reference screen (two-section layout with editable total discount that redistributes across cart lines). Pure redistribution logic extracted for testability.

- **`src/pages/POS/redistributeDiscount.ts` (new)** — pure `redistributeDiscounts(items, newTotal)` → new discount array.
  - **Case A (increase):** single-pass weighted distribution by line gross (`qty × unit_price / subtotal`), **no per-line cap** — discounts can legitimately exceed a line's gross, pushing its `line_total` negative (matches PHP behaviour where typing 2,222 discount on 335 subtotal yields net `-1,887`).
  - **Case B (decrease):** Phase 1 reduces proportionally (weighted by line gross) among lines with `discount > 0`, capped per-line at current discount, iterating to re-distribute the cap overflow to remaining discounted lines. Phase 2 (spec's catch-all across ALL products) is unreachable because input clamps to ≥ 0, left as a comment.
  - Results rounded to 2 decimals via `Math.round(n * 100) / 100`.
- **`src/stores/cartStore.ts`** — removed the three `Math.max(0, qty*price - discount)` clamps on `line_total` in `addItem`, `updateItem`, and `setSaleType`. Line totals and `totalAmount()` can now go negative. IPC `pos:saveBill` does no positivity check, so negative sales flow through intact.
- **`src/pages/POS/index.tsx`** — replaced the old `size="sm"` payment Dialog (cash + change + paid total) with a `size="lg"` modal:
  - **Section 1 (card):** `ราคาขายรวม` (gross, read-only) over `ส่วนลดรวม` (editable `Input`). The discount input uses a red style (`bg-red-50 border-red-300 text-red-600`, `w-52 h-12 text-xl`) to signal it's a subtraction.
  - **Real-time redistribution** — `onChange` calls `applyTotalDiscount(raw)` which parses, redistributes, and updates per-line `cart.discount` + re-seeds `cashAmount` to `max(0, net)` on every keystroke. `onBlur` / Enter calls `normalizeTotalDiscount()` which reformats the input string to `X.XX`. The raw typed string is preserved during typing so partial input (`"1."`, empty) isn't clobbered.
  - **Section 2 (gradient card):** `เป็นเงินทั้งสิ้น` net total, `text-5xl font-extrabold`, emerald→red gradient + red text when net < 0.
  - **Single-line breakdown + toggle** — one flex row with `text-sm`: shadcn `Button variant="outline"` toggles "คลิกเพื่อแสดง" ↔ "คลิกเพื่อซ่อน" (ChevronDown rotates 180°). When expanded, ต้นทุน / กำไร / % กำไร render inline on the left, separated by bullets. Modal height stays constant either way — no layout shift on toggle.
  - **Cost estimate** — `ต้นทุน = Σ qty × product.cost_price` (recent weighted-avg cost from products table, not actual lot FEFO cost which is only resolved at save time). `กำไร = net − cost`, `% กำไร = profit / net × 100` (0 when net ≤ 0).
  - **Cash input** — `h-16 text-3xl font-bold` big-ticket field, auto-seeded to `max(0, net)` when the modal opens and after every discount redistribution.
  - **เงินทอน row with inline alert** — box bg flips red when `netNegative || change < 0`; right side swaps between the green change amount (`text-3xl`) and a red "⚠ ตรวจสอบ" block (AlertTriangle + tracking-wider) on the same line. No separate warning section — keeps the modal at a fixed height.
  - **Save button gated by the alert** — `disabled={saving || totalPaid < cart.totalAmount() || cart.totalAmount() < 0}`. First predicate covers `change < 0`, second covers `net < 0` — together they block save whenever ตรวจสอบ is showing.
  - Card / transfer payment state (`cardAmount`, `transferAmount`) kept but no UI; saved as `0` through the existing `saveBill` payload.
  - Modal-open handler now seeds `totalDiscountInput`, `cashAmount`, and `showBreakdown=false` in one go.
- **`src/pages/POS/redistributeDiscount.ts` + cart store line_total downstream effects** — `sale_items.line_total` can now persist negative in the DB when a bill is saved with a discount ≥ subtotal; Reports/Sales.tsx just renders whatever's there (`formatCurrency` handles negatives). Save button block on `net < 0` is the primary guard, so this only happens if someone types exactly `net = 0` (not negative) with partial line overshoots, which `redistributeDiscounts` already balances.


## Purchase — Receive Ledger Refactor + Cancel + Edit Bill (2026-04-26)

Three-part rework around the GR data model. The first part fixes a long-standing data-loss bug in ประวัติการรับสินค้า where older GRs would silently disappear; the second adds a cancel-bill workflow on top; the third moves header metadata onto `purchase_receipts` so the new "edit bill" modal is coherent.

### Part 1 — `purchase_receipt_items` ledger (fixes the lot-merge bug)
- **The bug.** `purchase:save` used `(product_id, lot_number)` as a UNIQUE key on `product_lots`. When the same lot was received twice (top-up), the existing row's `qty_received`/`qty_on_hand` were incremented BUT `invoice_no`, `supplier_invoice_no`, `payment_type`, etc. were **overwritten** with the new GR's values. The history page read from `product_lots GROUP BY invoice_no`, so older GRs whose only lots got reused vanished from history; the newer GR also displayed the wrong `created_at` (still the lot's original creation date).
- **Schema** (`electron/db/schema.ts`, `electron/ipc/purchase.ts` migrations) — new `purchase_receipt_items` table: `id, invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date, cost_price, sell_price, qty, note, created_at`. Indexes on `invoice_no` and `lot_id`. This is an **immutable receive ledger** — one row per line per GR, never mutated by subsequent top-ups. `product_lots` stays as the mutable stock-state table.
- **One-time backfill** runs on startup when `purchase_receipt_items` is empty: copies one row per `(invoice_no, lot_id)` from existing `product_lots` using current `qty_received` as the contribution. GRs that were already overwritten by the lot-merge bug cannot be recovered — only the most recent `invoice_no` on each lot survives in `product_lots`. Going forward this never happens again because every save writes a fresh `purchase_receipt_items` row independently.
- **`purchase:save`** — still merges `product_lots` for stock state (intentional), but additionally inserts an immutable `purchase_receipt_items` row per line. Stock movement uses the resolved `lotId` from either the UPDATE or INSERT branch.
- **`purchase:nextGRNumber`** now reads from `purchase_receipts` (the actual GR header table) instead of the lots table.
- **`purchase:history`** rewritten to read from `purchase_receipts` joined to `purchase_receipt_items` for counts/totals. Old GRs no longer disappear when their lots are reused.
- **`purchase:getReceipt`** rewritten to read `pri.qty as qty_received` (the exact qty contributed by THIS GR, not whatever the lot currently holds), `pri.created_at` (the receive date for this specific GR), etc.

### Part 2 — Cancel-bill workflow
- **Header columns added to `purchase_receipts`**: `status TEXT NOT NULL DEFAULT 'completed'`, `cancelled_at TEXT`, `cancelled_by INTEGER REFERENCES users(id)`, `cancel_reason TEXT`. Migrated via idempotent ALTERs.
- **`purchase:cancel({ invoice_no, reason, userId })`** — soft-cancel handler mirroring the sales-void pattern:
  - Validates: header exists, not already cancelled, reason text required.
  - Stock check: each line's contribution qty must still be on hand. If any blocker is found (sold/consumed), returns `{ success: false, error: 'stock_consumed', blockers: [...] }` with `trade_name`, `lot_number`, `need`, `have` per blocking line. The transaction is **not** opened until validation passes, so cancellation is all-or-nothing.
  - On success in one transaction: subtracts `pri.qty` from each lot's `qty_on_hand` + `qty_received`, marks the lot `is_closed=1` if exhausted, inserts `stock_movements` with `movement_type='purchase_return'` + `ref_type='gr_cancel'`, recomputes `products.cost_price` as weighted avg over remaining open lots per touched product, sets `purchase_receipts.status='cancelled'` + `cancelled_at` + `cancelled_by` + `cancel_reason`.
- **`purchase:history`** — added `status` filter (`completed | cancelled | all`). Summary cards (`total_cost`, `unpaid_cost`) exclude rows where `status='cancelled'`.
- **UI — history list** ([src/pages/Purchase/index.tsx](src/pages/Purchase/index.tsx))
  - Filter chips now include "ยกเลิกแล้ว" (red when active, slate border otherwise). `loadHistory` sends `status='cancelled'` when this chip is picked.
  - List rows: cancelled bills get `opacity-70`, slate left border, line-through on the invoice number and total amount, plus a red "ยกเลิก" pill in the metadata strip.
- **UI — detail panel**
  - Red banner at the top of cancelled bills (`AlertTriangle` icon + `บิลถูกยกเลิก · <date>` + `เหตุผล: <reason>`).
  - "ยกเลิกบิล" red outline button in the header (hidden when already cancelled).
  - Confirm dialog: required reason `Textarea`, warning copy explaining stock will be returned. If backend returns `stock_consumed`, the blocker list renders inline as a red bordered box listing each product/lot/need-vs-have so the user knows exactly what to do.
- **Preload** — `window.api.purchase.cancel({ invoice_no, reason, userId })`.

### Part 3 — Edit-bill (header) modal
The "edit bill" feature (supplier, supplier invoice no, order date, receive date, payment type) required the same fix as part 1 but for header metadata: those fields lived on `product_lots` (last-write-wins across shared lots), so editing GR-A could corrupt GR-B's view of a shared lot.
- **Header columns added to `purchase_receipts`**: `supplier_id`, `supplier_invoice_no`, `order_date`, `payment_type`, `due_date`, `is_paid`, `paid_date`. Migrated via ALTER + idempotent backfill that copies from any matching `product_lots` row when fields are still NULL.
- **`purchase:save`** — now writes header metadata to `purchase_receipts` (still writes the same fields to `product_lots` for stock-display compatibility, but reads no longer depend on it).
- **`purchase:history` / `purchase:getReceipt`** — now read supplier/payment/dates straight from `purchase_receipts`. No more subqueries on `product_lots` for header data. History list search now matches against `pr.invoice_no` and `pr.supplier_invoice_no`.
- **`purchase:updateHeader({ invoice_no, supplier_id, supplier_invoice_no, order_date?, receive_date, payment_type, due_date?, is_paid, paid_date?, userId })`** — new handler.
  - Refuses with `error: 'cancelled'` when the GR is cancelled. Field-level errors: `supplier_required`, `supplier_invoice_required`, `receive_date_required`, `due_date_required`.
  - In one transaction: updates `purchase_receipts` (header metadata + `created_at = receive_date`), and updates every `purchase_receipt_items.created_at` for this invoice so the detail panel's วันที่รับสินค้า stays consistent. **Never touches `product_lots`** — edits cannot corrupt other GRs that share a lot.
- **UI — detail panel** — "แก้ไขบิล" emerald outline button next to "ยกเลิกบิล" (hidden when cancelled).
- **UI — edit modal** — `Dialog` with: supplier `<select>`, supplier invoice no `Input`, order date + receive date `DateInput`s in a 2-col grid, payment-type chips (cash/credit), and a credit sub-panel that appears when credit is selected: due date `DateInput`, ชำระแล้ว `Checkbox`, paid date `DateInput` (only when `is_paid` is checked). On save: refreshes both the detail panel and the history list.
- **Preload** — `window.api.purchase.updateHeader(payload)`.

### Smaller related changes
- New `order_date TEXT` column on `product_lots` and `purchase_receipts` (วันที่สั่งซื้อตามบิล — the supplier's bill date, distinct from receive date). The receive form already had this field but was discarding it; it's now persisted on save and read back in the detail panel.
- Detail panel now shows BOTH วันที่สั่งซื้อตามบิล and วันที่รับสินค้า in a 2×2 grid (with ผู้จำหน่าย and เลขที่ใบกำกับสินค้า).


## Products/EditProduct UI Overhaul (2026-05-12)

### card.tsx — Three exported card components share an absolute-icon layout
- `StatCard` (was a local helper in `pages/Products/index.tsx`) moved to `src/components/ui/card.tsx`. Clickable filter card. Props: `label`, `value`, `icon` (lucide ComponentType), `tint`, `isActive`, `onClick`. Active state draws a `ring-2` in the tint family (primary/warning/destructive/success/secondary).
- `MetricCard` redesigned for the EditProduct top row. Icon is now `absolute top-4 right-4` (out of layout flow), text container has `pr-14` so it doesn't overlap the icon, content flows from the top — value remains big (`text-3xl tabular-nums leading-none`). Added three className escape hatches: `labelClassName`, `valueClassName`, `subClassName`. Use them to override individual elements via `cn()` without touching the component (e.g. profit-color sub: `subClassName={profit >= 0 ? 'text-success font-semibold' : 'text-destructive font-semibold'}`).
- `SectionCard` unchanged.
- **Layout pattern memo:** when a card has a fixed `h-32` and you want headline + supporting text + an icon, prefer absolute-positioned icon over flex-row layout. Flex-row makes the icon's height (size-11 = 44px) dominate the row, pushing text content down. Absolute icon keeps text starting at the top of the content box.

### tabs.tsx — New `segmented` variant (Apple-style segmented control)
- TabsList: `bg-card rounded-xl p-1 gap-1`, `inline-grid grid-flow-col auto-cols-fr` so every trigger is forced to the width of the longest one (set on the data-attribute variant selector so it overrides the base `inline-flex` due to higher specificity).
- TabsTrigger active: `bg-tertiary text-tertiary-foreground shadow-sm` (works in both light + dark — light tertiary is yellow `43 100% 64%`, dark tertiary is dark gray).
- Used in `EditProduct.tsx` with lucide icons inline: `<TabsTrigger><FileText /> ข้อมูลทั่วไป</TabsTrigger>` etc. Icons auto-size to `size-4` via the existing `[&_svg:not([class*='size-'])]:size-4` rule on the trigger.

### Products/index.tsx — "สินค้าทั้งหมด" stat always shows absolute total
- `products:stockStats` IPC now returns `total_all` alongside `out` / `low`. The first two respect q/category_id/drug_type_id, but `total_all` is just `SELECT COUNT(*) FROM products [WHERE is_disabled=0]` — only the `include_disabled` toggle affects it, never the search/category filters. Reason: the headline number shouldn't shrink as the user narrows the list.
- StatCard rendered inline (no local component definition in the page file).

### EditProduct.tsx — top row + tabs + tab tables all redesigned
- Meta card (col 1 of 4): `bg-card rounded-2xl p-4 h-32 overflow-hidden relative`. Trade name is the prominent header (`text-base font-bold truncate`), second line is `<font-mono>{code}</font-mono> · {category}`, badges row below. Icon `Package size-11` absolute top-right. Long names get truncated + `title={trade_name}` for hover.
- 4 cards reordered: meta → ราคาทุน → ราคาขาย → คงเหลือ.
- ราคาขาย card sub uses the new `subClassName` to color profit green/red and format `+53.00 (+74%)`.
- Tabs use `variant="segmented"` with icons (FileText/Boxes/Pill/Package). Tabs root has `className="items-center"` so the `w-fit` TabsList sits centered horizontally on the page.
- All three tabs (units/labels/lots) now use the **Products-list table pattern**:
  - Outer wrapper: `bg-card rounded-2xl shadow-card overflow-hidden`
  - Inner top: white header bar `px-5 py-2.5 text-sm font-semibold text-muted-foreground flex items-center justify-between` — title + Plus button on units/labels, info banner with Edit2 icon on lots
  - Table wrapper: `[&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card` (the 8px borders blend with the card bg, creating an inset)
  - `<Table className="table-fixed">` with explicit `w-XX` widths on every TableHead
  - Header sticky: `[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted`
  - Row hover: `hover:bg-primary-soft/60 transition-colors`
  - Action buttons in rows: `size="icon-xl" variant="outline"` (not `size="sm" variant="ghost"` anymore)
  - Status bar at bottom: `border-t border-border px-5 py-2.5 text-xs text-muted-foreground` with count/breakdown stats
  - Empty state: lucide icon + Thai message, `py-16` padding
- Labels tab is a list (not a table) so it skips `table-fixed`, but follows the same wrapper/header/status-bar/inset pattern. Label rows separated by `divide-y divide-border`.
- Units table: removed `บาร์โค้ด` column, added `ราคาส่ง 2`. Header "จำนวนต่อหน่วยหลัก" shortened to "ต่อหน่วยหลัก" (the column data already says "จำนวน" by being a number).

### `[scrollbar-gutter:stable]` on tab content scroller
- Symptom: switching between tabs caused a ~12-15px horizontal shift because some tabs' content was tall enough to show a vertical scrollbar and others weren't, so the centered tab list moved as the scrollbar appeared/disappeared.
- Fix: `[scrollbar-gutter:stable]` reserves the scrollbar gutter even when not scrolling. Applied to the parent scroll container that wraps both the Tabs and the tab content.

### Base unit invariant — now hard-enforced at IPC layer
- **`products:addUnit`** — payload's `is_base_unit` is overwritten to 0. Only `products:create` may insert a base unit row.
- **`products:updateUnit`** — `is_base_unit` is stripped from the payload. If the row being edited has `is_base_unit=1`, the handler only accepts `unit_id` from the rest (everything else is rejected — pricing/barcode/qty_per_base for the base unit live in the products table now).
- **`products:deleteUnit`** — throws `"ลบหน่วยหลักไม่ได้ — ทุกสินค้าต้องมีหน่วยหลัก 1 รายการเสมอ"` if the row is the base unit. (Frontend already hides the delete button for base units; this is defense in depth for direct IPC callers.)
- **`products:update`** — now runs inside a `db.transaction()`. After updating `products`, mirrors `price_retail`/`price_wholesale1`/`price_wholesale2` to the `product_units` row where `is_base_unit=1`, so legacy joins that read prices from `product_units` keep getting the same numbers as the products table.
- **Frontend (EditProduct unit dialog):**
  - Title: "เพิ่มหน่วยนับ" / "แก้ไขหน่วยนับ" / "แก้ไขหน่วยหลัก" — branched on `editingUnit?.is_base_unit`.
  - Base-unit edit body: only the unit_id `<SelectField>` is shown, with a note "หน่วยหลักดึงราคา/บาร์โค้ดจากตัวสินค้าโดยอัตโนมัติ — แก้ไขได้ที่แท็บ ข้อมูลทั่วไป". All price/barcode/qty/sale/purchase inputs hidden.
  - Non-base edit + add: removed the `หน่วยหลัก` Toggle entirely. Only `ใช้ขาย` / `ใช้ซื้อ` remain.
  - `handleSaveUnit`: three branches now — base-unit edit sends only `{ unit_id }`, non-base edit sends everything except `is_base_unit`, add sends everything except `is_base_unit`.

### Source of truth (consolidated)
- **Base unit** (`product_units` row with `is_base_unit=1`): `unit_id` is editable. Pricing/barcode/qty_per_base mirror the `products` table — `products:update` syncs the mirror columns automatically.
- **Non-base units** (alternative units like แผง, กล่อง): own their `barcode`/`price_*`/`qty_per_base`/`is_for_sale`/`is_for_purchase`. Independent of products table.
- **POS join** (unchanged): `pos:searchProducts` still resolves the base unit's display name via `LEFT JOIN product_units pu_base ON pu_base.product_id = p.id AND pu_base.is_base_unit = 1 LEFT JOIN item_units u ON u.id = pu_base.unit_id`. Pricing read from `products.*` for the base, `product_units.*` for non-base.

---


## Session 2026-05-01 — Return Items System

### Goal
Add a full freeform return-items flow to the POS page. Staff scans a barcode, selects the lot, enters qty, builds a return list, enters a reason, and confirms. Daily totals decrease automatically.

### Implementation strategy: Option B
Create a **negative `sales` record** (`sale_type='return'`, `total_amount = -sum`) so `getDailyStats`'s `SUM(total_amount)` decreases without any query change. No payment dialog needed.

Invoice series: **RT-YYYYMMDD-NNN**

### Files changed

#### `electron/ipc/pos.ts`
- Replaced stub `pos:returnItems` with full Option B transaction:
  - Generates `RT-YYYYMMDD-NNN` invoice number
  - Inserts negative `sales` row (`total_amount = -totalAmount`)
  - Per item: inserts negative `sale_items` (qty, line_total negated) + `sale_item_lots` (qty negated) + restores `product_lots.qty_on_hand` + inserts `stock_movements` (`movement_type='sale_return'`, positive `qty_change`, `ref_id = saleId`)
  - Returns `{ success, invoice_no, count, total_amount }`

#### `electron/preload.ts`
- Added `returnItems: (payload: any) => ipcRenderer.invoke('pos:returnItems', payload)` to `pos` namespace

#### `src/pages/POS/index.tsx`
- New `ReturnLineItem` interface: `{ product_id, lot_id, product_name, unit_name, lot_number, expiry_date, qty, sell_price, line_total }` — uses `lot.sell_price` (not cost) as refund price
- 12 new state vars: `showReturn`, `returnQuery`, `returnResults`, `returnSearching`, `returnSelectedProduct`, `returnProductLots`, `returnSelectedLotId`, `returnQtyInput`, `returnList`, `returnReason`, `returnSaving`, `returnInputRef`
- `handleAddReturnItem`: merges duplicate product+lot entries; `line_total = qty × sell_price`
- `handleConfirmReturn`: sends payload to `window.api.pos.returnItems`, calls `loadDailyStats()` on success, resets state
- "คืนสินค้า" button in right panel with warning styling
- Return dialog: `DialogContent size="2xl"` → two-column `DialogBody` (`flex gap-0 p-0 overflow-hidden rounded-xl h-[460px]`)
  - Left column: barcode search input → product results or lot picker
  - Right column: return list, `ยอดคืนรวม` total, reason textarea, confirm button
  - Big +/− qty buttons (`h-12 w-12`) with large centered input (`text-2xl font-bold`)

#### `CLAUDE.md`
- Theming Rule 1: added "Opacity modifiers allowed: `bg-primary/30`, `border-warning/40`"
- Theming Rule 3: explicit mappings — `<button>` → `<Button variant="...">`, `<input>` → `<Input>`, raw dialog → `<Dialog>` with all sub-components
- Theming Rule 4 (new): mandatory dialog structure — every `DialogContent` must contain `DialogHeader` + `DialogTitle` + `DialogBody` + `DialogFooter`

### Key decisions
- `sell_price` (lot's sell price) used as refund unit price — mirrors what customer paid
- Two-column layout inside `DialogBody` achieved by overriding default `p-4` with `p-0` via `cn()` (twMerge)
- `loadDailyStats()` called post-confirm — header total updates immediately without page reload

### Uncommitted changes (continuation from previous session)
All changes above are uncommitted working tree modifications.

---

## Session 2026-05-02 — POS Reskin (Teal + Yellow design from claude_design/POS Sales.html)

### Goal
Reskin the POS page (colors + layout rearrangement) to match a high-fidelity HTML design dropped in `claude_design/POS Sales.html`. **Visual only — no logic, IPC, or interaction redesign.** User explicitly said "keep current cell-btn interaction style and change only color" — so unit/qty/price/discount editors stay as inputs/dropdowns.

### Brand color change (global — affects all pages)
Primary swapped **blue `#0485F7` → teal `#0F5D56`** (light) / `#2BA396` (dark). Accent swapped **blue-tinted → yellow `#F5C24A`**. Other pages still need adjustment (user said they'll do those later — Q2).

### Files changed

#### `src/index.css`
- `--primary` → teal `175 72% 21%` light / `173 58% 40%` dark
- `--primary-soft` → teal-tint `168 22% 91%` light / `173 24% 13%` dark
- `--primary-soft-hover`, `--primary-soft-border`, `--primary-strong`, `--primary-hover` retinted teal
- `--accent` → yellow `42 90% 63%` (was blue tint)
- `--accent-foreground` → dark brown `44 100% 8%` (was blue text)
- `--ring` → teal tint `175 35% 75%`
- `--sidebar-accent` → yellow (was near-black) so active nav row turns yellow
- `--sidebar-accent-foreground` → dark brown
- `--selection-bg` → teal-tinted
- **Added** `--accent-soft` (`#FCEFC8` light / `#2C2410` dark) for soft yellow surfaces
- **Added** `--shadow-card` for the design's soft card shadow (light + dark variants)
- Comment header changed from "Blue brand" → "Teal brand / Yellow accent"

#### `tailwind.config.js`
- Registered `accent.soft: 'hsl(var(--accent-soft))'`
- Registered `boxShadow.card: 'var(--shadow-card)'` (use as `shadow-card`)

#### `src/components/layout/Sidebar.tsx`
- Logo block: `bg-sidebar-accent-foreground` (dark brown) → `bg-primary` (teal). The "Rx Syntropic" mark now sits on a teal block.
- Active nav item: `bg-sidebar-accent/10 text-sidebar-accent-foreground` (10% blue tint) → `bg-sidebar-accent text-sidebar-accent-foreground font-semibold` (full yellow + dark brown).
- Inactive hover: `hover:bg-sidebar-accent/10` → `hover:bg-accent-soft`.
- **Bug fix:** removed the inner `<span class="text-sidebar-foreground">` color override that was making active-state label text wrong (parent text color now inherited correctly).

#### `src/pages/POS/index.tsx` (the bulk of the work)
Layout rearrangement (matches `claude_design/POS Sales.html`):

- **Header** simplified — was "Rx Syntropic / หน้าจอขายสินค้า" + `วันที่: ... เวลา: ...` two-line block. Now a single row: `<h1>หน้าจอการขายสินค้า</h1>` left + `dateStr · timeStr` meta on the right (`text-foreground-subtle text-[13px]`).
- **Toolbar card** restructured into a 2-column grid (`minmax(0,1fr) minmax(260px,320px)`):
  - Left col stacks: search input row (`bg-muted` pill with `Search` icon + `<Input>` + `F2` kbd badge) over a full-width retail/wholesale segmented control (2 buttons in a `bg-muted` track, white pill on active). Replaced the previous horizontal switch UI.
  - Right col: customer card with 44×44 avatar circle (`bg-primary-soft`, shows initials or `<User>`), name + meta lines, and a vertical action stack: `ดูข้อมูล` (outline) + `+ เพิ่มลูกค้า` (primary teal). Avatar + name area both clickable → `setShowCustomerSearch(true)`.
- **Customer alert banner** (when `is_alert`) now sits between the toolbar and cart card as its own rounded pill (was inside the cart container).
- **Cart card** is now a single `bg-card border rounded-2xl shadow-card` wrapper holding tabs + table + footer (was three loose elements).
  - **Tab strip + clear-all** in one row at the top of the cart card. Tabs are pill-style (`px-3.5 py-2 rounded-lg border`), active = `bg-primary-soft text-primary border-transparent`. Each tab shows: 1.5px dot + `รายการขาย {n}` + inline mono count (only when count > 0). Reverted from the badge-above-label tab-6 style we added two commits ago to match the HTML design's inline-count layout. The `ลบสินค้าทั้งหมด` clear-all button sits on the right of the same row (`bg-destructive-soft text-destructive`).
  - **Table header** restyled: column labels are now 11px uppercase `tracking-wider text-foreground-subtle` (was bold muted). Renamed "รายการสินค้า" → "ชื่อสินค้า", "ราคา/หน่วย" → "ราคา", "รวมเงิน" → "รวม" to match the design's column names.
  - **Cart footer** restructured to 3 cells per design: `จำนวนรายการ` left (e.g. `5 / 12 ชิ้น`), spacer flex-1, `ส่วนลด` right (red, only when > 0), `ราคารวม` right (15px semibold). Removed the old single-row summary line.
- **Right column** widened from `w-64` (256px) to `w-80` (320px). Top → bottom:
  1. **Total card** — `bg-primary text-primary-foreground rounded-2xl p-6 shadow-card`. Label "ยอดสุทธิ" + giant 48px IBM Plex Mono–style amount with a 26px ฿ symbol at 70% opacity. Meta row with top-divider: "รวม N รายการ · M ชิ้น" + ส่วนลด (only when > 0). VAT was in the design but the cart store doesn't track it — substituted with discount info; if VAT is wanted later, add `totalVat()` to the cart store.
  2. **Pay button** — `bg-accent text-accent-foreground rounded-2xl` with a yellow glow `shadow-[0_8px_20px_-10px_rgba(245,194,74,0.6)]`. Label "ชำระเงิน" + sublabel "เงินสด · โอน · บัตร · QR" + right `<ChevronRight>`. Hover lifts 1px.
  3. **Quick actions** — vertical stack of 4 outline buttons (per HTML — NOT a 2×2 grid as the README said): `เปิดลิ้นชัก` / `พิมพ์ฉลาก` / `รับคืนสินค้า` / `ยกเลิกบิล`. `พิมพ์ฉลาก` is `disabled` (no flow yet, per Q1). The "F9" payment button keybinding hint was dropped from the pay button — keybinding still works.
  4. **Daily summary card** — `bg-card border rounded-2xl shadow-card`. Head row: `สรุปยอดขายวันนี้` + date pill (`bg-muted` rounded-full, today's `dateStr`). 2-col grid: `บิลล่าสุด` / `จำนวนบิล`, then full-width `ยอดรวมของวัน` row above a top-border, value in `text-primary` mono.
- **Imports** — added `Tag` from lucide-react for the พิมพ์ฉลาก quick action icon.

### What was NOT touched (per user)
- **Cell-btn interaction redesign** — the HTML design uses click-to-edit pill buttons for unit/qty/price/discount that open popovers. Current code uses inline `<Input>`s and `<Button>` chips that open modals. User explicitly said "keep current style, change only color" — so the existing chip-styled buttons stay as-is. Only their backgrounds harmonize with the new teal/yellow palette via existing `bg-primary-soft` / `bg-warning-soft` / `bg-destructive-soft` tokens.
- **Fonts** — user said "Font touch font setting" meaning *don't touch fonts*. GoogleSans stays as the default. The HTML uses IBM Plex Sans Thai + Plex Mono — not adopted.
- **Layout sidebar width** — design shows a 220px text+icon sidebar. Current shared `Sidebar` is 80px icon-only and used by every page. Left as-is; user is OK with global brand color change but didn't ask for sidebar width change.
- **Other pages** — primary color change ripples to every page that uses `bg-primary` / `text-primary` / `bg-accent` etc. User confirmed they'll adjust those next.

### TypeScript verification
- 68 pre-existing errors before, 68 after the changes. Zero new errors in `src/pages/POS/index.tsx`. The one error in `src/components/layout/Sidebar.tsx` line 38 (`Type '{ className: string; }' is not assignable to type 'IntrinsicAttributes'`) is pre-existing — `icon: React.ComponentType` type signature missing the `<{ className?: string }>` generic — not introduced this session.

### Visual testing
- **NOT done** — Claude Code can't render the Electron UI. User must run `npm run electron:dev` to verify. Per CLAUDE.md "If you can't test the UI, say so explicitly rather than claiming success."

### Reference files
- `claude_design/POS Sales.html` — the design source. **This is the authoritative reference**, not the README in the same folder. The README description differed from the HTML in three important places: cart table column layout (HTML is unit/qty/price/discount cell-buttons + no thumbnails; README implied a thumbnail and a qty stepper), cart footer (HTML has 3 cells, README said 4), quick actions (HTML is vertical stack, README said 2×2 grid).
- `claude_design/README.md` — design tokens reference (color tables, typography, spacing). Useful for spec-level info but trumped by the HTML for actual layout decisions.

### Uncommitted changes
All changes above are uncommitted working tree modifications.

---

## Session 2026-05-04 — POS Customer Card Redesign + Button Icon Sizing Fix

### Goal
Redesign the customer card in POS so it stops looking like a 4th cart slot, and fix a hidden Tailwind/Button bug that was silently shrinking icons.

### Customer card redesign (`src/pages/POS/index.tsx:615-648`)
Iterated four times against user direction:

1. **Removed cart-slot mimicry** — was identical h-40 card with header label + corner icon + big number. Replaced with a 2-column internal layout (profile column / actions column).
2. **Matched user sketch** (`sketch.png`) — restructured into a vertical split:
   - **Top: profile box** — horizontal layout. Avatar circle (`size-14 rounded-full bg-primary-soft text-primary`) on the left, name + phone text on the right. Allergy badge "แพ้ยา" (`bg-destructive-soft text-destructive`) absolutely positioned at top-right of the box, shown when `food_allergy || other_allergy`.
   - **Bottom: action row** — 2-column grid of `ดูข้อมูล` (quaternary, disabled when no customer) + `เพิ่มลูกค้า` (tertiary), equal width, `h-9`.
3. **Main card wrap** — wrapped both sections in `bg-card rounded-2xl p-3` so the whole customer cell reads as one card matching the cart slots' visual weight. Inner profile box's own `bg-card` removed (no double-card).
4. **Alert moved inside the card** — the standalone destructive-soft banner that previously sat between the top row and the cart card was deleted. `alert_note` now renders as a small `text-xs text-destructive font-medium` row below the phone number, with an inline `AlertTriangle` icon. Single-line truncated; full text remains in the customer info dialog.

Renamed the `+ เพิ่ม` button to `เพิ่มลูกค้า` per sketch.

### Button icon sizing fix (`src/pages/POS/index.tsx`, 24 icons across the file)
**The bug** — `button.tsx:18` has `[&_svg:not([class*='size-'])]:size-4`. The `:not()` only excludes svgs whose className contains the literal substring `size-`. `h-7 w-7` doesn't contain `size-`, so the descendant rule still matches and — because it's more specific than the `.h-7 .w-7` rules — wins. Result: every lucide icon written as `h-N w-N` inside a `<Button>` was silently snapped to 16px regardless of the value. User noticed when extending the cart-slot icon from `h-5 w-5` to `h-8 w-8` and seeing zero visual change.

**The fix** — rewrite all icons inside `<Button>` from `h-N w-N` → `size-N`:

| Class / icon | Sites |
|---|---|
| `<User size-7>` | customer avatar |
| `<AlertTriangle size-3 shrink-0>` | inside แพ้ยา badge (now removed by the alert-row refactor — kept the new size on the alert-row icon) |
| `<Info size-3.5>` / `<UserPlus size-3.5>` | ดูข้อมูล / เพิ่มลูกค้า |
| `<Trash2 size-3.5>` | clear-all + cart-row delete |
| `<ChevronRight size-[22px]>` | pay button |
| `size-4 text-foreground-subtle` | 5 quick-action icons (เปิดลิ้นชัก / พิมพ์ฉลาก / ตัดสต็อก / รับคืนสินค้า / ยกเลิกบิล) |
| `<Minus size-5>` / `<Plus size-5>` | qty steppers in adjust + return + qty modals (×3 each) |
| `<Plus size-4>` / `<Minus size-4>` / `<RotateCcw size-4>` | confirm-add / confirm-cut / confirm-return footers |
| `<Trash2 size-3>` | small delete buttons in adjust/return list rows |

Skipped icons that aren't inside `<Button>` (icons in `<Input>`, `<Label>`, `<DialogTitle>`, empty-state divs, raw `<button>` elements) — the override doesn't apply to them, and `h-N w-N` continues to work.

### Documented the trap
- **`CLAUDE.md`** — added rule #7 under "Theming rules (HARD)" so future sessions reading project instructions see the rule alongside other hard UI conventions.
- **Memory** — saved `feedback_button_icon_size.md` and indexed in `MEMORY.md` for cross-session recall (the *why* and an audit checklist).

### Visual testing
**NOT done** — Claude Code can't render the Electron UI. User must run `npm run electron:dev` to verify the redesigned customer card and the icon-size fixes.

### Uncommitted changes
All changes above are uncommitted working tree modifications.

---

## Session 2026-05-06 — POS Unit Logic Hardening + Products Redesign + EditProduct Save Fix

### Goal
Three things in one session: tighten the "main unit always on top" logic in POS (both the cart unit dialog and the search modal), redesign the Products list page in POS style, and find why EditProduct save was silently failing.

### POS unit dialog — synthetic base unit (`src/pages/POS/index.tsx:1666-1680`)
**Bug** — synthetic `baseUnit.unit_name` fell back to `item?.unit_name` when `product.unit_name` was null. Since `item.unit_name` is the *currently selected* unit's name, the synthetic "หลัก" button at position 0 could end up displaying the SELECTED unit's name. The filter `units.filter(u => u.unit_name !== baseUnit.unit_name)` then removed that name from the rest of the list, so the selected unit visually appeared as the main unit at the top. Also, the filter only compared by name — if the DB had a `product_units` row with `is_base_unit=1` but a different `unit_name` than `products.unit_name`, both the synthetic base and the DB base would render (duplicate "main" entries).

**Fix**
- `baseUnitName = product?.unit_name ?? ''` — no longer falls back to `item?.unit_name`.
- Filter expanded to `units.filter(u => !u.is_base_unit && u.unit_name !== baseUnitName)` — drops both the renamed DB base and any name-collision.
- Synthetic baseUnit `is_base_unit: true` → `1` to match the field type (`number` per `ProductUnit`).

### POS search modal — flatItems base row (`src/pages/POS/index.tsx:280-289`)
**Parallel issue** — when `p.units.length > 0`, the search modal showed only DB `product_units`. The "base" row came from the DB's `is_base_unit=1` row whose `unit_name` is sourced via `product_units → item_units` JOIN. If a product had product_units with NO `is_base_unit=1` entry at all (data anomaly), the base unit was completely missing from search.

**Fix** — `flatItems` now always emits a synthetic base row `{ product: p, unit: null }` first, and excludes any DB unit with `is_base_unit=1` from the rest. The existing display fallback `it.unit?.unit_name ?? it.product.unit_name ?? '-'` then naturally:
- resolves to `it.product.unit_name` for the base row
- resolves to `it.unit.unit_name` for non-base rows

`handleSelectItem` already handles the `unit: null` case correctly (sets `unit_name = product.unit_name`, `selectedUnit: undefined`), so no downstream changes were needed.

### Products page redesign (`src/pages/Products/index.tsx` — full rewrite, backup at `index.tsx.bak`)
Goal: bring the back-office product list visually in line with POS while fixing CLAUDE.md hard-rule violations.

**Hard-rule violations fixed**
- 3× raw `<select>` → `Select` component (toolbar Category/DrugType, Create dialog Category)
- 2× raw `<button>` (in/out segmented control in Adjust dialog) → `<Button>` with `success`/`destructive`/`secondary` variants
- All colors stayed on semantic tokens — no Tailwind palette literals introduced
- Icons inside `<Button>` rely on Button's own `size-N` rule (no `h-N w-N`)

**Visual / behavioral changes**
- **Stats strip** (3 POS-style cards): `สินค้าทั้งหมด` (total from API), `ใกล้หมด (หน้านี้)`, `หมดสต็อก (หน้านี้)` — counts derived from current page rows. Each card uses a tinted icon box (`bg-primary-soft text-primary` / `bg-warning-soft text-warning-strong` / `bg-destructive-soft text-destructive`) and is rendered via a small local `StatCard` helper component at the bottom of the file.
- **Live debounced search** (300 ms) — submit button removed; filter selects also reactive. Initial load happens 300 ms after mount (acceptable trade-off).
- **Toolbar** — `h-10 rounded-xl bg-card` on every control, magnifier icon anchored inside the search Input.
- **Sticky table header** — see "Sticky header fix" below; per-cell sticky on `<th>` plus a child-selector wrapper that promotes the Table component's inner `data-slot=table-container` div to the actual scroll container.
- **Stock cell** — three states: out-of-stock = `Badge variant="destructive"` with white dot; low-stock = `bg-warning-soft text-warning-strong` chip with `AlertTriangle`; healthy = bare tabular number.
- **Action buttons** → `size="icon-sm"` ghost.
- **Adjust dialog** — in/out is a 2-column `Button` segmented control; Confirm button color follows the chosen direction; note input gains Enter-to-submit.
- **Create dialog** — raw `<select>` for category replaced with `Select`. All inputs `h-10 rounded-xl` for visual consistency.
- **Removed** unused `formatExpiry` / `getExpiryStatus` imports from the original file.

**Sticky header fix** — first attempt put `sticky top-0 z-10 bg-muted` on `TableHeader`. It didn't stick because the `Table` component's inner `<div data-slot="table-container" className="... overflow-x-auto">` creates its own scroll context (per CSS overflow spec, `overflow-x: auto` with no constraint also auto-promotes `overflow-y` to auto). The thead was sticking inside that inner container, but the inner container itself rode up with the outer `overflow-y-auto` wrapper. Fix: outer wrapper now uses `[&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin` to make the table-container itself the scroll element, and `sticky` was moved to each `<th>` directly via `[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:shadow-[0_1px_0_var(--border)]`. The shadow paints a hairline under the sticky row so it visually separates from scrolling rows (a normal `border-b` doesn't move with the sticky cell, leaving a gap).

> Note: PageHeader's `right` slot (Add product button) was put back in by my edit; the user's subsequent local edit removed it again — keeping the user's preference in current code.

### EditProduct save bug — found + fixed (`src/pages/Products/EditProduct.tsx:212-249`)
**User report:** "can't save product edit."

**Root cause** — `products:update` IPC handler builds dynamic SQL:
```js
const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
db.prepare(`UPDATE products SET ${fields}, ...`).run({ ...data, id })
```
Any payload key that isn't an actual column on `products` causes SQLite to throw `no such column: X` and abort the entire UPDATE. The form spread `...form` in `handleSave` was leaking several non-columns:

| Payload key (form) | Reality (`schema.ts:81-124`) |
|---|---|
| `is_vat` | column is `has_vat` |
| `is_not_discount` | column is `no_discount` |
| `unit_name` | column is `unit_id` (FK to `item_units`); `unit_name` only comes back via JOIN |
| `drug_generic_name_id` | **not in schema** |
| `has_wholesale1`, `has_wholesale2` | **not in schema** |
| `default_qty` | **not in schema** |

CLAUDE.md's products-table description listed these as if they existed, but neither `CREATE TABLE products` nor any later `ALTER TABLE products …` defines them. The existing `has_vat: form.is_vat` / `no_discount: form.is_not_discount` overrides in handleSave didn't help — they ran *after* the spread, so both the bad and good keys ended up in the payload, and SQLite died on whichever ghost column it hit first.

**Fix applied** — destructure the bad keys out of `form` before spreading, then map the renamed flags explicitly:
```ts
const { is_vat, is_not_discount,
        unit_name, drug_generic_name_id, has_wholesale1, has_wholesale2, default_qty,
        ...rest } = form
const payload = { ...rest, /* overrides */, has_vat: is_vat ? 1 : 0, no_discount: is_not_discount ? 1 : 0 }
```
Also changed `cost_price` default from `|| null` → `|| 0` (column is `REAL NOT NULL DEFAULT 0`; null would have hit a NOT NULL constraint if anyone cleared the field).

**Known consequence** — the four form fields with no schema column (`unit_name` free-text, `drug_generic_name_id`, `has_wholesale1/2`, `default_qty`) now silently drop their values on save. The UI still accepts input but nothing persists. To make any of these stick, schema migration + IPC update + UI mapping is required (e.g. `unit_name` → `unit_id` Select). Deferred until the user signals which of these they actually need.

### Visual testing
**NOT done** — Claude Code can't render the Electron UI. User must run `npm run electron:dev` to verify:
- POS unit dialog: open with a product where the selected unit isn't the main one, confirm "หลัก" still sits on top.
- POS search: confirm a single base row shows per product, with non-base units below.
- Products page: stats strip renders, sticky header pins while scrolling, action buttons work, Adjust + Create dialogs save.
- EditProduct: change any field on the General tab and verify save now succeeds (toast "บันทึกสำเร็จ").

### Uncommitted changes
All changes above are uncommitted working tree modifications.

---

## Known Issues / Notes
- VS 2026 installed but missing "Desktop development with C++" workload — cannot compile native modules from source
- better-sqlite3 prebuilt binary obtained via prebuild-install targeting Electron 31.7.7
- `postcss.config.js` ESM warning — harmless, can be silenced by adding `"type": "module"` to package.json
- **EditProduct ghost columns** — `unit_name` (free-text), `drug_generic_name_id`, `has_wholesale1`, `has_wholesale2`, `default_qty` are accepted by the UI but silently discarded on save (no matching column in `products` table). Either remove the inputs or migrate the schema. CLAUDE.md's schema notes still list these as if they exist — should be reconciled. **2026-05-07 update:** full audit + four additional label-table phantom columns documented in `docs/EditProduct-field-mapping.txt` and "Session 2026-05-07" below; resolution deferred to the in-flight redesign.
- DevTools Autofill errors — harmless Chromium noise

---

## Session 2026-05-07 — EditProduct field-mapping audit, 100-product mock fixture, redesign in flight

### Goal
Two threads: (1) cross-check every field on `src/pages/Products/EditProduct.tsx` against the **actual** `electron/db/schema.ts` (not the PHP intent in CLAUDE.md), and (2) generate a realistic mock-data fixture so the redesign can be visually tested against populated rows. Mid-session the user pivoted off generating sister fixture files (customers / purchases / sales / returns) to redesigning EditProduct itself — the user is currently filling in `docs/Redesign EditProduct.txt` with the new field arrangement and will hand it back for implementation.

### Field-mapping audit → `docs/EditProduct-field-mapping.txt`
One row per form key, mapped to the real `products` / `product_units` / `product_lots` / `product_labels` columns in `schema.ts`. Confirmed the previously-known products ghost columns (`unit_name` free-text, `drug_generic_name_id`, `has_wholesale1/2`, `default_qty`) are correctly stripped at `EditProduct.tsx:218-222` and the `is_vat → has_vat` / `is_not_discount → no_discount` renames work because the bad keys are destructured out before the override runs (L239-240).

Four **new** Tier-1 bugs surfaced — all in the labels flow:

1. **Label save sends 4 non-existent columns**: `label_time_id`, `advice_id`, `show_barcode`, `is_default`. The label dialog renders dropdowns/toggles for all four (`EditProduct.tsx:1067, 1076, 1107, 1109`).
   - **Add label** path: `electron/ipc/products.ts:207-212` uses an explicit INSERT column list, so these four are silently dropped — the dialog accepts input that never persists.
   - **Edit label** path: `electron/ipc/products.ts:202-204` builds dynamic SQL via `Object.keys(rest)`, so the same payload throws `no such column: label_time_id` and aborts the entire UPDATE. Editing labels is *broken*, not just incomplete.
2. **Label INSERT omits `is_active`** (`electron/ipc/products.ts:208-211`). New labels inherit the schema default (1) so they're active by default — but the `is_active` toggle in the dialog (`EditProduct.tsx:1108`) has no effect on first save.
3. **`drug_generic_name_id`** is fully wired with autocomplete + auto-tick antibiotic side-effect (`EditProduct.tsx:266-273`) and renders an `ID: {n}` hint (L634-636), but the value never persists (column missing). The selected name is also lost on reload — `loadAll` sets `genericQuery('')` with a `// will be resolved by generic_name_id lookup later` TODO at L194 that was never followed up.
4. **`unit_name`** on the general tab is edited as a free-text Input (`EditProduct.tsx:551-553`) but the `products` table has `unit_id` as an FK to `item_units` — `unit_name` only resolves via JOIN. The input value never persists.

Resolution choice (deferred — part of the redesign): for each phantom field either (a) strip it in the IPC handler / hide its UI control, or (b) `ALTER TABLE` the schema to add the column. Per-field decisions belong in the user's `docs/Redesign EditProduct.txt`.

### 100-product mock-data fixture → `docs/EditProduct-mock-data.sql`
Single SQL file, idempotent against any seeded db, exercising every persistable column in all four EditProduct tables. Skips phantom columns by design (so the file still loads if columns are added later).

**Coverage per table:**
- `products` — 100 rows (`MED001`–`MED100`) across 10 therapeutic groups (pain/fever, antibiotics, antihistamines, GI, cough/cold, vitamins, topical, controlled, ORS, supplies). FK columns resolved by code/name subqueries — independent of seed auto-increment ids.
- `product_units` — base unit per product (auto-derived from `products.unit_id`), strip variants (`แผง`, qty=10) for tablets/caps, box variants (`กล่อง`, qty=100, purchase-only) for 10 high-runners.
- `product_lots` — 1 healthy lot per product + 10 mixed-expiry lots (expired / red / orange / yellow / green) anchored to `date('now')` so the colour bands at `EditProduct.tsx:937-941` light up.
- `product_labels` — 30 rows on dispensable drugs, exercising `dose_qty`, `dosage_id`, `frequency_id`, `timing_id`, multilingual `indication_th/mm/zh` + `note_th/mm/zh`, `is_active`, `sort_order`. Phantom columns omitted.

A "Coverage extras" UPDATE block at the bottom touches every other column at least once: `has_vat`, `no_discount`, `is_original_drug`, `is_fda_report`, `is_fda13_report`, `tmt_id`, `name_for_print`, `barcode2/3/4`, `side_effect_note`, `note`, `expiry_alert_days*`, `is_hidden`, `is_disabled`, `safety_stock` overrides.

**SQLite syntax fix during initial run** — first version used `FROM (VALUES (...), (...)) AS v(col1, col2, ...)` to alias VALUES columns. SQLite 3.51 rejected the column-list aliasing on VALUES clauses (parse error near `(`). Rewrote both bulk INSERTs (products + product_labels) as `WITH v(col1, col2, ...) AS (VALUES (...), (...)) INSERT INTO target SELECT ... FROM v JOIN ...`. Pattern works against any modern SQLite.

### Dev DB state after this session
- DB path: `~/Library/Application Support/syntropic-desktop/database/syntropic.db`
- **Backup before fixture load:** `…/syntropic.db.backup-20260507-094709` (278 KB, identical to pre-fixture state)
- Counts (after fixture load):

| table | before | after |
|---|---|---|
| products | 30 | 130 (100 new MED%) |
| product_units | 0 | 174 |
| product_lots | 30 | 140 |
| product_labels | 0 | 30 |
| suppliers | 0 | 3 |
| customers | 2 | 2 (untouched) |
| sales | 0 | 0 (untouched) |

**Idempotency caveat** — `products.code` and `products.barcode` are non-UNIQUE indexes in `schema.ts` (despite CLAUDE.md saying otherwise). `INSERT OR IGNORE` on products acts as plain INSERT; re-running the file would duplicate the 100 rows. The `product_units` / `product_lots` / `product_labels` `NOT EXISTS` guards still hold. To re-run safely: `DELETE FROM products WHERE code LIKE 'MED%'` first.

### Sister fixture files — paused
The plan was to follow up with `docs/mock-customers.sql`, `docs/mock-purchases.sql`, `docs/mock-sales.sql`, `docs/mock-returns.sql` (each its own idempotent file, in dependency order). User opted to redesign EditProduct first; these are still queued for after the redesign lands.

### Pickup plan for next session
1. **Read `docs/Redesign EditProduct.txt`** — user is filling in the desired field arrangement, sections, and any logic changes. The header preview (`Product card / [Price and Cost detail] [Stock] [Product.unit/Product.type]`) suggests a card-based 3-column upper area replacing the current single-column form.
2. **Decide schema strip-vs-add per phantom field**, per what the user wrote — this includes the labels phantom columns (`label_time_id`, `advice_id`, `show_barcode`, `is_default`), `drug_generic_name_id`, `unit_name → unit_id` swap, and possibly `default_qty` / `has_wholesale1/2` (PHP-only).
3. **Implement the redesign** in `src/pages/Products/EditProduct.tsx`. Honour CLAUDE.md hard rules: semantic colour tokens only, project UI components (Switch over local Toggle at L59-71, etc.), Dialog Esc-closes / Enter-confirms contract, Button icon `size-N` not `h-N w-N`.
4. **Patch IPC** in `electron/ipc/products.ts` — at minimum (a) strip the 4 phantom keys in `saveLabel` (or remove them from the UI payload), and (b) add `is_active` to the INSERT column list.
5. **Test in browser** — `npm run electron:dev`, open a MED-prefixed product, verify save round-trips, open the labels dialog, add + edit a label end-to-end, check the lots tab colour bands against the 10 mixed-expiry lots.

### Files created this session
- `docs/EditProduct-field-mapping.txt` — full per-field mapping report with status legend
- `docs/EditProduct-mock-data.sql` — 100-product fixture (loaded into dev db)
- `docs/Redesign EditProduct.txt` — user-authored redesign spec (in progress as of session end)

### Uncommitted changes
The three files above are uncommitted (only `docs/`). No source code changes this session — `src/` and `electron/` working tree is unchanged from the 2026-05-06 state.

---

## Session 2026-05-08 — POS payment dialog redesign + invoice-no & rounding bug fixes

### Goal
User asked to add a left column to the payment dialog (customer info + transaction details list) mirroring a reference mock. Mid-session, two pre-existing bugs surfaced and were fixed: a SQLite `UNIQUE constraint failed: sales.invoice_no` thrown by the second sale of any day, and a "type 10, blur to 10.01" total-discount rounding drift.

### Payment dialog redesign — `src/pages/POS/index.tsx:1126-1335`
- **Two-column layout** (`grid grid-cols-2 gap-4`). Dialog widened from `size="lg"` → `size="full"` (max-w-5xl) and pinned to `h-[78vh]` with `grid-rows-[auto_1fr_auto]` so the body fills the modal regardless of cart length. DialogBody has `min-h-0 overflow-hidden`; left and right columns each use `min-h-0 h-full` with internal scroll.
- **Left column:**
  - Customer header — avatar tile, customer name (or `ลูกค้าทั่วไป` walk-in), customer code if any, **sale-type Badge** (`variant="senary"` for ขายส่ง / `"quaternary"` for ขายปลีก — mirrors the cart slot card style at L612-616 of the same file), date + time on the right.
  - Transaction details card — scrollable list (`flex-1 min-h-0 overflow-y-auto`), each row: `item_name` + `฿line_total` on left, `qty unit_name` on right.
- **Right column** is the existing payment controls (gross + editable discount, net total, cash input, change row, breakdown toggle, save button), wrapped in `flex flex-col gap-4 overflow-y-auto … h-full`.
- **Quick-pay UX** — Enter on an empty cash input now auto-fills `pendingNet` (`Math.max(0, pendingNet).toFixed(2)`); Enter on a non-empty cash input submits via `handleCompleteSale`. Two-keystroke exact-change flow.

### Bug fixes

**1. `sales.invoice_no` UNIQUE collision on every second sale of the day** — `electron/ipc/pos.ts:108-112` (and the parallel `pos:returnItems` at L194-199).
   - Root cause: count query filtered `sold_at >= '${today} 00:00:00'` where `today = dayjs().format('YYYYMMDD')`. But `sold_at` stores `'YYYY-MM-DD HH:MM:SS'` (via `datetime('now','localtime')`). String compare: `'2026-05-08 14:30:00' < '20260508 00:00:00'` because `'-'` (0x2D) < `'0'` (0x30) — so the date filter excludes every today-row. Count was always 0, every sale got `RX-${today}-0001`, second sale collided.
   - Fix: drop the `sold_at` range filter; rely solely on `WHERE invoice_no LIKE 'RX-${today}-%'` (matches the working `purchase:nextGRNumber` pattern at `electron/ipc/purchase.ts:78-82`). Same fix applied to RT- prefix in `returnItems`.
   - **Watch out:** main-process changes don't HMR — restart Electron after editing `electron/ipc/*.ts`.

**2. `redistributeDiscounts` rounding drift — type 10 in total-discount, blur to 10.01** — `src/pages/POS/redistributeDiscount.ts:42-51`.
   - Root cause: per-line discounts are rounded individually with `round2` after proportional split, but `Σ round2(xᵢ) ≠ round2(Σ xᵢ)`. e.g. 7 lines at gross 14.29 each, target 10 → each gets 1.43, sum 10.01 (over). 3 equal lines, target 10 → each 3.33, sum 9.99 (under).
   - Fix: after rounding, compute `residual = round2(target − Σ rounded)` and add it to the line with the largest gross. Now `Σ rounded == target` exactly. Display path (`pendingTotalDiscount.toFixed(2)`) lands on the typed value.

**3. Bug-check pass on the redesigned dialog** — three more issues caught and fixed:
   - `w-82` and `w-86` (used on the change-amount and "กรุณาตรวจสอบ" spans) **don't exist in default Tailwind** (scale jumps 80 → 96). Classes were silently dropped, spans fell back to intrinsic width and didn't align. Fixed: `w-80` for the alert ("กรุณาตรวจสอบ" needs the room — `w-52` wraps it to two lines), `w-52` for the change number (matches the cash input above).
   - **Enter on cash bypassed the disabled state.** The Save button at L1325 disables on `change < 0 || pendingNet < 0`, but Enter called `handleCompleteSale` directly, which only checked for empty cart. Fix: validation moved *into* `handleCompleteSale` (`if (saving) return; if (cart.items.length === 0) …; if (pendingNet < 0) …; if (change < 0) …`) — single source of truth for both onClick and onKeyDown=Enter.
   - Save button now also disables on `cart.items.length === 0` (defence-in-depth; the pay button at L828 already prevents opening with an empty cart).

### Memory implications
Two non-obvious traps worth retaining for future work in this codebase:
- **`datetime` format mismatch** — `dayjs().format('YYYYMMDD')` vs SQLite `datetime('now','localtime')` (which is `YYYY-MM-DD HH:MM:SS`). String-range filters that mix the two are silently always-false. Prefer `LIKE 'PREFIX-YYYYMMDD-%'` for daily-counter queries — matches the working `purchase:nextGRNumber`.
- **Per-line `round2` doesn't preserve totals** — anywhere a typed total is split across N lines and each rounded to 2dp, the rounded sum drifts ±0.01 from the typed value. The reconcile-to-largest-gross trick at `redistributeDiscount.ts:45-50` is the pattern; reuse it if a similar split shows up elsewhere (e.g. VAT distribution).

### Uncommitted changes
- `src/pages/POS/index.tsx` — payment dialog two-column redesign + bug fixes
- `src/pages/POS/redistributeDiscount.ts` — rounding-residual reconcile
- `electron/ipc/pos.ts` — invoice-no LIKE-only filter (saveBill + returnItems)
- `src/pages/Theme/index.tsx` — pre-existing modification carried over from before the session (untouched by today's work)

### Pickup plan
The EditProduct redesign remains the open headline — pickup is unchanged from the 2026-05-07 plan above. If POS regressions surface, sanity-check by running `npm run electron:dev`, ringing two sales in a row (verifies invoice-no fix, requires Electron restart not HMR), opening payment dialog with 3+ items and typing `10` in the total-discount field then blur (verifies rounding fix), and pressing Enter twice on an empty cash field with items in cart (verifies quick-pay Enter shortcut).

---

## Session 2026-05-09→10 — products schema cleanup, Hygeia-style is_drug, Products list overhaul

### Goal
Several intertwined threads landed in one long session:
1. Audit + verify Deepseek's earlier UI removal of `dosage_form_id` / `is_not_discount` / `unit_name` fields from EditProduct, then drop the matching columns from the products table.
2. Decide what to do about `products.unit_id` (the half-dead "main unit" column that EditProduct could no longer set) — chose to move base-unit storage entirely into `product_units` (`is_base_unit=1`) and rewrite all 5 read-side JOINs.
3. Seed a realistic 1000-product, 10-GR test fixture for visual + perf testing.
4. Implement Hygeia-style toggle pattern: an explicit "this product is a drug under the law" flag that gates the "ข้อมูลยา" section, with `category` reduced to a sort/filter dimension.
5. Make the Products list table sortable, fix the column-jumping artefact when rows re-render, replace static stat cards with clickable filter shortcuts, and add a recovery path for `is_disabled=1` products (which were silently invisible).

A late-session bug surfaced when the user clicked "บันทึก" in EditProduct for the first time and got a white screen — the toast hook had a long-standing API mismatch (signature accepted `string`, every call site passed `{title, variant}`); fixed at the component layer so all ~50 sites work now.

### Schema changes — `electron/db/schema.ts`

**Dropped columns (CREATE TABLE + idempotent ALTER block):**
- `products.dosage_form_id` — was joined in `products:list` and `pos:searchProducts` to surface `dosage_form_name`. UI no longer references it; both JOINs removed.
- `products.no_discount` (formerly `is_not_discount`) — UI no longer references it; no read-side consumers.
- `products.unit_id` (formerly `unit_name`) — replaced by `product_units WHERE is_base_unit=1`. See migration below.

**Added column:**
- `products.is_drug INTEGER NOT NULL DEFAULT 0` — Hygeia-style "this product is a drug" flag. Backfill migration sets `is_drug=1` for any product that already had a `drug_type_id` so existing data lights up automatically.

**Critical migration order** — the new ALTER block at the bottom of `schema.ts`:
```sql
INSERT OR IGNORE INTO item_units (name) VALUES ('ชิ้น');  -- fallback
INSERT INTO product_units
  (product_id, unit_id, qty_per_base, is_base_unit, is_for_sale,
   price_retail, price_wholesale1, price_wholesale2)
SELECT p.id,
       COALESCE(p.unit_id, (SELECT id FROM item_units WHERE name='ชิ้น')),
       1, 1, 1,
       p.price_retail, p.price_wholesale1, p.price_wholesale2
  FROM products p
 WHERE NOT EXISTS (SELECT 1 FROM product_units pu
                    WHERE pu.product_id = p.id AND pu.is_base_unit = 1);
ALTER TABLE products DROP COLUMN unit_id;
```
Each statement wrapped in `try { db.exec(sql) } catch {}` so it's idempotent — fresh installs swallow the "no such column: p.unit_id" error from the backfill (no products to backfill anyway), re-runs after migration silently no-op on the IGNORE / NOT EXISTS / already-dropped cases.

### Read-side JOIN rewrite (5 files)
Every `LEFT JOIN item_units u ON u.id = p.unit_id` replaced with:
```sql
LEFT JOIN product_units pu_base ON pu_base.product_id = p.id AND pu_base.is_base_unit = 1
LEFT JOIN item_units u ON u.id = pu_base.unit_id
```
Touched: `electron/ipc/products.ts:33` (list), `electron/ipc/pos.ts:20` (search), `electron/ipc/purchase.ts:281` (history), `electron/ipc/reports.ts:150` (expiring), `electron/ipc/settings.ts:127` (`listUnits` usage_count — now uses `COUNT(DISTINCT pu.product_id)` from `product_units`, semantic shift from "products using as base" to "products using as any unit", which is more correct for the deletability check anyway).

### Write-side rewrite — `products:create` transaction
`electron/ipc/products.ts:85` now wraps the product INSERT and the base `product_units` INSERT in a single `db.transaction(...)`. Falls back to `'ชิ้น'` if the caller didn't pick a unit (shouldn't happen via the UI dropdown, but defends against legacy callers and tests).

The quick-add dialog in `src/pages/Products/index.tsx` was simultaneously fixed — it had been sending `unit_name: '...'` (free text) where the prepared INSERT expected `@unit_id`, which would have thrown "Missing named parameter 'unit_id'". Replaced with a `<Select>` dropdown bound to `itemUnits` from `settings:allUnits`.

### Hygeia-style is_drug toggle — `src/pages/Products/EditProduct.tsx:588-642`
Section header "ข้อมูลยา" rebuilt as a flex row with a `<Toggle>` on the right labelled "สินค้านี้เป็นยาตามกฎหมาย". Toggle off → fields (ประเภทยา / ชื่อสามัญ / TMT ID / รายงาน อย. / รายงาน อย.13) hidden via `{!!form.is_drug && (<>…</>)}`. Toggle re-on → fields reappear with their previous values still in `form` state (we never clear, so flipping the toggle is non-destructive). `is_drug` flows through the `...rest` spread in the save payload to the dynamic-SQL `products:update`.

`category` is now purely for sorting/filtering — never gates drug UI. Documented in CLAUDE.md.

### Dev test fixture — `electron/ipc/dev.ts` (new file)
Dev-only IPC handler for seeding test stock, gated in `main.ts` to `isDev=true`. (The original `dev:seedTestStock` 1000-synthetic-product handler was later removed; only `dev:seedSalesHistory` — backdated GR/sales over a real-product window — remains.)

### Toast hook bug — white-screen on first save
**User report**: clicking "บันทึก" in EditProduct → blank page + console error "Objects are not valid as a React child (found: object with keys {title, variant})".

**Root cause**: `src/components/ui/toast.tsx` signature was `toast(message: string, type?, duration?)` but every call site (~50 across People, Products, Reports, Settings, EditProduct) used the shadcn-style `toast({ title: '...', variant: 'success' })`. The hook stored the object verbatim as `message`, then JSX rendered `<span>{t.message}</span>` — React threw at the object child and unmounted from the root upward.

The pre-existing TS errors (`Argument of type '{ title: string; variant: string; }' is not assignable to parameter of type 'string'`) had been silently filtered out by my earlier typecheck-grep filters because I had assumed they were known-and-fine. The first user-facing toast invocation of the redesign session blew up in production code.

**Fix** at `src/components/ui/toast.tsx` — overload the hook to accept both:
```ts
type ToastInput = string | { title: string; description?: string; variant?: 'success' | 'error' | 'info' | 'destructive' | 'default' }
toast(input: ToastInput, type?: ToastType, duration?: number)
```
Normalised inside the hook (`variantToType`: `destructive`/`error`→error, `success`→success, else info). Toast renderer split into title (font-medium) + optional description (xs, opacity-80). All 50 call sites work without edit.

**Lesson for future audits**: when filtering pre-existing TS errors during a refactor, check whether they're actually inert. Toast errors that "have always been there" can fire the moment a new code path triggers them.

### Products list overhaul — `src/pages/Products/index.tsx`

**Sortable columns** (server-side, respects pagination):
- Added `sort_by` + `sort_dir` to `products:list`. Whitelisted 6 columns mapped to SQL expressions in a `SORT_MAP` object — `trade_name`, `unit_name` (via `u.name`), `cost_price`, `price_retail`, `profit` (computed `(p.price_retail - p.cost_price)`), `stock_qty` (alias from the `COALESCE SUM` subquery — SQLite supports alias in ORDER BY). Tie-break on `p.trade_name ASC` so paginated results are stable when the primary sort has duplicates (many products with `cost_price=0`).
- Frontend has `sort` state + `toggleSort(field)` (click new column = asc; click same column = flip). `<SortableHead>` component renders the column label + `ArrowUp`/`ArrowDown`/`ArrowUpDown` icons (active = full opacity, inactive = 40%).
- All filter/sort changes go through the same 300 ms debounce + load(1) — pagination resets to page 1 when sort flips.

**Column-jump fix** — when rows re-rendered after sort, columns visibly resized because table-layout was browser-default `auto` (sizes from content). Switched to `<Table className="table-fixed">` and gave every non-`trade_name` column an explicit Tailwind width (`w-14` / `w-24` / `w-28` / `w-36`); `trade_name` keeps no width and gets the remainder. Trade-name cell now uses `truncate` + `title={trade_name}` so long names ellipsize but reveal on hover.

**Clickable stat cards as filter shortcuts**:
- `StatCard` is now a `<button>` accepting `onClick` + `isActive` props.
- 3-card layout: `สินค้าทั้งหมด` (clears filter), `ใกล้หมด` (toggles `low`), `หมดสต็อก` (toggles `out`).
- Active card gets a 2-px ring matching its tint (`ring-primary` / `ring-warning` / `ring-destructive`).
- `products:list` accepts `stock_filter: 'all'|'low'|'out'`. The same `COALESCE SUM` subquery from `stockStats` is reused inline as a WHERE condition.

A 4-card financial layout (cost / retail-value / profit) was prototyped mid-session then explicitly removed — user wants those gated to a Reports page with role-based access so staff don't see margins. The `success` tint added to `StatCard` was reverted along with it (no longer needed).

**Recovery path for `is_disabled=1` products** — they had been silently invisible because `products:list` always added `WHERE p.is_disabled = 0`. Both `products:list` and `products:stockStats` now accept `include_disabled?: boolean` (default false). The Products toolbar gained a `<Switch size="sm">` labelled "แสดงที่ปิดใช้งาน" (right-aligned via `ml-auto`). When on, disabled rows render with `opacity-60` + a `<Badge variant="secondary">ปิดใช้งาน</Badge>` so they're clearly separable. Workflow to recover: toggle on → click Edit → toggle "ปิดการใช้งาน" off in the Status section → save.

`electron/preload.ts` — `stockStats` type signature updated to include `include_disabled` so the renderer compiles.

### CLAUDE.md updates
Three rule changes documented in the divergence note + POS Unit Selection Rules section:
1. Removed `unit_name → unit_id` rename note (column gone).
2. Added "**Base unit lives only in `product_units`**" invariant — every product MUST have exactly one `is_base_unit=1` row, enforced by `products:create` transaction + seed loader + migration backfill. There is no fallback anymore; the previous `products.unit_id` JOIN is gone.
3. Added "**Added `is_drug` (Hygeia-style)**" flag note — explicit toggle, `category` reduced to sort/filter only.
4. POS Unit Selection Rules' "Why this matters" updated — the synthetic-base in the renderer still works (still keys off `product.unit_name`), only the SQL source changed. Added a hard "invariant: every product MUST have an `is_base_unit=1` row" line.

### Files changed
- `electron/db/schema.ts` — drop `dosage_form_id`/`no_discount`/`unit_id` from CREATE; add `is_drug`; new migration block with `'ชิ้น'` fallback + product_units backfill + `unit_id` DROP COLUMN
- `electron/db/seed.ts` — products INSERT loses `dosage_form_id`/`unit_id`; new `insBaseUnit` prepared statement run after each product insert; `fallbackUnitId` lookup with insert-on-miss
- `electron/ipc/products.ts` — `list` query rewrites JOINs, adds `sort_by`/`sort_dir`/`stock_filter`/`include_disabled` params; `create` wrapped in transaction, drops `dosage_form_id`/`no_discount`/`unit_id` from INSERT, inserts base `product_units` row; `stockStats` accepts `include_disabled`
- `electron/ipc/pos.ts` — search query JOIN rewrite, `dosage_form_name` SELECT removed
- `electron/ipc/purchase.ts` — receipt-items query JOIN rewrite
- `electron/ipc/reports.ts` — expiring-lots query JOIN rewrite
- `electron/ipc/settings.ts` — `listUnits` usage_count via `product_units`
- `electron/ipc/dev.ts` — **new**, dev seed handler
- `electron/main.ts` — `registerDevHandlers()` gated on `isDev`
- `electron/preload.ts` — expose `window.api.dev`; `stockStats` type adds `include_disabled`
- `src/components/ui/toast.tsx` — accept both string and `{title, description, variant}` forms
- `src/types/index.ts` — `Product` drops `dosage_form_id`, `no_discount`, `unit_id`; adds `is_drug`; drops `dosage_form_name`
- `src/pages/Products/index.tsx` — quick-add unit Select; sort state + `<SortableHead>`; `table-fixed` + explicit widths + `truncate` on trade_name; clickable `StatCard` + `stockFilter` state; `showDisabled` toggle + `<Switch>` + opacity/badge for disabled rows
- `src/pages/Products/EditProduct.tsx` — `is_drug` in form init; "ข้อมูลยา" section header rebuilt as flex row with `<Toggle>` + conditional render; cleanup of redundant `dosage_form_id` from save destructure
- `CLAUDE.md` — divergence note rewrite + POS rules + `is_drug` invariant

### Pickup plan for next session
1. **Restart Electron and verify the migration ran cleanly** — open the dev DB (path is in PROGRESS top-of-file) and confirm: (a) `products` table has no `unit_id` / `dosage_form_id` / `no_discount` columns and has `is_drug`; (b) every row in `products` has exactly one matching row in `product_units` with `is_base_unit=1`; (c) POS search, Products list, Purchase history, expiring-lots report all show unit names. If any view shows blank units, the backfill missed that product — re-run the migration manually or insert the missing base row.
2. **Visual smoke test the Products list** — sort by every column (asc + desc), confirm columns don't jump width. Click stat cards (toggle on/off), verify the row list narrows correctly. Toggle "แสดงที่ปิดใช้งาน" with at least one disabled product to confirm the badge + opacity render.
3. **EditProduct round-trip** — open a product, toggle `is_drug` off → save → reload → confirm fields are still in DB but section is hidden. Toggle back on → save → confirm section reappears with values intact.
4. **Test fixture** — run the dev seed from the /theme → "เครื่องมือ Dev" tab, walk through Products list (filter, sort, paginate, edit one), POS search, then re-run the seed (verifies the wipe path).
5. **Financial Reports page** — deferred from this session per user. Plan: copy the cost_value / retail_value / profit_value SQL from the prototype IPC (already removed from `stockStats` but visible in git blame); add 4 stat cards to a new `src/pages/Reports/Inventory.tsx` (or extend an existing reports page); gate by `user.role === 'admin'` once auth is wired. Filters should mirror Products list (q / category / drug_type) so the user can answer "what's the profit on antibiotics specifically?".
6. **Pre-existing TS noise to clean up someday** — `EditProduct.tsx` references `drug_generic_name_id`, `tmt_id`, `default_qty`, `label_time_id`, `advice_id`, `show_barcode`, `is_default` on `FullProduct` / `ProductLabel` types that don't declare them. They work at runtime (these are form-only ghost fields) but every typecheck run flags them. Either widen the types with optional fields or strip the unused form keys.

### Uncommitted changes
All of the above are uncommitted working-tree modifications.

---

## Session 2026-05-10 (cont.) — Runtime font switcher + Thai stacked-mark clipping fix

### Goal
ผู้ใช้ลองหลายฟอนต์ไทยเพื่อปรับลุค (IBM Plex → Thonburi → SF Thonburi → Inter+Sarabun) เจอปัญหา rendering หลายตัว สุดท้ายตัดสินใจทำระบบสลับฟอนต์ใน CSS settings page แทนการ hardcode

### Trap: Apple system Thai fonts ใช้ใน Electron ไม่ได้
Thonburi (และ Krungthep, Silom, Ayuthaya) ของ macOS ใช้ตาราง **AAT** (`morx`/`feat`) สำหรับ Thai mark positioning ไม่มีตาราง **OpenType** (`GPOS`/`GSUB`) Chromium ignore AAT → สระ + วรรณยุกต์ตกตำแหน่ง default = ทับตัวอักษร เลือก export ใหม่ก็ไม่ช่วย เพราะข้อมูลไม่อยู่ในไฟล์ ตรวจได้ด้วย `python3 -c "from fontTools.ttLib import TTFont; f=TTFont('x.ttf'); print('GPOS' in f.keys())"` — ถ้า `False` → render ผิดบน Chromium แน่นอน. **อย่าเสียเวลาแก้** — เปลี่ยนฟอนต์
- ✅ ใช้ได้บน Electron: Inter, Sarabun, IBM Plex Sans Thai Looped (CDN/local), SF Thonburi (มี GPOS/GSUB)
- ❌ ใช้ไม่ได้: Thonburi (Apple), Krungthep, Silom, Ayuthaya, ฟอนต์ Apple system Thai ทั้งหมด

### Universal fix: `.truncate` / `.line-clamp-*` clips Thai stacked marks (`src/index.css:182-197`)
Tailwind's `text-{xs,sm,base}` ratio 1.33–1.5 — `overflow:hidden` ของ truncate ตัดส่วนบนของ tone mark เมื่อมี stacked marks (เช่น `ขมิ้น` = ม + ิ + ้). Fix: `.truncate, [class*="line-clamp-"] { line-height: 1.65 }` ใน `@layer utilities`. ครอบคลุม 28 จุด truncate + 52 จุด line-clamp ทั่วโปรเจกต์อัตโนมัติ — **อย่าไปใส่ leading-X รายจุด** (จุดใหม่ในอนาคตจะพังอีก). Reverted earlier surgical fix at `src/pages/Products/index.tsx:356`

### Font switcher architecture (CSS vars + existing IPC pattern)
ลอกแบบมาจาก `getThemeFontSize`/`saveThemeFontSize` เดิม — เขียนค่าลง `:root` block ของ `src/index.css` โดยใช้ `updateSelectorBlock` helper ที่มีอยู่
- **CSS vars** (`src/index.css:81-84`): `--font-latin` + `--font-thai` (ค่า quoted เช่น `'Inter'` เพื่อ substitute ตรงเข้า `font-family` lists)
- **`*` rule** (`src/index.css:280`): `font-family: var(--font-latin), var(--font-thai), sans-serif`
- **Tailwind** (`tailwind.config.js`): `fontFamily.sans: ['var(--font-latin)', 'var(--font-thai)', 'sans-serif']`
- **`@font-face` declarations** (`src/index.css:204-279`): Google Sans (4w), IBM Plex Sans Thai Looped (5w), SF Thonburi (3w) — ทั้งหมด 12 รายการ, browser โหลด lazy เมื่อใช้จริง
- **IPC** (`electron/ipc/settings.ts`): `settings:getThemeFonts` / `saveThemeFonts` — payload `{ latin, thai }` ส่งทั้งคู่ทุกครั้ง
- **Preload** (`electron/preload.ts:102-104`): exposed at `window.api.settings.getThemeFonts/saveThemeFonts`
- **Picker UI** (`src/pages/CSS/index.tsx`): Section "Fonts" บนสุด, 2 columns Latin/Thai, แต่ละการ์ดแสดง sample text (`The quick brown fox · 0123` / `ขมิ้นชัน 300 มก. · กขฃคฅฆง`) ใน fontFamily ของตัวเอง. คลิก → instant preview ผ่าน `documentElement.style.setProperty()` + auto-save ผ่าน IPC. Sample ภาษาไทยจงใจมี stacked marks เพื่อให้เห็นปัญหา rendering ทันที

ตัวเลือก: Latin = Inter / Google Sans / SF Thonburi · Thai = Sarabun / IBM Plex Sans Thai Looped / SF Thonburi (JetBrains Mono ตัดออกเพราะ monospace ไม่เหมาะ body text)

### License caveat (สำคัญก่อน ship production)
- **Google Sans** = proprietary Google font ไม่มี license สำหรับ third-party commercial use ตามที่ตรวจสอบได้ ผู้ใช้บอกว่าเห็นข่าวว่าใช้ได้แต่ไม่มี source ทางการของ Google ยืนยัน — ก่อน build production ควรลบ `GoogleSans-*.ttf` ออกจาก `src/assets/fonts/` และเอา 'Google Sans' ออกจาก LATIN_FONTS
- **SF Thonburi** = ที่มาไม่ชัด (user download มาเอง) ควรตรวจสอบ license ก่อน ship
- ✅ OFL ปลอดภัย: Inter (CDN), Sarabun (CDN), IBM Plex Sans Thai Looped (local)

### Files changed
- `src/index.css` — font vars, 12 @font-face, `*` rule, `.truncate`/`.line-clamp-*` line-height
- `tailwind.config.js` — `fontFamily.sans` ใช้ vars
- `index.html` — preconnect + Google Fonts link สำหรับ Inter + Sarabun (display=swap)
- `electron/ipc/settings.ts` — handlers ใหม่ 2 ตัว
- `electron/preload.ts` — expose 2 ตัว
- `src/pages/CSS/index.tsx` — Section "Fonts" + `FontCard` component + state/handlers
- `src/pages/Products/index.tsx:356` — revert leading-6 (ตอนนี้แก้ที่ root แล้ว)

ไฟล์ฟอนต์ใน `src/assets/fonts/` (Google Sans, IBM Plex Thai Looped, SF Thonburi, JetBrains Mono x2) เก็บไว้ทั้งหมด ไม่ได้ลบ — เผื่ออยากใช้

### Pickup plan
1. **Restart Electron** หลังแก้ `electron/ipc/settings.ts` + `preload.ts` (main process restart, ไม่ใช่ HMR)
2. **Test picker** — เปิด `/css` page, คลิกการ์ดทั้ง Latin + Thai, ตรวจ instant preview ทำงาน, refresh แล้วค่ายังคงอยู่ (เปิด `src/index.css` ดู `--font-latin`/`--font-thai` อัพเดตจริง)
3. **Test stacked-mark fix** — ดูตาราง Products หา product ที่ชื่อมี ม + ิ + ้ (เช่น "ขมิ้น") สลับฟอนต์ผ่าน picker แล้วดูว่าวรรณยุกต์ไม่ถูกตัด
4. **License cleanup ก่อน production** — ลบ Google Sans `.ttf` + เอาออกจาก `LATIN_FONTS` array ใน `src/pages/CSS/index.tsx`. ตรวจ SF Thonburi license. ถ้า user ยังต้องการ Google Sans แนะนำใช้ Plus Jakarta Sans หรือ Manrope (OFL, look ใกล้เคียง)
5. **Default font** — `:root` ตั้ง default `--font-latin: 'Google Sans'` (ผู้ใช้ปรับเองตอน test) ถ้าจะ ship ควรเปลี่ยนเป็น `'Inter'` (license-safe)

### Uncommitted changes
All of the above + earlier session changes.

---

## Session 2026-05-11 — FDA report schema refactor + EditProduct/Settings wiring

### Goal
ย้าย "binding logic" ระหว่างประเภทยากับรายงาน ออกจาก EditProduct ไปไว้ที่ Settings หน้า DrugTypes แทน ให้ EditProduct เป็นการ override รายตัว, ค่า default กำหนดโดย drug_type settings

### Design decisions
| Report | หลักการ | default |
|--------|---------|---------|
| ข.ย.9 | ยาทุกชนิดที่ซื้อเข้า | ผูกกับ `is_drug` เสมอ (ไม่มี toggle แยก) |
| ข.ย.10 | ยาควบคุมพิเศษที่ขาย | `drug_type.is_fda10` (SPCL_CTRL/PSYCHO/NARCOTIC = 1) |
| ข.ย.11 | ยาอันตรายที่ถูกกำหนดให้รายงาน | `drug_type.is_fda11` (DANGEROUS = 0, ปรับรายตัวตามกฎหมาย) |
| ข.ย.13 | ขายส่ง (เฉพาะร้านขายส่ง) | `drug_type.is_fda13` (0 ทุกประเภท, ผู้ใช้ปรับเอง) |

### Schema changes — `electron/db/schema.ts`

**`drug_types` table:**
- ลบ `khor_yor_report TEXT` → แทนด้วย `is_fda9/10/11/13 INTEGER NOT NULL DEFAULT 0`
- Migration backfill: `khor_yor_report='ขย.9'` → `is_fda9=1`; `khor_yor_report='ขย.10'` → `is_fda9=1, is_fda10=1`
- Migration: `ALTER TABLE drug_types DROP COLUMN khor_yor_report`

**`products` table:**
- RENAME `is_fda_report` → `is_fda9`
- RENAME `is_fda13_report` → `is_fda13`
- ADD `is_fda10 INTEGER NOT NULL DEFAULT 0`
- ADD `is_fda11 INTEGER NOT NULL DEFAULT 0`
- Backfill: `is_fda9=1` สำหรับ `is_drug=1` ทุกตัว
- Backfill `is_fda10/11` จาก drug_type JOIN

Note: `sales.is_fda13_report` คงเดิม (คนละ table, คนละความหมาย)

### Seed changes — `electron/db/seed.ts`
```
GENERAL/OTC/DANGEROUS → is_fda9=1, is_fda10=0, is_fda11=0, is_fda13=0
SPCL_CTRL/PSYCHO_3/4/NARCOTIC_3 → is_fda9=1, is_fda10=1, is_fda11=0, is_fda13=0
```
DANGEROUS เจตนา `is_fda11=0` — pharmacist ปรับรายตัวตามกฎหมาย ไม่ใช่ default auto-on

### IPC changes
- `electron/ipc/settings.ts` — `saveDrugType` INSERT ใช้ `is_fda9/10/11/13` แทน `khor_yor_report`; UPDATE branch ใช้ dynamic SQL อยู่แล้ว → ทำงานอัตโนมัติ
- `electron/ipc/products.ts` — `products:create` INSERT column list อัพเดต
- `electron/ipc/dev.ts` — test seed INSERT อัพเดต (+2 params, ทุก test product `is_fda9/10/11/13=0`)

### Types — `src/types/index.ts`
- `Product`: `is_fda_report` / `is_fda13_report` → `is_fda9/10/11/13`
- `DrugType`: `khor_yor_report?` → `is_fda9/10/11/13`

### Settings/index.tsx — DrugTypesTab
- `openEdit`: ไม่ต้อง `(d as any)` อีกต่อไป เพราะ `DrugType` type มี is_fda9/10/11/13 แล้ว
- Dialog checkbox labels เปลี่ยนเป็นชื่อรายงานจริง + description "ค่าเริ่มต้นสำหรับสินค้าประเภทนี้"
- Table header: `ขย.*` → `ข.ย.*`

### EditProduct.tsx
- **`is_drug` toggle** — auto-sync `is_fda9 = is_drug` (เดิม: auto-set is_fda_report=1 ตาม is_drug on/off แบบ hard-coded)
- **`drug_type_id` select** — `onChange` ใหม่: เมื่อเลือก drug type → auto-fill `is_fda10/11/13` จาก drug_type defaults ใน `drugTypes` array ที่โหลดไว้แล้ว; `is_fda9` ไม่ถูก override (ผูกกับ is_drug เสมอ)
- **Report toggles section** — เปลี่ยนจาก 2 toggles (is_fda_report, is_fda13_report) → 4 toggles:
  - **ข.ย.9** — แสดง `<Switch disabled>` (ค่าตาม is_drug, ผู้ใช้ไม่แก้ไขได้), opacity-70
  - **ข.ย.10** — editable switch
  - **ข.ย.11** — editable switch
  - **ข.ย.13** — editable switch
- Meta card badge: `is_fda13_report` → `is_fda13`, label `อย.13` → `ข.ย.13`

### Products/index.tsx
- Quick-create payload: `is_fda_report/is_fda13_report` → `is_fda9/10/11/13` (ทุกตัว default 0)
- Products list badge: `is_fda13_report` → `is_fda13`, label `อย.13` → `ข.ย.13`

### Files changed
- `electron/db/schema.ts` — CREATE TABLE + migration block ใหม่
- `electron/db/seed.ts` — drugTypes array + INSERT
- `electron/ipc/settings.ts` — saveDrugType INSERT
- `electron/ipc/products.ts` — products:create INSERT
- `electron/ipc/dev.ts` — insProduct INSERT + run() args
- `src/types/index.ts` — Product + DrugType interfaces
- `src/pages/Settings/index.tsx` — DrugTypesTab labels + openEdit typing
- `src/pages/Products/EditProduct.tsx` — is_drug toggle, drug_type onChange, 4 report toggles, meta badge
- `src/pages/Products/index.tsx` — quick-create payload + list badge

---

## Session 2026-05-12 — Base unit storage refactor: audit + hardening

### Goal
ย้าย base unit ออกจาก `product_units` (เดิม `is_base_unit=1` mirroring prices) → ฝัง `products.unit_id` เป็น single source of truth. ตรวจสอบ refactor + แก้ issue ที่ค้าง.

### Static audit findings (6 issues, all resolved)
1. **Migration steps 2+3 not atomic** — backfill + DELETE were independent `try/catch`. Mid-failure could strand products with `unit_id=NULL`. Fix: wrap in `db.transaction()` with orphan gate (`schema.ts:546-566`).
2. **`products:get` missing unit_name join** — inconsistent with `products:list` / `pos:searchProducts`. Fix: `LEFT JOIN item_units u ON u.id = p.unit_id` (`products.ts:116-121`).
3. **`doSave` could send `unit_id=0`** — placeholder value violates FK. Fix: coerce `0 → null` in payload (`EditProduct.tsx:208-209`).
4. **Dead `default_qty` read** — column doesn't exist; stripped before save but cluttered loadAll. Fix: removed.
5. **CLAUDE.md self-contradiction** — line 36 still listed `unit_id` as "Dropped from products" while line 38 made it the source of truth. Fix: bullet removed.
6. **(Retracted)** `drug_generic_name_id` is actually used in UI (autocomplete display) — kept.

### UI verification — 9/9 scenarios passed
Schema sanity, product list, EditProduct General + Units tabs, POS search modal, cart unit dialog, price dialog, Purchase GR, expiry report. Base row always at top with "หลัก" badge; price dialog correctly hides wholesale rows when value=0; `unit_id` round-trips through save/reload.

### Toggle/Switch sizing pass
- `src/components/ui/switch.tsx` — `Toggle` gained `size?: "sm" | "default" | "lg"` prop, passes through to inner `Switch`.
- `src/pages/Products/EditProduct.tsx` — 13 Switch/Toggle instances bumped to `size="lg"` (VAT, stock, is_drug, ข.ย.9/10/11/13, is_hidden, is_disabled, unit dialog is_for_sale/is_for_purchase, label dialog is_default/is_active/show_barcode).

### Files changed
- `electron/db/schema.ts` — migration transaction + orphan gate
- `electron/ipc/products.ts` — `products:get` JOIN
- `src/pages/Products/EditProduct.tsx` — `unit_id` coerce, drop `default_qty`, switches → `size="lg"`
- `src/components/ui/switch.tsx` — `Toggle.size` prop
- `src/components/ui/card.tsx` — `senary` tint support (MetricCard + StatCard)
- `src/components/ui/tabs.tsx` — segmented active uses `senary`
- `CLAUDE.md` — stale bullet removed

### Commit
`832ef90` — refactor: harden base unit storage and polish EditProduct UI (pushed to `origin/main`)

---

## Session 2026-05-13 — Product create: modal → EditProduct page (with validation + dirty guard)

### Goal
Replace the cramped 5-field "เพิ่มสินค้า" modal on the Products list with the full EditProduct form, so users can enter complete info in one place. Add required-field validation (with `*` markers + red ring + alert) and a dirty guard so accidental back-clicks don't lose work.

### Design decisions
- **Reuse EditProduct, don't fork a new page.** General-tab form has ~30 fields, autocomplete, FDA flags, etc. A separate `AddProduct.tsx` would duplicate all of that and need to be kept in sync forever. Single component, dual mode (`isNew = id === undefined`).
- **Route:** `products/new` (no `:id` param). Same `EditProduct` component handles both `products/new` and `products/:id/edit`.
- **MetricCards in create mode:** stay in place but `opacity-50` + values rendered as `—`. Hiding would shift layout; user explicitly wanted no shift.
- **Other 3 tabs (หน่วยนับ / ฉลากยา / ล็อต):** `disabled={isNew}` with `title` tooltip "บันทึกสินค้าก่อนเพื่อจัดการ..." — they need a product_id to attach to, so save-first-then-manage is the only correct flow.
- **No cancel button → back arrow is cancel.** Dirty-guard alert is the safety net.

### Required fields validation
3-field minimum for save (both modes):
| Field | Reason |
|---|---|
| `trade_name` | Used everywhere for display |
| `unit_id` | Base unit FK; without it `unit_name` resolves to NULL in every list/POS/report query |
| `price_retail` | Can't sell without a price |

Behavior:
- `*` ดาวแดง บน label — `FormField` already supports `required` prop. Added to "หน่วยหลัก" (previously only trade_name + price_retail had the marker but no actual check).
- `errors: Set<string>` — keys of missing fields.
- On save: `validate()` → if non-empty, toast list + scroll/focus first missing field via `document.querySelector('[data-field="..."]')`. Save button stays clickable (doesn't disable).
- `aria-invalid={errors.has(key)}` on Input/SelectTrigger — they already have red border + ring destructive styling under that attribute.
- `setF()` removes the key from `errors` immediately on edit (no wait until next save).

### Dirty guard
- `isDirty` flag — set true by every `setF` call. Initial form load (`loadAll`) writes form via `setForm()` directly so it doesn't mark dirty.
- Back arrow → if dirty, open styled `<Dialog>` ("ยังไม่ได้บันทึก" / [กลับไปแก้ไข] · [ออกจากหน้านี้]); else navigate immediately. Started with `window.confirm()` but switched to the app's Dialog component to match the rest of the UI.
- `beforeunload` listener for refresh/close — Chromium forces a native dialog there; unavoidable.
- Applied to **both** create and edit modes. Edit previously had no guard; now it protects unsaved edits the same way.

### Backend tweak
`products:create` INSERT didn't include `is_drug` — the toggle in the form would be silently lost on create. Added `is_drug` to both the column list and VALUES clause in `electron/ipc/products.ts`.

`is_hidden` / `is_disabled` are stripped from the create payload in the renderer (`doSave`) — they're not part of the INSERT (schema defaults to 0) and including them would risk superfluous-binding errors.

### Default unit pre-select
On create mode, `loadAll` finds the `ชิ้น` row in the loaded `itemUnits` list and pre-selects it as `form.unit_id`. Users can save immediately without picking a unit.

### Files changed
- `src/App.tsx` — new route `products/new` → `EditProduct`
- `src/pages/Products/index.tsx` — removed `showCreate` state, `newProduct` state, `creating`, `handleCreate`, and the entire create dialog. Button "เพิ่มสินค้า" now `navigate('/products/new')`. Dropped unused `itemUnits` state + `ItemUnit` import (only adjust-stock dialog remains, doesn't need units).
- `src/pages/Products/EditProduct.tsx` — `isNew` mode throughout: `loadAll` branch (skip `products.get`, init defaults, pre-select ชิ้น), `setF` flags dirty + clears errors, `validate()` + `REQUIRED_FIELDS` constant, `goBack` + `<Dialog>` leave-confirm, `beforeunload` listener, conditional PageHeader title/button text, MetricCards opacity, tabs disabled, `aria-invalid` + `data-field` on 3 required inputs, `required` prop added to "หน่วยหลัก", create branch in `doSave` calls `products.create` + `navigate(replace:true)` to edit URL.
- `electron/ipc/products.ts` — `products:create` INSERT now includes `is_drug` column.

### Verification
- `npx tsc --noEmit` — 19 errors, same as baseline before this session (no new TS errors introduced).
- Not user-tested in Electron yet — pending manual run-through.

---

## Session 2026-05-14 — Adjust-stock rewrite: kill ADJ phantom lot, proper FEFO + lot-aware increase

### Goal
The old "ปรับสต็อก" button on the Products list used a synthetic `ADJ` lot per product to absorb every adjustment. That broke FEFO (real lots' qty never moved, so closest-to-expiry stock didn't get touched on shortage), let qty go arbitrarily negative, and lost cost provenance — free/promotional stock never had its zero cost reflected in the weighted-avg `products.cost_price`. Rebuild the flow with proper per-lot accounting.

### Design decisions
Three operator-picked modes, driven by delta direction:

| Mode | When | Backend behavior |
|---|---|---|
| **decrease** | target < current | Auto-FEFO. Sort open lots by `expiry_date ASC NULLS LAST, id ASC` and deduct in order, spanning multiple lots if needed. Auto-close lots whose qty hits 0. |
| **increase_new_lot** | target > current, separate source / different expiry | Create a brand-new `product_lot`. Operator supplies lot_number (auto-generated `ADJ-YYYYMMDD-NNN` if blank), expiry, cost (default 0 for freebies). |
| **increase_existing_lot** | target > current, supplier bundled freebies with an existing batch | Add qty into a chosen lot. `qty_received` grows; `cost_price` is recomputed as weighted-avg within the lot. Same total contribution to `products.cost_price` as creating a new lot — the math is `(old_qty × old_cost + added_qty × added_cost) / new_qty`. |

All three paths recompute `products.cost_price` at the end, validate `userId`/`note`/`qty > 0`, and write `stock_movements` rows. The existing-lot merge path also writes `lot_cost_logs` when cost moves materially.

### Why not just guard the ADJ approach
Adding `qty >= 0` checks would stop the negative spiral but not fix the underlying issues: real lots' FEFO order is still ignored on decrease, and ADJ has no expiry/cost so free stock still gets lost in reporting. The rewrite was cheaper than the half-fix.

### Frontend modal design
`Products/index.tsx` adjust-stock dialog rewritten:
- **Fixed height `h-[860px] max-h-[92vh]`** + `grid-rows-[auto_1fr_auto]` so header/body/footer rows are stable. Body uses `flex flex-col overflow-y-auto`; the note section has `mt-auto` to stay pinned at the bottom regardless of which conditional section is showing.
- **Top:** product info + per-lot breakdown (lot_number / expiry / qty) — shows the operator the current FEFO order before they pick a target.
- **Target input** unchanged in semantics; delta badge moved to left, input to right.
- **Decrease:** red-bordered FEFO preview lists each lot that will be hit, with `qty_before → qty_after` and `−deducted` count.
- **Increase:** two-button mode picker (`สร้างล็อตใหม่` / `เพิ่มเข้าล็อตเดิม`). New-lot form has lot_number + DateInput expiry + cost. Existing-lot form has a `font-mono` dropdown showing only lot_number; the lot's expiry/qty/cost render in a `bg-card` box to the right of the dropdown. Cost-input and merged-lot cost preview live in the same `grid-cols-[180px_1fr]` row so widths match the dropdown row above.
- Note section preserved (quick reasons + free text). Enter submits.

### Backend
`electron/ipc/products.ts` — `products:adjustStock` handler completely rewritten:
- Dispatches on `data.mode` (`decrease` / `increase_new_lot` / `increase_existing_lot`).
- Local `recomputeAvgCost(pid)` helper runs at end of every branch.
- Auto-generated lot numbers use `ADJ-YYYYMMDD-NNN` (NNN unique per product per day) — same pattern as GR but with `ADJ-` prefix.
- `increase_existing_lot` reopens closed lots (`is_closed = 0, closed_at = NULL`) when qty crosses back above 0.

### New project-wide rule: minimum text size = `text-sm` (HARD)
Operator pushback during this session: `text-xs` and arbitrary smaller values (`text-[10px]`, `text-[11px]`) are harsh on the Thai/Inter/Sarabun stack and break rhythm. Codified:
- `CLAUDE.md` theming rule #9 — banned `text-xs` and smaller arbitrary values in new code; existing legacy can be cleaned up opportunistically but is not a blocker.
- Memory: `feedback_text_size.md`.

### Files changed
- `electron/ipc/products.ts` — `products:adjustStock` rewritten (lines ~214 onward); ~200 LOC delta.
- `src/pages/Products/index.tsx` — modal rewritten; new state (`productLots`, `lotsLoading`, `increaseMode`, `newLotNumber`, `newLotExpiry`, `newLotCost`, `targetLotId`, `addedCost`), `useMemo` derivations (`fefoPreview`, `mergedLotPreview`, `mergeCandidates`, `selectedTargetLot`, `openLotsSummary`), `openAdjust` loads lots via `products.getLots`, `handleAdjust` builds mode-specific payload. Imports gained `useMemo`, `DateInput`, `ProductLot`, `Layers`/`FolderInput`/`Info` icons.
- `CLAUDE.md` — added rule #9 (`text-sm` minimum).
- `memory/feedback_text_size.md` — new memory entry; index updated in `MEMORY.md`.

### Verification
- `npx tsc --noEmit` filtered to changed files — zero new errors. (Pre-existing 19 baseline errors elsewhere unchanged.)
- Not Electron-tested by Claude. Verify manually:
  1. **Decrease across multiple lots** — set target below `Lot A.qty` and confirm FEFO splits to Lot B.
  2. **Increase, new lot, cost = 0** — verify new `ADJ-...-001` lot appears in EditProduct → ล็อต tab; `products.cost_price` weighted-avg drops appropriately.
  3. **Increase, existing lot, cost = 0** — verify chosen lot's `qty_received` grows, `cost_price` is the new weighted average, and `lot_cost_logs` got a row.
  4. **Modal layout** — switch between modes; verify height stays at 860px and the note section stays pinned at the bottom.

---

## Session 2026-05-15 — Design-system consolidation (phase 1: foundation + showcase)

Operator: app UI felt scattered; wants uniform look editable from one place (colors, radius, borders, card structure). Decisions made this session: card = `rounded-2xl` **via token**; ordinal color tokens **renamed by role** (values unchanged); unused Button variants **cut**; **showcase-first** — bring the Theme page to standard before touching other pages.

### Done
- **Radius tokenized.** Added `--radius-card: 1rem` + `--radius-control: 0.5rem` to `:root` + `.dark` (`index.css`); registered `rounded-card` / `rounded-control` in `tailwind.config.js`. Card roundness is now a one-file edit.
- **Card components unified.** `Card` / `SectionCard` / `MetricCard` / `StatCard` → `rounded-card` + `shadow-card` (dropped `Card`'s odd `rounded-xl`+ring). Fixed `MetricTint`/`SectionTint` type to match impl.
- **Ordinal tokens renamed by role** (pure rename, values unchanged — dark-mode-safe): `quaternary→brand-soft`, `quinary→info-soft`, `senary→warm`. Applied across `index.css`, `tailwind.config.js`, `button.tsx`, `badge.tsx`, `card.tsx`, `tabs.tsx`, `select.tsx`, `pages/{Products,Products/EditProduct,POS,Purchase,Theme}`. Residual ordinal tokens = 0.
- **Button `warning` variant removed** (0 real uses; Purchase had 2 ternary uses → switched to `warm`). `Badge variant="warning"` kept (status). 
- **Theme page (`/theme` → "คอมโพเนนต์") is now the standard showcase**: Section frame → `rounded-card`+`shadow-card`; all `text-xs`/`text-[11px]`/`text-[9px]` → `text-sm`; removed `bg-neutral-900` literal; added showcase sections for **SectionCard / MetricCard / StatCard**, **Standard Table-Card Layout**, and **Modal Layout** (2-col form + scrolling body).
- **CLAUDE.md** updated: new variant names, Button-vs-Badge `warning` note, `--radius-card`/`rounded-card` standard, guideline examples re-pointed to `warm`/`info-soft`.

### Verification
- `npx tsc -p tsconfig.json --noEmit` — no NEW errors. Pre-existing baseline unchanged (EditProduct field props, `dialog.tsx` `icon-m`, `themeStore.ts` line 57).
- Dev server boots clean (Vite + Electron). **Not visually verified by Claude** — operator to eyeball `/theme`, esp. dark-mode `brand-soft`/`warm`.

### Next (phase 2 — consistency sweep, after operator reviews the showcase)
1. Replace raw `<button>`/`<input>` with `Button`/`Input` — POS (2), EditProduct (1), Settings (input).
2. Kill duplicated page-local helpers → shared components: `SummaryCard`→`MetricCard`, `NumInput`→`Input`, `FieldGroup`→`FormField`, `SectionTitle`; relocate `SortableHead`/`DaysCell`/`ExpiryDateCell` into `components/ui`.
3. Remaining `text-xs` sweep (~115 across non-demo pages) → `text-sm`.
4. Ad-hoc card wrappers (`rounded-lg/xl/2xl` mix in Purchase/POS/Products/Reports) → `rounded-card shadow-card`.

---

## Session 2026-05-16→17 — Cost-price model overhaul (weighted-avg vs last-paid vs FEFO-lot)

Operator audited *where every cost figure on screen comes from*, page by page. Root problems found: (1) `purchase.ts` on receive overwrote `products.cost_price` with the **last-in** lot cost, not a weighted avg — so the displayed cost jumped on receive then "snapped back" to the real avg on the next lot-edit/adjust/GR-cancel (which *do* recompute). (2) POS profit used `products.cost_price` (avg) **and** had a unit bug: `qty (selected unit) × cost (per base unit)` → margin off by `qty_per_base` for แผง/กล่อง. (3) EditProduct let the operator hand-type `cost_price`, clobbering the auto-managed avg.

**Decided 3-cost model (the canonical reference for all future cost work):**
| Cost | Meaning | Used for |
|---|---|---|
| `products.cost_price` | weighted avg of open lots, **auto-managed by every stock flow, never hand-edited** | inventory valuation + report/COGS profit |
| `products.last_cost_price` (**NEW column**) | last cost we actually **PAID** (free goods cost=0 do NOT overwrite it) | pricing reference (set sell price off replacement cost) |
| FEFO front-lot cost | cost of the specific lot about to be dispensed | true margin of *this* sale at POS |

### Done
- **`schema.ts`** — added `products.last_cost_price REAL NOT NULL DEFAULT 0` (CREATE + idempotent migration). Backfill = newest lot with `cost_price > 0`, else `0` (free-only / never-received → 0).
- **`purchase.ts` receive** — `price_retail` updated as before; `last_cost_price` set **only when `item.cost_price > 0`** (a freebie no longer wipes the real prior cost — the scalar self-tracks "last non-zero paid"); `cost_price` is NOT set inline anymore — recomputed as the weighted avg of open lots **after** the item loop (same query shape as lot-edit / GR-cancel). Cost is now consistent on every path.
- **`types/index.ts`** — `Product.last_cost_price`.
- **POS payment dialog** (`POS/index.tsx`) — `totalCost` is now a **FEFO simulation** mirroring `saveBill` (lot remaining tracked across the whole cart, oversold remainder → avg) **+ fixed unit conversion** (`baseQty = qty × qty_per_base`). Preview profit now == reports profit.
- **POS price modal** — margin reference switched from avg → **FEFO front lot cost** (`product.lots[0]`, fallback `last_cost_price` → `cost_price`), `× qty_per_base`.
- **Purchase price modal** — "ทุนเก่า" baseline (`prevCost`) switched from avg → `last_cost_price`, **no fallback** (genuine 0 from free goods stays 0, not hidden behind the avg).
- **`products:create`** — INSERT now includes `last_cost_price`; a new product (no lots) seeds **both** `cost_price` and `last_cost_price` from the entered value.
- **EditProduct** — General-tab "ราคาทุน (ล่าสุด)" field loads/edits `last_cost_price`, **editable always (Hygeia-style)**; on save it writes `last_cost_price` only and **`cost_price` is stripped from the payload** (never clobbers the avg); new product seeds both. "ราคาทุน" MetricCard shows last cost with a `เฉลี่ย ฿X` sub-line; profit/% glance now vs last cost.

### Verification
- `npx tsc --noEmit -p tsconfig.json` — **no NEW errors**. Same 8 pre-existing baseline (dialog.tsx `icon-m`, EditProduct `FullProduct`/`ProductLabel` props, `themeStore.ts` line 61).
- **Not run / click-tested by Claude** — operator to dev-run and eyeball: receive a lot → cost stays put (avg, not jumpy); free-goods receive doesn't zero "ทุนเก่า"; POS profit for a กล่อง item is sane; EditProduct cost edit doesn't move the avg.

### Known follow-ups (display-only, NOT done — flagged to operator)
- **GR-cancel** and **`products:updateLot`** recompute `cost_price` (avg) but do **not** refresh `last_cost_price` → it can go stale after cancelling the GR that set it, or editing a lot's cost. Decide whether to refresh.

### Next — Reports page cost audit (last page in the sweep)
1. Trace every cost/profit/valuation figure in `Reports/*` + `reports.ts`: confirm COGS uses **FEFO lot cost** via `sale_item_lots → product_lots` (it does at `reports.ts:39,70`), inventory valuation uses lot cost (`reports.ts:141`), purchase report uses `purchase_receipt_items.cost_price`.
2. Hunt the **same unit-conversion class of bug** (selected-unit qty × per-base cost) anywhere reports compute line cost.
3. Then decide the GR-cancel / lot-edit `last_cost_price` refresh question above.

---

## Session 2026-05-17 — Design-system sweep (phase 2): People page refine

Continuing phase 2 consistency sweep page-by-page. This session = `People/index.tsx` brought fully onto the showcase/table-card standard, plus one backend fix surfaced during the audit.

### Done — `src/pages/People/index.tsx` (UI only, all 3 tabs: ลูกค้า / ผู้จำหน่าย / พนักงาน)
- **Standard table-card layout** adopted (matches `Products/index.tsx` canonical): removed outer `rounded-2xl` card-in-card; Tabs sit on background (`default` variant); each tab = toolbar → `bg-card rounded-card shadow-card` card with `h-12` header bar (count left + `h-9` Add button right), table area `border-l-8 border-r-8 border-card`, `h-12 border-t` footer pagination bar.
- **Primitives per convention**: raw `<select>`/`<textarea>`/`<label>` → `Select` / `Textarea` / `Label`; row actions `size="sm" variant="ghost"` → `className="w-16" size="icon-lg"` split by role (`warm` แก้ไข / `destructive2` ลบ); `Edit2`→`Edit` icon; Button-icon `w-N h-N` → `size-N`.
- **Token/text rules**: `rounded-2xl`/`rounded` literals → `rounded-card`/`rounded-lg`; all `text-xs` outside Badge → `text-sm`; redundant Badge `text-xs` overrides dropped; empty states → lucide icon `size-10 opacity-30` + `py-16`.
- **Realtime search**: debounced 300ms `useEffect([q])` (mirrors Products); search button + Enter handler removed (Customers + Suppliers tabs).
- **All 3 modals → showcase Modal Layout**: `DialogContent` `onClose` wired (X button now closes); fields `<div className="space-y-1.5"><Label>…</Label><control/></div>` (dropped `FormField` — its uppercase-bold doesn't match the showcase); `DialogDescription` added to every header; Select `className="w-full"` (no h-10/rounded override); Switch in modals `size="lg"` + inline `<Label>`; Enter→primary-OK wired via `submitOnEnter` (Textarea exempted); footer already `destructive2`+`size="xl"`.

### Done — backend fix (surfaced during People audit)
- **Customer running code unified.** Two divergent generators (`people:saveCustomer` used `WHERE code LIKE 'C%' ORDER BY id DESC`; POS `pos:addCustomer` used `ORDER BY id DESC` *unfiltered* → could collide on `C0001`). Replaced both with a single shared helper `electron/ipc/codes.ts` → `nextCustomerCode(db)` using `MAX(CAST(SUBSTR(code,2) AS INTEGER))+1` (immune to out-of-order import / hand-edited codes; C0000 walk-in keeps suffix 0 so first real customer = C0001).
- Confirmed (no change needed): customer/supplier/staff delete is **soft** (`is_hidden`/`is_disabled`), not a hard DELETE — preserves FK history.

### Open question flagged to operator (NOT actioned)
- **C0000 "ลูกค้าทั่วไป" is a real selectable row** (`is_hidden=0`) but POS walk-in default is a hardcoded string with `customer_id = NULL` — same label, two buckets. Recommended: seed C0000 with `is_hidden=1` and treat `customer_id IS NULL` as the only walk-in path. Operator edited the C0000 name but the `is_hidden` decision is still pending.

### Verification
- `npx tsc --noEmit -p tsconfig.json` — **no NEW errors** in `People/index.tsx`, `codes.ts`, `people.ts`, `pos.ts`. Same pre-existing baseline (dialog.tsx `icon-m`, EditProduct props, `themeStore.ts` line 61).
- **Not click-tested by Claude** — operator to dev-run and eyeball People (all 3 tabs + modals), and verify new-customer code = next C-number with no collision from POS quick-add.

### Next — remaining phase-2 pages, then detail-fix round
1. **`Reports/*`** — bring onto table-card / showcase standard (overlaps with the Reports cost audit queued in the previous session — do together).
2. **`Settings/index.tsx`** — same sweep (raw `<input>` flagged in phase-2 plan; tab/card/modal standardization).
3. **Detail-fix round (after all pages swept):** re-run each page fresh from the top, eyeball-by-eyeball, and fix the fine-grained issues that only show at runtime (spacing, alignment, edge-state polish) — a dedicated pass, not folded into the structural sweep.

---

## Session 2026-05-17 — `EditProduct.tsx` split into per-tab files

Operator noticed Reports already splits each tab into its own file but `EditProduct.tsx` was still a single **2,155-line / 117KB** monolith with 5 tabs (general, units, labels, lots, history) sharing the file. Asked: should we do the same here? Decision: yes — pure structural refactor, no behavior change, one tab at a time to keep risk low.

### Strategy
Order chosen by coupling, least → most: **History → Lots → Labels → Units → General**. History is read-only with self-contained state (movements + filters + sale/GR detail dialogs) — safest first move. General last because it owns the form and feeds save logic.

Parent (`index.tsx`) keeps the cross-cutting bits: `form` + `setF` + `validate` + `handleSave`/`doSave`, `product` + `loadAll`, `tab` state, lookups (`categories`/`drugTypes`/`itemUnits`/label-*), PageHeader, 4 MetricCards, Tabs nav, and the 3 cross-cutting dialogs (PriceWarning, LeaveConfirm, AdjustStockDialog).

Each extracted tab owns its own dialog state, form draft, in-tab handlers, and the dialog markup. Mutation IPCs inside a tab call back through `onRefresh()` (prop), which re-fetches `product` in the parent — preserves the single source of truth.

### Done
- **Folder layout** — `src/pages/Products/EditProduct.tsx` → `src/pages/Products/EditProduct/` via `git mv` (rename preserves history). Vite/lazy import (`./pages/Products/EditProduct` in `App.tsx`) resolves to the folder's `index.tsx` automatically — no route change needed.
- **`shared.ts`** — extracted types/constants used by multiple files: `FullProduct`, `StockMovement`, `MovementSortKey`, `MOVEMENT_META`, `GenericNameSuggestion`, `REQUIRED_FIELDS`, `REQUIRED_LABEL`.
- **`HistoryTab.tsx`** — owns `movements`/`movementsLoading`/filters/sort/date-range state, lazy-load effect (`active` prop gates the first fetch), `reloadMovements`/`filteredMovements`/`toggleMovementSort`/`openMovementDetail`. SaleDetail + PurchaseReceipt detail dialogs moved into the tab (they're history-only).
- **`LotsTab.tsx`** — owns lot inline-edit state (`editingLotId`/`lotEditForm`/`lotSaving`/`confirmLot`) + handlers (`startEditLot`/`handleSaveLot`/`getLotEditChanges`/`confirmSaveLot`) + confirm dialog. Recomputes `activeLotList`/`totalStock` locally for the footer; parent also computes them for the MetricCards (cheap, no shared state needed).
- **`LabelsTab.tsx`** — owns `labelDialog`/`editingLabel`/`labelForm`/`labelSaving` + add/edit/delete + the giant label dialog (multi-language indication/notes, 5 lookup selects). Receives the 5 label lookups via props.
- **`UnitsTab.tsx`** — owns `unitDialog`/`editingUnit`/`unitForm`/`unitSaving` + add/edit/delete + the unit dialog (qty_per_base math, profit/per-piece calc). Synthetic base row at top rendered from `product.unit_name` + `product.price_*` with "แก้ไขที่แท็บข้อมูลทั่วไป" hint. Takes `defaultPriceRetail={form.price_retail}` so "add new unit" still seeds the price from the General tab's current value (preserving the cross-tab coupling).
- **`GeneralTab.tsx`** — owns generic-name autocomplete state (`genericQuery`/`genericSuggestions`/`showGenericSugg`/`genericTimer` ref) + `handleGenericSearch`/`selectGeneric`. Receives `form`/`setF`/`setForm`/`errors`/lookups. `setForm` (not just `setF`) is passed because the drug-type select does a compound multi-field update.
- **Parent `index.tsx`** — added `refreshProduct()` helper (re-fetches product after a tab mutation). Cleaned unused imports after each extraction.

### Final shape
```
src/pages/Products/EditProduct/
├── index.tsx       557  (parent: form state, save, tab routing, 4 metric cards)
├── shared.ts        58  (types/constants)
├── GeneralTab.tsx  458
├── HistoryTab.tsx  323
├── LotsTab.tsx     301
├── LabelsTab.tsx   300
└── UnitsTab.tsx    362
```
Before: 2,155 LOC in one file. After: 7 files, largest 557. Total grew by ~200 LOC (per-file imports + prop interfaces) — fair trade.

### Files changed
- `src/pages/Products/EditProduct.tsx` → **moved** to `src/pages/Products/EditProduct/index.tsx` (git tracks as rename) and slimmed by removing each tab's state/handlers/JSX as they were extracted.
- **New:** `src/pages/Products/EditProduct/shared.ts`, `HistoryTab.tsx`, `LotsTab.tsx`, `LabelsTab.tsx`, `UnitsTab.tsx`, `GeneralTab.tsx`.

### Verification
- `npx tsc --noEmit -p tsconfig.json` — **no new errors**. Same pre-existing baseline (dialog.tsx `icon-m`, `themeStore.ts` line 61, `FullProduct.drug_generic_name_id` / `tmt_id` in `loadAll`, `ProductLabel.label_time_id`/`advice_id`/`show_barcode`/`is_default` — all pre-existed in the type defs and were untouched).
- **NOT click-tested by Claude.** Operator MUST exercise each tab end-to-end before relying on the refactor:
  1. **General** — create new product, required-field validation, generic-name autocomplete (auto-tick antibiotic), drug-type select → ข.ย.10/11/13 auto-fill, save → redirect to edit URL, leave-confirm if dirty.
  2. **Units** — synthetic base row at top, add/edit/delete non-base, qty_per_base math + profit preview in dialog.
  3. **Labels** — add/edit/delete, all 5 dropdowns (dosage / frequency / timing / label_time / advice), multi-language indication.
  4. **Lots** — inline edit, validation blocks blank/NaN, confirm dialog shows diff, `is_cancelled` lots have no edit button, qty crossing 0 closes/reopens lot.
  5. **History** — filter chips, date range, sort by created_at + lot_number, "ดูข้อมูล" opens SaleDetail or PurchaseReceipt dialog.
  6. **Cross-tab** — save in General → switch to Units → confirm price_retail still default for new unit; save Lots/Units/Labels mutation → parent product refreshes (MetricCard counts update).

### Why this matters for next time
Adding a feature or hunting a bug in EditProduct is now a single-file edit. Pre-refactor, any change meant scrolling through 2k lines with state for all 5 tabs in scope. Same goes for HMR: changing a tab no longer re-parses the whole monolith.

### Architectural rules baked in
1. Tabs are **owners of their dialog state**, not the parent — keeps each tab self-contained.
2. Mutation refresh is via the **`onRefresh` callback prop** — parent stays the single source of truth for `product`.
3. **Form state lives in the parent** because the save button (PageHeader) and the cross-cutting price-warning dialog both need it; only the General tab reads/writes it via `setF`/`setForm`.
4. **Cross-tab couplings stay explicit** as named props (e.g. `defaultPriceRetail` to UnitsTab) — no module-level singletons, no context.
