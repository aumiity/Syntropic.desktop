# แผนระบบ License & Activation — "ขายโปรแกรม" (ชั้น A)

> สถานะ: **DESIGN / รอเริ่มทำ** — เขียน 2026-06-04
> ขอบเขต: กลไกขาย/ป้องกัน/เปิดสิทธิ์ใช้งานโปรแกรมต่อร้าน — ชั้นนอกสุดของแอป
> เกี่ยวข้อง: `docs/plans/User_Login_System.md` (ชั้น C — login พนักงาน คนละเรื่อง)

---

## 0. โมเดลที่เลือก

**Online activation ครั้งเดียว → signed token ผูกเครื่อง → ตรวจในเครื่องทุกครั้ง (offline) → re-check เงียบ ๆ เป็นช่วง พร้อม grace ยาว**

หลักการเดียวที่ทำให้ POS ออฟไลน์ได้จริง:

> **การตรวจ license = "ตรวจลายเซ็นในเครื่อง" ไม่ใช่ "ถามเซิร์ฟเวอร์"**
> แอปไม่เคยรอเน็ตเพื่อจะขายของ การโทรหา server เป็นงานเบื้องหลังนาน ๆ ที (ต่ออายุ/เพิกถอน) ที่ **ล่มได้โดยไม่กระทบการขาย**

เริ่มจาก **ออกไฟล์ license เซ็นเองส่งลูกค้า** (infra ศูนย์บาท) แล้วค่อยอัปเกรดเป็น activation portal / subscription ด้วย token โครงสร้างเดียวกัน — ไม่ต้องรื้อ

---

## 1. ตำแหน่งในสถาปัตยกรรม

```
LicenseGate (ชั้น A) ──valid──▶ SetupGate (ชั้น B) ──done──▶ LoginGate (ชั้น C) ──auth──▶ แอป
     │
     ตรวจ token ในเครื่อง (offline). invalid/หมดอายุ → หน้า Activation
```

- **LicenseGate = wrapper นอกสุดใน `App.tsx`** ครอบ `SetupGate` อีกที (license มาก่อน setup เสมอ — ยังไม่จ่าย ก็ตั้งค่าร้านไม่ได้)
- ใช้ pattern เดียวกับ `SetupGate` (`App.tsx:50`): state `loading | activation | ready`

---

## 2. License token — โครงสร้างและ crypto

### Crypto
- **เซ็นด้วย Ed25519 ผ่าน Node `crypto` (built-in)** — ไม่ต้องลง dependency, ไม่ rebuild native (ตรงข้อห้าม `npm install` ของ better-sqlite3)
- **พี่ (ผู้ขาย) ถือ private key** เก็บออฟไลน์ (ไม่อยู่ใน repo, ไม่อยู่ในแอป)
- **แอปฝัง public key** ไว้ตรวจลายเซ็นเท่านั้น — แกะแล้วปลอม token ไม่ได้

### โครงสร้าง token (payload + signature)
```jsonc
{
  "v": 1,                         // schema version
  "shop": "ร้านยาตัวอย่าง",        // ชื่อร้าน (โชว์ในแอป + กันแชร์)
  "license_id": "SYN-2026-000123",// รหัสใบอนุญาต (พี่ออก)
  "edition": "standard",          // เผื่อมี edition ต่างราคา
  "machine": "<fingerprint hash>",// ผูกเครื่อง (ดูข้อ 3)
  "issued_at": "2026-06-04",
  "expires_at": null,             // null = ขายขาด · มีวันที่ = subscription
  "grace_days": 14                // ผ่อนผันหลังหมดอายุ/ติดต่อ server ไม่ได้
}
```
- เก็บเป็น `base64(payload).base64(signature)` ในไฟล์/ตาราง (ข้อ 4)
- ตรวจ 3 ชั้นทุกครั้งที่เปิดแอป: **(a) ลายเซ็นถูก → (b) machine ตรงเครื่องนี้ → (c) ยังไม่หมดอายุ (รวม grace)**

---

## 3. Machine fingerprint (ผูกเครื่อง)

- รวม stable hardware ids: **machine GUID + disk serial + hostname** → `sha256` → เก็บใน token เป็น `machine`
- **อย่าผูกแน่นเกินไป** — ใช้ "ตรงอย่างน้อย 2 ใน 3 สัญญาณ" ก็พอ ป้องกันลูกค้าอัป RAM/เปลี่ยน SSD แล้ว license พังกะทันหัน (เคสจริงที่ทำให้ลูกค้าโกรธ)
- macOS / Windows ดึง id คนละทาง → helper แยก platform ใน main process
- มีอยู่แล้วบางส่วน: `machines.json` auto-detect ด้วย `os.hostname()` (ดู memory `project_studio_architecture`) — ใช้ hostname เป็นหนึ่งในสัญญาณได้

---

## 4. เก็บ token ที่ไหน

- เก็บใน **ไฟล์แยกใน userData** (`app.getPath('userData')/license.dat`) — ไม่ใช่ใน sqlite หลัก เพื่อให้ backup/restore ฐานข้อมูลไม่พา license ข้ามเครื่องโดยไม่ตั้งใจ
- **ห้ามส่ง token/payload ดิบออก renderer** — main process ตรวจแล้วคืนแค่ `{ valid, shop, edition, expires_at, daysLeft, state }`
- ตาราง/setting เสริม (ออปชัน): บันทึก `last_validated_at` ไว้คำนวณ grace ตอนออฟไลน์

---

## 5. สถานะ license (state machine)

| state | เงื่อนไข | แอปทำอะไร |
|-------|---------|-----------|
| `active` | ลายเซ็นถูก + เครื่องตรง + ยังไม่หมด | ใช้งานปกติ |
| `grace` | หมดอายุ/ติด server ไม่ได้ แต่ยังในช่วง grace | ใช้งานได้ + **แบนเนอร์เตือนนุ่ม ๆ** ("license จะหมดใน N วัน ต่ออายุ") |
| `expired` | เลย grace แล้ว | **ล็อกเข้าหน้า Activation** — แต่ข้อมูลทั้งหมดยังอยู่ครบ ต่ออายุแล้วใช้ต่อทันที |
| `invalid` | ลายเซ็นผิด / เครื่องไม่ตรง / ไม่มีไฟล์ | หน้า Activation (ใส่ key) |

**หลักเหล็ก:** expired/invalid **ห้ามลบหรือทำลายข้อมูลร้าน** — แค่ gate การเข้าใช้ ลูกค้าจ่ายแล้วกลับมาใช้ต่อได้เลย (ไม่งั้นกลายเป็น ransomware รู้สึก)

---

## 6. Flow การ activate

### 6.1 เฟสแรก — ออกไฟล์เอง (infra ศูนย์บาท)
1. ลูกค้าซื้อ → พี่รัน CLI เล็ก ๆ ของพี่เอง (เครื่องพี่): ใส่ชื่อร้าน + machine fingerprint (ลูกค้าส่งให้/พี่กรอกตอนติดตั้ง) → เซ็นด้วย private key → ได้ไฟล์ `license.dat` หรือสตริง key
2. ส่งให้ลูกค้าทางไลน์/อีเมล หรือพี่วางเองตอนไปติดตั้ง
3. หน้า Activation ในแอป: ลูกค้าวางสตริง/เลือกไฟล์ → แอปตรวจลายเซ็น → ผ่าน → เข้าแอป

> เครื่องมือฝั่งพี่: สคริปต์ Node สั้น ๆ แยกนอก repo แอป (มี private key) — **ห้าม commit private key เข้า repo เด็ดขาด**

### 6.2 เฟสสอง — activation online อัตโนมัติ (เมื่อลูกค้าเยอะ)
- มี endpoint เล็ก ๆ (serverless ก็พอ): แอปส่ง `license_id + fingerprint` → server เซ็น token ส่งกลับ
- ต่ออายุ subscription: แอป re-check ทุก ~30 วันตอนมีเน็ต ได้ token ใหม่ ยืด `expires_at`
- ทั้งหมดนี้ token โครงสร้างเดิม — เปลี่ยนแค่ "ใครเซ็น" จากมือเป็น server

---

## 7. งานที่ต้องทำ (Phase)

### Phase 1 — แกน verify (offline, ใช้ไฟล์ที่ออกเอง)
- [ ] `electron/license/keys.ts` — ฝัง public key
- [ ] `electron/license/verify.ts` — ตรวจลายเซ็น Ed25519 + parse payload + คำนวณ state/grace
- [ ] `electron/license/fingerprint.ts` — machine fingerprint (per-platform, 2-of-3 tolerance)
- [ ] `electron/license/store.ts` — อ่าน/เขียน `license.dat` ใน userData
- [ ] `electron/ipc/license.ts` — `license:getStatus`, `license:activate(keyString)`; คืนเฉพาะ field ปลอดภัย
- [ ] preload `window.api.license.*` + เอกสาร `docs/claude/ipc-api.md`
- [ ] **เครื่องมือฝั่งผู้ขาย** (นอก repo): สคริปต์เซ็น license + วิธีเก็บ private key

### Phase 2 — UI gate (ดู design plan แยก)
- [ ] `LicenseGate` ใน `App.tsx` (นอก SetupGate)
- [ ] หน้า Activation (ใส่ key / เลือกไฟล์) — ออกแบบใน `docs/plans/Login_UI_Design.md` หรือไฟล์ activation UI แยก
- [ ] แบนเนอร์ state `grace` (เตือนนุ่ม ๆ) — ใช้ Badge/แถบ token `warning`

### Phase 3 — online + subscription (เลื่อนได้)
- [ ] license endpoint (serverless) + re-check เป็นช่วง + grace offline
- [ ] หน้าต่ออายุ / สถานะ license ใน Settings
- [ ] (ถ้าจะทำ) revocation list

---

## 8. Decision points — ต้องยืนยัน

- **L1 — ขอบเขต license:** ผูก **ต่อเครื่อง** หรือ **ต่อร้าน** (เผื่อร้านมีหลายเครื่อง — POS + หลังร้าน)? เริ่มต่อเครื่องง่ายสุด
- **L2 — โมเดลเงิน:** เริ่ม **ขายขาด** (`expires_at: null`) ก่อน แล้วเปิดทาง subscription ทีหลัง — ยืนยันไหม?
- **L3 — เฟสแรกออก key:** รับได้ไหมที่เริ่มแบบ "พี่ออกไฟล์เซ็นเองส่งลูกค้า" ก่อนมี server?
- **L4 — grace กี่วัน:** เริ่ม 14 วันโอเคไหม?
- **L5 — ตอน expired:** ล็อกเฉย ๆ ข้อมูลอยู่ครบ (แนะนำ) — ยืนยัน

---

## 9. หลักการที่ต้องระวัง (invariants)
- **Private key ห้ามเข้า repo / ห้ามเข้าแอป** — แอปมีแค่ public key
- **ห้าม `npm install` ปกติ** — ใช้ `crypto` built-in (Ed25519) เท่านั้น
- **expired/invalid ห้ามลบข้อมูลร้าน** — แค่ gate ทางเข้า
- **การขายต้องไม่ขึ้นกับเน็ต** — verify เป็น local signature check เสมอ; online เป็น background
- **fingerprint อย่าผูกแน่น** — tolerance 2-of-3 กันฮาร์ดแวร์เปลี่ยนเล็กน้อย
- license (ชั้น A) แยกขาดจาก login พนักงาน (ชั้น C) — คนละ gate คนละไฟล์ อย่าปน
```