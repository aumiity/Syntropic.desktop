---
name: project_login_mockup
description: Login screen mockup shipped at src/pages/Auth/LoginScreen.tsx — preview mode, not yet wired to auth IPC
metadata:
  type: project
---

**2026-06-05 — สร้าง `src/pages/Auth/LoginScreen.tsx` เป็น mockup เพื่อปรับ UI โดยไม่ต้องลงโปรแกรมใหม่**

**สถานะ:** component สร้างแล้ว แต่ยัง **ไม่ wire IPC จริง** — รอ Phase 2 (`window.api.auth.*`).

**prop `preview`:**
- `preview=true` (DEV mode): ใช้ `PREVIEW_USERS` array (ข้อมูลตัวอย่าง) + รหัสตายตัว `"1234"` — ไม่เรียก auth IPC
- `preview=false` (production): flow จริง — ยังไม่ implement, login ไม่ได้จนกว่า Phase 2

**ปุ่ม DEV ที่ผูกไว้:** "ดูตัวอย่าง Login (DEV)" ใน `src/pages/Settings/ShopTab.tsx` (pattern เดียวกับปุ่ม "ดูตัวอย่าง Setup (DEV)") — overlay เต็มจอ, **DEV ONLY ต้องลบก่อน production build** (อยู่ใน checklist CLAUDE.md แล้ว).

**Animation:** shake (รหัสผิด) + slide/fade transitions; keyframe `shake` เพิ่มใน `tailwind.config.js`; reset ด้วย `setTimeout` ไม่ใช่ `onAnimationEnd` — ดู [[feedback_animation_reduced_motion]] สำหรับเหตุผล.

**ไฟล์ที่เกี่ยวข้อง:**
- `src/pages/Auth/LoginScreen.tsx` — component หลัก
- `src/pages/Settings/ShopTab.tsx` — ปุ่ม DEV + overlay (ต้องลบก่อน build)
- `tailwind.config.js` — keyframe `shake` ที่เพิ่มเข้าไป
