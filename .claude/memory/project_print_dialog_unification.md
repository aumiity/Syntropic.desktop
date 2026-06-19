---
name: project_print_dialog_unification
description: รวมกลไกพิมพ์เป็น popup preview + ยุบปุ่ม PDF — Phase 1 ทำแล้วแต่ถูกเขียนทับ (PAUSED); Phase 2 แผนพร้อม audit แล้ว
metadata:
  node_type: memory
  type: project
---

**เป้าหมาย:** ทำ popup dialog ก่อนพิมพ์จริง (ช่องกำหนดหน้า + จำนวนสำเนา) แทนปุ่ม "ดูตัวอย่าง PDF"/"ดู PDF" ที่กระจายอยู่ และยุบปุ่ม PDF ทิ้งทั้งหมด. ต้นแบบที่มีอยู่แล้ว = `src/pages/Reports/ReportPrintDialog.tsx` (ใช้กับ ข.ย.9/10/11).

## Phase 1 — ยุบปุ่ม PDF (⚠️ PAUSED 2026-06-19 — เคยทำเสร็จ tsc PASS แต่ถูกงานคู่ขนานเขียนทับ)

หนูลบปุ่ม PDF ครบ 5 ไฟล์แล้ว (tsc ผ่าน) แต่ **งานคู่ขนาน** (ฟีเจอร์ Environment/อุณหภูมิ-ความชื้น + drug-label: `EnvLog.tsx`, `EnvironmentTab.tsx`, `electron/ipc/env.ts`, `LabelPrintDialog.tsx`, `lib/label/*` ฯลฯ) แก้ไฟล์เดียวกันแล้วเขียนทับ → **ปุ่ม PDF กลับมาครบทั้ง 5 จุด**. ผู้ใช้ตัดสินใจ **เว้น Phase 1 ไว้ก่อน รองานคู่ขนานเสร็จ** แล้วค่อยลบปุ่ม PDF ใหม่ทีเดียวบนทรีสะอาด. อย่ารีบ re-apply เอง.

5 ไฟล์ + จุดที่ต้องลบ (อ้างอิงตอน resume):

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

## Phase 2 — GR popup preview (แผนพร้อมแล้ว ✅ ผ่าน audit 2 รอบ, ยังไม่ลงมือ)

**SSOT แผน = `docs/plans/GR_Print_Preview.html`** (Section B = ขั้นตอน Claude ทำงาน, ละเอียดพร้อมลงมือ). audit 2 รอบด้วย general-purpose ไม่มี P0/P1.

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
