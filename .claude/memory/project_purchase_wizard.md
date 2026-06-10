---
name: project_purchase_wizard
description: Purchase receive (GR) entry switched from inline-table rows to a step-wizard dialog
metadata:
  type: project
---

**ACTIVE 2026-06-10 (tsc PASS, in-app verify pending)** — หน้า `src/pages/Purchase/index.tsx` เปลี่ยนวิธีกรอกรายการรับสินค้า จาก "พิมพ์ทีละแถวในตาราง" → **Step Wizard (Timeline แนวตั้ง)** ตามที่เจ้าของเลือก (เทียบ mock 2 คอนเซปต์ใน `docs/purchase-step-wizard-mockup.html`; เลือก Timeline).

- **Component ใหม่:** `src/pages/Purchase/AddProductWizard.tsx` — self-contained, 4 step (เลือกสินค้า+หน่วย → Lot/วันหมดอายุ(+วันผลิต) → จำนวน/ต้นทุน(+ส่วนลด) → ราคาขาย/กำไร+ยืนยัน), คืน `ReceiptRow` ผ่าน `onConfirm`. **ย้าย type `ReceiptRow`/`ProductUnitOption` + `emptyRow` มาไว้ที่ไฟล์นี้แล้ว export** ให้ index import (กัน circular: wizard ไม่ import index). DialogContent ล็อกความสูง `h-[600px]` (ตาม invariant 5a).
- **ตาราง** กลายเป็น read-only: คลิกแถว/ปุ่ม Pencil = เปิด wizard โหมดแก้ไข, ปุ่มถังขยะ = `deleteRow` (ไม่มี min-row guard, ตารางว่างได้). `rows` เริ่มต้นเป็น `[]` (เดิม `[emptyRow()]`). Empty state มีปุ่ม "เพิ่มสินค้าเข้าใบรับ".
- **เก็บไว้เหมือนเดิม:** paste import (`นำเข้าข้อมูล`), ปรับยอดท้ายบิล, sidebar/payment/VAT/note, `handleSave` (payload + FEFO + lot logic **ไม่แตะ**). เอาออก: ปุ่มเพิ่มแถว + Settings popover (toggle วันผลิต/ส่วนลด).
- **โค้ดเดิมที่ยังค้าง (dead, harmless):** unit-picker modal + price quick-edit modal + helper เดิม (selectProduct/updateLineMath/handleProductSearch ฯลฯ) ยังอยู่ใน index.tsx แต่ไม่ถูกเรียก (`noUnusedLocals:false` จึงไม่พัง) — ลบทีหลังได้.
- **⚠️ การตัดสินใจ v1 (non-obvious):** step ราคาขายใน wizard ตั้งแค่ `row.default_sell_price` (= sell_price ของบิลรับนี้) เท่านั้น — **ตัดการ push ราคาใหม่เข้า product master ผ่าน `products.updatePrice` + manager-override + price history ออก** (ของเดิม price modal ทำให้) เพื่อลดความซับซ้อน/nested modal. ถ้าต้องการคืน feature นี้ = ใส่ `useManagerOverride` ใน wizard ตอน confirm เมื่อราคาเปลี่ยน.
- **Backup ไฟล์เดิม (row-mode):** `src/pages/Purchase/index.rowmode.bak.tsx` (เจ้าของสั่งเก็บ; ลบได้เมื่อมั่นใจ).

เกี่ยวข้อง: [[project_next_systems_backlog]] (drug-label UX redo ใช้แนวทางคล้ายกัน), [[feedback_read_doc_before_ui_edit]].
