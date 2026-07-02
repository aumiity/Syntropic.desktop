---
name: project_tag_csv_import
description: Price-tag CSV/scan bulk-import — paste barcode column → resolve exactly → append tags
metadata:
  type: project
---

# Price-tag bulk import (CSV / scanned barcode column)

**DONE 2026-07-02 (renderer tsc PASS; in-app click-test pending).** ป้ายราคา A4 (`PrintTab`, โหมด `pricetag`) เพิ่มปุ่ม "นำเข้า CSV" ข้าง "เพิ่มสินค้า" — เปิด `BarcodeCsvImportDialog` ให้วางคอลัมน์บาร์โค้ดจาก Excel (หนึ่งบรรทัด = หนึ่งป้าย) หรือเลือกไฟล์ `.csv`/`.txt` แล้วจับคู่แบบตรงตัวเป็น `TagCell` append เข้ารายการ. ต่อยอดจาก [[project_tag_printing]].

## ชิ้นส่วน
- `electron/ipc/pos.ts` → handler `pos:resolveBarcodes(barcodes: string[])` — คืน 1 entry ต่อบาร์โค้ด **ไม่ซ้ำ** `{ barcode, cell: TagCell|null }`.
- `electron/preload.ts` → `pos.resolveBarcodes`; type ใช้ `TagCellData` **inline** (ไม่ import จาก `src/lib/tags/types` — กัน TS6307 เพราะ `tsconfig.node.json` include แค่ `electron/**` + `vite.config.ts`; import จาก src เข้า electron จะ error เสมอ เหมือน `PermState` เดิม).
- `src/components/dialogs/BarcodeCsvImportDialog.tsx` — textarea วาง + ปุ่มเลือกไฟล์ (`<input type=file>` + `FileReader.readAsText`, renderer ล้วน ไม่ผ่าน IPC); parse split `/[\r\n,;\t]+/`, ตัด quote ครอบ + header token (`barcode/code/รหัส/sku/บาร์โค้ด`).
- `src/pages/Products/PrintTab/index.tsx` — state `importOpen`, handler `importCells` (`setPriceCells([...arr, ...incoming].slice(0, PRICE_MAX))`), ปุ่ม + dialog (ส่ง `remaining={PRICE_MAX - priceItems.length}`).

## กติกาการจับคู่ (สำคัญ — ไม่ชัดในตัวเอง)
- **EXACT equality** ไม่ใช่ LIKE (ต่างจาก `pos:searchProducts`): บาร์โค้ดของหน่วย (กล่อง/โหล) → ได้ราคา **หน่วยนั้น** ไม่ใช่ base.
- ลำดับ: `product_units.barcode` (is_disabled=0 + is_for_sale=1) มาก่อน → ไม่เจอค่อย `products.barcode/2/3/4` (base). สินค้า/หน่วยที่ปิดใช้งานไม่แมตช์.
- บาร์โค้ดที่พิมพ์ = **สตริงที่สแกนมาเอง** (ป้ายสแกนกลับได้ตรงแถวเดิม); `barcode_source` = `'own'` เสมอเมื่อแมตช์.
- **บาร์โค้ดซ้ำ = หลายป้าย** (เจตนา — สแกนซ้ำ = อยากได้หลายป้าย): backend คืน unique, renderer เอา `tokens` (มีซ้ำ) ไล่ตามลำดับ map กลับ + `push({ ...cell })` (สำเนา ไม่แชร์ reference).
- ที่เกิน `remaining` (เต็ม 50/แผ่น) หรือ **ไม่พบ** → ค้างไว้ในกล่องให้ตรวจ (leftback join `\n`); ถ้าเคลียร์หมด dialog ปิดเอง.

## กับดัก
- token `text-warning-strong`/`text-success-strong` = **dead class** (ไม่ได้ register ใน `tailwind.config.js` — มีแต่ `warning/success` DEFAULT + soft/hover). โค้ดเก่าหลายที่ใช้ผิดอยู่ (PrintTab/UpgradeVatDialog/SetupWizard) — ใช้ `text-warning`/`text-success` แทน.
