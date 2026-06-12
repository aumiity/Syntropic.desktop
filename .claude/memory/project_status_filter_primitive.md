---
name: project_status_filter_primitive
description: StatusFilterButton เป็น primitive กลางของปุ่มกรองสถานะทุกตาราง — default 'all'
metadata:
  type: project
---

**DONE 2026-06-12 (tsc PASS, in-app verify pending).** ปุ่ม "กรองสถานะ" (เปิด/ปิดใช้งาน) ของทุกตาราง list รวมเป็น primitive เดียว = `src/components/ui/status-filter.tsx` → `StatusFilterButton` (+ type `StatusFilterValue = 'all'|'enabled'|'disabled'`).

**พฤติกรรมมาตรฐาน (ที่ผู้ใช้ขอ):** ปุ่ม `elevated` icon h-9 w-9 เปิด popover เลือกอย่างเดียว — **default = 'all' (โชว์ทั้งหมด)** แล้วเลือกแคบเป็น ใช้งาน / ปิดใช้งาน ได้. caller แมป value ลง query/ข้อมูลเอง; รับ `options`/`title` override ได้.

**ใช้แล้วทุกหน้า:** ProductsList, BundlesList (เดิม pattern นี้อยู่แล้ว → retrofit ใช้ primitive), People×3 (ลูกค้า/ผู้จำหน่าย/พนักงาน — เดิมเป็น checkbox `showDisabled` default false), Settings CategoriesTab/DrugTypesTab/ExpenseCategoriesTab (เดิมเป็นปุ่ม toggle EyeOff "ที่พักใช้งาน" default false). state เป็น local ไม่ persist (reset ต่อ session) ตาม ProductsList; ถอด `showDisabled` ออกจาก prefs ของ People แล้ว.

**Backend:** `electron/ipc/people.ts` listCustomers/listSuppliers/listStaff เพิ่มพารามิเตอร์ `statusFilter?: 'all'|'enabled'|'disabled'` (รองรับโหมด disabled-only ที่เดิมไม่มี); legacy `includeDisabled` ยังเป็น fallback ให้ stats cards ที่เรียกตรง. Settings tabs กรอง client-side (is_disabled / ExpenseCategories ใช้ `is_active` กลับด้าน).

**ExpenseCategories ใช้ `is_active`** (1=ใช้งาน): enabled→`filter(c=>c.is_active)`, disabled→`filter(c=>!c.is_active)`.

**ข้อยกเว้น:** `Manage/LowStock.tsx` filter เป็นระดับสต็อก (ทั้งหมด/หมด/ใกล้หมด) ไม่ใช่เปิด/ปิดใช้งาน — ไม่แตะ (default 'all' อยู่แล้ว). Showcase อยู่ Theme section "StatusFilterButton". เกี่ยว: [[feedback_no_dim_disabled_rows]] (status สื่อด้วย Badge).
