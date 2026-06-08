# แผนระบบ User & Login — Syntropic Desktop

> สถานะ: **IMPLEMENTED v3 — Phase 0+1+2 + Phase 3 + Phase 2.5(recovery-code) DONE 2026-06-05** (pipeline wizard→blacksmith→priest→hunter, tsc-clean, Priest PASS, ยังไม่ click-test ในแอป). เขียน 2026-06-04, แก้ 2026-06-05
>
> **เหลือ (blocked):** Phase 2.5 vendor reset (Ed25519) + License ชั้น A ทั้งระบบ — block เพราะ License infra (`electron/license/*`, Ed25519 keys, key management) ยังไม่เริ่ม; ต้องตัดสิน key management ก่อน. LoginScreen มีลิงก์ "ติดต่อผู้ขาย" placeholder รออยู่. ดู `License_Activation_System.md`.
> ขอบเขต: ระบบเข้าสู่ระบบ (login) + การจัดการผู้ใช้/พนักงาน + สิทธิ์ (roles) ของแอป POS ร้านยา
> เกี่ยวข้อง: `Login_UI_Design.md` (UI), `License_Activation_System.md` (gate ชั้นนอก A)

---

## 0.5 Drift corrections (wizard pass 2026-06-05 — ของจริงในโค้ด ณ วันนี้)

ก่อนเริ่ม craft — จุดที่ plan v2 เขียนไว้ไม่ตรงโค้ดจริงแล้ว ยืนยันด้วยการสำรวจ:

1. **`userStore.ts` ชื่อเมธอดคนละแบบกับ plan** — โค้ดจริงคือ `setCurrent(u)` + `hydrate()` (ไม่ใช่ `hydrateUser()`). `App.tsx:69` ทำ `const hydrateUser = useUserStore(s => s.hydrate)` แล้วเรียก `hydrateUser()` (ตัวแปร local ชื่อ `hydrateUser` แต่เมธอด store จริงชื่อ `hydrate`). ต้องแก้ทั้งสองที่
2. **`auth.ts` ไม่ได้ hardcode object ดิบ** — เป็น query จริงจาก DB (`staff@syntropic.local`) มี fallback. ยังต้อง **ลบทั้ง handler** แทนด้วย `login`/`listLoginUsers`
3. **`Finance.tsx` ไม่มีอยู่จริงแล้ว** — `src/pages/Reports/` มีแค่ `Dashboard.tsx, FdaReports.tsx, KhorYor9.tsx, index.tsx`. **ไม่มีปุ่ม DEV สลับ role ให้ลบ** (ถูกลบไปก่อนหน้าแล้ว) → Phase 3 cleanup ข้อนี้ **ตัดทิ้งได้**
4. **avatar primitive = `InitialAvatar`** (ไม่ใช่ `<Avatar>`) — render เป็น User icon + พื้น token hash จากชื่อ. props: `name`, `size?: 'xs'|'sm'|'default'`, `className?`. Login UI/TitleBar ใช้ตัวนี้
5. **migration array แรกจบที่ ~`schema.ts:785`** (loop `try { db.exec(sql) } catch {}` ที่ `:786`) แล้วมี migration block ตามหลังอีกหลายชุด (ถึง ~`:899+`). คอลัมน์ users ใหม่ใส่ใน CREATE TABLE (`:9-18`) + array แรก (~`:695`)
6. **`completeSetup` payload** (`SetupWizard.tsx:111`) ส่ง `{ shop, vat }` — Phase 0 ต้องขยายเป็น `{ shop, vat, adminPassword }`; handler `settings.ts:109` รับเพิ่ม
7. **StaffTab payload** (`People/index.tsx:620`) ส่ง `password` ดิบ ตรงเข้า `saveStaff`; backend `people.ts:135` insert ดิบ + `:131-132` UPDATE จาก `Object.keys` (footgun ยืนยันแล้ว — ต้อง allow-list + hash)

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

## 0.6 Audit resolutions (รอบ 2 — 2026-06-05, ก่อน craft)

audit รอบ 2 เจอ 3 BLOCKER + SHOULD-FIX — มติ/ทางแก้ที่ fold เข้า plan แล้ว:

| # | ประเด็น | มติ |
|---|---------|-----|
| **B-1** | `TitleBar` mount **นอก** LoginGate ด้วย (`SetupWizard.tsx:138` + หน้า Login เอง) → ปุ่มผู้ใช้จะ crash ตอน `current===null` | ปุ่มผู้ใช้ใน TitleBar **render แบบมีเงื่อนไข** (`current && <UserButton/>`), อ่าน `useUserStore(s=>s.current)` + guard null — **ห้ามเรียก `getCurrentUserId()`** ใน TitleBar (มัน throw). ดู §6.5 ข้อ 10 |
| **B-2** | Phase 0 ตั้ง password ไม่รันบน existing install (`setup_completed` backfill=1 → SetupWizard ไม่เด้ง) → admin ติด `admin`/`admin` | **ยอมรับ — ไม่ใช่ปัญหาตอนนี้** (มติ 2026-06-05: เป็น test data, ลบ DB ติดตั้งใหม่ → fresh install → SetupWizard Phase 0 รันปกติ). **ไม่ทำ upgrade path สำหรับ existing install ในรอบนี้** (ไม่เพิ่มงาน). บันทึกหนี้: ถ้าวันหน้าต้อง ship ทับ DB จริง ค่อยเพิ่ม path ตั้งรหัสนอก SetupWizard |
| **B-3** | `must_change_password` มีคอลัมน์แต่ไม่มี flow | **ถอดคอลัมน์ออกจาก slice แรก** (มติ 2026-06-05 — ไม่เพิ่มงาน). ไม่มี flow บังคับเปลี่ยนรหัสในรอบนี้ |
| **S-1** | admin คนเดียวโดน lockout 5 ครั้ง = ล็อกตัวเองถาวร (vendor reset ยังไม่มี) | `locked_until` = **หน่วงเวลา** (ปลดเองเมื่อพ้น backoff) ไม่ใช่ล็อกถาวร; recovery code counter แยกจาก login counter (เฟส 2.5) |
| **S-3** | `saveStaff` footgun + หน้า People ไม่ gate role → staff escalate เป็น admin ได้ | **เฟส 1 ทำแค่ allow-list + hash + password-conditional** (ปิด SQL footgun ตาม HARD invariant). **role-check เลื่อนไป Phase 3** (มติ audit รอบ 2, 2026-06-05 — BL-1) |
| **BL-1** (audit รอบ 2) | มติ S-3 เดิมสั่ง "verify role=admin ใน main เฟส 1" แต่ **IPC ไม่มี caller identity** (handler รับแค่ `(_e, data)`, session อยู่ฝั่ง renderer ล้วน) → ทำตามตัวอักษรไม่ได้ + allow-list ยังให้ส่ง `role:'admin'` ได้ (กันแค่ SQL footgun ไม่กัน escalation) | **เลื่อน role enforcement ไป Phase 3** (มติ 2026-06-05 — test build, ลงใหม่เสมอ, owner เป็น user จริงคนเดียว, escalation ไม่ใช่ภัยจริงช่วง test). Phase 3 จะทำ **main-side session** (เก็บ current id+role ตอน `auth:login` ผูก webContents) เป็น prerequisite ของ role-check ทุกตัว — ปลดล็อก S-5 (void) ไปพร้อมกัน |
| **S-4** | โค้ดมี role `pharmacist` (`People/index.tsx:648`) แต่ plan เป็น 2-role | **เอา `pharmacist` ออก** เหลือ admin/staff (มติ 2026-06-05) |
| **N-1** | `listLoginUsers` คืน email (PII โผล่หน้า Login) | คืนแค่ `id,name,role` — Login UI ไม่ใช้ email |
| แก้ขัดแย้งใน plan | §6 บรรทัด "ลบปุ่ม DEV `Finance.tsx`" ขัด §0.5#3 (ไม่มีไฟล์แล้ว) | ลบรายการนั้นทิ้ง (ดู Phase 3) |

> **ยังเป็นหนี้ยอมรับได้ (เฟสถัดไป):** **role enforcement ทั้งหมด (saveStaff/void/finance/settings) → Phase 3** หลังทำ main-side session (BL-1) — ช่วง test staff escalate เป็น admin ได้, ยอมรับ; S-2 (locked_until เทียบ client clock — ถอยนาฬิกาปลดได้, ความเสี่ยงต่ำ); S-5 (void/ยกเลิกบิล) ปลดล็อกพร้อม main-side session; Phase 2.5 recovery backend (รวม recovery-code counter แยกจาก login counter — เฟส 1 มี login counter ตัวเดียว)

---

## 1. สถานะปัจจุบัน (ของจริงในโค้ด)

| ส่วน | ไฟล์ | สภาพ |
|------|------|------|
| ตาราง users | `electron/db/schema.ts:9` | `id, name, email (unique), password TEXT (plaintext!), role default 'staff', is_disabled, timestamps`; มี safe column-migration array ที่ `schema.ts:683+` |
| Auth IPC | `electron/ipc/auth.ts` | `auth:getCurrentUser` **hardcode** คืน `staff@syntropic.local` — ไม่มี login จริง |
| จัดการพนักงาน | `electron/ipc/people.ts:120+` + `src/pages/People/index.tsx:578` (`StaffTab`) | CRUD ครบ; **`saveStaff` insert password ดิบ + สร้าง UPDATE จาก `Object.keys` (footgun allow-list)** |
| Session | `src/stores/userStore.ts` | `getCurrentUserId()` **throw** ถ้า `current` null; เมธอดจริง = `setCurrent()`+`hydrate()` (ดู §0.5#1); persist ลง localStorage; `App.tsx:69` เรียก `hydrate()` (ผ่าน local alias `hydrateUser`) ตอน mount |
| Attribution | ทั่วแอป | `getCurrentUserId()` ใส่ `sold_by/created_by/issued_by/user_id` |
| Role gate | `src/pages/Reports/*` | `role==='admin'`=isOwner **(renderer ล้วน — ปลอมได้)**; ~~ปุ่ม DEV สลับ role `Finance.tsx`~~ ลบไปแล้ว ไม่มี `Finance.tsx` (ดู §0.5#3) |
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
> **`pharmacist` ที่ค้างใน `People/index.tsx:648` ต้องเอาออก** (เหลือ admin/staff) — มติ 2026-06-05, audit S-4

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

### Phase 0 — bootstrap admin ใน Setup wizard (audit B1, ต้องมาก่อน) — ✅ DONE 2026-06-05
- [ ] เพิ่มสเต็ปใน **Setup wizard**: เจ้าของ**ตั้ง password เอง** (+ ยืนยัน) → เขียน hash ลงบัญชี seed admin (`admin@syntropic.local`, role `admin` เสมอ)
- [ ] สเต็ปเดียวกันสร้าง + โชว์ **recovery code** ครั้งเดียว (เก็บ hash) — ดู §4.5
- [ ] **จัดการ seed `Staff Test`** (`staff@syntropic.local` รหัส `staff` — รหัสที่รู้กันทั้งโลก = ช่องโหว่): เอาออกจาก production seed หรือบังคับตั้งรหัส; ใส่เข้า checklist "DEV-only ลบก่อน build" ใน CLAUDE.md

### Phase 1 — auth backend — ✅ DONE 2026-06-05
- [ ] **schema:** เพิ่ม 3 คอลัมน์ใน `users` (CREATE TABLE `schema.ts:9-18` + migration array ~`:695`):
  - `recovery_code_hash TEXT` — hash ของ recovery code (§4.5 ชั้น1)
  - `failed_attempts INTEGER NOT NULL DEFAULT 0` — นับ lockout (§5)
  - `locked_until TEXT` — timestamp ปลดล็อก (null = ไม่ล็อก); **เป็นการหน่วงเวลา ไม่ใช่ล็อกถาวร** (audit S-1)
  - ~~`must_change_password`~~ **ถอดออกจาก slice แรก** (มติ 2026-06-05 audit B-3 — test data, fresh install ผ่าน SetupWizard Phase 0 พอ, ไม่เพิ่มงาน; ดู §0.6)
- [ ] `electron/auth/hash.ts` — `hashSecret(plain)`→`scrypt$16384$8$1$<salt>$<hash>`; `verifySecret(plain, stored)` (ไม่มี prefix `scrypt$` = legacy → เทียบตรง → คืน flag ให้ caller upgrade); `genRecoveryCode()` (base32 `XXXX-XXXX-XXXX`)
- [ ] `electron/auth/lockout.ts` — `recordFailure`/`clearFailures`/`checkLocked` ใช้คอลัมน์ `failed_attempts`+`locked_until` (อยู่รอด restart); เกิน 5 → **หน่วงเวลา** (`locked_until = now + backoff`, ปลดเองเมื่อพ้นเวลา — กัน admin คนเดียวล็อกตัวเองถาวร, audit S-1)
- [ ] `electron/ipc/auth.ts` ใหม่: `listLoginUsers` (SELECT **id,name,role** WHERE is_disabled=0 — **ไม่คืน email**, audit N-1), `login(userId, password)` (checkLocked → verify + legacy upgrade hash + clearFailures + คืน safe fields | fail → recordFailure → throw); ลบ `getCurrentUser`
- [ ] `people.saveStaff` — hash ก่อนเก็บ (INSERT+UPDATE) + **allow-list คอลัมน์** (`['name','email','role','is_disabled']`, ห้าม `Object.keys` ดิบ); **password เป็น conditional** — UPDATE เฉพาะเมื่อ renderer ส่งค่ามา (ไม่ส่ง = ไม่แตะรหัสเดิม, audit S-3); ห้ามรับ hash สำเร็จรูปจาก renderer. **role-check ของผู้เรียกเลื่อนไป Phase 3** (เฟส 1 ยังไม่มี main-side session — ดู §0.6 BL-1; staff escalation ยังเปิดอยู่ในเฟส 1 = หนี้ที่ยอมรับช่วง test)
- [ ] **ลบ role `pharmacist`** ออกจาก `People/index.tsx:648` (`ROLES`) ให้เหลือ `admin`/`staff` ตรงโมเดล 2-role (มติ 2026-06-05, audit S-4)
- [ ] preload `window.api.auth.*` (แทน `auth.getCurrentUser` ด้วย `listLoginUsers`+`login`) + `docs/claude/ipc-api.md`

### Phase 2 — Session + Login UI (ดู `Login_UI_Design.md`) — ✅ DONE 2026-06-05
- [ ] `userStore`: `login()/logout()/lock()` ใน-หน่วยความจำ — **ตัด `persist` ทิ้ง**, เลิก hardcode hydrate
- [ ] `src/pages/Auth/LoginScreen.tsx` (เลือกชื่อ + ช่อง password + ลิงก์ "ลืมรหัสผ่าน")
- [ ] flow กู้รหัส: หน้าใส่ recovery code → ตั้ง password ใหม่ + หน้า vendor reset (โชว์ machine code, รับ token) — §4.5
- [ ] `LoginGate` ใน `App.tsx`
- [ ] ปุ่มผู้ใช้/ล็อก/สลับ/ออก ใน `TitleBar.tsx`

### Phase 2.5 — recovery backend — 🟡 recovery-code DONE 2026-06-05; vendor reset BLOCKED
- [x] hash/verify recovery code (scrypt) + regenerate หลังใช้ — `auth:resetAdminPassword`, counter แยก (`recovery_failed_attempts`/`recovery_locked_until`)
- [ ] verify vendor reset token (Ed25519 + fingerprint + expiry) — **BLOCKED:** `electron/license/*` ยังไม่มี (License infra ไม่เริ่ม) → LoginScreen มีลิงก์ "ติดต่อผู้ขาย" placeholder
- [x] `auth:resetAdminPassword` (ผ่าน recovery code) — vendor-token path รอ License infra

### Phase 3 — Permissions + cleanup — ✅ DONE 2026-06-05
> main-side session (`electron/auth/session.ts`, BL-1) ทำแล้ว = prerequisite ที่ปลดล็อก role-check ทุกตัว. Policy เจ้าของล็อก 2026-06-05: ดู PROGRESS.md / `.claude/memory/ipc-role-enforcement.md`. (admin-only+override: voidSale/updatePrice/stock-lot/cancel; ซ่อนสนิท: finance/expenses/settings-writes/staff-CRUD/backup; DeadStock cost-strip ฝั่ง main)
- [x] helper `usePermission()` (UX) + **enforce role ใน IPC ด้วย `requireAdmin(e,override?)`** (R1) — gate ครบทุก sensitive handler
- [x] Dialog manager-override — inline credential verify ฝั่ง main (R2), `src/components/ui/manager-override-dialog.tsx` + `src/hooks/useManagerOverride.tsx`
- [ ] ~~ลบปุ่ม DEV สลับ role `Finance.tsx`~~ **ตัดทิ้ง — ไม่มี `Finance.tsx` แล้ว** (audit §0.5#3)
- [ ] เพิ่ม seed plaintext passwords เข้า checklist "DEV-only ลบก่อน build" ใน CLAUDE.md (audit N4)
- [ ] (ออปชัน) auto-lock — Q4

---

## 6.5 Vertical slice แรก (wizard 2026-06-05) — login ใช้ได้จริง end-to-end

**Slice แรก = Phase 0 + 1 + 2 เต็ม** (ทำเรียงลำดับ implementable):

1. schema — เพิ่ม 4 คอลัมน์ users (CREATE TABLE + migration array)
2. `electron/auth/hash.ts` — `hashSecret`/`verifySecret` (legacy fallback)/`genRecoveryCode`
3. `electron/auth/lockout.ts` — `recordFailure`/`clearFailures`/`checkLocked`
4. `electron/ipc/auth.ts` — `listLoginUsers` + `login` (เขียนใหม่ ลบ `getCurrentUser`)
5. `people.ts:saveStaff` — allow-list + hash
6. `preload.ts` — แก้ `auth` namespace
7. `userStore.ts` — ตัด `persist` + `login/logout/lock`
8. `src/pages/Auth/LoginScreen.tsx` — UI (เลือกผู้ใช้ → password → shake error → lockout) ตาม `Login_UI_Design.md`
9. `src/App.tsx` — `LoginGate` ครอบ `<HashRouter>` **หลัง** `SetupGate`; ลบ `hydrate()` mount call
10. `src/components/layout/TitleBar.tsx` — ปุ่ม `InitialAvatar`+ชื่อ + Popover (ล็อก/สลับ/ออก). **render เฉพาะเมื่อ `current` ไม่ null** (TitleBar mount นอก LoginGate ด้วยที่ `SetupWizard.tsx:138` + หน้า Login → guard กัน crash, audit B-1); อ่าน `useUserStore(s=>s.current)` ห้ามเรียก `getCurrentUserId()`
11. Phase 0 — `SetupWizard.tsx` step ตั้ง password admin + `completeSetup` hash + โชว์ recovery code

**กันไว้เฟสถัดไป (บันทึกเป็นหนี้ ห้ามลืม):**
- **Phase 2.5 recovery backend** — vendor reset ผูก License infra ที่**ยังไม่เริ่มทำเลย** (ไม่มี `electron/license/*`/Ed25519 keys) → block อยู่แล้ว. Slice แรกทำแค่ลิงก์ "ลืมรหัสผ่าน" ใน UI, backend ทีหลัง
- **Phase 3 permissions (IPC role enforcement)** — งานใหญ่แยก ต้องไล่ทุก sensitive IPC; ไม่ block การ login แต่ **invariant R1 ยังไม่ครบจนกว่าจะทำ** (renderer role = UX เท่านั้น ของจริงยัง enforce ไม่ครบ)

> เหตุผลที่ slice แรก**ต้องรวม Phase 0**: ถ้าข้าม จะ login ได้แค่ด้วย seed `admin`/`admin` ตลอด = ช่องโหว่ที่ plan เตือน. Phase 0 คือทางที่เจ้าของตั้ง password จริง + ได้ recovery code

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
- **LoginGate render ก่อนทุก route ที่เรียก `getCurrentUserId()`** (B2). *(ไม่มี re-verify session ตอน boot แล้ว — no-persist → `current` เริ่ม null เสมอ → ไป Login, ไม่มี stale session ให้ตรวจ; ดู §4.1, audit SF-1)*
- **`people.saveStaff` ต้อง allow-list คอลัมน์** (R4, ตาม CLAUDE.md database rule)
- **ห้าม `npm install` ปกติ** — `crypto` built-in เท่านั้น
- attribution เดิมชี้ `users.id` — อย่าเปลี่ยน semantics
- UI: ไทย, components/ui เท่านั้น, dialog/button convention, ไม่มี emoji
- LoginGate หลัง SetupGate หลัง LicenseGate
