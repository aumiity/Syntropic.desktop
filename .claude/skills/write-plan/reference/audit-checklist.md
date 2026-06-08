# Audit checklist — review the plan before shipping

Used in step 4 of `/write-plan`. Send this checklist to a sub-agent to review the draft plan in both rounds. The agent must **open the real files to confirm** every item, not trust the draft.

## Brief to send the agent (template)
> Review this draft implementation plan (content/path below) against the real code in the repo and the checklist in `.claude/skills/write-plan/reference/audit-checklist.md`.
> Find every flaw. Return a finding list: `[severity P0/P1/P2] title — reason — file:line reference — suggested fix`.
> Do not edit files — report only. For any heading with no issues, say PASS.

## Checklist

### 1. Reference correctness
- [ ] Every path / file / function / table / column the plan cites **actually exists** (open and check).
- [ ] Every IPC method / `window.api.*` cited exists in `electron/preload.ts` + a handler.
- [ ] Assumptions about existing code behavior match the real code, not a guess.

### 2. Invariants (from CLAUDE.md "HARD invariants")
- [ ] Save payloads are allow-listed, no raw `...form` spread (products:update, etc.).
- [ ] Walk-in is a real C0000 row, never a NULL `customer_id`.
- [ ] Base unit lives on `products.unit_id`; no `is_base_unit`.
- [ ] No coercing blank → 0 for stock/cost (`parseFloat('')||0`).
- [ ] Lot `is_closed` toggles when qty crosses 0.
- [ ] UI: no emojis in output, semantic tokens not palette literals, Tailwind v3 bracket syntax, no raw HTML elements, full modal contract, bar=h-12 / control=h-9, icons in Button use `size-N`, text ≥ text-xs.
- [ ] If touching a page with a dedicated doc, the plan is consistent with the relevant `docs/claude/*.md`.

### 3. Plan completeness
- [ ] Definition of done is genuinely checkable, not vague.
- [ ] Steps are ordered correctly by dependency — no step needs the result of a later one.
- [ ] No missing step (e.g. migrating existing data, updating types, updating the `/theme` showcase, seed).
- [ ] Edge / error / empty-state cases are covered.
- [ ] A verify step exists (tsc / click-test / real-data check) and names exactly what must pass.

### 4. Risk
- [ ] Anywhere that could corrupt real data (Hygeia) is flagged with a mitigation.
- [ ] Backward compatibility / rollback considered.
- [ ] Side effects on other modules (reports, stock, FEFO) are assessed.

## After the audit
Combine both rounds' findings into a short changelog (what was found / severity / how it was fixed) and put it in Section A of the HTML for transparency.
