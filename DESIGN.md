# Design

> **Read this before designing anything in this repo.** This project is NOT a greenfield brand surface. It has a mature, locked design system enforced by `CLAUDE.md` HARD invariants, the `/theme` showcase page, and a semantic-token architecture. Your job is to work *inside* this system, not to introduce a new visual language. When a generic "best practice" in your skill rules conflicts with a House Invariant, **the House Invariant wins** — surface the conflict, do not silently override.

## Theme / Mood

Clinical-but-warm desktop operator tool. Near-white neutral surfaces, a deep **teal** brand, a **yellow** accent for attention/secondary CTAs, and iOS-style status colors. Full structural dark mode. Density is high (tables, lots, prices) but legibility is protected. Frameless Electron window with a custom `TitleBar`.

---

## Single source of truth — do NOT restate the rules here

The full design system lives in **three places, each authoritative for its layer**. This file used to copy them and drifted, so it no longer holds the rules — it points to them. When you need a rule, open the owner; do not re-derive it here.

| Layer | Owner (authoritative) | What's there |
|-------|----------------------|--------------|
| **Tokens / variants** (executable, can't drift) | `src/index.css` (`:root` + `.dark`), `tailwind.config.js`, and the live showcase **`/theme`** = `src/pages/Theme/index.tsx` | Every color token, radius, shadow, and component variant — rendered. Match the showcase pattern; changing a primitive's default means updating its showcase demo in the same change. |
| **Session headlines** (loaded every `claude` session) | **`CLAUDE.md`** → "HARD invariants → UI & theming" | One-line headline per rule + pointer to the deep doc. |
| **Deep prose** (the "why + failure mode") | **`docs/claude/ui-*.md`** | The real reference. See map below. |

### docs/claude/ui-*.md — what each covers
- **`ui-theming.md`** — Tailwind-v3 CSS-var syntax trap; semantic-token-only rule + how to add a token; raw-HTML ban; ELEVATED-default inputs; **full color palette + Button/Badge variants by role**; dialog footer button roles; modal contract; icon `size-N` rule; text-size hierarchy (rule 9); 10px scrollbar; canonical primitive defaults (Table/Select/Dialog/DateInput/Card radius).
- **`ui-components.md`** — `/theme` showcase-is-truth rule; Card components (Section/Metric/Stat); Tabs variants; **Typography & fonts** (full stack, light/dark defaults, Thai alternates, print=Sarabun); frameless window.
- **`ui-table-card.md`** — table-card 4-zone layout, filter strip (`h-14`/`h-10`), row-action buttons, sortable mode, sticky headers, column-width rules.
- **`pos.md`** — POS search-modal focus/highlight invariants, unit-selection ordering.

---

## Where your skill's generic rules need adjustment for THIS repo

This is the one section unique to this file — the bridge between an external design skill's generic playbook and this codebase. It is not a rule with an incident; it's guidance for an agent arriving with generic priors.

- **"Cards are the lazy answer / nested cards are always wrong"** → does not apply here. This is a data-dense operator tool; the **table-card layout (4 background zones)** and `SectionCard`/`MetricCard`/`StatCard` are deliberate, canonical patterns. The POS redesign uses bordered cards on purpose. Match the existing card patterns; do not strip them.
- **Palette** → the live palette is HSL tokens in `src/index.css` (light + dark) and is the default; identity preservation is the norm, so don't silently swap brand colors. **But proposing a NEW palette is allowed** when there's a genuine need and the result is more beautiful/appropriate — pitch it to the user first and get a yes before applying. Keep referencing tokens (add new ones to `:root` + `.dark`); never hardcode Tailwind palette literals regardless.
- **Motion / animation** → welcome, not discouraged. Tasteful animation that elevates the UI is encouraged. `framer-motion` (Tabs pill slide) and `tailwindcss-animate` are already available; **adding another motion library is fine when it fits** — just tell the user what you plan and get a quick OK before pulling it in (and remember: never run a bare `npm install`, use `--ignore-scripts`; it breaks the better-sqlite3 native binary — see CLAUDE.md). Keep a `prefers-reduced-motion: reduce` alternative for accessibility.
- **Aligned and welcome:** your bans on side-stripe borders, gradient text, decorative glassmorphism, hero-metric templates, uppercase eyebrows, em dashes, and marketing buzzwords all match this project. Keep enforcing those.
