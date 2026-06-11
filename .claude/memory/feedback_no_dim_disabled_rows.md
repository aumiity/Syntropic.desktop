---
name: feedback_no_dim_disabled_rows
description: Don't dim/opacity disabled/inactive table rows — the status Badge already signals it
metadata:
  type: feedback
---

อย่าใช้ `opacity`/dim กับแถวที่ปิดการใช้งาน (disabled/inactive) ในตาราง — ถ้าแถวนั้นมี Badge บอกสถานะอยู่แล้ว (เช่น `destructive-outline` "ปิดใช้งาน" คู่กับ `success-outline` "ใช้งาน") การ dim เป็นการบอกซ้ำซ้อนโดยไม่จำเป็น

**Why:** เจ้าของบอกตรง ๆ ว่ามี badge บอกสถานะอยู่แล้ว จะ dim ทำไม (2026-06-11) — สถานะต้องสื่อด้วย token/badge ตาม design system ไม่ใช่ลดความทึบทั้งแถว ซึ่งลดความอ่านง่ายของข้อมูลที่ยังถูกต้องอยู่

**How to apply:** แสดงสถานะ disabled/active ด้วย `<Badge>` (semantic variant) เท่านั้น ไม่ต้องใส่ `opacity-XX`/dim ที่ `<TableRow>` หรือ cell. เกี่ยวข้องกับแพตเทิร์น row-action toggle พักการใช้งาน + ฟิลเตอร์ "ที่พักใช้งาน" ในแท็บหมวดหมู่และประเภท (CategoriesTab/ExpenseCategoriesTab/DrugTypesTab). ดู [[feedback_design_system_consistency]]
