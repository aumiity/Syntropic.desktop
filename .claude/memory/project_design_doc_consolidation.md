---
name: project_design_doc_consolidation
description: Where design docs live after the 2026-06-05 consolidation — docs/claude is the prose SSOT, DESIGN.md is a thin pointer
metadata:
  type: project
---

**DONE 2026-06-05** — ยุบรวมเอกสาร design ให้เลิกซ้ำซ้อน หลังพบว่ากฎ UI ถูกเขียนซ้ำ 3 ที่ (CLAUDE.md / docs/claude / DESIGN.md) แล้วดริฟต์กัน

**โครงสร้างที่ตกลง (each fact has one home):**
- **Tokens/variants** = `src/index.css` + `tailwind.config.js` + `/theme` (`src/pages/Theme/index.tsx`) — executable, source of truth, ดริฟต์ไม่ได้
- **Session headlines** = `CLAUDE.md` → "UI & theming" invariants (โหลดทุก session, headline + pointer)
- **Deep prose (why/failure-mode) = `docs/claude/ui-*.md` = PROSE SSOT** — ui-theming.md / ui-components.md / ui-table-card.md / pos.md

**DESIGN.md (root) = thin pointer เท่านั้น** — เคยเป็นสำเนาเต็มของ CLAUDE.md + docs/claude (สารภาพเองในไฟล์ว่า "copied from..."). ตอนนี้เหลือแค่: orientation ("House Invariant wins over generic skill rules"), Theme/Mood 1 ย่อหน้า, pointer-map ตารางชี้ไป owner, และส่วน **"Where your skill's generic rules need adjustment for THIS repo"** (cards ไม่ใช่ของขี้เกียจที่นี่ / ห้าม OKLCH / motion = framer-motion+tailwindcss-animate เท่านั้น) — ส่วนนี้ unique ของ DESIGN.md เพราะเป็น bridge สำหรับ skill [[impeccable]] ที่อ่าน DESIGN.md ผ่าน `context.mjs` (claude ปกติไม่อ่าน DESIGN.md; impeccable ไม่อ่าน CLAUDE.md/docs/claude อัตโนมัติ — นั่นคือต้นตอความซ้ำ)

**ห้ามทำ:** อย่าก๊อปกฎ (House Invariants, palette, dialog roles ฯลฯ) กลับเข้า DESIGN.md อีก — เพิ่ม/แก้กฎที่ `docs/claude/ui-*.md` แล้วให้ DESIGN.md ชี้ไป. typography เต็ม (font stack/print=Sarabun/unicode-range) ย้ายเข้า ui-components.md แล้ว
