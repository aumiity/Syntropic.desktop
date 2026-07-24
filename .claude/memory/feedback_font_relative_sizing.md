---
name: feedback_font_relative_sizing
description: Root font-size is variable until build; all UI sizing must stay rem — never hardcode px to compensate
metadata:
  type: feedback
---

Root font-size (`html { font-size: … }` in `src/index.css`, **currently 18px**) is **not fixed** — the operator changes it up/down to taste (via `/css` → `settings:saveThemeFontSize`, which rewrites that line) and will keep changing it through several rounds until the real production build.

**Why:** he tunes it for his eyes; every change rescales the whole UI because Tailwind `h-9`/`h-12`/`text-sm`/`size-4`/`gap-*`/`p-*` are rem units that track the root.

**How to apply:**
- Height/spacing rules (bar `h-12` / control `h-9`, etc.) are font-relative and **must NOT be edited when the font changes** — bar and control scale together, ratio holds at every size.
- **Never hardcode px to "pin" a size back** (e.g. `h-[36px]` to undo the 40.5px a button becomes at 18px) — that one element stops scaling and desyncs from everything around it.
- px figures in docs/comments ("`h-9` = 36px") are illustrative at a 16px root, NOT the rule. The rule is the rem class name.
- px is correct only where it must NOT scale with font: print sheets (A4/slip/label, px/pt), 1-2px borders, 10px scrollbar, chart heights, window chrome (TitleBar).
- Bounding sizes: modal → `max-h-[Xvh]` (viewport, font-immune); locked row count → `h-[Nrem]` (scales with rows).

Incident 2026-06-23: root 16px→18px broke fixed-px dialog heights (POS payment/adjust/return + AdjustStock `h-[Npx]`→`max-h-[Xvh]`), `SaleDetailDialog` table `h-[450px]`→`h-[25rem]`, `TitleBar` `text-[10px]`→`text-xs`. Codified in CLAUDE.md (HARD invariant) + `docs/claude/ui-theming.md` §Font-relative sizing + `ui-table-card.md` bar-height note. Related: [[feedback_read_doc_before_ui_edit]], [[feedback_text_size]].
