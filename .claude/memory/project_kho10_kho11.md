---
name: next-feature-10-11-reports
description: ข.ย.10/ข.ย.11 FDA drug-sale registers — DONE 2026-06-17 (in-app verify pending)
metadata: 
  node_type: memory
  type: project
  originSessionId: 28df6a4c-3287-4366-b97f-183881c109cf
---

**Status: DONE 2026-06-17 (in-app verify pending).** Previously Phase 5 of [[project_manage_restructure]], blocked on อย. spec — now unblocked and shipped.

## What was built

FDA drug-sale registers ตามกฎหมาย ร้านยาต้องบันทึกการขายยาควบคุม/ยาอันตรายรายวัน:

- **ข.ย.๑๐** — บัญชีการขายยาควบคุมพิเศษ (filter: `products.is_fda10=1`)
- **ข.ย.๑๑** — บัญชีการขายยาอันตราย เฉพาะรายการที่เลขาธิการ อย. กำหนด (filter: `products.is_fda11=1`)

Schema `products.is_fda10 / is_fda11` มีอยู่แล้ว (backfilled จาก `drug_types` ตั้งแต่ migration)

## Files

| File | Role |
|------|------|
| `src/pages/Reports/KhorYorSaleLedger.tsx` | shared component — render ทั้งข.ย.10 และ 11 ผ่าน prop `form: 10|11` |
| `src/pages/Reports/KhorYor10.tsx` | thin wrapper → `<KhorYorSaleLedger form={10} />` |
| `src/pages/Reports/KhorYor11.tsx` | thin wrapper → `<KhorYorSaleLedger form={11} />` |
| `src/pages/Reports/FdaReports.tsx` | landing — เปิด enabled ข.ย.10/11; ลบ placeholder ข.ย.13 ที่ไม่ตรง template |
| `electron/ipc/reports.ts` | IPC handler `reports:khorYorSale({ form, date_from, date_to })` |

Routes ใหม่ใน `App.tsx`: `/reports/fda/khor-yor-10` และ `/reports/fda/khor-yor-11`

## Layout (per-lot ledger)

แต่ละ product_lot ที่มียอดขายในช่วงวันที่เลือก = 1 section ประกอบด้วย:

1. **Header block**: ชื่อยา / ครั้งที่ผลิต (lot_number) / ได้มาจาก (supplier_name) / จำนวนที่รับ / วันที่รับ
2. **ตาราง 6 คอลัมน์**: ลำดับ / วันที่ขาย / จำนวน / ชื่อผู้ซื้อ / ลายมือชื่อ / หมายเหตุ

ข.ย.๙ เดิม (`KhorYor9.tsx`) ตรวจแล้วตรง template อย. เป๊ะ — ไม่แตะ

## Non-obvious insights

**"วันที่รับ" ล็อต = `product_lots.created_at`** — GR receive เขียน receive_date ลง `created_at`; `order_date` = วันสั่งซื้อ มักว่างเปล่า Handler ใช้ `COALESCE(pl.created_at, pl.order_date)` เพื่อความปลอดภัย อย่าสลับ

**ชื่อผู้ผลิต/ผู้นำเข้า และ ขนาดบรรจุ** — `products` ไม่มีฟิลด์เหล่านี้ → render เป็นเส้นประให้เขียนมือตาม template อย. จริง ไม่ต้องเพิ่ม column

**Walk-in (C0000)** → เว้นช่องผู้ซื้อ (หรือใช้ `customer_name_free` ถ้ากรอก) ไม่ใส่ชื่อ "Walk-in"

**Backend query** อ่านจาก `sale_item_lots` (FEFO-tracked) JOIN `product_lots` / `suppliers` / `customers` — กลุ่มตาม lot ก่อน จากนั้นเรียงตามวันที่ขาย

## Related

- [[project_manage_restructure]] — Phase 5 ของแผน restructure ที่ตอนนี้เสร็จแล้ว
- [[project_vat_phasing]] — ฟีเจอร์ VAT ที่ทำคู่กันใน Reports section
