---
name: project_pos_unit_mismatch_guard
description: POS checkout guard when product_units.qty_per_base changes after item is in cart
metadata:
  type: project
---

# POS unit-mismatch checkout guard

**DONE 2026-06-23 — tsc PASS + logic review PASS; in-app verify pending**

## ปัญหา

`CartItem.selectedUnit` คือ **snapshot** ตอนหยิบลงตะกร้า (cartStore = global, ไม่ re-fetch)
ถ้าแก้ `product_units.qty_per_base` หลังหยิบ → `pos:saveBill` อ่าน `item.qty_per_base` จาก payload เก่า → ตัดสต็อกผิด

## การตัดสินใจสำคัญ

- **บล็อกการคิดเงิน** เท่านั้น (ไม่ auto-fix, ไม่ re-sync) → บังคับลบแล้วหยิบใหม่ เพื่อดึง product สดจาก DB
- **เทียบเฉพาะ `qty_per_base` — ห้ามเทียบราคา** เพราะพนักงานปรับราคา/ส่วนลดเองได้ (false alarm); `qty_per_base` มาจาก product master ที่เดียว mismatch = แก้ master หลังหยิบ = zero false positive
- unit picker ในตะกร้าก็ดึง snapshot product เดิม → "เปลี่ยนหน่วยในตะกร้า" ใช้ไม่ได้ ต้อง re-search เสมอ

## Implementation

- IPC `pos:getUnitFactors(unitIds: number[])` → `{id, qty_per_base}[]` อ่านสดจาก DB (`electron/ipc/pos.ts`) + bridge ใน `preload.ts` / `preload.d.ts`
- `openPayment` ใน `src/pages/POS/index.tsx` เป็น async guard: รวบ unit id ที่ `> 0` (base unit id=-1 ข้าม), fetch DB, เทียบ snapshot vs DB → mismatch = `setMismatchItem` + return ก่อนเปิด payment
- gate ครอบทั้งปุ่ม "ชำระเงิน" + F9 (เรียก `openPayment` ตัวเดียว)
- แสดง `ConfirmDialog variant="warning" singleButton` ปุ่ม "ลบรายการแล้วหยิบใหม่" → `removeCartItem(index)` + toast + `refocusSearch`
- รวม `mismatchItem !== null` เข้า `anyModalOpen`

## Pitfalls

### removeCartItem wrapper (ห้ามข้าม)
ลบ cart item จาก code path ใหม่ต้องใช้ `removeCartItem(index)` (wrapper ใน POS/index.tsx) ไม่ใช่ `cart.removeItem` ตรง ๆ เพราะ wrapper realign `expandedBundles` ด้วย — ถ้าข้ามจะ bundle index เพี้ยน

### In-flight guard สำหรับ async handler ที่ caller ไม่ await
F-key / ปุ่มที่เรียก async handler โดยไม่ await ต้องมี guard ป้องกันกดซ้ำ:
```ts
const openingRef = useRef(false);
async function openPayment() {
  if (openingRef.current) return;
  openingRef.current = true;
  try { /* ... */ } finally { openingRef.current = false; }
}
```
เหตุ: `anyModalOpen` ยัง false ระหว่างรอ IPC → กดได้หลายรอบก่อน dialog เปิด
