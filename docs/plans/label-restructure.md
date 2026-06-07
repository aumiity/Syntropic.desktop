# Plan — รื้อโครงสร้างฉลากยาใหม่ + ทำ LabelPaper เป็น component ส่วนกลาง

สถานะ: **DRAFT — รอ audit ก่อนเริ่ม**
เจ้าของงาน: LabelsTab redesign (ต่อจาก UI redesign pass)

---

## 1. เป้าหมาย

### 1.1 โครงสร้างฉลากใหม่ (ตาม spec ผู้ใช้)
```
ชื่อร้าน                         วันที่        ← แถวเดียว 2 ฝั่ง (ซ้าย/ขวา)
ที่อยู่ร้าน + เบอร์โทร
──────────────────────────────────────       ← เส้นคั่น (header_line)
ชื่อสินค้า
ชื่อสามัญ (ถ้ามี)                              ← ใหม่ — มาจาก "สินค้า" ไม่ใช่ตัวฉลาก
ปริมาณยา + ความถี่
มื้ออาหาร + เวลาที่รับประทาน                   ← แยกบรรทัดออกจากบรรทัดบน
ข้อบ่งใช้ (สรรพคุณ)
คำแนะนำ                                        ← บรรทัดของตัวเอง (เลิก fold เข้าหมายเหตุ)
```
- **ตัด "หมายเหตุ" (notes) ออกจากฉลาก**
- ยังไม่ระบุ: footer_line / lot_expiry / barcode → **ต้องถาม** (ดู §6)

### 1.2 เป้าหมายสถาปัตยกรรม
ทำ **component ส่วนกลางตัวเดียว** วาดกระดาษฉลาก เพื่อเลิก duplicate ระหว่าง:
- preview ใน Settings (`LabelSettingsTab`)
- preview ใน `LabelsTab`
- ตัวสร้าง HTML พิมพ์จริง (`buildLabelHtml`)

---

## 2. สถานะปัจจุบัน (ผลสำรวจ)

### ไฟล์/SSOT
- `src/lib/label/sections.ts` — SSOT ข้อมูล: `SECTIONS[]`, `SectionKey`, `SectionDef`, `LabelSettingsForm`, `LABEL_DEFAULTS`, `buildSectionStyle()` (เพิ่งแยกออกมา)
- `SECTIONS` keys ปัจจุบัน: `shop, header_line, product, dosage, indication, notes, footer_line, lot_expiry, barcode`
- การ render กระดาษ **duplicate 3 ที่**:
  - `LabelSettingsTab` preview (บรรทัด ~267-293) — ใช้ `s.sample`
  - `LabelsTab` preview (เพิ่งทำ) — ใช้ `sectionText()` (ข้อมูลจริง)
  - `LabelSettingsTab.buildLabelHtml()` (บรรทัด ~157) — สร้าง string ใช้ `s.sample`

### Settings designer ขับด้วย SECTIONS (data-driven)
- แท็บ **"บรรทัด"** (`TabsContent value="lines"`, ~391-426) → `SECTIONS.map(def => ...)` อ่าน `show_${key}` / `offset_x_${key}` / `offset_y_${key}` จาก form → **เพิ่ม/ลบ section จะไหลเข้า UI นี้อัตโนมัติ** ตราบใดที่ key ใน form ตรง
- `FONT_ROWS` (4 กลุ่ม: shop/product/dosage/small) — section ใหม่ผูกฟอนต์กับกลุ่มใดกลุ่มหนึ่ง

### Schema
- `label_settings` (schema.ts ~416 + migrations ~737-765): ต่อ section มี `show_X`, `offset_x_X`, `offset_y_X`. font ต่อกลุ่ม: `font_size_shop/product/dosage/small`, `bold_shop/product/dosage`. global: `line_spacing`, `section_gap`, paper, pad
- `product_labels` (เนื้อหาต่อสินค้า) มีจริง: `label_name, dose_qty, dosage_id, frequency_id, timing_id, indication_th/mm/zh, note_th/mm/zh, is_active, sort_order`
- **`product_labels` ไม่มี `advice_id`, `label_time_id`, `show_barcode`, `is_default`** — ไม่มี ALTER migration ใด ๆ เพิ่ม

### ⚠️ บั๊กเดิมที่สงสัย (ต้องให้ audit ยืนยัน)
`products:saveLabel` (products.ts ~891):
- **INSERT** ระบุคอลัมน์ตายตัว → omit `advice_id/label_time_id/show_barcode/is_default` ที่ฟอร์มส่งมา → เพิ่มฉลากได้ แต่ค่าพวกนี้ถูกทิ้งเงียบ ๆ
- **UPDATE** ใช้ dynamic `Object.keys(rest)` → จะ gen `advice_id = @advice_id` ฯลฯ บนคอลัมน์ที่ไม่มี → **`no such column: advice_id` → แก้ไขฉลากน่าจะพังอยู่แล้ว**
- preview LabelsTab อ่าน `(l as any).label_time_id`/`advice_id` ซึ่งจริง ๆ ไม่เคยถูกเซฟ → ตอนนี้ค่าเป็น undefined เสมอ

### การพิมพ์จริงต่อสินค้า
- **ยังไม่ wire** — `printLabel`/`previewLabelPdf` ถูกเรียกแค่จาก `LabelSettingsTab` (ข้อความตัวอย่าง). ไม่มี path พิมพ์ฉลากจากข้อมูลสินค้าจริง

---

## 3. สถาปัตยกรรมที่จะทำ

```
src/lib/label/
  sections.ts   [แก้]  โครงบรรทัดใหม่ + types + LABEL_DEFAULTS + buildSectionStyle
  content.ts    [ใหม่] - composeLabelContent(label, product, shop, lookups, opts) → Partial<Record<SectionKey,string>>
                       - SAMPLE_CONTENT: Record<SectionKey,string>  (ย้าย sample ออกจาก SECTIONS มาที่นี่)
src/components/label/
  LabelPaper.tsx [ใหม่] presentational: รับ { settings, content } → วาดกระดาษ 1:1
                       จัดการ section พิเศษ shop|date (2 ฝั่งในแถวเดียว)
```
ผู้ใช้:
- Settings preview → `<LabelPaper settings={form} content={SAMPLE_CONTENT} />`
- LabelsTab preview → `<LabelPaper settings={labelSettings} content={composeLabelContent(selected, product, shop, lookups)} />`
- พิมพ์จริง → `buildLabelHtml(settings, content)` วน SECTIONS + content เดียวกัน (string path ยังต้องแยกเพราะเป็น HTML string ไม่ใช่ React — แต่ใช้ SECTIONS + buildSectionStyle + content ร่วมกัน)

> หมายเหตุ: LabelPaper เป็น React component (preview). `buildLabelHtml` เป็น string builder (print). สอง path นี้รวมเป็นฟังก์ชันเดียวไม่ได้ (React vs HTML string) แต่ **ใช้ SECTIONS + buildSectionStyle + content map ตัวเดียวกัน** ได้ → ความเสี่ยง drift เหลือแค่ "วิธี map style → CSS" ซึ่งมี `styleToCss` อยู่แล้ว

---

## 4. SECTIONS ใหม่ (เสนอ)

| key | บรรทัด | kind | font group | content จาก |
|-----|--------|------|-----------|-------------|
| `shop` | ชื่อร้าน (+ วันที่ขวา) | text(พิเศษ) | shop | shop.shop_name / วันที่พิมพ์ |
| `shop_address` | ที่อยู่ + เบอร์ | text | small | shop.shop_address + shop_phone |
| `header_line` | เส้นคั่น | line | – | – |
| `product` | ชื่อสินค้า | text | product | product.name_for_print ‖ trade_name |
| `generic` | ชื่อสามัญ | text | small | product.drug_generic_name (ถ้ามี) |
| `dosage` | ปริมาณ + ความถี่ | text | dosage | dose_qty + dosage_name + frequency_name |
| `timing` | มื้อ + เวลา | text | dosage | timing_name + label_time_name |
| `indication` | ข้อบ่งใช้ | text | small | indication_th |
| `advice` | คำแนะนำ | text | small | advice_name |
| `footer_line`? | เส้นคั่นท้าย | line | – | – |
| `lot_expiry`? | Lot/หมดอายุ | text | small | (ตอนพิมพ์) |
| `barcode`? | บาร์โค้ด | text | small | product.barcode |

**ตัด:** `notes`
**เพิ่ม:** `shop_address`, `generic`, `timing`, `advice`
**`?` = รอตัดสินใจ** (§6)

### "วันที่" / "ชื่อร้าน" แถวเดียว 2 ฝั่ง
ทางเลือก:
- (ก) section `shop` render เป็น flex row: ชื่อร้านซ้าย + วันที่ขวา — **special-case ใน LabelPaper** (1 section, 2 ช่อง)
- (ข) แยก `date` เป็น section อิสระแล้วใช้ absolute/float — ยุ่งกับ offset model
- **เสนอ (ก)** — เพิ่มน้อยสุด, ไม่ต้องมี key `date` ใน schema

---

## 5. รายการแก้ไฟล์ (ลำดับทำ)

1. **schema.ts**
   - `label_settings`: ADD COLUMN `show_/offset_x_/offset_y_` สำหรับ `shop_address, generic, timing, advice` (+ `footer_line/lot_expiry/barcode` ถ้าเก็บ). คง columns `*_notes` ไว้เป็น dead (ปลอดภัยกว่าลบ)
     - ทั้งใน `CREATE TABLE` (ฐานใหม่) **และ** บล็อก migration ALTER (ฐานเดิม) — ต้องครบทั้งคู่
   - `product_labels`: ADD COLUMN `advice_id INTEGER REFERENCES label_advices(id)`, `label_time_id INTEGER REFERENCES label_times(id)` — **แก้บั๊กเดิม** (§2)
     - ตรวจชื่อ lookup table จริง (`label_advices`? `label_times`?) ก่อน FK
2. **products.ts `saveLabel`**
   - INSERT: เพิ่ม `advice_id, label_time_id` (+ `is_default`/`show_barcode` ถ้าจะใช้จริง — ดู §6)
   - UPDATE: dynamic อยู่แล้ว แต่ตอนนี้พังเพราะ key เกิน → พอเพิ่มคอลัมน์ครบจะหาย; **ต้อง allow-list กัน key แปลกปลอม** (`is_default`/`show_barcode` ถ้าไม่ทำคอลัมน์ ต้อง strip ออกจาก payload ฝั่ง renderer)
3. **sections.ts** — SECTIONS ใหม่ + SectionKey + LabelSettingsForm (เพิ่ม/ลบ key) + LABEL_DEFAULTS; ย้าย `sample` → `content.ts` (`SAMPLE_CONTENT`)
4. **content.ts** [ใหม่] — `composeLabelContent()` + `SAMPLE_CONTENT`
5. **LabelPaper.tsx** [ใหม่] — renderer กลาง + special shop|date row
6. **LabelSettingsTab.tsx** — preview ใช้ `<LabelPaper content={SAMPLE_CONTENT}/>`; `buildLabelHtml` ใช้ content map; แท็บ "บรรทัด" ได้ section ใหม่อัตโนมัติ (ตรวจ label ภาษาไทยของแต่ละ section)
7. **LabelsTab.tsx** — preview ใช้ `<LabelPaper>` + `composeLabelContent`; เพิ่มช่อง "ชื่อสามัญ" เป็น read-only จากสินค้า (ไม่ใช่ field ฉลาก); เอา field "หมายเหตุ" ออกจาก dialog (ตามที่ตัด notes)
8. **EditProduct/index.tsx** — ตรวจว่า `product.drug_generic_name` ถูก join มาให้ LabelsTab (ถ้ายังไม่มีต้องเพิ่ม)

---

## 6. จุดตัดสินใจ — LOCKED ✅

- **D1 ท้ายฉลาก** → เก็บ **barcode อย่างเดียว** (default ปิด). **ตัด** footer_line + lot_expiry ออกจาก SECTIONS
- **D2 toggle ฉลาก** → **ทำเป็นคอลัมน์จริง**: เพิ่ม `is_default` + `show_barcode` ใน `product_labels`
- **D3 ชื่อสามัญ** → **DEFER**. รอบนี้ **ไม่เพิ่ม** section `generic` (ไม่มี data source ในสินค้า). จดตำแหน่งที่ตั้งใจไว้ (ระหว่าง product กับ dosage) ไว้ทำพร้อมงาน generic-name ของ products ภายหลัง
- **D4 วันที่** → วันที่พิมพ์ (today) format `dd/mm/yyyy` พ.ศ. (สอดคล้องกับที่อื่นในแอป) — มุมขวาคู่ชื่อร้าน
- **D5 คอลัมน์ที่เลิกใช้** → คง `*_notes` / `*_footer_line` / `*_lot_expiry` ใน label_settings เป็น **dead column** (ไม่ลบ); แค่เอา key ออกจาก SECTIONS เพื่อไม่ render/ไม่โชว์ใน designer
- **สรรพคุณ พม่า/จีน** → คงไว้ใน dialog (data) แม้ layout ใหม่ render แค่ `indication_th`; **เอา field หมายเหตุ (note_th) ออกจาก dialog** (เลิกใช้)

### SECTIONS ใหม่ (สรุป LOCKED)
`shop`(+วันที่ขวา) → `shop_address` → `header_line` → `product` → `dosage`(ปริมาณ+ความถี่) → `timing`(มื้อ+เวลา) → `indication` → `advice` → `barcode`(default off)
- **เพิ่ม**: shop_address, timing, advice
- **ตัด (เอา key ออก)**: notes, footer_line, lot_expiry
- **เผื่อทีหลัง**: generic (ระหว่าง product↔dosage)

### Schema delta (LOCKED)
- `label_settings` ADD (CREATE + ALTER): `show_/offset_x_/offset_y_` × { `shop_address`, `timing`, `advice` } = 9 คอลัมน์
- `product_labels` ADD: `advice_id`→label_advices, `label_time_id`→label_times, `is_default` INTEGER DEFAULT 0, `show_barcode` INTEGER DEFAULT 0
- `saveLabel` INSERT: เพิ่ม 4 คอลัมน์ใหม่; UPDATE dynamic จะหายพังเมื่อคอลัมน์ครบ
- font group: shop_address→small, timing→dosage, advice→small

---

## 7. ความเสี่ยง / invariants

- **HARD: allow-list payload** — `saveLabel` UPDATE เป็น dynamic SQL; key เกิน = พังทั้ง statement. ต้องเพิ่มคอลัมน์ให้ครบ **หรือ** strip key ที่ renderer ก่อนส่ง
- **HARD: migration ต้องครบทั้ง CREATE + ALTER** — ฐานใหม่ใช้ CREATE, ฐานเก่าใช้ ALTER; ขาดอันใดอันหนึ่ง = ค่าหาย/พังคนละเครื่อง
- **drift print vs preview** — ต้องบังคับให้ทั้งสอง path กิน SECTIONS + content เดียวกัน
- **`sample` ย้ายที่** — ปัจจุบัน sample ฝังใน SECTIONS; ถ้าย้ายไป SAMPLE_CONTENT ต้องไม่มีใครอ้าง `s.sample` หลงเหลือ
- **first-child marginTop=0** — logic นี้อยู่ทั้ง preview + print ต้องคงไว้ใน LabelPaper
- **no-color-literal exemption** — กระดาษฉลากใช้ `bg-white/text-black` โดยตั้งใจ (มีคอมเมนต์กำกับ) — คง exemption
- **ไม่มี real print path ต่อสินค้า** — งานนี้แค่ทำ preview + โครง ให้พร้อม; การพิมพ์จริงต่อสินค้าเป็นงานแยก (อย่าเผลอคิดว่าทำเสร็จแล้วพิมพ์ได้)

---

## 8. ขอบเขตงานนี้ (เสนอ)
**ทำ:** สถาปัตยกรรมกลาง (LabelPaper + content.ts) → โครงสร้างฉลากใหม่ → schema migration → แก้บั๊ก saveLabel → อัปเดต 2 preview + dialog
**ไม่ทำในรอบนี้:** wire การพิมพ์ฉลากจริงต่อสินค้า (งานแยก)

---

## 9. ผล AUDIT (รอบ 1) — แก้ไขสมมติฐานที่ผิด

ยืนยันแล้วทุกข้อกับโค้ดจริง สรุปจุดที่ plan เดิม **ผิด/ประเมินต่ำ**:

- **(บั๊กเดิม ยืนยัน TRUE)** `saveLabel` UPDATE = dynamic SQL (`products.ts:894-896`); `product_labels` ไม่มี `advice_id/label_time_id` จริง (ไม่มี ALTER ใด ๆ) → **แก้ไขฉลากตอนนี้พังอยู่แล้ว** (`no such column: advice_id`). เพิ่มฉลากใหม่ไม่ throw แต่ทิ้งค่า 4 ตัวเงียบ ๆ (INSERT คอลัมน์ตายตัว `:899-904`)
- **(ชื่อสามัญ — ผิดหนัก, ต้อง re-scope)** `products` **ไม่มีคอลัมน์ `drug_generic_name_id`** เลย (มีแต่ใน TS type + ถูก **strip ทิ้งก่อน save** `index.tsx:263-264`); `products:get` ไม่ได้ join `drug_generic_names`. → "ชื่อสามัญ" = **งานใหม่ทั้งเส้น** (เพิ่มคอลัมน์ products + migration + เลิก strip + เพิ่มใน create/update list + join ใน products:get) ไม่ใช่แค่ "ตรวจว่ามี join". `generic_name_id` ที่ schema.ts:221 เป็นของ `drug_allergies` คนละตัว
- **lookup tables ชื่อจริง**: `label_dosages / label_frequencies / label_meal_relations / label_times / label_advices` (display = `name_th`). FK: `timing_id→label_meal_relations` (ไม่ใช่ label_times); ของใหม่ `advice_id→label_advices`, `label_time_id→label_times` ✅
- **`s.sample` ใช้แค่ 2 จุด** ทั้งคู่ใน LabelSettingsTab (`:162` print, `:291` preview); LabelsTab ไม่ใช้ → ย้ายไป SAMPLE_CONTENT ปลอดภัย. `styleToCss` local อยู่แล้ว (คงไว้ถูก)
- **dual-write 3 ที่ต่อ section ใหม่** (HARD): `label_settings` CREATE + ALTER array (`schema.ts:738-765`) + `LABEL_DEFAULTS`/`LabelSettingsForm`. ขาดอันใด → `saveLabelSettings` dynamic SQL (`settings.ts:265`) throw หรือค่าหายตอน load (`Object.keys(prev)` filter `:112`/LabelsTab `:65`)
- **shop|date = special-case 2 ที่** (drift surface): ต้องทำทั้ง `LabelPaper.tsx` (React) และ `buildLabelHtml` (string `:159`); ทิ้ง `whiteSpace:pre-line` ในแถวนั้น
- **font groups มีแค่ 4** (`font_size_shop/product/dosage/small`): section ใหม่ (shop_address/generic/timing/advice) ใช้ร่วมกลุ่ม small/dosage ไม่มีคุมขนาดอิสระ — ต้องโอเคกับเรื่องนี้
- **ลำดับงาน**: ต้องแก้ `schema.ts` ก่อน `sections.ts` แล้ว relaunch Electron (re-run migration) ก่อนทดสอบ save ไม่งั้น form key มาก่อนคอลัมน์ → `no such column`
- migration array รันแบบ `try{db.exec}catch{}` (idempotent) — ALTER ซ้ำปลอดภัย (`schema.ts:810-812`)

### ผลต่อ scope
- **บั๊กแก้ไขฉลาก** ต้องแก้แน่ (เพิ่มคอลัมน์ `advice_id`+`label_time_id` ใน product_labels + allow-list)
- **ชื่อสามัญ** บานปลายเป็นงาน schema+IPC ของ products → **ต้องถามผู้ใช้: ทำตอนนี้ หรือ defer บรรทัดชื่อสามัญไปก่อน**
