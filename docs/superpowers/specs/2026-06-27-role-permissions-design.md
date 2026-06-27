# Role-based Permission System — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Owner:** เจ้าของร้าน (operator)

## 1. ปัญหา / เป้าหมาย

ตอนนี้สิทธิ์การใช้งาน **ไม่ใช่ข้อมูล** — เป็นโค้ด `requireAdmin()` ที่ฮาร์ดโค้ดกระจายอยู่ ~50 จุดใน `electron/ipc/*.ts`. Role มีแค่ 2 ตัวตายตัว (`admin` / `staff`) และสิทธิ์ของแต่ละ role แก้ไม่ได้. เมื่อฟังก์ชันเริ่มเยอะ การคุมว่า "ใครทำอะไรได้" กระจัดกระจายและขยายยาก.

**เป้าหมาย:** มีหน้า Settings เดียวที่กำหนดสิทธิ์ของแต่ละ role ได้ (data-driven) แทนการฮาร์ดโค้ด.

## 2. ขอบเขต (ตัดสินแล้ว)

- **3 role ตายตัว** (ไม่มี CRUD role): `owner` (เจ้าของร้าน) · `pharmacist` (เภสัชกร) · `staff` (พนักงาน).
- **`owner` = สิทธิ์เต็มเสมอ ล็อก** — ไม่เก็บใน DB, ไม่ปรากฏเป็น row ที่แก้ได้, ผ่านทุก gate โดยอัตโนมัติ.
- **`pharmacist` + `staff` = ตั้งค่าได้** ผ่านหน้า Settings.
- **3 สถานะต่อสิทธิ์ต่อ role**: `off` (ปิด) / `allow` (เปิด) / `override` (ต้องขออนุมัติ).
  - `override` = คงแนวคิด manager-override เดิม แต่ขยายให้ตั้งได้กับทุกสิทธิ์ที่เป็น "การกระทำ".
  - สิทธิ์แบบ "ดู" (view) มีแค่ `off` / `allow`.
- **ความละเอียด** = กลุ่มตามงาน ~15 สิทธิ์ (ไม่แยกรายราย action).

## 3. โมเดล Role + การย้ายข้อมูลเดิม

| role (DB value) | ชื่อแสดง (Thai) | ระดับ | แก้สิทธิ์ได้? |
|---|---|---|---|
| `owner` | เจ้าของร้าน | สูงสุด | ไม่ (เต็มล็อก) |
| `pharmacist` | เภสัชกร | กลาง | ได้ |
| `staff` | พนักงาน | ต่ำ | ได้ |

**Migration (DB จะถูกลบทิ้งก่อน build จริง — ตาม convention โครงการ ไม่ต้องเขียน migration):**
- `users.role` default เปลี่ยน `'staff'` คงเดิม.
- seed: ผู้ใช้ `admin@syntropic.local` → `role='owner'`; staff seed คงเดิม.
- **โค้ดทุกจุดที่เทียบ `role === 'admin'` หรือ `getSessionRole(e) === 'admin'` ต้องเปลี่ยนเป็น `'owner'`** (สำคัญ — ดู §7 รายการความเสี่ยง).

## 4. โมเดลข้อมูล (DB)

เพิ่ม 1 ตาราง. รายการสิทธิ์ (registry) เป็น **ค่าคงที่ในโค้ด** — DB เก็บแค่สถานะต่อ (role × permission).

```sql
CREATE TABLE role_permissions (
  role        TEXT NOT NULL,   -- 'pharmacist' | 'staff'  (ไม่เก็บ 'owner')
  permission  TEXT NOT NULL,   -- permission key เช่น 'sale.void'
  state       TEXT NOT NULL,   -- 'off' | 'allow' | 'override'
  PRIMARY KEY (role, permission)
);
```

- ถ้าไม่มี row สำหรับ (role, permission) → ใช้ default จาก registry (fail-safe = `off` สำหรับ action, `off` สำหรับ view).
- seed สร้าง row ตามตารางค่าตั้งต้น §6.
- schema 3 จุดตาม convention โครงการ: `schema.ts` CREATE + `ALTER`/migration ที่เกี่ยวข้อง (ถ้าจำเป็น — ที่นี่เป็นตารางใหม่ ไม่ต้อง ALTER).

## 5. Permission Registry (~15 สิทธิ์)

ไฟล์ใหม่ `src/lib/permissions/registry.ts` (import ได้ทั้ง main + renderer). แต่ละ entry:

```ts
type PermKind = 'action' | 'view'
interface PermDef {
  key: string
  group: string          // หัวข้อในตาราง UI
  label: string          // ชื่อไทย
  kind: PermKind         // 'view' → 2 สถานะ, 'action' → 3 สถานะ
  defaults: { pharmacist: PermState; staff: PermState }
}
type PermState = 'off' | 'allow' | 'override'
```

| key | group | label | kind | แทน IPC เดิม |
|---|---|---|---|---|
| `product.editPrice` | สินค้า/สต็อก | แก้ราคาสินค้า | action | `products:updatePrice`, `products:updateUnitPrice` |
| `stock.adjust` | สินค้า/สต็อก | ปรับสต็อก/ล็อต | action | `products:adjustStock`, `adjustLot`, `adjustLotBatch`, `updateLot`, `expireLot` |
| `purchase.cancel` | สินค้า/สต็อก | ยกเลิกใบรับของ | action | `purchase:cancel` |
| `cost.view` | สินค้า/สต็อก | เห็นต้นทุน | view | cost-strip ใน `reports:inactiveProducts` + การซ่อนคอลัมน์ต้นทุน |
| `sale.void` | การขาย | ยกเลิกบิล (void) | action | `reports:voidSale` |
| `sale.editCustomer` | การขาย | เปลี่ยนลูกค้าในบิล | action | `reports:updateSaleCustomer` |
| `report.finance` | รายงาน/เงิน | ดูรายงานการเงิน | view | `reports:financeSummary`, `salesPurchaseTrend`, `accountsPayable`, `topProducts`, `topSuppliers`, `cashierLeaderboard`, `salesStats`, `productVelocity` |
| `report.vat` | รายงาน/เงิน | ดูรายงานภาษี VAT | view | `reports:vatSummary` |
| `export.finance` | รายงาน/เงิน | ส่งออก Excel การเงิน | action | `export:*` กลุ่มการเงิน |
| `expense.manage` | ค่าใช้จ่าย | จัดการค่าใช้จ่าย | action | `expenses:*` (list/create/update/delete/category) |
| `user.manage` | ระบบ | จัดการพนักงาน/ผู้ใช้ | action | `people:listStaff`, `saveStaff`, `setStaffStatus`, `resetStaffPassword` |
| `settings.manage` | ระบบ | ตั้งค่าร้าน/ระบบ | action | `settings:saveShop`, `save*Settings`, `saveCategory`, `saveUnit`, `saveDrugType`, `reorderCategories`, `saveTheme*` |
| `data.backup` | ระบบ | สำรอง/กู้คืนข้อมูล | action | `backup:*` (export/restore/saveSettings/pickFolder/resetFolder) |
| `vat.toggle` | ระบบ | เปิด/ปิดโหมด VAT | action | `settings:upgradeToVat`, `downgradeFromVat` |
| `permission.manage` | ระบบ | จัดการสิทธิ์ (หน้านี้) | action | ใหม่ `permissions:save` — **owner เท่านั้น ล็อก** |

> หมายเหตุ: `permission.manage` ไม่แสดงเป็น row ที่ปรับได้ในเมทริกซ์ (owner-only ตายตัว) — มันคือ gate ของหน้า Settings เอง.

## 6. ค่าตั้งต้น (seed)

owner = ทุกสิทธิ์ allow (ไม่เก็บ DB).

| สิทธิ์ | pharmacist | staff |
|---|---|---|
| `product.editPrice` | allow | override |
| `stock.adjust` | allow | override |
| `purchase.cancel` | allow | override |
| `cost.view` | allow | off |
| `sale.void` | allow | override |
| `sale.editCustomer` | allow | override |
| `report.finance` | allow | off |
| `report.vat` | allow | off |
| `export.finance` | allow | off |
| `expense.manage` | allow | off |
| `user.manage` | off | off |
| `settings.manage` | off | off |
| `data.backup` | off | off |
| `vat.toggle` | off | off |

## 7. ชั้นบังคับสิทธิ์ (Enforcement)

### Main side — `electron/auth/permissions.ts` (ใหม่)

```ts
requirePermission(e, permKey, override?)
  role = getSessionRole(e)
  if role === 'owner' → return            // ผ่านเสมอ
  state = lookupState(role, permKey)       // จาก role_permissions, fallback registry default
  if state === 'allow' → return
  if state === 'off'   → throw FORBIDDEN
  if state === 'override':
     if !override → throw NEEDS_OVERRIDE
     verify override credential (scrypt + lockout เดิม)
     ตรวจว่า role ของผู้อนุมัติมี permKey === 'allow' (หรือ owner) → ผ่าน
     ไม่ผ่าน → throw FORBIDDEN
```

- **ใครอนุมัติ override ได้** = ผู้ใช้ที่ role มี permKey นั้นเป็น `allow` (รวม owner เสมอ). ไม่จำกัดแค่ owner — เภสัชกรอนุมัติให้พนักงานได้ถ้าเภสัชกรมีสิทธิ์นั้น `allow`.
- `requireAdmin` เดิม → **ลบทิ้ง** หลังย้ายครบ (หรือคงไว้ชั่วคราวเป็น `requirePermission(e, 'owner-only-key')` ระหว่างเปลี่ยน).

### Renderer side — `src/hooks/useCan.ts` (แทน/เสริม `usePermission`)

```ts
useCan('sale.void') → 'off' | 'allow' | 'override'
```
- ใช้ซ่อนปุ่ม (`off` → ซ่อน), ตัดสินใจเปิด override dialog (`override` → เปิด dialog, `allow` → ทำเลย).
- เป็นแค่ UX — security จริงอยู่ที่ `requirePermission` ฝั่ง main เสมอ (คง invariant R1).
- ต้องโหลด snapshot สิทธิ์ของ role ปัจจุบันมาเก็บใน store (IPC `permissions:getForRole` หรือฝังตอน login).

### Manager-override dialog
- `src/components/ui/manager-override-dialog.tsx` + `useManagerOverride.tsx` ต้องเปลี่ยนจาก "โหลดเฉพาะ admin" → "โหลดผู้ใช้ที่ role อนุญาต (allow) permKey นั้น".
- `run()` ต้องรับ `permKey` เพื่อรู้ว่าใครมีสิทธิ์อนุมัติ.

## 8. หน้า Settings UI

- แท็บใหม่ใต้ Settings: **"สิทธิ์การใช้งาน"** — เข้าได้เฉพาะ owner (gate ด้วย `permission.manage`).
- เมทริกซ์: row = สิทธิ์ (จัดกลุ่มตาม `group`), column = [เจ้าของร้าน(ล็อก) · เภสัชกร · พนักงาน].
- คอลัมน์ owner = ติ๊กเต็ม disabled (เทา).
- ช่อง pharmacist/staff:
  - `action` → dropdown 3 ค่า (ปิด/เปิด/ต้องขออนุมัติ) ใช้ primitive ที่มี (`NativeSelect`/`Select`).
  - `view` → 2 ค่า (ปิด/เปิด).
- บันทึกแบบ explicit — ปุ่ม "บันทึก" + "ยกเลิก" (ไม่ auto-save) ตาม convention checkbox/บันทึกของแอป (Switch=ทันที, Checkbox/dropdown ตั้งค่า=ต้องกดบันทึก).
- IPC ใหม่: `permissions:getMatrix` (อ่านทั้งตาราง), `permissions:save` (owner-only, เขียน role_permissions ใน transaction เดียว).
- UI ตาม invariant: bar `h-12`, control `h-9`, semantic tokens, ไม่มี emoji, ใช้ `src/components/ui/*` เท่านั้น.

## 9. แบ่งเฟส

1. **เฟส 1 — โครงสร้าง**
   - registry.ts + DB table + seed + ย้าย role (`admin`→`owner`) + แก้จุดเทียบ `'admin'` → `'owner'` + หน้า People เลือก 3 role.
   - `requirePermission` + map ชั่วคราว (owner=เต็ม, pharmacist/staff อ้าง registry default) — ยังไม่ต้องแตะ ~50 gate.
2. **เฟส 2 — ย้าย gate**
   - เปลี่ยน ~50 `requireAdmin` → `requirePermission(e, key, override?)` ทีละกลุ่ม (products → reports → settings → expenses → backup → people → purchase).
   - `useCan` + ซ่อนปุ่ม/แท็บฝั่ง renderer; ผูก override dialog แบบ multi-approver.
3. **เฟส 3 — หน้า Settings**
   - เมทริกซ์ + `permissions:getMatrix`/`save` + ทดสอบ end-to-end ทั้ง 3 role × สถานะ.

## 10. ความเสี่ยง / กับดัก

- **จุดเทียบ `role === 'admin'` กระจายเยอะ** (main + renderer: `isAdmin`, `getSessionRole`, navigation gate, cost-strip, finance panel, ExportHub, DeadStock, People redirect). ต้องไล่เปลี่ยนเป็น `'owner'` ให้ครบ มิฉะนั้น owner ใหม่จะถูกบล็อก. → grep `'admin'` ทั้ง repo ก่อนเริ่มเฟส 1.
- **`requireAdmin` กับ payload allow-list**: handler ที่เป็น `*:update` สร้าง SQL จาก `Object.keys(data)` — การเพิ่ม permKey ต้องไม่หลุดเข้า payload (คง invariant allow-list).
- **fail-safe**: ถ้า lookup ไม่เจอ row → default `off` (ปฏิเสธ) ไม่ใช่ allow.
- **owner ต้องห้ามถูกล็อกตัวเอง** — `permission.manage` owner-only ล็อกตายตัว ไม่มีทางปิด.
- **session ไม่ persist** (ตายทุก boot โดยเจตนา) — snapshot สิทธิ์ฝั่ง renderer ต้องโหลดใหม่ทุก login.
- **manager-override-dialog เดิม filter `role==='admin'`** — ต้องรื้อเป็น filter ตาม permKey.

## 11. นอกขอบเขต (YAGNI)

- ไม่ทำ CRUD role (เพิ่ม/ลบ role เอง).
- ไม่ทำ per-user override สิทธิ์ (สิทธิ์ผูกที่ role เท่านั้น).
- ไม่ทำ audit log ของการเปลี่ยนสิทธิ์ (อาจเพิ่มภายหลัง).
- ไม่ทำ migration DB จริง (DB dev จะถูกลบก่อน build).
