---
name: feedback_blank_sample_label_parity
description: Blank vs sample label builders must mirror folded-field row presence or rows drift in the designer
metadata:
  type: feedback
---

ตัวสร้างฉลากสองตัวต้องวางบรรทัดตรงกัน 1:1 — `buildBlankLabelHtml` (`src/lib/label/blankLabel.ts`, โหมด "ฉลากเปล่า") กับ `renderLabelSectionsHtml`/`buildLabelHtml` (`src/lib/label/html.ts`, โหมด "ข้อมูลตัวอย่าง") ในจอ Settings › เครื่องพิมพ์ › ฉลากยา (`LabelSettingsTab`).

**Why:** ฟิลด์ที่ "พับ" (folded) เข้าแถวเจ้าบ้าน — `qty`→แถว `shop_line_id`, `expiry`→แถว `dosage`, `barcode`→แถว `product` — ไม่มีบรรทัดของตัวเอง. ฉลากข้อมูลตัดสินใจ "มีแถวไหม" ด้วยเงื่อนไข `primary || folded` (เช่น `show_shop_line_id || show_qty`). ถ้าฉลากเปล่าเช็คแค่ `primary` (เช่น `show_shop_line_id` อย่างเดียว) แล้วเจ้าของ "ปิด LINE ID แต่เปิดจำนวน" → ฉลากข้อมูลมีแถว แต่ฉลากเปล่าหายไป 1 แถว → ทุกแถวใต้ลงมาเลื่อนไม่ตรง ("เพี้ยน"). บั๊กจริง 2026-06-25 (`show_shop_line_id=0`, `show_qty=1`).

**How to apply:** เวลาแก้ host row ในฉลากเปล่า ให้ gate การมีแถวด้วยเงื่อนไขเดียวกับ `html.ts` เป๊ะ ๆ และให้ความสูงแถวเท่ากันโดยใช้ฟอนต์/bold/offset ของฟิลด์ folded เดียวกัน. qty บนฉลากเปล่า = กล่องเขียน "[ ___ ]" (กะทัดรัด ตรงฟอร์แมตจริง "[N]"; เดิมลอง "จำนวน ___" ยาวไปเบียดแถว LINE) ผ่าน helper `lineIdQtyRow` — ตัดสินใจโดยเจ้าของ 2026-06-25. latent bug แบบเดียวกันยังมีที่ dosage/expiry (gate แค่ `show_dosage`) และ product/barcode (gate แค่ `show_product`) — ถ้าเจออาการเลื่อนให้แก้แนวเดียวกัน. ตรวจได้ด้วยการ render ทั้งสองแล้วนับ direct-child ของ `.label-fit`. ดู [[project_drug_label]].

**UPDATE 2026-07-05 (หลังแยก profile):** `renderBlankInner` ถูก restructure — **ทุก section ที่ไม่ folded ครองช่องเสมอ (10 ช่องคงที่)**: มีเนื้อหาก็แสดง ไม่มีก็ push reserved placeholder (แบบเดียวกับติ๊กปิด) → แถว "เปิดแต่ว่าง" (เช่น LINE ID ติ๊กอยู่แต่ร้านไม่ได้กรอก LINE ID + จำนวนปิด) **ไม่ยุบอีกแล้ว** — เจ้าของสั่ง "ไม่ยุบ บรรทัดไหนๆ ไม่ว่าเงื่อนไขใดๆ" (กลับคำตัดสิน 2026-06-29 ที่ให้เปิด-แต่-ว่างยุบได้ เฉพาะฝั่ง blank). **จงใจ diverge จาก `html.ts`** ซึ่งยังยุบแถวเปิด-แต่-ว่าง (ฉลากยาจริงเนื้อหาแปรตามสินค้า ยุบให้กระชับ = ตั้งใจ) — ทำได้เพราะสอง builder ได้ form คนละ profile แล้ว ไม่มี preview ข้ามกัน. probe: render แล้วนับ top-level div ใน `.label-fit` ต้อง = 10 ทุก combo.
