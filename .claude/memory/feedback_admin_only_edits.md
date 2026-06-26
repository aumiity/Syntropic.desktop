---
name: feedback_admin_only_edits
description: ตั้งแต่ 2026-06-26 การแก้ไข/ปรับ UI ทุกอย่างทำที่ admin role เท่านั้น — ห้ามแตะ staff
metadata:
  type: feedback
---

ตั้งแต่ **2026-06-26** เป็นต้นไป การแก้ไข ปรับเลย์เอาต์ และงานออกแบบ UI ทุกอย่าง ให้ทำที่ **admin role เท่านั้น** — **ห้ามเปลี่ยนแปลงอะไรที่ staff role เห็น** ให้คง experience ของ staff ไว้เหมือนเดิมทุกอย่าง

**Why:** เจ้าของบอกตรง ๆ หลังจากที่หนูเผลอยุบการ์ด metric 5 ใบบนสุดของหน้าประวัติการขายให้กลายเป็น "การ์ดสถานะ" แล้วมันไปกระทบ staff ด้วย (staff เสียการ์ด metric เดิมไป) — เจ้าของต้องการให้ staff เหมือนเดิม แล้วงานปรับโฉม/ทดลองดีไซน์ใหม่ทำเฉพาะ admin

**How to apply:**
- gate การเปลี่ยนแปลง UI ใหม่ด้วย `isAdmin` (จาก `usePermission()`) เสมอ — ของใหม่อยู่ใน branch `isAdmin` เท่านั้น
- ฝั่ง staff (`!isAdmin`) ให้ render เลย์เอาต์เดิม ไม่แตะ
- ตัวอย่างที่ทำไว้แล้ว: `src/pages/Manage/Sales.tsx` — admin = การ์ดสถานะแนวตั้งคู่ขว ากราฟ + ภาพรวมการเงิน; staff = การ์ด metric 5 ใบใน parent summary slot + popover ตัวกรองสถานะ (ของเดิม). effect เลือกด้วย `if (isAdmin) setSlotSummary(null) else push 5 cards`
- carve-out: การย้าย MultiDatePicker ขึ้นแถว TabStrip (ก่อนหน้า directive นี้) ทำทั้ง admin/staff ไปแล้วตามที่เจ้าของสั่ง — ไม่ต้องย้อน เว้นแต่เจ้าของบอก

ดู [[feedback_design_system_consistency]] · [[project_finance_manage_panel]]
