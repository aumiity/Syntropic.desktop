---
name: feedback_integer_qty_inputs
description: ช่องกรอก "จำนวน" ทุกจุด (รับเข้า/ขาย/ปรับสต็อก/แก้ล็อต) ต้องเป็นจำนวนเต็มผ่าน toIntegerInput()
metadata:
  type: feedback
---

**DONE 2026-06-25 (tsc PASS; click-test pending)** — เจ้าของสั่ง "จำนวนต้องเป็นจำนวนเต็ม เต็มทุกที่" (เลือกจาก 3 ตัวเลือก: เต็มทุกที่ / เฉพาะ POS ขาย / ไม่กรอง).

**Why:** จำนวนที่ staff กรอกตอนรับเข้า/ขาย/ปรับสต็อก = ของนับได้เป็นชิ้น (เม็ด/แผง/ขวด/กล่อง) → จำนวนเต็มเสมอ. การเป็นทศนิยม (เช่น 1.5) ดูแปลกและทำให้ FEFO เหลือเศษ float ค้าง (ล็อตค้างเปิดที่ 0.0001, เศษผีจาก 0.1+0.2 เทียบ `remaining<=0` ไม่มี epsilon).

**How to apply:**
- helper SSOT = `toIntegerInput(raw)` ใน `src/lib/utils.ts` — ตัดคอมมา + เก็บส่วนจำนวนเต็มก่อนจุด (`"5.5"→"5"`, `"1,234"→"1234"`); **คงค่าว่าง `''`** ไม่ coerce → 0 (กฎ stock/cost field). validation gate ยังเป็นหน้าที่ caller.
- ช่องกรอกจำนวน **ใหม่ทุกจุด** ต้องห่อ onChange ด้วย `toIntegerInput()` + ใส่ `step={1}` บน `type="number"`.
- จุดที่ใส่แล้ว: AddProductWizard (qty step 2), `qty-dialog.tsx` (POS cart/คืน/นับพิมพ์), AdjustStockDialog (จำนวนหลังปรับ), LotsTab (qty_on_hand), EditProduct+EditBundle GeneralTab (default_qty), Purchase/index import paste.
- **ห้ามแตะ (ทศนิยมโดยตั้งใจ):** `qty_per_base` (UnitsTab step 0.0001 ตัวแปลงหน่วย), `dose_qty` (ฉลากยา), ราคาทุนทุกช่อง.
- DB ยังเป็น REAL ทุกคอลัมน์ qty — **ไม่ทำ migration** (กรองที่ UI พอ). backend ไม่ throw integer-guard เพราะ `qtyBase = qty × qty_per_base` อาจเป็นทศนิยมโดยชอบ (รับหน่วยใหญ่ × ตัวแปลงทศนิยม). ดู [[project_gr_unit_conversion]].
- POS multiplier (`5*`) และ Bundle component qty กันทศนิยมอยู่ก่อนแล้ว (parseInt/Math.round).
