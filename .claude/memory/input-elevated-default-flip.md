---
name: input-elevated-default-flip
description: Field primitives share ONE variant set (default/flat/pill/pill-flat) from field-variants.ts; filled is DELETED; don't hand-add variant="elevated"
metadata:
  type: project
---

**UPDATED 2026-07-17 — `filled` ลบทิ้งแล้ว, variant ยุบเป็นชุดกลางชุดเดียว (tsc PASS exit 0; click-test pending).**

## สัญญาปัจจุบัน — `src/components/ui/field-variants.ts` = SSOT

field primitive **5 ตัว** ใช้ชุด variant ร่วมกันชุดเดียว: `Input` / `SearchInput` (ผ่าน Input) / `Textarea` / `SelectTrigger` / `NativeSelect` — ทุกตัว `import { fieldVariant, type FieldVariant } from "./field-variants"`.

ทุก variant อยู่บนพื้นเดียวกันหมด (`bg-card` + `border border-border`) — ชุดนี้เป็นแมทริกซ์ **ทรง × เงา** ล้วน ไม่มีมิติพื้นผิว:

| variant | radius | shadow |
|---|---|---|
| `default` (= alias `elevated`) | `rounded-sm` | `shadow-sm` |
| `flat` | `rounded-sm` | ไม่มี |
| `pill` | `rounded-full` | `shadow-sm` |
| `pill-flat` | `rounded-full` | ไม่มี |

**Why:** เจ้าของสั่ง "จัดระเบียบใหม่ ต้องการ 4 แบบ" (2026-07-17) แล้วเลือกตัด `filled` ทิ้งเอง — พื้น `bg-input` แบนไม่เข้าพวกกับแกนทรง×เงา และมี call site จริงแค่ที่เดียว. เดิม 3 ตัวก๊อปคลาสกันเองแล้วไม่ sync (Input=`rounded-md`, Textarea=`rounded-lg`, Select=`rounded-control`) → ยุบเป็นไฟล์กลาง.

**How to apply:**
- `<Input>` เปล่า = `default` = elevated อยู่แล้ว — **อย่าเติม `variant="elevated"` มือ** (alias เฉย ๆ ของเก่าไม่ต้องไล่ลบ)
- **ห้าม hardcode radius/shadow บน field** ทั้งใน primitive เองและ `className` ที่ call site (`rounded-full`, `rounded-md`, `shadow-sm`) — เลือก variant แทน; literal ใน `className` ชนะ `fieldVariant()` เงียบ ๆ
- เพิ่มทรงใหม่ (เช่น `sharp`) → เติมใน `FIELD_SHAPE` ที่ `field-variants.ts` ตัวเดียว ทั้ง 5 primitive ได้ฟรี แล้วเติม `DemoRow` ใน `/theme` ต่อ
- **มุมเหลี่ยม = `rounded-sm` (0.125rem) literal โดยเจ้าของเลือกเอง 2026-07-17 — ไม่ใช่โทเคน `--radius-control` (0.5rem)**; field ตั้งใจให้มุมคมกว่า Button (เจ้าของลองเองแล้วบอก "sm ดูเหมาะกว่า"). นี่คือ carve-out เดียวที่อนุญาตของกฎ "control ใช้ `rounded-control`" และอยู่ที่เดียวคือ `FIELD_SHAPE`. **อย่า "แก้กลับ" เป็นโทเคน** (หนูเคยทำมาแล้วรอบแรก เจ้าของสั่งแก้กลับ) และอย่าเอา carve-out นี้ไปใช้กับ control ตัวอื่น
- **Button ไม่เกี่ยว** — `default` ของ Button ยังเป็น CTA เขียว/teal; `elevated` ของ Button = secondary beside primary (คนละ namespace กับ field variant)
- **`filled` ตายแล้ว อย่า re-add** — เจอโค้ดเก่าอ้าง `variant="filled"` = โค้ดที่หลุด, tsc จะจับให้

## กับดัก
- **ทั้ง 5 ตัวมุมคมขึ้นโดยตั้งใจ** → `rounded-sm` (0.125rem) เหมือนกันหมด: Input เดิม `rounded-md` (0.375rem), Textarea เดิม `rounded-lg`, SelectTrigger/NativeSelect เดิม `rounded-control` (0.5rem). เป็นผลของการ sync ตามที่เจ้าของสั่ง ไม่ใช่บั๊ก — เจ้าของ click-test เองแล้วรับ 2026-07-17
- `NativeSelect` default prop เปลี่ยนจาก `'elevated'` → `'default'` (ค่าเท่ากัน แค่ชื่อ)
- `SelectTrigger`/`NativeSelect` เดิมให้ `hover:bg-muted` เฉพาะ non-filled → ตอนนี้ทุก variant ได้ hover เท่ากัน

## ประวัติ (อย่าย้อนทำ)
- 2026-06-01 flip `default`→ELEVATED + เพิ่ม `filled` (ตอนนั้น non-breaking เพราะไม่มี call site hardcode `variant="default"`); เก็บ `elevated` เป็น alias
- 2026-07-03 `NativeSelect` เข้ามาตรฐาน (เดิม `bg-input`/`rounded-xl`/`focus:ring-[2px]`)
- 2026-07-17 ยุบเป็น `field-variants.ts` + ลบ `filled` (call site เดียว = `Purchase/index.tsx` เลขที่ใบรับ read-only → `flat`)

แก้ในคอมมิตเดียวกัน: `docs/claude/ui-theming.md` (§ELEVATED + ตาราง 4 variant) + `/theme` showcase (Input/Textarea/Select มีแถว flat/pill/pill-flat). NativeSelect ยังไม่มีใน `/theme` (เหมือน charts) เลยไม่มี demo ให้อัป.

Card/Table ขาดขอบ = คนละ root cause (ขอบอยู่บน composite card + wrapper div รอบ `<Table>` ไม่ใช่บน primitive) ไม่เกี่ยวกับงานนี้. Relates to [[dialog-button-convention]].
