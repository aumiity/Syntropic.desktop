# แผน: แยกทุก section ของฉลากยาให้เป็นอิสระ + เพิ่ม LINE ID / ข้อความเพิ่มเติม + ปรับ default

> **สถานะ: ลงมือเสร็จแล้ว (2026-06-07)** — แก้ครบ 7 ไฟล์, audit 2 รอบผ่าน, `npx tsc --noEmit` ผ่าน
> เหลือ: click-test ในแอปจริง (electron:dev) ตามหัวข้อ Verification — ยังไม่ได้ทดสอบ interactive
>
> ~~สถานะ: รออนุมัติ / ยังไม่ลงมือ~~

## Context (ทำไมต้องทำ)

ผู้ใช้ต้องการ:
1. **ฟอนต์ทุกส่วน default = 10 pt**
2. **ตัวหนา (default) เฉพาะ: ชื่อร้าน / ที่อยู่ / เบอร์โทร / ชื่อสินค้า**
3. **"แยกชิ้นส่วนทุกอย่างออกมา ทำ setting ให้ทุกอัน ห้ามรวมส่วน"** → per-section model
4. **เพิ่ม section "LINE ID"** (ดึงจากข้อมูลร้าน)
5. **เพิ่ม "ข้อความเพิ่มเติม"** — ช่องกรอกข้อความอิสระในหน้าตั้งค่าฉลาก พิมพ์เป็น **บรรทัดสุดท้าย** ของฉลาก

ปัญหาโครงสร้างเดิมที่ขวางอยู่:
- "เบอร์โทร" ไม่มี section ของตัวเอง — `composeLabelContent()` (`content.ts:68`) ต่อ `shop_address`+`shop_phone` เป็นบรรทัดเดียว
- ฟอนต์ใช้ระบบ tier แชร์กัน (`font_size_small` แชร์ 4 section) → ปรับตัวเดียวกระทบที่เหลือ
- ตัวหนามีแค่ 3 ตัว (`bold_shop/product/dosage`)
- **ข้อมูลพร้อมแล้ว:** `shop_line_id` มีอยู่ในตาราง `settings` (schema.ts:37) + แก้ได้ใน ShopTab อยู่แล้ว → แค่ดึงมาแสดง

เป้าหมาย: ทุก text section มี `font_size_<key>` + `bold_<key>` + `show_<key>` + `offset_x/y_<key>` ของตัวเอง ไม่แชร์ และเพิ่ม 3 section ใหม่: `shop_phone`, `shop_line_id`, `custom_text`

หมายเหตุ: bug รอบก่อน (preview ไม่เปลี่ยนฟอนต์เพราะ universal `* { font-family }` ใน `index.css:487` ทับ inherited) **แก้ไปแล้ว** ใน `LabelPaper.tsx` (ใส่ `fontFamily` inline ทุก text element) — เป็น diff ที่ค้างอยู่ก่อนเริ่มงานนี้

---

## โครงสร้างใหม่

### Section order (ล็อกใหม่)
`shop` → `shop_address` → **`shop_phone`** → **`shop_line_id`** → `header_line` → `product` → `dosage` → `timing` → `indication` → `advice` → `barcode` → **`custom_text` (บรรทัดสุดท้าย)**

รวม text section = 11 ตัว, line section = 1 (`header_line`)

### ที่มาของเนื้อหาแต่ละ section
- `shop` / `shop_address` / `shop_phone` / `shop_line_id` → จากข้อมูลร้าน (`composeLabelContent`)
- `product`–`barcode` → จาก label/สินค้า เดิม
- **`custom_text` → จาก `label_settings.custom_text` เอง** (config ไม่ใช่ content) → renderer ดึงจาก `settings` ไม่ใช่จาก content map

### Default (ตั้งให้ schema.ts + sections.ts ตรงกัน)
- `font_size_<ทุก section>` = **10**
- `bold_*` = **1** เฉพาะ `shop, shop_address, shop_phone, product` / ที่เหลือ (`shop_line_id, dosage, timing, indication, advice, barcode, custom_text`) = **0**
  - sync `bold_shop` 0→1, `bold_dosage` → 0 (ปัจจุบัน schema/sections ไม่ตรงกัน)
- `show_*` = **1** ทุกตัว ยกเว้น `barcode` = **0**
  - `custom_text` show = 1 ได้ (ข้อความว่าง → renderer ข้ามอยู่แล้ว, พิมพ์เมื่อไหร่โผล่เมื่อนั้น)
- `custom_text` (ค่า string) = **''**
- offset ใหม่ = 0

---

## ไฟล์ที่ต้องแก้

### 1. `electron/db/schema.ts` — DB (HARD invariant: ทุก key ใน form ต้องเป็นคอลัมน์จริง)
**CREATE TABLE `label_settings`** (~บรรทัด 420): แก้ default เดิม + เพิ่มคอลัมน์ใหม่ (รวม ~26 คอลัมน์ + 1 TEXT):
- แก้ default: `font_size_shop` 8→10, `font_size_dosage` 9→10, `bold_shop` 0→1, `bold_dosage`→0
- เพิ่ม `font_size_<key>` (DEFAULT 10) สำหรับ: shop_address, shop_phone, shop_line_id, timing, indication, advice, barcode, custom_text
- เพิ่ม `bold_<key>` สำหรับ: shop_address(1), shop_phone(1), shop_line_id(0), timing(0), indication(0), advice(0), barcode(0), custom_text(0)
- เพิ่ม `show_<key>` (DEFAULT 1): shop_phone, shop_line_id, custom_text
- เพิ่ม `offset_x_<key>`/`offset_y_<key>` (DEFAULT 0): shop_phone, shop_line_id, custom_text
- เพิ่ม `custom_text TEXT NOT NULL DEFAULT ''`
- `font_size_small` → กลายเป็น **DEAD column** (เก็บไว้ ไม่ลบ)

**Migration array** (~บรรทัด 779): เพิ่ม `ALTER TABLE label_settings ADD COLUMN ...` ให้ครบทุกคอลัมน์ใหม่ ด้วย DEFAULT เดียวกัน (มีผลกับ DB เดิม — `ADD COLUMN`/`CREATE TABLE IF NOT EXISTS` ไม่รันซ้ำบน DB เก่า)

### 2. `src/lib/label/sections.ts` — SSOT
- `SectionKey`: เพิ่ม `'shop_phone' | 'shop_line_id' | 'custom_text'`
- เปลี่ยน `SectionDef` เป็น per-section uniform: text section ใช้ convention `font_size_${key}` + `bold_${key}` (เลิก hardcode `fontSizeKey`/`boldKey`)
- `SECTIONS`: เพิ่ม `shop_phone` (label "เบอร์โทรร้าน"), `shop_line_id` (label "LINE ID"), `custom_text` (label "ข้อความเพิ่มเติม") ตามลำดับใหม่
- `LabelSettingsForm`: เพิ่มคีย์ใหม่ทั้งหมด + `custom_text: string`; เก็บ `font_size_small` ในฐานะ DEAD (ห้ามลบ ไม่งั้น load-filter strip แล้วเขียนทับเป็น undefined)
- `LABEL_DEFAULTS`: ใส่ค่าตามตารางข้างบน
- `buildSectionStyle()`: อ่าน `form[\`font_size_${def.key}\`]` + `form[\`bold_${def.key}\`]`

### 3. `src/lib/label/content.ts` — แยกเนื้อหา
- `ShopLike`: เพิ่ม `shop_line_id?: string | null`
- `SAMPLE_CONTENT`: แยก `shop_address` (เหลือที่อยู่ล้วน) + เพิ่ม `shop_phone: 'โทร. 02-xxx-xxxx'`, `shop_line_id: 'LINE: @syntropic'` (custom_text ไม่ใส่ที่นี่ — มาจาก settings)
- `composeLabelContent()`: `out.shop_address = shop?.shop_address || ''`; `out.shop_phone = shop?.shop_phone ? \`โทร. ${shop.shop_phone}\` : ''`; `out.shop_line_id = shop?.shop_line_id ? \`LINE: ${shop.shop_line_id}\` : ''`

### 4. `src/components/label/LabelPaper.tsx` — preview (React)
- รับ section ใหม่ผ่าน `SECTIONS` อัตโนมัติ
- **special-case `custom_text`:** ดึงข้อความจาก `settings.custom_text` แทน `content[key]` (custom_text เป็น config ไม่ใช่ content)
- ตรวจ `style.fontFamily` ยังครอบทุก text element ครบ (จากการแก้รอบก่อน)

### 5. `src/lib/label/html.ts` — print/PDF (HTML string)
- ใช้ `buildSectionStyle()` ร่วมกัน → รับ per-section font/bold อัตโนมัติ
- **special-case `custom_text` เหมือนกัน:** ดึงจาก `settings.custom_text` (ต้องแก้ทั้ง 2 path ตาม dual-render rule ใน `.claude/memory/project_drug_label.md`)

### 6. `src/pages/Settings/LabelSettingsTab.tsx` — UI
- แท็บ **"ฟอนต์"**: แทน `FONT_ROWS` (4 tier hardcode) ด้วย iterate `SECTIONS.filter(s => s.kind === 'text')` → แต่ละ section 1 แถว: `[label] [NumInput ขนาด] [ปุ่มตัวหนา]` (11 แถว) ทุกแถวมีปุ่มตัวหนา
- แท็บ **"บรรทัด"**: iterate `SECTIONS` อยู่แล้ว → section ใหม่โผล่อัตโนมัติ (show + X + Y)
  - **เพิ่ม FormField "ข้อความเพิ่มเติม (บรรทัดสุดท้าย)"** ด้านบนรายการ — `Input` ผูกกับ `form.custom_text`
- ปุ่มตัวหนา/Input ใช้ pattern เดิมในไฟล์; ทุก control สูง `h-9` ตามกฎ bar=h-12/control=h-9

### 7. `src/pages/Products/EditProduct/LabelsTab.tsx`
- ใช้ `LabelPaper` + `composeLabelContent` ร่วมกัน → LINE ID + custom_text แสดงอัตโนมัติ **ไม่ต้องแก้**

---

## ผลข้างเคียงที่ต้องรู้
- DB เดิมที่เคยปรับ "ขนาด small" จะถูกรีเซ็ตเป็น 10 (section ย้ายไปคอลัมน์ใหม่ default 10) — ยอมรับได้ใน restructure (ยังไม่ import DB จริง)
- เนื้อหาที่อยู่/เบอร์โทร/LINE compose ตอน render (ไม่เก็บใน DB) → ไม่ต้อง migrate ข้อมูล
- prefix "โทร. " / "LINE: " ตั้งใน `composeLabelContent` (ปรับคำได้ภายหลัง)
- `line_spacing`/`section_gap` default ยังเหลื่อมกัน schema(1.2/2) vs sections(1.5/2) — ไม่อยู่ในคำขอ ไม่แตะ

---

## Audit (ทำ 2 รอบ ตามที่ผู้ใช้สั่ง)
หลังลงมือเสร็จ ตรวจ diff ซ้ำ **2 รอบ** (แก้ที่เจอระหว่างรอบ) โฟกัส:
- **รอบ 1 — ความถูกต้อง/invariant:** ทุก key ใน `LABEL_DEFAULTS`/`LabelSettingsForm` ต้องมีคอลัมน์จริงใน `label_settings` (กัน `no such column` ตอน dynamic UPDATE ใน `electron/ipc/settings.ts:259`); migration ครบทุกคอลัมน์ที่เพิ่มใน CREATE TABLE; `font_size_small` + DEAD columns ยังอยู่ใน 3 ที่ (form/defaults/load-filter); dual-render (`LabelPaper.tsx` ↔ `html.ts`) special-case `custom_text` ตรงกันทั้งคู่; default ตรงกัน schema ↔ sections
- **รอบ 2 — UI/พฤติกรรม:** แท็บ "ฟอนต์" iterate text section ครบ 11 + ปุ่มตัวหนาทุกแถว; section order ถูก; prefix โทร./LINE ถูก; ไม่มี emoji/สีลิเทอรัล/raw HTML; ปุ่ม/ช่องสูง h-9; `npx tsc --noEmit` ผ่าน

## Verification (ทดสอบ end-to-end)
1. `npx tsc --noEmit` ผ่าน
2. `npm run electron:dev` → Settings → การพิมพ์ฉลาก:
   - แท็บ "ฟอนต์": 11 แถว ทุกแถวมีช่องขนาด + ปุ่มตัวหนา; default 10 ทุกแถว; ตัวหนาติดเฉพาะ ชื่อร้าน/ที่อยู่/เบอร์โทร/ชื่อสินค้า
   - แท็บ "บรรทัด": มี "เบอร์โทรร้าน" + "LINE ID" แยกบรรทัด + ช่อง "ข้อความเพิ่มเติม"
   - พิมพ์ข้อความในช่อง "ข้อความเพิ่มเติม" → Preview ซ้ายขึ้นบรรทัดสุดท้าย
   - Preview: ที่อยู่/เบอร์โทร/LINE คนละบรรทัด, ฟอนต์เปลี่ยนตามที่ตั้ง
3. "ดูตัวอย่าง PDF" + "ทดสอบพิมพ์" → ตรงกับ preview 1:1 (รวม custom_text บรรทัดสุดท้าย)
4. Products → แก้สินค้า → แท็บฉลากยา → preview มี LINE ID + custom_text
5. บันทึก → reload → ค่าคงอยู่ (ยืนยัน dynamic UPDATE ไม่ throw "no such column")
