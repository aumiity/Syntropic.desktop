---
name: project_ui_reskin_template_derived
description: Full brand reskin (colors/borders/buttons/components) brainstorm derived from the Modernize (adminmart) template — PAUSED, decisions so far
metadata:
  type: project
---

**PAUSED 2026-07-12 — user wants to decide later, resume whenever they come back to it.** This is a full brand/visual reskin effort, separate from [[project_ui_redesign_pass]] (that one is page-by-page polish *within* the existing token system; this one changes the tokens/brand themselves).

## Why
Owner wants to buy/reference a template rather than design from scratch, then have Claude adapt the *visual language* (not the code) into Syntropic's existing token system. Confirmed via brainstorming that the token system (`src/index.css` + `tailwind.config.js` + `/theme` showcase) is centralized enough that a full reskin is realistic without page-by-page rewrites.

Reference template: **Modernize** (Vuetify/Vue3 admin dashboard, adminmart.com — `https://modernize-vuejs.adminmart.com`). Extracted its real design tokens by pulling the built JS bundle (Vue SPA, so page content isn't fetchable via curl/WebFetch directly — had to grep the bundled `index-*.js` for the Vuetify theme config object).

## Decided so far
- **Brand colors: BLUE_THEME (template's default)** — primary `#5D87FF`, secondary `#49BEFF`. User picked this over Aqua/Green/Cyan/Purple/Orange (all 6 official variants + hex are recorded in the brainstorm session content files under `.superpowers/brainstorm/` if the exact swatches are needed again).
- **Status colors** — template's success/warning/error/info map 1:1 onto our `success/warning/destructive/info` token roles: success `#13DEB9`, warning `#FFAE1F`, error `#FA896B`, info `#539BFF`. Not yet written into `src/index.css` — still just a proposal.
- **Font: Plus Jakarta Sans** for Latin — user explicitly asked for it after seeing the template. It has **no Thai glyphs** (Latin/Cyrillic/Vietnamese only, confirmed via Google Fonts + tokotype/PlusJakartaSans repo), so it needs a paired Thai face same as today's Inter+IBM Plex Sans Thai split.
  - Added `Plus Jakarta Sans` (variable font, Latin-only) + `Kanit` + `Prompt` (both full Thai+Latin) to the font picker at `src/pages/CSS/index.tsx` `FONT_ROWS`, font files bundled at `src/assets/fonts/` (downloaded from the `google/fonts` GitHub repo, OFL-licensed), `@font-face` registered in `src/index.css`.
  - **User already live-tried it via the in-app picker**: `--font-latin: 'Plus Jakarta Sans'`, `--font-thai: 'Noto Sans Thai'` — this is currently ACTIVE in `src/index.css` (written by the picker's auto-save, not a deliberate final choice). Treat as a live experiment the owner is sitting with, not a finished decision — don't be surprised if it changes back, and don't assume it means Kanit/Prompt pairing was rejected (that comparison was never clicked, just viewed in the browser mockup).

## Still undecided (pending, ask when resuming)
- **Border vs. shadow style** — current app is border-heavy, near-zero shadow (`[[card-border-default]]`, `[[feedback_border_over_ring]]`). Template leans on soft Material shadows instead. Presented 3 options (A: keep border-heavy just recolored, B: full shadow-based like template — biggest rule change, C: hybrid thin-border + subtle shadow) — user has not picked yet.
- Whether `--radius-card` (currently `1rem`) moves toward the template's tighter ~7px corner, or stays as-is — tied to the border/shadow decision above.
- Whether this reskin is a token-only swap (fast) or the user also wants structural component changes (spacing rhythm, button shapes) beyond recoloring — original ask ("ปุ่ม component ต่างๆ เปลี่ยนหมดเลย") suggests they want more than color, but scope wasn't pinned down before pausing.
- Dark-mode equivalent palette — template's dark-theme JSON was also captured in the session (`DARK_BLUE_THEME`: primary/secondary same `#5D87FF`/`#49BEFF`, `lightprimary #253662`, `lightsecondary #1C455D`, `textPrimary #EAEFF4`, `textSecondary #7C8FAC`, `background #2a3447`) — not yet mapped onto our `.dark` block.

## How to resume
Don't re-derive the template's colors from scratch — they're recorded above. Pick up at the border/shadow question (screen `shape-style.html` in the paused brainstorm session, or just re-ask in terminal), then move to writing the actual token diff in `src/index.css` + updating `/theme` (`src/pages/Theme/index.tsx`) showcase per the HARD rule that primitive defaults and their showcase demo change together.
