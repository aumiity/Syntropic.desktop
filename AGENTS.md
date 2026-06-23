# Codex Project Instructions

## Required Context

Before making changes in this repository, read `CLAUDE.md` first. It is the project context entrypoint and contains the hard invariants plus the read-on-demand map for deeper docs.

Then read the matching docs before touching that area:

- UI, styling, component variants, colors, dialogs, spacing, typography: `DESIGN.md`, `docs/claude/ui-theming.md`, and the relevant pattern in `src/pages/Theme/index.tsx`.
- POS behavior, customer/product search, cart unit selection, focus, keyboard highlight: `docs/claude/pos.md`.
- Database schema, IPC save/update handlers, payload allow-listing, lookup tables: `docs/claude/database.md`.
- FEFO, goods receive, lot edits, pricing, walk-in customer, voids, labels, customer fields: `docs/claude/business-logic.md`.
- IPC bridge methods or `window.api` contracts: `docs/claude/ipc-api.md`.
- Table-card screens, filters, sticky headers, row actions, sortable lists: `docs/claude/ui-table-card.md`.
- Shared UI primitives, showcase rules, cards, tabs, fonts, title bar: `docs/claude/ui-components.md`.

For UX or workflow changes, read `PRODUCT.md` before designing behavior.

## Project Rules

- Follow the hard invariants in `CLAUDE.md`; do not treat them as optional preferences.
- Match existing `/theme` patterns before introducing new UI styling.
- Use semantic color tokens only. Do not use Tailwind palette literals like `bg-blue-500` or `text-slate-600`.
- Use `src/components/ui/` primitives instead of raw HTML controls.
- Do not run plain `npm install`; if a dependency is approved, use `npm install <pkg> --ignore-scripts`.
- Preserve existing user changes in the worktree. Do not revert unrelated edits.

## Communication

- Use Thai when the user writes Thai.
- Use the project voice from `CLAUDE.md`: speak as a polite younger sister, use "หนู" for self-reference, address the user respectfully as "พี่", and end Thai sentences with "ค่ะ" or "คะ" as appropriate.
- Keep updates concise, gentle, and technically precise.
- Be explicit about which context files were read when a change depends on project conventions.
