# แผน: แปลงใบเสนอราคา → การขายจริง (Quotation → Sale, เฟส 2) — rev.2 (ปรับตาม audit)

## Context

ระบบใบเสนอราคา (เฟส 1) ใช้งานได้แล้ว แต่ใบที่ลูกค้า **ตอบรับ (accepted)** เป็นทางตัน ผู้ใช้ต้องการนำเข้า **กระบวนการขายจริง** เพื่อรับเงิน + ตัดสต๊อก

**แนวทาง (ยืนยันแล้ว):** ปุ่ม **"แปลงเป็นการขาย"** บนใบ **accepted เท่านั้น** → โหลดรายการ+ลูกค้าเข้า **ตะกร้า POS** → ปิดการขายผ่าน `pos:saveBill` เดิม (FEFO/VAT/ใบเสร็จ) → มาร์คใบเป็น `converted` + ผูกเลขบิล. **Reuse กระบวนการขายเดิมทั้งหมด** — ใบแค่ "เติมตะกร้า"

## แก้ตาม audit (docs/audits/quotation-convert-plan-audit.md)
- **[High] กันขายซ้ำ — claim ก่อนขาย**: เพิ่มสถานะชั่วคราว **`converting`**. กดแปลง → **atomic claim** `accepted→converting` ก่อนไป POS; ถ้าใบถูก claim/แปลงไปแล้ว (changes=0) → บล็อก. ขายสำเร็จ → `converting→converted`; ยกเลิก → `converting→accepted`
- **[Med] converted ทางเดียว**: **ตัด `converted` ออกจาก `setStatus`**. `converted` เขียนได้ทางเดียวผ่าน `markConverted` (บังคับมี `converted_invoice_no` เสมอ)
- **[Med] ขายไม่ครบ = บล็อก**: ถ้ามีบรรทัดใด rebuild ไม่ได้ (ไม่มี product_id / สินค้าถูกลบ / ถูกปิด) → **บล็อกทั้งใบ** ไม่ขายบางส่วน (ตัดสินใจแล้ว); ตรวจ **ก่อน** claim — ถ้าบล็อกจะไม่แตะสถานะใบ

## State machine (ใบเสนอราคา)
```
draft ⇄ sent → accepted/rejected            (setStatus เดิม)
accepted → converting                        (quotation:beginConversion — atomic)
converting → accepted                        (quotation:releaseConversion — ยกเลิก)
converting → converted (+ invoice_no)        (quotation:markConverted — atomic, ทางเดียว)
converted = terminal
```
`setStatus` **ไม่** รับ converting/converted (เส้นทางแปลงเป็น IPC เฉพาะ)

## สถาปัตยกรรมเดิมที่ reuse
| ของเดิม | ที่อยู่ | ใช้ทำ |
|---|---|---|
| ตะกร้า POS | `useCartStore` `src/stores/cartStore.ts` | เติมรายการ/ลูกค้า |
| enrich สินค้า (units+lots) | loop ใน `pos:searchProducts` `pos.ts:88-124` | refactor → helper ใช้ร่วมกับ getByIds |
| ปิดการขาย | `handleCompleteSale`→`pos:saveBill` | ไม่แตะ |
| ดึงลูกค้าเต็ม | `people:getCustomer` | set cart.customer |
| capture marker ก่อน clearCart | `lastSaleForPrint` pattern (POS) | ต้นแบบ markConverted |

## แนวทาง

### 1. Backend
- **`schema.ts`**: ALTER `quotations` + `converted_invoice_no TEXT`
- **`pos.ts`**: `pos:getProductsByIds(ids)` คืน shape เดียวกับ `pos:searchProducts` (open lots expiry-ASC + sellable units). Refactor enrichment เป็น `enrichProduct(db, prod)` ใช้ร่วม
- **`quotation.ts`**:
  - `setStatus` allowed: `draft→sent`, `sent→accepted|rejected|draft` **เท่านั้น** (ลบ accepted→converted)
  - `quotation:beginConversion(id)` — `UPDATE ... SET status='converting' WHERE id=? AND status='accepted'`; `changes===0` → throw `'ใบนี้ถูกแปลงหรือกำลังแปลงอยู่แล้ว'`
  - `quotation:releaseConversion(id)` — `UPDATE ... SET status='accepted' WHERE id=? AND status='converting'`
  - `quotation:markConverted(id, invoice_no)` — `UPDATE ... SET status='converted', converted_invoice_no=? WHERE id=? AND status='converting'` (atomic, ทางเดียวที่เขียน converted)
- preload + regen `preload.d.ts` (tsc)

### 2. cartStore
+ `sourceQuotation: { id: number; quote_no: string } | null` ใน `CartSlot`/`emptySlot`/`snapCurrent` + setter `setSourceQuotation`. `clearCart` รีเซ็ตเป็น null (จาก emptySlot)

### 3. ตัวโหลด (`src/lib/quotation/loadToCart.ts` ใหม่)
`buildCartItemsFromQuote(quote)` → `{ items: CartItem[], blocked: string[] }`:
- `pos.getProductsByIds` ตาม product_id ที่มี
- ต่อ line: จับคู่ `unit_name` → ฐาน (`selectedUnit: undefined`) / `product.units` (`selectedUnit=unit` → ได้ `qty_per_base`); ใช้ **ราคาที่เสนอ** (`unit_price`/`discount`/`line_total`); attach `product`+`selectedUnit`
- **rebuildable ก็ต่อเมื่อ**: มี `product_id` + พบสินค้า + `is_disabled=0`. บรรทัดที่ไม่ผ่าน → ใส่ใน `blocked` (ชื่อ + เหตุผล)

### 4. ปุ่ม "แปลงเป็นการขาย" (handler `convertToSale(quoteId)`)
ลำดับ (ตรวจก่อน claim):
1. `quotation.get(id)` → `buildCartItemsFromQuote`
2. **ถ้า `blocked` ไม่ว่าง → บล็อก**: เปิด dialog/toast แสดงรายการที่ขายไม่ได้ + เหตุผล แล้ว **abort (ไม่แตะสถานะ)**
3. ถ้าตะกร้ามีของ → `ConfirmDialog` "แทนที่ตะกร้าปัจจุบันไหม?"
4. `quotation:beginConversion(id)` — ถ้า throw (ถูก claim แล้ว) → toast + abort
5. `cart.clearCart()` → `addItem` ทีละรายการ → set customer (`people:getCustomer` ถ้ามี customer_id ไม่งั้น `setCustomerNameFree`) → `setSourceQuotation({id,quote_no})` → `navigate('/')`

วางปุ่มที่ **`QuotationList`** (popover, เฉพาะ accepted) + **`EditQuotation`** header (accepted)

### 5. POS (`src/pages/POS/index.tsx`)
- banner เมื่อ `cart.sourceQuotation`: "กำลังขายจากใบเสนอราคา {quote_no}" (info) + ปุ่ม **"ยกเลิกการแปลง"** → `quotation:releaseConversion(id)` + `setSourceQuotation(null)`
- `handleCompleteSale` success: capture `src = cart.sourceQuotation` **ก่อน** clearCart; หลัง save → ถ้า src → `await window.api.quotation.markConverted(src.id, result.invoice_no)` ใน **try/catch แยก** (ล้มเหลว → toast แต่การขายสำเร็จแล้ว)

### 6. กู้คืนกรณีค้าง `converting` (ปิดแอป/ละทิ้งกลางคัน)
`QuotationList` แสดงแถว `converting` (Badge "กำลังแปลง" warning) พร้อม action:
- **"ดำเนินการขายต่อ"** → buildCartItems (บล็อกถ้า rebuild ไม่ได้) → โหลด cart + `setSourceQuotation` → POS (ไม่ claim ซ้ำ เพราะ converting อยู่แล้ว)
- **"ยกเลิกการแปลง"** → `releaseConversion` → กลับเป็น accepted

### 7. แสดงผล + types
- `converted` Badge violet + `converted_invoice_no` (ลิงก์ไป SaleDetail ได้ — optional); converted/converting แก้/ลบไม่ได้ (มี gate draft-only อยู่แล้ว) + ไม่มีปุ่มแปลง
- `Quotation` + `converted_invoice_no?`; status union + `'converting'`

## ไฟล์ที่แก้/เพิ่ม
| ไฟล์ | งาน |
|---|---|
| `electron/db/schema.ts` | ALTER + converted_invoice_no |
| `electron/ipc/pos.ts` | + `getProductsByIds` (helper `enrichProduct`) |
| `electron/ipc/quotation.ts` | setStatus (ตัด converted); + beginConversion / releaseConversion / markConverted |
| `electron/preload.ts` (+ regen `.d.ts`) | + pos.getProductsByIds, quotation.{beginConversion,releaseConversion,markConverted} |
| `src/stores/cartStore.ts` | + sourceQuotation + setter |
| `src/lib/quotation/loadToCart.ts` (ใหม่) | ประกอบ CartItem + blocked[] |
| `src/pages/Quotation/QuotationList.tsx` | ปุ่มแปลง (accepted) + แถว converting (ต่อ/ยกเลิก) + converted link |
| `src/pages/Quotation/EditQuotation.tsx` | ปุ่มแปลง (accepted) + แสดง converted/converting |
| `src/pages/POS/index.tsx` | banner + ยกเลิกการแปลง + markConverted หลังขาย |
| `src/types/index.ts` | + converted_invoice_no, + 'converting' |

## ข้อควรระวัง
- **selectedUnit ต้องถูก** — ไม่งั้น saveBill ตัดสต๊อกผิดหน่วย (qty_per_base)
- **อย่าทำซ้ำ logic ขาย** — โหลด cart แล้วใช้ saveBill เดิม (FEFO/VAT/walk-in invariant คงเดิม)
- ตรวจ blocked + `beginConversion` ให้ atomic **ก่อน** เข้า POS; claim สำเร็จแล้วค่อยแตะ cart
- markConverted = best-effort หลังบันทึก — **ห้ามทำให้การขายล้มเหลว** (try/catch แยก เหมือน pattern พิมพ์)
- regen `preload.d.ts` ก่อน renderer typecheck; **ห้าม `npm install`**; ห้าม emoji

## การทดสอบ (verify)
1. `tsc -p tsconfig.node.json` → `tsc -p tsconfig.json` → `npm run electron:dev`
2. ใบ accepted → ปุ่ม "แปลงเป็นการขาย" → ตะกร้า POS ครบ (หน่วย/ราคาตรงใบ) + ลูกค้าถูกตั้ง + banner; ใบเปลี่ยนเป็น **converting**
3. หน่วยไม่ใช่ฐาน (กล่อง qty_per_base=100) → ปิดการขาย → `product_lots.qty_on_hand` ลด = qty×qty_per_base (ตัดถูก)
4. ปิดการขายสำเร็จ → ใบ **converted** + `converted_invoice_no`=เลขบิล; แปลงซ้ำไม่ได้/แก้ไม่ได้
5. **กันขายซ้ำ**: เปิดใบ accepted ใบเดิม 2 ครั้ง/2 หน้าต่าง → ครั้งแรก claim ได้, ครั้งที่สอง beginConversion ถูกบล็อก (toast)
6. **บล็อกขายไม่ครบ**: ใบ accepted ที่มีบรรทัดไม่มี product_id หรือสินค้าถูกปิด → กดแปลง → บล็อกทั้งใบ + แสดงรายการที่มีปัญหา + สถานะใบ **ยังเป็น accepted** (ไม่ converting)
7. **ยกเลิกกลางคัน**: claim แล้ว (converting) → กด "ยกเลิกการแปลง" ใน POS หรือใน list → กลับเป็น accepted; ปิดแอปตอน converting → เปิด list เห็นแถว converting + ปุ่ม "ดำเนินการขายต่อ"/"ยกเลิก"
8. **converted ทางเดียว**: ไม่มี UI/transition ไหนตั้ง converted ได้นอกจาก markConverted (ทุกใบ converted ต้องมี invoice_no เสมอ)
9. flow ขายปกติ (ไม่ผ่านใบเสนอราคา) ไม่กระทบ — sourceQuotation=null