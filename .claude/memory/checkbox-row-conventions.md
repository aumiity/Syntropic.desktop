---
name: checkbox-row-conventions
description: Checkbox destructive variant + label-only row = h-12 + 2-line title+desc row (Switch/Checkbox) = h-14 + checkbox-left/label-right ordering
metadata:
  type: feedback
---

**Checkbox conventions settled 2026-06-15.**

**Why:** เจ้าของอยากให้ checkbox ทั้งโปรแกรมเป็น pattern เดียวกัน + แถวที่ "ปิด/ซ่อน/พัก" (สถานะลบ) ต้องสื่อสีแดงสม่ำเสมอ ไม่ใช่พื้นแดงแต่เช็คเขียว.

**How to apply:**
- **`<Checkbox variant="destructive">`** = red checked-fill (ตัว primitive `src/components/ui/checkbox.tsx` มี variant `default` teal / `destructive` red). ใช้กับแถวความหมายลบ (ปิดใช้งาน/ซ่อน) ให้เช็คเป็นแดงเข้ากับพื้น `bg-destructive-soft`. `CheckRow variant="destructive"` ส่ง variant แดงเข้า Checkbox ในตัวอัตโนมัติ.
- **Label-only checkbox row (label เดี่ยว ไม่มีคำอธิบาย) ในฟอร์ม/ตั้งค่า = `h-12`.** เป็นมาตรฐานใหม่ (เลิก h-9/h-10/h-11 เดิม). ใช้ `CheckRow className="...h-12 px-3"` หรือ `CheckRow framed className="h-12"`. หมายเหตุ: ตัวเลขนี้สูงกว่ากฎ control-in-bar = h-9 โดยตั้งใจ — มันคือแถว setting ในกล่อง bordered ไม่ใช่ control ใน bar.
- **Ordering = checkbox ซ้าย / label ขวา** เสมอ (เลิกแบบ label-ซ้าย/checkbox-ขวา + `justify-between`). ตรงกับ `CheckRow`.
- **แถว Switch/Checkbox ที่มี title + คำอธิบาย 2 บรรทัด → ใช้ primitive `SettingRow` (`src/components/ui/setting-row.tsx`) — ตัวเดียว SSOT (ตั้ง 2026-06-16).** `<SettingRow control="checkbox"|"switch" title=… description=… checked onChange variant framed readOnly />`. คุมให้อัตโนมัติ: มี `description` = 2 บรรทัด `h-14` (56px) / ไม่มี = `h-12`; `control="checkbox"` (ซ้าย) หรือ `"switch"` (ขวา `justify-between`); `variant=destructive/warning` tint พื้น (+ขอบเมื่อ framed) ตอน checked; `framed` (default) วาดขอบเอง / `framed={false}` สำหรับแถวในกล่อง `rounded-lg border divide-y` กลุ่มเดียว; `readOnly` = control disabled แต่แถวไม่ dim (ค่า lock จากที่อื่น เช่น ข.ย.9←is_drug). **อย่าเขียน `<label>`+`<Checkbox>`+`<div>` เองอีก** — ใช้ SettingRow. refactor แล้ว: UnitsTab, EditProduct/GeneralTab (×8), EditBundle/GeneralTab, QuickStockDialog. (single-line + icon/F-key เช่น Customer/POS ยังเป็น `<label>` มือ — เฟสถัดไป)
- **`CheckRow`/`Toggle` framed (label เดี่ยว) = `h-12` แล้ว** (เดิม bake `h-9` ที่ไม่เคย render จริง — call site override h-12 หมด; แก้ default ใน checkbox.tsx/switch.tsx 2026-06-16). **ยกเว้น `Toggle framed="input"`** (top-bar variant) คง `h-9` ตามกฎ control-in-bar.
- **ยกเว้น h-12/h-14:** (1) checkbox ใน dropdown/popover (column-visibility, status-filter) คงแบบเมนูหนาแน่น `px-2 py-1.5`; (2) checkbox เลือกแถว/แสดงผลในตาราง.
- **ปุ่มจำนวน:** ในฟอร์มที่ต้องเลือกจำนวน ใช้ `<Button variant="primary-soft">` เปิด shared `QtyDialog` (`@/components/ui/qty-dialog`) แบบเดียวกับตะกร้า POS — ไม่ใช่ `<Input type=number>`. `QtyDialog` แสดง "คงเหลือ" เฉพาะเมื่อส่ง `stockQty`, "รวม" เฉพาะเมื่อส่ง `unitPrice`, ซ่อน preset ด้วย `presets={[]}`.

เกี่ยวข้อง: [[feedback_switch_vs_checkbox]] (Switch=ทันที/Checkbox=กดบันทึก, primitive CheckRow), [[feedback_no_dim_disabled_rows]], [[feedback_read_doc_before_ui_edit]].
