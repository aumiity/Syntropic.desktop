---
name: project_user_login_licensing
description: User/Login + License/Activation initiative — 3-tier identity model, select-name+password login, signed-token offline licensing; Phase 0–3 + Phase 2.5 recovery DONE 2026-06-05
metadata:
  type: project
---

**อัปเดตล่าสุด 2026-06-05 — Phase 3 (main-side session + IPC role enforcement + manager-override) + Phase 2.5 (recovery-code self-service) DONE; ผ่าน priest + hunter + tsc PASS; + Real-Electron e2e 24/24 PASS (`tests/e2e/login-security.mjs`).**

**โมเดล identity 3 ชั้น (เคลียร์ความสับสน "มีสอง user แยกยังไง"):**
- ชั้น A — **License/สิทธิ์ใช้โปรแกรม** (ผู้ขายคุม) = "ขายโปรแกรม"
- ชั้น B — **Setup ร้าน** (มีแล้ว, `SetupGate`)
- ชั้น C — **Login พนักงาน** (เจ้าของร้านคุม) = ตาราง `users` เดิม + People→StaffTab
- gate order: `License → Setup → Login → แอป` — แต่ละชั้นคนละ wrapper คนละไฟล์ อย่าปน
- **ไม่มี "สองตาราง user"** — พนักงาน = บัญชี login ตัวเดียวกัน แยกบทบาทด้วย `role` (admin/staff)

**Login (ชั้น C) — locked decisions:** **เลือกชื่อจากรายการ → ใส่ password** (เปลี่ยนจาก PIN เป็น password ยืนยัน 2026-06-04 — ตรงคอลัมน์ `users.password`+`email` เดิม, แข็งแรงกว่า, แก้ bootstrap วันแรก, **ตัด PinPad ทิ้ง** ใช้ `Input type=password`). email = identifier ไม่ต้องพิมพ์. คนเดียวข้ามหน้าเลือก, manager-override dialog (admin ใส่ password รับรองงาน sensitive **ผ่าน IPC ที่ยืนยัน ไม่ใช่แค่ปลดล็อกปุ่ม**), ล็อกหน้าจอไม่ล้าง cart. UI mirror `SetupWizard`, ไม่ต้องเพิ่ม primitive ใหม่. password ตอนนี้ **plaintext** → hash ด้วย `crypto.scryptSync` params **N=16384,r=8,p=1,salt16,key32**, เก็บ `scrypt$N$r$p$salt$hash`, legacy plaintext fallback→upgrade. `auth:getCurrentUser` hardcode ต้องแทนด้วย login จริง.

**Decision สุดท้าย (2026-06-04, ครบ):** bootstrap = เจ้าของตั้ง password เองใน **Setup wizard**, user นั้น role `admin` เสมอ (เขียนทับ seed `admin@syntropic.local`). **ไม่มี auto-lock**. **ไม่ persist session — login ใหม่ทุกครั้งเปิดโปรแกรม** (ตัดปัญหา stale session). lockout 5 ครั้ง **หน่วงเวลา (ไม่ล็อกถาวร)**. seed `Staff Test` (รหัส `staff` รู้กันทั้งโลก) ต้องเอาออก/บังคับตั้งรหัส. **กู้ password = layered:** ชั้น1 recovery code (สร้างตอน setup, โชว์ครั้งเดียว, เก็บ hash, ลิงก์ "ลืมรหัส" → ใส่ code → ตั้งใหม่ + ออก code ใหม่); ชั้น2 vendor reset (โชว์ machine code ให้ผู้ขาย → ผู้ขายเซ็น reset token ด้วย **private key เดียวกับ License** ผูก fingerprint+หมดอายุไว → ตั้ง password ใหม่). reset แตะแค่ admin password ห้ามแตะข้อมูล.

**มติเพิ่มเติม (ล็อกแล้ว):**
- **`must_change_password`: ถอดออกจาก slice แรก** — ไม่เพิ่มงาน (test data ลงใหม่ได้), ค่อยเพิ่ม Phase หลัง; **ไม่มีใน schema ปัจจุบัน**
- **role `pharmacist`: เอาออกจาก codebase แล้ว** — เหลือ admin/staff เท่านั้น
- **BL-1 (สำคัญ): role enforcement ทั้งหมด (saveStaff/void/finance/settings) เลื่อนไป Phase 3** — IPC ปัจจุบัน**ไม่มี caller identity** (handler รับแค่ `(_e,data)`, session อยู่ฝั่ง renderer ล้วน) → verify role ใน main ทำไม่ได้จนกว่าจะทำ **main-side session** (เก็บ current id+role ตอน `auth:login` ผูก webContents) เป็น prerequisite; ช่วง test ยอมรับว่า staff escalate เป็น admin ผ่านหน้า People ได้
- **B-2: ไม่ทำ upgrade path สำหรับ existing install** — พึ่ง fresh install → SetupWizard Phase 0 ตั้ง password
- **`login` IPC ไม่คืน email** — ตัด email ออกจาก return object + `CurrentUser` interface โดยเจตนา เพื่อไม่ leak ผ่าน DevTools; `CurrentUser = {id, name, role}` เท่านั้น
- **ปุ่ม "สลับผู้ใช้" ถูกตัดออกจาก TitleBar** — เหตุผล: slice นี้ยังไม่มี lock-state แยก; ทั้ง "ล็อกหน้าจอ" และ "สลับผู้ใช้" ทำสิ่งเดียวกัน (set current=null); รอเพิ่มกลับ Phase หลังเมื่อ lock-state แยกพร้อม
- **`listLoginUsers` ไม่คืน email** (UX privacy; ตรงกัน)

**สิ่งที่ ship ใน slice แรก (2026-06-05):**
- `electron/auth/hash.ts` — hashSecret/verifySecret legacy-fallback/genRecoveryCode (scrypt N=16384,r=8,p=1,salt16,key32, รูป `scrypt$16384$8$1$<salt_hex>$<hash_hex>`)
- `electron/auth/lockout.ts` — checkLocked/recordFailure/clearFailures; นับใน DB columns `failed_attempts`+`locked_until`; 5 ครั้ง→หน่วง 30s ไม่ถาวร; อยู่รอด restart
- `electron/ipc/auth.ts` — ลบ getCurrentUser, เพิ่ม listLoginUsers (id,name,role) + login (checkLocked→verify→legacy upgrade→clearFailures)
- `electron/ipc/people.ts` — saveStaff allow-list `['name','email','role','is_disabled']` + hash conditional
- `electron/ipc/settings.ts` — completeSetup รับ adminPassword → hash + gen recovery code → คืน recoveryCode plaintext ครั้งเดียว
- `electron/preload.ts` — auth namespace (listLoginUsers, login)
- `src/stores/userStore.ts` — ตัด persist (in-memory, เริ่ม null ทุก boot); cleanup localStorage 'user-store'; getCurrentUserId() คงไว้
- `src/pages/Auth/LoginScreen.tsx` — wire IPC จริง (โหลด users + login + map error LOCKED); mockup preview คงไว้ (DEV ONLY)
- `src/App.tsx` — LoginGate ครอบ HashRouter ภายใน SetupGate
- `src/components/layout/TitleBar.tsx` — Popover ผู้ใช้ render เฉพาะ current!=null; มีแค่ "ล็อกหน้าจอ" + "ออกจากระบบ"
- `src/pages/Setup/SetupWizard.tsx` — 4-step (เพิ่ม step 3 "ตั้งรหัสผ่านผู้ดูแล"); แสดง recovery code ครั้งเดียวใน step 4
- `src/pages/People/index.tsx` — ลบ role pharmacist เหลือ admin/staff
- schema — เพิ่ม `recovery_code_hash`/`failed_attempts`/`locked_until` ใน users (CREATE TABLE + migration array)
- `docs/claude/ipc-api.md` — เพิ่ม auth namespace

**Phase 3 — ship ใน 2026-06-05 (BL-1 ปลดล็อกแล้ว):**
- `electron/auth/session.ts` — `Map<webContents.id, {userId,role}>` in-memory (ไม่ persist ข้าม boot); `bindSession/clearSession/clearSessionById/getSession/getSessionRole/requireAdmin(e, override?)`
- `auth:login` → `bindSession`; `auth:logout` → `clearSession`
- `electron/main.ts` — ล้าง session ตอน `destroyed` + `did-start-navigation` **เฉพาะ `isMainFrame && !isSameDocument`** (HashRouter route-change = same-document → ห้ามล้าง หรือ role พังกลางแอป — ดู [[ipc-role-enforcement]])
- `userStore.lock()` / `logout()` เรียก `window.api.auth.logout()` (fire-and-forget) — admin lock จอ → staff login ไม่ inherit admin session
- IPC admin-only handlers: `requireAdmin(_e)` บรรทัดแรก
- `src/hooks/usePermission.ts` — `{role, isAdmin}` จาก userStore = **UX เท่านั้น (R1)**; sidebar /reports+/settings adminOnly; Manage-ค่าใช้จ่าย + People-พนักงาน tab ซ่อนจาก staff
- `src/components/ui/manager-override-dialog.tsx` + `src/hooks/useManagerOverride.tsx` — `run(action, {...})` คืน `{run, dialog, isAdmin}`; admin = รันตรง, staff = เปิด dialog แนบ credential ไปกับ IPC (inline credential, ไม่มี token leak)
- `requireAdmin(e, override?)` — session ไม่ admin แต่มี override → verify admin row (role==='admin' บังคับ) + lockout เดียวกับ login

**Phase 2.5 recovery-code — ship ใน 2026-06-05 (self-service):**
- `auth:resetAdminPassword({recoveryCode, newPassword})` — counter แยก (`recovery_failed_attempts`/`recovery_locked_until`); verify `recovery_code_hash` → reset password + regenerate code (คืน plaintext ครั้งเดียว); ไม่ bind session ไม่แตะข้อมูลร้าน
- LoginScreen มี "ลืมรหัสผ่าน" flow จริง + ข้อความ "ลืม recovery code? ติดต่อผู้ขาย" (placeholder ชั้น vendor reset)

**Role permission policy (ล็อกโดยเจ้าของ 2026-06-05):**
- staff สร้าง/แก้ข้อมูลสินค้าทั่วไปได้ (`products:create/update` ไม่ gate)
- **admin-only + override ได้** (ปุ่มโผล่ให้ staff → กด → admin ใส่รหัส): `reports:voidSale`, `products:updatePrice`, `adjustStock`/`adjustLot`/`adjustLotBatch`/`updateLot`/`expireLot`, `purchase:cancel`
- **admin-only ซ่อนสนิท** (ไม่ override): finance reports ทั้งหมด (financeSummary/salesPurchaseTrend/accountsPayable/topProducts/topSuppliers/cashierLeaderboard/salesStats/productVelocity/hourlyTraffic), `expenses:*`, settings writes, `saveStaff`/`setStaffStatus`/`listStaff`, backup/restore
- **ห้าม gate** `completeSetup` (รันก่อน login = FORBIDDEN ตัวเอง), settings reads/lookups/POS/GR/customer = เปิดทั้งหมด
- **DeadStock cost-strip**: `reports:inactiveProducts` คืน `cost_value: null` ฝั่ง main เมื่อ caller ไม่ใช่ admin (กัน DevTools leak ตาม R1); DeadStock.tsx ซ่อน column/footer ต้นทุนเมื่อ `!isAdmin` (colSpan dynamic)

**หนี้ที่เหลือ:**
- **Vendor reset (Ed25519)** — ยัง block; License infra (`electron/license/*`) ยังไม่เริ่ม; ตอนนี้มีแค่ "ติดต่อผู้ขาย" placeholder
- **License (ชั้น A)** — **เลื่อนออกไปโดยตั้งใจ (มติเจ้าของ 2026-06-05)** — ยังอีกนานกว่าจะเปิดให้คนนอกโหลด ตอนนี้ใช้ร้านตัวเอง = License ไม่ปกป้องอะไร + เสี่ยงล็อกตัวเองตอน demo. **กลยุทธ์ freemium ที่ล็อกแล้ว:** demo/free = เวอร์ชัน "ง่อย ๆ" **ตัดฟังก์ชันบางอย่างออก ไม่ใส่ License เลย** (ใครใช้ฟรีตลอดก็ปล่อย เพราะมันทำงานไม่ครบ = วางยาไว้); ออกตัวเต็มเมื่อไหร่ค่อยทำ License + ปลดทุกฟังก์ชัน. LicenseGate เป็น wrapper นอกสุด → เติม/สลับโหมดทีหลังราคาเท่าเดิม ไม่ต้องรื้อใน. **อย่าเริ่มทำ License เชิงรุก** จนกว่าจะใกล้เปิด public
- **ปุ่ม "สลับผู้ใช้"** — รอ lock-state แยกพร้อม
- **B-2 upgrade path** — พึ่ง fresh install ไปก่อน

**Real-Electron verification — DONE 2026-06-05 (24/24 PASS):** เขียน e2e ที่ขับ Electron จริงผ่าน Playwright `_electron` → `tests/e2e/login-security.mjs` (เรียก `window.api.*` ตรงผ่าน preload เลย session-binding/role-enforce/navigation-clear ถูก exercise จริง). ครอบคลุม: listLoginUsers ไม่ leak email; completeSetup ออก recovery code ครั้งเดียว; login คืน {id,name,role} ไม่มี email; **session isolation** (admin→ผ่าน, logout→FORBIDDEN, staff→financeSummary/listStaff FORBIDDEN); **override** (admin pw ผ่าน=ตกที่ "ไม่พบ sale", รหัสผิด/non-admin=รหัสผ่านไม่ถูกต้อง, ไม่มี override=FORBIDDEN); **DeadStock cost-strip** (staff cost_value=null, admin=250); **HashRouter same-doc nav ไม่ล้าง session**; **recovery** (ออก code ใหม่ ≠ เดิม, login รหัสใหม่ได้, code เก่า invalid); **full reload ล้าง session** (FORBIDDEN). 
  - **วิธีรัน:** ต้องมี `npm run dev` รันบน :5173 ก่อน (build dist-electron + serve renderer) แล้ว `node tests/e2e/login-security.mjs`. Playwright = `playwright-core` ติดตั้งใน prefix แยกนอก repo (`D:\Syntropic.Project\.pw-tools`, **ห้ามลง playwright ใน node_modules โปรเจกต์** กัน npm reconcile ทำ better-sqlite3 prebuilt พัง); resolver ในไฟล์ลองตาม env `PLAYWRIGHT_CORE` → `playwright-core` → sibling `.pw-tools`. ทดสอบแล้ว native module คงเดิม (1911296 bytes). `_electron` ไม่ต้องโหลด browser binaries. test ใช้ `--user-data-dir` temp แยก ไม่แตะ DB dev.

**License (ชั้น A):** signed **Ed25519 token** (Node crypto built-in, ห้าม npm install), ผูกเครื่อง — เก็บ **3 fingerprint hash แยก (guid/disk/host) จับคู่ ≥2-of-3**. expired/invalid = ล็อกทางเข้าแต่**ห้ามลบข้อมูล**. Private key ห้ามเข้า repo/แอป. เริ่ม **ขายขาด** (`expires_at:null`). **ยังไม่เริ่ม**.

**เอกสาร:** `docs/plans/User_Login_System.md` (**v3**), `docs/plans/Login_UI_Design.md`, `docs/plans/License_Activation_System.md`. ดู [[project_login_mockup]], [[ipc-role-enforcement]].
