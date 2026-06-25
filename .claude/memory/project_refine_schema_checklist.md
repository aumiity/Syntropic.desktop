---
name: project_refine_schema_checklist
description: SSOT รายการ DEAD COLUMN/dead schema ที่ต้องลบทีเดียวก่อน build = docs/refine_schema.md; เจอ dead เพิ่มให้จดต่อท้ายที่นั่น
metadata:
  type: project
---

**เคลียร์รอบที่ 1 DONE 2026-06-25 (tsc PASS เฉพาะงานนี้)** — checklist กลางสำหรับ schema cleanup ก่อนปล่อยโปรแกรม = **`docs/refine_schema.md`**

> ทั้ง 6 รายการค้างลบ/เปลี่ยนชื่อออกจาก schema CREATE + IPC + types + UI + seed แล้ว. เจ้าของสั่ง **ไม่ทำ migration** (จะลบ DB ทิ้ง → CREATE block สร้างใหม่ตรง ๆ; ลบ `ALTER … ADD COLUMN paper_size` เก่าทิ้งด้วย). Carve-outs ที่ตั้งใจไม่แตะ: PrintTab/presets A4/A5 ภายใน (force 'A4' อยู่แล้ว ไม่ break), `scripts/import-hygeia.mjs`+`gen-products.py` (manual dev script — ⚠️ ถ้ารื้อ Hygeia import กลับมาต้องแก้ก่อน). รายละเอียดเต็ม + ขั้นตอนเดิม = `docs/refine_schema.md` หัวข้อ "เคลียร์รอบที่ 1".

## กฏ (ทำตามทุกครั้งที่เจอ dead schema)
- เจอ **DEAD COLUMN / DEAD TABLE / dead field** ระหว่างพัฒนา → **อย่าลบทันที** (เลี่ยง migration กลางคัน) ให้ไปจดต่อท้าย `docs/refine_schema.md` พร้อมขั้นตอนลบครบทุกจุด
- ฝังคอมเมนต์ `DEAD COLUMN` ที่จุดนิยามในโค้ดด้วย → `grep -rn "DEAD COLUMN" electron/ src/` เจอครบ
- **ลบจริงทีเดียว** ตอน schema cleanup รอบสุดท้ายเท่านั้น ทำคู่กับ checklist "Before a production build" ใน CLAUDE.md (อันนั้น DEV code, อันนี้ schema/dead data)

## รายการค้างปัจจุบัน (ดูรายละเอียด+ขั้นตอนในไฟล์)
1. `product_units.is_for_purchase` — งานยุบหน่วยซื้อ/ขาย [[project_unit_flag_collapse]]
2. `receipt_settings.abbrev_tax_invoice` — งานใบเสร็จ per-section [[project_receipt_sections]] (โหมดใบกำกับย่อตัดสินจาก total_vat>0 แล้ว)
3. `products.is_hidden` (2026-06-16) — dead flag ติดจาก PHP เดิม ไม่มี query กรองเลย, `is_disabled` ครอบคลุมแล้ว (เหมือน `customers.is_hidden` ที่ DROP ไปแล้ว); UI toggle+badge ถอดออกแล้ว เหลือ DROP คอลัมน์+form plumbing
4. `env_settings` 6 threshold columns (2026-06-20) — ลบ EnvironmentTab แล้วฝังเกณฑ์ GPP เป็น const SSOT `src/lib/env/thresholds.ts`; คอลัมน์ threshold ตาย แต่ **ตาราง env_settings ห้ามลบ** (zone flags ยังใช้) [[project_env_temp_humidity_log]]
