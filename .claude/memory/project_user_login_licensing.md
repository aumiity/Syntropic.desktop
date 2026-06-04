---
name: project_user_login_licensing
description: User/Login + License/Activation initiative — 3-tier identity model, PIN-6 login, signed-token offline licensing; plans written, nothing built yet
metadata:
  type: project
---

**เริ่ม 2026-06-04 — plan เขียนแล้ว, ยังไม่ลงมือโค้ด.** งานเปิดระบบผู้ใช้/เข้าสู่ระบบ + การขาย/ป้องกันโปรแกรม

**โมเดล identity 3 ชั้น (เคลียร์ความสับสน "มีสอง user แยกยังไง"):**
- ชั้น A — **License/สิทธิ์ใช้โปรแกรม** (ผู้ขายคุม) = "ขายโปรแกรม"
- ชั้น B — **Setup ร้าน** (มีแล้ว, `SetupGate`)
- ชั้น C — **Login พนักงาน** (เจ้าของร้านคุม) = ตาราง `users` เดิม + People→StaffTab
- gate order: `License → Setup → Login → แอป` — แต่ละชั้นคนละ wrapper คนละไฟล์ อย่าปน
- **ไม่มี "สองตาราง user"** — พนักงาน = บัญชี login ตัวเดียวกัน แยกบทบาทด้วย `role` (admin/staff)

**Login (ชั้น C) — locked decisions:** **เลือกชื่อจากรายการ → ใส่ password** (เปลี่ยนจาก PIN เป็น password ยืนยัน 2026-06-04 — ตรงคอลัมน์ `users.password`+`email` เดิม, แข็งแรงกว่า, แก้ bootstrap วันแรก, **ตัด PinPad ทิ้ง** ใช้ `Input type=password`). email = identifier ไม่ต้องพิมพ์. คนเดียวข้ามหน้าเลือก, manager-override dialog (admin ใส่ password รับรองงาน sensitive **ผ่าน IPC ที่ยืนยัน ไม่ใช่แค่ปลดล็อกปุ่ม**), ล็อกหน้าจอไม่ล้าง cart. UI mirror `SetupWizard`, ไม่ต้องเพิ่ม primitive ใหม่. password ตอนนี้ **plaintext** → hash ด้วย `crypto.scryptSync` params **N=16384,r=8,p=1,salt16,key32**, เก็บ `scrypt$N$r$p$salt$hash`, legacy plaintext fallback→upgrade. `auth:getCurrentUser` hardcode ต้องแทนด้วย login จริง.

**Decision สุดท้าย (2026-06-04, ครบ):** bootstrap = เจ้าของตั้ง password เองใน **Setup wizard**, user นั้น role `admin` เสมอ (เขียนทับ seed `admin@syntropic.local`). **ไม่มี auto-lock**. **ไม่ persist session — login ใหม่ทุกครั้งเปิดโปรแกรม** (ตัดปัญหา stale session). lockout 5 ครั้ง. seed `Staff Test` (รหัส `staff` รู้กันทั้งโลก) ต้องเอาออก/บังคับตั้งรหัส. **กู้ password = layered:** ชั้น1 recovery code (สร้างตอน setup, โชว์ครั้งเดียว, เก็บ hash, ลิงก์ "ลืมรหัส" → ใส่ code → ตั้งใหม่ + ออก code ใหม่); ชั้น2 vendor reset (โชว์ machine code ให้ผู้ขาย → ผู้ขายเซ็น reset token ด้วย **private key เดียวกับ License** ผูก fingerprint+หมดอายุไว → ตั้ง password ใหม่). reset แตะแค่ admin password ห้ามแตะข้อมูล.

**Audit fixes ที่ต้องทำ (2026-06-04, ซึมซับเข้า plan แล้ว):** B1 bootstrap=ตั้ง password admin ใน **Setup wizard (Phase 0)** ก่อน LoginGate. B2 boot ต้อง **re-verify session กับ DB** (เผื่อ user ถูก disable), LoginGate render ก่อน route ที่เรียก `getCurrentUserId()` (มัน throw ถ้า null). G3 **lockout นับฝั่ง main process อยู่รอด restart**. R1 **renderer role = UX เท่านั้น; งาน sensitive verify role ใน IPC** (Finance/void/settings/staff). R4 `people.saveStaff` ต้อง **allow-list คอลัมน์ UPDATE** + hash ก่อนเก็บ. ลบปุ่ม DEV สลับ role `Finance.tsx:117-123`. N5 ยืนยัน Electron31=Node20 มี scrypt+Ed25519 ครบ.

**License (ชั้น A):** signed **Ed25519 token** (Node crypto built-in, ห้าม npm install), ผูกเครื่อง — เก็บ **3 fingerprint hash แยก (guid/disk/host) จับคู่ ≥2-of-3** (audit G4, เดิมเก็บก้อนเดียวขัดกันเอง). ตรวจลายเซ็นในเครื่อง = **ขายออฟไลน์ 100%**, online เป็น background. expired/invalid = ล็อกทางเข้าแต่**ห้ามลบข้อมูล**. เริ่ม infra ศูนย์บาท (ผู้ขายเซ็นไฟล์เอง) → ค่อยอัปเป็น server/subscription. Private key ห้ามเข้า repo/แอป. เริ่ม **ขายขาด** (`expires_at:null`). **ขีดจำกัดที่ยอมรับ (audit B3/R3):** กันเวลาถอยหลัง/แกะ public key ใน .asar ไม่ได้สมบูรณ์ — offline DRM กันก๊อป casual + อาศัย trust/บริการ ไม่ใช่ของแกะไม่ได้; subscription จริงต้อง server re-check.

**เอกสาร:** `docs/plans/User_Login_System.md` (v2), `docs/plans/Login_UI_Design.md` (v2), `docs/plans/License_Activation_System.md` — ทั้งหมดผ่าน audit รอบ 2026-06-04 แล้ว. Open Questions ที่เหลือ (auto-lock, persist session, bootstrap วิธีไหน) รอยืนยันก่อน craft. ใช้ [[input-elevated-default-flip]] + dialog/button convention ตอนทำ UI.
