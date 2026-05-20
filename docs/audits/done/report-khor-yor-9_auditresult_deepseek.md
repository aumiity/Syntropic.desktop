# Audit Result: report-khor-yor-9.md
**Audited by:** DeepSeek via Claude Code
**Date:** 2026-05-20

---

## Critical (will break at runtime)

### 1. SQL JOIN ผิด — `purchase_receipts` ไม่มี column `id` และ `purchase_receipt_items` ไม่มี column `receipt_id`

Plan เขียน:
```sql
JOIN purchase_receipts pr ON pr.id = pri.receipt_id
```

ความจริงจาก `schema.ts`:
- `purchase_receipts` ใช้ **`invoice_no TEXT` เป็น PRIMARY KEY** (ไม่มี column `id`)
- `purchase_receipt_items` join ผ่าน **`invoice_no`** (ไม่มี column `receipt_id`)

ที่ถูกต้อง:
```sql
JOIN purchase_receipts pr ON pr.invoice_no = pri.invoice_no
```

---

## Significant (จะ compile/path พัง หรือ logic ผิด)

### 2. Route structure ไม่ตรงกับที่ plan คิด

Plan ออกแบบให้ FDA tab เป็น parent layout ที่มี nested children:
```
/reports/fda           → card grid hub
/reports/fda/khor-yor-9 → ขย.9 page
```

แต่ code จริงใน `App.tsx` เป็น flat routes:
```
/reports          → Finance (index)
/reports/payables → Payables
/reports/fda      → FdaReports (placeholder)
```

การจะ nested `/reports/fda/khor-yor-9` ต้องแก้ `FdaReports.tsx` ให้เป็น layout route ที่มี `<Outlet />` ของตัวเอง Plan ไม่ได้พูดถึงตรงนี้เลย

### 3. ชื่อไฟล์ผิด

Plan อ้างถึง `src/pages/Reports/Fda.tsx` แต่ไฟล์จริงชื่อ `src/pages/Reports/FdaReports.tsx` และ import ใน `App.tsx` ก็ใช้ `FdaReports`

---

## Minor (logic ถูกแต่จะสะดุด)

### 4. `is_bundle` filter หาย

SQL ใน plan กรอง `p.is_drug = 1` อย่างเดียว แต่สินค้าที่เป็น bundle อาจมี `is_drug = 1` ด้วย — bundle คือชุดขาย ไม่ใช่ยาจริงที่ซื้อจาก supplier ไม่ควรโผล่ใน ขย.9

ควรเพิ่ม:
```sql
AND p.is_bundle = 0
```

### 5. ขาดการ fetch `shop_settings`

Plan บอกว่า subtitle ต้องแสดง `shop_settings.shop_name` แต่ไม่ได้บอกวิธีดึงข้อมูล — ต้องเรียก `window.api.settings.shopSettings()` ตอน mount page

### 6. Loading / empty / error states ไม่ได้ระบุใน plan

Plan ไม่ออกแบบ UX สำหรับ:
- สถานะโหลด (spinner/skeleton)
- ผลลัพธ์ว่างเปล่า (ไม่มีรายการซื้อยาในช่วงวันที่เลือก)
- IPC error handling

### 7. `qty` เป็น REAL ไม่ใช่ INTEGER

Schema: `qty REAL NOT NULL DEFAULT 0` — ค่า fractional เช่น `100.5` เป็นไปได้ ควรตัดสินใจว่าจะแสดงผลยังไง (ปัดเศษ? แสดงทศนิยม?)

---

## Verification checklist issues

### 8. Verification step 6 ใช้คำไม่ตรง UI

Plan step 6: "Cancel the GR → row disappears"

GR cancel ในระบบคือ `cancelled_at IS NOT NULL` (SQL กรองถูกแล้ว) แต่ควรใช้คำว่า "ยกเลิก GR" ให้ตรงกับ UI ภาษาไทย

---

## สิ่งที่ plan ทำถูก (ยืนยันแล้วจาก codebase)

| Item | Verified against |
|------|-----------------|
| `is_drug = 1` filter | `schema.ts` — column exists, DEFAULT 0 |
| `name_for_print` fallback → `trade_name` | `schema.ts` + CLAUDE.md rule |
| `pr.cancelled_at IS NULL` filter | `schema.ts` — nullable TEXT column |
| `LEFT JOIN item_units u ON u.id = p.unit_id` | `schema.ts` — base unit FK on products |
| `DateRangePicker` props (`from`, `to`, `onChange`) | `date-range-picker.tsx` — exact match |
| `StatCard` exists, props match | `card.tsx:238-297` |
| `electron/ipc/reports.ts` exists | ไฟล์มีอยู่แล้ว มี 8 handlers |
| No existing `@media print` rules | `index.css` — zero matches |
| No existing `thaiDate.ts` | `src/lib/` — มีแค่ 3 ไฟล์ |
| No existing `khorYor9` anywhere | grep ทั่ว codebase — zero matches |

---

## สรุปสิ่งที่ต้องแก้ใน plan ก่อนเขียนโค้ด

1. **SQL JOIN** — ใช้ `invoice_no` ไม่ใช่ `id`/`receipt_id`
2. **Route structure** — ทำให้ `FdaReports` เป็น layout route ที่มี `<Outlet />` หรือเปลี่ยนไปใช้ flat routes
3. **ชื่อไฟล์** — `FdaReports.tsx` ไม่ใช่ `Fda.tsx`
4. **เพิ่ม `is_bundle = 0`** ใน WHERE clause
5. **เพิ่ม shop_settings fetch** ใน data flow section
