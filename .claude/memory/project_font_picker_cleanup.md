---
name: project_font_picker_cleanup
description: 2026-07-14 font-picker cleanup — removed 11 unused fonts, added FC Mission (Fontcraft trial)
metadata:
  type: project
---

Owner reviewed the `/css` font picker and asked to remove fonts no longer being considered: Sukhumvit Set (+ Latin twin), Bai Jamjuree, SF Thonburi, IBM Plex Sans Thai Looped (+ Latin twin), MiSans Thai, FC Paragraph, FC Iconic, FC Iconic Condensed, FC Vision, Prompt, Kanit.

**Why:** these were experimental picks from earlier font-comparison rounds ([[project_ui_reskin_template_derived]], [[theme_tokenization]]) that the owner decided against. Sukhumvit Set specifically was dropped after diagnosing that it renders soft/fuzzy in the Electron app on Windows at fractional display scaling (125%/150%) — a known Chromium/DirectWrite ClearType-subpixel-grid issue, confirmed by the owner (crisp on an unscaled monitor, blurry on the scaled one) — NOT a font-file or hinting problem as first suspected, and not fixable via `-webkit-font-smoothing` or `app.commandLine.appendSwitch('disable-lcd-text')` (the latter caused a white-screen regression and was reverted — do not re-try without a fresh investigation).

**How to apply:** if asked to add a font back, it no longer exists in the repo — re-source it (Fontcraft/Google Fonts/etc.) and re-add fresh rather than assuming leftover files.

**What was touched on removal:** `src/index.css` (`@font-face` blocks), `src/pages/CSS/index.tsx` (`FONT_ROWS`), `src/lib/print/fonts.ts` (`FONT_REGISTRY` — these were also removable as print-label font choices), `src/assets/fonts/*` (deleted the now-unreferenced `.ttf`/`.otf` files), `electron/db/schema.ts` (added a `user_version 3` migration that falls back any `receipt_settings`/`label_settings` row still pointing at a removed font to `'Sarabun'`, mirroring the existing `user_version 1` Bai Jamjuree migration), `docs/claude/ui-components.md`, `.claude/memory/project_prebuild_cleanup.md`.

**Same session, added FC Mission** (fontcraftstudio.com/fc-mission) — another Fontcraft non-commercial trial family, same licensing shape as FC Sara Samkan (500 THB commercial license if it stays for a real build — see [[project_prebuild_cleanup]]). Free trial download ships exactly ONE real cut (internal font name `FC Mission [Non-commercial] Med` — Medium weight only); declared in `src/index.css` as a `font-weight: 100 900` range so every weight request snaps to that one cut instead of synthesizing fake-bold (same pattern as FC Vision was). File saved as `src/assets/fonts/FCMission-Medium.otf`. NOT added to `src/lib/print/fonts.ts` `FONT_REGISTRY` — none of the FC-prefixed trial fonts are (UI-picker-only, deliberately excluded from the printed-document font list).
