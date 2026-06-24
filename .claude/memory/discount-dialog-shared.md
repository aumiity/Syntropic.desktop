---
name: discount-dialog-shared
description: DiscountDialog primitive (ส่วนลดรายตัว) ใช้ร่วม POS + GR receive table
metadata:
  type: project
---

**DONE 2026-06-23** — ส่วนลดรายตัวมี primitive กลาง `src/components/ui/discount-dialog.tsx` (ยก logic จาก POS cart มาทำ component).

- **3 ช่องซิงค์กัน**: ส่วนลด (%) / ส่วนลด (บาท) / ราคาสุดท้าย + preset % `[3,5,10,15,20]` (pill `layoutId="discount-pct-pill"`) + ปุ่ม "ล้าง". footer = ล้าง(`destructive-soft` mr-auto) / ปิด(`elevated`) / ตกลง(`default`).
- **API**: `{ open, onClose, itemName?, totalPrice, initialDiscount, onApply(discount) }`. seed/sync state เองภายในตอน open จาก `totalPrice` + `initialDiscount`; consumer แค่รับ `onApply` เป็น "ส่วนลดบาท". helper `stripCommas`/`formatNumWithCommas` อยู่ในไฟล์ component (ลบสำเนาใน POS ออกแล้ว).
- **ใช้ 2 ที่**:
  - **POS** (`src/pages/POS/index.tsx`) — ปุ่ม inline ในตะกร้า `variant="destructive-soft"` → `setDiscountModalIdx(idx)`; `onApply` = `cart.updateItem(idx,{discount})`; `onClose` = ปิด + `refocusSearch()`. (เดิม dialog เขียน inline ~136 บรรทัด — refactor ออกแล้ว ลบ state `discountInput/discountPctInput/discountFocus/finalPriceInput`).
  - **GR receive table** (`src/pages/Purchase/index.tsx`) — คอลัมน์ "ส่วนลด" เป็นปุ่ม `destructive-soft` คลิกเปิด; `totalPrice = qty*cost_price`; `onApply` = `applyLineDiscount(i, d)` ซึ่ง **set `row.discount` โดยตรง; total = qty*cost − discount** ไม่มี `bill_discount` อีกต่อไป (ถูกลบแล้ว 2026-06-24); เปิดโหมด "รวมส่วนลดในต้นทุน" (mergeCost) → คอลัมน์โชว์ "—" กดไม่ได้. ไม่มี `*`/tooltip แยกรายตัว/ท้ายบิล (เดิมมี ถูกลบแล้ว).
- **"ส่วนลดท้ายบิล" modal เปลี่ยนเป็น BULK redistribute** (2026-06-24): รับยอดรวมเดียว → กระจายสัดส่วน `qty*cost` ลงทุกแถวใน `row.discount` (เขียนทับ — ไม่ reversible/แยก); แถวที่ `qty*cost<=0` ถูกข้าม; เปิดซ้ำ seed ค่าจาก Σ row.discount ปัจจุบัน; มี amber warning callout (AlertTriangle) เตือนว่ากระจายใหม่.
- **ส่วนลดถูกย้ายออกจาก `AddProductWizard` ทั้งหมด** (เดิมเป็นปุ่ม link เผยช่อง inline ใน step 2) — คงฟิลด์ `row.discount` + การคิด total ไว้ เพื่อ preserve แถวที่มีส่วนลดตอนเปิดแก้ใน wizard; legacy drafts ที่มี `bill_discount` เก่า fold เข้า `discount` ใน rows useState lazy initializer (กัน double-subtract). เกี่ยวข้อง [[project_gr_discount_model]].
