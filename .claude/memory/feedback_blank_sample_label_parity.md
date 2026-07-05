---
name: feedback_blank_sample_label_parity
description: Blank vs sample label builders must mirror folded-field row presence or rows drift in the designer
metadata:
  type: feedback
---

ตัวสร้างฉลากสองตัวต้องวางบรรทัดตรงกัน 1:1 — `buildBlankLabelHtml` (`src/lib/label/blankLabel.ts`, โหมด "ฉลากเปล่า") กับ `renderLabelSectionsHtml`/`buildLabelHtml` (`src/lib/label/html.ts`, โหมด "ข้อมูลตัวอย่าง") ในจอ Settings › เครื่องพิมพ์ › ฉลากยา (`LabelSettingsTab`).

**Why:** ฟิลด์ที่ "พับ" (folded) เข้าแถวเจ้าบ้าน — `qty`→แถว `shop_line_id`, `expiry`→แถว `dosage`, `barcode`→แถว `product` — ไม่มีบรรทัดของตัวเอง. ฉลากข้อมูลตัดสินใจ "มีแถวไหม" ด้วยเงื่อนไข `primary || folded` (เช่น `show_shop_line_id || show_qty`). ถ้าฉลากเปล่าเช็คแค่ `primary` (เช่น `show_shop_line_id` อย่างเดียว) แล้วเจ้าของ "ปิด LINE ID แต่เปิดจำนวน" → ฉลากข้อมูลมีแถว แต่ฉลากเปล่าหายไป 1 แถว → ทุกแถวใต้ลงมาเลื่อนไม่ตรง ("เพี้ยน"). บั๊กจริง 2026-06-25 (`show_shop_line_id=0`, `show_qty=1`).

**How to apply:** เวลาแก้ host row ในฉลากเปล่า ให้ gate การมีแถวด้วยเงื่อนไขเดียวกับ `html.ts` เป๊ะ ๆ และให้ความสูงแถวเท่ากันโดยใช้ฟอนต์/bold/offset ของฟิลด์ folded เดียวกัน. qty บนฉลากเปล่า = กล่องเขียน "[ ___ ]" (กะทัดรัด ตรงฟอร์แมตจริง "[N]"; เดิมลอง "จำนวน ___" ยาวไปเบียดแถว LINE) ผ่าน helper `lineIdQtyRow` — ตัดสินใจโดยเจ้าของ 2026-06-25. latent bug แบบเดียวกันยังมีที่ dosage/expiry (gate แค่ `show_dosage`) และ product/barcode (gate แค่ `show_product`) — ถ้าเจออาการเลื่อนให้แก้แนวเดียวกัน. ตรวจได้ด้วยการ render ทั้งสองแล้วนับ direct-child ของ `.label-fit`. ดู [[project_drug_label]].

**UPDATE 2026-07-05 — NO-COLLAPSE ทุก builder:** เจ้าของสั่ง "ไม่ยุบ บรรทัดไหนๆ ไม่ว่าเงื่อนไขใดๆ" (กลับคำตัดสิน 2026-06-29 ที่ให้เปิด-แต่-ว่างยุบได้) — ตอนแรกทำที่ blank แล้วเจ้าของสั่งขยายไปฉลากจริงด้วย ตอนนี้ครบ **ทั้ง 3 render path**: `renderBlankInner` (blankLabel.ts), `renderLabelSectionsHtml` (html.ts — พิมพ์จริง + preview iframe + POS batch sheet) และ `LabelPaper.tsx` (React preview) — **ทุก section ที่ไม่ folded ครองช่องเสมอ (10 ช่องคงที่)**: มีเนื้อหาก็แสดง ไม่มีก็ reserved placeholder (แบบเดียวกับติ๊กปิด) → แถว "เปิดแต่ว่าง" (LINE ID ติ๊กแต่ร้านไม่กรอก, สินค้าไม่มีสรรพคุณ ฯลฯ) จองที่แทนการยุบ; latent bug list เดิม (dosage/expiry, product/barcode gate) หมดความหมายแล้ว. html.ts ใช้ helper `reserved(s)`, LabelPaper ใช้ `reservedRow(s)` (กิน `first` เหมือนแถวจริง). **นัยสำคัญ: ฉลากยาจริงของสินค้าที่ข้อมูลไม่ครบ จะเว้นบรรทัดว่างแทนการเลื่อนชิด (WYSIWYG กับ designer).** probe: นับ top-level div หลัง `.label-fit` / `transform-origin:top left` ต้อง = 10 ทุก combo ทั้งสาม path. กับดักเครื่องมือ: `LabelPaper.tsx` มี literal escape 6 ตัวอักษร (backslash+u00A0 = NBSP) ในซอร์ส — Edit tool แมตช์ string ที่มี escape นี้ไม่ได้ ให้ patch ผ่าน node script แทน.
