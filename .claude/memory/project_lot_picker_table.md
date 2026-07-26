---
name: project-lot-picker-table
description: LotPickerDialog redesigned card-stack -> sortable table + keyboard cursor; role="button" rows are required to survive the POS focus-lock
metadata:
  type: project
---

**DONE 2026-07-26 (tsc PASS; เจ้าของ click-test แล้ว ปิดจบ)** — `src/components/ui/lot-picker-dialog.tsx` เปลี่ยนจากกองการ์ดแนวตั้ง → **ตารางเรียงได้** (เจ้าของเลือกแบบ A: ตารางล้วน ไม่มีช่องค้นหา, หน้าร้าน = เมาส์+คีย์บอร์ด/สแกนเนอร์).

**เหตุผล:** งานจริงของโมดัลนี้คือ *lookup* (ถือกล่องที่มีเลขล็อตพิมพ์อยู่ แล้วหาแถวที่ตรง) ไม่ใช่ *compare* → ตารางกวาดตาเร็วกว่า + จุแถวได้ ~2 เท่าในความสูงเท่ากัน + ได้ sort ฟรีจาก `SortableTableHead`.

**คอลัมน์:** ล็อต / วันหมดอายุ / **วันที่รับเข้า (`lot.created_at` ไม่ใช่ `order_date`)** / คงเหลือ / (ปิด-หมด Badge + เช็คกลม). **ไม่มีคอลัมน์ต้นทุน โดยตั้งใจ — staff ใช้ POS ด้วย** อย่า re-add.

**default sort = `expiry_date` DESC (ยาวสุดขึ้นก่อน) — เจ้าของสั่ง 2026-07-26 อย่ากลับเป็น FEFO asc.**

**แถบบน (`h-12 px-2` + `DialogContent` ตั้ง `gap-0`):** **carve-out จงใจ — ไม่ใช่ `h-14` ตามสเปก table-card ที่ LOCKED ไว้** เพราะในโมดัลมี `DialogHeader` + เส้นคั่นอยู่เหนือแถบอยู่แล้ว ใช้ h-14 + gap-4 เดิมแล้วเกิดช่องว่างโหว่ระหว่างเส้นคั่นกับชื่อตาราง (เจ้าของสั่งลด 2 รอบ 2026-07-26). **อย่า "แก้" กลับเป็น h-14/gap-4** — กฎ h-14 ใช้กับ table-card บนหน้าเพจ ไม่ใช่ในโมดัล. ซ้าย = `<h3 text-lg font-semibold>ตารางล็อตสินค้า</h3>` + `<Badge variant="outline">` **ตัวเลขล้วน ไม่มีหน่วย "ล็อต"**; ขวา (`ml-auto`) = **`CheckRow` ไม่ framed** ป้าย "แสดงล็อตที่ปิด (N)" default **uncheck**. เจ้าของเลือก checkbox ทั้งที่มันมีผลทันที (ตามกฎ [[feedback_switch_vs_checkbox]] ควรเป็น Switch) — **เป็นการตัดสินใจของเจ้าของ อย่า "แก้" กลับเป็น Toggle**.

**กับดักที่ต้องรู้ (อย่ารื้อ):**
- **แถวต้องมี `role="button"`** — POS มี global focus-lock (`src/pages/POS/index.tsx` ~บรรทัด 590-640) ที่ดึงโฟกัสกลับช่องค้นหาเมื่อโฟกัสตกบน node ที่ไม่ match `'input, button, select, textarea, a, [role="button"], [contenteditable="true"]'`. ถ้าแถวไม่มี `role="button"` → คลิกแถวแล้วโฟกัสเด้งออกนอก dialog และคีย์บอร์ดตาย
- **โฟกัสเดินตาม cursor แบบ imperative** (`el.focus()` ใน useEffect) เพราะถ้าแถวที่โฟกัสอยู่ unmount (กดซ่อนล็อตที่ปิด) โฟกัสจะตกไป `<body>` แล้วโดน lock ดูดออก
- **`onOpenAutoFocus` ต้อง preventDefault** — ไม่งั้น Radix โฟกัส Toggle เป็นตัวแรก แล้ว ↑↓/Enter ไม่ทำงานทันทีที่เปิด
- **Enter เช็ค `e.target.closest('button, input')` ก่อน** — ให้ Enter เป็นของปุ่มที่โฟกัสอยู่ (sort header / toggle / ปิด) แถวเท่านั้นที่ route ไป onSelect
- **cursor track ด้วย lot ID ไม่ใช่ index** — re-sort/กรองแล้ว cursor ต้องอยู่กับล็อตเดิม
- highlight = keyboard-owned (ไม่มี mouseenter handler) ตามกฎเดียวกับ POS search — ดู [[project_pos_redesign]]

**แก้ primitive ด้วย:** `TableRow` ใน `src/components/ui/table.tsx` เปลี่ยนเป็น `React.forwardRef` (React 18 ทิ้ง `ref` บน function component ธรรมดา) — output เหมือนเดิมทุกอย่าง

**ค้าง:** ยังไม่มี showcase ใน `/theme` (primitive ตัวนี้ไม่เคยมีตั้งแต่แรก). **call site เดียวในโปรเจกต์** = โมดัลรับคืนสินค้า POS (`src/pages/POS/index.tsx:2420`) — API ของ component ไม่เปลี่ยน ไม่ต้องแก้ call site.

**หนี้เก่าที่เจอระหว่างทาง (ยังไม่แก้):** `products:getLots` (`electron/ipc/products.ts:988`) เรียง `created_at DESC` แต่คอมเมนต์ที่ `src/pages/POS/index.tsx:857` เขียนว่า "first = FEFO order" — **คอมเมนต์ผิด** ล็อตตั้งต้นที่ถูกเลือกให้คือล็อตรับเข้าล่าสุด ไม่ใช่ใกล้หมดอายุสุด
