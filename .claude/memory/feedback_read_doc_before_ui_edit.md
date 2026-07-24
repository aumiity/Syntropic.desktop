---
name: feedback_read_doc_before_ui_edit
description: Before editing UI, read the SSOT doc (docs/claude/ui-*.md) FIRST — never derive rules from grepping other pages
metadata:
  type: feedback
---

ก่อนแก้ UI (โดยเฉพาะ table-card / header bar / filter strip / ปุ่ม / spacing) **ต้องเปิดอ่าน `docs/claude/ui-*.md` ที่เป็น SSOT ก่อนลงมือเสมอ** — CLAUDE.md ก็สั่งไว้แล้ว ("you must read that file first"). ห้าม grep โค้ดหน้าอื่นมาเดาเป็น reference

**Why:** เคยพลาด (2026-06-07, ComponentsTab ปุ่มบันทึก) — ไป grep `DeadStock.tsx`/`ProductsList.tsx` เอา `h-9 w-9` มาเป็น reference ทั้งที่หน้าพวกนั้นเองก็หลุด pattern (filter strip ต้อง h-10 ไม่ใช่ h-9) แล้วเดาความสูงผิดวนหลายรอบ จนเจ้าของหงุดหงิด. โค้ดที่มีอยู่ในรีโปไม่ใช่ความจริง — เอกสารคือความจริง

**How to apply:** เห็นงานแตะ UI table-card → เปิด `docs/claude/ui-table-card.md` อ่านก่อน. **ความสูงล่าสุด (2026-07-24):** control primitive ทุกตัว = `h-8` (ดู [[control-height-h9-revert]]); standard table-card bar = `h-14` บน / `h-12` ล่าง ต่างกันโดยตั้งใจ (ดู [[table-card-bar-heights-locked]]) — ตัวเลขชุดนี้เปลี่ยนมาหลายรอบ **เช็คเอกสาร + 2 memory นี้เสมอ อย่าเดาจากโค้ดหน้าอื่น**. row-action = `size="icon-lg" variant="elevated"` (square). ดูโค้ดหน้าอื่นได้แค่ "ตัวอย่างประกอบ" ไม่ใช่ "แหล่งกฎ"
