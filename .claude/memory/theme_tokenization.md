---
name: Theme tokenization refactor — in progress
description: Multi-session refactor replacing all Tailwind palette literals with semantic CSS tokens; pick up from PROGRESS.md "🚧 IN PROGRESS" section. Brand is now teal+yellow (was blue).
type: project
originSessionId: 19e1f6f1-a5cc-4675-8e1d-cfd7a4303d7f
---
Theme tokenization refactor is paused mid-flight. Goal: every Tailwind color literal in `src/` (`bg-blue-500`, `text-slate-600`, etc.) replaced with semantic token classes (`bg-primary`, `text-foreground`) so the whole app re-themes by editing only `src/index.css`.

**Why:** User wants easy brand-color swaps. Hard rules codified in `CLAUDE.md` → "UI Conventions → Theming rules (HARD)".

**Current brand (as of 2026-05-02):** primary = **teal `#0F5D56`** (light) / `#2BA396` (dark); accent = **yellow `#F5C24A`** with dark-brown foreground `#2A1F00`. Was previously emerald, then blue `#0485F7` on 2026-04-30, swapped to teal+yellow on 2026-05-02 to match a high-fidelity design dropped in `claude_design/POS Sales.html`. The mapping cheat sheet in PROGRESS.md still references `bg-blue-*` literals — those refer to the literal classes that exist in source files (the source still has `bg-blue-*` strings to find-and-replace), not the current brand color.

**How to apply:** When the user resumes (likely with "continue" or "let's keep going on the theme refactor"), open `PROGRESS.md` and scroll to "🚧 IN PROGRESS — Theme tokenization". That section has: the remaining file list ordered easiest→hardest, the literal→token mapping cheat sheet, the sidebar-context exception, the verification grep command, and the open question about `button.tsx` secondary variant collapse. The Sidebar pilot is the reference pattern. Decisions already locked: include `src/components/ui/*`, file-by-file (not batch), collapse `slate-500/600` to single `--muted-foreground`. ~449 literals still remain across 13 files (today's POS reskin changed token *values* but didn't replace any literals); biggest are POS (136) and Purchase (270).

**New tokens added 2026-05-02 (do not re-add):** `--accent-soft` (in :root and .dark), `--shadow-card` (in :root and .dark). Tailwind config registers `accent.soft` under colors and `card` under boxShadow — use as `bg-accent-soft` and `shadow-card`.

**Today's POS reskin (2026-05-02)** is documented under "Session 2026-05-02 — POS Reskin" in PROGRESS.md. It is a separate concern from the literal→token tokenization — that refactor is still pending.
