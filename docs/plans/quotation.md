# แผน: ระบบออกใบเสนอราคา (Quotation) — rev.2 (ปรับตาม audit)

## Context

ตาม backlog (PROGRESS.md 2026-05-30) เหลือระบบใบเสนอราคา — ร้านต้องเสนอราคาลูกค้า (โดยเฉพาะลูกค้าส่ง/องค์กร) ก่อนการขายจริง ปัจจุบันยังไม่มี ตอนนี้มี print infra ครบแล้ว (silent HTML→A4 print, `buildPrintFontFaceCss`, `printer.printHtml`/`previewHtmlPdf`) + รูปแบบเอกสาร A4 จาก `buildTaxInvoiceHtml` ที่ reuse ได้เลย

**การตัดสินใจ (ยืนยันแล้ว):**
- ขอบเขต: **เต็มระบบ** — เก็บ DB + หน้าประวัติ (table-card) + สถานะ
- VAT: **แยกก่อน/หลัง VAT** (ราคาก่อนภาษี + VAT 7% + รวมสุทธิ) ตาม `sales_settings.vat`
- ตำแหน่ง: **กลุ่มการขาย** — เมนู sidebar ใหม่ "ใบเสนอราคา" วางใต้ "การขาย"
- แปลง→การขาย (POS): **เฟสถัดไป** (เผื่อ status `converted` ไว้ ยังไม่ทำ flow)
- **lifecycle: แก้ไข/ลบได้เฉพาะ `draft`** (sent/accepted/rejected/converted = ล็อก — ดู/พิมพ์ซ้ำ/เปลี่ยนสถานะได้เท่านั้น)

## แก้ตาม audit (docs/audits/quotation-plan-audit.md)
- **[High] เลขที่ไม่ race**: ไม่ใช้ `COUNT(*)+1` เปล่าๆ — ใช้ `MAX(suffix)+1` + **retry loop เมื่อชน UNIQUE** (SQLITE_CONSTRAINT) สูงสุด ~5 ครั้ง ใน transaction เดียว
- **[Med] issue_date เจ้าของชัด**: เซ็ต = เวลาบันทึก**ตอนสร้างเท่านั้น**, **immutable ตอน update**, renderer แสดง read-only. ช่องวันที่ที่ผู้ใช้แก้ได้คือ `valid_until` เท่านั้น
- **[Med] lifecycle immutability**: gate แก้/ลบเป็น **draft-only** (ดูด้านบน)
- **[Low] preload typing**: `window.api` ถูก type ผ่าน `import('@electron/preload').ElectronAPI` (`src/lib/utils.ts:57`); `electron/preload.d.ts` เป็นไฟล์ **generate จาก `tsc -p tsconfig.node.json`** — ต้องรัน tsc ให้ regenerate **ก่อน** renderer typecheck (ใส่ใน checklist แล้ว)

## สถาปัตยกรรมเดิมที่ reuse

| ของเดิม | ที่อยู่ | ใช้ทำ |
|---|---|---|
| ค้นหาสินค้า POS | `pos:searchProducts` `pos.ts:60` | ดึงสินค้า+units+ราคา มาเพิ่มบรรทัด |
| ค้นหา/ดึงลูกค้า | `pos:searchCustomers`, `people:getCustomer` | เลือกลูกค้า + prefill ที่อยู่/เลขภาษี |
| ถอด VAT | `extractVat` `@/lib/vat` | ราคารวม VAT แล้ว → ถอดเป็นฐาน+ภาษี |
| เอกสาร A4 | `buildTaxInvoiceHtml.ts` + `@/lib/print/fonts` | โครง A4 + ฝังฟอนต์ → คัดมาเป็น `buildQuotationHtml` |
| พิมพ์/พรีวิว | `printer.printHtml` / `previewHtmlPdf({pageFormat:'A4'})` | พิมพ์เงียบ + พรีวิว PDF |
| ตาราง list | `Manage/Sales.tsx` (table-card 4-zone + popover + pagination) | clone หน้าประวัติ |
| running code (อ้างอิง) | `nextCustomerCode` `codes.ts:38` (MAX-suffix) | แบบ MAX-suffix ที่กันลำดับเพี้ยน |
| ฟอร์ม UI | SectionCard / FormField / DateInput / Combobox / Badge / Dialog | builder |

## แนวทาง

### 1. Schema (`electron/db/schema.ts`)

ตารางใหม่ 2 ตาราง (CREATE ใน exec block หลัง `tax_invoices`):
```
quotations:
  id, quote_no TEXT UNIQUE, customer_id INTEGER NULL REFERENCES customers(id),
  customer_name TEXT, customer_address TEXT, customer_tax_id TEXT,   -- snapshot เพื่อพิมพ์คงที่
  issue_date TEXT,    -- เซ็ตตอนสร้าง = เวลาบันทึก, ไม่แก้ตอน update (immutable)
  valid_until TEXT,   -- ผู้ใช้แก้ได้
  status TEXT DEFAULT 'draft',        -- draft|sent|accepted|rejected|converted
  vat_enabled INTEGER, vat_rate REAL, -- snapshot ตอนสร้าง (rate เปลี่ยนภายหลังไม่กระทบใบเก่า)
  subtotal REAL, total_discount REAL, total_vat REAL, total_amount REAL,
  note TEXT, created_by INTEGER REFERENCES users(id),
  created_at, updated_at
quotation_items:
  id, quotation_id REFERENCES quotations(id) ON DELETE CASCADE,
  product_id INTEGER NULL REFERENCES products(id), item_name TEXT, unit_name TEXT,
  qty REAL, unit_price REAL, discount REAL, line_total REAL, sort_order INTEGER
```
+ index `idx_quotations_no`, `idx_quotation_items_q`. **ไม่แตะ stock/lots**. สถานะ `expired` **ไม่เก็บใน DB** — derived ตอนแสดง (`valid_until < today && status IN (draft,sent)`).

### 2. IPC (`electron/ipc/quotation.ts` ใหม่) + register `main.ts` + `preload.ts` (+ regen `preload.d.ts`)

- `quotation:save`
  - **ไม่มี id = สร้างใหม่**: `issue_date = datetime('now','localtime')`, snapshot `vat_enabled/vat_rate` จาก `sales_settings`, gen เลขที่ + **retry-on-collision**:
    ```
    for attempt in 1..5:
      no = `QT-${YYYYMMDD}-${pad(MAX(suffix for today)+1)}`
      try INSERT (UNIQUE quote_no) ... ; break
      catch SQLITE_CONSTRAINT_UNIQUE: continue   // recompute & retry
    ```
    ทั้งหมดใน `db.transaction`
  - **มี id = update**: เฉพาะเมื่อ `status='draft'` (ไม่งั้น throw `'แก้ไขได้เฉพาะใบร่าง'`). **ไม่แตะ `issue_date`/`quote_no`/`created_*`**. items = ลบเก่า + ใส่ใหม่ใน transaction
  - INSERT คอลัมน์ตรง (allow-list ชัด ไม่ spread `...form`)
- `quotation:list` — filters q/date/status + pagination (clone โครง `reports:salesList`)
- `quotation:get` — header + items (เรียง sort_order)
- `quotation:setStatus` — transition ที่อนุญาต: `draft→sent`, `sent→accepted|rejected`, และ revert `sent→draft` (ถ้ายังไม่ตอบรับ). ปฏิเสธ transition อื่น
- `quotation:delete` — **เฉพาะ `status='draft'`** (CASCADE items); ไม่งั้น throw

### 3. Print (`src/lib/receipt/buildQuotationHtml.ts` + เพิ่มใน `print.ts`)

คัดโครงจาก `buildTaxInvoiceHtml`: หัว **"ใบเสนอราคา / Quotation"**, ข้อมูลร้าน (getShop + สาขา), ข้อมูลลูกค้า, เลขที่ = `quote_no`, **วันที่ออก = issue_date**, **"ยืนราคาถึง {valid_until}"**, ตารางรายการ. **VAT แยก**: ถ้า vat_enabled → ยอดเป็นราคาก่อนภาษี + บรรทัด "ภาษีมูลค่าเพิ่ม {rate}%" + "รวมทั้งสิ้น"; ปิด → ไม่มีบรรทัด VAT. ปิดท้าย: หมายเหตุ + ช่องเซ็น. เพิ่ม `printQuotation`/`previewQuotation` ใน `print.ts` (A4 — เหมือน tax invoice)

### 4. Renderer

- **`src/pages/Quotation/QuotationList.tsx`** — clone `Manage/Sales.tsx`: filter strip (ค้นหา/DateRangePicker/สถานะ popover), ตาราง (เลขที่/วันที่ออก/ลูกค้า/ยืนราคาถึง/ยอดรวม/สถานะ Badge), **row popover gate ตามสถานะ**: ดู(พิมพ์) เสมอ · **แก้ไข + ลบ เฉพาะ draft** · เปลี่ยนสถานะตาม transition · พิมพ์/พรีวิว PDF เสมอ. ปุ่ม "+ สร้างใบเสนอราคา" → `/quotation/new`. Badge: draft=`neutral-outline`, sent=`info-outline`, accepted=`success-outline`, rejected=`destructive-outline`, expired(derived)=`warning-outline`, converted=`violet-outline`
- **`src/pages/Quotation/EditQuotation.tsx`** — builder (โครงคล้าย EditProduct: Save/Back ใน TabStrip cluster, dirty-guard):
  - ถ้าเปิดใบที่ `status!=='draft'` → **โหมด read-only** (ปุ่มบันทึกซ่อน, ฟอร์ม disabled, เหลือ พิมพ์/ดูตัวอย่าง)
  - เลือกลูกค้า: ปุ่มค้นหา → dialog `pos:searchCustomers`; เลือกแล้ว `people:getCustomer` prefill ชื่อ/ที่อยู่/เลขภาษี (แก้ได้); หรือกรอกเอง
  - รายการ: "เพิ่มสินค้า" → **`QuotationProductSearchDialog`** (`pos:searchProducts`); เลือก → เพิ่มบรรทัด default ราคา=price_retail; แก้ qty/ราคา/ส่วนลด inline; ลบบรรทัด
  - **`issue_date` แสดง read-only** (สร้างใหม่ = "วันนี้"); `valid_until` (DateInput, default = วันนี้+30วัน, แก้ได้); หมายเหตุ
  - การ์ดสรุป: รวม/ส่วนลด/ฐานภาษี+VAT (ถ้าเปิด)/รวมสุทธิ — คำนวณด้วย `extractVat` snapshot rate
  - ปุ่ม: บันทึก · ดูตัวอย่าง PDF · พิมพ์ (ได้หลังบันทึก — ต้องมี quote_no)
- **`src/components/dialogs/QuotationProductSearchDialog.tsx`** (ใหม่) — modal ค้นหาสินค้า (debounce → `pos:searchProducts`) → callback `{product, unit}`
- **routes** `src/App.tsx`: lazy `/quotation`, `/quotation/new`, `/quotation/:id/edit`
- **sidebar** `src/components/layout/Sidebar.tsx`: `{ to:'/quotation', label:'ใบเสนอราคา', icon: FileText }` **ถัดจาก "การขาย"**

### 5. types (`src/types/index.ts`)
`Quotation`, `QuotationItem`, `QuotationForPrint`

## ไฟล์ที่แก้/เพิ่ม
| ไฟล์ | งาน |
|---|---|
| `electron/db/schema.ts` | + 2 ตาราง + index |
| `electron/ipc/quotation.ts` (ใหม่) | save(retry+draft-gate) / list / get / setStatus / delete(draft-only) |
| `electron/main.ts`, `electron/preload.ts` | register + `quotation` namespace |
| `electron/preload.d.ts` | **regen ด้วย `tsc -p tsconfig.node.json`** ก่อน typecheck (อย่าแก้มือ) |
| `src/types/index.ts` | + Quotation / QuotationItem / QuotationForPrint |
| `src/lib/receipt/buildQuotationHtml.ts` (ใหม่) | เอกสาร A4 |
| `src/lib/receipt/print.ts` | + printQuotation / previewQuotation |
| `src/pages/Quotation/QuotationList.tsx` (ใหม่) | หน้าประวัติ (clone Manage/Sales) |
| `src/pages/Quotation/EditQuotation.tsx` (ใหม่) | สร้าง/แก้ไข (read-only เมื่อ != draft) |
| `src/components/dialogs/QuotationProductSearchDialog.tsx` (ใหม่) | ค้นหาสินค้า |
| `src/App.tsx`, `src/components/layout/Sidebar.tsx` | routes + nav |

## ข้อควรระวัง (CLAUDE.md)
- **ห้าม emoji** ใน UI/เอกสาร — lucide + semantic tokens
- INSERT คอลัมน์ตรง (allow-list) ไม่ spread `...form`
- UI ใช้ `src/components/ui/` + `variant="elevated"`; filter strip `h-14`, controls `h-10`; ตาราง table-card 4 zone
- VAT รวมในราคาแล้ว — ถอดด้วย `extractVat` **snapshot rate ตอนสร้าง** อย่าใช้ rate ปัจจุบัน
- print ฝังฟอนต์ base64 (`buildPrintFontFaceCss`) ไม่งั้น fallback
- **ห้าม `npm install`**
- ใบเสนอราคา**ไม่แตะ stock/lots/stock_movements**
- หลังแก้ `preload.ts` ต้อง regen `preload.d.ts` (tsc) ไม่งั้น renderer มองไม่เห็น `window.api.quotation.*`

## การทดสอบ (verify)
1. `tsc -p tsconfig.node.json` (regen preload.d.ts) → `tsc -p tsconfig.json` (renderer) ต้องเห็น `window.api.quotation.*`; แล้ว `npm run electron:dev`
2. Sidebar เห็น "ใบเสนอราคา" ใต้ "การขาย" → list ว่าง
3. สร้างใหม่: เลือกลูกค้า (prefill) → เพิ่มสินค้า 2–3 รายการ → ตั้ง valid_until → บันทึก → ได้ `QT-...`, issue_date = วันนี้
4. ดูตัวอย่าง PDF → A4: หัวใบเสนอราคา, ลูกค้า, วันที่ออก, ยืนราคาถึง, **ฐานภาษี + VAT 7% + รวมสุทธิ** (เปิด VAT) / ไม่มีบรรทัด VAT (ปิด)
5. **lifecycle**: draft → แก้ไข/ลบ ได้; เปลี่ยนสถานะเป็น sent → ปุ่มแก้ไข/ลบ **หาย**, เปิดใบ = read-only, ยังพิมพ์ได้; เปลี่ยน accepted/rejected
6. **issue_date immutable**: แก้ใบ draft แล้วบันทึกซ้ำ → issue_date ไม่เปลี่ยน
7. **เลขซ้ำ**: (จำลอง) เรียก save 2 ครั้งติดกัน → ได้คนละเลข ไม่ throw UNIQUE
8. `valid_until < วันนี้` → list แสดง expired (derived)
9. ลบใบ draft → หาย + items CASCADE; ลองลบใบ sent → ถูกปฏิเสธ
10. ยืนยันไม่มีแถวใน stock_movements/sale_item_lots จากการสร้าง/แก้ใบเสนอราคา