---
name: project-field-h8-sweep
description: 2026-08-13 ACTIVE — ล้าง className="h-9" ที่ pin ทับ field primitive ทีละหน้า; เช็คลิสต์ = docs/plans/Field_H8_Sweep.md
metadata:
  type: project
---

**ACTIVE 2026-08-13** — เจ้าของตรวจ `/theme` แล้วเจอว่า **ข้อความอธิบายบอก `h-9` แต่ของจริงเป็น `h-8`** (เริ่มจาก section DateInput) → กวาดแก้ทั้งระบบ **ทีละหน้า เจ้าของสั่งเอง อย่าไปกวาดรวดเดียว**

**เช็คลิสต์รายหน้า (SSOT ของงานนี้) = `docs/plans/Field_H8_Sweep.md`** — เปิดไฟล์นั้นก่อนทำหน้าถัดไปเสมอ

- **DONE:** เอกสาร+`/theme` (ข้อความที่บอกผิด + เดโมที่ pin h-9 จริง 3 ตัว), `docs/claude/ui-theming.md` (เพิ่ม `### Field-control height`), `switch.tsx` comment, memory 3 ไฟล์ · **`src/pages/Purchase/` (index.tsx 6 จุด + AddProductWizard.tsx 9 จุด) — tsc PASS รอ click-test**
- **เหลือ 17 หน้า / ~29 จุด** — People, PurchaseIntake, ProductsList, Manage×5, HistoryTab×2, Reports×4, LabelPrintDialog, LabelDesigner
- ค่าที่ยึด = [[control-height-h9-revert]] (field = `h-8` เสมอ; Textarea ยกเว้น; `h-9` เป็นของ Button ladder เท่านั้น อย่ายุบ)

**กับดักที่เจอ (สำคัญ):**
- **`DateInput` กิน `className` ที่ wrapper แต่ `<Input>` ข้างในตรึง `h-8`** (`date-input.tsx:104`) → `className="h-9"` ไม่ได้ทำให้ช่องสูงขึ้น แค่ได้ช่องว่าง + ปุ่มปฏิทินเยื้องจากกึ่งกลาง. `ui-theming.md` เคยเขียนว่า wrapper default `h-10` + inner เป็น `h-full` — **ผิด แก้แล้ว**
- กล่องปลอม `<div className="h-9 … bg-muted border rounded-md">` ที่ยืนแทน field ตอน read-only ต้องตาม `h-8` ด้วย (เจอใน `AddProductWizard` แถว Lot/วันผลิต/วันหมดอายุ)
- `<TableRow className="h-9">` บนหัวตาราง = **dead class** — `TableHead` เป็น `h-10` และชนะด้วย specificity; ถ้าอยากลดจริงต้อง `[&>th]:h-9` (แบบที่ AddProductWizard/PriceTagList ใช้)

**Why:** เจ้าของยึด `h-8` เป็นมาตรฐานเดียวของช่องกรอก/combobox ทุกจุด แต่ตอน revert h-9→h-8 (2026-07-24) แก้แค่ที่ primitive ไม่ได้ล้าง pin ที่ call site → filter strip หลายหน้ายังสูง h-9 จริงจนถึงวันนี้

**How to apply:** ลบเฉพาะโทเคน `h-9` อย่าแตะ width/prop อื่น; เจอ `<Button className="h-9">` = ปล่อย (คนละ ladder); จบหน้า → `npx tsc -p tsconfig.json --noEmit` + click-test หน้านั้น แล้วติ๊กในเช็คลิสต์
