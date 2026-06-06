---
name: project_hygeia_import
description: Hygeia .mdb → Syntropic data migration — importer Phase 0-9 DONE + all reconciles clean (money/stock/orphan = 0) on Windows via access_parser + electron-as-node
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

## ความคืบหน้าโค้ด — **Phase 0–9 DONE + verified ครบ 2026-06-05**
`scripts/import-hygeia.mjs` (Stage B) ทำครบทุก phase + reconcile สะอาดหมด:
- **Phase 1–6** categories 12, products 2430, product_units 567, bundles 93 (recipe 301, skip 10 component หาย), lots 39811→**32479 merged** (LotKey map ครบ 39811), customers 169, **suppliers 89**
- **Phase 7 (ซื้อ 3 ปี)** 2310 ใบรับ, 13150 items (skip 0). **no-supplier 331 = VendorKey null ในต้นทางทั้งหมด (orphan 0)** → supplier_id NULL faithful
- **Phase 8 (ขาย 3 ปี)** 117,619 บิล / 231,973 items / 234,783 lots (skip 0 ทั้งหมด). returns 369, voided 76
- **reconcile (Phase 9) สะอาดหมด:** เงิน Σtotal_amount = expected **diff 0.00** (22.68M); สต็อก **mismatch 0**; orphan sale_items/sale_item_lots/lots/recipe = **0**; sale_item_lots ที่ lot_id NULL = **0**
- บิล line≠total 90/117619 = voided 76 (ทั้งหมด) + completed 14 (แก้ราคา, 0.012%) → total_amount ใช้ header authoritative = faithful

**รันยังไง (สำคัญ):** better-sqlite3 prebuilt = ABI 125 (electron31) → plain node 24 (ABI 137) รันไม่ได้ ต้อง **`NODE_OPTIONS="--max-old-space-size=8192" ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe scripts/import-hygeia.mjs`** (heap ใหญ่เพราะ SaleBasicHeader.json 170MB). schema.ts โหลดด้วย `esbuild.transformSync(loader:ts)`→temp.mjs→dynamic import→`initializeSchema(db)`. export ซื้อ/ขาย: `python scripts/hygeia_export.py purchase sales` (กรอง DocDT≥2023-06-05 ที่ header แล้ว cascade)

**Decisions ที่ลงจริง:** suppliers = IsVendor=True + LegalEntity ที่ถูก purchase VendorKey อ้าง (รวม 89); products.code = Hygeia Code ตรง ๆ; sale invoice `RC-YYYYMMDD-NNNN`, purchase `GR-YYYYMMDD-NNNN` (counter ต่อวัน); NO-VAT ตั้ง sales_settings Phase 0; sales filter = ตัด IsQuotation/IsSaleOrder; IsReturn→sale_type return; lot qty = current balance ไม่ replay transaction

## ทดสอบในแอปจริง — DONE 2026-06-06
เปิด test.db ในแอปได้ ข้อมูลแสดงครบ. วิธี: `scripts/prep-app-db.mjs` (ELECTRON_RUN_AS_NODE) stage `hygeia-import-test.db` → `D:\Syntropic.Project\hygeia-test-userdata\database\syntropic.db` + ใส่ admin user (password `admin`) + settings.setup_completed=1 (กัน seedDatabase ลง dev-seed ทับ + ข้าม Setup/Login gate). เปิด: **`NODE_ENV=development node_modules/electron/dist/electron.exe --user-data-dir=D:/Syntropic.Project/hygeia-test-userdata .`** — **สำคัญ: `--user-data-dir` ต้องอยู่ก่อน `.` (app path) + ใช้ forward slash** ไม่งั้น Electron ตีเป็น app-arg แล้วเปิด DB default แทน. ต้องมี `npm run dev` (:5173) ก่อน. ยืนยัน: 2025 มี 38,087 บิล, ยอด 3 ปี 22.68M — 69MB ปกติ (mdb 475MB เพราะ history ตั้งแต่ 2012 + 144 ตาราง + Access overhead)

## ⏸️ PAUSED 2026-06-06 — เครื่องมือพร้อม รอแอป production-ready ค่อย import จริง
**สถานะ:** เครื่องมือ selective import + cleanup workbook **เสร็จ + commit แล้ว** (commit `611178c` ขึ้น main: P-codes + triage columns; ก่อนหน้า `4588f3a`: selective import core). ทดสอบ round-trip ผ่านครบ (สต็อก mismatch 0, payable 1.3M, P-code ไม่ชน).
**เจ้าของพักไว้ตรงนี้** — รอโปรแกรมพร้อมรัน (production build / ใช้งานจริง) **แล้วค่อย:**
1. import DB ตัวล่าสุดที่ใช้จริง (รัน importer → stage ด้วย `prep-app-db.mjs` หรือ cutover ตอน fresh install)
2. **กรองรายการที่ไม่เอาออก *ภายหลัง*** (แก้ `products-edit.xlsx` — กรอง "ปิดใช้งาน(เดิม)"=ปิด 902 ตัว / มูลค่าสต็อก 0 / ลบ row ที่ไม่เอา) แล้ว re-import
**อย่าเริ่ม import จริงเชิงรุก** — รอเจ้าของกลับมาสั่งเมื่อแอปพร้อม. `products-edit.xlsx` ปัจจุบันยังเป็น raw (ยังไม่ได้แก้)

## SELECTIVE IMPORT + cleanup workbook — DONE 2026-06-06 (มติเจ้าของ)
ขอบเขต import รอบ clean-start (decision LOCKED 2026-06-06):
- **สินค้า/สต็อก/lot/exp/ราคา = ดึงครบ** (snapshot Phase 5 เหมือนเดิม)
- **ขาย = ไม่ดึง** (`IMPORT_SALES=false` ใน import-hygeia.mjs) — สำคัญ: **สต็อกเป็น snapshot Phase 5 ล้วน ไม่ขึ้นกับ Phase 7/8 เลย** (ซื้อ/ขายแค่ ledger ประวัติ ไม่ +/− qty_on_hand) → ตัดขายแล้วสต็อกยัง mismatch 0
- **ซื้อ = เฉพาะบิลเครดิตค้างชำระ** (`!IsPay && !IsCanceled`) = เจ้าหนี้การค้า. Phase 7 กรอง header กลุ่มนี้ (351 ใบ) + ลบ GR เปล่า. บิลจ่ายแล้ว/เงินสด/ยกเลิก ตัดทิ้ง (1959 ใบ)
- **เครื่องมือแก้สินค้า = Excel round-trip:** `scripts/gen-products-xlsx.mjs` → `D:\Syntropic.Project\products-edit.xlsx` (นอก repo). แก้ได้ `ชื่อการค้า`/`ชื่อบนใบเสร็จ`/`หมวดหมู่`(dropdown 12 หมวด ผ่าน data validation + hidden `_cats` sheet); **ลบ row = ไม่ import** (ไม่ใช่ disable). importer อ่านกลับเป็น override layer keyed by ItemKey (match คอลัมน์ด้วย **header string** ใน `loadEdits()` → เพิ่มคอลัมน์อ้างอิงได้ไม่กระทบ; ค่าใน xlsx ชนะ Hygeia, cell ว่าง = fallback). คอลัมน์อ้างอิงช่วยกรอง: รหัส/หน่วย/สต็อก/**มูลค่าสต็อก**(สต็อก×MovAvgPrice)/**ปิดใช้งาน(เดิม)**(IsDisabled — **902 ตัวปิดไว้** กรองลบยกชุด)/สถานะหนี้; freeze 2 คอล + header, autofilter ทุกคอลัมน์, **sort/filter ปลอดภัย 100%** (match ด้วย ItemKey ไม่ใช่ลำดับแถว). ใช้ `exceljs@4.4.0` (`npm install exceljs --ignore-scripts`, pure JS ไม่แตะ better-sqlite3). ⚠️ verify by `getColumn(key)` ใช้ไม่ได้หลัง `readFile` (key ไม่เก็บในไฟล์ → Out of bounds) — ใช้ index/letter แทน
- **รหัสสินค้า regen เป็นฟอร์แมตเรา `P####`** (ไม่ใช่ Hygeia `IT-#######`): Phase 2+4 ใช้ `nextCode()` counter ร่วม (สินค้า P0001–P2430, bundle P2431–P2523, ไม่ชน 0 dup); ตรงกับ `products:create` (products.ts:318 GLOB `P[0-9][0-9][0-9][0-9]*`) → แอป gen ตัวถัดไป P2524 รันต่อพอดี. **รหัส IT เดิมเก็บใน `search_keywords`** (+OtherName) → ค้นด้วยรหัสเก่ายังเจอ ไม่โชว์เป็นรหัสหลัก; bundle เก็บ code เดิมใน note
- **FORCE-KEEP กันยอดหนี้ขาด:** สินค้า 275 ตัวที่อยู่บนบิลค้างชำระ ถูก import เสมอแม้เผลอลบ row (`computeDebtItemKeys()`); xlsx โชว์คอลัมน์ `สถานะหนี้`="ค้างชำระ" เตือน. report บอก excluded/force-kept/override counts ให้เช็ค
- ⚠️⚠️ **บั๊กข้อมูล Hygeia — `PurchaseReceiveHeader.TotalPrice` เชื่อไม่ได้:** บิลเก่าหลายใบ (verified **259/351** บิลค้างชำระ) เก็บ TotalPrice = ราคาต่อหน่วย **ลืมคูณจำนวน** (เช่น 30 กล่อง×72 → header เก็บ 72 แทน 2160; 30 ใบ TotalPrice=0). **ยอดจริงต้องคำนวณจาก line items** `Σ(PurchaseReceive.UnitPrice × UnitQty)` ซึ่งตรงกับ stock snapshot. **คอลัมน์คือ `UnitQty` ไม่ใช่ `Qty`** (Qty อยู่ใน PurchaseReceiveLot). ส่วนลด line+header = 0 ทุกบิล. **payable ค้างชำระจริง = ฿1,300,167.45** (ไม่ใช่ 95,070 จาก header). `purchase_receipts` ไม่มีคอลัมน์ total → owed มาจาก Σ(line cost×qty)
- ทดสอบ round-trip ผ่านแล้ว (ลบ non-debt→excluded, ลบ debt→force-kept คืน, rename/recat→DB ตรง, payable คงที่). reconcile: สต็อก mismatch 0, orphan 0
- ⛔ **ยังไม่ commit:** `scripts/gen-products-xlsx.mjs`, แก้ `import-hygeia.mjs`, `package.json`(exceljs), `prep-app-db.mjs` — รอเจ้าของสั่ง
- refine deferred (ถ้าจะทำ): drug_type_id/is_drug (จาก Hygeia DrugType/HardDrugType/ControlledDrugType — สำคัญกับฉลาก+ข.ย.)

เกี่ยวข้อง: [[project_cost_model]] (3-cost), [[project_vat_phasing]] (NO-VAT), [[project_db_backup]]
