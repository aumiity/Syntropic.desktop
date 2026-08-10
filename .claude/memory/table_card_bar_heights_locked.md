---
name: table-card-bar-heights-locked
description: 2026-07-24 standard table-card bars LOCKED — top h-14, bottom h-12 (intentionally different), controls h-8
metadata:
  type: project
---

**LOCKED 2026-07-24** — the standard table-card (Products list / EditProduct tabs pattern) has **two bars of intentionally DIFFERENT height** — the operator confirmed the asymmetry is on purpose, do NOT "fix" them to match:

- **Top bar** (title + filter strip) = **`h-14 px-4`** (`px-4` = 16px, matches the table's 16px left inset — see [[table-card-scrollbar-inset]])
- **Bottom bar** (status / total / pagination) = **`h-12 px-5`** — deliberately shorter
- **Every control inside either bar = `h-8`**, all `variant="elevated"` (icon-only = `h-8 w-8 p-0`)

The bar's fields (search Input, category Select) default to `h-8` ([[control-height-h9-revert]]). The filter/column **icon buttons** use `size="lg"` (Button `lg` = `h-9`) + a `className="h-8 w-8 p-0"` override to stay dense and match the fields — keep that override; don't drop it expecting a `h-8` default (Button ladder is unchanged: default h-8 / lg h-9 / xl h-10).

Supersedes the old "EVERY bar = h-12 / control = h-9" single-rule *for the table-card*. The dead `h-14`-strip / `h-10`-control filter-strip predecessor stays dead — this `h-14` top bar is a fresh deliberate value, not a revival.

Other locked details of this pattern (all in `docs/claude/ui-table-card.md`, synced 2026-07-24):
- ~~Table side inset = `border-l-[16px] border-r-[16px] border-card`, scrollbar 16px in from the card edge, flush-right "tried and rejected".~~ **OUTDATED — reversed the same evening (2026-07-24 `c8f6189`) and swept app-wide 2026-08-10.** Border now lives on the `<table>` as `border-l-[16px] border-r-[6px] border-card` with the scrollbar flush at the card's outer edge, plus a mandatory `[scrollbar-gutter:stable]` on the scroll container. See [[table-card-scrollbar-inset]].
- Count badge = `Badge variant="outline"`.
- Pagination buttons = `variant="elevated"` + `radius="sm"` (current page stays `default` teal) — see `src/components/ui/pagination.tsx`.

**Header leading icon = IN TRANSITION (NOT locked):** `/theme` mockup dropped the leading `<TintIcon>` (title = h3 + count Badge only) but existing pages (Manage/Expenses, Reports/NewDashboard) still have it. Operator will adjust page-by-page ("เด๋วค่อยๆปรับไปทีละหน้า") — do NOT sweep either way. When an icon IS present it stays `tint="neutral" bordered`.

SSOT (visual) = `/theme` › "Standard Table-Card Layout" section in `src/pages/Theme/index.tsx`. Prose = `docs/claude/ui-table-card.md`.
