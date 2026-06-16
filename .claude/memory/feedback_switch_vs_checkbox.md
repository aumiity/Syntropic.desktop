---
name: switch-vs-checkbox
description: เมื่อไหร่ใช้ Switch vs Checkbox ในฟอร์ม + primitive CheckRow ใหม่
metadata:
  type: feedback
---

**Switch = มีผลทันที / Checkbox = ต้องกดบันทึก.** ค่าที่ persist ทันทีใน `onChange` (auto-save, view-filter) ใช้ `Switch`/`Toggle`; ค่าที่ commit ตอนกดปุ่ม บันทึก/Save แยก (form ที่มี `handleSave`/`registerSave`) ใช้ `Checkbox`.

**Why:** เจ้าของบอกว่า switch สื่อ on/off ทันที ส่วน checkbox สื่อ "ติ๊กเลือกก่อนแล้วค่อยเซฟ" เข้าใจง่ายกว่า — สำรวจ+แปลงรอบใหญ่ 2026-06-14 (23 จุด).

**How to apply:**
- เพิ่ม toggle ใหม่ในฟอร์ม → ถามตัวเองว่ามีปุ่มบันทึกไหม ถ้ามี = Checkbox
- ใช้ primitive ใหม่ **`CheckRow`** ใน `src/components/ui/checkbox.tsx` (sibling ของ `Toggle`) สำหรับเคส label เดี่ยว — prop เหมือน Toggle (`checked/onChange/label/framed/variant`) แต่ **checkbox อยู่ซ้าย / label ขวา**
- **เคส title+subtitle 2 บรรทัด → ใช้ primitive `SettingRow` (`src/components/ui/setting-row.tsx`) เท่านั้น** — `control="checkbox"|"switch"`, มี `description` = `h-14` auto, `variant=destructive/warning` tint, `framed`/`framed={false}`, `readOnly`. ห้ามเขียน `<label>`+`<Checkbox>/<Switch>`+`<div>` เองอีก. ดู [[checkbox-row-conventions]]. (`CheckRow`/`Toggle` framed = label เดี่ยว, h-12)
- **คงเป็น Switch โดยตั้งใจ:** auto-backup (DatabaseTab), PrintTab ×9 (auto-persist+preview), lot-picker `showDepleted` (view filter), `is_drug` (disclosure ข้อมูลยา — มติเจ้าของ), `showWholesale` (disclosure ราคาส่ง — มติเจ้าของ)
- disclosure ที่เป็น checkbox (เผยช่องย่อยทันทีแต่ค่าเซฟทีหลัง): `has_tax_invoice`, `is_alert`; LabelSettings `show_barcode` = checkbox + **เอา disclosure ออก** โชว์ช่องปรับแต่งเสมอแต่ `disabled` เมื่อไม่ติ๊ก

SSOT/inventory เต็ม = `docs/plans/Switch_To_Checkbox_Audit.html`. เกี่ยวข้อง: [[feedback_toggle_style]] (Toggle = label ซ้าย/switch ขวา).
