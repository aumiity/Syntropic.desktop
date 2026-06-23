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
  - **GR receive table** (`src/pages/Purchase/index.tsx`) — คอลัมน์ "ส่วนลด" เป็นปุ่ม `destructive-soft` คลิกเปิด; `totalPrice = qty*cost_price`; `onApply` = `applyLineDiscount(i, d)` ซึ่ง **เคลียร์ `bill_discount` แถวนั้น + คิด total ใหม่ = qty*cost − discount** (mirror กับตอน wizard แก้แถว ที่ init effect strip bill_discount). มี `*` + tooltip แยก รายตัว/ท้ายบิล เมื่อมีส่วนลดท้ายบิลปน; เปิดโหมด "รวมส่วนลดในต้นทุน" (mergeCost) → คอลัมน์โชว์ "—" กดไม่ได้.
- **ส่วนลดถูกย้ายออกจาก `AddProductWizard` ทั้งหมด** (เดิมเป็นปุ่ม link เผยช่อง inline ใน step 2) — แต่คงฟิลด์ `row.discount` + การคิด total ใน `lineMath` ไว้ เพื่อ preserve แถวที่มีส่วนลดตอนเปิดแก้ใน wizard. เกี่ยวข้อง [[project_gr_discount_model]].
