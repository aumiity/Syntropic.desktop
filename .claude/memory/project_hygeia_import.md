---
name: project_hygeia_import
description: Hygeia .mdb → Syntropic data migration — plan+audit done, checklist cleared, ready to code importer
metadata:
  type: project
---

**Hygeia (ระบบเดิมหน้าร้าน) → Syntropic data migration** — สถานะ **2026-06-05: plan + audit 2 รอบ + pre-code checklist ครบ พร้อมเขียน importer** (ยังไม่เริ่มโค้ด)

## ไฟล์งาน (อ่านก่อนเริ่ม)
- **`docs/plans/Hygeia_Import.md`** = SSOT ของงานนี้ (เป้าหมาย, 9 phase, mapping ย่อ, edge cases E1–E12, Audit Pass 1/2, checklist C1–C8 พร้อมผล, §9 แก้ยอดเงิน)
- **`docs/plans/Hygeia_Import_mapping.html`** = field-by-field mapping แบบภาพ (เปิดเบราว์เซอร์)

## แหล่งข้อมูล (สำคัญ — เคยพลาด)
- ไฟล์จริงต้อง **hydrate แล้ว**: `~/Documents/GitHub/hygeia.data.mdb` (478MB, นอก repo, persist). working copy ที่ `/tmp/hygeia.data.mdb` (อาจหายตอน reboot → cp ใหม่จาก ~/Documents/GitHub/)
- ❌ ตัวใน OneDrive (`.../OneDrive.noindex/.../Hygeia/`) เป็น **placeholder online-only (du = 0B)** อ่านได้แต่ศูนย์ — อย่าใช้
- ❌ โฟลเดอร์ `~/Downloads` ถูก **TCC block** (`Operation not permitted`) แม้ใส่ `!` — เก็บไฟล์ไว้นอก Downloads
- เครื่องมือ: `mdbtools` ติดตั้งแล้ว (`mdb-tables/-schema/-export`). mdb เป็น Jet ปกติ ไม่เข้ารหัส. `mdb-export` คืน UTF-8 ไทยถูกต้อง

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

## ขั้นต่อไป (เริ่มได้ทันที)
เขียน `scripts/import-hygeia.mjs` → **Phase 1–6 ก่อน** (lookup/สินค้า/หน่วย/ชุด/ล็อต/ลูกค้า/ซัพ) สร้าง test.db + reconcile สต็อก (StockCurrentBalance.Qty เทียบ Σ qty_on_hand) → ผ่านแล้วต่อ **Phase 7–8** (ซื้อ/ขาย 3 ปี) + reconcile ยอดเงิน

เกี่ยวข้อง: [[project_cost_model]] (3-cost), [[project_vat_phasing]] (NO-VAT), [[project_db_backup]]
