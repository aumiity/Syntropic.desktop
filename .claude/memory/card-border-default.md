---
name: card-border-default
description: base Card primitive ได้ border เป็น default แล้ว (2026-06-06) — bg-card+border+shadow-card ตรง house elevated
metadata:
  type: project
---

**base `Card` ใน `src/components/ui/card.tsx` มี `border border-border` เป็น default แล้ว (2026-06-06)**

เดิม `Card` มีแค่ `bg-card ... shadow-card` (ไม่มี border) ต่างจาก `SectionCard`/`MetricCard`/card variants อื่นที่ฝัง `border border-border` ไว้หมดแล้ว → `<Card>` เปล่า ๆ เลยดู "ลอย" ไม่ตรง house elevated (`bg-card + border + shadow`).

**แก้ที่ต้นทาง** (เจ้าของสั่ง "แก้ต้นทาง" ระหว่าง [[project_ui_redesign_pass]] หน้า #1 SetupWizard): เพิ่ม `border border-border` ในคลาส base `Card` (card.tsx line ~19). blast radius เล็กมาก — base `<Card>` ถูกใช้จริงแค่ `SetupWizard.tsx` + `Theme/index.tsx` (showcase) เท่านั้น; ที่อื่นใช้ MetricCard/SectionCard ที่มี border อยู่แล้ว.

**ผล:** ไม่ต้องใส่ `className="border"` กับ `<Card>` อีก (default แล้ว, ซ้ำซ้อน — ถอดออกจาก SetupWizard ทั้ง 5 จุด). showcase โชว์ border เองอัตโนมัติ. ถ้าจะให้ Card ไร้ border (กรณีพิเศษ) ต้อง opt-out ด้วย `className="border-0"`.

เกี่ยว: [[input-elevated-default-flip]] (Input ก็ flip เป็น elevated default คราวก่อน), [[project_box_border_audit]] (งานเติม border ให้กล่อง tinted)
