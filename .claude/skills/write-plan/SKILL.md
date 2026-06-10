---
name: write-plan
description: Use when the user wants to create an implementation plan, design doc, or spec before building something — including Thai phrasing like "วางแผน", "ทำ plan", "ออกแบบก่อนลงมือ", "เขียน spec". Drives a discovery interview first (ask until every angle is understood), drafts a machine-readable plan, dispatches two audit rounds to find and fix flaws, then ships ONE self-contained HTML file with a human-readable section (summary, structure map, before/after side-by-side, impact, pros/cons, cautions, UX/UI) and a Claude-work section it executes from. Not for trivial changes or for writing code directly.
user-invocable: true
argument-hint: "[topic / feature to plan]"
---

Produce a thorough implementation plan: interview the user until everything is clear, draft, audit twice, ship as one HTML file with two sections (human-read + Claude-work), then execute from that file.

All user-facing messages use the "หนู/ค่ะ" little-sister tone from CLAUDE.md. Technical structure (paths, code, PASS/FAIL) keeps its exact form.

## Principles
- **Never skip discovery.** Do not start drafting before the interview leaves you confident you understand every angle. This is a hard rule — guessing is a failure.
- **Ground the plan in the real codebase**, not generic advice — read the actual files and structure before writing, every time.
- The final deliverable is **a single self-contained HTML file** (styles inlined, opens on double-click) at `docs/plans/<Topic>.html`.

## Steps (in order, no shortcuts)

### 1. Setup — understand context first
1. Read `CLAUDE.md` + `.claude/memory/MEMORY.md` (already loaded each session) for invariants/conventions.
2. If the topic touches a documented area, open the matching `docs/claude/*.md` **first** (database / business-logic / ipc-api / ui-theming / ui-table-card / ui-components / pos).
3. Explore the real files/code involved (Glob/Grep/Read). Know the ground truth before asking — sharper questions, and never ask what you can find yourself.

### 2. Discovery interview — ask until every angle is clear
This is the heart of the skill. Question the user until things are unambiguous. **Cover at least** these angles (skip only those the user already answered clearly or you can read from code):
- **Goal / problem** — what it solves, who benefits, what "done" means (definition of done).
- **Scope** — what is in / out of scope; how far this phase goes.
- **Desired behavior** — flow, edge cases, error cases, empty states.
- **Constraints** — schema/IPC/invariants that must not be touched, performance, backward compatibility, real data (Hygeia).
- **UX/UI** — appearance, buttons/roles, Thai copy, `/theme` tokens.
- **Trade-offs / alternatives** — if multiple approaches exist, present them for comparison, then ask which to take.
- **Migration / rollout** — does existing data need migrating, how it ships, can it roll back.

Use `AskUserQuestion` for decisions the user must make; ask open-ended questions in plain messages. Ask in small digestible batches — don't dump 20 questions at once. **Do not advance to step 3 until you are confident the picture is complete** — if anything is fuzzy, keep asking. Close by summarizing your understanding back to the user for one confirmation.

### 3. Draft the plan (machine section)
Write the plan Claude will actually execute — detailed, concrete, citing real paths/files/functions. It must contain:
- Goal + a checkable definition of done.
- Ordered work steps; each step states: files touched, what changes, why, and the invariants to watch.
- Risk points + mitigations; the tests/verification that must pass (tsc, click-test, etc.).
- Dependency order between steps.
Keep this draft (in memory or a scratch file) — it becomes the "Claude-work" section of the HTML.

### 4. Audit twice — find flaws, then fix
Send a sub-agent to review the plan in **two separate rounds** (subagent_type: `general-purpose`) — see `reference/audit-checklist.md`:
- **Round 1:** Give the agent the draft plan + the checklist path. Have it find: missed invariants, mis-ordered/missing steps, assumptions that contradict the real code, forgotten edge cases, references to paths/functions that don't exist. The agent returns a finding list (severity + reason + file reference + suggested fix) → **fix every valid finding** in the draft.
- **Round 2:** Send a fresh agent (no knowledge of round 1) to re-review the fixed draft, confirming the old issues are gone and no new ones appeared → fix what remains.
- Every round, the agent must verify references against the real files, not trust the draft. Record both rounds' findings to embed in the HTML (audit changelog).

### 5. Emit the two-section HTML
Copy the skeleton from `reference/html-template.html`, fill it in, and write the file to `docs/plans/<Topic>.html`:

**Section A — "for the user to read" (human-read)**, plain language, teal/amber tokens per the template:
- Short summary: what, why, outcome.
- Structure / mapping / diagram — pick whichever communicates best (your judgment): a mapping table for flat lists; a **drawn diagram** whenever the plan involves a flow, architecture, or ≥3 moving parts across layers (renderer ↔ IPC ↔ DB, state machines, structural before/after).
  - Diagrams are **drawn in-file only**: linear flows use the template's `.flow` HTML helper; 2D layouts use inline `<svg class="sd">` with the provided classes + arrow marker (examples are commented inside the template's section 2). Colors come from the template's CSS vars — never hardcode hex inside the diagram.
  - **No Mermaid, no CDN scripts, no external images, no ascii-art** — they break the self-contained / opens-offline rule or look unfinished.
  - Every node label cites a real thing (path, table, IPC channel) that exists in the repo — audit rounds verify diagram labels like any other reference.
- **Before ↔ after side-by-side** (use `.ba-grid` in the template).
- Impact + pros / cons / cautions (the three colored callouts).
- UX/UI summary.
- Audit changelog from the two rounds (what was found, what was fixed).

**Section B — "for Claude to work from" (machine)** is the step-3 draft after it passed audit. Place it in the template's `.machine` block — real executable steps, ready to act on immediately.

### 6. Work from the file
Tell the user where the plan landed (use `SendUserFile` to attach the HTML so they can open it). Then — when implementing — **read Section B from that file as the source of truth** and follow the steps. If the plan changes mid-flight, update the file to match.

## Notes
- For tiny work (≤5 lines, no schema/IPC/invariant impact), don't use this skill — just do it directly. This skill is for work worth planning.
- The `<Topic>` filename uses English Title_Case to match the existing files in `docs/plans/`.
