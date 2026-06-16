# Refine Schema — รายการเก็บกวาดก่อน build โปรแกรม

> **SSOT ของงาน schema cleanup ก่อนปล่อยโปรแกรมดาวน์โหลด**
> ไฟล์นี้รวม **คอลัมน์/ตาราง/ฟิลด์ที่ตายแล้ว (DEAD)** ซึ่งยังคงไว้ในระบบชั่วคราวเพื่อเลี่ยง migration ระหว่างพัฒนา แล้วค่อยลบ **ทีเดียว** ตอนทำ schema cleanup รอบสุดท้าย

## กฏการใช้ไฟล์นี้ (สำคัญ)

1. **เจอ DEAD COLUMN / DEAD TABLE / dead field เพิ่ม → มาจดต่อท้ายในไฟล์นี้ทันที** (อย่าลบทันทีระหว่างพัฒนา — เลี่ยง migration กลางคัน)
2. เวลาจด ให้ฝังคอมเมนต์ `DEAD COLUMN` (หรือ `DEAD TABLE`) ไว้ที่จุดนิยามในโค้ดด้วย → `grep -rn "DEAD COLUMN" electron/ src/` ต้องเจอครบทุกจุด
3. **ลบจริงทีเดียว** ตอน schema cleanup ก่อน production build เท่านั้น — ไม่ลบทีละตัวระหว่างทาง
4. ลบแล้ว → ขีดออก/ย้ายไปหัวข้อ "ลบแล้ว" ด้านล่าง

> เกี่ยวข้องกับ checklist **"Before a production build — remove DEV-only code"** ใน `CLAUDE.md` (อันนั้น = DEV code, อันนี้ = schema/dead data) — ทำคู่กัน

---

## ค้างลบ (TODO)

### 1. `product_units.is_for_purchase`
- **ที่มา:** งานยุบหน่วยซื้อ/ขายเหลือธงเดียว (2026-06-12) — เก็บแค่ `is_for_sale` (คุมจอขาย POS), จอรับสินค้าโชว์ทุกหน่วยที่ `is_disabled=0` ผ่าน `enrichProduct.purchase_units` ไม่อิงธงนี้แล้ว
- **memory:** `.claude/memory/project_unit_flag_collapse.md`
- **ขั้นตอนลบ:**
  1. `electron/db/schema.ts` (~บรรทัด 148) — ลบคอลัมน์ `is_for_purchase` + คอมเมนต์ DEAD COLUMN; เพิ่ม `ALTER TABLE product_units DROP COLUMN is_for_purchase` (migration สำหรับ DB เก่า)
  2. `electron/ipc/products.ts` — addUnit `INSERT INTO product_units (... is_for_purchase ...)` (~860–861) ถอด column + `@is_for_purchase`; updateUnit allow-list ถอดออก
  3. `src/types/index.ts` (~56) — ถอด `is_for_purchase` จาก `ProductUnit`
  4. `src/pages/Products/EditProduct/UnitsTab.tsx` — ถอด `is_for_purchase` จาก openAddUnit default (~66), openEditUnit read (~83), save payload ทั้ง add/update (~102, ~115)

### 2. `receipt_settings.abbrev_tax_invoice`
- **ที่มา:** งานปรับใบเสร็จ per-section — โหมด "ใบกำกับภาษีอย่างย่อ" ตัดสินจาก `sale.total_vat > 0` ใน `src/lib/receipt/print.ts:71` แล้ว ไม่อ่าน setting ตัวนี้; ไม่มี toggle UI คุมมัน → เหลือแค่ค่าค้างในคอลัมน์
- **ขั้นตอนลบ:**
  1. `electron/db/schema.ts:569` — ลบคอลัมน์ `abbrev_tax_invoice`; เพิ่ม `ALTER TABLE receipt_settings DROP COLUMN abbrev_tax_invoice`
  2. `src/types/index.ts:168` — ถอด `abbrev_tax_invoice`
  3. `src/pages/Settings/ReceiptSettingsTab.tsx:39` — ถอดออกจาก default state object (สำคัญ: handler `settings:saveReceiptSettings` ใช้ dynamic `Object.keys(rest)` → ถ้าไม่ถอด หลัง DROP จะ throw `no such column`)

### 3. `products.is_hidden`
- **ที่มา:** ติดมาจากระบบ PHP/Hygeia เดิม (`IsHidden`) แนวคิดดั้งเดิมอยากแยก 2 ระดับ (ปิดใช้งาน vs ซ่อนจากค้นหา) แต่ **ไม่เคยมี query ไหนกรอง `products.is_hidden` เลย** (เช็คทั้ง electron/ipc + renderer แล้ว ไม่มีใน list/search/POS) — `is_disabled` ครอบคลุมทุกเคสจริง ตรงกับที่ `customers.is_hidden` เคยถูกยุบ→`is_disabled` แล้ว DROP ไปแล้ว (`schema.ts` customers migration). UI (toggle GeneralTab + badge หัวหน้า) ถอดออกแล้ว 2026-06-16
- **ขั้นตอนลบ:**
  1. `electron/db/schema.ts` (~บรรทัด 108) — ลบคอลัมน์ `is_hidden` + คอมเมนต์ DEAD COLUMN; เพิ่ม `ALTER TABLE products DROP COLUMN is_hidden`
  2. `src/pages/Products/EditProduct/index.tsx` — ถอด `is_hidden` จาก new-default (~124) + load (~171); ที่ create ถอดออกจาก destructure strip (~296-297) ได้เลย (**สำคัญ:** ต้องถอดจาก form state เพราะ update payload ส่งผ่าน `...rest` → `products:update` dynamic SQL จะ throw `no such column` หลัง DROP ถ้ายังหลงเหลือ)
  3. `src/types/index.ts:6` — ถอด `is_hidden` ออกจาก type `Product`
  4. (ตรวจซ้ำ) seed/import: `electron/db/seed.ts`, `scripts/import-hygeia.mjs`, `scripts/gen-products.py` ยังอ้าง `is_hidden` ใน INSERT — ถ้า DB เก่ายัง import อยู่ค่อยถอด ไม่งั้นถอดพร้อมกัน

---

## ลบแล้ว (DONE)

_(ยังไม่มี — เก็บไว้ลบทีเดียวตอน schema cleanup)_
