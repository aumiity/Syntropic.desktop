---
name: project_receipt_sections
description: ใบเสร็จ thermal slip — per-section style model (show/bold/align), ขนาดอักษร global, threading พนักงานขาย
metadata:
  type: project
---

**Receipt per-section style — DONE 2026-06-08.** ทำใบเสร็จ (thermal slip) ให้ปรับสไตล์ราย "กลุ่ม/บรรทัด" ได้แบบเดียวกับ [[project_drug_label]] แต่ตัด offset X/Y ออก เหลือ **show + bold + align (ซ้าย/กลาง/ขวา/กระจาย)**.

**SSOT = `src/lib/receipt/sections.ts`** (`RC_SECTIONS`, `RcAlign`, `alignCss`). 10 กลุ่มเรียงตามใบจริง: shop / shop_contact / tax_id / title / bill_info / **items** / summary / payment / footer / salesperson. แต่ละกลุ่ม controllable มีคอลัมน์ `show_<key>` + `bold_<key>` + `align_<key>` บน `receipt_settings`. `items` = รายการขาย **ไม่มี control** (fixed 2-col, render verbatim, โชว์เป็น row อ่านอย่างเดียวในตั้งค่า).

**กฏสำคัญ:**
- **ขนาดอักษร = GLOBAL** (`receipt_settings.font_size` ตัวเดียวทั้งใบ — เจ้าของขอ "ปรับที่เดียวทั้งหน้า"). ไม่มี per-section size. เอาความต่างขนาดเดิม (shop name base+3, total base+3 ฯลฯ) ออกหมด.
- **align ของกลุ่ม "pair"** (bill_info/summary/payment): `justify` = กระจาย 2 คอลัมน์ (ป้ายซ้าย-ค่าขวา แบบเดิม); `left/center/right` = แพ็ค "ป้าย ค่า" ติดกันแล้วจัดทั้งบรรทัด. ดู `pairBlock()` ใน `buildSlipHtml.ts`.
- **header_note ถูกลบทิ้ง** (แอป + DB `ALTER TABLE receipt_settings DROP COLUMN header_note`). ใบเสร็จเหลือ free-text แค่ `footer_note`. ⚠️ ความหมายเปลี่ยน: tax_id + branch เดิมโชว์เฉพาะ abbrevTax → ตอนนี้โชว์เสมอถ้า shop มีค่า + show_* เปิด.
- **ความสูงกระดาษ + จำนวนสำเนา = ตัดออกจาก UI (2026-06-08)** — ใบเสร็จ = ม้วนต่อเนื่อง → height **auto เสมอ**, copies **= 1 เสมอ** (ไม่เปิดให้ปรับ). บังคับที่ source: `print.ts` `SLIP_HEIGHT='auto'`/`SLIP_COPIES=1` (ครอบคลุม POS + reprint), หน้าตั้งค่าก็ hardcode auto/1, และ load-merge ใน ReceiptSettingsTab skip `paper_height_mm`/`copies` (pin = 0/1, normalize DB ตอนบันทึก). คอลัมน์ `paper_height_mm`/`copies` ยังอยู่แต่ถูกเมิน. (A4 `document_settings.copies` ไม่เกี่ยว — ยังใช้อยู่)
- **พนักงานขาย (salesperson)** = field ใหม่บน `SaleForPrint.salesperson_name`. POS ดึงจาก `getCurrentUserName()` (userStore) ทั้ง snapshot + previewSale; reprint ดึงจาก `normalizeSale` (`detail.sold_by_name`, มาจาก `reports:getSaleByInvoice` join `u.name`).

**ไฟล์ที่แตะ:** `sections.ts` (ใหม่), `buildSlipHtml.ts` (rewrite section-driven), `schema.ts` (CREATE + migration ALTER/DROP), `types/index.ts` (ReceiptSettings + SaleForPrint), `ReceiptSettingsTab.tsx` (UI ราย section ในแท็บ "รูปแบบ" + DEFAULTS + SAMPLE_SALE), `userStore.ts` (`getCurrentUserName`), `normalizeSale.ts`, `POS/index.tsx`. save-handler `settings:saveReceiptSettings` เป็น dynamic `Object.keys()` UPDATE อยู่แล้ว — ทุกคีย์ในฟอร์มเป็นคอลัมน์จริง. tsc ผ่าน; **ยังไม่ได้ทดสอบในแอปจริง**.
