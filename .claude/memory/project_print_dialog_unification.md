---
name: project_print_dialog_unification
description: รวมกลไกพิมพ์เป็น popup preview + ยุบปุ่ม PDF — Phase 1 ทำแล้วแต่ถูกเขียนทับ (PAUSED); Phase 2 แผนพร้อม audit แล้ว
metadata:
  node_type: memory
  type: project
---

**เป้าหมาย:** ทำ popup dialog ก่อนพิมพ์จริง (ช่องกำหนดหน้า + จำนวนสำเนา) แทนปุ่ม "ดูตัวอย่าง PDF"/"ดู PDF" ที่กระจายอยู่ และยุบปุ่ม PDF ทิ้งทั้งหมด. ต้นแบบที่มีอยู่แล้ว = `src/pages/Reports/ReportPrintDialog.tsx` (ใช้กับ ข.ย.9/10/11).

## Phase 1 — ยุบปุ่ม PDF (✅ DONE — folded เข้า commit `d7dda8d` โดยงานคู่ขนาน)

ปุ่ม "ดูตัวอย่าง PDF"/"ดู PDF" + handler + state + FileText import ที่ไม่ใช้ **ถูกลบครบทั้ง 5 ไฟล์แล้ว** ใน commit `d7dda8d` (`feat(label): ... + print-dialog unification (WIP)` งานคู่ขนาน drug-label/Environment). ครั้งแรกหนูลบเองแต่ถูกเขียนทับชั่วคราว — commit สุดท้ายลบครบและสะอาด (grep ยืนยัน 2026-06-19: ไม่มี `handlePreviewPdf`/`pdfLoading`/`previewHtmlPdf`/`previewLabelPdf`/`clampCopies` ค้าง). คงไว้: live preview + ปุ่ม "ทดสอบพิมพ์"/"พิมพ์". เหลือแค่ comment เก่าพูดถึง "/PDF" 5 จุด (LabelSettingsTab:188,372 / LabelsTab:60,139,194) — ไม่กระทบการทำงาน.

(บันทึกเดิม — 5 ไฟล์ + จุดที่ลบ เก็บไว้อ้างอิง):

| File | ลบ |
|------|-----|
| `src/pages/Products/PrintTab/index.tsx` | ปุ่ม "ดูตัวอย่าง PDF" + `handlePreview` + dead `clampCopies` (FileText ยังใช้ tabs/cards) |
| `src/pages/Settings/ReceiptSettingsTab.tsx` | ปุ่ม + `handlePreviewPdf` + `pdfLoading` (FileText ยังใช้ SectionCard) |
| `src/pages/Settings/DocumentSettingsTab.tsx` | ปุ่ม + handler + state + FileText import |
| `src/pages/Settings/LabelSettingsTab.tsx` | ปุ่ม + handler + state + FileText import |
| `src/pages/Products/EditProduct/LabelsTab.tsx` | ปุ่ม "ดู PDF" + handler + state + FileText import |

คงไว้: live preview ในจอ, ปุ่ม "ทดสอบพิมพ์"/"พิมพ์", copies. IPC `previewHtmlPdf`/`previewLabelPdf` **ไม่ลบ** (infra ใช้ร่วม, นอกขอบเขต). Theme/index.tsx:1616 มี tsc error เดิมอยู่ก่อนแล้ว ไม่เกี่ยว.

## Scope decisions (จากผู้ใช้)

- **หน้าตั้งค่า (3 tab) + EditProduct/LabelsTab** = ยุบปุ่ม PDF อย่างเดียว (มี preview ในจออยู่แล้ว ไม่ทำ popup)
- **สลิป/ใบเสร็จ** = พิมพ์เงียบเหมือนเดิม ไม่มี popup. สลิป copies=1, height=auto เสมอ (`src/lib/receipt/print.ts` SLIP_COPIES/SLIP_HEIGHT) — "กำหนดหน้า" ไม่มีความหมายกับม้วนต่อเนื่อง
- **ใบ GR (ใบรับสินค้า)** = ต้องมี popup preview เหมือน ข.ย. (copies + page-range). GR หลายหน้าบ่อย (เช่น 30 รายการ)
- **ใบกำกับภาษี** = ยุบปุ่ม PDF + ทำ popup preview ในจอแทน, คงกลไก deferred-lock เดิม (`tax.confirmOriginalPrinted` หลังพิมพ์ต้นฉบับสำเร็จเท่านั้น)

## Phase 2 — GR popup preview (✅ DONE 2026-06-19, tsc PASS; in-app/print verify pending)

**SSOT แผน = `docs/plans/GR_Print_Preview.html`** (Section B = ขั้นตอนที่ทำจริง). audit 2 รอบ ไม่มี P0/P1.

**ไฟล์ที่ทำ:** `a4.tsx` (+`A4_PORTRAIT`/`A4P_CONTENT_W,H` + prop `orientation` บน A4Sheet, default landscape) · `printDomSheets.ts` (+param `orientation`, default landscape → `@page size`/`.a4-sheet` mm/`landscape:!isPortrait`) · `ReportPrintDialog.tsx` (+prop `orientation` → `sheet=A4_PORTRAIT|A4` สำหรับ preview box + ส่งต่อ printDomSheets, ใส่ dep) · **NEW `src/components/dialogs/GoodsReceiptPrintDialog.tsx`** (re-home type `GoodsReceiptForPrint`/`GoodsReceiptLine` มาที่นี่; measure specimen + pack + host ReportPrintDialog portrait) · `PurchaseReceiptDialog.tsx` (ปุ่มพิมพ์→`setPrintOpen`, `builtGr`=useMemo, ลบ toast/printGoodsReceipt) · ลบ `buildGoodsReceiptHtml.ts` + `printGoodsReceipt`/`previewGoodsReceipt` ใน print.ts · อัปเดต carve-out `ui-theming.md`.

**impl notes:** ระยะห่างในแผ่นใช้ **padding ไม่ใช่ margin** (offsetHeight วัด padding ไม่วัด margin → budget ไม่ขาด); ลายเซ็น `pt-6` (วัดได้); specimen mount เฉพาะตอน `open`; pack dep = `[open, lines(memoized), shop]`.

**GR restyle ตาม template TNP (2026-06-19):** เปลี่ยนให้เหมือนใบกำกับ — ตารางบ็อกซ์ (กรอบนอก + `border-l` คอลัมน์ + `border-b` ใต้หัว, ไม่มีเส้นแถว) + `renderTable` มี filler `h-full` ยืดเต็มหน้า (ห่อ `flex-1`); หัวสองภาษา (`\n`+`whitespace-pre-line`); totals = จำนวนเงินตัวอักษร (`bahtText`) ซ้าย + กล่อง summary ขวา; **footer (totals+signature) = หน้าสุดท้ายเท่านั้น** (เลิก signature ทุกหน้า; budget ไม่ลบ signatureH, footerH=totalsH+signatureH); `defaultZoom={1}`.

## Phase 3 — ใบกำกับภาษี popup + ตัด A5 (✅ DONE 2026-06-19, tsc PASS; in-app/print verify pending)

**SSOT แผน = `docs/plans/Tax_Invoice_Print_Preview.html`** (Section B). audit 2 รอบ ไม่มี P0/P1 ค้าง. **ตัด A5 ออกทั้งระบบ → A4 อย่างเดียว** (column `paper_size` = DEAD บังคับ A4, จดใน refine_schema #4 + คอมเมนต์ DEAD COLUMN schema.ts:623/types:197). เลือก **Path B เต็มตัว: ลบ `buildTaxInvoiceHtml` (HTML) → React A4Sheet** ใช้แผ่นเดียว (`taxInvoiceSheet.tsx`) ทั้ง popup พิมพ์จริง + พรีวิว DocumentSettingsTab.

**ไฟล์ที่ทำจริง:** `ReportPrintDialog.tsx` (+props `onPrint`(อ่านผ่าน ref ไม่อยู่ใน dep)/`printDisabled`/`printLabel`/`footerNote`; effect branch: onPrint → ข้าม built-in) · **NEW `src/components/receipt/taxInvoiceSheet.tsx`** (`taxInvoiceSheetParts`) · **รื้อ `TaxInvoiceBuyerDialog.tsx`** (popup preview portrait + measure-pack + `handlePrintGuarded`=issueOrGet→printDomSheets→confirmOriginalPrinted; buyer read-only ในแผ่น) · **รื้อ `DocumentSettingsTab.tsx`** (พรีวิว A4Sheet + ทดสอบพิมพ์ printDomSheets + เอา dropdown A5 + load loop `continue` paper_size) · `PrintTab` A4-only · ลบ `buildTaxInvoiceHtml.ts` + `printTaxInvoice`/`previewTaxInvoice`/`docConfig`/`PAGE_MM` ใน print.ts · carve-out ui-theming.md.

**P0 ที่คงไว้:** preview = transient record (ไม่ issueOrGet); `confirmOriginalPrinted` เฉพาะ `if(success && !isCopy)`; `isCopy` จาก issueOrGet; buyer READ-ONLY. **bug ที่กันไว้:** `await getDocumentSettings()`; money cell ทุกช่อง formatCurrency.

**Layout = clone ฟอร์ม TNP (2026-06-19, ตามรูปจริงที่ผู้ใช้ส่ง):** หัวสองคอลัมน์ (ร้านซ้าย + กล่อง meta ขวา: วันที่/เลขที่) → กล่องผู้ซื้อ (border) → ตารางบ็อกซ์ 5 คอลัมน์ (ลำดับ/จำนวน/รายการ/ราคาต่อหน่วย/จำนวนเงิน; หัวสองภาษา `\n`+`whitespace-pre-line`) **เส้นกรอบนอก + เส้นคอลัมน์เท่านั้น ไม่มีเส้นระหว่างแถว** + เส้นใต้หัวเดียว → **filler row `h-full` ดูดความสูง** ให้เส้นคอลัมน์ลากเต็มหน้า (ตารางห่อ `flex-1`) → ล่าง = จำนวนเงินตัวอักษร (`bahtText`) ซ้าย + กล่องสรุป VAT ขวา (ก่อน VAT/VAT%/รวม VAT) + ลายเซ็น (ผู้รับสินค้า/ผู้รับเงิน + ผู้รับมอบอำนาจ). **footer (totals+signature) = หน้าสุดท้ายเท่านั้น** (pseudo-row `footerH=totalsH+signatureH`; budget ต่อหน้าไม่ลบ signatureH แล้ว). default zoom popup ใบกำกับ = 1.0 (prop `defaultZoom`). **ข้อจำกัดข้อมูล:** ไม่มี รหัสสินค้า/โลโก้/ชื่อร้าน EN/PO/SO/Salesman → คอลัมน์แรกใช้ "ลำดับ", ช่องที่ไม่มีเว้นว่าง.

**งานหลัก:** (1) extend `ReportPrintDialog` +props `onPrint`/`printDisabled`/`printLabel`/`footerNote` (default off → GR/ข.ย./EnvLog ไม่กระทบ; **อ่าน onPrint ผ่าน ref ไม่ใส่ dep array** กัน double-spool; branch ใน effect `printRender` หลัง mount `.a4-doc`) (2) NEW `src/components/receipt/taxInvoiceSheet.tsx` (shared sheet parts) (3) รื้อ `TaxInvoiceBuyerDialog` เป็น popup preview + `onPrint=handlePrintGuarded` (issue→spool→lock) (4) รื้อ `DocumentSettingsTab` พรีวิว→A4Sheet + เอา dropdown A5 ออก + load loop `continue` ที่ paper_size (5) PrintTab A4-only (6) ลบ `buildTaxInvoiceHtml.ts`+`printTaxInvoice`/`previewTaxInvoice`+orphaned `docConfig`/`PAGE_MM`.

**invariant ห้ามพัง (P0):** preview = transient record (ห้าม issueOrGet); `confirmOriginalPrinted` เฉพาะ `if(success && !copy)`; `copy` จาก issueOrGet ไม่ใช่ alreadyOriginal; buyer READ-ONLY (ไม่มี picker). **bug ที่ audit จับ:** `getDocumentSettings()` เป็น Promise ต้อง `await`; money cell ทุกช่อง (รวม qty "5.00") ผ่าน `formatCurrency`; presets.ts/buildPriceTagHtml คง `'A4'|'A5'` (รับ 'A4' ได้, A5 dead).

---
(แผนเดิมเฟส 2 audit 2 รอบ — รายละเอียดด้านล่างเก็บไว้อ้างอิง)

เลือก **Path B = React `A4Sheet` + `printDomSheets`** (ท่อเดียวกับ ข.ย.) ไม่ใช่ iframe+`printHtml`. เหตุผล: iframe ปล่อย print engine ตัดหน้าเอง → preview มองไม่เห็นรอยตัด + กำหนดหน้าเดามั่วเมื่อหลายหน้า. printDomSheets แบ่งหน้าเอง → preview=พิมพ์ 1:1 + เลือกหน้าแม่น (`.a4-sheet` ฝั่ง client).

**สรุปงาน (รายละเอียดเต็มใน HTML):**
1. `a4.tsx`: เพิ่ม `A4_PORTRAIT={W:794,H:1123}` + `A4P_CONTENT_W=714`/`A4P_CONTENT_H=1059` + prop `orientation` ให้ `A4Sheet` (default `'landscape'`). **ไม่แตะ `index.css`** — `@page` อยู่ใน HTML ที่ `printDomSheets` สร้างเอง (ก่อนหน้าหนูจดผิดว่าต้องแก้ index.css)
2. `printDomSheets.ts` + `ReportPrintDialog.tsx`: เพิ่ม `orientation` (default landscape) → ข.ย. ไม่กระทบ
3. สร้าง `src/components/dialogs/GoodsReceiptPrintDialog.tsx`: แผ่น GR React + measure specimen + measure-pack + host ReportPrintDialog. **Layout:** หัวร้าน+กล่องคู่ค้า **ทุกหน้า**; ลายเซ็น **ทุกหน้า** (ติดล่างด้วย flex spacer); **ยอดรวมเงินหน้าสุดท้ายเท่านั้น** (ใต้ตาราง). พื้นที่ว่าง = เปล่าไม่มีเส้น
4. `PurchaseReceiptDialog.tsx`: ปุ่มพิมพ์เปิดกล่องใหม่ (`builtGr` = useMemo); ลบ `printGoodsReceipt`
5. ลบ `buildGoodsReceiptHtml.ts` + `printGoodsReceipt`/`previewGoodsReceipt` (ย้าย type `GoodsReceiptForPrint`/`GoodsReceiptLine` เข้า dialog ใหม่ก่อน)

**บทเรียนจาก audit (ฝังในแผน):**
- **EnvLog.tsx เป็น A4Sheet consumer ตัวที่ 3** (นอกจาก KhorYor9/KhorYorSaleLedger) — ทุกตัวเรียก prop-less → orientation default landscape ต้องคงไว้; regression test ทั้ง 4
- **ยอดรวม = pseudo-row ต่อท้าย** pack ด้วย `budgetRows` เดียว (ไม่ใช่ budgetRowsLast+pop-loop) → ไม่มีทางถูก `overflow-hidden` ตัด
- **budget ของ GR ลบ `partiesH`+`signatureH`** ต่างจาก KhorYor9/EnvLog (ที่ไม่ลบ) เพราะ GR ซ้ำทุกหน้า — อย่า "align to KhorYor9"
- **วันที่** = `formatDate(x,'D MMMM BBBB')` + ต้องอัปเดต carve-out `docs/claude/ui-theming.md:61` (เพราะลบ `buildGoodsReceiptHtml`)
- qty ใช้ `formatQty` (strip zeros "5" ไม่ใช่ "5.00") — ตั้งใจเปลี่ยน
- `printer:printDocument` รองรับ `landscape`(default false=portrait)+`copies` อยู่แล้ว; `printer:printHtml` ไม่รองรับ `pageRanges` (Path B ไม่ต้องใช้)

ใบกำกับภาษี (Phase 3) ใช้ primitive แนวตั้งชุดนี้ต่อ + เพิ่ม A5

## Related
- [[next-feature-10-11-reports]] — ข.ย.10/11 ที่ใช้ ReportPrintDialog ร่วม
- [[project_tax_invoice_flow]] — deferred-lock ใบกำกับที่ต้องคงไว้ตอน Phase 3
- [[project_fda_registers_redesign]] — ReportPrintDialog + a4.tsx pagination ต้นแบบ
