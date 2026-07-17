---
name: radius-axis-prop
description: Shared `radius` prop (sm/md/lg) on field + Button + Badge via radius.ts — per-instance corner control; explore now, codify pattern later.
metadata:
  type: project
---

**DONE 2026-07-17 (tsc PASS exit 0; รอ click-test) — เพิ่ม "แกนที่ 3" ให้ control primitive: มุมโค้งคุมต่อชิ้นได้ผ่าน prop `radius`.**

## ทำไม
เจ้าของอยากมิกซ์มุม `sm`/`md` (และ `lg`) คละกันทั้ง field/button/badge แต่ **ยังไม่รู้กฎ** — เลยเลือกแนวทาง **"custom ต่อชิ้นไปก่อน พอเจอแพทเทิร์นซ้ำ ๆ ที่ชอบ ค่อยตั้งกฎตามหลัง"**. ทางเลือกที่เอา = prop `radius` (สะอาด, grep ได้) แทนการ hardcode `className="rounded-*"` (ไล่ยาก + ชน `fieldVariant()` เงียบ ๆ).

## SSOT = `src/components/ui/radius.ts`
```ts
export type Radius = "sm" | "md" | "lg"          // 0.25 / 0.375 / 0.5 rem (อิงสเกล tailwind, ที่ --radius=0.5rem)
export const RADIUS_CLASS = { sm:"rounded-sm", md:"rounded-md", lg:"rounded-lg" }
```
ใช้ร่วม 3 ตระกูล — **field (Input/SearchInput/Textarea/SelectTrigger/NativeSelect) + Button + Badge**.

## กลไกต่อ primitive (ทุก default = หน้าตาเดิม non-breaking)
- **Field:** `fieldVariant(variant, radius="md")` — refactor `field-variants.ts` แยก radius ออกจากเดิม (`FIELD_SHAPE` → `FIELD_SHADOW` + radius แยก). **square variant (default/flat) ใช้ radius; pill/pill-flat = `rounded-full` เสมอ (radius ไม่มีผล)**. primitive รับ prop `radius?: Radius` default `md`.
- **Button:** prop `radius?: Radius` (ไม่มี default) → ถ้าใส่ ต่อคลาส `RADIUS_CLASS[radius]` **หลัง `buttonVariants()` ก่อน `className`** ใน `cn()` → twMerge ให้ prop ชนะมุมที่ baked ต่อ size (base `md`, size ใหญ่ `lg`) แต่ `className` ยัง override ได้; ไม่ใส่ = มุมเดิมตาม size.
- **Badge:** prop `radius?: Radius` (ไม่มี default) → pattern เดียวกัน; base คือ `rounded-sm` ไม่ใส่ prop = เดิม.

## How to apply
- อยากมุมอื่นต่อชิ้น: `<Input radius="sm">` `<Button radius="lg">` `<Badge radius="md">` — **ห้าม `className="rounded-*"`**
- **จะตั้งกฎเมื่อไหร่:** `grep -rn "radius=" src/` ดูว่าเจ้าของชอบ sm/lg ตรงไหนบ้าง → ยกเป็น default ของ primitive หรือ convention ต่อ context (compact/dialog/ฯลฯ) แล้วค่อยถอด prop ที่ซ้ำออก
- เพิ่มขนาด radius ใหม่ → `RADIUS_CLASS` ที่เดียว (ได้ทั้ง 3 ตระกูลฟรี)

## กับดัก / บทเรียน
- `cn()` = `twMerge(clsx(...))` → **ลำดับสำคัญ**: radius-prop ต้องมา **หลัง** cva output แต่ **ก่อน** `className` เพื่อให้ prop ชนะ baked แต่ยอม `className` override. Button เดิมส่ง `className` เข้า `buttonVariants({..., className})` — ต้องย้าย `className` ออกมาไว้ท้าย `cn()` แทน.
- pill ignore radius (จงใจ) — อย่าไปทำให้ pill รับ radius.
- FIELD_SHAPE ถูกลบ (แทนด้วย FIELD_SHADOW + RADIUS_CLASS) — ถ้าเจอ doc/comment เก่าอ้าง FIELD_SHAPE = stale.

## control heights → h-8 (DONE 2026-07-17, tsc PASS)
ทั้ง 3 ข้อที่เคย park ทำครบแล้ว (เจ้าของสั่ง "เปลี่ยน h-8 ให้หมด"):
- **`Button size="lg"` h-9 → h-8** (button.tsx) — ตัวแม่ กระทบทุก `<Button size="lg">` ที่ไม่ได้ override ความสูงเอง ให้สืบทอด h-8 ฟรี. **หมายเหตุ:** `size="lg"` ตอนนี้ = `size="default"` เป๊ะ (ทั้งคู่ `h-8 gap-1.5 px-2.5`) — ต่างแค่ชื่อ ยังไม่ยุบรวม.
- **`discount-dialog` footer 3 ปุ่ม** `w-24 h-9` → `w-24 h-8` (แถวสรุปในกล่อง h-9 ไม่ใช่ปุ่ม — ไม่แตะ)
- **`tabs` variant `toggle`** baked `:h-9` → `:h-8` (+ คอมเมนต์ + `docs/claude/ui-components.md`)
- **38 ปุ่มไอคอน filter strip `h-9 w-9` → `h-8 w-8`** ทั่ว src/pages+dialogs+label (sed แพทเทิร์นเดียว, รวม doc text ใน Theme showcase)

## ค้าง — 129 จุด page-level h-9 (เลื่อนโดยตั้งใจ)
- ยังเหลือ **~129 `h-9` ในเพจ** ที่ไม่ใช่ `h-9 w-9` — ส่วนใหญ่เป็น control ในบาร์ (`SearchInput className="h-9"`, `SelectTrigger className="h-9 ..."`, `Button size="lg" className="h-9 px-2"` = explicit override ทับ h-8 ของ size ใหม่).
- **เจ้าของเลือก: ไม่กวาดรวม → แก้ h-8 ตอน redesign แต่ละหน้า** (เห็น context จริงก่อน). **อย่ากวาด 129 จุดเชิงรุก** — รอทำตอนเจาะหน้านั้น ๆ.
- กฎ control-height ใน CLAUDE.md/ui-table-card ยัง **⏸️ PAUSED** — de facto ใหม่คือ h-8 แต่ยังไม่ codify จนกว่าหน้าจะครบ.

## แนวทางที่เจ้าของเลือก (workflow)
ทำ **หน้างานจริงก่อน** (มองภาพรวมจากหน้า ไม่ใช่จาก component) — ติดขัด component ตรงไหนค่อยแก้ตรงนั้น. อย่าไล่แก้ component เชิงรุกโดยไม่มีหน้าจริงมาขับ.

Related: [[input-elevated-default-flip]] (field variant set), [[project_theme_variant_audit]] (งาน /theme audit ที่ trigger เรื่องนี้), [[project_ui_redesign_pass]] (งาน redesign หน้าจริงที่กำลังจะลุย), [[feedback_border_over_ring]].
