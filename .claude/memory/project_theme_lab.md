---
name: project_theme_lab
description: New /theme-lab reference gallery — components extracted from an external "Offer" CRM design, scoped separately from /theme; font pick pending
metadata:
  type: project
---

**DONE 2026-07-13 (tsc PASS; visually verified light+dark via Playwright screenshots)** — added `/theme-lab` ("Theme Lab" in sidebar bottom nav, `FlaskConical` icon, next to Appearance/CSS) as a component reference gallery extracted from 28 screenshots of an external real-estate CRM ("Offer") design the operator liked. Fully isolated from the real `/theme` showcase per operator request ("ไม่ปนกับของเดิม").

**Scope:** `src/pages/ThemeLab/index.tsx` — font comparison (4 serif candidates), status/badge/checklist components, cards (KPI+sparkline, hero banner, photo-bleed banner, tinted summary strip, ghost placeholder), data table + nested checklist + sequence row, inputs (rich search dropdown, filter builder rows, chip input, split slider, NPS picker, dropzone, split-doc range row, rich-text toolbar), nav/layout (mini forest sidebar, 2-level settings nav, kanban+hover, CRM detail split layout), charts (gauge/sparkline/bar/dot-grid).

**Isolation mechanism:** all new tokens scoped under `.theme-lab` class in `src/index.css` (`--lab-bg`, `--lab-card`, `--lab-sidebar*`, `--lab-forest*`, `--lab-amber*`, `--lab-font-serif`) + `.dark .theme-lab` overrides — registered in `tailwind.config.js` under `lab-*` color/fontFamily keys. Zero risk to the real app's `--primary`/`--sidebar`/etc. tokens.

**Font decision — DONE 2026-07-13.** Operator picked **Source Serif 4** (the recommended default `--lab-font-serif` already pointed at). 4 self-hosted serif candidates remain downloaded at `src/assets/fonts/` (variable woff2) — Source Serif 4, Lora, Newsreader, Fraunces — comparison section in `/theme-lab` kept as-is (reference gallery, not deleted) even though only Source Serif 4 was chosen.

**Not done yet / explicitly out of scope:** nothing from this page has been applied to the real app's `/theme` or any live page — it's reference-only, "หยิบไปใช้ต่อได้เมื่อพร้อม" (pull pieces in later once decided).
