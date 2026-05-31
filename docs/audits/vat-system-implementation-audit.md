# Audit: ระบบ VAT (ภาษีมูลค่าเพิ่ม) — Implementation Checklist

Date: 2026-05-31
Scope: ตรวจสอบการ implement ระบบ VAT แบบ VAT-inclusive (ราคารวมภาษีแล้ว) ที่เพิ่งเพิ่มเข้าไป ครอบคลุม settings → คำนวณ → แสดง → บันทึก → ใบเสร็จ.
Related plan: `~/.claude/plans/vat-synchronous-pebble.md`

ไฟล์ที่แตะ: [schema.ts](../../electron/db/schema.ts), [types/index.ts](../../src/types/index.ts), [vat.ts](../../src/lib/vat.ts), [SalesTab.tsx](../../src/pages/Settings/SalesTab.tsx), [settings.ts](../../electron/ipc/settings.ts), [POS/index.tsx](../../src/pages/POS/index.tsx), [pos.ts](../../electron/ipc/pos.ts), [printer.ts](../../electron/ipc/printer.ts)

---

## วิธีใช้เอกสารนี้
แต่ละหัวข้อคือจุดที่ต้องตรวจ พร้อม **สิ่งที่คาดหวัง** และ **วิธีตรวจ**. ติ๊ก `[x]` เมื่อยืนยันแล้ว. หัวข้อเรียงตามความเสี่ยง (สูง → ต่ำ) — ถ้ามีเวลาจำกัด ตรวจ "High" ให้ครบก่อน.

---

## High — ต้องตรวจก่อน

### [x] H1. Stale compiled `.js` ข้างๆ `.ts` — runtime ใช้ไฟล์ไหน (ยืนยันแล้ว: ใช้ .ts)
`package.json` `main = dist-electron/main.js`, และ `electron:dev` รันผ่าน `vite-plugin-electron` ที่ `entry: 'electron/main.ts'` → bundle จาก `.ts` สดลง `dist-electron/` ทุกครั้งที่เปิด dev. คอมเมนต์ใน `vite.config.js` ระบุชัดว่าไฟล์ `electron/*.js` ที่ค้างข้างๆ source เป็นของเก่าที่ **ไม่ได้ใช้รันไทม์**.
- **สรุป**: edits ฝั่ง `.ts` มีผลจริง. ไฟล์ `electron/*.js` (เช่น `schema.js`, `pos.js`) เป็น vestigial — พิจารณาลบ/gitignore แยกต่างหากเพื่อลดความสับสน (ไม่กระทบการทำงาน).

### [ ] H2. Migration ปลอดภัยกับ DB เก่า (ไม่ล้างข้อมูล)
[schema.ts:561-563](../../electron/db/schema.ts) เพิ่ม `ALTER TABLE sales_settings ADD COLUMN vat_enabled ... DEFAULT 0` และ `vat_rate ... DEFAULT 7` ในลูป migration ที่ครอบ `try { } catch {}`.

- **คาดหวัง**: เปิดแอปบน DB เดิมที่มีข้อมูลขายอยู่แล้ว → ไม่ error, ข้อมูลขายเดิมอยู่ครบ, แถว `sales_settings` เดิมได้ค่า `vat_enabled=0`, `vat_rate=7` อัตโนมัติ.
- **วิธีตรวจ**: เปิดแอปด้วย DB ที่มีอยู่ → `SELECT vat_enabled, vat_rate FROM sales_settings;` ต้องได้ `0 | 7`. รันแอปซ้ำ 2 รอบ เพื่อยืนยันว่า ALTER ซ้ำไม่ทำให้ crash (catch กลืน error "duplicate column" ได้).
- **หมายเหตุ**: `sales.total_vat` และ `sale_items.unit_vat` มีในสคีมาเดิมอยู่แล้ว — ไม่ต้อง migrate.

### [ ] H3. ลำดับคอลัมน์/placeholder ใน INSERT (saveBill)
[pos.ts:192-200](../../electron/ipc/pos.ts) เพิ่ม `total_vat` เข้า INSERT `sales`; [pos.ts:207-209](../../electron/ipc/pos.ts) เพิ่ม `unit_vat` เข้า INSERT `sale_items`.

- **คาดหวัง**: จำนวนคอลัมน์ = จำนวน `?` = จำนวน argument ใน `.run(...)`, และ `total_vat`/`unit_vat` ตรงตำแหน่ง (อยู่ก่อน `total_amount` / ก่อน `line_total` ตามลำดับ).
- **ผลการตรวจเบื้องต้น (ผู้เขียนนับให้แล้ว ขอให้ทวนซ้ำ)**: `sales` = 16 placeholder / 16 arg (sold_at เป็น `datetime()` ไม่นับ, status เป็น literal); `sale_items` = 10 / 10. ✅
- **วิธีตรวจ**: ขายจริง 1 บิล แล้ว `SELECT subtotal,total_discount,total_vat,total_amount,cash_amount FROM sales ORDER BY id DESC LIMIT 1;` — ค่าทุกคอลัมน์ต้อง**ไม่เลื่อนตำแหน่ง** (เช่น cash ต้องไม่ไปโผล่ที่ total_vat).
- **ความเสี่ยงถ้าผิด**: ค่าเงินเลื่อนคอลัมน์ → ยอดเงิน/ทอนเพี้ยนแบบเงียบๆ.

### [ ] H4. ความถูกต้องของสูตร VAT-inclusive
[vat.ts](../../src/lib/vat.ts): `extractVat = amount × rate / (100 + rate)`. [POS/index.tsx](../../src/pages/POS/index.tsx) คำนวณ `pendingVat` รวมเฉพาะ item ที่ `product?.has_vat` จาก `qty*unit_price - discount`.

- **คาดหวัง** (rate=7): สินค้า VAT ราคา 107 → VAT = 7.00, มูลค่าก่อนภาษี = 100.00. ยอดสุทธิ (`total_amount`) **ไม่เปลี่ยน** — VAT แค่ถอดออกมาแสดง ไม่บวกเพิ่ม.
- **วิธีตรวจ**: ขายสินค้า VAT ราคา 107 → หน้าจ่ายเงินต้องโชว์ "มูลค่าก่อนภาษี 100.00" + "ภาษีมูลค่าเพิ่ม 7% = 7.00" และ "เป็นเงินทั้งสิ้น 107.00". `SELECT total_vat FROM sales ...` ต้อง ≈ 7.00.
- **เคสส่วนลด**: ขาย 107 แล้วลด 7 → net 100 → `total_vat` ต้อง = 100×7/107 ≈ 6.54 (VAT คิดบนยอดหลังหักส่วนลด).

### [ ] H5. VAT คิดทุกรายการเมื่อเปิด (all-or-nothing — ไม่สน has_vat รายตัว)
ตามที่เจ้าของเลือก: POS คิด VAT ตาม `vat_enabled` ล้วน — `pendingVat` และ `unit_vat` รวม **ทุก item** เมื่อ VAT เปิด ([POS/index.tsx](../../src/pages/POS/index.tsx) — ไม่อ่าน `i.product?.has_vat` แล้ว).
- **คาดหวัง**: ตะกร้ามีของ 107 + 100 (ขณะ VAT เปิด) → VAT ≈ (107+100)×7/107 ≈ 13.54 (คิดทั้งคู่).
- **ผลพลอยได้**: สินค้าสร้างใหม่หลังเปิด VAT ก็ถูกคิด VAT ทันที (ปิดช่องโหว่ H6 เดิม) เพราะไม่พึ่ง flag has_vat.
- **หมายเหตุ**: `products.has_vat` และ toggle ในหน้าแก้ไขสินค้า กลายเป็น **vestigial** (ไม่มีผลต่อภาษีอีก) — ดู M5.

### [ ] H6. คอลัมน์ `products.has_vat` ถูกลบทิ้งทั้งหมด (per request)
ตามคำสั่ง: ลบ flag VAT รายสินค้าออกทั้งระบบ. การคิด VAT ขึ้นกับ `sales_settings.vat_enabled` อย่างเดียว.
- DB: ลบจาก `CREATE TABLE products` + migration `ALTER TABLE products DROP COLUMN has_vat` ([schema.ts:567](../../electron/db/schema.ts)).
- โค้ด: ถอด `has_vat`/`is_vat` ออกจาก Product type, EditProduct, EditBundle (รวม toggle + badge VAT), products:create/createBundle, seed, และ force-sync ใน settings (settings ไม่ยุ่งกับ products อีก).
- **วิธีตรวจ migration**: เปิดแอปบน DB เดิม → `PRAGMA table_info(products)` ต้อง**ไม่มี** has_vat แล้ว, ไม่ error, ข้อมูล products เดิมครบ. (better-sqlite3 รองรับ DROP COLUMN; โปรเจกต์ใช้ pattern นี้อยู่แล้วในลูป migration).
- **หมายเหตุ generator**: `electron/db/seed-data/products.ts` เป็นไฟล์ auto-generated (จาก `scripts/gen-products.py`) ยังมีค่า has_vat ใน tuple อยู่ — seed.ts ข้าม (elision) ไม่ใช้ค่านั้นแล้ว. ถ้าจะ regenerate ในอนาคต ควรอัปเดต generator ให้เลิก emit คอลัมน์นี้.

---

## Medium

### [ ] M1. `total_vat`/`unit_vat` ถูก fetch แล้วแต่ UI ยังไม่แสดง
**แก้จากฉบับแรก (เคยเขียนแรงเกินจริง):** `reports:getSaleByInvoice` ([reports.ts:89,97](../../electron/ipc/reports.ts)) และ `reports:getSale` ([reports.ts:133,141](../../electron/ipc/reports.ts)) ใช้ `SELECT s.*` / `si.*` → **ดึง `total_vat`/`unit_vat` มาด้วยอยู่แล้ว**. แต่ฝั่ง UI (หน้าประวัติบิล/รายละเอียด) **ยังไม่ render** ค่า VAT และยังไม่มีรายงานภาษีเฉพาะ.

- **ผลที่ตามมา**: ข้อมูล VAT มีพร้อมใน payload แล้ว ผู้ใช้เห็น VAT แค่ตอนหน้าจ่ายเงิน — ประวัติบิล/พิมพ์ซ้ำ/รายงานยังไม่โชว์.
- **ต้องตัดสินใจ**: ขอบเขตรอบนี้ตั้งใจแค่ "บันทึก" หรือต้องการให้โผล่ในประวัติ/รายงานด้วย? ถ้าต้องการ งานที่เหลือคือฝั่ง UI เป็นหลัก (data ถึงแล้ว): แสดง breakdown ในหน้า bill detail + เพิ่มรายงานภาษีขาย.

### [ ] M2. ใบเสร็จ (`buildReceipt`) ยังไม่ถูกต่อเข้า flow ขายจริง
[printer.ts:10-23, 61-76](../../electron/ipc/printer.ts) เพิ่มฟิลด์ `vatEnabled`/`vat` และบรรทัด VAT แล้ว แต่ `printer.printReceipt` **ไม่ถูกเรียกจากที่ไหนใน renderer** (ยืนยันด้วย grep — ไม่มี caller).

- **คาดหวัง**: โค้ดบรรทัด VAT พร้อมใช้ แต่ยังไม่ทำงานจนกว่าจะมีการต่อปุ่มพิมพ์ใบเสร็จเข้า POS.
- **วิธีตรวจ**: ยืนยันว่ายังไม่มีปุ่มพิมพ์ใบเสร็จใน flow ขาย (ถ้าคาดว่ามี = งานยังไม่ครบ). ถ้าจะทดสอบ buildReceipt จริง ต้องเรียก `window.api.printer.printReceipt({... vatEnabled, vat ...})` เอง.
- **จุดเล็ก**: การจัด `padStart` ของบรรทัดภาษาไทยใน ESC/POS เป็นการกะระยะ ไม่ได้คำนวณความกว้างจริง — เลื่อนได้บนเครื่องพิมพ์จริง (จัดทีหลังเมื่อมีเครื่อง).

### [ ] M3. เส้นทางขายอื่นไม่ได้คิด VAT (โดยตั้งใจ)
- `pos:returnItems` ([pos.ts:289-296](../../electron/ipc/pos.ts)) ยัง hardcode `total_vat=0` และ INSERT sale_items แบบไม่มี unit_vat → คืนสินค้าจะไม่กลับ VAT. **out of scope** ตามแผน เพราะ payload คืนสินค้าไม่มี has_vat.
- `dev.ts` seed ([dev.ts:183-191](../../electron/ipc/dev.ts)) INSERT แบบไม่มี vat → พึ่ง DEFAULT 0. โอเค.
- **คาดหวัง**: ยอมรับว่า return/seed ไม่มี VAT. ยืนยันว่าไม่กระทบรายงานที่จะทำต่อ (ถ้า M1 ทำต่อ ต้องคิดเรื่อง return ด้วย).

### [ ] M4. การ save settings เมื่อยังไม่มีแถว (else-branch) ทิ้ง form
[settings.ts:222-224](../../electron/ipc/settings.ts): ถ้ายังไม่มีแถว `sales_settings` เลย → ทำแค่ `INSERT ... DEFAULT VALUES` **โดยไม่เขียนค่าจาก `data`**. (เป็น pattern เดิม ไม่ใช่ของใหม่)

- **ผลกระทบจริง**: น้อย เพราะ `getSalesSettings` สร้างแถว default ตั้งแต่เปิดหน้า Settings ครั้งแรก ดังนั้นตอน save จะเข้า if-branch เสมอ.
- **วิธีตรวจ**: บน DB สดที่ไม่เคยเปิดหน้า Settings — ถ้า save ตรงๆ ค่าจะไม่ถูกบันทึก. ปกติไม่เกิด แต่รับรู้ไว้.

---

### [x] M5. toggle `has_vat` ในหน้าแก้ไขสินค้า — ลบแล้ว
ลบ toggle VAT ทั้งใน EditProduct/GeneralTab และ EditBundle/GeneralTab รวมถึง badge "VAT" ในหัว EditBundle. ดู H6.

## Low

### [ ] L1. Validation ของช่องอัตราภาษี (แก้แล้ว)
[SalesTab.tsx:156-167](../../src/pages/Settings/SalesTab.tsx): `parseFloat`, `NaN → 0`, และ **clamp 0–100** (`Math.min(100, Math.max(0, n))`). POS ใช้ `vat_rate ?? VAT_RATE_DEFAULT` (เปลี่ยนจาก `||` แล้ว — rate=0 จะคิด 0% ไม่ fallback เป็น 7%).
- **วิธีตรวจ**: ใส่ค่าว่าง/ตัวอักษร → 0 (ไม่ crash). ใส่ค่าติดลบ/เกิน 100 → ถูก clamp. ตั้ง rate=0 แล้วขาย → VAT = 0 (ไม่ใช่ 7%).

### [ ] L2. การแสดงผล breakdown เงื่อนไข `pendingVat > 0`
[POS/index.tsx](../../src/pages/POS/index.tsx): กล่อง breakdown โผล่เมื่อ `vatEnabled && pendingVat > 0`.
- **วิธีตรวจ**: เปิด VAT แต่ตะกร้ามีแต่สินค้าไม่ VAT → ไม่โชว์กล่อง VAT (ตั้งใจ). ปิด VAT → ไม่โชว์ และยอดสุทธิเท่าเดิม (พฤติกรรมเดิมก่อนมีฟีเจอร์).

### [ ] L3. ความสอดคล้องของ unit_vat กับ total_vat
`unit_vat` เก็บ = `unit_price × rate/(100+rate)` (ก่อนหักส่วนลด) ส่วน `total_vat` คิดบนยอดหลังหักส่วนลด. ดังนั้น `Σ(unit_vat × qty)` อาจ **ไม่เท่า** `total_vat` เมื่อมีส่วนลด — โดยดีไซน์.
- **วิธีตรวจ**: รับทราบว่าไม่ตรงกันเมื่อมีส่วนลด. ถ้ารายงานในอนาคต (M1) จะรวม `unit_vat` ต้องตัดสินใจว่าใช้ตัวไหนเป็น authoritative (แนะนำ: `sales.total_vat`).

### [ ] L4. Design tokens / UI ตามกติกาโปรเจกต์
- `tint="info-soft"` (SectionCard) และ `bg-info-soft` ที่ใช้ — เป็น token ที่ register แล้วใน `tailwind.config.js` ✅
- Input ใช้ `variant="elevated"` ตามกติกา ELEVATED ✅
- ไม่มี emoji / ไม่มี palette literal / ไม่มี raw HTML control ✅ (ทวนเร็วๆ ตอนรีวิว diff)

---

## Manual Test Matrix (สรุปสั้น)

| # | ขั้นตอน | คาดหวัง |
|---|---------|---------|
| 1 | เปิดแอปบน DB เดิม | ไม่ error, `sales_settings.vat_enabled=0, vat_rate=7` |
| 2 | Settings → เปิด VAT 7% → บันทึก | บันทึกสำเร็จ (ไม่ error); products ไม่มีคอลัมน์ has_vat แล้ว |
| 3 | ขายสินค้า VAT 107 บาท | โชว์ ก่อนภาษี 100 / VAT 7 / สุทธิ 107; DB `total_vat≈7` |
| 4 | ขาย 107 ลด 7 | `total_vat ≈ 6.54`, สุทธิ 100 |
| 5 | ตะกร้า 2 ชิ้น (107 + 100) ขณะ VAT เปิด | VAT คิด**ทั้งคู่** ≈ 13.54 (all-or-nothing, H5) |
| 6 | สร้างสินค้าใหม่ขณะ VAT เปิด → ขาย | ถูกคิด VAT ปกติ (ไม่พึ่ง has_vat) |
| 7 | ปิด VAT → ขายใหม่ | `total_vat=0`, ไม่โชว์กล่อง VAT, สุทธิเท่าเดิม |
| 8 | เปิด VAT → ปิด VAT สลับไปมา | บันทึกได้ทุกครั้ง; แค่ค่า vat_enabled เปลี่ยน (ไม่ยุ่ง products แล้ว) |
| 9 | ตั้ง vat_rate=0 → ขาย | VAT = 0 (ไม่ fallback 7%) |
| 10 | ตรวจคอลัมน์ใน DB หลังขาย | ค่าเงินไม่เลื่อนตำแหน่ง (H3) |

---

## Conclusion / Verdict

Implementation: VAT-inclusive, **all-or-nothing** (POS คิดตาม `vat_enabled` ล้วน), global switch บังคับ has_vat ทุกตัว, รวมโค้ดใบเสร็จ. `tsc --noEmit` ผ่านทั้ง renderer + electron.

แก้ตาม audit รอบ CODEX แล้ว: blocker `WHERE id=@id`, `vat_rate ?? `(แทน `||`)+clamp 0–100, ถอด guard `vat_initialized`, แก้ wording M1.

จุดที่ต้องตัดสินใจ/ระวังก่อนถือว่า "เสร็จสมบูรณ์":
1. **H1** — ยืนยัน runtime ไม่ได้ใช้ `.js` เก่า (น่าจะไม่ใช้ แต่ต้องเช็ค)
2. **M5** — toggle has_vat ในหน้าแก้ไขสินค้า กลายเป็น vestigial → ควรซ่อน/ลบ เพื่อไม่ลวงผู้ใช้ (รอยืนยัน)
3. **M1/M2** — VAT ที่บันทึก data ถึง report payload แล้วแต่ UI ยังไม่แสดง และใบเสร็จยังไม่ถูกต่อเข้า flow ขาย — ถ้าต้องการให้ผู้ใช้/สรรพากรเห็น ต้องทำเฟสต่อ

ที่เหลือ (Medium/Low) เป็นข้อจำกัดที่รับทราบได้ หรือเป็น polish เล็กน้อย.
