---
name: project-studio-architecture
description: Syntropic.Studio AI-agent dashboard — cross-platform architecture decisions (memory-in-repo, stream-json engine, path-free agents, hostname auto-detect)
metadata:
  type: project
---

Syntropic.Studio (AI-agent dashboard, plan at `docs/plans/syntropic-studio.md`) — locked cross-platform decisions so the operator can switch between MacBook / PC (`ZEMA-PC`) / Mac mini freely, with everything following git.

**Memory location = Option A (in-repo).** Project & convention memory lives in `.claude/memory/` in the repo and is loaded into every session via `@.claude/memory/MEMORY.md` in CLAUDE.md — works in normal `claude` AND Studio, on every machine, because it rides on git-tracked CLAUDE.md. **Write project/convention memory to the repo dir, NOT the per-machine OS auto-memory dir** (`~/.claude/projects/.../memory/`). Only personal cross-project prefs ([[feedback-thai-language]], [[feedback-address-as-sister]]) stay in OS/global. Migrated 16 existing memories from OS → repo on 2026-06-01.

**Engine = headless stream-json, NOT node-pty.** Studio server spawns `claude -p --output-format stream-json --input-format stream-json --verbose` via `child_process.spawn` — structured events on stdout, input (permission replies) via stdin. No JSONL tailing (the OS transcript path is mangled per-machine), no pty/conpty. Cross-OS for free.

**Agents must be path-free.** Sub-agents run with the parent session's cwd, so agent prompts use relative paths and `npx tsc --noEmit` — never hardcode `/Users/anya/...` or `D:\...`, never `cd`. This is why hunter runs bare `npx tsc --noEmit`.

**Machine root = auto-detect, never prompt.** `server/machines.json` (git-tracked) maps `os.hostname()` → repo root. Resolve silently; only ask when an unknown hostname appears (new machine), then persist + push. `ZEMA-PC` = current PC.

**Why:** operator moves machines often and prompts from iPhone; the original plan hardcoded macOS paths and a node-pty + JSONL-watcher design that only worked on one machine.
