---
name: project_multi_date_picker
description: MultiDatePicker = picker วันที่มาตรฐานใหม่ แทน PeriodPicker/DateRangePicker; pattern persist dateMode (rolling) + from/to
metadata:
  type: project
---

**MultiDatePicker (`src/components/ui/multi-date-picker.tsx`) = picker วันที่มาตรฐานใหม่** — รวมร่าง PeriodPicker + DateRangePicker เป็นตัวเดียว: โหมดเต็ม `day/month/year/custom` + tab strip + stepper ‹ › + preset sidebar (ใน custom). API: `mode, from, to, onChange(mode, from, to), allowedModes, align`. มี helper `rangeForMultiMode(mode, anchor?)`, `defaultMultiDateFor(isOwner)`, `allowedModesFor(isOwner)`.

**Migration DONE 2026-06-08 (commit `65c9907`)** — แทนของเดิมในหน้าใช้งานจริงด้วยโหมดเต็มทั้งหมด:
- Dashboard (PeriodPicker→ 1:1), EditProduct/EditBundle HistoryTab, KhorYor9, Manage Sales/Purchases/Expenses
- **ยังไม่ลบ** `period-picker.tsx` / `date-range-picker.tsx` — ยังถูกใช้ใน `Theme/index.tsx` (showcase) + `Quotation/QuotationList.tsx` (โมดูลซ่อน)

**Pattern persist วันที่ใน usePagePrefs (Manage pages):** เลิกเก็บ `datePreset` key แบบเดิม → เก็บ `dateMode: MultiDateMode` + `dateFrom` + `dateTo`. ตอน mount: ถ้า `mode !== 'custom'` เรียก `rangeForMultiMode(mode)` คำนวณจากวันนี้ใหม่ (**rolling** — day/month/year ไม่ค้างวันเก่า), ถ้า `custom` ใช้ from/to ที่เก็บไว้. onChange ต้อง `setPrefs({ dateMode, dateFrom, dateTo })` ทุกครั้ง. localStorage เก่าที่มี `datePreset` ค้างได้ ไม่ก่อปัญหา (merge `{...defaults, ...parsed}` ใน [[project_column_visibility]]-style usePagePrefs).

**Guard สำคัญ:** `handleStep` fallback เป็นวันนี้เมื่อ `from/to` ว่าง (หน้า HistoryTab default = ไม่กรองวันที่ = from/to ว่าง) — ไม่งั้น `dayjs('')` = Invalid Date เวลากดปุ่ม stepper.
