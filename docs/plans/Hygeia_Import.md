# แผนนำเข้าข้อมูล Hygeia → Syntropic (Data Migration)

> สถานะ: **PLAN — ยังไม่เริ่มเขียนโค้ด** · จัดทำ 2026-06-05
> ต้นทาง: `hygeia.data.mdb` (MS Access / Jet, 478 MB, ไม่เข้ารหัส) · ปลายทาง: better-sqlite3 (`electron/db/schema.ts`)
> เอกสารคู่กัน: `/tmp/hygeia_mapping.html` (สรุป field mapping แบบภาพ)

---

## 1. เป้าหมาย & ขอบเขต (ตัดสินใจแล้ว — LOCKED)

นำเข้า **ข้อมูลดิบ** ที่เกี่ยวกับ ขาย · ซื้อ · ราคา · เงิน · สต็อก จากระบบ Hygeia เดิมหน้าร้าน เข้าสู่โครงสร้างของเรา

| # | ประเด็น | การตัดสินใจ |
|---|---------|-------------|
| D1 | ช่วงเวลาขาย/ซื้อ | **3 ปีล่าสุด** → `DocDT >= 2023-06-05` |
| D2 | ตารางที่เราไม่มี/ไม่ใช้ | **ไม่นำเข้า** (คลินิก, ฉลาก, โปรโมชัน, interaction ฯลฯ) |
| D3 | รหัส (code/invoice_no) | **generate ใหม่ทั้งหมด** ตามรูปแบบเรา; เก็บรหัสเดิมไว้ใน note |
| D4 | นิยามชุด ItemSet | **import เป็นสินค้าจัดชุด** (`products.is_bundle=1` + `product_bundle_items`) |
| D5 | บิล/ใบรับที่ยกเลิก (IsCanceled=1) | **เก็บไว้** เป็น `status='voided'` (sales) / `'cancelled'` (purchase) |
| D6 | เครดิต/ลูกหนี้ | เก็บแค่ field สรุปในบิล — **ไม่ดึงตาราง `SaleCredit*`** (ตรงกับ UI เรา) |
| D7 | ปลายทาง | **สร้างไฟล์ `.db` ใหม่** สำหรับทดสอบ ไม่แตะ DB ที่ใช้จริง |

### ขอบเขตข้อมูลจริง (นับจากไฟล์)
- สินค้า 2,430 · หน่วยย่อย 567 · ประเภท 12 · ล็อต 39,811
- ลูกค้า 169 · ซัพพลายเออร์ (IsVendor) 149
- บิลขายทั้งหมด ~341,903 (กรอง 3 ปีแล้วจะน้อยลง) · รายการขาย ~635,366 · ล็อตที่ตัด ~635,366
- ใบรับซื้อ 6,850 · รายการรับ 40,878
- ชุด ItemSet 93 · ส่วนประกอบชุด 311

---

## 2. สถาปัตยกรรม importer

- **One-off script** `scripts/import-hygeia.ts` (รันด้วย `npx tsx` หรือ ts-node ที่มีอยู่) — แยกจาก runtime ของแอป ไม่แตะ IPC
- **กลไกอ่าน mdb**: `mdb-export <db> <table>` → CSV → parse ใน Node (มี `csv-parse` หรือเขียน parser เบา ๆ) — เลี่ยง native binding ของ mdb. mdb-export คืน UTF-8 ภาษาไทยถูกต้อง (ตรวจแล้ว)
- **เป้าหมาย**: สร้าง `hygeia-import-test.db` ใหม่ แล้วรัน `schema.ts` (CREATE TABLE ทั้งหมด) ก่อน insert
- **Key crosswalk**: เก็บ `Map<HygeiaKey, SyntropicId>` ในหน่วยความจำต่อ entity แล้วใช้ผูก FK ขั้นต่อไป
  - `itemKeyToProductId`, `itemUnitKeyTo…`, `lotKeyToLotId`, `customerKeyToCustomerId`, `vendorKeyToSupplierId`, `itemTypeKeyToCategoryId`, `saleBasicKeyToSaleItemId`, `saleHeaderKeyToSaleId`, `itemSetKeyToBundleProductId`, `prHeaderKeyToInvoiceNo`
- **ทุกอย่างใน 1 transaction ต่อ phase** (better-sqlite3 transaction) เพื่อความเร็ว + atomicity
- **idempotent**: ลบไฟล์ `.db` เป้าหมายทิ้งทุกครั้งก่อนเริ่ม (rerun ได้สะอาด)

---

## 3. ลำดับ Phase (เคารพ Foreign Key)

```
Phase 0  เตรียม: สร้าง .db ใหม่ + run schema + seed lookup พื้นฐาน (item_units ว่าง, ฯลฯ)
Phase 1  Master lookup:   ItemType → product_categories
Phase 2  สินค้า:          Item → products  (+ upsert item_units จาก SaleUnitName)
Phase 3  หน่วยย่อย:        ItemUnit → product_units (+ upsert item_units)
Phase 4  ชุด:             ItemSet → products(is_bundle=1) ; ItemSetItem → product_bundle_items
Phase 5  ล็อต:            Lot → product_lots  (dedup! ดู §5)
Phase 6  คน:              Customer+Person → customers ; LegalEntity(IsVendor) → suppliers
Phase 7  ซื้อ (3ปี):      PurchaseReceiveHeader → purchase_receipts
                          PurchaseReceive + PurchaseReceiveLot → purchase_receipt_items
Phase 8  ขาย (3ปี):       SaleBasicHeader → sales
                          SaleBasic → sale_items
                          SaleBasicLot → sale_item_lots
Phase 9  Reconcile:       ตรวจยอด + รายงานสรุป (ดู §6)
```

> หมายเหตุ FK ข้ามช่วงเวลา: `sale_item_lots.lot_id` และ `purchase_receipt_items.lot_id` อาจอ้างถึงล็อตที่เก่ากว่า 3 ปี → **Phase 5 ต้อง import ล็อตทั้งหมด** (ไม่กรองตามเวลา) ไม่งั้น FK พัง. ล็อตเล็ก (39k) นำเข้าหมดได้สบาย.

---

## 4. รายละเอียด Mapping (ย่อ — ฉบับเต็มใน HTML)

ดู `/tmp/hygeia_mapping.html` สำหรับ field-by-field. หัวข้อหลัก:

- **Item → products**: Code(gen), Name→trade_name, BarCode1-4, SalePrice→price_retail, MovAvgPrice→cost_price, UnitPriceCheapest→last_cost_price, SaleUnitName→unit_id, Wholesale1-2, ReorderPoint, ItemTypeKey→category_id, IsStockItem/IsDisabled/IsHidden, TMTID, Note
- **ItemUnit → product_units**: Name→item_units, Multiply→qty_per_base, SalePrice/Wholesale1-2, IsForPR→is_for_purchase
- **Lot → product_lots**: Name→lot_number(dedup), EfdDate/ExpDate, UnitAmt→cost_price, BaseQty→qty_on_hand & qty_received, IsClose/CloseDate
- **Customer+Person → customers**: FullName, Cid→id_card, BirthDate→dob, MobilePhone→phone, Address(+เขต/จังหวัด lookup)→address, CHCDetail→chronic_diseases, AlertNote, key −10→C0000
- **LegalEntity(IsVendor) → suppliers**: Name, TaxID, Phone1, Address, IsDisabled
- **SaleBasicHeader → sales**: DocDT→sold_at, CustomerKey→customer_id, TotalPrice→subtotal/total_amount, TotalDiscount, TotalVat, CashAmt/CreditCardAmt→cash/card, IsCredit/DueDate, IsCanceled→status, IsWholesale→sale_type
- **SaleBasic → sale_items**: ItemKey→product_id, ItemName, UnitName, UnitQty→qty, UnitPrice, Discount, UnitVat, ItemSetCode→item_note
- **SaleBasicLot → sale_item_lots**: SaleBasicKey→sale_item_id, LotKey→lot_id, BaseQty→qty
- **PurchaseReceiveHeader → purchase_receipts**: Code(gen)→invoice_no, CodeRef→supplier_invoice_no, VendorKey→supplier_id, DocDT→order_date, CashTypeKey→payment_type, DueDate/IsPay/PayDate→due_date/is_paid/paid_date, IsCanceled→status
- **PurchaseReceive + PurchaseReceiveLot → purchase_receipt_items**: ItemKey→product_id, UnitQty×Multiply→qty, UnitPrice÷Multiply→cost_price, PurchaseReceiveLot.LotKey→lot_id, Lot/EfdDate/ExpDate

---

## 5. Edge cases & transform (สำคัญ)

| # | ปัญหา | วิธีจัดการ |
|---|-------|-----------|
| E1 | **lot ซ้ำ 4,188 คู่** (ItemKey|Name) ชน `UNIQUE(product_id,lot_number)` | **merge**: รวมเป็นล็อตเดียวต่อ (product, lot_number) — รวม qty_on_hand, ใช้ ExpDate ที่ใกล้สุด, cost เฉลี่ยถ่วงน้ำหนัก. เก็บ `Map<LotKey, mergedLotId>` (หลาย LotKey → 1 lot id) เพื่อให้ FK ของ sale_item_lots ชี้ถูก |
| E2 | วันที่ `MM/DD/YY HH:MM:SS` | parse → ISO `YYYY-MM-DD HH:MM:SS`; ปี 2 หลัก: 70-99→19xx, 00-69→20xx (ปลอดภัยถึง 2069) |
| E3 | walk-in (CustomerKey −10) | map → customers code `C0000` (สร้าง row เดียว ตรง invariant) |
| E4 | ItemKey ที่ sale อ้างแต่สินค้าถูกลบ/ไม่อยู่ใน Item | สร้าง product placeholder "(สินค้าถูกลบ #key)" หรือ skip line + log — **เลือก: log + skip line** (ป้องกัน FK พัง) |
| E5 | ราคา/qty ว่าง (NULL) | normalize → 0 อย่างชัดเจน (อยู่ในชั้น import ไม่ใช่ runtime — ไม่ขัด invariant front-end) |
| E6 | Discount เป็น % หรือบาท? | **ต้องตรวจก่อนเขียนจริง** (ดู Audit P2-A3) |
| E7 | ItemSet ตอนขายแตกเป็นบรรทัด — ไม่สร้างบรรทัด bundle | ประวัติขาย: import บรรทัดสินค้าจริงตรง ๆ. นิยามชุด (D4): bundle products สร้างแยก ไม่ผูกกับประวัติขายเก่า |
| E8 | qty_per_bundle หน่วยอะไร | ItemSetItem.SaleUnitQty × Multiply → base qty (เก็บใน qty_per_bundle เป็นหน่วยฐาน) |
| E9 | sold_by / created_by → users(id) | Employee 2 คน + SuperAdmin; password hashed (ไม่ดึง). **set NULL** (nullable) หรือสร้าง user ระบบ 1 ตัว — เลือก: NULL |
| E10 | item_units ต้อง UNIQUE(name) | upsert by name; cache `Map<name, unitId>` |
| E11 | สินค้า code ซ้ำ / barcode ซ้ำ | code generate ใหม่ unique เสมอ; barcode ไม่ unique constraint (ปล่อยได้) |
| E12 | PurchaseReceiveLot.Multiply vs PurchaseReceive.Multiply | qty ของ lot ใช้ของ PurchaseReceiveLot.Qty (เป็น base แล้ว? **ต้องตรวจ** — ดู Audit P1-A2) |

---

## 6. Reconciliation (ตรวจหลัง import)

หลัง Phase 9 พิมพ์รายงานเทียบ — ทั้งคู่ต้องตรงหรืออธิบายส่วนต่างได้:
1. จำนวน row ต่อ entity: Hygeia (หลังกรอง) vs SQLite
2. **สต็อก**: `StockCurrentBalance.Qty` ต่อสินค้า เทียบ Σ`product_lots.qty_on_hand` (หลัง merge) — รายงานสินค้าที่ไม่ตรง
3. **ยอดขายรวม 3 ปี**: Σ`SaleBasicHeader.TotalPrice` เทียบ Σ`sales.total_amount`
4. **ยอดซื้อรวม 3 ปี**: เทียบทำนองเดียวกัน
5. orphan check: ทุก `sale_item_lots.lot_id` / `*.product_id` ชี้ไปยัง row ที่มีจริง (ไม่มี FK ลอย)

---

## 7. Deliverable
- `scripts/import-hygeia.ts` (importer)
- `hygeia-import-test.db` (ผลลัพธ์ทดสอบ)
- รายงาน reconcile (พิมพ์ stdout + เขียนไฟล์ `import-report.txt`)

---

# AUDIT PASS 1 — ความถูกต้องเชิงโครงสร้าง/FK

> เป้า: หาจุดที่ทำให้ import พัง หรือ FK ลอย ก่อนเขียนโค้ด

**P1-A1 — lot ซ้ำชน UNIQUE → จับได้ ✅**
4,188 คู่ (ItemKey|Name) ซ้ำ. ถ้า insert ตรง ๆ จะ throw `UNIQUE constraint failed`. → แก้ด้วย E1 (merge + map หลาย LotKey → 1 lot id). **ต้องทำก่อน Phase 8** เพราะ sale_item_lots.LotKey อ้างถึง LotKey ดิบ ต้อง resolve ผ่าน map.

**P1-A2 — Multiply ซ้อนใน PurchaseReceiveLot → ต้องตรวจค่าจริง ⚠️**
ทั้ง `PurchaseReceive` และ `PurchaseReceiveLot` มี `Multiply`. เสี่ยงคูณซ้ำ (double-count) ตอนคำนวณ qty ฐาน. ต้องตรวจ sample จริงว่า `PurchaseReceiveLot.Qty` เป็นหน่วยฐานแล้วหรือยัง ก่อนตัดสินสูตร. → **action: ตรวจก่อนเขียน Phase 7** (เพิ่มใน checklist)

**P1-A3 — ลำดับ Phase ปลอดภัยกับ FK ✅**
products ก่อน lots ก่อน sale_item_lots — ถูกต้อง. customers/suppliers ก่อน sales/purchase — ถูกต้อง. category ก่อน products — ถูกต้อง. bundle (Phase 4) สร้าง products เพิ่ม → ต้องระวัง crosswalk ItemKey ไม่ชนกับ ItemSetKey (คนละ namespace แต่ทั้งคู่ map ไป products.id — ใช้ map แยกกัน ✅).

**P1-A4 — ล็อตข้ามช่วงเวลา → จับได้ ✅**
Phase 5 import ล็อตทั้งหมด (ไม่กรอง 3 ปี) เพราะ sale 3 ปีอาจตัดล็อตเก่า. ยืนยันใน plan แล้ว.

**P1-A5 — ItemKey ลอยใน sale/purchase (E4) ✅**
จัดการแล้ว: log + skip. แต่ต้องนับว่า skip ไปกี่บรรทัด ใส่ใน reconcile.

**P1-A6 — sale_items.product_id NOT NULL + REFERENCES products**
ถ้า skip line (E4) ต้อง skip ทั้ง sale_item และ sale_item_lots ที่ผูกอยู่ด้วย ไม่งั้น lot ลอย. → **เพิ่มกฎ: skip line ต้อง cascade ไปยัง sale_item_lots ของบรรทัดนั้น**

**P1-A7 — sales.invoice_no UNIQUE + purchase_receipts.invoice_no PK**
generate ต้อง unique ข้ามทั้งชุด. ใช้ running counter แยก 2 ชุด (S-xxxxxxx, ซื้อใช้รูปแบบเดิมของ purchase). → ตรวจรูปแบบ invoice ที่ระบบเรา generate ปกติ ให้ match (ดู Audit P2-A4)

### สรุป Pass 1: เพิ่ม action 3 จุด → P1-A2 (ตรวจ Multiply), P1-A6 (cascade skip), P1-A7 (รูปแบบ invoice). แก้เข้า plan แล้ว (E1, E12, §6)

---

# AUDIT PASS 2 — ความถูกต้องเชิงความหมาย/ธุรกิจ

> เป้า: ข้อมูล import เข้าไปแล้ว "หมายความถูก" ไหม (ไม่ใช่แค่ใส่ได้)

**P2-A1 — cost_price ของ products มาจากไหนให้ตรง 3-cost model ✅/⚠️**
memory `[[project_cost_model]]`: `cost_price` = weighted-avg (ใช้ valuation), `last_cost_price` = last paid. → Item.MovAvgPrice→cost_price ✅, Item.UnitPriceCheapest→last_cost_price. แต่ "cheapest" ≠ "last paid" เป๊ะ. ⚠️ พิจารณาใช้ `Item.UnitPrice` (ราคาทุนปัจจุบัน) แทน หรือดึง last paid จาก PurchaseReceive ล่าสุด. → **action: เลือก field last_cost ให้ชัด ก่อนเขียน Phase 2**

**P2-A2 — qty_on_hand vs qty_received หลัง merge (E1)**
ล็อตยกมา (ไม่มีประวัติรับ) → qty_received = qty_on_hand. แต่ถ้า merge ล็อตซ้ำ qty รวมกัน → qty_received ก็ต้องรวมด้วยให้สอดคล้อง. ตรง E1 แล้ว แต่ย้ำ: **qty_reserved = 0 เสมอ** (ไม่มีข้อมูล reserve เก่า) — ปลอดภัย.

**P2-A3 — Discount: % หรือบาท? → ยังไม่ยืนยัน ⚠️**
ฝั่งเรา `sale_items.discount` = บาท (line). ต้องตรวจ Hygeia ว่า SaleBasic.Discount เป็นบาทต่อบรรทัด หรือ %. ถ้าผิดหน่วย ยอดเงินเพี้ยนทั้งระบบ. → **action: ตรวจ sample เทียบ TotalPrice ก่อนเขียน Phase 8** (critical)

**P2-A4 — invoice_no format ต้อง match generator ของแอป ⚠️**
ถ้า import ใช้รูปแบบต่างจากที่ POS/GR generate ตอน runtime จะชนกัน/เรียงผิดเวลาเปิดใช้จริง. → **action: อ่าน sale/purchase invoice generator ในโค้ดเรา แล้ว match** (เช่น prefix + running). ถ้าจะใช้ DB ทดสอบอย่างเดียวก็ผ่อนได้ แต่ควรเผื่ออนาคต migrate เข้า prod.

**P2-A5 — is_closed ของล็อตต้องสอดคล้อง qty หลัง merge ✅/⚠️**
invariant: `is_closed` toggle เมื่อ qty ข้าม 0. หลัง merge ถ้า qty_on_hand > 0 ต้อง is_closed=0 แม้ Hygeia IsClose=1 (เพราะ merge ทำให้มีของ). → **action: คำนวณ is_closed จาก qty หลัง merge เอง ไม่ copy ตรงจาก Hygeia**

**P2-A6 — sale_type / status enum ตรงค่าที่แอปคาดหวัง ⚠️**
ตรวจค่า enum จริงที่โค้ดเราใช้: sale_type ∈ {retail, wholesale}? status ∈ {completed, voided}? purchase status ∈ {completed, cancelled}? → **action: grep ค่า enum ในโค้ดก่อน map** (กันสะกดผิด)

**P2-A7 — VAT: ร้านนี้ VAT หรือ NO-VAT?**
memory `[[project_vat_phasing]]`: VAT ตัดสินตอน install. ข้อมูล Hygeia มี TotalVat/UnitVat. ถ้า DB ทดสอบตั้งเป็น NO-VAT แต่ import ค่ามี VAT จะขัด. → **action: ตั้ง sales_settings/VAT ของ DB ทดสอบให้ตรงโหมดร้านก่อน import** (หรือ import VAT ตามจริงแล้วเลือกโหมด VAT)

**P2-A8 — bundle (D4) ไม่มี stock ของตัวเอง ✅**
memory: bundle stock = derived (MIN of components), cost = Σ component. → import แค่ recipe (product_bundle_items) อย่า insert ล็อตให้ bundle. ✅ ตรง.

**P2-A9 — created_at/sold_at timezone**
Hygeia DocDT = local time. เราเก็บ `datetime('now','localtime')`. → ใช้ค่า DocDT ตรง ๆ เป็น local string ไม่แปลง TZ. ✅

### สรุป Pass 2: เพิ่ม action 6 จุด → P2-A1 (last_cost field), P2-A3 (Discount หน่วย — critical), P2-A4 (invoice format), P2-A5 (is_closed คำนวณเอง), P2-A6 (enum), P2-A7 (VAT mode). 

---

## 8. Pre-code checklist — เคลียร์ครบแล้ว ✅ (ตรวจค่าจริง 2026-06-05)

- [x] **C1 (P2-A3, critical)** **Discount = บาท/บรรทัด** ✅ (ยืนยันจาก header 8067: Σline disc 1.25+0.54+0.21=2.00 = header TotalDiscount). → map ตรง `sale_items.discount` (บาท). **BONUS:** `SaleBasicHeader.TotalPrice = GROSS (ก่อนหักส่วนลด)` → ดู §9 แก้ mapping ยอดเงิน
- [x] **C2 (P1-A2)** **PurchaseReceiveLot.Qty = หน่วยซื้อ (ไม่ใช่ฐาน)** ✅ (PR.UnitQty=9 = PRLot.Qty=9, Multiply=20 เท่ากัน). → base = `Qty × Multiply`, cost/ฐาน = `UnitPrice ÷ Multiply`. PR กับ PRLot สะท้อนค่าเดียวกัน — **ใช้ PRLot ตัวเดียว ไม่คูณซ้ำ**
- [x] **C3 (P2-A1)** เลือกแล้ว: `cost_price = MovAvgPrice` (เฉลี่ยถ่วงน้ำหนัก), `last_cost_price = Item.UnitPrice` (ราคาทุนปัจจุบัน — ตรงความหมาย last paid มากกว่า Cheapest)
- [x] **C4 (P2-A6)** enum ยืนยัน: `sale_type ∈ {retail, wholesale, rx, return}`, sales `status ∈ {completed, voided}`, purchase `status ∈ {completed, cancelled}`, `payment_type ∈ {cash, credit}` → IsCanceled(sale)→'voided', IsCanceled(purchase)→'cancelled', IsWholesale→retail/wholesale
- [x] **C5 (P2-A4)** sales invoice = **`RC-YYYYMMDD-NNNN`** (running 4 หลัก/วัน, `pos.ts:215`) → generate จาก DocDT. purchase invoice = ส่งเข้ามาจาก frontend (ไม่มี generator ตายตัวใน purchase.ts) → ใช้ **`GR-YYYYMMDD-NNNN`** (prefix รอ confirm กับ frontend GR — non-blocking, แค่ต้อง unique เป็น PK)
- [x] **C6 (P2-A7)** **ร้านนี้ NO-VAT** ✅ (TotalVat>0 = 0 จาก 341,903 บิล) → ตั้ง `sales_settings.vat_enabled=0`, `total_vat=0`/`unit_vat=0` ทุกบิล
- [x] **C7** ไม่มี tsx/ts-node แต่มี **esbuild + typescript + better-sqlite3** → เขียน importer เป็น **plain Node ESM (`.mjs`)** รันด้วย `node` (เลี่ยง ts runner + ไม่ต้อง npm install)
- [x] **C8** **encoding ภาษาไทยครบ** ✅ ทุกตารางหลัก (Item เม็ด, ItemUnit กล่อง, Person ลูกค้าทั่วไป, LegalEntity ร้านยาฟาร์มดี, ItemSet ไข้)

> ✅ checklist ครบ — พร้อมเริ่มเขียน `scripts/import-hygeia.mjs` ทีละ phase พร้อม reconcile

---

## 9. แก้ mapping ยอดเงินขาย (จาก BONUS ของ C1)

`SaleBasicHeader.TotalPrice` = **ยอดรวมก่อนหักส่วนลด (GROSS)** ไม่ใช่ยอดสุทธิ — ดังนั้น:

| Syntropic (sales) | สูตร |
|---|---|
| `subtotal` | `= SaleBasicHeader.TotalPrice` (gross) |
| `total_discount` | `= SaleBasicHeader.TotalDiscount` |
| `total_vat` | `= 0` (NO-VAT) |
| `total_amount` | `= TotalPrice − TotalDiscount` (สุทธิ) |
| `sale_items.line_total` | `= (UnitPrice × UnitQty) − Discount` |

> เดิมใน HTML เขียน `TotalPrice → subtotal/total_amount` ซึ่ง**ผิด**สำหรับบิลที่มีส่วนลด — แก้แล้วตามตารางนี้
