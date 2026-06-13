# GR Wizard — แก้ราคาทุกหน่วย + อุดรอย price_logs + แจ้งเตือนทุนเปลี่ยน

วันที่: 2026-06-13
สถานะ: APPROVED (design) — รอเขียนแผน implementation
ขอบเขต: หน้ารับสินค้า (Purchase / GR) — `src/pages/Purchase/`, `electron/ipc/purchase.ts`, `electron/ipc/products.ts`, `electron/ipc/auth.ts`

---

## 1. ที่มา / ปัญหา

การตั้ง "ราคาขาย" ตอนรับสินค้ามีรอยรั่วเรื่อง audit trail และพฤติกรรมไม่สม่ำเสมอ:

- **รอยรั่วตัวจริง:** `electron/ipc/purchase.ts` (บรรทัด 229–230) ตอน `purchase.save` รัน
  `UPDATE products SET price_retail = ?` **เสมอ ทุกครั้ง ไม่ log และไม่ผ่าน admin gate** →
  ราคาขายจริงของสินค้าถูกเขียนทับเงียบ ๆ โดยไม่มีประวัติใน `price_logs`
- **ทางที่ถูกกลับกำพร้า:** ในหน้า GR มี modal ปรับราคาต่อแถว (`openPriceModal` / `savePriceModal` /
  `closePriceModal` + JSX ~บรรทัด 1117) ที่เรียก `products:updatePrice` ผ่าน `useManagerOverride`
  → **log price_logs + admin gate ครบ** แต่ `openPriceModal` **ไม่ถูกปุ่มไหนเรียกเลย** = dead code
- **ทางเข้าหลายทาง:** row ในตาราง GR มาได้จาก (ก) AddProductWizard และ (ข) CSV paste-import
  (`handleImport`, คอลัมน์ key/qty/lot/mfg/exp/total/cost — **ไม่มีราคาขาย**). row จาก CSV เปิดแก้ผ่าน
  wizard ได้ (คลิกแถว → `openEditWizard`) → การแก้ราคา "ใน wizard" จึงครอบคลุมทั้งสองทางอยู่แล้ว

## 2. ข้อมูลโครงสร้างที่เกี่ยวข้อง (ปัจจุบัน)

- ราคาขายหน่วยฐาน → `products.price_retail / price_wholesale1 / price_wholesale2`
- ราคาขายหน่วยอื่น → `product_units.price_retail / price_wholesale1 / price_wholesale2` (ต่อหน่วย; มี `id`, `qty_per_base`)
- ประวัติราคา → `price_logs (product_id, price_type['retail'|'wholesale1'|'wholesale2'], old_price, new_price, note, created_at)`
  — **ไม่มี dimension ระดับหน่วย** (ไม่มี product_unit_id)
- `products:updatePrice(productId, {price_type, new_price, note}, override)` — มีอยู่แล้ว: เขียน
  `products.<col>` + INSERT `price_logs` + `requireAdmin(e, override)`
- `useManagerOverride()` (`src/hooks/useManagerOverride.tsx`): admin → รัน action ทันที (override=undefined);
  พนักงาน → เด้ง `ManagerOverrideDialog` ขอ credential แล้ว verify ฝั่ง server ตอนยิง IPC จริง
  (requireAdmin). **ไม่ stash credential** — หนึ่ง `run` = หนึ่ง prompt = หนึ่ง action
- **ไม่มี** IPC `auth:verifyAdmin` (auth.ts มีแค่ login/logout/getMyProfile/changePassword/resetAdminPassword)

## 3. ความต้องการที่ยืนยันแล้ว

| # | ความต้องการ |
|---|---|
| R1 | แก้ราคา **ใน wizard** เป็นหลัก (ครอบคลุมทั้ง row จาก wizard และ CSV เพราะ CSV เปิดแก้ผ่าน wizard ได้) ไม่ทำ modal แยกที่ตาราง |
| R2 | เพิ่ม **แจ้งเตือนทุนเปลี่ยน** ใน wizard → ผู้ใช้เห็นว่าต้นทุนต่างจากเดิม แล้วตัดสินใจแก้ราคาเอง |
| R3 | แก้ราคาใน wizard ได้ **ทุกหน่วย** (ฐาน + กล่อง/แพ็ค) **รวมราคาส่ง ws1/ws2** |
| R4 | **admin เท่านั้น** แก้ราคาได้; พนักงาน → ช่องล็อก + ปุ่มขอรหัส admin (สิทธิ์ละเอียดทำทีหลัง) |
| R5 | `price_logs` เก็บ **เฉพาะหน่วยฐาน** เหมือนเดิม; หน่วยอื่นไม่ต้องเก็บประวัติ → **ไม่แตะ schema** |
| R6 | อุดรอย: `purchase.save` ต้องเลิกเขียนทับ `price_retail` แบบเงียบ ๆ |

## 4. การตัดสินใจ (decisions)

- **D1 — จังหวะเขียนราคา:** เขียนลง DB **ทันทีตอนยืนยัน row** (กด "ยืนยัน" ใน step 4) ผ่าน
  `updatePrice`/`updateUnitPrice`. ราคาหลักเปลี่ยนทันทีแม้ยังไม่กดบันทึกทั้งใบรับ
  (ตรงกับ pattern modal กำพร้าเดิม; แยกจากการบันทึกใบรับชัดเจน)
- **D2 — พนักงาน (ไม่ใช่ admin):** ช่องราคา **read-only** + ปุ่ม "ขอสิทธิ์แก้ราคา" →
  เด้ง ManagerOverrideDialog → ผ่าน `auth:verifyAdmin` แล้ว **ปลดล็อกช่อง + เก็บ override** ไว้
  แนบกับการเขียนราคาตอนยืนยัน row. รหัสผิด → เด้ง error ที่ dialog ทันที (ไม่ปล่อยไปพังตอนเขียน)

## 5. สถาปัตยกรรมที่จะทำ

### 5.1 Backend (`electron/ipc/`)

| รหัส | ไฟล์ | งาน | log | gate |
|---|---|---|---|---|
| B1 | `purchase.ts` | **ลบ** `UPDATE products SET price_retail` (บรรทัด 229–230). lot.sell_price ยังเขียนได้ตามเดิม (record ของล็อต) | — | — |
| B2 | `products.ts` | ใช้ `products:updatePrice` เดิม (หน่วยฐาน retail/ws1/ws2) | price_logs | admin |
| B3 | `products.ts` | **เพิ่ม** `products:updateUnitPrice(productUnitId, { price_retail?, price_wholesale1?, price_wholesale2? }, override)` — UPDATE `product_units` ตาม id, `requireAdmin(e, override)`, **ไม่ INSERT price_logs** | — | admin |
| B4 | `auth.ts` | **เพิ่ม** `auth:verifyAdmin(override)` — เรียก `requireAdmin(e, override)` แล้ว return `{ ok: true }` (เช็คสิทธิ์ตอนปลดล็อก) | — | admin |

หมายเหตุ B3: ต้องเพิ่ม method ใน preload (`window.api.products.updateUnitPrice`) + type. ป้องกัน allow-list:
อัปเดตเฉพาะคอลัมน์ราคา 3 ตัว ห้าม spread payload ดิบ (กฎ HARD ของ products:update)

### 5.2 Frontend — Wizard step 4 (`src/pages/Purchase/AddProductWizard.tsx`)

รื้อ step 4 จาก "ช่องราคาขายเดียว" เป็น "ราคาขาย ทุกหน่วย":

1. **แบนเนอร์แจ้งเตือนทุน (R2):** ถ้าทุน/หน่วยที่กรอก (`cost`) ≠ ทุนเดิม (`last_cost_price`, ดึงจาก
   `window.api.products.get` ตอนเลือกสินค้า) → โชว์ "ทุนเปลี่ยน X → Y · ทบทวนราคาขาย" + ตารางเทียบ
   เก่า/ใหม่ (ราคา/ทุน/กำไร/กำไร%) — เก็บเกี่ยว layout จาก modal กำพร้าเดิม (index.tsx ~บรรทัด 1164–1218)
2. **ตัวแก้ราคาทุกหน่วย (R3):** ตาราง แถว = หน่วย (ฐานก่อน แล้วตามด้วย variants จาก `row.units`) ×
   คอลัมน์ ราคาปลีก / ราคาส่ง1 / ราคาส่ง2; โชว์กำไร% เทียบทุนของหน่วยนั้น
3. **Admin gate (R4 / D2):** ใช้ `useManagerOverride` + state `priceUnlocked` + `grantedOverride`
   - admin (`isAdmin`) → ช่องแก้ได้เลย, `grantedOverride = undefined`
   - พนักงาน → ช่อง read-only + ปุ่ม "ขอสิทธิ์แก้ราคา"; กด → `run(async (ov) => { await window.api.auth.verifyAdmin(ov); setGrantedOverride(ov); setPriceUnlocked(true) }, { title:'ขอสิทธิ์แก้ราคา' })`
4. **เขียนตอนยืนยัน row (D1):** กด "ยืนยัน" → เทียบราคาที่แก้กับราคาปัจจุบันของแต่ละหน่วย; เฉพาะหน่วย/ช่องที่
   เปลี่ยน → ยิง `updatePrice`(หน่วยฐาน, ต่อ price_type) / `updateUnitPrice`(หน่วยอื่น) แนบ `grantedOverride`
   แล้วจึง `onConfirm(row)`. ถ้าไม่มีราคาเปลี่ยน → confirm row ตรง ๆ

หมายเหตุ: ราคาที่แก้ที่ระดับ "หน่วยฐาน" ผ่าน `updatePrice` จะ log อัตโนมัติ (รวม ws1/ws2 ของฐาน) =
ครอบคลุม R5; หน่วยอื่นไม่ log

### 5.3 Cleanup

รื้อ dead code modal กำพร้าใน `src/pages/Purchase/index.tsx`:
`openPriceModal` / `savePriceModal` / `closePriceModal` + JSX modal (~1117–) + state ที่เกี่ยว
(`priceModalIdx`, `priceDraft`, `priceNote`, `priceSaving`, `priceHistory`, `prevCost`, `overridePrice`
— เท่าที่ไม่ได้ใช้ที่อื่น). ระวัง: ตรวจ reference ก่อนลบทุกตัว

## 6. การแบ่งเฟส

### เฟส 1 — อุดรอย + แจ้งเตือนทุน + admin gate (หน่วยฐาน)
- B1 (ลบรอยรั่ว), B2 (ใช้ updatePrice เดิม), B4 (`auth:verifyAdmin`)
- Wizard step 4: แบนเนอร์แจ้งเตือนทุน + ตารางเทียบ + ช่องราคาปลีกหน่วยฐาน (โครงเดิมช่องเดียวไปก่อน)
  + admin lock/unlock (D2) + เขียนทันทีตอนยืนยัน (D1, เรียก updatePrice หน่วยฐาน)
- Cleanup dead modal
- **ผลลัพธ์:** รอยรั่วถูกอุด, มีฟีเจอร์แจ้งเตือนทุน, มี admin gate, ประวัติหน่วยฐานครบ — ใช้งานได้จริง

### เฟส 2 — ทุกหน่วย + ราคาส่ง (R3)
- B3 (`products:updateUnitPrice` + preload + type)
- Wizard step 4: เปลี่ยนช่องเดียว → ตารางทุกหน่วย × (ปลีก/ส่ง1/ส่ง2); เขียนตอนยืนยันยิง
  updatePrice(ฐาน, ทั้ง 3 price_type ที่เปลี่ยน) + updateUnitPrice(หน่วยอื่น)
- **ผลลัพธ์:** ครบ R3 — แก้ได้ทุกหน่วยทุกราคา

## 7. Edge cases / ข้อควรระวัง

- **ทุน baseline:** ใช้ `last_cost_price` (ทุนล่าสุดที่จ่ายจริง) เป็นตัวเทียบ "ทุนเปลี่ยน" — อย่า fallback ไป
  weighted-avg `cost_price` (ของฟรี = 0 ต้องคง 0). ดึงตอนเลือกสินค้าใน wizard (มี `window.api.products.get`)
- **แก้ row ซ้ำ:** เปิด wizard แก้ row เดิม → baseline ราคาในจอเป็นราคาที่เพิ่งตั้ง แต่ DB เทียบราคาจริงเสมอ
  (updatePrice อ่าน current ใน DB) → ประวัติที่ log ถูกต้องเสมอ; ตัวเลขโชว์อาจต่างเล็กน้อย (ยอมรับได้)
- **เขียนทันที + ยกเลิกใบรับ:** ราคาเปลี่ยนทันทีตอนยืนยัน row แม้ภายหลังลบ row/ยกเลิกใบรับ ราคายังเปลี่ยน
  (พฤติกรรมตั้งใจตาม D1; การแก้ราคา = action แยกจากบันทึกใบรับ)
- **lot.sell_price:** `purchase.save` ยังเขียน `product_lots.sell_price = item.sell_price` ได้ (record
  ระดับล็อต) — แค่เลิกเขียนทับ `products.price_retail` เท่านั้น (B1)
- **allow-list:** `updateUnitPrice` ต้อง UPDATE เฉพาะ 3 คอลัมน์ราคา ห้าม build dynamic SQL จาก payload ดิบ
- **หน่วยที่รับเข้า ≠ หน่วยขาย:** wizard `row.units` มาจาก purchase_units (หน่วยรับเข้า). ตัวแก้ราคาควรอิง
  หน่วยที่ขายได้ (`is_for_sale`); ตรวจสอบ list ที่ใช้ใน step 4 ให้เป็นหน่วยขาย (ไม่ใช่หน่วยรับเข้าล้วน) —
  ยืนยันรายละเอียดตอนทำเฟส 2

## 8. Acceptance criteria

**เฟส 1**
- [ ] `purchase.save` ไม่ UPDATE `products.price_retail` อีกต่อไป (grep ยืนยัน)
- [ ] บันทึกใบรับที่ไม่ได้แตะราคา → `price_retail` คงเดิม, ไม่มีแถว price_logs เพิ่ม
- [ ] แก้ราคาปลีกหน่วยฐานใน wizard (admin) → ราคาเปลี่ยน + มีแถว price_logs (note อ้างถึงการแก้)
- [ ] พนักงานเปิด step 4 → ช่องราคา read-only + ปุ่มขอรหัส; รหัสผิด → error ที่ dialog; รหัสถูก → ปลดล็อกแก้ได้
- [ ] ทุนกรอก ≠ last_cost_price → โชว์แบนเนอร์แจ้งเตือน + ตารางเทียบ
- [ ] dead code modal ในตารางถูกรื้อ, ไม่มี reference ค้าง, `tsc` ผ่าน

**เฟส 2**
- [ ] step 4 โชว์ทุกหน่วยขายได้ × (ปลีก/ส่ง1/ส่ง2) แก้ได้
- [ ] แก้ราคาหน่วยอื่น → `product_units` อัปเดต, **ไม่มี** price_logs เพิ่มสำหรับหน่วยนั้น
- [ ] แก้ราคาหน่วยฐาน (ทั้ง 3 price_type) → price_logs เพิ่มตาม price_type ที่เปลี่ยน
- [ ] admin gate ครอบคลุมทุกช่องราคา

## 9. ไฟล์ที่แตะ

- `electron/ipc/purchase.ts` (B1)
- `electron/ipc/products.ts` (B3) + `electron/preload.ts` + `src/types` (method/type)
- `electron/ipc/auth.ts` (B4) + preload
- `src/pages/Purchase/AddProductWizard.tsx` (step 4 รื้อใหม่)
- `src/pages/Purchase/index.tsx` (รื้อ dead modal + ส่ง prop ที่จำเป็นเข้า wizard เช่นทุนเดิม/หน่วยขาย)
- `docs/claude/business-logic.md` (อัปเดต: GR ไม่ตั้งราคาหลักแล้ว; ราคาหลักเป็นของ updatePrice/updateUnitPrice)
