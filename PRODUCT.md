# Product

## Register

product

## Users

Pharmacy staff and the pharmacy owner in a small-to-mid Thai retail pharmacy. They operate the app on a desktop (Windows/Mac) at the counter and in the back office. Primary contexts:

- **At the counter (POS):** fast, keyboard-and-barcode-scanner driven sales. Speed and zero-misclick accuracy matter more than visual flourish. Often standing, often a queue waiting.
- **Back office (Manage / Purchase / Reports / Settings):** stock receiving (GR), lot/FEFO management, pricing, purchase history, regulatory reports (ข.ย. forms), customer records, finance.

The interface is **Thai-language throughout**. Users are not technical; they are pharmacists and assistants. Many actions map to legal/regulatory obligations (FDA drug records), so correctness and traceability outrank novelty.

## Product Purpose

A desktop Pharmacy POS + inventory + regulatory-records system, rebuilt from an earlier Laravel/MySQL PHP application into an Electron + React + SQLite app that runs fully offline on the shop's own machine. Success = a pharmacist can ring a sale, receive stock with correct FEFO lot tracking, price items on a 3-cost model, and produce the regulatory reports the Thai FDA requires, all without errors and without an internet connection.

## Brand Personality

Calm, precise, trustworthy, clinical-but-warm. Three words: **dependable, legible, unfussy.** The product is a daily tool, not a showpiece. It should feel like well-made equipment: the teal/yellow identity gives it a distinct, slightly clinical warmth without ever getting in the way of the task. Visual confidence comes from consistency and density done right, not from decoration.

## Anti-references

- **Generic SaaS landing-page aesthetic** — hero-metric templates, gradient accents, tiny uppercase tracked eyebrows, marketing buzzwords. This is an operator tool, not a marketing site.
- **Consumer fintech "fun"** — playful illustration, oversized rounded blobs, confetti micro-delight. Inappropriate for a regulated pharmacy record-keeping context.
- **AI-default warm-neutral "cream/sand/paper" palettes.** Our surfaces are near-white neutral with a teal brand, deliberately.
- **Decorative motion.** Animation must serve task feedback, never spectacle.

## Design Principles

1. **The task wins.** Every screen serves a job (ring a sale, receive a lot, run a report). Visual choices that slow the task or add a click are wrong, even if prettier.
2. **Density with legibility.** This is a data-dense operator tool: tables, lots, prices. Pack information, but never below the legibility floor (Thai stacked diacritics need line-height room; minimum text size is enforced).
3. **One source of truth for style.** The `/theme` showcase page and the semantic token system define the look. Nothing is styled ad-hoc; new UI matches an existing pattern or the pattern is added to the showcase first.
4. **Re-themable by one file.** The entire palette must be swappable by editing `src/index.css`. No hardcoded colors anywhere, ever. This is a hard architectural guarantee, not a preference.
5. **Correctness is visible.** Status, stock state, regulatory tags, and cost/margin are surfaced with deliberate role-based color, not buried.

## Accessibility & Inclusion

- Body text contrast ≥ 4.5:1; large text ≥ 3:1. The app ships a full dark mode mirroring light mode structurally.
- **Thai script support is a hard requirement:** stacked diacritics (e.g. ขมิ้น) must not be clipped — `truncate`/`line-clamp` utilities carry a raised line-height for this reason. Digit runs must render in the Latin font, not the Thai font (handled via `unicode-range` scoping).
- Keyboard-first operation in POS (barcode scanner = keyboard input). Focus management in the POS search modal is a hard invariant.
- Reduced-motion alternatives required for any animation added.
