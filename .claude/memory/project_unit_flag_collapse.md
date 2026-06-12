---
name: project_unit_flag_collapse
description: หน่วยซื้อ/ขายยุบเหลือธงเดียว (is_for_sale) — is_for_purchase กลายเป็น dead column รอ DROP ตอน schema cleanup ก่อนปล่อยโปรแกรม
metadata:
  type: project
---

**DONE 2026-06-12 (tsc PASS, in-app verify pending)** — ยุบโมเดลหน่วยซื้อ/ขายของ `product_units` จากสองธงเหลือธงเดียว

## ปัญหาที่เจอ
หน้ารับสินค้า (GR) ดึงหน่วยจาก `pos:searchProducts` → `enrichProduct()` ซึ่งกรอง `is_for_sale = 1` อย่างเดียว → หน่วยที่ตั้งเป็น "ซื้ออย่างเดียว" (`is_for_purchase=1, is_for_sale=0`) เช่นกล่องใหญ่ **หายไปจากจอรับสินค้า** ทั้งที่ธง `is_for_purchase` ควรเป็นตัวคุมจอนั้น (incident: "3 DIAMOND สำลีก้าน" มีแต่ ห่อ ทั้งที่ตั้ง แพ็ค/กล่อง)

## มติ (เจ้าของเลือก)
สองธงเกินจำเป็น — เก็บแค่ `is_for_sale` (คุมการโผล่ในจอขาย POS, มีประโยชน์จริงคือซ่อนกล่องใหญ่จากจอขาย), ทิ้งแนวคิด `is_for_purchase`. **จอรับสินค้าโชว์ทุกหน่วยที่ `is_disabled = 0`** (หน่วยอะไรก็รับเข้าได้) → ตอนตั้งหน่วยถามคำถามเดียว "หน่วยนี้ขายที่ POS ไหม"

## ที่แก้ไปแล้ว
- `electron/ipc/pos.ts` `enrichProduct` — เพิ่ม `prod.purchase_units` = ทุกหน่วย `is_disabled=0` (ไม่อิง flag ใด ๆ); `prod.units` (กรอง is_for_sale) คงเดิมสำหรับ POS ไม่แตะ
- `src/pages/Purchase/AddProductWizard.tsx` (`pickProduct`) + `src/pages/Purchase/index.tsx` (`selectProduct`, `buildRowFromProduct`) — อ่าน `p.purchase_units ?? p.units ?? []` + เพิ่ม type `purchase_units?`
- `src/pages/Products/EditProduct/UnitsTab.tsx` — ลบสวิตช์ "ใช้หน่วยนี้ในการซื้อ" + คอลัมน์ตาราง "ซื้อ" (header + base row cell + unit row cell) เหลือ "ขาย" ช่องเดียว; openAddUnit default `is_for_purchase: 1`

## ตามด้วย: search modal หน้ารับสินค้าโชว์แยกหน่วย (2026-06-12)
อาการต่อเนื่อง: ผู้ใช้ดูที่ **หน้าต่างค้นหา** แล้วเห็นสินค้าแถวเดียว หน่วย = ฐาน (ห่อ) อย่างเดียว → งงว่าหน่วยใหญ่อยู่ไหน (จริง ๆ เลือกได้ที่ชิปขั้นที่ 1 หลังกดเลือก). แก้ให้ `AddProductWizard.tsx` flatten ผลค้นหาเป็น **แถวต่อหน่วย** เหมือน POS (`SearchItem={product,unit|null}`, ฐานขึ้นก่อนแล้วตามด้วย variants) — กดแถว กล่อง/แพค = pre-select หน่วยนั้นเข้า wizard เลย; คอลัมน์คงเหลือแปลงตามหน่วย (900 ห่อ=75 กล่อง); `matched_unit_id`→`initialIdx` pre-highlight แถวที่สแกนบาร์โค้ดตรง (mirror POS, base ยังขึ้นก่อน). `pickProduct(p, picked)` รับหน่วยที่เลือก. อ้างอิง invariant docs/claude/pos.md (base first, keyboard-owned highlight).

## ⚠️ DEAD COLUMN รอลบ — ทำตอน schema cleanup ก่อนปล่อยโปรแกรมดาวน์โหลด
`product_units.is_for_purchase` **ไม่มีใครอ่านแล้ว** แต่ยังคงไว้ใน schema + ยังเขียนผ่าน IPC payload (`products.ts` addUnit INSERT มี `@is_for_purchase`, `updateUnit` allow-list, UnitsTab ยังส่ง `is_for_purchase:1`) เพื่อเลี่ยง migration ทันที. **ตอน schema cleanup ก่อน build production ให้:**
1. `ALTER TABLE product_units DROP COLUMN is_for_purchase`
2. ถอดออกจาก `electron/ipc/products.ts` addUnit INSERT (บรรทัด ~860) + updateUnit allow-list
3. ถอด `is_for_purchase` ออกจาก `src/types/index.ts` (ProductUnit) + UnitsTab (openAddUnit default, openEditUnit read, save payload ×2)
4. คอมเมนต์ NOTE/DEAD COLUMN ที่ฝังไว้ใน schema.ts/pos.ts/UnitsTab.tsx เป็นจุดอ้างอิงครบแล้ว (grep `DEAD COLUMN`)
