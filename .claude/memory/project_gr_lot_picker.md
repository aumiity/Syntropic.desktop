---
name: project_gr_lot_picker
description: GR wizard step-2 lot table = clickable picker (รับเข้าล็อตเดิม); GR merge จับคู่ (product_id, lot_number); แก้บั๊ก is_closed reopen ตอน merge
metadata:
  type: project
---

**DONE 2026-06-17 (in-app verify pending)** — ตารางล็อต step 2 ของ `AddProductWizard.tsx` ปรับให้เหมือน `AdjustStockDialog.tsx`: ใช้ `<Table>` primitive + `SortableTableHead` (เลขที่ล็อต/วันหมดอายุ/คงเหลือ) + คอลัมน์สถานะ Badge + คลิกแถว = รับเข้าล็อตเดิม + `Toggle` "แสดงล็อตที่ปิด/หมดแล้ว" (default โชว์เฉพาะ qty>0).

**Insight สำคัญ — GR กับ AdjustStock "ลงล็อต" เหมือนกันแต่กลไกต่างกัน:**
- **AdjustStock** (increase_existing_lot) คลิกแถว → ส่ง `target_lot_id` → backend merge ตาม id
- **GR** (`purchase:save`) ไม่มี target_lot_id — backend จับคู่ `(product_id, lot_number)` เอง (purchase.ts ~บรรทัด 167) ถ้าเลขล็อตซ้ำของเดิม = merge ให้อัตโนมัติ

→ ดังนั้น "คลิกเลือกล็อตเดิม" ใน GR wizard ทำฝั่ง renderer ล้วน: `selectLot()` แค่ `patch({ lot_number, expiry_date, manufactured_date })` จากล็อตที่คลิก + ตั้ง `selectedLotId` (ล็อกช่องเป็น read-only เพราะ backend ไม่แก้ exp/mfg ตอน merge) — **ไม่ต้องแก้ IPC** การ merge เกิดเองตอน save.

**บั๊กที่แก้ (purchase.ts merge branch):** เดิม UPDATE ตอน merge ไม่ปลด `is_closed` → ถ้ารับเข้าล็อตที่ปิดแล้ว (qty เคย 0) สต็อกกลับมาบวกแต่ล็อตยังถูกซ่อนจาก FEFO/availability (ที่ filter `is_closed=0`) ผิด HARD invariant. แก้: เพิ่ม `is_closed = CASE WHEN (qty_on_hand + ?) > 0 THEN 0 ELSE is_closed END` + `closed_at` NULL (CASE อ่าน qty_on_hand ค่าเก่าก่อน update ตาม SQL semantics). เกี่ยวกับ [[project_cost_model]] [[project_purchase_wizard]] [[project_gr_price_edit]].
