# แผนระบบ User & Login — Syntropic Desktop

> สถานะ: **DRAFT / รอยืนยัน decision points** — เขียน 2026-06-04
> ขอบเขต: ระบบเข้าสู่ระบบ (login) + การจัดการผู้ใช้/พนักงาน + สิทธิ์ (roles) ของแอป POS ร้านยา

---

## 0. สรุปสั้น (TL;DR)

**ความเข้าใจผิดที่ต้องเคลียร์ก่อน:** เราไม่ได้มี "สองระบบ user" ที่ต้องแยกกัน

- "ระบบ user ภายในร้าน" ที่มีอยู่ตอนนี้ = **ตาราง `users` + หน้า People → StaffTab** (เพิ่ม/แก้/ปิดพนักงาน)
- "ระบบ login" ที่กำลังจะทำ = **การยืนยันตัวตน (authenticate) กับตาราง `users` ตัวเดิมนั้นเอง**

→ **พนักงานในร้าน 1 คน = บัญชี login 1 บัญชี** มันคือ entity เดียวกัน คนละมุมมอง:
- *StaffTab* = มุมมอง "ผู้ดูแลจัดการบัญชี" (เจ้าของร้านสร้าง/แก้/ปิดบัญชีพนักงาน)
- *Login screen* = มุมมอง "พนักงานพิสูจน์ว่าตัวเองเป็นใคร" ตอนเริ่มใช้งาน

**ไม่ต้องสร้างตารางหรือระบบที่สอง** การแยกเป็นสองระบบ (เช่น "บัญชีเครื่อง/เจ้าของ" แยกจาก "ทะเบียนพนักงาน") เพิ่มความซับซ้อนโดยไม่ได้ประโยชน์สำหรับร้านเดี่ยว — ปฏิเสธแนวทางนั้น เหตุผลเต็มในข้อ 2

สิ่งที่ต้องสร้างเพิ่มจริง ๆ มีแค่ 4 อย่าง:
1. **Login gate** หน้าจอเข้าสู่ระบบ (คั่นหลัง SetupGate ก่อนเข้าแอป)
2. **การ hash รหัสผ่าน** (ตอนนี้เก็บ plaintext — ต้องแก้)
3. **Session + การสลับผู้ใช้/ล็อกหน้าจอ** แทน `getCurrentUser` ที่ hardcode อยู่
4. **Permission gate** ตาม role สำหรับงาน sensitive (เงิน/รายงาน/ตั้งค่า/ยกเลิกบิล)

---

## 1. สถานะปัจจุบัน (ของจริงในโค้ด)

| ส่วน | ไฟล์ | สภาพปัจจุบัน |
|------|------|--------------|
| ตาราง users | `electron/db/schema.ts:9` | `id, name, email (unique), password TEXT (plaintext!), role default 'staff', is_disabled, timestamps` |
| Auth IPC | `electron/ipc/auth.ts` | `auth:getCurrentUser` **hardcode** คืน `staff@syntropic.local` เสมอ — ไม่มี login จริง |
| จัดการพนักงาน | `electron/ipc/people.ts:120` (`listStaff/saveStaff/setStaffStatus`) + `src/pages/People/index.tsx:578` (`StaffTab`) | CRUD ครบ: ชื่อ/email/password/role/ปิดใช้งาน |
| Session (renderer) | `src/stores/userStore.ts` | `useUserStore` + `getCurrentUserId()`; hydrate จาก `getCurrentUser` ตอน boot, persist ลง localStorage |
| Attribution | ทั่วแอป (POS, Purchase, Quotation, AdjustStock, Expiry, LotsTab, TaxInvoice) | ใช้ `getCurrentUserId()` ใส่ `sold_by / created_by / issued_by / user_id` = audit trail |
| Role gate | `src/pages/Reports/{Finance,Dashboard,Sales,Purchases}.tsx` | `role === 'admin'` = `isOwner` เห็นข้อมูลมากกว่า; **ปุ่ม DEV สลับ role** ใน `Finance.tsx:114` รอลบ |
| Seed | `electron/db/seed.ts:12,50` | Admin (`admin@syntropic.local`/`admin`/admin) + Staff Test (`staff@syntropic.local`/`staff`/staff) |
| App gate | `src/App.tsx:50` `SetupGate` | gate แค่ first-run setup wizard — **ยังไม่มี login gate** |

**ข้อจำกัดสำคัญ:**
- ห้าม `npm install` ปกติ (พัง prebuilt ของ better-sqlite3) → **ใช้ Node `crypto` (built-in `scrypt`) ทำ hashing ไม่ต้องลง bcrypt** ไม่ต้อง rebuild native module เลย
- ภาษา UI ไทยทั้งหมด, ใช้ component จาก `src/components/ui/` เท่านั้น, ตาม dialog/button convention ใน CLAUDE.md

---

## 2. โมเดลแนวคิด — ทำไม "ตารางเดียว, แยกด้วย role"

### แนวทางที่เลือก ✅ — Unified users + role
- ตาราง `users` เดียวเป็นทั้งบัญชี login และทะเบียนพนักงาน
- แยกบทบาทด้วยคอลัมน์ `role`
- StaffTab = ที่จัดการบัญชีเหล่านี้ (เจ้าของร้านทำ), Login = ที่ยืนยันตัวตน

**ข้อดี:** ตรงกับโครงสร้างที่มีอยู่แล้ว (ไม่ต้อง migrate ตาราง), attribution (`sold_by` ฯลฯ) ชี้ไป `users.id` อยู่แล้ว, ผู้ใช้เข้าใจง่าย — "คนที่ล็อกอินได้ = พนักงานในระบบ"

### แนวทางที่ปฏิเสธ ❌ — สองระบบแยก
เช่น แยก "บัญชีเจ้าของ/อุปกรณ์ (device account)" ออกจาก "ทะเบียนพนักงาน (HR log)"
**เหตุผลที่ปฏิเสธ:** ร้านยาเดี่ยว 1–5 คน ไม่ได้ต้องการ identity provider สองชั้น; การมีพนักงานที่ "บันทึกชื่อได้แต่ล็อกอินไม่ได้" สร้าง edge case (ใครรับผิดชอบบิล?) โดยไม่มีประโยชน์; FlowAccount (ระบบบัญชีคลาวด์ที่จะ integrate ภายหลัง) จัดการ identity ฝั่งเอกสารภาษีเอง ไม่ต้องให้แอปทำ identity ซ้อน

### Roles ที่ใช้ (เริ่ม 2 พอ)
| role | ใคร | เห็น/ทำอะไร |
|------|-----|-------------|
| `admin` | เจ้าของร้าน / เภสัชกร | ทุกอย่าง: Reports/Finance, ต้นทุน, ตั้งค่า, จัดการพนักงาน, ยกเลิกบิล, ปรับสต็อก |
| `staff` | ผู้ช่วย / แคชเชียร์ | POS ขายของ, ดูสินค้า/สต็อก, รับเข้า; **ไม่เห็น** เงิน/กำไร/รายงานการเงิน, **แก้ไม่ได้** ตั้งค่า/พนักงาน, ยกเลิกบิลต้องขอ override |

> เผื่ออนาคต: `manager` (กลางระหว่างสองอันนี้) — ออกแบบ role เป็น string เปิดทางไว้ แต่**ยังไม่สร้างตอนนี้** อย่า over-engineer permission matrix ก่อนมีความต้องการจริง

---

## 3. กลไกยืนยันตัวตน — PIN เป็นหลัก (รอยืนยัน)

บริบทร้านยา: แคชเชียร์ต้องสลับกันเร็วช่วงลูกค้าเยอะ, เครื่องเดียวที่เคาน์เตอร์ การพิมพ์ email+password ทุกครั้งคือ friction

**ข้อเสนอ:**
- **PIN 4–6 หลัก ต่อผู้ใช้** เป็น credential หลัก (เลือกจากรายชื่อ → กด PIN → เข้า) เร็ว เหมาะ POS
- เก็บ PIN แบบ **hash** (เหมือน password) ไม่เก็บ plaintext
- (ออปชัน) `admin` อาจตั้งรหัสผ่านที่ยาวกว่าได้ แต่ default flow คือ PIN ทุก role เพื่อความสม่ำเสมอ
- field `password` เดิมในตาราง **ใช้เก็บค่า hash นี้ได้เลย** (ไม่ต้องเพิ่มคอลัมน์ ถ้าไม่อยากแยก) — หรือเพิ่ม `pin_hash` แยกถ้าต้องการให้ password (เว็บ/คลาวด์ภายหลัง) กับ PIN (หน้าร้าน) อยู่คนละช่อง → **decision Q3**

> **ทางเลือกอื่น:** email + password เต็มรูปแบบ — ปลอดภัยกว่าเล็กน้อยแต่ช้า ไม่เหมาะจังหวะหน้าร้าน หากร้านมีคนเดียวและไม่สลับ อาจเลือกอันนี้ก็ได้ → ดู Q1

---

## 4. Flow ที่เสนอ

### 4.1 ตอนเปิดแอป (boot)
```
SetupGate (first-run wizard)  ──ผ่าน──▶  LoginGate  ──auth ผ่าน──▶  แอป (Router)
                                              │
                                   ┌──────────┴───────────┐
                                   │ เลือกผู้ใช้ (avatar/ชื่อ) │
                                   │ ใส่ PIN                │
                                   │ ปุ่ม "เข้าสู่ระบบ"        │
                                   └──────────────────────┘
```
- `LoginGate` เป็น wrapper คล้าย `SetupGate` ครอบ `<HashRouter>` ใน `App.tsx`
- ถ้ายังไม่มี session ที่ใช้ได้ → แสดงหน้า Login เต็มจอ (frameless, ตาม TitleBar เดิม)
- auth สำเร็จ → set `userStore.current` → เข้าแอป

### 4.2 ระหว่างใช้งาน — สลับผู้ใช้ / ล็อกหน้าจอ
- ปุ่ม "ผู้ใช้ปัจจุบัน / ล็อก" ที่ **TitleBar** (`src/components/layout/TitleBar.tsx`) แสดงชื่อคนที่ล็อกอินอยู่
- กด → เมนู: **ล็อกหน้าจอ** (กลับหน้า Login โดยไม่ปิดแอป) / **สลับผู้ใช้** / **ออกจากระบบ**
- (ออปชัน) **auto-lock** หลังไม่มีการใช้งาน N นาที → กลับหน้า Login อัตโนมัติ (ป้องกันคนอื่นมาขายในชื่อเรา) → Q4

### 4.3 งาน sensitive — Manager override (ไม่ต้อง logout)
เมื่อ `staff` พยายามทำงานที่ต้องสิทธิ์ admin (ยกเลิกบิล, เปิด Finance, ปรับสต็อกใหญ่, แก้ตั้งค่า):
- แทนที่จะ "เข้าไม่ได้" เฉย ๆ → เด้ง dialog **"ขอสิทธิ์ผู้ดูแล"** ให้ admin มากด PIN รับรองตรงนั้น
- ถ้า PIN admin ถูก → อนุญาตทำรายการครั้งนั้น (บันทึกว่าใครเป็นคน override ใน audit ได้ถ้าต้องการ)
- ลด friction: เจ้าของไม่ต้อง logout/login พนักงานทุกครั้ง

### 4.4 Attribution ยังทำงานเหมือนเดิม
- `getCurrentUserId()` คืน `userStore.current.id` ของคนที่ล็อกอินจริง (ไม่ใช่ hardcode แล้ว)
- บิล/ใบรับเข้า/ใบกำกับ บันทึกชื่อคนที่ล็อกอิน ณ ตอนนั้นอัตโนมัติ — โค้ดที่เรียก `getCurrentUserId()` ทั้งหมด**ไม่ต้องแก้**

---

## 5. ความปลอดภัย — Hashing (ต้องแก้ก่อนใช้จริง)

ตอนนี้ `password` เก็บ **plaintext** (`'admin'`, `'staff'`) — ยอมรับไม่ได้สำหรับ production

- ใช้ **Node `crypto.scryptSync`** (built-in, ไม่ต้องลง dependency, ไม่ rebuild native)
- รูปแบบเก็บ: `scrypt$<salt_hex>$<hash_hex>` ใน `password` (หรือ `pin_hash`)
- ฟังก์ชันกลางใน main process: `hashSecret(plain)` / `verifySecret(plain, stored)`
- **Legacy fallback:** ถ้าค่าใน DB ไม่มี prefix `scrypt$` (= ของเดิม plaintext) → เทียบตรง ๆ ครั้งเดียว แล้ว**อัปเกรดเป็น hash ทันที**ที่ login สำเร็จ → seed เก่าไม่พัง, ค่อย ๆ ย้ายเอง
- `auth:getCurrentUser` (hardcode) → **เลิกใช้/ลบ**, แทนด้วย `auth:login(userId, pin)` + `auth:listLoginUsers()` (คืนเฉพาะ id/name/role/avatar ของ user ที่ไม่ disabled — **ไม่ส่ง hash ออก renderer เด็ดขาด**)
- `people.saveStaff` (`people.ts:127`) ปัจจุบัน insert password ดิบ → ต้อง hash ก่อนเก็บ

---

## 6. งานที่ต้องทำ (แยกเป็น Phase)

### Phase 1 — แกน auth (backend)
- [ ] เพิ่ม `electron/auth/hash.ts`: `hashSecret` / `verifySecret` (scrypt) + legacy plaintext fallback
- [ ] เขียน `electron/ipc/auth.ts` ใหม่:
  - `auth:listLoginUsers` → รายชื่อ user ที่ล็อกอินได้ (ไม่มี hash)
  - `auth:login(userId, pin)` → verify, อัปเกรด hash ถ้า legacy, คืน `{id,name,email,role}` หรือ error
  - ลบ `auth:getCurrentUser` (hardcode)
- [ ] `people.saveStaff` / seed: hash ก่อนเก็บ; ตัดสินใจ `password` vs เพิ่ม `pin_hash` (Q3 — ถ้าเพิ่ม ต้องมี migration ใน schema.ts)
- [ ] อัปเดต preload (`window.api.auth.*`) + `docs/claude/ipc-api.md`

### Phase 2 — Session + Login UI
- [ ] `userStore`: เพิ่ม `login()`, `logout()`, `lock()`; ตัด auto-hydrate hardcode; persist session อย่างปลอดภัย (เก็บแค่ id/name/role — re-verify ตอน boot ถ้าต้องการ)
- [ ] หน้า `src/pages/Auth/LoginScreen.tsx`: เลือกผู้ใช้ + PIN pad (ใช้ components/ui ทั้งหมด, ตาม /theme)
- [ ] `LoginGate` wrapper ใน `App.tsx` (คั่นหลัง SetupGate)
- [ ] ปุ่มผู้ใช้/ล็อก/สลับ/ออก ใน `TitleBar.tsx`

### Phase 3 — Permissions + ทำความสะอาด
- [ ] รวม role check เป็น helper เดียว (`useUserStore` / `usePermission('reports.finance')`) แทน `role === 'admin'` กระจาย 4+ ที่
- [ ] Dialog "ขอสิทธิ์ผู้ดูแล" (manager override) สำหรับงาน sensitive
- [ ] **ลบปุ่ม DEV สลับ role** ใน `Finance.tsx:114,230` (และ comment "ลบเมื่อทำ login เสร็จ")
- [ ] กำหนด permission ของ POS void / AdjustStock / Settings / People-StaffTab
- [ ] (ออปชัน) auto-lock timer — Q4

### Phase 4 — ขัดเงา (ทำเมื่อต้องการ)
- [ ] บังคับเปลี่ยน PIN ครั้งแรก / รีเซ็ต PIN โดย admin
- [ ] avatar/สีประจำตัวผู้ใช้บนหน้า Login
- [ ] บันทึก login/logout/override ลง audit (ถ้ามีตาราง activity)

---

## 7. Decision points — ต้องยืนยันก่อนลงมือ

- **Q1 — credential:** PIN (เร็ว, เหมาะหน้าร้าน, *แนะนำ*) หรือ email+password เต็ม? หรือ PIN สำหรับ staff + password สำหรับ admin?
- **Q2 — กี่ role:** เริ่ม `admin` + `staff` พอไหม หรืออยากมี `manager` ตั้งแต่แรก?
- **Q3 — เก็บที่ไหน:** ใช้คอลัมน์ `password` เดิมเก็บ hash ของ PIN เลย หรือเพิ่ม `pin_hash` แยก (เผื่อ password คลาวด์/FlowAccount ภายหลัง)?
- **Q4 — auto-lock:** ต้องการล็อกอัตโนมัติเมื่อไม่ใช้งานไหม? ถ้าใช่ กี่นาที?
- **Q5 — sensitive ops:** ใช้ "manager override (admin กด PIN รับรอง)" หรือ "ห้ามทำเด็ดขาดถ้าไม่ใช่ admin"? (แนะนำ override — ยืดหยุ่นกว่า)
- **Q6 — persist session:** ปิดแอปแล้วเปิดใหม่ ต้องล็อกอินใหม่เสมอ หรือจำ session ไว้ (เหมาะเครื่องส่วนตัวที่เคาน์เตอร์)?

---

## 8. หลักการที่ต้องระวัง (invariants)
- **ห้ามส่ง password/hash ออกไป renderer** — `listLoginUsers` คืนเฉพาะ id/name/role
- **ห้าม `npm install` ปกติ** — ใช้ `crypto` built-in เท่านั้น ไม่ลง bcrypt
- attribution เดิม (`sold_by/created_by/issued_by`) ชี้ `users.id` — อย่าเปลี่ยน semantics
- UI ตาม CLAUDE.md: ไทยทั้งหมด, components/ui เท่านั้น, dialog/button convention, ไม่มี emoji
- LoginGate ต้องอยู่ **หลัง** SetupGate (ตั้งค่าร้านก่อน แล้วค่อยล็อกอิน)
