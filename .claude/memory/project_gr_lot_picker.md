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

→ ดังนั้น "คลิกเลือกล็อตเดิม" ใน GR wizard ทำฝั่ง renderer ล้วน: คลิก = `patch({ lot_number })` เท่านั้น — **ไม่ต้องแก้ IPC** การ merge เกิดเองตอน save. (ดูกลไกใหม่ 2026-06-18 ด้านล่าง — เลิกใช้ `selectedLotId` แล้ว)

**บั๊กที่แก้ (purchase.ts merge branch):** เดิม UPDATE ตอน merge ไม่ปลด `is_closed` → ถ้ารับเข้าล็อตที่ปิดแล้ว (qty เคย 0) สต็อกกลับมาบวกแต่ล็อตยังถูกซ่อนจาก FEFO/availability (ที่ filter `is_closed=0`) ผิด HARD invariant. แก้: เพิ่ม `is_closed = CASE WHEN (qty_on_hand + ?) > 0 THEN 0 ELSE is_closed END` + `closed_at` NULL (CASE อ่าน qty_on_hand ค่าเก่าก่อน update ตาม SQL semantics). เกี่ยวกับ [[project_cost_model]] [[project_purchase_wizard]] [[project_gr_price_edit]].

**เลขล็อตซ้ำ — single-driver model + ประวัติตรงล็อตจริง (2026-06-18):** step 2 เดิมไม่เช็คเลขล็อตซ้ำเลย — พิมพ์เลขตรงล็อตเดิม (วันหมดอายุต่าง) ก็ผ่าน แล้วตอน save backend merge เข้าล็อตเดิมเงียบ ๆ (UPDATE ไม่แตะ expiry/mfg → วันที่พิมพ์ใหม่ถูกทิ้ง).
- **Renderer (AddProductWizard.tsx) — เลิกใช้ `selectedLotId`:** ตัวขับเดียว = `matchedLot` (useMemo) = ล็อตใน `mergeCandidates` ที่ `lot_number` ตรงกับที่กรอกพอดี. ช่อง **Lot No. พิมพ์แก้ได้ตลอด** (Input ไม่มี read-only แล้ว); คลิกแถวตาราง = `patch({ lot_number })` เฉย ๆ. effect `[matchedLot]` (functional `setRow` + `prevMatchId` ref, ไม่ผูก `row` กัน loop): เลขตรง → ดึง+ล็อก `expiry/manufactured_date` ของล็อตเดิม (read-only); เพิ่งหลุดจากการตรง → เคลียร์วันให้กรอกใหม่; ยังไม่เคยตรง → ไม่ยุ่งกับวันที่ผู้ใช้กรอก. กล่อง "ล็อต X มีอยู่แล้ว" = info เฉย ๆ (h-12, ไม่มีปุ่ม) บอกว่าจะ merge + วันถูกล็อก. `stepValid(1)` = `lot_number && expiry_date` (ไม่มี selectedLotId).
- **Backend (purchase.ts):** ตอน merge ให้ `purchase_receipt_items` บันทึก `existing.expiry_date/manufactured_date` (วันของล็อตจริง) ไม่ใช่ `item.*` ที่พิมพ์มา — ผ่านตัวแปร `recExpiry`/`recMfg` (default = ค่าที่กรอก, สาขา existing override เป็นของล็อตเดิม). **กฎ: ประวัติ GR/ข.ย. ต้องสะท้อนวันหมดอายุ/วันผลิตของล็อตจริงเสมอ** (insert ล็อตใหม่ใช้ค่าที่กรอก, merge ใช้ค่าล็อตเดิม). เกี่ยว [[project_kho10_kho11]].
