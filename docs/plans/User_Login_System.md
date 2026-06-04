# แผนระบบ User & Login — Syntropic Desktop

> สถานะ: **DRAFT v2 (ซึมซับ audit 2026-06-04 + เปลี่ยนเป็น password)** — เขียน 2026-06-04
> ขอบเขต: ระบบเข้าสู่ระบบ (login) + การจัดการผู้ใช้/พนักงาน + สิทธิ์ (roles) ของแอป POS ร้านยา
> เกี่ยวข้อง: `Login_UI_Design.md` (UI), `License_Activation_System.md` (gate ชั้นนอก A)

---

## 0. สรุปสั้น (TL;DR)

**ความเข้าใจผิดที่ต้องเคลียร์ก่อน:** เราไม่ได้มี "สองระบบ user" ที่ต้องแยกกัน

- "ระบบ user ภายในร้าน" = **ตาราง `users` + หน้า People → StaffTab** (เพิ่ม/แก้/ปิดพนักงาน)
- "ระบบ login" = **การยืนยันตัวตน (authenticate) กับตาราง `users` ตัวเดิมนั้นเอง**

→ **พนักงาน 1 คน = บัญชี login 1 บัญชี** entity เดียวกัน คนละมุมมอง แยกบทบาทด้วย `role` (admin/staff)

**วิธี login (ตัดสินแล้ว 2026-06-04):** **เลือกชื่อตัวเองจากรายการ → ใส่ password** (ไม่ใช่ PIN, ไม่ใช่ email+password)
เหตุผล: ตรงกับคอลัมน์ `password`+`email` ที่ `users` table มีอยู่แล้ว (ไม่ต้องเพิ่ม `pin_hash`/migrate), password แข็งแรงกว่า PIN 6 หลัก, **แก้ปัญหา bootstrap วันแรกได้เลย** (seed plaintext `admin`/`staff` พิมพ์เข้าได้), และ**ตัด PinPad primitive ทิ้งได้** (ใช้ `Input type=password` เดิม). `email` เป็นแค่ unique key ไม่ต้องพิมพ์ตอน login

สิ่งที่ต้องสร้างเพิ่มจริง ๆ:
1. **Login gate** หน้าจอเข้าสู่ระบบ (คั่นหลัง License + Setup)
2. **การ hash รหัสผ่าน** (ตอนนี้ plaintext — ต้องแก้; scrypt params กำหนดในข้อ 5)
3. **Session ใน-หน่วยความจำ + สลับผู้ใช้/ล็อกจอ** แทน `getCurrentUser` ที่ hardcode — **ไม่ persist, login ใหม่ทุกครั้งที่เปิดโปรแกรม** (ตัดสิน 2026-06-04)
4. **Permission gate ตาม role — บังคับใน main process ไม่ใช่แค่ renderer** (audit R1/R2)
5. **ระบบกู้ password (offline)** — layered: recovery code + vendor reset (ข้อ 4.5)

---

## 1. สถานะปัจจุบัน (ของจริงในโค้ด)

| ส่วน | ไฟล์ | สภาพ |
|------|------|------|
| ตาราง users | `electron/db/schema.ts:9` | `id, name, email (unique), password TEXT (plaintext!), role default 'staff', is_disabled, timestamps`; มี safe column-migration array ที่ `schema.ts:683+` |
| Auth IPC | `electron/ipc/auth.ts` | `auth:getCurrentUser` **hardcode** คืน `staff@syntropic.local` — ไม่มี login จริง |
| จัดการพนักงาน | `electron/ipc/people.ts:120+` + `src/pages/People/index.tsx:578` (`StaffTab`) | CRUD ครบ; **`saveStaff` insert password ดิบ + สร้าง UPDATE จาก `Object.keys` (footgun allow-list)** |
| Session | `src/stores/userStore.ts` | `getCurrentUserId()` **throw** ถ้า `current` null (`:34`); persist ลง localStorage; `App.tsx:72` เรียก `hydrateUser()` ตอน mount |
| Attribution | ทั่วแอป | `getCurrentUserId()` ใส่ `sold_by/created_by/issued_by/user_id` |
| Role gate | `src/pages/Reports/*` | `role==='admin'`=isOwner **(renderer ล้วน — ปลอมได้)**; ปุ่ม DEV สลับ role `Finance.tsx:117-123` รอลบ |
| Seed | `electron/db/seed.ts:14,51` | Admin (`admin@syntropic.local`/`admin`/admin) + Staff Test (`staff@syntropic.local`/`staff`/staff) — **plaintext** |
| App gate | `src/App.tsx:50` `SetupGate` | gate แค่ first-run — ยังไม่มี License/Login gate |

**ข้อจำกัด:** ห้าม `npm install` ปกติ → ใช้ Node `crypto` built-in (`scryptSync`). **ยืนยันแล้ว (audit N5): Electron 31 = Node 20, มี scrypt ครบ ใช้ได้จริง**

---

## 2. โมเดลแนวคิด — ตารางเดียว, แยกด้วย role

ตาราง `users` เดียวเป็นทั้งบัญชี login และทะเบียนพนักงาน · StaffTab จัดการ · Login ยืนยันตัวตน
ปฏิเสธการแยกเป็นสองระบบ (device account vs HR log) — ร้านเดี่ยวไม่ต้องการ identity สองชั้น สร้าง edge case เปล่า ๆ

### Roles (เริ่ม 2 พอ)
| role | ใคร | สิทธิ์ |
|------|-----|-------|
| `admin` | เจ้าของ/เภสัชกร | ทุกอย่าง: Finance, ต้นทุน, ตั้งค่า, จัดการพนักงาน, ยกเลิกบิล, ปรับสต็อก |
| `staff` | ผู้ช่วย/แคชเชียร์ | POS, ดูสินค้า/สต็อก, รับเข้า; **ไม่เห็น**เงิน/กำไร/รายงานการเงิน, แก้ตั้งค่า/พนักงานไม่ได้, ยกเลิกบิลต้องขอ override |

> เผื่ออนาคต `manager` — `role` เป็น string เปิดทางไว้ แต่ยังไม่สร้าง

---

## 3. กลไกยืนยันตัวตน — เลือกชื่อ + password

- หน้า Login: **รายชื่อ user ที่เปิดใช้งาน (avatar+ชื่อ+badge role) → คลิกเลือก → ใส่ password → เข้า**
- คนเดียวในร้าน → ข้ามหน้าเลือก ไปช่อง password เลย
- `email` ไม่ต้องพิมพ์ (เป็นแค่ unique identifier ใน DB)
- เก็บ password แบบ **hash** ในคอลัมน์ `password` เดิม (ไม่ต้องเพิ่มคอลัมน์)

---

## 4. Flow

### 4.1 Boot
```
LicenseGate (A) ──valid──▶ SetupGate (B) ──done──▶ LoginGate (C) ──auth──▶ แอป
```
- `LoginGate` wrapper คล้าย `SetupGate` ครอบ `<HashRouter>` ใน `App.tsx`, **render ก่อนทุก route ที่เรียก `getCurrentUserId()`** (audit B2)
- **ไม่ persist session** — เปิดโปรแกรมทุกครั้ง `current` เริ่มเป็น null → เข้าหน้า Login เสมอ (ตัดสิน 2026-06-04). ผลพลอยได้: ไม่มี stale session ใน localStorage ให้ re-verify (ปิดประเด็น audit B2 เรื่อง session ค้าง)
- `userStore` **ตัด `persist` ทิ้ง** สำหรับ `current`; เลิก `hydrateUser()` hardcode → แทนด้วย `login()/logout()/lock()`

### 4.2 ระหว่างวัน — สลับผู้ใช้/ล็อกจอ
- ปุ่ม avatar+ชื่อผู้ใช้ปัจจุบันที่ **TitleBar** → Popover: **ล็อกหน้าจอ / สลับผู้ใช้ / ออกจากระบบ**
- ล็อกหน้าจอ = กลับหน้า Login โดยไม่ปิดแอป **ไม่ล้าง cart/งานค้าง**
- **ไม่มี auto-lock** (ตัดสิน 2026-06-04) — ล็อกเองด้วยปุ่มเท่านั้น

### 4.3 งาน sensitive — Manager override
- `staff` ทำงานที่ต้องสิทธิ์ admin → Dialog "ต้องการสิทธิ์ผู้ดูแล" ให้ admin ใส่ password รับรอง
- **override ต้องทำรายการผ่าน IPC ที่ยืนยัน role แล้ว ไม่ใช่แค่ปลดล็อกปุ่มใน renderer** (audit R2)
- ใช้ lockout เดียวกับ login (audit G3) — ไม่งั้นกลายเป็นช่องอ่อน

### 4.4 Attribution
- `getCurrentUserId()` คืน id ของคนที่ล็อกอินจริง — โค้ดที่เรียกอยู่ทั้งหมด**ไม่ต้องแก้** *ตราบใดที่ LoginGate การันตีว่ามี user ก่อน route พวกนั้น mount* (invariant, audit B2)

### 4.5 กู้ password (offline) — layered (recovery code + vendor reset)
แอป offline ไม่มี email ส่งลิงก์รีเซ็ต → ใช้ 2 ชั้น:

**ชั้น 1 — Recovery code (self-service):**
- ตอน Setup wizard ตั้ง password admin → แอปสร้าง **recovery code สุ่ม** (เช่น `XXXX-XXXX-XXXX`, base32) โชว์ครั้งเดียว + บอกให้จด/ปรินต์เก็บ
- เก็บแค่ **hash** ของ code (scrypt เหมือน password) ไม่เก็บ plaintext
- หน้า Login มีลิงก์ "ลืมรหัสผ่าน" → ใส่ recovery code → ตรง → ตั้ง password ใหม่ + **ออก recovery code ใหม่** (code เดิมใช้แล้วทิ้ง)
- ใช้ lockout เดียวกับ login (กัน brute-force code)

**ชั้น 2 — Vendor reset (backstop, ลูกค้าทำหายไม่ได้):**
- ลืมทั้ง password และ recovery code → หน้า "ลืมรหัส" โชว์ **machine code + license id** ให้อ่านบอกผู้ขาย
- ผู้ขายเซ็น "รหัสปลดล็อก" ด้วย **private key ตัวเดียวกับ License (Ed25519)** ผูก fingerprint เครื่องนั้น + หมดอายุไว (เช่น 24 ชม.)
- ลูกค้ากรอก → แอป verify ลายเซ็น + fingerprint + ยังไม่หมดอายุ → อนุญาตตั้ง password admin ใหม่
- ปลอดภัย: มีแค่ผู้ขายที่เซ็นได้ + ใช้ได้เฉพาะเครื่องนั้น; reuse infra License แทบทั้งดุ้น
- เฟสแรก = ผู้ขายเซ็นด้วยสคริปต์มือ (เหมือนออก license) — ยังไม่ต้องมี server

> **reset = ตั้ง password ใหม่เท่านั้น ห้ามแตะข้อมูลร้าน**; ทั้งสองชั้นรีเซ็ตได้เฉพาะ **บัญชี admin** (พนักงานลืมรหัส → admin เข้าไปตั้งให้ใหม่ใน StaffTab)

---

## 5. ความปลอดภัย — Hashing + role enforcement

### Password hashing
- **Node `crypto.scryptSync`** (built-in, ไม่ต้องลง dep)
- พารามิเตอร์ pin ไว้ (audit G2): **`N=16384, r=8, p=1`, salt 16 ไบต์สุ่ม, key 32 ไบต์**
- รูปแบบเก็บ (ฝัง params เผื่ออัปในอนาคต): **`scrypt$16384$8$1$<salt_hex>$<hash_hex>`**
- helper กลางใน main: `hashSecret(plain)` / `verifySecret(plain, stored)`
- **Legacy fallback:** ค่าใน DB ไม่มี prefix `scrypt$` (= plaintext เดิม) → เทียบตรงครั้งเดียว → **อัปเกรดเป็น hash ทันที**ที่ login สำเร็จ (แก้ B1: seed `admin`/`staff` พิมพ์เข้าได้วันแรก)
- `auth:getCurrentUser` (hardcode) → **ลบ**, แทนด้วย `auth:login(userId, password)` + `auth:listLoginUsers()` (คืนเฉพาะ id/name/role/email — **ไม่ส่ง hash ออก renderer**)
- `people.saveStaff` → hash ก่อนเก็บ + **allow-list คอลัมน์ UPDATE** (ห้าม spread `Object.keys` ดิบ, audit R4); ห้ามรับค่า hash สำเร็จรูปจาก renderer

### Brute-force lockout (audit G3)
- **นับ failed attempt ฝั่ง main process ต่อ user (เก็บ count+timestamp, อยู่รอด restart)** — ไม่ใช่ renderer state
- backoff: เกิน N ครั้ง (เช่น 5) → หน่วงเวลา/ล็อกชั่วคราว; ใช้กับ manager-override ด้วย
- password space ใหญ่กว่า PIN มาก → ความเสี่ยงเบาลง แต่ยังต้องมี lockout

### Role enforcement (audit R1 — สำคัญ)
- **renderer role = ใช้แค่ UX (ซ่อน/แสดงปุ่ม) เท่านั้น เชื่อไม่ได้** (localStorage แก้ได้)
- **IPC handler ของงาน sensitive ทุกตัว (void, finance queries, settings writes, staff CRUD) ต้อง verify role ของ user ที่ทำรายการเองใน main process**

---

## 6. งานที่ต้องทำ (Phase)

### Phase 0 — bootstrap admin ใน Setup wizard (audit B1, ต้องมาก่อน)
- [ ] เพิ่มสเต็ปใน **Setup wizard**: เจ้าของ**ตั้ง password เอง** (+ ยืนยัน) → เขียน hash ลงบัญชี seed admin (`admin@syntropic.local`, role `admin` เสมอ)
- [ ] สเต็ปเดียวกันสร้าง + โชว์ **recovery code** ครั้งเดียว (เก็บ hash) — ดู §4.5
- [ ] **จัดการ seed `Staff Test`** (`staff@syntropic.local` รหัส `staff` — รหัสที่รู้กันทั้งโลก = ช่องโหว่): เอาออกจาก production seed หรือบังคับตั้งรหัส; ใส่เข้า checklist "DEV-only ลบก่อน build" ใน CLAUDE.md

### Phase 1 — auth backend
- [ ] `electron/auth/hash.ts` — scrypt (params ตาม §5) + legacy plaintext fallback
- [ ] `electron/ipc/auth.ts` ใหม่: `listLoginUsers`, `login(userId, password)` (verify + upgrade hash + คืน safe fields), main-process lockout; ลบ `getCurrentUser`
- [ ] `people.saveStaff` — hash + allow-list UPDATE columns
- [ ] preload `window.api.auth.*` + `docs/claude/ipc-api.md`

### Phase 2 — Session + Login UI (ดู `Login_UI_Design.md`)
- [ ] `userStore`: `login()/logout()/lock()` ใน-หน่วยความจำ — **ตัด `persist` ทิ้ง**, เลิก hardcode hydrate
- [ ] `src/pages/Auth/LoginScreen.tsx` (เลือกชื่อ + ช่อง password + ลิงก์ "ลืมรหัสผ่าน")
- [ ] flow กู้รหัส: หน้าใส่ recovery code → ตั้ง password ใหม่ + หน้า vendor reset (โชว์ machine code, รับ token) — §4.5
- [ ] `LoginGate` ใน `App.tsx`
- [ ] ปุ่มผู้ใช้/ล็อก/สลับ/ออก ใน `TitleBar.tsx`

### Phase 2.5 — recovery backend
- [ ] hash/verify recovery code (scrypt) + regenerate หลังใช้
- [ ] verify vendor reset token (Ed25519 + fingerprint + expiry) — reuse `electron/license/*`
- [ ] `auth:resetAdminPassword` (ผ่าน recovery code หรือ vendor token เท่านั้น)

### Phase 3 — Permissions + cleanup
- [ ] helper `usePermission()` / รวม `role==='admin'` กระจาย; **+ enforce role ใน IPC** (R1)
- [ ] Dialog manager-override (ทำรายการผ่าน IPC ยืนยันแล้ว — R2)
- [ ] **ลบปุ่ม DEV สลับ role** `Finance.tsx:117-123,230-235`
- [ ] เพิ่ม seed plaintext passwords เข้า checklist "DEV-only ลบก่อน build" ใน CLAUDE.md (audit N4)
- [ ] (ออปชัน) auto-lock — Q4

---

## 7. Decision points — ตัดสินครบแล้ว (2026-06-04)

- ✅ **credential:** เลือกชื่อ + password
- ✅ **bootstrap:** เจ้าของตั้ง password admin (role admin เสมอ) ใน Setup wizard + ออก recovery code
- ✅ **กู้ password:** layered — recovery code (self-service) + vendor reset (backstop)
- ✅ **auto-lock:** ไม่มี (ล็อกเองด้วยปุ่ม)
- ✅ **persist session:** ไม่ persist — login ใหม่ทุกครั้งที่เปิดโปรแกรม
- ✅ **lockout threshold:** 5 ครั้ง → หน่วง (นับ main process)
- ปลีกย่อย (assert ได้ตอน craft): บังคับเปลี่ยน password ครั้งแรกสำหรับบัญชีที่ admin สร้างให้พนักงาน — แนะนำ: มี

---

## 8. หลักการที่ต้องระวัง (invariants)
- **ห้ามส่ง password/hash ออก renderer** — `listLoginUsers` คืนเฉพาะ id/name/role/email
- **renderer role = UX เท่านั้น; งาน sensitive verify role ใน IPC** (R1/R2)
- **lockout อยู่ main process, อยู่รอด restart** (G3)
- **boot ต้อง re-verify session กับ DB** (B2); LoginGate render ก่อน route ที่เรียก `getCurrentUserId()`
- **`people.saveStaff` ต้อง allow-list คอลัมน์** (R4, ตาม CLAUDE.md database rule)
- **ห้าม `npm install` ปกติ** — `crypto` built-in เท่านั้น
- attribution เดิมชี้ `users.id` — อย่าเปลี่ยน semantics
- UI: ไทย, components/ui เท่านั้น, dialog/button convention, ไม่มี emoji
- LoginGate หลัง SetupGate หลัง LicenseGate
