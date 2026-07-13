---
name: project_theme_lab
description: New /theme-lab reference gallery — components extracted from an external "Offer" CRM design, scoped separately from /theme; font pick pending
metadata:
  type: project
---

**DONE 2026-07-13 (tsc PASS; visually verified light+dark via Playwright screenshots)** — added `/theme-lab` ("Theme Lab" in sidebar bottom nav, `FlaskConical` icon, next to Appearance/CSS) as a component reference gallery extracted from 28 screenshots of an external real-estate CRM ("Offer") design the operator liked. Fully isolated from the real `/theme` showcase per operator request ("ไม่ปนกับของเดิม").

**Scope:** `src/pages/ThemeLab/index.tsx` — font comparison (4 serif candidates), status/badge/checklist components, cards (KPI+sparkline, hero banner, photo-bleed banner, tinted summary strip, ghost placeholder), data table + nested checklist + sequence row, inputs (rich search dropdown, filter builder rows, chip input, split slider, NPS picker, dropzone, split-doc range row, rich-text toolbar), nav/layout (mini forest sidebar, 2-level settings nav, kanban+hover, CRM detail split layout), charts (gauge/sparkline/bar/dot-grid).

**Isolation mechanism:** all new tokens scoped under `.theme-lab` class in `src/index.css` (`--lab-bg`, `--lab-card`, `--lab-sidebar*`, `--lab-forest*`, `--lab-amber*`, `--lab-font-serif`) + `.dark .theme-lab` overrides — registered in `tailwind.config.js` under `lab-*` color/fontFamily keys. Zero risk to the real app's `--primary`/`--sidebar`/etc. tokens.

**Font decision — PENDING.** 4 self-hosted serif candidates downloaded to `src/assets/fonts/` (variable woff2, single file per family serves the whole weight range — Chromium interpolates): Source Serif 4 (recommended, marked in-page), Lora, Newsreader, Fraunces. `--lab-font-serif` currently points at Source Serif 4. Operator asked to compare visually before deciding — **ask which one before wiring a pick anywhere else.**

**Not done yet / explicitly out of scope:** nothing from this page has been applied to the real app's `/theme` or any live page — it's reference-only, "หยิบไปใช้ต่อได้เมื่อพร้อม" (pull pieces in later once decided).
