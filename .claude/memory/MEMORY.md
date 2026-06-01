# Project memory — Syntropic.desktop

Repo-tracked project memory. Travels with git → available on every machine (MacBook / PC / Mac mini) and in every `claude` session via the `@.claude/memory/MEMORY.md` import in `CLAUDE.md`. Personal cross-project prefs (Thai language, น้องสาว pronoun) live in the OS/global auto-memory, not here.

One line per memory. Detail lives in the linked file (read on demand).

- [Studio architecture](project_studio_architecture.md) — **2026-06-01** — Syntropic.Studio cross-platform: memory in repo `.claude/memory/` (Option A, write here NOT OS dir), engine = `claude -p` stream-json via child_process (no node-pty), agents path-free (`npx tsc --noEmit`, no cd), machines.json auto-detect by `os.hostname()` (ZEMA-PC=PC), never prompt for machine
- [Next systems backlog](project_next_systems_backlog.md) — **2026-05-30** — operator's next-to-build list: VAT, receipt/tax-invoice printing, drug-label UX redo, Finance (expense entry), quotations, Dashboard rebuild — ask which when resuming
- [VAT phasing](project_vat_phasing.md) — **Phase 1 DONE 2026-05-31** — VAT redesign: one codebase, decided at install not toggled; setup wizard shipped; Phase 2 (hide VAT UI when NO-VAT) + Phase 3 (lock toggle + upgrade flow) pending; off-the-books mode refused
- [POS qty multiplier](project_pos_qty_multiplier.md) — **DONE 2026-05-30** — `5*`-then-scan convention (number-first, `*` = commit); do NOT re-add the scrapped `*N`-prefix/idle-timer/overlay approaches
- [POS redesign](project_pos_redesign.md) — **ACTIVE 2026-05-29, paused** — bordered cards + cart slot + customer dialogs done; right rail/payment/other modals pending — resume by asking user which area next
- [Edit parity pass](project_edit_parity_pass.md) — **ACTIVE 2026-05-28, paused** — align EditBundle UX to EditProduct tab-by-tab; Tab 1 (General+Price merge) DONE; Tab 2 (ComponentsTab) NEXT, not click-tested
- [Table-pattern refactor](project_table_pattern_refactor.md) — **ACTIVE 2026-05-27, paused — resume tomorrow on edit/settings sub-tabs** — ProductsList canonical, rolled out across 9 list pages + new primitives (avatar, DateInput/DateRangePicker elevated, MetricCard destructive2 + justify-start + text-3xl)
- [Column-visibility refactor](project_column_visibility.md) — **ACTIVE 2026-05-25, paused mid-flight** — Settings ⚙️ popover + checkbox per column; shipped on ProductsList+BundlesList; more tables pending — details in PROGRESS.md `🚧 PAUSED` block
- [Manage/Reports restructure](project_manage_restructure.md) — **ACTIVE priority** — phased split; real next steps are PROGRESS.md top block (Phase 2 = extract Purchase history → /manage)
- [ข.ย.10/ข.ย.11 reports — DEFERRED](project_kho10_kho11.md) — no longer "next"; now Phase 5, blocked on อย. spec. Don't start proactively.
- [Invoice Matcher CSV — verified correct](project_invoice_matcher_csv.md) — don't add xlsx writer; Power Automate fix is user-side (read CSV as text). Resume in sideproject.md
- [3-cost model](project_cost_model.md) — cost_price=weighted-avg (valuation/reports, never hand-edit), last_cost_price=last paid (pricing ref), FEFO lot=this-sale margin; Reports audit + GR-cancel refresh still pending
- [Theme tokenization refactor — in progress](theme_tokenization.md) — paused mid-flight; brand is now teal+yellow (changed from blue on 2026-05-02); ~449 literals still pending; resume from PROGRESS.md "🚧 IN PROGRESS" section
- [Modal interaction rule](feedback_modal_behavior.md) — no outside-click close; Esc closes; Enter triggers primary OK. Enforced in shared Dialog component — do not bypass.
- [Button icon sizing](feedback_button_icon_size.md) — icons inside `<Button>` must use `size-N`; `h-N w-N` is silently overridden to 16px by a `:not([class*='size-'])` rule in button.tsx.
- [Min text size = text-sm](feedback_text_size.md) — `text-xs` and arbitrary smaller values (`text-[10px]` etc) forbidden in new code. Codified in CLAUDE.md theming rule #9.
- [tsc discipline](feedback_tsc_discipline.md) — don't run tsc after every edit; skip for markup/className/text-only changes (Vite hot-reload covers them); only type-check type/logic/import changes when genuinely unsure.
