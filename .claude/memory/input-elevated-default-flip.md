---
name: input-elevated-default-flip
description: Field primitives share ONE variant set (default/flat/pill/pill-flat) from field-variants.ts; filled is DELETED; don't hand-add variant="elevated"
metadata:
  type: project
---

**UPDATED 2026-07-17 — `filled` ลบทิ้งแล้ว, variant ยุบเป็นชุดกลางชุดเดียว (tsc PASS exit 0; click-test pending).**

> **แก้เพิ่ม 2026-07-17 (รอบสอง): radius กลายเป็น "แกนที่ 3" — prop `radius` (`sm`/`md`/`lg`, default `md`).** ประวัติ: เจ้าของลอง `rounded-sm` → `rounded-md` (แก้ literal ตายตัว) แล้วสรุปว่าอยากมิกซ์ sm/md ต่อชิ้น → หนูแยก radius ออกจาก `FIELD_SHAPE` เป็นแกนอิสระ. โมดูลกลางใหม่ `src/components/ui/radius.ts` (`type Radius` + `RADIUS_CLASS`) ใช้ร่วม **field + Button + Badge**; `fieldVariant(variant, radius)` square ใช้ radius, pill = `rounded-full` เสมอ. ปรัชญา: **custom ต่อชิ้นก่อน → `grep 'radius='` หาแพทเทิร์นที่ชอบ → ค่อยตั้งเป็น default/convention**. ดู [[radius-axis-prop]]. **ห้าม hardcode `className="rounded-*"` — ใช้ prop.** ตาราง/ข้อความข้างล่าง "square" = ตาม radius prop (default md); `FIELD_SHAPE` เดิมถูกแทนด้วย `FIELD_SHADOW` + `RADIUS_CLASS`.

## สัญญาปัจจุบัน — `src/components/ui/field-variants.ts` = SSOT

field primitive **5 ตัว** ใช้ชุด variant ร่วมกันชุดเดียว: `Input` / `SearchInput` (ผ่าน Input) / `Textarea` / `SelectTrigger` / `NativeSelect` — ทุกตัว `import { fieldVariant, type FieldVariant } from "./field-variants"`.

ทุก variant อยู่บนพื้นเดียวกันหมด (`bg-card` + `border border-border`) — ชุดนี้เป็นแมทริกซ์ **ทรง × เงา** ล้วน ไม่มีมิติพื้นผิว:

| variant | radius | shadow |
|---|---|---|
| `default` (= alias `elevated`) | `rounded-md` | `shadow-sm` |
| `flat` | `rounded-md` | ไม่มี |
| `pill` | `rounded-full` | `shadow-sm` |
| `pill-flat` | `rounded-full` | ไม่มี |

**Why:** เจ้าของสั่ง "จัดระเบียบใหม่ ต้องการ 4 แบบ" (2026-07-17) แล้วเลือกตัด `filled` ทิ้งเอง — พื้น `bg-input` แบนไม่เข้าพวกกับแกนทรง×เงา และมี call site จริงแค่ที่เดียว. เดิม 3 ตัวก๊อปคลาสกันเองแล้วไม่ sync (Input=`rounded-md`, Textarea=`rounded-lg`, Select=`rounded-control`) → ยุบเป็นไฟล์กลาง.

**How to apply:**
- `<Input>` เปล่า = `default` = elevated อยู่แล้ว — **อย่าเติม `variant="elevated"` มือ** (alias เฉย ๆ ของเก่าไม่ต้องไล่ลบ)
- **ห้าม hardcode radius/shadow บน field** ทั้งใน primitive เองและ `className` ที่ call site (`rounded-full`, `rounded-sm`, `shadow-sm`) — เลือก variant แทน; literal ใน `className` ชนะ `fieldVariant()` เงียบ ๆ
- เพิ่มทรงใหม่ (เช่น `sharp`) → เติมใน `field-variants.ts` (`FIELD_SHADOW`/เซ็ต pill) ทั้ง 5 primitive ได้ฟรี; เพิ่มขนาด radius ใหม่ → `RADIUS_CLASS` ใน `radius.ts` (ใช้ร่วม Button/Badge) แล้วเติม `DemoRow` ใน `/theme`
- **มุมเหลี่ยม = prop `radius` (`sm`/`md`/`lg`, default `md` = 0.375rem) — ไม่ใช่โทเคน `--radius-control` (0.5rem)**; field ตั้งใจให้มุมคมกว่า Button. carve-out เดียวที่อนุญาตของกฎ "control ใช้ `rounded-control`" อยู่ที่ `radius.ts`/`fieldVariant`. **อย่า "แก้กลับ" default เป็นโทเคน**; ใส่ `radius="sm"` ต่อชิ้นได้ตามใจ — อย่า hardcode `className="rounded-*"`
- **Button ไม่เกี่ยว** — `default` ของ Button ยังเป็น CTA เขียว/teal; `elevated` ของ Button = secondary beside primary (คนละ namespace กับ field variant)
- **`filled` ตายแล้ว อย่า re-add** — เจอโค้ดเก่าอ้าง `variant="filled"` = โค้ดที่หลุด, tsc จะจับให้

## กับดัก
- **ทั้ง 5 ตัวมุมเท่ากันโดยตั้งใจ** → `rounded-md` (0.375rem) เหมือนกันหมด: เดิมก่อน sync ต่างกัน (Textarea `rounded-lg`, SelectTrigger/NativeSelect `rounded-control` 0.5rem; Input `rounded-md` อยู่แล้ว → ค่าสุดท้ายบังเอิญตรง Input เดิม). เป็นผลของการ sync ตามที่เจ้าของสั่ง ไม่ใช่บั๊ก — เจ้าของ click-test เองแล้วรับ 2026-07-17
- `NativeSelect` default prop เปลี่ยนจาก `'elevated'` → `'default'` (ค่าเท่ากัน แค่ชื่อ)
- `SelectTrigger`/`NativeSelect` เดิมให้ `hover:bg-muted` เฉพาะ non-filled → ตอนนี้ทุก variant ได้ hover เท่ากัน

## ประวัติ (อย่าย้อนทำ)
- 2026-06-01 flip `default`→ELEVATED + เพิ่ม `filled` (ตอนนั้น non-breaking เพราะไม่มี call site hardcode `variant="default"`); เก็บ `elevated` เป็น alias
- 2026-07-03 `NativeSelect` เข้ามาตรฐาน (เดิม `bg-input`/`rounded-xl`/`focus:ring-[2px]`)
- 2026-07-17 ยุบเป็น `field-variants.ts` + ลบ `filled` (call site เดียว = `Purchase/index.tsx` เลขที่ใบรับ read-only → `flat`)

แก้ในคอมมิตเดียวกัน: `docs/claude/ui-theming.md` (§ELEVATED + ตาราง 4 variant) + `/theme` showcase (Input/Textarea/Select มีแถว flat/pill/pill-flat). NativeSelect ยังไม่มีใน `/theme` (เหมือน charts) เลยไม่มี demo ให้อัป.

Card/Table ขาดขอบ = คนละ root cause (ขอบอยู่บน composite card + wrapper div รอบ `<Table>` ไม่ใช่บน primitive) ไม่เกี่ยวกับงานนี้. Relates to [[dialog-button-convention]].
