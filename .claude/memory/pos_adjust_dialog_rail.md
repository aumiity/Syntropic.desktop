---
name: pos-adjust-dialog-rail
description: ตัดสต็อก dialog (POS) = โครง 2 โซน ตาราง+แผงตัดสินใจขวา; qty แก้ inline ด้วย NumInput (ลบ QtyDialog แล้ว), สาเหตุ = ChoiceCard
metadata:
  type: project
---

**DONE 2026-08-13 (tsc PASS; ยิงจริงผ่าน Playwright-Electron แล้ว รอ click-test มือ)**

`src/pages/POS/index.tsx` — dialog "ตัดสต็อก" ออกแบบใหม่จาก mockup 3 แบบ (เจ้าของเลือก **แบบ 1 = แผงสรุปด้านขวา**). ไฟล์ mockup ที่ใช้เสนอ = `claude_design/adjust-stock-dialog-mockup.html` (มีทั้ง 3 แบบ + dark toggle).

## โครงใหม่
- `<DialogContent size="full">` (เดิม `3xl`) + `h-[82vh]`, `<DialogBody className="grid grid-cols-[minmax(0,1fr)_19rem]">`
  - ซ้าย = ช่องสแกน + ตาราง **5 คอลัมน์** (รายการ / จำนวนที่ตัด / คงเหลือหลังตัด / มูลค่าทุน / ลบ) — ยุบคอลัมน์ `#`, `หน่วย`, `ล็อต`, `วันหมดอายุ` เดิมเข้าไปเป็น meta line ใต้ชื่อสินค้า + label ใต้ stepper
  - ขวา = rail `bg-muted/40` : สาเหตุ (บน) + สรุป (`mt-auto` ดันไปชิดล่างให้ใกล้ปุ่มยืนยัน)
- **ปุ่ม ยกเลิก/ยืนยัน ยังอยู่ใน `<DialogFooter>`** (ไม่ย้ายเข้า rail ตาม mockup) เพราะ modal contract บังคับ Header+Title+Body+Footer — ตรงนี้ mockup แพ้กฎบ้าน
- ซ้ายของ footer = **ป้ายบอกว่าติดอะไร** 3 สถานะ: ไม่มีรายการ (เทา, Info) / ยังไม่เลือกสาเหตุ (`bg-warning-soft`, AlertTriangle) / พร้อมยืนยัน + ชื่อสาเหตุ (`bg-success-soft`, Check) — แก้ปัญหาเดิมที่ปุ่มเทาแล้วผู้ใช้ไม่รู้ว่าเพราะอะไร

## สิ่งที่เปลี่ยนเชิงพฤติกรรม
- **จำนวนแก้ inline ด้วย `<NumInput stepper="split">`** — `max={availUnit}` (สต็อกที่แถวนี้เหลือใช้ได้จริง = base − ที่แถวอื่นของสินค้าเดียวกันกินไป ÷ qty_per_base) → กด + ตันเอง ไม่ต้องรอ toast. **ลบ `adjustQtyRowIdx` + บล็อก `QtyDialog` ของ adjust ออกแล้ว อย่า re-add** (`QtyDialog` ยังใช้ในโมดัลรับคืนอยู่ อย่าลบ import)
- **`NumInput` มีโหมด stepper 2 แบบแล้ว (เพิ่ม 2026-08-13 ตามคำขอเจ้าของ):** `stepper` = chevron ▲▼ ซ้อนกันฝั่งขวา (ของเดิม, ใช้จูนค่าที่พิมพ์เป็นหลัก) · **`stepper="split"` = − ซ้าย / + ขวา ขนาบค่าที่จัดกลาง** ใช้เมื่อ ±1 คือการกระทำหลัก (คอลัมน์จำนวน). ปุ่มเป็น `absolute inset-y-1 left-1/right-1 h-auto w-6` → สูงเท่า field เองทุกขนาด; input ได้ `px-7 text-center`; **มี demo ใน `/theme` › NumInput แล้ว**
- **หน่วยเป็นคอลัมน์ของตัวเอง** (เจ้าของสั่ง 2026-08-13) ไม่ซ้อนใต้ช่องจำนวน และไม่ซ้ำในคอลัมน์คงเหลือ → ตาราง 6 คอลัมน์: รายการ / หน่วย / จำนวนที่ตัด / คงเหลือหลังตัด / มูลค่าทุน / ลบ
- **โชว์ `คงเหลือ → หลังตัด` ทุกแถว** (หน่วยของแถวนั้น) — 0 = `text-warning-soft-foreground`
- `ADJUST_REASONS` = const module-scope; **`label` คือ string ที่ลงตาราง `reason` จริง — ห้ามแก้ถ้อยคำ** ไม่งั้นระเบียนเก่าจัดกลุ่มไม่ตรง; `desc` เป็น UI อย่างเดียว
- สาเหตุใช้ primitive `ChoiceCard` (`src/components/ui/choice-card.tsx`) กดซ้ำ = ยกเลิกเลือก; ช่อง "หรือพิมพ์สาเหตุเอง" โชว์ `''` เมื่อค่าปัจจุบันตรงกับ preset
- ล็อต/วันหมดอายุขึ้นในแถวตรง ๆ (เดิมซ่อนใน tooltip); หลายล็อต = `Badge variant="info-soft"` "FEFO N ล็อต" + tooltip แจกแจง; วันหมดอายุใกล้ = `alertColorClass(getProductExpiryLevel(...))`
- วันที่ผ่าน `formatDate()` แล้ว (เดิม `dayjs().format('DD/MM/YYYY')` ตรง ๆ)

## กับดักที่เจอ
- ตาราง adjust เดิม **ไม่มี side inset** — ใส่ `border-l-[16px] border-r-[6px] border-card` + `[scrollbar-gutter:stable]` ให้แล้วตามมาตรฐาน (`--card` กับ `--popover` ค่าเท่ากันทั้ง light/dark ใช้ `border-card` บนพื้น popover ได้)
- ถ่ายรูปทดสอบ: harness `tests/e2e/verify-pos-unit-guard.mjs` ใช้ซ้ำได้ แต่ **ต้อง `app.evaluate` สั่ง `setSize` ก่อน** ไม่งั้นหน้าต่าง default เล็กจนปุ่ม quick-action ทับกัน คลิกไม่โดน; ต้องมี vite dev :5173 รันอยู่ (NODE_ENV=development → `loadURL('http://localhost:5173')`)
- playwright ในเครื่องนี้เป็นแพ็กเกจ `playwright` (ไม่ใช่ `@playwright/test`) และ **ไม่มี chromium headless shell** → สคริปต์ browser ต้อง `chromium.launch({channel:'chrome'})`; สคริปต์ต้องวางในโฟลเดอร์ repo ไม่งั้น resolve `node_modules` ไม่เจอ

ดู [[project_pos_redesign]], [[feedback_dialog_button_convention]], [[project_sticker_font_size]] (NumInput)
