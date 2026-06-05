---
name: project_user_login_licensing
description: User/Login + License/Activation initiative — 3-tier identity model, select-name+password login, signed-token offline licensing; plan v3 audited, Login mockup shipped
metadata:
  type: project
---

**อัปเดตล่าสุด 2026-06-05 — plan v3 ผ่าน audit 2 รอบ; Login mockup (`LoginScreen.tsx`) สร้างแล้ว, ยังไม่ wire IPC จริง.** งานเปิดระบบผู้ใช้/เข้าสู่ระบบ + การขาย/ป้องกันโปรแกรม

**โมเดล identity 3 ชั้น (เคลียร์ความสับสน "มีสอง user แยกยังไง"):**
- ชั้น A — **License/สิทธิ์ใช้โปรแกรม** (ผู้ขายคุม) = "ขายโปรแกรม"
- ชั้น B — **Setup ร้าน** (มีแล้ว, `SetupGate`)
- ชั้น C — **Login พนักงาน** (เจ้าของร้านคุม) = ตาราง `users` เดิม + People→StaffTab
- gate order: `License → Setup → Login → แอป` — แต่ละชั้นคนละ wrapper คนละไฟล์ อย่าปน
- **ไม่มี "สองตาราง user"** — พนักงาน = บัญชี login ตัวเดียวกัน แยกบทบาทด้วย `role` (admin/staff)

**Login (ชั้น C) — locked decisions:** **เลือกชื่อจากรายการ → ใส่ password** (เปลี่ยนจาก PIN เป็น password ยืนยัน 2026-06-04 — ตรงคอลัมน์ `users.password`+`email` เดิม, แข็งแรงกว่า, แก้ bootstrap วันแรก, **ตัด PinPad ทิ้ง** ใช้ `Input type=password`). email = identifier ไม่ต้องพิมพ์. คนเดียวข้ามหน้าเลือก, manager-override dialog (admin ใส่ password รับรองงาน sensitive **ผ่าน IPC ที่ยืนยัน ไม่ใช่แค่ปลดล็อกปุ่ม**), ล็อกหน้าจอไม่ล้าง cart. UI mirror `SetupWizard`, ไม่ต้องเพิ่ม primitive ใหม่. password ตอนนี้ **plaintext** → hash ด้วย `crypto.scryptSync` params **N=16384,r=8,p=1,salt16,key32**, เก็บ `scrypt$N$r$p$salt$hash`, legacy plaintext fallback→upgrade. `auth:getCurrentUser` hardcode ต้องแทนด้วย login จริง.

**Decision สุดท้าย (2026-06-04, ครบ):** bootstrap = เจ้าของตั้ง password เองใน **Setup wizard**, user นั้น role `admin` เสมอ (เขียนทับ seed `admin@syntropic.local`). **ไม่มี auto-lock**. **ไม่ persist session — login ใหม่ทุกครั้งเปิดโปรแกรม** (ตัดปัญหา stale session). lockout 5 ครั้ง **หน่วงเวลา (ไม่ล็อกถาวร)**. seed `Staff Test` (รหัส `staff` รู้กันทั้งโลก) ต้องเอาออก/บังคับตั้งรหัส. **กู้ password = layered:** ชั้น1 recovery code (สร้างตอน setup, โชว์ครั้งเดียว, เก็บ hash, ลิงก์ "ลืมรหัส" → ใส่ code → ตั้งใหม่ + ออก code ใหม่); ชั้น2 vendor reset (โชว์ machine code ให้ผู้ขาย → ผู้ขายเซ็น reset token ด้วย **private key เดียวกับ License** ผูก fingerprint+หมดอายุไว → ตั้ง password ใหม่). reset แตะแค่ admin password ห้ามแตะข้อมูล.

**มติเพิ่มเติม 2026-06-05 (ล็อกแล้ว — ซึมซับเข้า plan v3):**
- **`must_change_password`: ถอดออกจาก slice แรก** — ไม่เพิ่มงาน (test data ลงใหม่ได้), ค่อยเพิ่ม Phase หลัง
- **role `pharmacist`: เอาออกจาก codebase** — เหลือ admin/staff เท่านั้น; มีค้างอยู่ที่ `src/pages/People/index.tsx:648` ต้องเคลียร์ตอน implement
- **BL-1 (สำคัญ): role enforcement ทั้งหมด (saveStaff/void/finance/settings) เลื่อนไป Phase 3** — IPC ปัจจุบัน**ไม่มี caller identity** (handler รับแค่ `(_e,data)`, session อยู่ฝั่ง renderer ล้วน) → verify role ใน main ทำไม่ได้จนกว่าจะทำ **main-side session** (เก็บ current id+role ตอน `auth:login` ผูก webContents) เป็น prerequisite; ช่วง test ยอมรับว่า staff escalate เป็น admin ผ่านหน้า People ได้
- **B-2: ไม่ทำ upgrade path สำหรับ existing install** — พึ่ง fresh install → SetupWizard Phase 0 ตั้ง password; `schema.ts:783` backfill `setup_completed` มีเงื่อนไข `EXISTS(SELECT 1 FROM sales)` → fresh DB ไม่ backfill → wizard เด้งถูกต้อง
- **`listLoginUsers` ไม่คืน email** (UX privacy)
- **vertical slice แรก = Phase 0+1+2 (Steps 1–11)**; Phase 2.5 recovery + Phase 3 permissions = หนี้ถัดไป

**Audit fixes ที่ต้องทำ (2026-06-04, ซึมซับเข้า plan แล้ว):** B1 bootstrap=ตั้ง password admin ใน **Setup wizard (Phase 0)** ก่อน LoginGate. B2 boot ต้อง **re-verify session กับ DB** (เผื่อ user ถูก disable), LoginGate render ก่อน route ที่เรียก `getCurrentUserId()` (มัน throw ถ้า null). G3 **lockout นับฝั่ง main process อยู่รอด restart**. R1 **renderer role = UX เท่านั้น; งาน sensitive verify role ใน IPC** (Finance/void/settings/staff) — ต้องรอ Phase 3. R4 `people.saveStaff` ต้อง **allow-list คอลัมน์ UPDATE** + hash ก่อนเก็บ. ลบปุ่ม DEV สลับ role `Finance.tsx:117-123`. N5 ยืนยัน Electron31=Node20 มี scrypt+Ed25519 ครบ.

**License (ชั้น A):** signed **Ed25519 token** (Node crypto built-in, ห้าม npm install), ผูกเครื่อง — เก็บ **3 fingerprint hash แยก (guid/disk/host) จับคู่ ≥2-of-3** (audit G4, เดิมเก็บก้อนเดียวขัดกันเอง). ตรวจลายเซ็นในเครื่อง = **ขายออฟไลน์ 100%**, online เป็น background. expired/invalid = ล็อกทางเข้าแต่**ห้ามลบข้อมูล**. เริ่ม infra ศูนย์บาท (ผู้ขายเซ็นไฟล์เอง) → ค่อยอัปเป็น server/subscription. Private key ห้ามเข้า repo/แอป. เริ่ม **ขายขาด** (`expires_at:null`). **ขีดจำกัดที่ยอมรับ (audit B3/R3):** กันเวลาถอยหลัง/แกะ public key ใน .asar ไม่ได้สมบูรณ์ — offline DRM กันก๊อป casual + อาศัย trust/บริการ ไม่ใช่ของแกะไม่ได้; subscription จริงต้อง server re-check.

**เอกสาร:** `docs/plans/User_Login_System.md` (**v3** — §0.5 drift corrections + §0.6 audit resolutions + §6.5 vertical slice เพิ่มเข้าแล้ว), `docs/plans/Login_UI_Design.md`, `docs/plans/License_Activation_System.md`. ใช้ [[input-elevated-default-flip]] + dialog/button convention ตอนทำ UI. Login mockup อยู่ที่ `src/pages/Auth/LoginScreen.tsx` — ดู [[project_login_mockup]].
