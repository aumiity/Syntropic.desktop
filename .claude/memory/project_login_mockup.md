---
name: project_login_mockup
description: LoginScreen.tsx — เริ่มเป็น mockup, wire IPC จริงแล้วใน slice แรก (2026-06-05); preview mode ยังคงอยู่เป็น DEV helper
metadata:
  type: project
---

**อัปเดตล่าสุด 2026-06-05 — `src/pages/Auth/LoginScreen.tsx` wire IPC จริงแล้ว; ไม่ใช่ mockup อีกต่อไป**

**สถานะ:** component ใช้งานได้ production; `window.api.auth.listLoginUsers` + `window.api.auth.login` ถูก call จริง; map error code `LOCKED` → ข้อความไทย. prop `preview` ยังคงอยู่เป็น DEV helper เท่านั้น — ไม่ใช่ production path.

**prop `preview` (DEV only):**
- `preview=true`: ใช้ `PREVIEW_USERS` array + รหัสตายตัว `"1234"` — ไม่เรียก IPC; ใช้ปรับ UI โดยไม่ต้องมี DB
- `preview=false` (default/production): เรียก IPC จริง — **ใช้งานได้แล้ว**

**ปุ่ม DEV ที่ผูกไว้:** "ดูตัวอย่าง Login (DEV)" ใน `src/pages/Settings/ShopTab.tsx` — overlay เต็มจอ; **DEV ONLY ต้องลบก่อน production build** (อยู่ใน checklist CLAUDE.md แล้ว; สิ่งที่ต้องลบ 3 จุด: ปุ่ม + overlay block + LoginScreen import).

**Animation:** shake (รหัสผิด) + slide/fade transitions; keyframe `shake` เพิ่มใน `tailwind.config.js`; reset ด้วย `setTimeout` ไม่ใช่ `onAnimationEnd` — ดู [[feedback_animation_reduced_motion]] สำหรับเหตุผล.

**ไฟล์ที่เกี่ยวข้อง:**
- `src/pages/Auth/LoginScreen.tsx` — component หลัก (production-ready)
- `src/pages/Settings/ShopTab.tsx` — ปุ่ม DEV + overlay (ต้องลบก่อน build)
- `tailwind.config.js` — keyframe `shake`
