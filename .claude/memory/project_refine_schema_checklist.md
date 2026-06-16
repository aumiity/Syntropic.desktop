---
name: project_refine_schema_checklist
description: SSOT รายการ DEAD COLUMN/dead schema ที่ต้องลบทีเดียวก่อน build = docs/refine_schema.md; เจอ dead เพิ่มให้จดต่อท้ายที่นั่น
metadata:
  type: project
---

**ACTIVE 2026-06-12** — checklist กลางสำหรับ schema cleanup ก่อนปล่อยโปรแกรม = **`docs/refine_schema.md`**

## กฏ (ทำตามทุกครั้งที่เจอ dead schema)
- เจอ **DEAD COLUMN / DEAD TABLE / dead field** ระหว่างพัฒนา → **อย่าลบทันที** (เลี่ยง migration กลางคัน) ให้ไปจดต่อท้าย `docs/refine_schema.md` พร้อมขั้นตอนลบครบทุกจุด
- ฝังคอมเมนต์ `DEAD COLUMN` ที่จุดนิยามในโค้ดด้วย → `grep -rn "DEAD COLUMN" electron/ src/` เจอครบ
- **ลบจริงทีเดียว** ตอน schema cleanup รอบสุดท้ายเท่านั้น ทำคู่กับ checklist "Before a production build" ใน CLAUDE.md (อันนั้น DEV code, อันนี้ schema/dead data)

## รายการค้างปัจจุบัน (ดูรายละเอียด+ขั้นตอนในไฟล์)
1. `product_units.is_for_purchase` — งานยุบหน่วยซื้อ/ขาย [[project_unit_flag_collapse]]
2. `receipt_settings.abbrev_tax_invoice` — งานใบเสร็จ per-section [[project_receipt_sections]] (โหมดใบกำกับย่อตัดสินจาก total_vat>0 แล้ว)
3. `products.is_hidden` (2026-06-16) — dead flag ติดจาก PHP เดิม ไม่มี query กรองเลย, `is_disabled` ครอบคลุมแล้ว (เหมือน `customers.is_hidden` ที่ DROP ไปแล้ว); UI toggle+badge ถอดออกแล้ว เหลือ DROP คอลัมน์+form plumbing
