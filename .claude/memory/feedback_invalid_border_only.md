---
name: feedback_invalid_border_only
description: สถานะ invalid/error ของ input ใช้กรอบแดง (border) อย่างเดียว — ห้ามมี ring ซ้อน
metadata:
  type: feedback
---

**2026-06-16** — สถานะ invalid ของ field ใช้ **กรอบแดง (`border-destructive`) อย่างเดียว ห้ามใส่ `ring` ซ้อน**. `input.tsx` เดิมมี `aria-invalid:ring-[2px] aria-invalid:ring-destructive/40` ต่อท้าย border → เอาออก เหลือแค่ `aria-invalid:border-destructive`.

**Why:** ผู้ใช้ไม่ชอบ ring ซ้อน border ดูหนา/รก (บอกซ้ำหลายครั้ง — "เคยบอกละ").

**How to apply:** เวลาทำ error/invalid state ของ input/control ใด ๆ ใช้ border เปลี่ยนสีพอ ไม่ต้องเพิ่ม ring/glow. (โน้ต: `aria-invalid` ต้อง register ใน `tailwind.config.js` → `theme.extend.aria.invalid` ไม่งั้นคลาสไม่ถูก generate — ดู [[date-input-validation-contract]]).
