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

**พิมพ์ = OS dialog โดยตั้งใจ (อย่าแก้เป็น silent print):** ปุ่ม "พิมพ์" ใช้ `window.print()` (เด้ง dialog ของ OS) ตั้งใจไว้ — ไม่ใช้ silent `printer:printHtml`+`document_settings` แบบใบกำกับภาษี/สลิป/ฉลาก. เหตุผล (ผู้ใช้ตัดสิน 2026-06-17): รายงาน ข.ย. พิมพ์รายเดือนนาน ๆ ที + ต้องเลือกหน้าเองได้ (เผื่อกระดาษเสียแค่หน้าเดียว) → OS dialog ให้ทั้ง เลือกเครื่องพิมพ์ + page range + จำนวนชุด ฟรีในตัว ไม่ต้องสร้าง page-selector เอง. silent print สงวนไว้สำหรับงานพิมพ์รัว ๆ ตอนขาย (สลิป/ฉลาก/ใบกำกับภาษี) ที่ไม่อยากให้ dialog เด้งทุกครั้ง.

**กับดักที่เจอ:** effect dep ห้ามผูกกับ `displayRows`/`sections` ที่ derive จาก `rows ?? []` (สร้าง array ใหม่ทุก render) → setPages → re-render → loop ไม่จบ. ต้องผูกกับ `rows` (state ref คงที่); `sections` useMemo ก็ต้อง dep `[rows]`. เกี่ยวกับ [[project_kho10_kho11]].
