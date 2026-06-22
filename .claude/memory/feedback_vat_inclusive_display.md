---
name: feedback_vat_inclusive_display
description: ราคาทุน/ราคาขายทุกจุดในโปรแกรมต้องแสดง "รวม VAT" เสมอ — ก่อน VAT ใช้แค่ถอดไปทำรายงานภาษี
metadata:
  type: feedback
---

**DONE 2026-06-22** — กฏถาวร + implement เรียบร้อยแล้ว

ทุกจุดในโปรแกรมที่แสดงราคา (ราคาทุน/ราคาขาย) **ต้องเป็นราคารวม VAT (gross) เสมอ** — กล่อง "ทุนล่าสุด", ตารางประวัติราคาทุน, EditProduct, POS, ทุกที่. ราคา "ก่อน VAT" (ex-VAT) **ห้ามแสดงที่ไหนเลย** ใช้เฉพาะตอนถอด VAT ไปลงรายงานภาษีซื้อ/ใบกำกับภาษี/เอกสารยื่นราชการเท่านั้น.

**Why:** การซื้อขายหน้าร้านแบบไทยไม่มีแนวคิด "ก่อน/หลัง VAT" — ราคาที่ตกลงซื้อขายคือราคารวม VAT แล้วล้วน ๆ. การโชว์ราคา ex-VAT ทำให้เจ้าของงง เพราะไม่ตรงกับเลขบนใบกำกับที่กรอกเข้ามา (เช่น กรอก 5.28 รวม VAT แต่กล่องโชว์ 4.93 ที่ถอด VAT แล้ว).

**Implementation (2026-06-22) — `electron/ipc/purchase.ts`:**

- **save handler:** ลบ `costFactor = 100/(100+rate)` VAT-strip ออกทั้งหมด; เปลี่ยนชื่อ `costEx` → `costGross`, `costBaseEx` → `costBaseGross`; ฟิลด์ต่อไปนี้เก็บ **GROSS** ทุกกรณี (รวม inclusive bill):
  - `product_lots.cost_price`
  - `products.cost_price` (weighted-avg ดู [[project_cost_model]])
  - `products.last_cost_price`
  - `stock_movements.unit_cost`
  - guard เปลี่ยนจาก `costEx > 0` เป็น `costGross > 0`
- **cancel handler:** reversal `unit_cost` ใช้ `line.cost_price / qpb` (gross ledger); ลบ dead `costFactor`/`vatRate` ออก
- **UNCHANGED (intentional):** `purchase_receipts.vat_mode` / `vat_rate` / `vat_amount` header snapshot คงอยู่ — รายงานภาษีซื้อใน [[project_vat_phasing]] อ่าน snapshot นี้ไปถอด VAT เอง ไม่ถอดที่ฝั่งต้นทุน
- **vat_mode ที่ code รองรับจริง:** `'none'` | `'inclusive'` เท่านั้น (ลบ reference `'exclusive'` ที่เก่าออกจาก `docs/claude/business-logic.md:59-60` แล้ว)

**Data repair (dev DB — one-off):**
- lot ที่ปนเปื้อน = สินค้า 873, lot 111476 จากบิล `GR-20260622-0001` (`vat_mode='inclusive'`, rate 7) — lot เดียวเท่านั้น
- recompute: cost gross = 5.73 (เดิม 5.5573 ที่ถูกถอด VAT แล้ว); `products.cost_price(873)` → 5.3221; `products.last_cost_price(873)` → 5.28 (เดิม 4.9346 = 5.28÷1.07)
- ล็อตอื่นอีก ~19,000 รายการที่ `vat_mode='none'` เก็บ gross อยู่แล้ว ไม่ต้องแก้

**Verification:** priest PASS; hunter tsc PASS (error ที่เหลือ = `src/pages/Theme/index.tsx:1628` pre-existing ไม่เกี่ยว); orphan identifiers หายหมด; VAT snapshot header ครบ.

เกี่ยวกับ [[project_vat_phasing]], [[project_gr_discount_model]], และ [[project_cost_model]].
