---
name: project_khoryor_a4_pagination
description: รายงาน ข.ย.9/10/11 พรีวิวแบ่งเป็นหน้า A4 จริง (measure DOM + greedy pack); helper src/pages/Reports/a4.tsx; 1 .a4-sheet = 1 หน้าพิมพ์
metadata:
  type: project
---

**DONE 2026-06-17 (in-app + print verify pending)** — รายงาน ข.ย. (`KhorYor9.tsx`, `KhorYorSaleLedger.tsx` = ข.ย.10/11) เปลี่ยนพรีวิวจาก "แผ่นเดียวยาว" → **แบ่งเป็นหน้า A4 แยกแผ่นจริง**.

**กลไก:** วัดความสูง DOM จริงจาก hidden specimen (off-screen `left:-10000px`, width = `A4_CONTENT_W` 1043px, markup เหมือน sheet เป๊ะเพราะ `table-fixed`) ใน `useLayoutEffect` (รันก่อน paint ไม่ให้กระพริบ) แล้ว **greedy pack** ลงทีละหน้า:
- ข.ย.9 = pack ทีละ row
- ข.ย.10/11 = pack ทีละ lot section, section ยาวเกินหน้า → split + ซ้ำหัวล็อต ใส่ "(ต่อ)"
- ทุกหน้าซ้ำหัวกระดาษ (แบบ ข.ย. + title + ชื่อร้าน) + เลขหน้า X/Y; filler (แถวเส้นว่าง) เติมจนเต็มท้ายทุกหน้า (ผู้ใช้เลือก)

**Helper ใหม่ `src/pages/Reports/a4.tsx`:** `A4` (W1123×H794 = A4 landscape @96dpi, PAD 32/40), `A4_CONTENT_W/H`, `FOOTER_H` 24, `PACK_SAFETY` 6, `<A4Sheet header pageNo pageCount>` (flex-col: header shrink-0 / body flex-1 overflow-hidden / footer). `avail = A4_CONTENT_H - headerH - FOOTER_H - PACK_SAFETY` (ledger หัก `BODY_TOP` 8 เพิ่มเพราะ chunk แรก render mt-2).

**Print (`src/index.css` @media print):** `@page { size: A4 landscape; margin: 0 }` → sheet 1123×794 = 1 หน้าพิมพ์เป๊ะ (padding ของ sheet = ขอบหน้า); `.a4-sheet { break-after: page }` last-child auto; `.a4-doc { position:absolute; inset:0 }` หนีออกจาก flex layout ของแอป (เดิม `.print-area` ใช้ trick เดียวกัน — ลบทิ้งแล้ว มีแค่ 2 ไฟล์นี้ใช้). **ความเสี่ยงที่ต้องเทสต์พิมพ์จริง:** abspos + break-after fragmentation บน Chromium (Electron 31 ~Chromium 126) — ถ้าหน้าไม่ตัด ให้เลิก abspos แล้ว neutralize ancestor overflow แทน.

**พิมพ์ = silent + เลือกหน้าในแอป (ห้ามพึ่ง OS dialog ของ Electron):**
- **`window.print()` และ `webContents.print({silent:false})` ใช้ไม่ได้** — Electron build ไม่มี Chromium print-preview → ขึ้น "This app doesn't support print preview" ทั้งคู่ (ลองแล้ว 2026-06-17, OS dialog เชื่อถือไม่ได้ใน Electron นี้). **อย่ากลับไปลองอีก.**
- วิธีที่ใช้จริง: helper `src/lib/print/printDomSheets.ts` → clone `.a4-sheet` ที่ render อยู่ (เฉพาะหน้าที่เลือก) + **bake computed style ฝัง inline ทุก element** (`bakeComputedStyles`: getComputedStyle → set ทุก prop เป็น inline; ใช้ `cs.item(i)` เพราะ `cs.cssText` ว่างใน Chromium) + ฝังฟอนต์ไทย → ส่งเข้า **`printer:printDocument`** (IPC silent print A4/A5) พิมพ์ไปเครื่องใน `document_settings` (''=default; PRINT_TO_PDF→เปิด PDF).
- **⚠️ อย่า inline stylesheet ของแอปทั้งก้อน** (เคยลองแล้วพัง 2026-06-17): กฎบางอัน (`@media print`/table) ทำให้ตารางยุบเป็น grid เล็ก ๆ มุมซ้ายบน. ต้อง bake computed style แทน → ทุกเซลล์ได้ความกว้าง px ตายตัว ไม่มีกฎแปลกปลอม → **พิมพ์เหมือนพรีวิวเป๊ะ**. print HTML มีแค่ embedded font + กฎ pin `.a4-sheet{width:297mm;height:210mm;break-after:page}` เท่านั้น ไม่มี app CSS.
- **⚠️ bake เฉพาะ prop ที่จำเป็น (`BAKE_PROPS` ~50 ตัว) ห้าม bake ทั้ง ~350 prop** — bake ทั้งหมด × พันเซลล์ → data URL ใหญ่มาก หน้าต่างพิมพ์โหลดไม่ขึ้น = "กดพิมพ์ไม่ขึ้นเลย" (เจอ 2026-06-17). curated = HTML เล็ก พิมพ์ติด + ตารางไม่ยุบ (มี width px).
- **🔒 ฟอนต์ล็อก Sarabun (เอกสารราชการ ห้ามตามฟอนต์ระบบ):** family ใหม่ `'Sarabun Print'` = bundled Sarabun เต็มชุด (index.css @font-face + `FONT_REGISTRY['Sarabun Print']` ใน fonts.ts). ตั้งบน `A4Sheet` root + specimen (วัด+พรีวิว+พิมพ์ Sarabun เหมือนกันหมด metric ตรง). printDomSheets embed `'Sarabun Print'` + override `.a4-sheet *{font-family:'Sarabun Print'!important}`. **ห้าม bake `font-family`** (จะติดฟอนต์ UI มา) — force เป็น Sarabun แทน.
- **⚠️ orientation = per-document ไม่ใช่ per-printer:** เครื่องพิมพ์ A4 ที่แชร์ตั้ง **แนวตั้ง** ไว้ (ใบกำกับภาษี/เอกสารแนวตั้ง) แต่ ข.ย. เป็น **แนวนอน** → ถ้าไม่บอก landscape มันพิมพ์ลงหน้าแนวตั้งเนื้อหาเพี้ยน. ห้ามใช้ `printer:printHtml` (สลิปความร้อน, ไม่มี landscape) กับ ข.ย. ต้อง **`printer:printDocument({ pageFormat:'A4', landscape:true })`** → `webContents.print({ pageSize:'A4', landscape:true })` (+ printToPDF `preferCSSPageSize` กับ override CSS `@page{size:A4 landscape}`) บังคับแนวนอนเฉพาะงานนี้ ไม่แตะ default เครื่องพิมพ์.
- **เลือกหน้าในแอป**: ช่อง Input "หน้า" ใน toolbar (`pageInput`, ""=ทุกหน้า, เช่น "1-3,5") → `parsePageSelection(input, pages.length)` คืน 1-based list/'all'. override CSS ใน print HTML pin `.a4-sheet{width:297mm;height:210mm;break-after:page}` + ยกเลิก `.a4-doc{position:absolute}` ของจอ.
- เหตุผลที่ silent (ไม่ใช่ OS dialog): ใช้เครื่องเดียวกับ Settings (ตรงที่ผู้ใช้ถาม) + เลือกหน้าเองได้ในแอป ครบโดยไม่ต้องพึ่ง dialog ที่ Electron พัง.

**กับดักที่เจอ:** effect dep ห้ามผูกกับ `displayRows`/`sections` ที่ derive จาก `rows ?? []` (สร้าง array ใหม่ทุก render) → setPages → re-render → loop ไม่จบ. ต้องผูกกับ `rows` (state ref คงที่); `sections` useMemo ก็ต้อง dep `[rows]`. เกี่ยวกับ [[project_kho10_kho11]].
