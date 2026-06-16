---
name: project_default_qty
description: "products.default_qty — per-product POS starting quantity re-added from PHP original; multiplier wins; sale-only; coerce to 1 not 0"
metadata:
  type: project
---

## จำนวนตั้งต้นการขาย (`default_qty`) — DONE 2026-06-16 (in-app click-test pending)

`products.default_qty REAL NOT NULL DEFAULT 1` — จำนวนที่ถูกใส่ตะกร้า POS โดยอัตโนมัติเมื่อสแกน/เลือกสินค้า

### History

คอลัมน์นี้มีอยู่ใน PHP original (`syntropic_rx.sql`) แต่ถูก **ตัดออกโดยตั้งใจ** ตอน rebuild เป็น SQLite (เคย list อยู่ใน `docs/claude/database.md` ว่า "PHP-only, not in SQLite") ฟีเจอร์นี้นำกลับมาอีกครั้ง — **ลบ entry นั้นออกจาก database.md แล้ว**

### Priority: multiplier WINS

`src/pages/POS/index.tsx → handleSelectItem`:
```ts
const qty = multiplier ?? product.default_qty ?? 1
```
- `*N` multiplier ([[project_pos_qty_multiplier]]) มีลำดับสูงกว่า `default_qty` เสมอ
- Mini-POS adjust/return flows **ไม่ได้รับผล** — `default_qty` ใช้กับการขายปกติเท่านั้น

### Schema touched in TWO places

`electron/db/schema.ts`:
1. `CREATE TABLE products` — column definition
2. Safe-migration `ALTER TABLE` array — เพิ่ม `ALTER TABLE products ADD COLUMN default_qty REAL NOT NULL DEFAULT 1`

(ต้องทำทั้งสองจุดเสมอเวลาเพิ่มคอลัมน์ใหม่ → [[project_refine_schema_checklist]])

### IPC gotchas

- `products:create` และ `products:createBundle` — ต้องเพิ่ม `default_qty` ทั้งใน INSERT column list + VALUES + `defaults` object (better-sqlite3 named params strict)
- `products:update` — **ไม่ต้องแตะ** เพราะ build SQL จาก `Object.keys(data)` แบบ dynamic อยู่แล้ว

### Form coercion rule

`EditProduct/index.tsx → doSave`:
- Fallback เป็น `1` ไม่ใช่ `0`
- เคารพ HARD invariant "never coerce blank → 0 for qty fields"

### UI placement

- `EditProduct/GeneralTab.tsx` — SectionCard "ข้อมูลพื้นฐาน", half-width, `type="number" min={1}`
- ไม่มี `variant="elevated"` เพราะ Input ใช้ elevated เป็น default อยู่แล้ว ([[input-elevated-default-flip]])
