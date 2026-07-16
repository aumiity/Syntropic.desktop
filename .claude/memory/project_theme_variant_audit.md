---
name: project_theme_variant_audit
description: /theme showcase rebuilt from cva as SSOT — Button/Badge done (2/33 sections); duplicate variants removed; neutral-outline=flat vs elevated=shadow contract.
metadata:
  type: project
---

**ACTIVE 2026-07-16 — รื้อโซนโชว์ variant ในหน้า `/theme` ให้ตรงกับ primitive จริง. commit `2e5d140` (push main แล้ว).**

## ทำไปแล้ว 2/33 sections — Button + Badge

หน้า `/theme` (`src/pages/Theme/index.tsx`) มี **33 `<Section>`** — เพิ่งจัดไป **Button กับ Badge** (2 ตัวที่ variant เยอะสุด 45+37=82 ตัว) ที่เหลือ 31 sections ส่วนใหญ่เบากว่ามาก (Avatar/Label/Pagination/Toast แทบไม่มี variant).

**วิธีที่ใช้ (ทำซ้ำกับ section อื่นได้):** ไล่ variant จาก cva ในไฟล์ primitive = SSOT → โชว์ครบทุกตัว **ตัวละครั้งเดียว** → label = **ชื่อ variant ตรงตัว** → จัดกลุ่มตาม**พื้นผิว** (solid / soft / outline / neutral-surface / elevated) ให้ Button กับ Badge เรียงล้อกันอ่านเทียบได้.

**ของเดิมที่พัง (เผื่อเจอ pattern เดียวกันใน section อื่น):** label ไม่ตรง variant (`default` เขียนว่า "Primary"), `elevated` โผล่ 2 แถวด้วยชื่อมั่ว ("Status"/"Method"), หัวข้อแถวโกหก ("no border" ทั้งที่ variant ประกาศ `border`).

## กับดักโครงสร้าง — base cva ของ Button แจก shadow ฟรี

`button.tsx` base cva มี `"shadow-sm hover:shadow-sm"` → **ทุก variant ได้เงาฟรี**. ใครจะเพิ่มปุ่ม**แบน**ต้อง `shadow-none hover:shadow-none` เอง (แบบที่ `ghost`/`link`/`neutral-outline` ทำ) ไม่งั้นจะกลายเป็น `elevated` โดยไม่ตั้งใจ. **`badge.tsx` base ไม่มี shadow** → คนละพฤติกรรม อย่าเอา logic ข้ามกัน. มีคอมเมนต์กันลืมไว้ใน `button.tsx` แล้ว.

## สัญญาที่ตกลงกันแล้ว — ใช้ร่วมทั้ง 2 primitive

| | Button | Badge |
|---|---|---|
| **ขาวแบน (ไม่มีเงา)** | `neutral-outline` | `neutral-outline` |
| **ขาวมีเงา** | `elevated` | `elevated` |

**`secondary` ถูกลบออกจากทั้ง Button และ Badge แล้ว — อย่า re-add.** (ซ้ำกับ `elevated`/`neutral-outline`: light ต่าง 1% lightness, dark = ค่าเดียวกันเป๊ะ). ย้าย call site ไป `neutral-outline` หมดแล้ว 5 จุด.

**Badge ไม่มีตระกูล `elevated-<role>` 8 ตัว (destructive/warning/success/accent × solid,soft) — โดยตั้งใจ ไม่ใช่ของตกหล่น.** เพราะ 8 ตัวนั้นนิยามด้วย `hover:`/`aria-expanded:` ล้วน ๆ ซึ่ง `<span>` ที่ไม่ interactive ไม่มีวันติด → จะกลายเป็นชิปเทาเหมือนกัน 8 อัน. **Button 45 / Badge 37 ต่างกัน 8 = ตัวเลขที่ถูกต้องแล้ว.**

## ค้างไว้ — เริ่ม session หน้าจากตรงนี้

1. **ยังไม่ได้ click-test ในแอปจริงเลย** — ยืนยันแค่ `tsc` + อ่านค่าโทเคน. โดยเฉพาะ **ปุ่ม `neutral-outline` ตัวใหม่** (ขาวแบน) ที่เพิ่งสร้าง ยังไม่มีใครเห็นด้วยตา **และ push ขึ้น main ไปแล้ว**.
2. **โทเคน `--secondary` / `--secondary-foreground` / `--secondary-hover` ไม่มี consumer แล้ว** — ลอยอยู่ใน `index.css`. **ต้องถามเจ้าของก่อนลบ** (กฎ [[feedback_drop_unused_data]] ใน OS memory). หมายเหตุ: เจ้าของเพิ่งจูนค่าพวกนี้เอง (99%→100%, fg 32%→12%) ซึ่ง**คือต้นเหตุที่ทำให้ปุ่มขาวไปชนกัน** — ของเดิมมันต่างจริง.
3. `/theme` ตอนนี้ `neutral-outline` อยู่แถว Outline ส่วน `elevated` อยู่แถว Neutral/surface — คนละแถว เทียบ "แบน vs เงา" ยาก. เจ้าของยังไม่ตัดสินใจว่าจะย้ายมาชิดกันไหม.

## บทเรียน

**grep อย่างเดียวไม่พอ — ต้อง `tsc`.** `lot-picker-dialog.tsx` เขียน `variant={active ? 'default' : 'secondary'}` (computed) grep จับไม่ได้ tsc จับได้. และระวัง `grep -o -h` ที่ตัดชื่อไฟล์ทิ้ง ทำให้ `| grep -v pages/Theme` กรองไม่ได้ → เคยนับ usage ผิดมาแล้วรอบนึง.

Related: [[project_ui_redesign_pass]] (งาน UI ใหญ่ที่ ACTIVE อยู่), [[feedback_read_doc_before_ui_edit]], [[card-border-default]], [[input-elevated-default-flip]], [[feedback_design_rules_2026-06]].
