---
name: ui_calendar_drilldown
description: Calendar primitive = 3-view drill-down (single mode) vs plain (range/multi-month); how to extend safely
metadata:
  type: project
---

**DONE 2026-06-25** — `src/components/ui/calendar.tsx` ถูกรื้อเป็น **drill-down 3 มุมมอง**

- **โหมด single + เดือนเดียว** (`mode==='single' && (numberOfMonths ?? 1)===1`) → `SingleCalendar`:
  มุมมองวัน (caption = ปุ่ม `[ชื่อเดือน]`/`[ปี]` + ลูกศร) → กดเดือน = ตารางเลือกเดือน 3×4 → กดปี = ตารางเลือกปีทีละ 12.
  เลือกแล้วเด้งกลับมุมมองวัน. ใช้ controlled `month` state + ซ่อน caption เดิมของ rdp (`caption: "hidden"`) แล้ววาด caption เอง.
  **ต้องใส่ `mode="single"` กลับเข้า DayPicker ชั้นในเสมอ** (destructure mode ออกตอน spread → ถ้าลืมใส่ การเลือกวันพัง).
- **โหมด range / หลายเดือน** (เช่น DateRangePicker numberOfMonths=2) → `PlainCalendar` = ปฏิทินเดิม (ลูกศรเลื่อนเดือน) ไม่แตะ.
- classNames ตารางวันแชร์ผ่าน `dayGridClassNames(extra?)`; ผู้เรียกยัง override `classNames` ได้.
- ปี = **ค.ศ.** (ไม่ +543) ให้ตรงช่องกรอก DD/MM/YYYY ([[date-input-validation-contract]]); ชื่อเดือนไทย (carve-out กฏ #11 ui-theming — picker label นำทางได้).
- เคยลองแบบ native `<select>` dropdown (captionLayout) ก่อน → **เจ้าของบอกน่าเกลียด เลิกแล้ว** อย่า re-add.

ใช้ทุกที่ผ่าน DateInput (วันหมดอายุ/วันผลิต/วันเกิด/ฯลฯ) + ตัวเลือกวันใน multi-date/period picker. แก้ทรง picker → แก้ที่ไฟล์นี้ที่เดียว.
