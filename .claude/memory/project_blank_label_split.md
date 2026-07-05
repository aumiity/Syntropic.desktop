---
name: project_blank_label_split
description: "ฉลากเปล่าแยกการตั้งค่าจากฉลากยาจริง (label_settings.profile) + designer เต็มรูปฝังใน /products/print — DONE 2026-07-05 (tsc PASS; e2e 17/17; พิมพ์จริง pending)"
metadata:
  type: project
---

# Blank-label settings split — DONE 2026-07-05

เจ้าของขอ (2026-07-05): แยกการตั้งค่าฉลากเปล่าออกจากฉลากยาจริง **อิสระ 100%** + ฝังหน้าปรับแต่งแนวเดียวกับฉลากจริงในแท็บฉลากเปล่าเลย (เลือกผ่าน AskUserQuestion: แยกอิสระ > override model; ฝังในแท็บ > dialog)

**Verified: tsc PASS ทั้ง 2 tsconfig + real-Electron e2e 17/17 (IPC isolation 7 + UI 10). พิมพ์จริงยัง pending.**

## Storage
- `label_settings` + คอลัมน์ **`profile TEXT NOT NULL DEFAULT 'drug'`** (CREATE + ALTER ทั้งสองจุดใน schema.ts) → ตารางเป็น "หนึ่งแถวต่อ profile": `drug` (แถว legacy เดิม) / `blank`
- **แถว blank เกิดแบบ lazy ตอน `getLabelSettings('blank')` ครั้งแรก โดย copy ทุกคอลัมน์จากแถว drug** (ยกเว้น id/profile) → วันแรกฉลากเปล่าหน้าตาเหมือนเดิมเป๊ะ แล้วค่อย diverge
- IPC `settings:getLabelSettings(profile?)` / `saveLabelSettings(data, profile?)` — **default 'drug' → ผู้เรียกเก่าทุกจุดไม่ต้องแก้**; save strip ทั้ง `id` และ `profile` ออกจาก payload (กัน dynamic-SQL พัง + กันย้าย row identity)

## UI
- **`src/components/label/LabelDesigner.tsx` (ใหม่)** = designer เต็มรูปที่ generalize จาก LabelSettingsTab (preview 1:1 + กระดาษ/ขอบ + ตาราง per-section font/bold/offset + PositionPad + reset ตามขนาด) รับ prop `profile: 'drug'|'blank'` + `onActions?`
  - `profile='blank'`: ซ่อนแถว **วันหมดอายุ** + การ์ด **บาร์โค้ด** (blankLabel.ts skip ทั้งคู่ — per-dispense data), ปุ่มพิมพ์ = งานพิมพ์จริงพร้อม stepper จำนวน (ไม่ใช่ทดสอบพิมพ์), มีโน้ต info "ตั้งค่าแยก ไม่กระทบฉลากยาจริง"; **ปุ่มบันทึก (UPD 2026-07-05): PrintTab ส่ง `onActions={setBlankActions}` → ปุ่มขึ้นไปอยู่บนแถบแท็บบนสุด ตำแหน่งเดียวกับ ตั้งค่า > ฉลากยา** (เดิมอยู่หัวการ์ด preview — เจ้าของขอย้ายให้เหมือนกัน)
  - **CheckRow "ใส่ช่องวันที่ (เขียนเอง)" ถูกถอดทิ้ง 2026-07-05 (เจ้าของชี้ว่าซ้ำ)** — ช่องวันที่บนฉลากเปล่าคุมด้วยแถว "วันที่" (`show_print_date`) ในตารางรูปแบบการพิมพ์ตัวเดียว; param `printDate` ของ `buildBlankLabelHtml` ตัดออกแล้ว (signature เหลือ `(settings, shop, copies)`) — อย่า re-add toggle ชั่วคราวซ้อน setting ถาวรอีก
  - **preview toggle ฉลากเปล่า/ตัวอย่าง ถูกถอดทิ้ง** — แต่ละ profile พรีวิว path ของตัวเองเท่านั้น (drug=sample, blank=blank) เพราะแยกกันแล้วโชว์ข้ามกันจะหลอกตา
- `Settings/LabelSettingsTab.tsx` → thin wrapper `<LabelDesigner profile="drug" onActions/>`  (import path เดิมทุกจุดไม่แตก)
- `Products/PrintTab/index.tsx` โหมด blank → render `<LabelDesigner profile="blank"/>` ทั้งก้อน; ลบ state `shop`/`printDate` + blank branch ใน preview effect / handlePrint / QtyDialog ออกหมด; **`label` (drug settings) ยังอยู่ เพราะโหมดสติ๊กเกอร์ใช้กระดาษ/เครื่องพิมพ์เดียวกับฉลากยา — อย่าลบ**
- `LabelPrintDialog.tsx` (POS): เพิ่ม state `blankSettings` (โหลด profile 'blank' ตอน open) — blank preview/print/ScaledPaper ใช้ตัวนี้; ฉลากยาจริงใช้ `labelSettings` เดิม

## กับดัก / ข้อควรรู้
- ข้อความ UI เดิม "section ที่ปิดไว้ใน ตั้งค่า > ฉลากยา จะไม่แสดงบนฉลากเปล่า" ถูกลบแล้ว — **ไม่จริงอีกต่อไป**
- parity rule ([[feedback_blank_sample_label_parity]]) ยังบังคับเชิงโครงสร้าง (builder ทั้งสอง gate แถวเหมือนกันเมื่อได้ form เดียวกัน) แต่ตอน runtime สอง builder ได้ **form คนละ profile** แล้ว
- e2e probe อยู่ที่ scratchpad session นี้ (verify-blank-label-split.mjs) — ยังไม่ได้เก็บเข้า tests/e2e; ถ้าอยากเก็บถาวรค่อยย้าย
