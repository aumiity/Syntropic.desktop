---
name: project_mui_color_adoption
description: warning/info/violet solid tokens reseeded to exact MUI palette hex (light only); soft/strong + dark left as-is on purpose.
metadata:
  type: project
---

**DONE 2026-07-16 (light mode, tsc n/a — CSS only; click-tested by owner "สวยแจ่ม ใช้งานได้").**

เจ้าของเลือกยกโค้ดสีจาก Material UI default palette มาใส่ **แค่ 3 role** ตรง ๆ (main + hover) แก้ที่ light `:root` ใน `src/index.css`:

| role | `--<role>` (HSL) | `--<role>-hover` (HSL) | MUI hex main / .dark |
|---|---|---|---|
| `warning` | `27 100% 47%` | `21 100% 45%` | `#EF6C00` / `#E65100` |
| `info` | `201 98% 41%` | `206 99% 31%` | `#0288D1` / `#01579B` |
| `violet` | `291 64% 42%` | `282 68% 38%` | `#9C27B0` / `#7B1FA2` |

**MUI `.dark` = ค่า hover ของเรา** (ตรงกับกลไก `--<role>-hover` พอดี ไม่ได้ยึดกฎ L−7% เป๊ะ ใช้ค่า MUI จริงตามที่เจ้าของสั่ง "ใช้โค้ดสีเขาเลย"). `-foreground` คงขาวเดิมทั้ง 3 (MUI contrastText = white).

**จงใจ "เอาไว้ก่อน" (ยังไม่ทำ):**
- `-soft` / `-soft-hover` / `-soft-foreground` / `-strong` ของ 3 role นี้ = **ยังเป็นเฉดเดิม** (ใช้กับปุ่ม soft/outline) → solid ใหม่กับ soft เก่าคนละ hue เล็กน้อย ถ้าจะให้เนียนต้องยก soft ตาม MUI ด้วยทีหลัง
- **dark mode ไม่แตะ** (ค่า `.dark` ของ 3 role ยังเดิม — dark mode พักทั้งโปรเจกต์)
- role อื่น (primary teal, success, destructive, accent…) **ไม่แตะ** — เจ้าของเก็บแบรนด์ teal+yellow ไว้; MUI Primary น้ำเงินถูกปฏิเสธโดยตั้งใจ (โยงตามบทบาทไม่ใช่เฉดสี)

เครื่องมือช่วยเลือกอยู่ที่ `claude_design/button_picker.html` + `button_mapping.html` (ไฟล์ช่วยตัดสินใจ ไม่ใช่โค้ดแอป). ต้นทาง export = `claude_design/css_button_material UI.txt` (Figma dump 894KB).

Related: [[project_theme_variant_audit]], [[theme_tokenization]], [[feedback_design_rules_2026-06]].
