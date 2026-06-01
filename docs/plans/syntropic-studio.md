# Syntropic.Studio — AI Agent Dashboard

## Context

Syntropic.desktop เป็น pharmacy POS ที่มีหลายโดเมน (DB / IPC / business / UI / POS / table / theming) แต่ละโดเมนมี HARD invariants ใน `CLAUDE.md` + `docs/claude/*.md` 7 ไฟล์ Claude session ปัจจุบันเป็น flat conversation — user ต้องคุมเองว่า doc ไหนต้องอ่าน, invariant ไหนต้องเช็ค, ขั้นไหนข้ามได้ → ลืม/ขี้เกียจง่าย และพิมพ์จาก iPhone หลาย prompt ไม่สะดวก

แรงบันดาลใจจาก workflow "ลงทุน Diary" (sub-agent pipeline) — สร้าง **Syntropic.Studio**: ทีม 6 agent ธีม Ragnarok ที่ codify การทำงาน Plan→Code→Review→Test→Memo เป็น pipeline default + Assassin เป็น off-ramp สำหรับงานจิ๋ว เปิดผ่าน Tailscale ให้ใช้จาก iPhone

## Goals

1. ใช้ **Claude Code sub-agent ในตัว** (Task tool) — ไม่ใช่ multi-process
2. Pipeline เป็น default; Assassin = quick path; orchestrator ตัดสินใจเอง
3. Web dashboard Kanban-style → ดูจาก iPhone ผ่าน Tailscale ได้
4. ใช้ stack เบาที่สุด (Fastify + node-pty + Vite/React) ~600-1000 LoC ทั้งระบบ

## Cast (Ragnarok roster)

| Agent | Class | Role | Model |
|---|---|---|---|
| **wizard** | Wizard | Plan + read context | Opus |
| **blacksmith** | Blacksmith | Code | Opus |
| **priest** | Priest | Review | Opus |
| **hunter** | Hunter | Test/verify | Haiku |
| **kafra** | Kafra | Memo / Knowledge Base | Haiku |
| **assassin** | Assassin | Quick tweaks (off-pipeline) | Haiku |

## Architecture

```
Syntropic.desktop/             ← POS เดิม ไม่แตะโครงสร้าง
└── .claude/agents/            ← agent files อยู่ที่นี่ (claude หาเองจาก cwd)
    ├── wizard.md
    ├── blacksmith.md
    ├── priest.md
    ├── hunter.md
    ├── kafra.md
    └── assassin.md

Syntropic.studio/              ← repo ใหม่ แยกชัด
├── server/                    ← Fastify + node-pty + JSONL watcher
│   ├── index.ts
│   ├── pty.ts                 ← spawn claude (cwd=Syntropic.desktop)
│   ├── watcher.ts             ← tail ~/.claude/projects/-Users-anya.../*.jsonl
│   ├── ws.ts                  ← WebSocket → web
│   └── routes.ts              ← REST: quests CRUD
├── web/                       ← Vite + React + Tailwind
│   ├── pages/Dashboard.tsx
│   ├── pages/QuestDetail.tsx
│   └── components/{AgentCard,QuestCard,Lane}.tsx
└── package.json

Tailscale (มีแล้วทุก device):
  laptop → 0.0.0.0:3000 → iPhone Safari → http://anya-mac.tail-net.ts.net:3000
```

ตรง `~/.claude/projects/-Users-anya-Documents-GitHub-Syntropic-desktop/` คือที่ claude เขียน JSONL transcript ไว้ — watcher อ่านที่นี่ขับ UI state

---

## Phase 0 — Agent definitions (terminal usable ก่อน)

สร้าง 6 ไฟล์ใน `Syntropic.desktop/.claude/agents/` แต่ละไฟล์ frontmatter + system prompt

### `wizard.md`
```yaml
---
name: wizard
description: รับ request แล้วผลิต structured plan. อ่าน CLAUDE.md + docs/claude/* ที่เกี่ยว. ใช้ก่อน blacksmith เสมอยกเว้น trivial tweak
tools: Read, Grep, Glob, Bash
model: opus
---
```
Body: บังคับอ่าน CLAUDE.md ก่อนทุกครั้ง → ตัดสินโดเมน → เปิด docs/claude/<X>.md ที่ตรง (database/business-logic/ipc-api/pos/ui-theming/ui-components/ui-table-card) → ส่งคืน plan แบ่ง: Files to touch / Steps / Invariants to watch / Verification. ห้ามแก้ไฟล์เด็ดขาด

### `blacksmith.md`
```yaml
---
name: blacksmith
description: implement ตาม plan ของ wizard. ใช้หลัง wizard เสร็จเท่านั้น
tools: Read, Edit, Write, Bash, Grep, Glob
model: opus
---
```
Body: ทำตาม plan เป๊ะ + re-read database.md ทุกครั้งที่แก้ schema/IPC + ดู Theme showcase ก่อนเพิ่ม UI + ห้าม Tailwind palette literals (semantic tokens เท่านั้น) + ห้าม spread `...form` ใน UPDATE + comment น้อย. หลังเสร็จ: รัน `tsc --noEmit`, รายงาน files changed

### `priest.md`
```yaml
---
name: priest
description: ตรวจ diff ที่ blacksmith เพิ่งเขียน — หา bug, missed invariant, anti-pattern. ใช้หลัง blacksmith
tools: Read, Bash, Grep
model: opus
---
```
Body: checklist บังคับ — (1) HARD invariants ใน CLAUDE.md ทุกข้อที่เกี่ยว, (2) allow-list ใน UPDATE, (3) semantic tokens, (4) ELEVATED variant สำหรับ form, (5) Modal structure ครบ, (6) ไม่มี local UI helper ใน pages/, (7) ไม่มี emoji ใน UI strings. ส่งคืน: ✅ ผ่าน หรือ ⚠️ ต้องแก้ (specific lines). ห้ามแก้โค้ดเอง

### `hunter.md`
```yaml
---
name: hunter
description: verify ว่าการแก้ใช้งานได้จริง — tsc, build, suggest browser verify ถ้าจำเป็น. ใช้หลัง priest ผ่าน
tools: Bash, Read
model: haiku
---
```
Body: รัน `cd /Users/anya/Documents/GitHub/Syntropic.desktop && tsc --noEmit` → ถ้าเป็น UI สำคัญ → แนะนำใช้ skill `/verify` หรือ `/run`. รายงาน pass/fail + log สั้น

### `kafra.md`
```yaml
---
name: kafra
description: สกัด insight ที่ควรจดจำเข้า Knowledge Base — ใช้เป็นขั้นสุดท้ายของ pipeline. ห้ามใช้กับงานจิ๋วผ่าน assassin
tools: Read, Write, Edit
model: haiku
---
```
Body: เกณฑ์เก็บ — invariant ใหม่, pattern ใช้ซ้ำได้, pitfall ที่จะเจอซ้ำ, decision rationale ที่โค้ดไม่บอก. ไม่เก็บ — รายละเอียดงานครั้งเดียว, สิ่งที่ git log มี. เขียนเข้า `~/.claude/projects/-Users-anya-Documents-GitHub-Syntropic-desktop/memory/` ตาม convention auto memory (frontmatter + body + MEMORY.md index)

### `assassin.md`
```yaml
---
name: assassin
description: tweak < 5 บรรทัด ที่ไม่แตะ schema/IPC/invariants — สี/padding/typo/import/rename. ใช้แทน pipeline เต็มสำหรับ trivial work
tools: Read, Edit, Bash
model: haiku
---
```
Body: scope — color/padding/text/import/format/rename local. ห้ามแตะ schema/IPC/business logic/HARD invariants. ถ้าเจอ scope ใหญ่กว่า → ส่งกลับขึ้น Wizard

### Orchestrator rule (append CLAUDE.md)

เพิ่ม section ใหม่ใน `Syntropic.desktop/CLAUDE.md`:

```markdown
## Studio dispatch

When user submits a quest, dispatch by complexity:

1. **Trivial** (≤5 lines, no schema/IPC/invariant impact, e.g., "change color X to Y", "fix typo")
   → `Task(assassin)` only

2. **Normal feature/fix** (default)
   → `Task(wizard)` → `Task(blacksmith)` → `Task(priest)` → `Task(hunter)` → `Task(kafra)`

3. **Parallel work** (disjoint files, independent changes)
   → multiple `Task(blacksmith, run_in_background=true)` then sequential priest/hunter/kafra

Briefing each sub-agent: exact file paths + the specific docs/claude/*.md to load + expected output shape
```

### Phase 0 verification (terminal-only)

```bash
cd /Users/anya/Documents/GitHub/Syntropic.desktop
claude
# ทดลอง 3 cases:
> ช่วยเปลี่ยนสี border ของ filter strip ทุกหน้าให้เป็น muted-darker
# expect: dispatch ไป assassin ตัวเดียว

> เพิ่ม toast "บันทึกใบเสนอราคาแล้ว" ตอน save quotation สำเร็จ
# expect: pipeline เต็ม wizard→blacksmith→priest→hunter→kafra

> refactor products schema เพิ่ม column min_stock + ปรับ UPDATE allow-list
# expect: pipeline เต็ม + อาจ spawn parallel ถ้า main คิดว่าแยกไฟล์ขนานได้
```

ถ้า Phase 0 ผ่าน 3 case นี้ + แต่ละ agent ทำงานตามบทบาทไม่ออกนอกขอบเขต → **Phase 0 closed**

---

## Phase 1 — Web dashboard

### Server (`Syntropic.studio/server/`)

**Stack:** Fastify (HTTP) + ws (WebSocket) + node-pty (spawn claude pty) + better-sqlite3 (quest persistence)

**`pty.ts`** — wrapper รอบ node-pty:
- `spawnSession(prompt)`: spawn `claude` ด้วย `cwd: /Users/anya/Documents/GitHub/Syntropic.desktop`, ขนาด 120×30
- `writeToSession(id, text)`: ส่ง stdin
- `getSessionOutput(id)`: stream stdout buffer
- เก็บ map ของ active sessions in-memory + session-id ผูกกับ JSONL path

**`watcher.ts`** — tail JSONL ของ session:
- watch `~/.claude/projects/-Users-anya-Documents-GitHub-Syntropic-desktop/*.jsonl`
- parse แต่ละบรรทัด → emit event types:
  - `agent_dispatch` (Task tool spawn) — รู้ชื่อ subagent_type → ใส่ใน lane นั้น
  - `agent_return` (Task complete) — move card ออกจาก lane
  - `tool_use` (Edit/Write/Bash) — update card status
  - `text_block` (assistant message) — append to transcript
  - `permission_request` — surface ใน UI
- State machine ต่อ session: `pending → dispatched(<agent>) → ... → done`

**`routes.ts`** — REST:
- `GET /api/quests` — list (จาก SQLite)
- `POST /api/quests` — สร้าง quest + spawn pty + return sessionId
- `GET /api/quests/:id` — quest detail
- `POST /api/quests/:id/cancel` — kill pty
- `POST /api/quests/:id/input` — ส่ง stdin (ตอบ permission, ตอบคำถาม)

**`ws.ts`** — WebSocket broadcast ของ watcher events ให้ client ที่ subscribe

**SQLite schema** (สร้าง 1 table):
```sql
CREATE TABLE quests (
  id INTEGER PRIMARY KEY,
  prompt TEXT,
  session_id TEXT,
  status TEXT,           -- pending|active|done|failed|cancelled
  current_agent TEXT,    -- wizard|blacksmith|priest|hunter|kafra|assassin|null
  created_at INTEGER,
  finished_at INTEGER
);
```

### Web (`Syntropic.studio/web/`)

**Stack:** Vite + React 18 + Tailwind v3 + Zustand (state) — mirror Syntropic.desktop conventions

**Layout:**
```
┌─ Header ────────────────────────────────────────────────┐
│ Syntropic.Studio   [+ New Quest]   [Settings]           │
└─────────────────────────────────────────────────────────┘
┌─ Quest Board ─┐ ┌─ Pipeline lanes ──────────────────────┐
│ Open quests   │ │ Plan  Code  Review  Test  Memo Quick  │
│ (sidebar)     │ │  ◯     ◯     ◯      ◯     ◯    ◯    │
│ • bug fix #1  │ │ Wiz  BS   Pri   Hun  Kaf  Sin       │
│ • feature #2  │ │                                       │
│ • cleanup #3  │ │  [card: bug fix #1]                   │
│               │ │   ↓ ⌨️ Blacksmith typing...           │
│               │ │                                       │
└───────────────┘ └───────────────────────────────────────┘
```

**Components:**
- `Lane.tsx` — 1 lane ของ pipeline (header + agent avatar + active cards)
- `AgentCard.tsx` — avatar + ชื่อ + class + status badge + HP bar (= context % remaining)
- `QuestCard.tsx` — title + current agent + elapsed time + click → detail
- `QuestDetail.tsx` — transcript viewer + reply input + cancel button + permission approve/deny

**Styling:** copy `src/components/ui/{button,badge,card,dialog,input}.tsx` + `tailwind.config.js` + `index.css` semantic tokens จาก Syntropic.desktop. ใช้ ELEVATED variant สำหรับ inputs ตามกติกาเดิม

**Mobile responsive:**
- Desktop: lanes horizontal, sidebar visible
- Tablet: lanes horizontal, sidebar collapse → bottom sheet
- Mobile: lanes vertical stack (Plan → Code → Review ...), quest board เป็น tab แรก

### Tailscale binding

`server/index.ts` listen `host: '0.0.0.0', port: 3000` → reachable ทันทีบน Tailscale net. ไม่ต้อง config เพิ่ม (Tailscale already up)

URL pattern: `http://<machine-tailscale-name>:3000` — bookmark บน iPhone Safari

### Phase 1 verification

1. `cd Syntropic.studio && npm run dev` — server :3000, vite :5173 (proxy ผ่าน Fastify)
2. เปิด `http://localhost:3000` บน laptop → เห็น dashboard ว่าง
3. กด `+ New Quest` → พิมพ์ "เปลี่ยนสี border filter strip"
   - เห็น card สร้างใน Quest Board
   - card เด้งไปอยู่ใต้ Quick lane (Assassin)
   - card status update real-time
   - card move เป็น "done" เมื่อ assassin เสร็จ
4. ทดลอง quest "เพิ่ม toast บันทึกใบเสนอราคา"
   - card เคลื่อนผ่าน 5 lanes ตามลำดับ
5. เปิด URL เดียวกันบน iPhone Safari ผ่าน Tailscale → state sync แบบ live ผ่าน WebSocket
6. กดที่ card บน iPhone → เห็น transcript scroll สด ๆ
7. ทดลอง permission prompt — quest ที่ต้อง confirm → ดูว่าปุ่ม approve/deny โผล่ใน UI

### Acceptance criteria

- [ ] 6 agent files ใน `Syntropic.desktop/.claude/agents/` + orchestrator section ใน CLAUDE.md
- [ ] Phase 0 verification 3 cases ผ่าน
- [ ] Server start ไม่มี error, watcher อ่าน JSONL ได้
- [ ] Dashboard เปิดจาก iPhone Safari ผ่าน Tailscale ได้
- [ ] Card position สะท้อน agent ปัจจุบันแบบ live
- [ ] Permission prompt approve/deny ทำงานจากเวบได้

---

## What we're NOT doing (Phase 0+1)

- ไม่มี git worktree per agent (pipeline sequential อยู่แล้ว)
- ไม่มี pixel art / canvas (card CSS ล้วน)
- ไม่มี XP/level/quest RPG mechanics
- ไม่มี auto-route classifier (orchestrator = main session คิดเอง)
- ไม่มี push notification (Phase 2)
- ไม่มี Knowledge Base UI dedicated (ดูจาก memory file ตรงๆ ก่อน)
- ไม่มี session resume หลังปิด laptop (Phase 2)

## Open questions (เก็บไว้แก้ทีหลัง)

- `node-pty` + claude CLI บน macOS — ทดสอบช่วงต้น Phase 1 เผื่อ ANSI escape / TTY คุยกันแปลกๆ
- Permission prompt บน mobile — ถ้า UX ยากเกินไป Phase 1 เริ่มเป็น read-only บน mobile, approve จาก laptop เท่านั้น
- Multi-user / multi-machine — เก็บไว้ก่อน, single-user single-machine pattern เพียงพอ
