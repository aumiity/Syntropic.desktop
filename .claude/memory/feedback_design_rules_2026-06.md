---
name: feedback_design_rules_2026-06
description: Design-rule corrections 2026-06-05 — variant renames (no tertiary/brand-soft), tabular-nums banned, animation allowed-but-announce, new palette allowed if justified
metadata:
  type: feedback
---

ผู้ใช้แก้ความเข้าใจเรื่อง design rules (2026-06-05) — อัปเดตแล้วใน CLAUDE.md, docs/claude/ui-*.md, DESIGN.md, docs/design-overview.th.html

1. **`tertiary` ไม่มีแล้ว → `accent`** (สีเหลือง #F5C24A) — ทั้ง Button/Badge variant และไม่มี token `--tertiary`/`bg-tertiary` ใน CSS แล้ว (Tabs segmented active เปลี่ยนเป็น `bg-primary` ด้วย). **`brand-soft` ไม่มีแล้ว → `primary-soft`** (teal อ่อน). ออร์ดินัลเก่า quaternary/quinary/senary → primary-soft/info-soft/warm. variant จริงดูจาก `button.tsx`/`badge.tsx` — มีตระกูล `*-outline` ครบทุกสี + `neutral`/`muted-outline` + `elevated`/`elevated-destructive`/`elevated-warning` (button-only).

2. **ห้ามใช้ `tabular-nums`** (มติโปรเจกต์) — **ลบออกจาก codebase หมดแล้ว 2026-06-05** (7 จุดใน AdjustStockDialog/LowStock/Dashboard; card.tsx ไม่เคยมีจริง). อย่าใส่กลับ.

3. **Animation ไม่ห้าม** — ใส่ได้ถ้าทำให้สวย/เหมาะ, เพิ่ม motion library ใหม่ก็ได้ (gsap/lenis ฯลฯ) **แต่ต้องบอกแผน + ได้ OK ก่อนลงมือจริง**. (ยังคง `--ignore-scripts` ตอน install, ทำ reduced-motion fallback). เลิกใช้ถ้อยคำ "motion = feedback ไม่ใช่โชว์ / ห้ามเพิ่มไลบรารี".

4. **เสนอจานสีใหม่ได้** ถ้าจำเป็นจริงและสวย/เหมาะกว่า — เสนอผู้ใช้ก่อนแล้วได้ตกลงค่อยทำ (ไม่ใช่ "อย่าเด็ดขาด"). ยังอ้าง token เสมอ ห้าม hardcode สีดิบ Tailwind.

**Why:** docs ดริฟต์จาก code จริง (โดยเฉพาะ [[project_design_doc_consolidation]] ที่เพิ่งทำ ยังก๊อปชื่อ variant เก่ามา). **How to apply:** เวลาพูดถึง variant ให้เช็ค button.tsx/badge.tsx ก่อน อย่าเชื่อชื่อเก่าจากความจำ.
