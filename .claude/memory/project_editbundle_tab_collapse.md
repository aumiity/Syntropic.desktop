---
name: project-editbundle-tab-collapse
description: "DONE 2026-06-19 (tsc PASS; in-app click-test pending) — EditBundle ยุบ ComponentsTab เข้า Tab 1 + save atomic ปุ่มเดียว ทั้งโหมดสร้าง/แก้ไข"
metadata:
  type: project
---

## What changed

`src/pages/Products/EditBundle/` restructured so General + Components live in one view. ComponentsTab.tsx became a controlled-only child; `index.tsx` owns all save logic.

**Tab structure after:**
- โหมดสร้างใหม่: ไม่มี tab strip — มุมมองเดียว (general form + components table)
- โหมดแก้ไข: TabStrip เหลือ 3 แท็บ `[ข้อมูล & รายการ][ฉลาก][ความเคลื่อนไหว]` (key ภายใน tab แรกยังเป็น `'general'`)

**ComponentsTab.tsx — controlled-only now:**
- ลบ uncontrolled path, ลบ local `isDirty`, ลบ local Save button ออก
- `items` = `draftItems` จาก parent เสมอ ทั้ง 2 โหมด
- Mutation ผ่าน `handleItemsChange` (เดิม) → flip `isDirty` ที่ parent

**Atomic save (ปุ่มเดียวที่ TabStrip):**
- โหมดสร้างใหม่: `bundles:create` (atomic, IPC เดิม)
- โหมดแก้ไข: `products:update` → `products:saveBundleItems` → `refreshProduct` ตามลำดับ

**Order matters — recomputeBundleCost pitfall:**
`saveBundleItems` เรียก `recomputeBundleCost` ภายใน ซึ่งเขียน `products.cost_price` เป็นขั้นสุดท้าย ดังนั้น `products:update` ต้องไม่มี `cost_price` ใน allow-list (และจริง ๆ ไม่มีอยู่แล้ว) — ลำดับ update → saveBundleItems ทำให้ cost ถูกเสมอ

**Cost display โหมดแก้ไข:**
อ่าน `product.cost_price` (server-recomputed หลัง save) ไม่ใช่ผลรวม draft — `component_cost` ใน draft = snapshot ไม่ตรง weighted-avg จริง

**Layout:**
- outer scroll เดียวบนทั้งหน้า
- ตาราง components = `max-h-[420px]` scroll ในตัว (bounded, ไม่ fill-height)
- sticky column header + totals bar คงอยู่

**Seed/re-seed pattern:**
```ts
// module-scope helper — ไม่ flip dirty
function seedDraftItems(prod: Product) { setDraftItems(…raw…) }
// mutation path — flip dirty
function handleItemsChange(items) { setDraftItems(items); setIsDirty(true) }
```
`seedDraftItems` ใช้ตอน load product ครั้งแรก และ refreshProduct หลัง save เท่านั้น

Related: [[project-edit-parity-pass]] (plan เดิมที่ถูก supersede); [[project-cost-model]] (cost_price = weighted-avg ห้าม hand-edit)
