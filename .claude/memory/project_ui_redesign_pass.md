---
name: project_ui_redesign_pass
description: UI redesign pass — เจาะปรับหน้าตาทีละหน้าตาม journey (Setup→Login→POS→...); progress tracker ที่ docs/plans/ui-redesign-pass.md
metadata:
  type: project
---

**UI Redesign Pass (เริ่ม 2026-06-06, กลับมาต่อ 2026-07-14 หลังห่างไปกว่าเดือน)** — รอบงานปรับ **หน้าตา UI ทีละหน้า** ตาม journey การใช้งานจริง ตั้งแต่หน้าลงโปรแกรมไปจนถึงหน้าใช้ทุกวัน

- **Wave 0 — App shell: Sidebar DONE (เจ้าของเคาะ "น่าจะจบแล้ว" 2026-07-17)** — pill inset+rounded-lg, hover ตรงกับ active, gap ปุ่มแน่นขึ้น, กรอบนอก `rounded-xl` เจาะจง, **width `w-60`** (เจ้าของปรับเองจาก w-64, ยุบ=w-20), ชิดขอบบน/ซ้าย/ล่างเท่ากันแยกจาก main's `pt-12`; commit `620552c` + sync แผน 2026-07-17. เจ้าของประกาศจะทำ **ทั้งระบบทีละหน้า แก้ CSS Component ไปทีละหน้า** ต่อ — เช็ค Wave list ก่อนเจาะหน้าถัดไป
- **SSOT + checklist ติดตามข้ามวัน = `docs/plans/ui-redesign-pass.md`** (อ่าน/อัปเดตทุกครั้งที่ resume)
- บริบท: ระบบ **ทำงานครบ + click-test ผ่านหมดแล้ว** (เจ้าของยืนยัน 2026-06-06) — รอบนี้แตะแค่หน้าตา ไม่แตะ logic/IPC/schema เว้นจำเป็น
- **Hygeia migration = ปิดเรื่อง** — เจ้าของตัดสินใจ **เริ่ม data ใหม่ clean** ดึงแค่ ชื่อ+สต็อก+ราคาล่าสุด ไม่เอาประวัติขาย (importer เดิม [[project_hygeia_import]] เก็บไว้แต่ไม่เอา full import; refine drug_type/customer-prefix = ยกเลิก)
- ลำดับ: Wave 1 Setup+Login → Wave 2 POS+Products+Edit → Wave 3 Purchase+Manage(7) → Wave 4 Reports+People+Settings(12 tab). ข้าม Quotation(ซ่อน)/Theme/CSS(showcase)
- **กติกา: เสนอแผนต่อหน้าให้เจ้าของเคาะก่อนลงมือทุกหน้า**; ยึด `/theme` + `docs/claude/ui-*.md`
- เกี่ยวข้อง: [[theme_tokenization]], [[project_table_pattern_refactor]], [[project_column_visibility]], [[project_box_border_audit]], [[project_edit_parity_pass]], [[project_pos_redesign]] (refactor เก่าที่ paused — อาจ merge เข้ารอบนี้ทีละหน้า)