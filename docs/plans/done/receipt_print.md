# แผน: ระบบพิมพ์ใบเสร็จ/สลิปเงินสด + ใบกำกับภาษี (rev.2 — ปรับตาม audit)

## Context

ปัจจุบันแอป POS บันทึกการขายได้ครบ (มี VAT แบบรวมในราคาแล้ว) แต่ **ยังพิมพ์ใบเสร็จไม่ได้เลย** — มี `printer:printReceipt` (ESC/POS ส่งผ่าน TCP) ค้างอยู่ในโค้ดแต่ไม่เคยถูกเรียกใช้จาก renderer และผูกกับเครื่องพิมพ์เครือข่าย IP ตายตัว ส่วนระบบพิมพ์ฉลาก (`printer:printLabel`) ใช้กลไก "render HTML → BrowserWindow ซ่อน → `webContents.print({silent:true})`" ที่ทำงานได้จริงและรองรับเครื่องพิมพ์ผ่านไดรเวอร์ OS

เป้าหมาย: เพิ่ม (1) พิมพ์ใบเสร็จ/สลิปเงินสดตอนขาย, (2) พิมพ์ซ้ำย้อนหลังจากประวัติการขาย, (3) ใบกำกับภาษี — **ทั้งอย่างย่อ (บนสลิป) และเต็มรูป (A4/A5)**

### การตัดสินใจจากผู้ใช้ (ยืนยันแล้ว)
- เครื่องพิมพ์สลิป: **ไดรเวอร์ Windows (USB)** → ใช้กลไก silent HTML print เดียวกับฉลาก (ไม่ใช้ ESC/POS TCP)
- ขนาดสลิป: **80 มม.**
- พิมพ์ตอนขาย: **toggle ตั้งค่าพิมพ์อัตโนมัติ (เปิด/ปิดได้)** + **checkbox ในหน้า payment modal**
- ใบกำกับภาษี: **ทั้งสองแบบ** (ย่อบนสลิป + เต็มรูป A4)
- เลขที่ใบกำกับเต็มรูป: **ใช้ `invoice_no` (RC-) เดิม** เป็นเลขลำดับ
- **เพิ่มตาราง `tax_invoices`** บันทึกการออกใบกำกับเต็มรูป (snapshot ผู้ซื้อ + ต้นฉบับ/สำเนา)
- บิล voided → **บล็อกใบกำกับ** + สลิปขึ้น VOID; บิล return → **เอกสาร "ใบรับคืนสินค้า" แยก** (ยังไม่ทำใบลดหนี้เต็มรูป ม.86/10 ใน v1)

---

## สถาปัตยกรรมเดิมที่อ้างอิง (สำรวจแล้ว)

| สิ่งที่มีอยู่ | ที่อยู่ | ใช้ทำอะไร |
|---|---|---|
| `printer:printLabel` (silent HTML→print + ฝังฟอนต์) | `electron/ipc/printer.ts:132` | ต้นแบบ flow พิมพ์เงียบผ่านไดรเวอร์ OS |
| `printer:previewLabelPdf` | `electron/ipc/printer.ts:174` | ต้นแบบ preview PDF |
| `printer:listPrinters` | `electron/ipc/printer.ts:128` | enum เครื่องพิมพ์ |
| `printer:printReceipt` (ESC/POS TCP) | `electron/ipc/printer.ts:105` | **dead code** — ปล่อยไว้ ไม่ใช้ |
| ข้อมูลร้าน (`settings`) | `schema.ts:21` | `shop_name/address/phone/license_no/tax_id/line_id` (**ยังไม่มี `shop_branch`**) |
| ข้อมูลการขาย | `schema.ts:231` `sales`+`sale_items` | subtotal/total_discount/**total_vat**/total_amount/cash/card/transfer/change + per-line `unit_vat` (VAT รวมในราคา ถอดแล้ว) |
| ดึงบิลเต็ม | `reports.getSaleByInvoice` `reports.ts:86` | items + customer_name + sold_by_name — **ดึง `sale_items` ทุกแถว ไม่ filter `is_cancelled`** (reports.ts:104) |
| save singleton ที่ถูกต้อง | `settings.ts:207` `saveSalesSettings` | ensure-row-then-UPDATE (ต้นแบบที่ควรลอก) |
| save singleton ที่มี bug | `settings.ts:180` `saveLabelSettings` | ไม่มี row → INSERT DEFAULT แล้ว **ทิ้ง payload** (อย่าลอก) |
| LabelSettingsTab (ต้นแบบ UI) | `src/pages/Settings/LabelSettingsTab.tsx` | preview ซ้าย/ตั้งค่าขวา + ฝังฟอนต์ base64 |

---

## แนวทาง

ใช้สถาปัตยกรรม HTML→silent print ที่พิสูจน์แล้วใน `LabelSettingsTab` ซ้ำทั้งหมด ไม่แตะ ESC/POS เดิม (`openCashDrawer` ยังคงใช้ TCP — คนละเรื่อง)

### 1. Backend — generalize print IPC (`electron/ipc/printer.ts`)  *(audit #5, #6)*

- **`printer:printHtml`** — รับ `{ html, printerName, paperWidthMm, heightMm?: number | 'auto', copies?: number }`
  - flow เหมือน `printLabel`: load `data:` URL → `await document.fonts.ready` → รอ image decode (`Promise.all([...img].map(i=>i.decode().catch(()=>{})))`) → double `requestAnimationFrame`
  - **auto-height** (สลิปม้วน): หลัง layout วัด `Math.ceil(document.documentElement.getBoundingClientRect().height)` (px) → มม. ด้วย `px * 25.4 / 96` (1 CSS px = 1/96 นิ้ว) → บวก bleed ท้าย ~3มม. → **clamp** min 40มม. / max 2000มม. แล้วตั้ง `pageSize.height`
  - HTML ฝั่ง builder ต้องมี `@page { size: 80mm auto; margin: 0 }`, `body { width: 80mm; margin: 0 }`
  - **copies**: loop `await print()` ตามจำนวน (sequential, รอแต่ละครั้งจบก่อนส่งงานถัดไป)
  - **fallback**: ถ้า `heightMm` เป็นตัวเลข (ไม่ใช่ 'auto') ใช้ค่านั้นตายตัว — รองรับไดรเวอร์ thermal บางตัวที่ไม่รับ custom long page (ตั้งผ่าน `receipt_settings.paper_height_mm`, 0 = auto)
  - คืน `{ success, error? }`
- **`printer:previewHtmlPdf`** — รับ `{ html, paperWidthMm, heightMm?, pageFormat?: 'A4'|'A5' }` → `printToPDF` + `shell.openPath` (เหมือน `previewLabelPdf`); ใบกำกับเต็มรูปส่ง `pageFormat:'A4'`, `preferCSSPageSize:true`
- ลงทะเบียน preload `printer` namespace (`electron/preload.ts:130`) + type ใน `window.api`

### 2. ใบกำกับภาษี — Compliance ม.86/4 และ 86/6  *(audit #1 — High)*

อ้างอิง: กรมสรรพากร ม.86/4 (เต็มรูป) และ ม.86/6 (อย่างย่อ) — https://www.rd.go.th/5208.html

**(a) ใบกำกับภาษีเต็มรูป (ม.86/4) — รายการบังคับครบ:**
1. คำว่า **"ใบกำกับภาษี"** เด่นชัด (ใช้ "ใบกำกับภาษี/ใบเสร็จรับเงิน")
2. ชื่อ–ที่อยู่–**เลขประจำตัวผู้เสียภาษีผู้ขาย** + **ระบุสาขา** ("สำนักงานใหญ่" หรือเลขสาขา) → จาก `settings` (เพิ่ม `shop_branch`)
3. ชื่อ–ที่อยู่–**เลขประจำตัวผู้เสียภาษีผู้ซื้อ** + **สาขาผู้ซื้อ** (กรณีนิติบุคคล)
4. **หมายเลขลำดับ** = `invoice_no` (RC-)
5. ชื่อ/ชนิด/ปริมาณ/มูลค่าสินค้า
6. **จำนวน VAT แยกชัดเจน** จากมูลค่าก่อนภาษี (ถอดจาก `total_vat`/`unit_vat` ที่บันทึก)
7. วัน–เดือน–ปี ที่ออก
8. ระบุ **"ต้นฉบับ"/"สำเนา"** (ดู tax_invoices)

**(b) ใบกำกับภาษีอย่างย่อ (ม.86/6) — บนสลิป 80มม. เมื่อ VAT เปิด:**
1. คำว่า **"ใบกำกับภาษีอย่างย่อ"**
2. ชื่อ/ชื่อย่อ + **เลขผู้เสียภาษีผู้ขาย** (+ สาขา)
3. หมายเลขลำดับ = `invoice_no`
4. ชื่อ/ชนิด/ปริมาณ/มูลค่าสินค้า
5. **ข้อความ "ราคารวมภาษีมูลค่าเพิ่มไว้แล้ว"** (บังคับ — ปัจจุบันแผนเดิมขาด)
6. วัน–เดือน–ปี

**(c) ตาราง `tax_invoices` (ใหม่)** — บันทึกการออกใบกำกับเต็มรูป:
```
id, sale_id (UNIQUE FK→sales), doc_no (=invoice_no),
buyer_name, buyer_address, buyer_tax_id, buyer_branch,
original_printed INTEGER DEFAULT 0,   -- ออกต้นฉบับแล้วหรือยัง
issued_at, issued_by
```
- ออกครั้งแรก → INSERT (snapshot ผู้ซื้อ) + พิมพ์หัว **"ต้นฉบับ"** แล้ว set `original_printed=1`
- ออกซ้ำ → อ่าน row เดิม (ไม่ต้องกรอกผู้ซื้อใหม่) + พิมพ์หัว **"สำเนา"**
- handler `tax:issueOrGet(sale_id, buyer)` / `tax:get(sale_id)` ใน ipc ใหม่ (`electron/ipc/tax.ts`) + preload

**(d) Validation ผู้ซื้อก่อนพิมพ์เต็มรูป:** ชื่อ + ที่อยู่ **บังคับ**; ถ้ากรอกเลขผู้เสียภาษี ต้องเป็น 13 หลัก; สาขา default "สำนักงานใหญ่". ไม่ครบ → toast + บล็อก

**(e) Policy บิลพิเศษ:** `status='voided'` หรือ `sale_type='return'` → **บล็อกปุ่มใบกำกับภาษี** (ทั้งย่อ/เต็ม)

### 3. ตารางตั้งค่า `receipt_settings` (singleton)  *(audit #2 — High)*

เพิ่ม `CREATE TABLE` + ALTER migrations ใน `electron/db/schema.ts`. **handler `settings:saveReceiptSettings` ต้องใช้ pattern ของ `saveSalesSettings` (settings.ts:207) — ensure row ก่อนแล้ว UPDATE ค่าจริง ไม่ใช่ INSERT DEFAULT VALUES แบบ `saveLabelSettings` (ที่ทิ้ง payload ครั้งแรก)**. dynamic SQL จาก `Object.keys` → ทุก key ต้องเป็นคอลัมน์จริง. คอลัมน์:
```
printer_name TEXT DEFAULT '', paper_width_mm REAL DEFAULT 80, paper_height_mm REAL DEFAULT 0, -- 0=auto
auto_print INTEGER DEFAULT 0, copies INTEGER DEFAULT 1,
font_family TEXT DEFAULT 'Bai Jamjuree', font_size REAL DEFAULT 11,
header_note TEXT DEFAULT '', footer_note TEXT DEFAULT 'ขอบคุณที่ใช้บริการ',
abbrev_tax_invoice INTEGER DEFAULT 1   -- VAT เปิด → สลิป = ใบกำกับภาษีอย่างย่อ
```
เพิ่ม `shop_branch TEXT DEFAULT 'สำนักงานใหญ่'` ใน `settings` + ShopTab. เพิ่ม preload + type `ReceiptSettings`

### 4. ตัวสร้าง HTML (renderer, reuse)  *(audit #4)*

`src/lib/print/fonts.ts` — แชร์ `buildPrintFontFaceCss`/`esc`/`styleToCss`/`FONT_REGISTRY` จาก `LabelSettingsTab.tsx`

- **`normalizeSale(...)` → `SaleForPrint`** — shape เดียวป้อนได้ทั้ง POS (cart) และ history. **กรอง `is_cancelled=1` ออก** เมื่อประกอบรายการ (defensive)
- **`buildSlipHtml(sale, shop, settings, { mode })`** mode = `'receipt' | 'abbrevTax' | 'return' | 'void'`:
  - 80มม. + `@page size 80mm auto`. หัวร้าน / เลขบิล / วันที่ / ลูกค้า / ตารางรายการ (ชื่อ, จำนวน×ราคา, ส่วนลด, รวม) / ยอดรวม–ส่วนลด / **ถ้า VAT: มูลค่าก่อนภาษี + VAT** / รวมทั้งสิ้น / รับเงิน–เงินทอน / footer
  - `abbrevTax` → หัว "ใบกำกับภาษีอย่างย่อ" + เลขผู้เสียภาษีร้าน(+สาขา) + **"ราคารวมภาษีมูลค่าเพิ่มไว้แล้ว"**
  - `return` → หัว "ใบรับคืนสินค้า", ยอดติดลบ, ไม่ใช่ใบกำกับ
  - `void` → watermark/หัว "ยกเลิก (VOID)"
- **`buildTaxInvoiceHtml(sale, shop, taxInvoiceRecord, { copy })`** → A4: รายการบังคับ ม.86/4 ครบตามข้อ 2(a); `copy` คุมข้อความ "ต้นฉบับ"/"สำเนา"

### 5. หน้าตั้งค่า `ReceiptSettingsTab.tsx` (mirror `LabelSettingsTab`)

แท็บใหม่ใน `Settings/index.tsx` ("การพิมพ์ใบเสร็จ"): เลือกเครื่องพิมพ์, ความกว้าง/สูง(auto), toggle พิมพ์อัตโนมัติ, ฟอนต์/ขนาด, header/footer, toggle ใบกำกับย่อ, จำนวนสำเนา + ปุ่ม "ดูตัวอย่าง PDF" / "ทดสอบพิมพ์" (sale ตัวอย่าง). โครงเดียวกับ LabelSettingsTab (preview ซ้าย/ตั้งค่าขวา, `variant="elevated"`)

### 6. POS — พิมพ์ตอนขาย (`src/pages/POS/index.tsx`)  *(audit #3)*

- โหลด `receiptSettings` (เหมือน `salesSettings`)
- payment modal: **Checkbox "พิมพ์ใบเสร็จ"** default = `receiptSettings.auto_print`
- ใน `handleCompleteSale` (~674):
  1. หลัง `saveBill` สำเร็จ → **ประกอบ `SaleForPrint` เก็บใน state `lastSaleForPrint` ก่อน `clearCart`** (cart ถูก clear ที่บรรทัด 697 ทันที — ต้อง snapshot ก่อน)
  2. ถ้า checkbox ติ๊ก → พิมพ์ใน **try/catch แยกจากการ save**: print fail = **ไม่ทำให้การขายล้มเหลว** → toast error + เปิด success dialog ค้างไว้ให้กด retry
- Success dialog (`ConfirmDialog` ~2282) → เพิ่มปุ่ม **"พิมพ์ใบเสร็จ"** (พิมพ์ซ้ำจาก `lastSaleForPrint` — ไม่ fetch)

### 7. ประวัติการขาย — พิมพ์ย้อนหลัง  *(audit #3, #4)*

- **`Manage/Sales.tsx`** row popover (~382): เมนู "พิมพ์ใบเสร็จ" + "ใบกำกับภาษี" — `getSaleByInvoice` → `normalizeSale` (กรอง is_cancelled) → print. **ปุ่มใบกำกับซ่อน/disable เมื่อ voided/return**
- **`SaleDetailDialog.tsx`** footer (~299): ปุ่มพิมพ์ทั้งสอง (มี `detail` แล้ว)
- voided → พิมพ์ slip mode `void`; return → mode `return`
- ใบกำกับเต็มรูป: เปิด **`TaxInvoiceBuyerDialog`** (กรอก/แก้ผู้ซื้อ, prefill จาก `tax_invoices` ถ้าเคยออก ไม่งั้น prefill จาก customer: `full_name`/`address`/`id_card`) → `tax:issueOrGet` → `buildTaxInvoiceHtml` → `printHtml(A4)`/`previewHtmlPdf`

---

## ไฟล์ที่แก้/เพิ่ม

| ไฟล์ | งาน |
|------|------|
| `electron/ipc/printer.ts` | + `printHtml` (auto-height + copies + fallback), `previewHtmlPdf` (A4) |
| `electron/ipc/tax.ts` (ใหม่) | `tax:issueOrGet`, `tax:get` (tax_invoices) |
| `electron/preload.ts` | + printer 2 method, + `tax` namespace |
| `electron/db/schema.ts` | + `receipt_settings`, + `tax_invoices`, + `settings.shop_branch` (ALTER) |
| `electron/ipc/settings.ts` | + `get/saveReceiptSettings` (**ensure-row pattern แบบ saveSalesSettings**) |
| `src/types/index.ts` | + `ReceiptSettings`, `SaleForPrint`, `TaxInvoice`, window.api types |
| `src/lib/print/fonts.ts` (ใหม่) | แชร์ helper ฝังฟอนต์ |
| `src/lib/receipt/normalizeSale.ts` (ใหม่) | shape เดียว + กรอง is_cancelled |
| `src/lib/receipt/buildSlipHtml.ts` (ใหม่) | สลิป 80มม. (receipt/abbrevTax/return/void) |
| `src/lib/receipt/buildTaxInvoiceHtml.ts` (ใหม่) | ใบกำกับเต็มรูป A4 (ม.86/4) |
| `src/pages/Settings/ReceiptSettingsTab.tsx` + `index.tsx` | แท็บตั้งค่า |
| `src/pages/Settings/ShopTab.tsx` | + field สาขา |
| `src/pages/POS/index.tsx` | checkbox + lastSaleForPrint + print แยก fail path + ปุ่ม success dialog |
| `src/pages/Manage/Sales.tsx` | เมนูพิมพ์ (บล็อก void/return สำหรับใบกำกับ) |
| `src/components/dialogs/SaleDetailDialog.tsx` | ปุ่มพิมพ์ footer |
| `src/components/dialogs/TaxInvoiceBuyerDialog.tsx` (ใหม่) | กรอก/แก้ + validate ผู้ซื้อ |

## ข้อควรระวัง (ตาม CLAUDE.md)
- **ห้าม emoji** ใน HTML/UI — lucide icons + semantic tokens
- dynamic SQL จาก `Object.keys` → key ใน form ต้องเป็นคอลัมน์จริง (อย่า spread แปลกปลอม → `no such column`)
- UI ใช้ `src/components/ui/` + `variant="elevated"`; preview กระดาษใช้ `bg-white text-black` literal ได้
- print ต้องฝังฟอนต์ base64 ไม่งั้น fallback เป็นฟอนต์ default
- VAT รวมในราคาแล้ว — ถอดด้วย `total_vat`/`unit_vat` ที่บันทึก อย่าคำนวณใหม่ให้เพี้ยน
- **ห้าม `npm install`** (พัง better-sqlite3) — ฟีเจอร์นี้ไม่ต้องเพิ่ม dependency

## การทดสอบ (verify)
1. `npm run electron:dev`
2. ตั้งค่า > ข้อมูลร้าน: กรอกเลขผู้เสียภาษี + สาขา; > การพิมพ์ใบเสร็จ: เลือกเครื่องพิมพ์ + "ดูตัวอย่าง PDF" → ตรวจ 80มม. (เปิด/ปิด VAT เช็คบล็อกภาษี + ข้อความ "ราคารวม VAT แล้ว")
3. **บันทึก receipt settings ครั้งแรก (DB ยังไม่มี row) แล้วรีโหลด → ค่าต้องคงอยู่** (กัน bug INSERT-DEFAULT)
4. POS: ขาย 1 บิล (ส่วนลด + หลายรายการ) ติ๊กพิมพ์ → สลิปถูกต้อง ยอด/VAT/เงินทอนตรง DB; กดพิมพ์ซ้ำใน success dialog ได้
5. ทดสอบ print fail (เครื่องพิมพ์ปิด) → การขาย **ยังสำเร็จ** + toast + retry ได้
6. auto_print เปิด → checkbox default ติ๊ก; ปิด → ไม่ติ๊ก
7. ประวัติ: ใบกำกับเต็มรูป → กรอกผู้ซื้อ (ทดสอบ validate ชื่อ/ที่อยู่/เลข 13 หลัก) → ออกครั้งแรก = "ต้นฉบับ", ครั้งสอง = "สำเนา" (ผู้ซื้อ prefill อัตโนมัติ); ตรวจรายการ ม.86/4 ครบ
8. บิล voided → ใบกำกับถูกบล็อก, สลิปขึ้น VOID; บิล return → ออก "ใบรับคืนสินค้า" (ยอดติดลบ ไม่ใช่ใบกำกับ)
9. บิลที่มี `is_cancelled` line → ไม่ขึ้นบนสลิป
