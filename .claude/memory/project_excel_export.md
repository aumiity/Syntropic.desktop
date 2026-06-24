---
name: project_excel_export
description: Export-to-Excel (.xlsx) feature — exceljs (already installed), main-side export:* handlers (requireAdmin + full-set queries), per-page ExportButton + central ExportHub
metadata:
  type: project
---

**DONE + VERIFIED 2026-06-24 (real-Electron e2e 24/24 PASS — `tests/e2e/verify-excel-export.mjs`).** Plan SSOT = `docs/plans/Excel_Export.html` (Section B). Built via Studio pipeline (wizard plan → blacksmith → priest PASS → e2e verify). Verified on REAL dev DB at scale (บิลขาย 219k+ แถว, ซื้อ 62k): 4 dataset export ok, sheet counts (sales 2/purch 2/vat 3/exp 1), Thai text, date=DD/MM/YYYY text, currency numeric, barcode/lot text, empty-range→header-only, cancel→silent, **staff→FORBIDDEN ทั้ง 4**.

**บั๊กที่ verify จับได้แล้วแก้ (สำคัญ):** `export:sales` + `export:purchases` line query เดิมใช้ `WHERE invoice_no IN (<รายการบิลทั้งหมด>)` → **"too many SQL variables"** ทันทีเมื่อช่วงวันกว้าง (>999 บิล — dev DB มี 200k+). แก้ = re-apply ตัวกรอง header ตรง ๆ ใน line query (sales เพิ่ม `LEFT JOIN customers c` ให้ q ใช้ได้) แทน IN-list → params น้อยคงที่. **กฎ: อย่าใช้ `IN (<literal list ยาว>)` กับชุดที่โตตามข้อมูล — filter ซ้ำหรือ subquery แทน.**

**วิธี verify (e2e pattern):** `node tests/e2e/verify-excel-export.mjs` (ต้อง `npm run dev` รัน :5173 ก่อน). Playwright `_electron` launch (macOS binary `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`); แอปเปิด >1 window → ต้องเลือก window ที่ url=:5173 + มี `window.api` (firstWindow race); `auth:devLogin`=admin / `auth:devSetRole('staff')`=สลับ role; stub `dialog.showSaveDialog` ใน main ผ่าน `app.evaluate` (main เป็น ESM — **ห้ามใช้ `require` ใน stub**); อ่าน .xlsx กลับด้วย exceljs. ใช้ dev DB จริงได้ (export read-only).

**สิ่งที่ส่งออกได้ (เฟส 1, finance = admin เท่านั้น):** บิลขาย / บิลซื้อ-GR / VAT / ค่าใช้จ่าย. บิล = 2 ชีต (หัวบิล + รายการ), VAT = 3 ชีต, ค่าใช้จ่าย = 1 ชีต.

**ไฟล์ใหม่:**
- `electron/services/excel.ts` — workbook builder ด้วย exceljs; `SheetColumn{header,key,width?,type?:'text'|'number'|'currency'|'date'}` + `SheetSpec`; `fmtDate()` คืน `DD/MM/YYYY` (ค.ศ.); `writeWorkbook()` หัวชีตหนา+แช่แถวบน+autofilter; text col → `numFmt='@'` (barcode/lot/tax_id ไม่เพี้ยน), currency → `'#,##0.00'` (number จริง SUM ได้); วันที่เก็บเป็น **text** ตามกฎรูปแบบเดียว (แลก = sort ตามวันใน Excel ไม่ได้)
- `electron/ipc/exports.ts` — `export:sales/purchases/vat/expenses`; แต่ละตัว `requireAdmin(e)` บรรทัดแรก (security main-side); `saveAndWrite()` เลียนแบบ `matcher:exportCSV` (`showSaveDialog`→`writeFile`→`{ok,path}`/`{ok:false,canceled:true}`)
- `src/components/ui/export-button.tsx` — primitive ใช้ร่วม (loading + toast เอง; cancel = เงียบ; `iconOnly` = h-9 w-9 + tooltip)
- `src/pages/Reports/ExportHub.tsx` — หน้าศูนย์รวม `/reports/export`; **self-gate ด้วย `isAdmin`** (route `/reports` ไม่ได้ guard — staff พิมพ์ URL เข้าได้)

**ไฟล์แก้:** `vite.config.ts:23` (+`'exceljs'` ใน **main** external เท่านั้น — preload ไม่แตะ); `electron/ipc/reports.ts` (แยก `export function computeVatSummary(db,{date_from,date_to})` = queries ล้วน; `reports:vatSummary` คง `requireAdmin` + return shape เดิม); `main.ts` (+register); `preload.ts` (+namespace `exports`); ปุ่มใน Manage/Sales·Purchases·Expenses + Reports/VatReport (gate `isAdmin`; VatReport ปุ่มอยู่ใน `setToolbar(...)` effect คง cleanup); `Reports/index.tsx` (แท็บใหม่ = แก้ทั้ง `TABS` **และ** `resolveTab()`); `App.tsx` (lazy route).

**กับดักที่ audit/priest จับได้ (อย่าพลาดซ้ำ):**
- **`exceljs` ต้องอยู่ใน `vite.config.ts` main external** ไม่งั้น bundle พัง (มี vite.config.js/.d.ts แต่เป็น artifact — แก้ .ts ตัวเดียว). exceljs = **CommonJS** → `import ExcelJS from 'exceljs'` (default, ห้าม `import * as`). exceljs ติดตั้งอยู่แล้ว v4.4.0 — **ห้าม `npm install`**
- **`expenses:list` ตันที่ 50 แถว** (ไม่รับ `'all'`) → export ต้องส่ง `pageSize:0` (→ no LIMIT) ไม่งั้นข้อมูลหาย; `salesList`/`purchase:history` รับ `limit:'all'`/null ได้
- **บิลซื้อ line query**: JOIN `products p` ใช้ `p.trade_name` (ไม่ใช่ `p.name`/`item_name`) + `COALESCE(pri.unit_name, iu.name)`; link = `invoice_no` (ไม่มี numeric id); `purchase_receipt_items` ไม่มี `is_cancelled`/`supplier_name` (cancel อยู่ที่ header `pr.status`); mirror `purchase.ts:406-423`
- **บิลขาย line query**: scope ด้วย header `invoice_no IN(...)`; ห้ามก๊อป `q` clause ของ salesList (อ้าง `c.full_name` ผ่าน customers join ที่ line query ไม่มี)

**หมายเหตุ scope:** ตอน build ฟีเจอร์นี้ working tree มีงาน **ส่วนลด GR ที่กำลังทำคู่ขนาน** ปนอยู่ (`src/pages/Purchase/index.tsx` + `docs/plans/discount_logic_purchase.md` + stale `electron/db/schema.js` artifact) — ไม่ใช่ส่วนหนึ่งของ export, อย่า commit รวมกัน. ดู [[discount-dialog-shared]].

เหลือ: in-app click-test (เปิดไฟล์ .xlsx จริง — ต้องรันแอป). เฟส 2 (ยังไม่ทำ) = staff export วันหมดอายุ/สต็อกเหลือน้อย (ตัดคอลัมน์ต้นทุน). ดู [[feedback_vat_inclusive_display]], [[project_invoice_matcher_csv]] (CSV เดิม BOM pattern).
