---
name: feedback_tabstrip_height_h10
description: TabStrip row = h-10 (40px), NOT the h-12/h-9 table-bar rule — segmented control + any button beside it are 40px
metadata:
  type: feedback
---

แถบ `TabStrip` (แถวแท็บ + ปุ่ม ที่อยู่ใต้ `PageHeader` — เช่น Products/People/Manage/Reports/Settings/EditProduct/EditBundle) **เป็นคนละบริบทกับ table-bar** ค่ะ ตัวอ้างอิงความสูงคือ **segmented control = 40px (`h-10`)** ดังนั้น **ปุ่มที่ยืนคู่ในแถบ TabStrip = `h-10`** (ไม่ใช่ `h-9`).

อย่าสับสนกับกฏ [[feedback_read_doc_before_ui_edit]]: "ทุก bar = h-12, control ข้างใน = h-9" — กฏนั้นใช้กับ **table-card bar** (header/filter/status ของการ์ดตาราง) เท่านั้น. TabStrip ไม่ใช่ table-bar.

**Why:** segmented TabsList (`variant="segmented"`) สูง 40px จริง เพราะคำนวณจาก `p-1` (8px) + trigger `py-1.5` content (32px) = 40px. เดิม `tabs.tsx` ใช้ `h-auto` (พึ่ง padding) และ `className="h-9"` ที่หน้าต่าง ๆ ใส่ไว้ **เป็น dead class** — โดน data-variant modifier outrank ตาม [[feedback_modifier_className_specificity]] เลยไม่เคยมีผล (segmented ทุกตัวเรนเดอร์ 40px มาตลอด). ปุ่มเพิ่มบางหน้า (People, Products, Quotation) เผลอตั้ง `h-9` = 36px เลยเตี้ยกว่าแท็บ 4px ดูไม่เสมอ. เจ้าของจับได้ (วัด element ได้ ~40-42px ไม่ใช่ 36). หน้า Settings/EditProduct/EditBundle ทำถูกอยู่แล้ว (ปุ่มในแถบ = h-10).

**How to apply (DONE 2026-06-11):**
- `src/components/ui/tabs.tsx` — segmented variant ฝัง `h-10` ที่ระดับ modifier แทน `h-auto` (`data-[variant=segmented]:group-data-[orientation=horizontal]/tabs:h-10`) → ความสูงชัดเจน + กัน font เปลี่ยนแล้วเพี้ยน. **ต้องตั้งที่ระดับ modifier เท่านั้น** plain className override ไม่ติด.
- ล้าง `className="h-9"` ที่ตายแล้วออกจาก segmented TabsList ทุกหน้า (granularity-tabs + Products/People/Manage/Settings/Reports×2/EditProduct/EditBundle/Quotation).
- ปุ่มเพิ่มในแถบ TabStrip → `h-10` ทุกหน้า (แก้ People/Products/Quotation; ที่เหลือถูกอยู่แล้ว).
- **ขอบเขต:** กฏ h-10 นี้ใช้กับ "ปุ่ม" ที่ยืนคู่ segmented. ส่วน toolbar วันที่ (MultiDatePicker ใน Reports/VatReport) ยึดความสูงมาตรฐานของ date-picker เอง ไม่บังคับ h-10.
- เปลี่ยน segmented variant = แตะ primitive → showcase `/theme` "Segmented — iOS-style control" ยังหน้าตาเท่าเดิม (40px) ไม่ต้องแก้ demo.
