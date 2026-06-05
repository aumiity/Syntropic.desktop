---
name: project_hygeia_import
description: Hygeia .mdb → Syntropic data migration — plan+audit done, checklist cleared, ready to code importer
metadata:
  type: project
---

**Hygeia (ระบบเดิมหน้าร้าน) → Syntropic data migration** — สถานะ **2026-06-05: plan+audit ครบ + reader บน Windows แก้ได้แล้ว (access_parser ข้าม Jet password) + verify คอลัมน์ตรง plan** → กำลังเริ่มเขียน importer (stage A exporter Phase 1-6 ก่อน)

## ไฟล์งาน (อ่านก่อนเริ่ม)
- **`docs/plans/Hygeia_Import.md`** = SSOT ของงานนี้ (เป้าหมาย, 9 phase, mapping ย่อ, edge cases E1–E12, Audit Pass 1/2, checklist C1–C8 พร้อมผล, §9 แก้ยอดเงิน)
- **`docs/plans/Hygeia_Import_mapping.html`** = field-by-field mapping แบบภาพ (เปิดเบราว์เซอร์)

## แหล่งข้อมูล + กลไกอ่าน (สำคัญ — อัปเดต 2026-06-05 บน Windows/ZEMA-PC)
- **เครื่องที่ทำงานตอนนี้ = Windows (ZEMA-PC)** ไฟล์จริงอยู่ที่ **`D:\Syntropic.Project\hygeia.data.mdb`** (475MB, นอก repo — เจ้าของย้ายมาจาก OneDrive แล้ว). อย่าใช้ตัวใน `OneDrive\Documents\Hygeia\` (reparse/เสี่ยง dehydrate)
- ⚠️ **mdb มี Jet database password จริง** (40-byte blob ที่ header offset 0x42 ไม่ใช่ศูนย์) — **ACE OLEDB เปิดไม่ได้** ("Not a valid password"). mdbtools ฝั่ง Mac อ่านได้เพราะมันข้าม password (Jet4 ไม่ได้เข้ารหัส data page แค่ gate). **อย่าเสียเวลาหา/ถอดรหัส password**
- ✅ **กลไกอ่านบน Windows ที่ใช้จริง = `access_parser` (pure-Python, pip install)** — เปิด mdb ที่มี password ได้ **โดยข้าม password** เหมือน mdbtools. python = `C:\laragon\bin\python\python-3.13\python.exe`. `AccessParser(path).parse_table(name)` คืน dict{col→list}; `.catalog.keys()` = รายชื่อตาราง (144 ตาราง). **verify แล้ว: ชื่อคอลัมน์ตรง plan เป๊ะ, ไทยถูก, วันที่คืนเป็น ISO string อยู่แล้ว** ("2019-05-30 13:35:00") → **E2 (parse MM/DD/YY) ไม่ต้องทำ**, bool คืน "True"/"False", number คืน string, NULL→null
- สถาปัตยกรรม 2-stage (Windows): **(A) `scripts/hygeia_export.py`** อ่าน mdb ผ่าน access_parser → dump JSON ต่อตารางลง **`D:\Syntropic.Project\hygeia-export\` (นอก repo — ห้ามข้อมูลจริงเข้า git)** → **(B) `scripts/import-hygeia.mjs`** อ่าน JSON + transform + load. ฝั่ง Mac ใช้ mdbtools→CSV แทน stage A ได้ JSON เดียวกัน
- ⛔ **ห้าม commit ข้อมูลจริงเข้า repo** (ลูกค้า/ยอดขาย) — `hygeia-export/`, `hygeia-import-test.db`, `hygeia.data.mdb` อยู่นอก repo ที่ `D:\Syntropic.Project\` ทั้งหมด

## Decisions (LOCKED)
3 ปีล่าสุด (DocDT≥2023-06-05) · ข้ามตารางที่ไม่มี/ไม่ใช้ · gen code ใหม่ · ItemSet→bundle (products.is_bundle) · เก็บบิลยกเลิกเป็น voided/cancelled · เครดิตแบบ field สรุปในบิล (ไม่ดึง SaleCredit*) · ลงไฟล์ `.db` ใหม่ (`hygeia-import-test.db`) ไม่แตะ prod

## ผล checklist (กันพลาด — จำให้แม่น)
- **Discount = บาท/บรรทัด** (ไม่ใช่ %)
- **SaleBasicHeader.TotalPrice = GROSS ก่อนหักส่วนลด** → `total_amount = TotalPrice − TotalDiscount` (อย่า map TotalPrice→total_amount ตรง ๆ!)
- **lot ซ้ำ 4,188 คู่** (ItemKey|Name) ชน UNIQUE(product_id,lot_number) → ต้อง **merge** + map หลาย LotKey→1 lot id (ไม่งั้น sale_item_lots FK ลอย)
- **PurchaseReceiveLot.Qty = หน่วยซื้อ** → base = Qty×Multiply, cost/ฐาน = UnitPrice÷Multiply (PR กับ PRLot ค่าซ้ำ ใช้ตัวเดียว ไม่คูณซ้ำ)
- **ร้าน NO-VAT** (TotalVat>0 = 0 ทุกบิล) → vat_enabled=0, vat=0
- **is_closed คำนวณเองจาก qty หลัง merge** (อย่า copy Hygeia IsClose)
- enum: sale_type {retail/wholesale} · status sales {completed/voided} · purchase {completed/cancelled} · payment {cash/credit}
- invoice: ขาย `RC-YYYYMMDD-NNNN` (ตรง pos.ts:215) · ซื้อ `GR-YYYYMMDD-NNNN`
- cost_price=MovAvgPrice · last_cost_price=Item.UnitPrice
- walk-in: CustomerKey −10 → C0000 (= Person −10 "ลูกค้าทั่วไป")
- Customer.CustomerKey = Person.PersonKey (1:1); ชื่อ/ที่อยู่อยู่ใน Person
- runner: ไม่มี tsx/ts-node → เขียน **plain Node ESM `.mjs`** รัน `node` (มี better-sqlite3 + esbuild + typescript)

## ความคืบหน้าโค้ด
- **Phase 0–6 DONE + verified 2026-06-05** — `scripts/import-hygeia.mjs` (Stage B). ผล: categories 12, products 2430, product_units 567, bundles 93 (recipe 301, skip 10 component หาย E4/E7), lots 39811→**32479 merged** (LotKey map ครบ 39811), customers 169, suppliers 44. **reconcile สต็อก mismatch = 0** (Σ qty_on_hand = StockCurrentBalance.Qty ทุกตัว), orphan lots/recipe = 0
- **รันยังไง (สำคัญ):** better-sqlite3 prebuilt = ABI 125 (electron31) → **plain node 24 (ABI 137) รันไม่ได้** ต้องรันผ่าน electron-as-node: `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe scripts/import-hygeia.mjs`. schema.ts โหลดด้วย `esbuild.transformSync(loader:ts)` → temp .mjs → dynamic import → `initializeSchema(db)` (เลี่ยง tsx)
- **เกร็ด:** plan เขียน "ซัพ 149" = จริง ๆ คือ LegalEntity ทั้งหมด 149 row; IsVendor=True จริง = **44**. products.code = ใช้ Hygeia Code ตรง ๆ (nullable, traceable) ไม่ gen ใหม่. NO-VAT ตั้ง sales_settings ใน Phase 0

## ขั้นต่อไป
**Phase 7–8** (ซื้อ/ขาย 3 ปี, DocDT≥2023-06-05): export `PurchaseReceiveHeader/PurchaseReceive/PurchaseReceiveLot` + `SaleBasicHeader/SaleBasic/SaleBasicLot` (กรองวันที่ใน python ก่อน dump — ตารางใหญ่ ~635k) → load + reconcile ยอดเงิน (§9: total_amount=TotalPrice−TotalDiscount, NO-VAT). resolve FK: sale_item_lots.LotKey→lotKeyToLotId, product_id→itemToProduct (skip+cascade ถ้าหาย P1-A6), purchase supplier→legalEntityToSupplier (ระวัง VendorKey อาจชี้ LegalEntity ที่ IsVendor=False)

เกี่ยวข้อง: [[project_cost_model]] (3-cost), [[project_vat_phasing]] (NO-VAT), [[project_db_backup]]
