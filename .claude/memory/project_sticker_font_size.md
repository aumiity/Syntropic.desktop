---
name: project_sticker_font_size
description: Barcode-sticker fonts are now user-tunable; NumInput is a shared ui/ primitive
metadata:
  type: project
---

**DONE 2026-06-29 (tsc renderer exit 0; click-test/print pending)** — เพิ่มระบบปรับขนาดฟอนต์ให้แท็บ "สติ๊กเกอร์บาร์โค้ด" (`src/pages/Products/PrintTab`) + ทำให้ปุ่มจัดการสินค้าแต่ละช่องลอยอิสระ.

**กลับด้านดีไซน์เดิม:** เดิม `src/lib/tags/types.ts` คอมเมนต์ว่า "NO free font_size — layout is a fixed preset". ตอนนี้ปรับได้ต่อองค์ประกอบ ผ่าน 6 ฟิลด์ใหม่ใน `BarcodeStickerForm`: `font_name_pt` (ชื่อ, 8) / `font_digits_pt` (ตัวเลขบาร์โค้ด, 7) / `font_price_pt` (ราคา, 7) / `barcode_h_mm` (สูง, 7) / `barcode_w_mm` (กว้าง, 34) / `name_align` (จัดวางชื่อ 'left'|'center'|'right', default 'center'). digits+price ยังอยู่บรรทัด meta เดียวกัน แต่แต่ละ span ใส่ pt ของตัวเอง (align-items:baseline). grid (cols/rows/gap) ยังเป็น preset ฟิกซ์.

**บาร์โค้ดเปลี่ยนเป็นกำหนดกล่อง + stretch:** เดิม `barcodeSvg(..., {stretch:false})` (natural aspect, กว้างตามจำนวนหลัก). ตอนนี้ `stretch:true` + กล่อง `barcode_w_mm × barcode_h_mm` (ยืดเต็ม แบบเดียวกับฉลากยา) → บาร์โค้ดทุกความยาวมี footprint เท่ากัน. `bcWmm = min(refWmm=40, barcode_w_mm)`; ไม่มีบาร์โค้ด → fallback refWmm. อ่าน `barcode_w_mm`/`name_align` ตรงจาก cfg ใน `cellHtml` (ไม่ผ่าน resolveStickerLayout — มีแค่ height/font ที่ผ่าน L). `name_align` guard เฉพาะ left/right ที่เหลือ center.

**จัดวางชื่อ = `Tabs variant="toggle"`** (connected segmented h-9, ตรงกับ stepper; **อย่าใช้ segmented ที่ h-10** — สูงไม่ตรง) icon AlignLeft/Center/Right, disabled เมื่อ show_name ปิด. **บาร์โค้ด 1 แถวมี 2 stepper** (กว้าง w-16 + สูง w-16 + "มม." เดียว) — แถวนี้มี 2 ฟิลด์ จงใจไม่ align คอลัมน์เดียวกับแถว pt.

**UI = stepper อยู่ในบรรทัดเดียวกับ checkbox** (กล่อง "การแสดงผล"): แต่ละแถว = [Checkbox toggle + ป้าย] ซ้าย + [NumInput stepper + หน่วย] ขวา; stepper greyed เมื่อ checkbox ปิด (`disabled={!show_*}`). **อย่าใช้ `CheckRow` เพราะมันเป็น `<label>` ครอบ → คลิก stepper จะไปโดน checkbox** ต้องทำแถวเองด้วย `Checkbox` ตรง ๆ + stepper นอก `<label>`. แถวความสูงบาร์โค้ดไม่มี checkbox (บาร์โค้ดพิมพ์เสมอถ้ามี) → ป้าย `pl-7` จัดให้ตรงแนว.

**เคยพลาด:** รอบแรกแยกเป็นหัวข้อ "ขนาดตัวอักษร" ใหม่ + รวม ราคา/ตัวเลข เป็น `font_meta_pt` เดียว → เจ้าของสั่งให้เอา stepper ไปไว้ในบรรทัด checkbox เดิม + แยก digits/price + เพิ่มความสูงบาร์โค้ด.

**Flow:** UI → `setStickerCfg` → auto-persist (debounce 800ms) → `settings:saveBarcodeStickerSettings` (dynamic-SQL จาก `Object.keys` → ต้องมีคอลัมน์จริง ทุกคีย์). `resolveStickerLayout(paper, overrides?)` รับ `{namePt, digitsPt, pricePt, barcodeHmm}`, fallback `STICKER_*` constants; digitsPt→`fontMetaPt`, pricePt→`fontPricePt` (เดิม sticker hack `fontPricePt=namePt`). `buildBarcodeStickerHtml` ส่ง cfg เข้าไป. caller layout-only (PrintTab index.tsx ~97,113) เรียกแบบไม่ส่ง override (ใช้แค่ cols/rows). schema 2 จุด: CREATE + ALTER (4 คอลัมน์ REAL). ป้ายราคา (priceTagHtml/resolvePriceTagPreset) ไม่กระทบ.

**NumInput primitive:** ย้าย `NumInput` + `useHoldRepeat` (press-and-hold auto-repeat stepper) ออกจาก local helper ใน `LabelSettingsTab.tsx` → `src/components/ui/num-input.tsx` (export ทั้งคู่) ตาม invariant "no local UI helper in src/pages". `LabelSettingsTab` import มาใช้แทน (ยังใช้ `useHoldRepeat` กับปุ่มลูกศรเลื่อนตำแหน่ง section). มี showcase ใน `/theme` (Section "NumInput"). **อย่า re-add NumInput เป็น local helper อีก** — ใช้จาก `@/components/ui/num-input`.

**GridEditor ปุ่มลอยอิสระ:** per-cell X/warning เดิมมี `pt-4` จองที่บนช่อง → ดันเนื้อหาลง. เอา `pt-4` ออก → ปุ่ม absolute ลอยมุมบน ไม่กินที่แนวตั้ง เนื้อหา center เต็มช่อง; ไอคอนเล็กลง size-3.5 + ขยับมุมเป็น top-1/left-1/right-1.

## ป้ายราคา A4 rework (2026-06-29, tsc renderer exit 0; click-test pending)

เจ้าของสั่ง 3 อย่างกับโหมดป้ายราคา:
1. **ล็อก 50 ช่อง/แผ่น** — เพิ่ม preset `'50up'` (5×10) ใน presets.ts; **ลบ picker จำนวนต่อแผ่นทิ้ง**; `layout` ใช้ `resolvePriceTagPreset('50up', …)` literal; load บังคับ `preset:'50up'` (ทับค่าเก่า); `buildPriceTagHtml` อ่าน `cfg.preset` → ต้อง 50up.
2. **การแสดงผลเหมือนสติ๊กเกอร์เป๊ะ** — เพิ่ม 6 ฟิลด์ใน `PriceTagForm` + schema (CREATE+ALTER `price_tag_settings`): `font_name_pt`/`font_price_pt`/`font_code_pt`/`font_unit_pt`/`barcode_h_mm`/`barcode_w_mm`. UI = แถว checkbox+stepper เหมือนสติ๊กเกอร์ (เส้นตัด = toggle ล้วน). `priceTagHtml` อ่านขนาดจาก cfg ตรง ๆ (ไม่ผ่าน resolvePriceTagPreset — เหมือน stickerHtml); code/unit แยก span ขนาดเอง; "บาท" = price×0.5; บาร์โค้ด stretch เต็มกล่อง w×h.
3. **รายการสินค้าเป็นตาราง (เฉพาะป้ายราคา)** — คอมโพเนนต์ใหม่ `PriceTagList.tsx` (ตาราง #/ชื่อ/หน่วย/บาร์โค้ด/ราคา/จัดการ). **โมเดล = dense list `priceCells` (ไม่มี null hole), max 50**; ไม่มี padCells effect สำหรับ pricetag แล้ว. `assignCell` โหมด pricetag = **APPEND** (ไม่ replace ในที่เดิม — เจ้าของสั่ง "ลบและลงใหม่เท่านั้น"); ปุ่มต่อแถว คัดลอก(duplicate insert)/ลบ; header มี "เพิ่มสินค้า"(openAdd, searchIdx=null) + "ล้างทั้งหมด"(setPriceCells([])) + ตัวนับ X/50. **ไม่มีปุ่มแก้ไข** (= ลบ+เพิ่มใหม่). GridEditor ยังใช้กับสติ๊กเกอร์เท่านั้น (mode branch ในการ์ดรายการสินค้า). priceItems = `priceCells.filter((c):c is TagCell => c!=null)`.

**Layout ป้ายราคา = สไตล์ 7-Eleven (2026-06-29):** เจ้าของส่งรูปป้าย 7-11 มา. `priceTagHtml.cellHtml` = flex column เต็มช่อง: (1) ชื่อบนซ้าย nowrap clip → (2) **บรรทัดราคา = หน่วยซ้าย + ราคาตัวใหญ่ขวา** (justify-between, baseline; "บาท" ~45% ของ price) → (3) รหัสตัวเล็กซ้าย → (4) บาร์โค้ด `margin-top:auto` ตรึงก้นช่อง **เต็มกว้าง 100% + flat:true (ไม่มีหาง guard) + stretch**. default ราคา 18pt; **barcode_w_mm เลิกใช้กับป้ายราคา** (เต็มกว้างเสมอ) → UI เหลือปรับแค่ "สูง"; คอลัมน์ barcode_w_mm ยังอยู่แต่ dead สำหรับ pricetag. **`fill_yellow`** (default 1) = พื้นหลังเหลือง `#FFE600` ทั้งช่อง (barcode SVG พื้นขาวในตัว → เป็นแถบขาวบนเหลือง เหมือน 7-11); toggle ใน display settings. label-fit shrink ยังย่อถ้าล้น.

**รอบปรับเพิ่ม (2026-06-29):** (1) **โค้ดสินค้า→วันที่พิมพ์**: `show_code`/`font_code_pt` คงชื่อ field เดิมแต่ render `formatDate(new Date().toISOString())` (วันพิมพ์แผ่น DD/MM/YYYY) แทน `cell.code`; UI relabel "รหัสสินค้า"→"วันที่พิมพ์"; priceTagHtml import formatDate. (2) **เหลืองเฉพาะ band บน**: เลิก bg ทั้ง cell → cellStyle `padding:0`, cellHtml แยก 2 ส่วน: `top` (name+price, `background:#FFE600` bleed ขอบ) + `bottom` (date+barcode, ขาว, barcode margin-top:auto). (3) **`line_gap_mm`** (default 1, 0–6 step .5) = `gap` ของ flex column ทั้ง top/bottom; UI = stepper row "ระยะห่างบรรทัด" (ไม่มี checkbox). schema price_tag_settings +`fill_yellow`+`line_gap_mm`+`price_compact` (CREATE+ALTER). `barcode_w_mm` = dead สำหรับ pricetag (เต็มกว้าง 100%+flat). (4) `price_compact` (default 0) = ตัด .00 + คำว่า "บาท" ออก (`toFixed(0)`). (5) ชื่อ = clip ตรง ๆ (`text-overflow:clip` ไม่มี ellipsis/wrap). (6) **`PRICE_TAG_STYLE_PRESETS`** (types.ts) = ปุ่ม preset สำเร็จรูป "รูปแบบ 1/2" (apply เป็น bundle ทับ priceCfg ไม่แตะ grid); style1=ราคา36/บาร์โค้ดปิด/ย่อราคา/gap3, style2=ราคา20/บาร์โค้ด h7/ไม่ย่อ/gap1; ปุ่มไฮไลต์ active เมื่อ config ตรง preset (compare entries); UI block "รูปแบบสำเร็จรูป" บนสุดของการ์ดตั้งค่า (pricetag only). กับดัก: compare ต้อง cast `priceCfg as unknown as Record<string,number>` (preset:string ทำ direct cast ไม่ผ่าน).

gotcha: `priceTagPresets()` ใน presets.ts กลายเป็น dead export (picker ถูกลบ) — ปล่อยไว้ ไม่ error. ปุ่ม row action = `size="icon-lg"` (ลบ=`elevated-destructive-soft`, คัดลอก=`elevated`). เพิ่ม "รีเซ็ตการตั้งค่า" ที่ slot `right` การ์ดตั้งค่า (ConfirmDialog warning, รีเซ็ตตามโหมด). พรีวิวป้ายราคา A4 ย่อพอดีกรอบด้วย ResizeObserver+transform scale (iframe ไม่ย่อเนื้อหาตาม element).

## Price-tag list draft persistence (2026-06-29)

การทำป้าย 50 ใบกินเวลา ลูกค้าเดินเข้ามาต้องสลับไป POS แล้วกลับมาทำต่อ → ลิฟต์ `priceCells` ออกจาก useState ของ PrintTab ไปไว้ **`src/stores/tagDraftStore.ts`** (Zustand **in-memory** เหมือน [[grDraftStore]] — รอดข้ามการสลับหน้า ไม่รอด app restart, ตามที่เจ้าของเลือก). store เก็บ `priceItems: (TagCell|null)[]` + setter รับทั้ง array/updater (เสียบเข้า cells/setCells plumbing เดิม), `clearPriceItems`. สติ๊กเกอร์ยัง page-local (สร้างใหม่เร็ว). **Sidebar badge**: nav "สินค้า" (`/products`) โชว์ count แดง = `priceItems.filter(Boolean).length` (print tab อยู่ใต้ /products); เพิ่มใน `Sidebar.tsx` countBadge ternary คู่กับ grDraftCount/negativeStockCount. ไม่มี reset priceCells ตอน mount (ตั้งใจ — draft ต้องอยู่ต่อ).

เกี่ยวข้อง: [[project_tag_printing]] [[project_printer_settings]] [[project_gr_draft_persistence]]
