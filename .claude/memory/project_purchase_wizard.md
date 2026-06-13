---
name: project_purchase_wizard
description: Purchase receive (GR) entry switched from inline-table rows to a step-wizard dialog
metadata:
  type: project
---

**UI refine DONE 2026-06-12 (Playwright e2e 7/7 PASS)** / **feature ACTIVE 2026-06-10 (tsc PASS, in-app verify pending)** — หน้า `src/pages/Purchase/index.tsx` เปลี่ยนวิธีกรอกรายการรับสินค้า จาก "พิมพ์ทีละแถวในตาราง" → **Step Wizard (Timeline แนวตั้ง)** ตามที่เจ้าของเลือก (เทียบ mock 2 คอนเซปต์ใน `docs/purchase-step-wizard-mockup.html`; เลือก Timeline).

- **Component ใหม่:** `src/pages/Purchase/AddProductWizard.tsx` — self-contained, 4 step (เลือกสินค้า+หน่วย → Lot/วันหมดอายุ(+วันผลิต) → จำนวน/ต้นทุน(+ส่วนลด) → ราคาขาย/กำไร+ยืนยัน), คืน `ReceiptRow` ผ่าน `onConfirm`. **ย้าย type `ReceiptRow`/`ProductUnitOption` + `emptyRow` มาไว้ที่ไฟล์นี้แล้ว export** ให้ index import (กัน circular: wizard ไม่ import index). DialogContent ล็อกความสูง `h-[600px]` (ตาม invariant 5a).
- **ตาราง** กลายเป็น read-only: คลิกแถว/ปุ่ม Pencil = เปิด wizard โหมดแก้ไข, ปุ่มถังขยะ = `deleteRow` (ไม่มี min-row guard, ตารางว่างได้). `rows` เริ่มต้นเป็น `[]` (เดิม `[emptyRow()]`). Empty state มีปุ่ม "เพิ่มสินค้าเข้าใบรับ".
- **เก็บไว้เหมือนเดิม:** paste import (`นำเข้าข้อมูล`), ปรับยอดท้ายบิล, sidebar/payment/VAT/note, `handleSave` (payload + FEFO + lot logic **ไม่แตะ**). เอาออก: ปุ่มเพิ่มแถว + Settings popover (toggle วันผลิต/ส่วนลด).
- **โค้ดเดิมที่ยังค้าง (dead, harmless):** unit-picker modal + helper เดิม (selectProduct/updateLineMath/handleProductSearch ฯลฯ) ยังอยู่ใน index.tsx แต่ไม่ถูกเรียก (`noUnusedLocals:false` จึงไม่พัง) — ลบทีหลังได้. (price quick-edit modal ใน index.tsx ถูกลบแล้วใน 2026-06-13 เพราะ dead code — มี per-row modal สร้างไว้แต่ไม่เคยมี trigger)
- **GR price-edit Phase 1 DONE 2026-06-13 (tsc PASS, e2e 6/6 PASS):** step 4 ของ wizard ให้แก้ราคาขาย base unit ได้โดยตรง ผ่าน `products:updatePrice` (admin-gated, บันทึก price_logs) — **เดิม** ตัด feature นี้ออก (v1); ตอนนี้คืนกลับมาอย่างถูกต้องแล้ว ดู [[project_gr_price_edit]] สำหรับ invariants ทั้งหมด
- **Backup ไฟล์เดิม (row-mode):** `src/pages/Purchase/index.rowmode.bak.tsx` (เจ้าของสั่งเก็บ; ลบได้เมื่อมั่นใจ).

**Input-height convention ใน wizard (non-obvious):** ใน wizard dialog ที่มี layout ซับซ้อน กฎ `h-9` ของ bar-control ใช้กับ *bar ระดับตาราง* ไม่ใช่ field ใน dialog content — ใน AddProductWizard ใช้ `h-10` สำหรับ input ทั่วไปและ `h-12 text-xl` สำหรับตัวเลขเด่น (qty/cost/price); `DateInput` ต้องส่ง `className="h-10"` ชัด ๆ เพราะ wrapper default = h-9 (ค่า h-9 baked ใน date-input.tsx ที่ระดับ modifier ทับ className ธรรมดา).

**⚠️ Doc staleness (follow-up pending):** `docs/claude/ui-theming.md` บรรทัด 141 ยังระบุ DateInput default = `h-10`/`bg-input` ซึ่ง stale — จริงคือ `h-9`/elevated (date-input.tsx:66). ยังไม่ได้แก้ doc ในงานนี้ — แก้ตอน next touch `docs/claude/ui-theming.md`.

**Search dialog parity decision 2026-06-12 (INTENTIONAL — อย่า revert):** `ProductSearchDialog` ใน AddProductWizard ปรับ layout เป็น 4 คอลัมน์แบบ POS grid `1fr 100px 120px 100px` (ชื่อสินค้า | หน่วย | ราคาทุน | คงเหลือ) ตามคำสั่งเจ้าของ (Playwright e2e 7/7 PASS). สิ่งที่เปลี่ยน vs commit a3f71cb:
- **ราคาทุน** = `last_cost_price` (ไม่ใช่ราคาขายแบบ POS); `ProductSuggestion` เพิ่ม field `last_cost_price?` (ได้มาจาก `SELECT p.*` ของ `pos:searchProducts` ที่มีอยู่แล้ว)
- **คงเหลือ** = stock ฐานดิบ ไม่แปลงตามหน่วย (ยกเลิก `stockInUnit = baseStock/qpb` ของเดิม)
- **หน่วย** = ชื่อ plain muted แบบ POS (ยกเลิกการแสดง `×qpb` และตัวหนาหน่วยที่ไม่ใช่ฐาน)
- badge "หมด" คงไว้; **ClockAlert (เตือนหมดอายุ) ตัดออก** — ต่างจาก POS โดยเจตนา (GR ไม่ต้องการ urgency indicator)
- **rows ยังเป็น per-unit เหมือนเดิม** (`flatItems` แตกแถวต่อหน่วย base row first + variants ไม่เปลี่ยน) — เฉพาะ "การแสดงผล" stock/หน่วย เปลี่ยน ไม่ใช่โครงสร้างข้อมูล

⚠️ ถ้ารอบหน้าเห็น search modal ไม่แสดง ×qpb / ไม่แปลงหน่วย อย่าเข้าใจผิดว่าเป็น regression แล้วเติมกลับ — เป็นการตัดสินใจของเจ้าของ 2026-06-12.

เกี่ยวข้อง: [[project_next_systems_backlog]] (drug-label UX redo ใช้แนวทางคล้ายกัน), [[feedback_read_doc_before_ui_edit]].
