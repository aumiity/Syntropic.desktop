---
name: project_sidebar_palette_simplify
description: Sidebar color palette collapsed from 8 tokens to 4; dark-mode sidebar values are provisional and may be skipped.
metadata:
  type: project
---

**Sidebar CSS palette ยุบจาก 8 → 4 token (2026-07-15).**

เหลือเฉพาะที่ใช้จริง: `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`.

**ลบทิ้ง (ไม่มี consumer):**
- `--sidebar-primary` — ไม่มีคลาส `*-sidebar-primary` ใช้ที่ไหนเลย
- `--sidebar-ring` — ไม่มี `ring-sidebar-ring` ใช้; `accent-presets.ts` เคย set ตอน runtime แต่ไร้ผล

**ยุบรวม (ค่าซ้ำใน light mode):**
- `--sidebar-border` + `--sidebar-primary-foreground` → รวมเข้า `--sidebar-foreground` (light ทั้งคู่ = `155 15% 78%`). ตอนนี้ `--sidebar-foreground` ทำหน้าที่ทั้ง **สีตัวหนังสือเมนู** และ **สีขอบ sidebar** พร้อมกัน
- `--sidebar-ring` เคยซ้ำ `--sidebar-accent` (`0 0% 100%`) → เหลือ `--sidebar-accent` ตัวเดียว (pill active + โลโก้/แบรนด์)

**จุดที่แก้:** `src/index.css` (:root + .dark), `tailwind.config.js` (สอง key ถูกถอด), `src/components/layout/Sidebar.tsx` + `SidebarUser.tsx` (`text-sidebar-primary-foreground`→`text-sidebar-foreground`, `border-sidebar-border`→`border-sidebar-foreground`), `src/lib/accent-presets.ts` (ถอดจาก `ACCENT_VAR_NAMES` + ลบ `--sidebar-ring` ใน `buildVars`).

**NOTE (สำคัญ):** เจ้าของจูน **light mode ก่อน** แล้วค่อยจัดการ dark เอง — ค่าสี sidebar ในบล็อก `.dark` = **provisional**. งานในอนาคตที่กระทบเฉพาะสี sidebar ของ dark mode **ข้ามได้** (เช่น ตอนนี้ขอบ sidebar ใน dark กลายเป็นขาว `0 0% 100%` เพราะไปใช้ `--sidebar-foreground` แทน `--sidebar-border` เดิม `0 0% 10%` — เป็นที่รู้กันแล้ว รอเจ้าของปรับ).

Related: [[feedback_scrollbar_thin]] (อีก sidebar-area tweak รอบเดียวกัน).
