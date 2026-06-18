---
name: project_fda_registers_redesign
description: รายงาน อย. ทั้ง 3 แทป (ข.ย.๙/๑๐/๑๑) = ตารางรีวิวเต็มหน้า + กล่องพิมพ์ใช้ร่วม ReportPrintDialog; ข.ย.๙ กรองผู้จำหน่าย
metadata:
  type: project
---

**DONE 2026-06-18 (tsc PASS; in-app/print verify pending)** — รื้อหน้ารายงาน อย. ทั้ง 3 แทปจาก "พรีวิว A4 เต็มหน้า" → **ตารางรีวิวเต็มหน้าเลื่อนในตัว** (เหมือน `ProductsList`) แล้วกด "พิมพ์" เปิด **กล่องพรีวิว A4 + ตั้งค่า (หน้า/จำนวนชุด)**. แผน SSOT = `docs/plans/FDA_Registers_Redesign.html` (ผ่าน audit 2 รอบ). ต่อยอดจาก [[project_khoryor_a4_pagination]] + [[project_kho10_kho11]].

## ไฟล์
- **`src/pages/Reports/ReportPrintDialog.tsx` (ใหม่)** — กล่องพิมพ์ **form-agnostic ใช้ร่วมทั้ง 3 แทป**. props `{open, onOpenChange, title, pageCount, renderPreview(i), renderFullDoc()}`. กล่อง **ไม่ measure/paginate เอง** — หน้ารายงานทำ pagination (มันถือ atoms เฉพาะฟอร์ม) แล้วส่งฟังก์ชันวาดเข้ามา. กล่องคุม viewPage/pageInput/copies + scale พรีวิว + พิมพ์เงียบ (`printDomSheets` บน `.a4-doc`).
- **`src/pages/Reports/KhorYor9.tsx`** — ตารางแบน + **ตัวกรองผู้จำหน่าย** (popover เช็คลิสต์ + ค้นหา + เลือกทั้งหมด/เอาออกทั้งหมด). `excludedSuppliers: Set<string>` ชั่วคราว (reset เมื่อ rows เปลี่ยน). **แถวที่ถูกกรองออก = ซ่อนไปเลย** (ตารางโชว์เฉพาะ `includedRows` ไม่ใช่โชว์จาง — เปลี่ยนจากดีไซน์เดิม 2026-06-18).
- **`src/pages/Reports/KhorYorSaleLedger.tsx`** (ข.ย.๑๐+๑๑, ไฟล์เดียวคุมสองแทป) — ตารางแบนแถวเดียว (1 แถว = 1 sale-lot); **ไม่มีตัวกรอง**; ฟอร์มพิมพ์ ledger รายล็อตเหมือนเดิมเป๊ะ.
- **`src/pages/Reports/index.tsx`** — แก้บรรทัดเดียว.

## กับดัก/insight สำคัญ (ที่ audit จับได้)
- **bounded height:** `<Outlet>` ของ Reports อยู่ใน `flex flex-col h-full overflow-y-auto` (page-scroll) + wrapper ไม่มี `flex-1` → ตารางจะ **ไม่เลื่อนในตัว**. แก้: **append** `flex-1 min-h-0 flex flex-col` เข้า wrapper className **เฉพาะเมื่อ `current === 'fda'`** (อย่าแทนที่ `summary?'':'pt-3'`). Dashboard/VAT คง page-scroll. (ต่างจาก Manage ที่ container ไม่มี overflow-y-auto.)
- **ข.ย.๙ ต้อง paginate + measure specimen บน `includedRows` (กรองแล้ว) ไม่ใช่ rows ดิบ** — สลับทั้ง specimen map, `renderPage` slice, และ dep ของ useLayoutEffect ครบ ไม่งั้นแถวที่กรองออกยังถูกพิมพ์/เลขเพี้ยน. effect dep ต้องเป็น `includedRows` ที่ `useMemo` (stable) กัน setPages loop.
- **DialogContent ของกล่องพิมพ์ ต้อง `size="full"` (ไม่ใช่ raw `max-w-[..]` — โดน `sm:max-w-sm` ทับ) + `className="h-[88vh] grid-rows-[auto_1fr_auto]"`** — base เป็น `grid gap-4` ไม่มี row template → ถ้าไม่ใส่ row template, DialogBody `overflow-y-auto` จะไม่ scroll (rows auto-size). **Enter ต้อง wire เอง** (dialog.tsx ไม่ wire ให้; guard ข้าม `tagName==='BUTTON'` กันยิงซ้ำ).
- **พิมพ์ยังเป็น silent ผ่าน `printDomSheets`** (ไม่ใช่ window.print) → `@media print` ตายสำหรับงานนี้. `.a4-doc` ที่ render ใน dialog portal อยู่ใน document.body → `document.querySelector('.a4-doc')` หาเจอ. คงฟอนต์ Sarabun + markup ฟอร์มเดิมเป๊ะ (bake computed style).
- **ฟอร์มเปล่า** ยังพิมพ์เงียบตรง ๆ บน toolbar ของแต่ละหน้า (ใช้ `document_settings.copies`) — คนละทางกับ copies ในกล่องพิมพ์ (กล่อง = ต่อครั้ง, default 1, ไม่จำ). อย่ารวมกัน.
- **ข้อกฎหมาย:** ข.ย.๙ การกรองผู้จำหน่ายออก = กรองตอนพิมพ์ชั่วคราว ไม่ลบข้อมูล (ผู้ใช้ตัดสินใจ). ตัดยาออกจากรายงานให้ไปแก้ flag ที่ EditProduct ไม่ทำในหน้านี้.
- ไม่แตะ IPC/schema: `reports:khorYor9` / `reports:khorYorSale` คืนครบทุกฟิลด์อยู่แล้ว.

## ปรับเพิ่ม 2026-06-18 (ตามผู้ใช้)
- **ตารางทั้ง 3 แทปมี client-side pagination** (`Pagination` primitive, default 50/หน้า) — กัน render หลายร้อยแถวพร้อมกัน. แบ่งหน้าฝั่งจอเท่านั้น **ไม่เกี่ยวกับ print** (print ยัง paginate A4 จาก measure specimen ที่ render ทุกแถวตามเดิม — จำเป็นต่อการวัดความสูงแบ่งหน้า). reset page=1 เมื่อ rows/filter/pageSize เปลี่ยน; numbering = `pageStart+idx+1`.
- ข.ย.๙ ซ่อนแถวที่ตัดออก (ดูบน) → เพิ่มเคสว่าง "กรองผู้จำหน่ายออกหมดแล้ว" เมื่อ `includedRows.length===0` แต่ `rows` ไม่ว่าง.
- **ปุ่ม "ฟอร์มเปล่า" + "พิมพ์" ย้ายออกจาก header การ์ดตาราง → ไปอยู่บรรทัด subtab (ข.ย.๙/๑๐/๑๑) ขนาด h-10.** กลไก: `FdaReports.tsx` เพิ่ม `FdaOutletContext extends ReportsOutletContext { setActions }` (pattern เดียวกับ setSummary/setToolbar) — แต่ละหน้า report register ปุ่มของตัวเองผ่าน `useEffect(() => { setActions(<ปุ่ม/>); return () => setActions(null) }, [loading, setActions])` แล้ว FdaReports render ทางขวาของแถว subtab. สลับแทป = ลูก unmount (cleanup ล้าง) ลูกใหม่ register เอง. **อย่าใส่ handler ที่ไม่ stable ใน dep** (ใช้ setBlankRender/setPrintOpen ตรง ๆ + `disabled={loading}` กัน loop).
- ตัวกรองผู้จำหน่าย: ปุ่ม "เลือกทั้งหมด/เอาออกทั้งหมด" รวมเป็น **ปุ่ม toggle เดียว** `variant="elevated"` (สลับตาม `excludedSuppliers.size===0`); ปุ่ม trigger "ผู้จำหน่าย" **ไม่มีวงเล็บนับจำนวน** แล้ว.

## บั๊กพิมพ์ที่เจอตอน in-app (แก้แล้ว 2026-06-18)
- **`printer:printDocument` พิมพ์ไม่สำเร็จ → `ERR_INVALID_URL (-300)`** เมื่อเอกสาร ข.ย. หลายหน้า: handler โหลด HTML ผ่าน `w.loadURL('data:text/html,'+encodeURIComponent(html))` (`electron/ipc/printer.ts`) ซึ่ง **data: URL มีลิมิตความยาว** — HTML ที่ bake computed style (เซลล์เป็นร้อย × inline style) เกินลิมิตเลยพังตั้งแต่ navigate. แก้: helper `loadHtmlIntoWindow(w, html)` = เขียน HTML ลง temp file (`app.getPath('temp')`) แล้ว **`w.loadFile()`** (ไม่มีลิมิต; ฟอนต์ฝัง base64 ในตัว ไม่มี resource ภายนอก) + ลบไฟล์ใน `finally`. แก้เฉพาะ `printer:printDocument` (path ของ report). **handler อื่น (printHtml/printLabel/previewHtmlPdf) ยังใช้ data: URL อยู่ — latent เดียวกัน ถ้าเอกสารใหญ่ค่อยแก้แบบเดียวกัน.** (vite resolve `.ts` ก่อน `.js` → แก้ `.ts` มีผล แม้มี `printer.js` เก่า commit ค้าง.)
