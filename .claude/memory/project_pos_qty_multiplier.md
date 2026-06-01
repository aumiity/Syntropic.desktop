---
name: project_pos_qty_multiplier
description: "POS quantity-multiplier feature — final convention is number-then-star (5*), NOT *N prefix; don't re-add idle/compose"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4074acda-bd2d-4089-9f47-36946c51306b
---

POS quantity multiplier shipped 2026-05-30 in `src/pages/POS/index.tsx` (gated by sales-setting `qty_multiplier_enabled`, default on).

**Final convention: type the number FIRST, then `*` as the commit key, then scan/select** (e.g. `5*` → scan → adds 5). Operator corrected mid-build: "ปกติเขาใช้ 5 * [สแกน]".

**Why:** `*` as an explicit commit means there is NO timing/scanner race at all.

**How it works:** `handleMultiplierKey` swallows `*` ONLY when the search box holds pure digits 1..999 → arms `multiplier`, clears box. Anything else (`0`, `>999`, names, names-with-`*`) → `*` types normally. `multiplier` is single-use, resets in `closeSearch()` on every modal close (select OR Esc). Search modal no longer auto-closes on empty query — closes only via Esc or selecting.

**Do NOT re-add these scrapped approaches** (tried and rejected this session): `*N` PREFIX typing (`*3` first), separate keystroke buffer with `preventDefault`, idle-timer auto-commit (tried 400/500/700ms), and the big `×N` overlay in the search field. Code is the source of truth — the plan file at `~/.claude/plans/src-pages-pos-index-tsx-linear-finch.md` still documents the OLD scrapped `*N` design, ignore it.

Part of [[project_next_systems_backlog]] context. Not formally click-tested yet.
