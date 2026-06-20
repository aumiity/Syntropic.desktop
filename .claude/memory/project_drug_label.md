---
name: project_drug_label
description: Drug-label system architecture, section order, dual-render paths, known gaps, and a critical better-sqlite3 INSERT pitfall
metadata:
  type: project
---

## Status — 2026-06-20e (สลับ fold: barcode → แถวชื่อยา, qty → แถวที่อยู่/เบอร์) — tsc PASS, in-app verify pending

เจ้าของขอย้าย barcode ออกจากแถวที่อยู่/เบอร์ (ยาวไป) → ไปพับขวา**แถวชื่อยา (product)** แทน qty; แล้วเอา **qty (สั้น) ขึ้นไปพับขวาแถว "ที่อยู่ร้าน / เบอร์โทร"** แทนที่ barcode. = **สลับ host ของ qty ↔ barcode**:
- **fold map ใหม่:** `print_date`→shop, **`qty`→shop_address**, **`barcode`→product**, `expiry`→dosage.
- `html.ts` + `LabelPaper.tsx` (**dual-render**): บล็อก `product` = name(ซ้าย)+**barcode**(ขวา, alignItems:center); บล็อก `shop_address` = address+phone(ซ้าย)+**qty**(ขวา, alignItems:baseline). filter: product โชว์เมื่อ `show_product||show_barcode`; shop_address โชว์เมื่อ `show_shop_address||show_qty`.
- qty ใช้ font_size_qty/bold_qty/offset_qty เดิม; barcode ใช้ font_size_barcode(สูง)/barcode_width_mm/offset_barcode เดิม (แค่ย้าย host row). `content.ts`/`sections.ts` SECTIONS คงเดิม (qty/barcode ยัง skip+fold) — แก้แค่ comment fold map.
- blankLabel ไม่กระทบ (ข้าม qty/barcode อยู่แล้ว).

## Status — 2026-06-20d (เบอร์โทร รวมเข้า ที่อยู่ร้าน บรรทัด/หัวข้อเดียว — DISPLAY merge + ย้าย barcode fold) — tsc PASS, in-app verify pending

เจ้าของขอเอา "เบอร์โทร" (shop_phone) ขึ้นไปรวมกับ "ที่อยู่ร้าน" (shop_address) บรรทัดเดียว + settings หัวข้อเดียว เลื่อนด้วยกัน. **DISPLAY merge แบบเดียวกับ dosage/frequency** (ข้อมูลแยก `out.shop_address`/`out.shop_phone` เหมือนเดิม). **ประเด็นพิเศษ: barcode เคยพับขวาบรรทัด shop_phone → ย้ายมาพับขวาบรรทัด shop_address แทน** (ไม่งั้นหาย):
- `content.ts` = **คงเดิม** (out.shop_address + out.shop_phone แยก; sample 4 ภาษามี shop_phone).
- `sections.ts` = เอา `shop_phone` ออกจาก `SECTIONS`; relabel `shop_address` → **"ที่อยู่ร้าน / เบอร์โทร"**; แก้ comment fold (barcode → shop_address); คอลัมน์ `*_shop_phone` = DEAD.
- `html.ts` + `LabelPaper.tsx` (**dual-render**) = ลบ special-case `shop_phone`, เพิ่ม special-case **`shop_address`**: ซ้าย = `[content.shop_address, content.shop_phone].join('  ')` (สไตล์ shop_address) + ขวา = barcode fold (offset/size ของ barcode เดิม). filter: `shop_address` โชว์เมื่อ `show_shop_address || show_barcode`. `show_shop_address` คุม text ทั้งคู่ (show_shop_phone = DEAD).
- `blankLabel.ts` = `case 'shop_address'` รวม address+phone บรรทัดเดียว; `case 'shop_phone'` → break.

**Caveat:** address+phone(+barcode) บรรทัดเดียว ถ้ายาวจะ truncate (nowrap+ellipsis ตามแพทเทิร์น host-row เดิม) — เจ้าของปรับ font/ตำแหน่งเอง. ค้าง: in-app verify (เปิด barcode ด้วยดูว่าพับขวาถูก).

## Status — 2026-06-20c (วิธีใช้ + ความถี่ รวมบรรทัด/หัวข้อเดียว — DISPLAY merge ไม่ใช่ data merge) — tsc PASS, in-app verify pending

เจ้าของขอรวม "วิธีใช้" (dosage) + "ความถี่" (frequency) เป็น **บรรทัดเดียว + ตาราง settings หัวข้อเดียว เลื่อนด้วยกัน** แต่ **ห้ามจับข้อมูลใน DB/content มายำรวมเป็น string เดียว** (ย้ำชัด: `out.dosage`/`out.frequency` ต้องแยกกันเหมือนเดิม). วิธี = **display merge**:
- `content.ts` = **คงเดิม** (ข้อมูลแยก `out.dosage` + `out.frequency`; SAMPLE ก็แยก dosage/frequency 4 ภาษา). **ห้าม revert ไปรวม string** (เคยลองแล้วเจ้าของบอกไม่ใช่).
- `sections.ts` = เอา `frequency` ออกจาก `SECTIONS` (ไม่มีบรรทัด/แถว settings ของตัวเอง) + เปลี่ยน label `dosage` → **"วิธีใช้ / ความถี่"** (หัวข้อรวม). คอลัมน์ `*_frequency` ทั้งชุด = **DEAD** (เก็บไว้ใน LabelSettingsForm/LABEL_DEFAULTS/load-filter กัน round-trip พัง).
- `html.ts` + `LabelPaper.tsx` (**dual-render — แก้คู่กันเสมอ**) = ในเคสพิเศษแถว `dosage` เปลี่ยน `dosageText` เป็น `[content.dosage, content.frequency].filter(Boolean).join(' ')` → frequency แสดง inline ต่อท้าย dosage ใช้ font/bold/offset ของ dosage; `show_dosage` คุมทั้งคู่ (show_frequency = DEAD/ไม่อ่าน). expiry ยังพับขวาเหมือนเดิม.
- `blankLabel.ts` = ฟอร์มเปล่ารวมเป็นบรรทัดเดียวด้วย helper ใหม่ `dosageFreqRow` ("รับประทานครั้งละ ___ วันละ ___ ครั้ง", 2 เส้น flex-share, สไตล์ dosage); `case 'frequency'` → `break` (ตายแล้วเพราะหลุดจาก SECTIONS).

**ผลพิมพ์เท่ากับ data-merge เป๊ะ** แต่ข้อมูลสะอาด (แยกคืนได้ทันที). นี่คือการ**ย้อน split 2026-06-19c** แต่ทำที่ชั้น render/settings ไม่ใช่ชั้นข้อมูล. ค้าง: in-app verify.

## Status — 2026-06-20b (Settings designer พรีวิวสลับ ฉลากเปล่า ↔ ข้อมูลตัวอย่าง) — tsc PASS, in-app verify pending

เจ้าของขอ designer พรีวิวได้ 2 แบบ สลับด้วยสวิตช์ซ้าย-ขวา. แก้ **ไฟล์เดียว `LabelSettingsTab.tsx`** (ไม่แตะ schema/IPC/builder):
- state `previewMode: 'blank' | 'sample'` (default `'blank'`) + `Tabs variant="toggle"` 2 ช่อง (ฉลากเปล่า | ข้อมูลตัวอย่าง) วางกึ่งกลางเหนือกระดาษพรีวิว (pattern เดียวกับ toggle ภาษาใน LabelsTab).
- เปลี่ยนชื่อ state `blankHtml`→`previewHtml`. build effect เลือก builder ตามโหมด: blank→`buildBlankLabelHtml(form,shop,1,true)`, sample→`buildLabelHtml(form, sampleContent, todayBE())`. dep เพิ่ม `previewMode`+`sampleContent`.
- **`sampleContent` (useMemo[shop])** = `SAMPLE_CONTENT_BY_LANG.th` (mockup ยา Paracetamol) **overlay หัวร้านจริง** (shop/address/phone/line) จาก `getShop()` แบบเดียวกับ blank (prefix 'โทร. '/'LINE: ', ว่าง→'' แถวซ่อนเอง) → ทั้ง 2 โหมดหัวร้านตรงกัน, ต่างแค่ส่วนข้อมูลยา. **มติเจ้าของ:** ตัวอย่างฉลาก mock แค่ข้อมูลยา นอกนั้นใช้ค่าจริงหมด.
- ปุ่ม "ทดสอบพิมพ์" พิมพ์ **ตามโหมดที่พรีวิวอยู่** (preview = print 1:1). หัวการ์ด "ตัวอย่างฉลากเปล่า"→"ตัวอย่างฉลาก".
- **กลับด้านจาก 2026-06-20 (ฉลากเปล่าอย่างเดียว):** re-import `buildLabelHtml`+`SAMPLE_CONTENT_BY_LANG`+`todayBE` (sample กลับมาแต่ผ่าน `buildLabelHtml`/iframe **ไม่ใช่ LabelPaper** — LabelPaper ยังไม่ revive ที่ designer; ไม่มี toggle ภาษา ใช้ th อย่างเดียว YAGNI).

ค้าง: in-app verify (สลับ 2 โหมด + ทดสอบพิมพ์ทั้งคู่).

## Status — 2026-06-20 (ฉลากเปล่า = template ฉลากยาจริง + Settings designer พรีวิวฉลากเปล่า) — tsc PASS, in-app verify pending

เจ้าของขอ: ฉลากเปล่า (write-your-own) ต้องใช้ **layout/ตำแหน่ง/ฟอนต์/offset เดียวกับฉลากยาจริง** (ตาม `label_settings`) เป๊ะ แล้ว "เขียนทับ" เฉพาะ section ข้อมูลยาด้วยช่องเขียนเอง. **Insight เจ้าของ:** ออกแบบ layout โดยยึดฉลากเปล่า (ข้อความยาวสุด: prompt+เส้น+วงเลือก 2 บรรทัด) ให้พอดี → ฉลากยาจริงที่สั้นกว่าพอดีตามเสมอ → ใช้ฉลากเปล่าเป็น **worst-case design target**.

- **`src/lib/label/blankLabel.ts` เขียนใหม่:** เลิกใช้ layout เฉพาะตัวเดิม. เดิน `SECTIONS` + `buildSectionStyle` (ตัวเดียวกับฉลากยา → ตำแหน่งตรงกันรับประกัน). ส่วนหัวร้าน (shop/address/phone/line_id) = ข้อมูลจริงจาก `getShop()`; drug-info sections (product/dosage/frequency/timing/indication/advice) = แทนด้วย `fieldRow` (prompt + เส้น underline แบบ flex stretch) / `timingRow` (2 แถววงเลือก ก่อน-หลัง-พร้อมอาหาร + เช้า-กลางวัน-เย็น-ก่อนนอน, **ไม่มี label "มื้อ"/"เวลา"** ตามที่เจ้าของขอ); ข้าม qty/expiry/barcode (per-dispense ไม่มีความหมายบน blank). **เคารพ `show_*`** — section ที่ปิดใน Settings ก็ไม่โผล่บน blank. param ใหม่ `printDate` คุมแถววันที่ (true=วันนี้ todayBE / false=เว้นว่างเขียนเอง). **ถอด LABEL_FIT_SCRIPT** (ให้ตรงฉลากยาที่เลิก shrink-to-fit แล้ว).
- **`PrintTab/index.tsx` (`/products/print` แท็บฉลากเปล่า):** เพิ่ม state `printDate` + CheckRow "พิมพ์วันที่ (วันนี้)" (default true) ส่งเข้า preview+พิมพ์.
- **`LabelSettingsTab.tsx` (Settings designer) เปลี่ยน preview เป็น "ฉลากเปล่าอย่างเดียว"** (เจ้าของเลือก option นี้ — **ตัด LabelPaper + sample Paracetamol + ตัวเลือกภาษา th/en/mm/zh ทิ้ง**, ยอมเสียการเช็คฟอนต์พม่า/จีน): preview = `<iframe srcDoc={blankHtml}>` (buildBlankLabelHtml, printDate=true ให้เห็นแถววันที่ไว้จัดตำแหน่ง) scale ด้วย `transform:scale(zoom)` (ไม่ใช่ CSS zoom — iframe mm doc ไม่ขยายตาม wrapper zoom, ดู PrintTab). ปุ่ม "ทดสอบพิมพ์" พิมพ์ฉลากเปล่าด้วย. ลบ `previewContent` memo + `lang` state + imports (SAMPLE_CONTENT_BY_LANG/composeLabelContent/LabelPaper/buildLabelHtml/LANG_OPTIONS/Languages/todayBE).
- **`LabelPrintDialog.tsx` (POS, builder ใช้ร่วม):** ส่ง `printDate=true` (จ่ายยาวันนี้) — กันแถววันที่หายตอน default flip.
- **เดิม blank มี "วันที่ ____/____/____" เขียนเอง → เลิก** แล้ว: ติ๊กพิมพ์=วันนี้จริง / ไม่ติ๊ก=เว้นว่าง (ไม่มี placeholder underscore).

ค้าง: in-app verify (พิมพ์จริง + เทียบ blank vs ฉลากยาจริงว่าตำแหน่งตรงกัน). **หมายเหตุ:** Architecture table ด้านล่าง (Settings preview shop header / Sample text rows) = ของเก่าก่อนเปลี่ยนเป็นพรีวิวฉลากเปล่า — `LabelPaper` ยังใช้ที่ per-product LabelsTab อยู่ (ไม่ถูกลบ) แต่ **ไม่ใช้ใน Settings designer แล้ว**.

## Status — 2026-06-19c (แยก ความถี่ ออกจาก วิธีใช้) — tsc PASS, in-app verify pending

เดิม `out.dosage = [dose, dosageName, frequencyName].join(' ')` รวม วิธีใช้+ความถี่ บรรทัดเดียว. เจ้าของขอแยก → **section ใหม่ `frequency` (ความถี่)** เป็นบรรทัดของตัวเอง วางถัดจาก dosage (render หลัง dosage row; ใน SECTIONS order = product, qty, dosage, expiry, frequency, timing — expiry พับเข้า dosage จึง render ออกมาเป็น dosage→frequency→timing). 
- `content.ts`: `out.dosage = [dose, dosageName].join(' ')` (ตัด frequency ออก) + `out.frequency = frequencyName`. แก้ sample ทั้ง 4 ภาษาแยก dosage/frequency.
- **frequency = section ปกติ (ไม่พับ)** → render path generic จัดการเอง **ไม่ต้องแตะ html.ts/LabelPaper.tsx**. ตาราง "รูปแบบการพิมพ์" ได้แถว "ความถี่" อัตโนมัติ.
- คอลัมน์ใหม่ครบชุด (`show_/font_size_/bold_/offset_x_/offset_y_frequency`) CREATE+migration + `LabelSettingsForm`/`LABEL_DEFAULTS` (default show=1). ไฟล์: sections.ts, content.ts, schema.ts เท่านั้น.

## Status — 2026-06-19b (ถอด auto shrink-to-fit ออกจากฉลากยา) — tsc PASS, in-app verify pending

เจ้าของไม่เอา auto-shrink: เวลาเนื้อหาเยอะระบบย่อ font ทั้งฉลากเอง → ค่าที่ตั้ง + ตำแหน่งที่เลื่อนไม่ตรงกับที่แสดง (ไม่ WYSIWYG). **ถอดเฉพาะฉลากยา**:
- `LabelPaper.tsx` — ลบ `useLayoutEffect`/`useRef` + `computeFitScale` ที่ apply `transform:scale(k)`; render ตามขนาดที่ตั้งเป๊ะ, paper `overflow:hidden` ตัดส่วนล้น (เท่าที่พิมพ์จริง).
- `html.ts` — ลบ `<script>${LABEL_FIT_SCRIPT}</script>` ออกจาก `buildLabelHtml` + `buildLabelSheetHtml` (+ import). `window.__labelFitReady` กลายเป็น undefined → `printer.ts` ข้าม await นั้นเอง (guard `if (window.__labelFitReady)` ทุกจุด — **ไม่แตะ printer.ts**, fonts ยังรอผ่าน `document.fonts.ready` ที่ handler แยกอยู่แล้ว).
- `fit.ts` — ลบ `computeFitScale` (เหลือ dead หลังถอดจาก LabelPaper) + อัปเดต header. **เก็บ `LABEL_FIT_SCRIPT` + `LABEL_FIT_MIN_SCALE` ไว้** เพราะ **ป้ายราคา (`tags/priceTagHtml`), สติกเกอร์บาร์โค้ด (`tags/stickerHtml`), ฟอร์มเปล่า (`label/blankLabel`)** ยังใช้ (ดีไซน์ที่ตั้งใจให้ย่อลง sticker เล็ก — คนละฟีเจอร์ อย่าถอด).

**กฎใหม่:** ฉลากยา = WYSIWYG เป๊ะ, ล้น = clip (overflow:hidden) ผู้ใช้จัดเอง. ห้าม re-add shrink-to-fit ให้ฉลากยา. (ถ้าอยากเห็นส่วนล้นในตัวออกแบบ ค่อยเปลี่ยน `overflow` ของ LabelPaper เป็น visible ทีหลัง — ยังไม่ทำ เพราะ print clip อยู่ดี + กระทบ 3 พรีวิว).

## Status — 2026-06-19 (จำนวน + วันหมดอายุ บนฉลาก) — tsc PASS, in-app verify pending

เพิ่ม 2 section ใหม่ตามคำขอเจ้าของ ("ฉลากสินค้า") — **ทั้งคู่เป็น folded section** (พับเข้าแถวอื่นชิดขวา) รวมเป็น **4 ตัวที่พับ**: `print_date`→`shop`, `barcode`→`shop_phone`, `qty`→`product`, `expiry`→`dosage`:
- **`qty` (จำนวน)** = **พับเข้าแถว `product`** ด้านขวา. แสดง `[N]` **ไม่มีหน่วย** (วงเล็บ baked ใน `composeLabelContent`). แถว product = ชื่อซ้าย + จำนวนขวา `justify-content:space-between` + `alignItems:baseline` (อยู่บรรทัดแรกของชื่อแม้ชื่อตก 2 บรรทัด; ชื่อ yield, กล่องจำนวน `flexShrink:0`). offset ของ product ยกออกจาก flex container ไปใส่ span ชื่อ; จำนวนใช้ offset_*_qty ของตัวเอง. แถวโชว์เมื่อ `show_product || show_qty`.
- **`expiry` (วันหมดอายุ)** = **พับเข้าแถว `dosage` (วิธีใช้/วิธีกิน)** ด้านขวา (เปลี่ยนจากเดิมที่เป็นบรรทัดของตัวเอง — เจ้าของขอ 2026-06-19 "ให้อยู่บรรทัดเดียวกับวิธีกิน ชิดขวา ปรับแยกอิสระ"). แสดง `EXP.dd/mm/yyyy` **ค.ศ.** ผ่าน `formatDate()` (field เดียวบนฉลากที่เป็น ค.ศ. — print_date ยังเป็น พ.ศ. ผ่าน todayBE, ตั้งใจ). โครงสร้าง mirror product+qty เป๊ะ: dosage ซ้าย + expiry ขวา, offset dosage ยกไปใส่ span dosage, expiry ใช้ offset_*_expiry เอง. แถวโชว์เมื่อ `show_dosage || show_expiry`. ตำแหน่งใน `SECTIONS` ย้ายไปต่อจาก `dosage`.

**แหล่งข้อมูลจริง (insight สำคัญ):** ตะกร้า POS พก `it.product.lots` มาด้วยอยู่แล้ว (จาก `pos:searchProducts` เรียง expiry ASC; POS ใช้ทำ expiry warning อยู่แล้ว) → ดึงวันหมดอายุได้! ใช้ `soonestLot()` (export ใหม่จาก `src/pages/POS/cartAlerts.ts` = FEFO-lot-ที่มีสต็อก SSOT). qty = **รวม qty ทุกบรรทัดของสินค้านั้น** (ฉลาก de-dup ต่อสินค้า; ถ้าหลายหน่วยจะรวมดิบ — caveat ยอมรับได้). ทั้งคู่เป็น **trailing optional param** ของ `composeLabelContent(label, product, shop, lookups, lang, qty?, expiry?)` → เว้นว่าง ⇒ section ซ่อนเอง ⇒ LabelsTab/Settings designer (ไม่มี sale context) ไม่โชว์ของจริง (Settings designer โชว์ **sample** `[10]`/`EXP.10/11/2026` จาก `SAMPLE_CONTENT_BY_LANG` ทั้ง 4 ภาษา).

**คอลัมน์ใหม่ (full per-section set ×2):** `show_/font_size_/bold_/offset_x_/offset_y_` ของ `qty`+`expiry` — CREATE TABLE + migration array ใน schema.ts, + `LabelSettingsForm`/`LABEL_DEFAULTS` (default `show_qty=show_expiry=1` → เปิดทันทีบน row เดิมผ่าน migration DEFAULT 1). **ไม่ revive `lot_expiry`** (ยัง DEAD ตามเดิม) — สร้าง `expiry` ใหม่เพื่อความ consistent (ทุก section มีชุดคอลัมน์ครบเท่ากัน).

**ตาราง "รูปแบบการพิมพ์" ได้แถว qty+expiry อัตโนมัติ** (LabelSettingsTab iterate `SECTIONS` กรองออกแค่ `barcode`) → ปรับขนาด/หนา/ตำแหน่งได้อิสระเหมือนหัวข้ออื่นทันที **ไม่ต้องแตะ UI** ตรงนั้นเลย. อัปเดต **ทั้ง 2 render path** (LabelPaper.tsx + html.ts) สำหรับ fold ของ product (qty) + dosage (expiry) (dual-render pitfall — ต้องแก้คู่กันเสมอ). LabelPrintDialog ส่ง qty/expiry เข้า compose ทั้ง preview (`previewContent`) และ print loop.

ไฟล์: schema.ts, sections.ts, content.ts, html.ts, LabelPaper.tsx, cartAlerts.ts (export soonestLot), LabelPrintDialog.tsx. ค้าง: in-app verify (พิมพ์จริง + ตรวจ FEFO expiry ตรงกับล็อตที่ตัดขาย).

---

## Status — 2026-06-10e (วิธีใช้ยา lookups editable + usage presets) — tsc PASS, in-app verify pending

จาก plan `docs/plans/Label_Usage_Lookups_And_Presets.html` (ผ่าน /write-plan + audit 2 รอบ). 2 เฟส:

**เฟส 1 — 5 lookup วิธีใช้ยาแก้ไขเองได้** (เดิม read-only seed อย่างเดียว). ตาราง `label_dosages/label_frequencies/label_meal_relations/label_times/label_advices` (FK บน product_labels: `dosage_id/frequency_id/timing_id/label_time_id/advice_id`). หน้าใหม่ = แท็บ `วิธีใช้ยา` ใต้ Settings > หมวดหมู่และประเภท (`src/pages/Settings/LabelLookupTab.tsx`, kind selector segmented 5 ชนิด). Backend = **generic handler ตัวเดียวคุม 5 ตาราง** ผ่าน map `LOOKUP_KINDS` (kind→{table,fk,prefix}) — table/fk มาจาก map ตาม kind เท่านั้น **ห้ามรับจาก payload** (กัน allow-list bug), write ใช้คอลัมน์ literal ไม่ใช่ Object.keys. `code` auto-gen = `${prefix}_${lastInsertRowid}` (insert ด้วย Date.now() ชั่วคราวแล้ว UPDATE ด้วย rowid — กันชน UNIQUE). ลบจริง ไม่ใช่ soft-disable (ไม่มี is_disabled).
- **ลบแบบรู้ผลกระทบ**: `settings:labelLookupRefs({kind,id})` → `{labels:[{label_id,label_name,product_id,product_name}], presets:[{preset_id,name}], count}`. ไม่มีใครใช้ → structured ConfirmDialog → `deleteLabelLookup`. ถูกใช้ → `LookupDeleteDialog` (`src/components/dialogs/`) โชว์ตารางฉลาก+preset ที่อ้างอิง, "แก้ไข" รายแถว (label→LabelFormDialog restrict / preset→LabelPresetDialog restrict), "แก้ไขทั้งหมด" → `reassignLabelLookup({kind,fromId,toId|null})` (guard: toId ต้องอยู่ table เดียวกัน กัน FK ค้าง; sweep ทั้ง product_labels + label_presets ใน 1 tx), ปุ่ม "ลบรายการนี้" gate ที่ refs=0.

**เฟส 2 — usage presets**. ตารางใหม่ `label_presets` (code UNIQUE nullable, name, 5 FK, sort_order). แท็บ `preset วิธีใช้` (`LabelPresetTab.tsx`) + `LabelPresetDialog` (`src/components/dialogs/`, มี restrict mode สำหรับ impact flow). Handler: `listLabelPresets/saveLabelPreset/deleteLabelPreset` (ลบไม่มีเงื่อนไข — ไม่มีใครอ้าง preset). **chip preset แทน `QUICK_LABEL_NAMES` เดิม** ใน `LabelFormDialog.tsx` (โหลดผ่าน useEffect แยก key `[open]` ล้วน กันพันกับ reseed effect); กด chip → `applyPreset` เซ็ต label_name + 5 FK (null→0 sentinel, save 0→null เดิม). **seed ตั้งต้น** 1x1/1x2/1x3/1x4 (dosage 0003 + freq 01-04), 1pc (+meal 02), 1hs (+time 0005) — idempotent keyed SEED_* code ผ่าน subquery resolve id จาก lookup code (back-fill DB เดิมด้วย; แต่ Hygeia ที่ seed ไปแล้วได้ผ่าน back-fill เท่านั้น).

**LabelFormDialog restrict mode** (prop `restrictField?:UsageKey` + `excludeLookupId?`): enable เฉพาะ Combobox นั้น, ที่เหลือ disable, ไฮไลต์ ring-primary, ซ่อน chip, field เริ่มเคลียร์ = 0 (บังคับเลือกใหม่/เว้นว่าง), filter excludeLookupId ออกจาก dropdown. ⚠️ ตอนแก้ preset ใน impact flow ต้องโหลด **full preset row** ก่อน (refs คืนแค่ {preset_id,name}; saveLabelPreset เขียนทุก field — ส่ง partial = ลบ field อื่นทิ้ง). ⚠️ บั๊กที่เจอ: comment ใน schema.ts ห้ามใส่ backtick (schema เป็น template literal ก้อนเดียว — backtick ปิด string).

## Status — 2026-06-10d (language switch in Settings label-designer preview)

Extended the LabelsTab language toggle to the **Settings** designer preview (`src/pages/Settings/LabelSettingsTab.tsx`), tsc PASS / in-app verify pending:
- Same "ภาษา" `Tabs variant="toggle"` strip (Languages icon + `LANG_OPTIONS`) above the preview paper, `lang` state defaults `'th'`.
- The Settings preview body was a hard-coded Thai `SAMPLE_CONTENT`, so it had nothing to translate. Promoted it to **`SAMPLE_CONTENT_BY_LANG: Record<LabelLang, …>`** in `content.ts` (SSOT) — only the body sections (product/dosage/timing/indication/advice) translate; shop rows stay constant (real shop data has no language variants + the preview overlays the real shop header anyway). Kept `export const SAMPLE_CONTENT = SAMPLE_CONTENT_BY_LANG.th` as a back-compat alias.
- `previewContent` useMemo now keys off `SAMPLE_CONTENT_BY_LANG[lang]` (dep `[shop, lang]`). ทดสอบพิมพ์/PDF follow automatically — they build from `previewContent` (preview = print 1:1), no separate threading.

## Status — 2026-06-10c (POS LabelPrintDialog restructure + moved to dialogs/)

Codex had built the POS print-label dialog with NO design-system adherence and misplaced the files. Fixed (tsc PASS, in-app visual verify pending):
- **File moved to the canonical dialog home:** `src/pages/POS/LabelPrintDialog.tsx` → `src/components/dialogs/LabelPrintDialog.tsx` (where all 13 other dialogs live). Import in `src/pages/POS/index.tsx` updated to `@/components/dialogs/LabelPrintDialog`.
- **Inlined the orphan panel:** codex's `src/components/label/PosLabelPrintPanel.tsx` (only this dialog used it) folded INTO the dialog file → one self-contained file like every other dialog. Old file + old page file DELETED.
- **UI fixed to match the system:** bars now `h-12` / controls `h-9` (was `min-h-14`); language switch is `Tabs variant="toggle"` (canonical from LabelsTab) NOT a Select dropdown; preview uses `ZoomControl` + CSS `zoom` (was hard-coded `scale-[0.78]`); gradients removed; Badge default heights (was hand-set `h-6`/`h-5`); cart rows match LabelsTab list-row active style (`border-primary ring-2 ring-primary/30 bg-primary-soft/40`); no-label rows show a `CircleAlert` icon (was a raw `<div>!` styled as a badge); `rounded-card`/`rounded-lg` tokens.
- **Left/right two-pane preserved:** LEFT = live preview of the *active* (clicked) cart product (zoom + language + quick-edit-label button); RIGHT = cart rows with per-row label Select + copies Input + select-all + status badges. All print/compose logic carried over unchanged.
- **NOT touched (intentional):** `src/components/ui/zoom-control.tsx` (correctly placed, shared by Settings/Products), `src/lib/tags/` (orphan from a SEPARATE Barcode Price Tag feature, not this dialog).

## Status — 2026-06-10b (LabelFormDialog redesign + sort_order removed + delete confirm)

Shared `LabelFormDialog` (used by LabelsTab + POS quick-add) reworked + small fixes (tsc PASS, in-app verified):
- **5 "วิธีใช้" selects → `<Combobox variant="elevated">` autocomplete** (dosage/frequency/timing/label_time/advice — many rows each; qty is baked into the dosage option e.g. "กิน 2 เม็ด", owner does NOT want a separate dose_qty number field). Dialog widened `2xl→3xl`, the 5 comboboxes stacked full-width (was a cramped 2×2 grid). id 0 = ไม่เลือก (combobox `emptyLabel`).
- **สรรพคุณ Textarea → single-row `Input`** (4 langs). The 3 switches moved to the right column TOP as a **connected framed group** (each keeps its own `framed` pill, flush via `-mt-px` collapsing the shared edge, outer ends rounded `rounded-b/t-none`, `h-10`) — NO wrapping SectionCard; order = เปิดใช้งาน, ฉลากค่าเริ่มต้น, แสดงบาร์โค้ด.
- **`sort_order` ("ลำดับ") REMOVED front+back**: dropped from `product_labels` CREATE + migration `DROP COLUMN sort_order` (the 2nd DROP-COLUMN loop in schema.ts), `ORDER BY pl.sort_order,pl.id` → `ORDER BY pl.id` (×2 in products.ts: products:get + getLabels), out of saveLabel INSERT, out of `ProductLabel` type + form blankForm/seed/payload/UI. Labels now order by id (creation). (`sort_order` ≠ `is_default`: default = which label is auto-picked.)
- **Combobox scroll-in-Dialog fix** — see [[feedback_popover_scroll_in_dialog]].
- **Delete-label confirm** added in LabelsTab (`ConfirmDialog variant="destructive"`, description names the label across 2 lines via `<br/>`, ยืนยัน/ยกเลิก) — was deleting instantly.

## Status — 2026-06-10 (language switch in product page + auto shrink-to-fit)

Two things shipped (tsc PASS; in-app visual verify pending):

**1. Language switch in the product page (LabelsTab).** `composeLabelContent` already took `lang`; only the per-product preview was hard-coded to `'th'`. Added a `lang` state + a "ภาษาฉลาก" toggle-button group (`Tabs` + `TabsList variant="toggle"` — NEW tabs variant added this session: CONNECTED segmented group — `bg-card` track กรอบด้วย `ring-1 ring-inset` (ไม่ใช่ `border` — border กินความสูง 1px×2 ทำ trigger เหลือ 34px ใน bar 36px; ring ไม่กิน layout → trigger เต็ม 36px เท่าปุ่ม h-9 เดี่ยว) `rounded-lg+overflow-hidden` (มุมนอกมน-ในเหลี่ยม), flush `flex-1` triggers คั่นด้วย `border-l` (first:border-l-0, เส้นตั้งกินแค่กว้างไม่กินสูง), `h-full`; **list `h-9` อบใน variant** (`data-[variant=toggle]:group-data-...:h-9` เพราะ className `h-9` ธรรมดาแพ้ specificity ของ base `…:h-8` modifier — บั๊กที่เคยทำให้สูงแค่ 30px), active กดจม `bg-muted+shadow-inner`, ไม่มี sliding pill; showcase ใน `/theme` + doc `docs/claude/ui-components.md`; ไทย/อังกฤษ/พม่า/จีน) strip ABOVE the preview paper in `LabelsTab.tsx`, threaded into `composeLabelContent` for BOTH the preview AND `selectedLabelHtml()` (print/PDF) — so switching language changes what prints too (preview = print 1:1), not just the on-screen text. `LANG_OPTIONS` moved to `content.ts` (SSOT) and POS's local copy removed. Default `'th'` = identical to before.

**2. Auto shrink-to-fit (the hard part — each language is a different length, fixed sticker can't grow).** New `src/lib/label/fit.ts`: configured font = CEILING; when a label's content overflows the printable area, the WHOLE block scales down uniformly (`transform: scale(k)`, `k ≤ 1`, floored at `LABEL_FIT_MIN_SCALE = 0.5`) so the section hierarchy/bold is preserved and only absolute scale changes. Labels that fit are untouched (`k = 1`) — the configured size still drives the common case. Implementation:
- Both render paths wrap sections in `.label-area` (printable box, fills the padded inside) `>` `.label-fit` (natural content). Measurement is a pure RATIO `area.client* / fit.scroll*`, read from the SAME DOM under the SAME CSS zoom → **zoom-invariant**, so the zoomed on-screen preview and the un-zoomed print window compute an identical `k`.
- **Print:** `LABEL_FIT_SCRIPT` (no backticks/`${}` so it survives interpolation) embedded by `buildLabelHtml`/`buildLabelSheetHtml`; waits fonts + 2 rAF, fits every `.label-fit`, exposes `window.__labelFitReady`. The two label handlers in `printer.ts` (`printLabel`, `previewLabelPdf`) now `await window.__labelFitReady` before snapshotting — receipts (`WAIT_FOR_RENDER_JS`) untouched.
- **Screen:** `LabelPaper.tsx` mirrors it in `useLayoutEffect` via `computeFitScale`, applying transform IMPERATIVELY (React only owns the style props it sets; no transform binding → no fight, no re-render loop). Covers BOTH the LabelsTab preview and the Settings designer (shared component). `overflow:hidden` added on the paper so a floored-still-overflowing label clips instead of bleeding.
- Below `MIN_SCALE` the paper clips (silent — owner chose silent shrink over a warn-and-fix flow, 2026-06-10). Trade-off: a long label at small `k` may print smaller / barcode could get tight to scan at extremes.

**⏭️ Next:** ~~ปรับ UI หน้าต่างพิมพ์ฉลาก POS (`LabelPrintDialog.tsx`)~~ — DONE 2026-06-10c (ดูบล็อกบนสุด: ย้ายไป `components/dialogs/` + แก้ UI ตรงสไตล์ + รวม panel เป็นไฟล์เดียว).

---

## Status — 2026-06-09 (POS label print + 4 languages)

**POS label printing DONE + 4-language support DONE** (plan `docs/plans/POS_Label_Print.html`, audit 3 รอบ, tsc ผ่าน, ผู้ใช้ทดสอบจริงผ่าน 2026-06-09). What shipped:

- **POS "พิมพ์ฉลาก" button now live** (`src/pages/POS/index.tsx` — เดิม disabled ถาวร). เปิด `src/pages/POS/LabelPrintDialog.tsx`: ดึงสินค้าในตะกร้า (dedupe ตาม `product_id`, ข้าม `is_bundle`), แยกกลุ่มมีฉลาก/ไร้ฉลาก, Checkbox auto-check + Select เลือกฉลาก (default `is_default`) + Input จำนวนสำเนา (clamp 1..99, **ไม่ผูก qty** — มติ default 1/สินค้า), Toggle เผยรายการไร้ฉลาก + quick add. พิมพ์รวมเป็น sheet หลายหน้าผ่าน `printer.printLabel` (งานเดียว). `showLabelPrint` อยู่ใน `anyModalOpen` + `refocusSearch()` ตอนปิด.
- **`LabelFormDialog` extracted** (`src/components/label/LabelFormDialog.tsx`) = ฟอร์มเพิ่ม/แก้ฉลากร่วม ใช้ทั้ง LabelsTab และ POS quick-add (SSOT). LabelsTab ลบฟอร์มเดิม ใช้ตัวนี้แทน. **saveLabel payload keys ต้อง = INSERT column list** (named-param subset) — เพิ่ม key ใหม่ต้องแก้ทั้ง 2 ที่.
- **4 ภาษา (th/en/mm/zh):** lookup ทั้ง 5 มี `name_th/en/mm/zh` + seed ครบอยู่แล้ว. เพิ่มคอลัมน์ **`product_labels.indication_en`** (schema CREATE + ALTER migration ใน try/catch array + saveLabel INSERT + ProductLabel type + ช่องกรอกในฟอร์ม) → สรรพคุณครบ 4 ภาษา. `composeLabelContent(label, product, shop, lookups, lang='th')` เลือกคอลัมน์ตาม lang, resolve ชื่อ lookup จาก id+lang (fallback joined `*_name` เมื่อไม่ส่ง lookup), indication fallback `indication_th`. **default lang='th' = ผลเท่าเดิมเป๊ะ** (callers เก่า LabelsTab×2 + LabelSettingsTab:219 ไม่พัง). ภาษาเลือกครั้งเดียวใช้ทั้งบิล (POS เท่านั้น).
- **ฟอนต์ fallback พม่า/จีน:** bundle `NotoSansMyanmar-*` + `NotoSansSC-*` (Regular+Bold ครบ) ใน `src/assets/fonts/`. `buildFallbackFontFaceCss(text)` ใน `fonts.ts` สแกน Unicode range (Myanmar U+1000–109F / CJK U+4E00–9FFF…) แล้ว **ฝัง @font-face เฉพาะอักษรที่ปรากฏจริง** (Thai-only ไม่อืด). `buildLabelSheetHtml` (ใหม่ ใน `html.ts`) ต่อ family เข้า stack ก่อน `sans-serif`. `renderLabelSectionsHtml` แยกออกจาก `buildLabelHtml` (sync, ใช้ร่วม single + sheet). **พิมพ์หลายหน้าใช้ `break-after:page` + pageSize microns — ไม่ต้อง `preferCSSPageSize` (เป็น option ของ printToPDF เท่านั้น) → ไม่แตะ printer.ts**.

**⏭️ Next (2026-06-10):** ~~ปรับ UI หน้าต่างพิมพ์ฉลาก POS~~ + ~~เพิ่มตัวเลือกแสดงตัวอย่าง 4 ภาษาภายในหน้าสินค้า~~ — ภาษาในหน้าสินค้า DONE 2026-06-10 (ดูบล็อกบนสุด); POS dialog UI polish ยังค้าง.

---

## Status — 2026-06-07

Core restructure DONE. **Section-split DONE 2026-06-07** (plan `docs/plans/label-section-split.md`): per-section model — EVERY text section now owns `font_size_<key>` + `bold_<key>` + `show_<key>` + `offset_x/y_<key>` (no shared tier; old `font_size_small` is now a DEAD column). 3 new sections added: `shop_phone`, `shop_line_id` (composed from shop info), `custom_text` (free-text LAST line, config not content — pulled from `label_settings.custom_text`, special-cased in BOTH LabelPaper + buildLabelHtml). Defaults flipped: all fonts 10pt, bold on shop/shop_address/shop_phone/product only. tsc + 2-round audit pass; interactive click-test still pending. Preview works in both Settings designer and per-product LabelsTab. Printing from per-product tab NOT yet wired.

---

## Architecture

| Concern | File |
|---------|------|
| Section layout metadata (SSOT) | `src/lib/label/sections.ts` |
| Auto shrink-to-fit (ceiling font, scale-to-fit) | `src/lib/label/fit.ts` — `computeFitScale()` (React), `LABEL_FIT_SCRIPT` (print, `window.__labelFitReady`), `LABEL_FIT_MIN_SCALE`. Render paths wrap sections in `.label-area > .label-fit`. |
| Sample text (Settings preview) | `src/lib/label/content.ts` — `SAMPLE_CONTENT_BY_LANG` (per-language th/en/mm/zh; body rows translate, shop rows constant). `SAMPLE_CONTENT` = back-compat alias to `.th`. |
| Settings preview shop header | REAL shop data via `getShop()` + `composeLabelContent` — `previewContent` useMemo in `LabelSettingsTab.tsx` overrides the 4 shop sections; test-print/PDF use the same `previewContent` (preview = print 1:1) |
| Real label content (product) | `src/lib/label/content.ts` — `composeLabelContent()` + `todayBE()` |
| React preview component | `src/components/label/LabelPaper.tsx` |
| HTML print builder | `src/lib/label/html.ts` — `buildLabelHtml()` |
| Per-size style defaults | `sizeDefaults(w,h)` in `LabelSettingsTab.tsx` — FIT-BASED on HEIGHT with TIGHT spacing. Solves the largest font where TARGET_LINES=11 fit, then floors it: `font = floor((avail/(11·0.3528) − gap)/lineSpacing)`, clamp 7–14; **lineSpacing 1.15, gap 1pt, thin pad (h/25, 2–3mm)**. Result: 70×50/80×50→9pt, 80×60→11pt, 100×75→14pt — all fit ~11 lines without overflow. Tuning history (real-label feedback): `h/5` proportional → 80×60 hit 12pt OVERFLOW; line-fit w/ loose spacing → too small (8pt); gentle-linear 10pt → still overflowed (real labels are line-dense). The win was tightening **lineSpacing to 1.15** so 9pt fits 11 lines instead of shrinking the font more. Owner tunes the constants directly (font line: `0.13·h`→ now the fit formula; lineSpacing/gap/pad are plain numbers). Applied via `applySizeTemplate` (sets every text section's font + pads + gap + line_spacing) behind a ConfirmDialog on preset pick, or the "ใช้ค่าเริ่มต้นของขนาดนี้" button (covers custom sizes). Presets: 70×50, 80×50, 80×60, 100×75 (others → กำหนดเอง). **No per-size persistence** — `label_settings` stays a singleton (decided 2026-06-07). |
| Plan + audit doc | `docs/plans/label-restructure.md` |

`LabelPaper.tsx` is shared by BOTH the Settings designer preview and the per-product LabelsTab preview — do not duplicate it.

---

## Locked section order

`shop` → `print_date` → `shop_address` → `shop_phone` → `shop_line_id` → `header_line` → `product` → `dosage` (ปริมาณ+ความถี่) → `timing` (มื้อ+เวลา) → `indication` → `advice` → `barcode` (default off) → `custom_text` (LAST line, from `label_settings.custom_text`)

**`print_date` is special:** it has its OWN settings columns (show/font/bold/offset → appears as its own row in the settings table) but is **NOT rendered as its own line** — it's folded into the `shop` flex row (right side), styled by `font_size_print_date` / `bold_print_date` / `offset_*_print_date`. The shop row shows when `show_shop` OR `show_print_date`. The date string itself is still the `date` PROP (todayBE), not a content-map key. Both render paths (LabelPaper + buildLabelHtml) skip `print_date` in the section loop and draw the date span inside the shop row.

**`barcode` is folded the same way (2026-06-09):** it is NOT its own line anymore — it renders on the RIGHT of the `shop_phone` flex row (phone left, barcode right, `alignItems:center`). The `shop_phone` row shows when `show_shop_phone` OR `show_barcode`; both paths skip `barcode` in the loop and special-case `shop_phone`. Gate = `settings.show_barcode` (per-product path = `effectiveSettings.show_barcode` = the label switch) AND an encodable `content.barcode`. The PHONE truncates (`minWidth:0`+ellipsis); the barcode box is `flexShrink:0`.

**Barcode is a FIXED BOX (2026-06-09), not natural-width:** `font_size_barcode` = HEIGHT (mm), new column `barcode_width_mm` = WIDTH (mm, default 40). The SVG STRETCHES to fill the box — `barcodeSvg` adds `viewBox` + `preserveAspectRatio="none"` so a short code and a long code occupy the SAME footprint (bars still scan — width ratios scale uniformly). Reason: the sample (EAN13, 13 digits) looked wide in the Settings designer while a real short product code looked tiny — inconsistent. Width input lives in LabelSettingsTab under the section table (shown only when `show_barcode`). `maxWidth:100%` is the overflow guard.

Removed sections: `notes`, `footer_line`, `lot_expiry`.

**IMPORTANT:** `label_settings` DB columns for the removed sections (`show_notes`, `notes_text`, `show_footer_line`, `footer_line_text`, `show_lot_expiry`) are kept as DEAD columns — they are NOT removed from `LabelSettingsForm` defaults (`LABEL_DEFAULTS`) or the load-filter. If they were dropped from defaults the form would strip them from the loaded row and overwrite them as `undefined` on next save, corrupting any existing stored value. Keep them in the allow-list; just don't render them.

---

## Dual-render pitfall — shop+date row & shop_phone+barcode row

The `shop` section (date on the right) AND the `shop_phone` section (barcode on the right) are **special flex layouts** implemented in TWO separate code paths that can drift:

1. `LabelPaper.tsx` (React, JSX) — used for on-screen preview
2. `buildLabelHtml()` in `LabelSettingsTab.tsx` (HTML string) — used for actual printing

They share `SECTIONS`, `buildSectionStyle()`, and the content map, but the render logic is hand-duplicated by necessity (React vs raw HTML). If you add a new special-layout section, update BOTH places.

---

## better-sqlite3 INSERT — named params must match exactly

**Bug fixed this session:** `products:saveLabel` INSERT was missing columns that the payload object contained (`advice_id`, `label_time_id`, `is_default`, `show_barcode`, `is_active`). better-sqlite3 `.run(obj)` throws **"Too many parameter values"** if the bound object has ANY named key the SQL statement does not reference. The fix: add the columns to `product_labels` (schema + migration) and list every key explicitly in the INSERT column list.

Rule: when using `.run(namedParamObj)`, the object's keys must be a **subset** of (or exactly match) the parameters the statement declares. Extra keys = hard throw, not silent ignore. Unlike the dynamic UPDATE path, INSERT column lists must be kept in sync with the payload manually.

---

## Barcode control model (wired 2026-06-09)

Two gates were confused before — now split by ROLE (owner decision 2026-06-09, option "per-product switch decides"):

- **Per-label `product_labels.show_barcode`** = the REAL on/off for the barcode section on a printed/previewed label. Lives on each product's ฉลาก tab (LabelsTab dialog toggle "แสดงบาร์โค้ด"). Previously SAVED BUT DEAD (no render path read it).
- **Global `label_settings.show_barcode`** = governs the Settings **designer preview only** (so the owner can see + position the SAMPLE bars). Default 0. Must NOT gate real output.
- **Barcode VALUE** = `products.barcode` (content.ts `out.barcode = product.barcode`). Empty ⇒ `barcodeSvg → ''` ⇒ row self-hides even when the switch is on.

**How it's wired:** the shared renderers (`LabelPaper` / `buildLabelHtml`) STILL gate the barcode section on `settings.show_barcode` — unchanged. `LabelsTab` builds an `effectiveSettings = { ...labelSettings, show_barcode: selected.show_barcode ? 1 : 0 }` (useMemo) and passes THAT to both the preview and `selectedLabelHtml()`. So the per-label switch overrides the global for real labels; the Settings designer keeps the global toggle for positioning. Offset/height (`offset_*_barcode`, `font_size_barcode`) always come from labelSettings.

Hints added: Settings barcode row has an Info note ("ติ๊กที่นี่ = ตัวอย่างเท่านั้น"); LabelsTab dialog warns when switch on but `product.barcode` blank.

## Deferred / not yet done

### "ชื่อสามัญ" (generic drug name) section — DEFERRED

`products` has NO `drug_generic_name_id` column — it exists only on the TS type and is stripped before save in `EditProduct/index.tsx`. `products:get` does not join `drug_generic_names`.

Full end-to-end work required before adding a `generic` label section (between `product` and `dosage`):
1. Add `drug_generic_name_id` column to `products` + migration
2. Stop stripping it in EditProduct save payload
3. Add it to create/update column allow-lists
4. Join `drug_generic_names` in `products:get`
5. Wire to `composeLabelContent()`
6. Add the section to `SECTIONS`

Do not add the section until the DB wiring is complete — it will silently render blank.

### Per-product label printing — NOT YET WIRED

~~Was unwired~~ — **DONE.** LabelsTab now has working "พิมพ์ฉลาก" + "ดู PDF" buttons (`handlePrintLabel` / `handlePreviewPdf`) that call `selectedLabelHtml()` → `buildLabelHtml()` with the real selected label + product + shop data, gated by `canPrint()` (needs a selected label + a paper size set in ตั้งค่า > ฉลากยา). Print path === preview (same builder).
