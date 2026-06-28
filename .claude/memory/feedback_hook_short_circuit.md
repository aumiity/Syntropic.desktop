---
name: feedback-hook-short-circuit
description: React Rules-of-Hooks pitfall — hook หลัง `||`/`&&` short-circuit เปลี่ยนจำนวน hook call ตาม role → จอขาวบน DEV role-switch (ไม่มี remount)
metadata:
  type: feedback
---

## กฎ

Hook ทุกตัว (รวม `useCan`) ต้องเรียก **unconditionally** เสมอ แล้วค่อยรวมผลด้วย boolean:

```ts
// WRONG — useCan เรียกแค่เมื่อ isAdmin = false (short-circuit)
const canEdit = isAdmin || useCan('product.edit') !== 'off'

// CORRECT
const canByRole = useCan('product.edit')   // เรียกทุกรอบ render
const canEdit   = isAdmin || canByRole !== 'off'
```

## ทำไม tsc จับไม่ได้

React hooks rule เป็น lint rule (`eslint-plugin-react-hooks`) ไม่ใช่ type error — tsc ผ่านเงียบ, runtime พัง.

## อาการ

จำนวน hook call เปลี่ยนตาม runtime value → React throw "Rendered fewer hooks than expected" → จอขาว.
เจอเฉพาะ **DEV role-switch** (TitleBar switchRole ไม่ remount component tree); production ผู้ใช้ login ใหม่ = full remount = ไม่เจออาการ — บั๊กซ่อนในโหมด DEV เท่านั้น.

## บริบทที่เจอ (เฟส 2 ระบบสิทธิ์ 2026-06-28)

`useCan` เรียกหลัง `isAdmin ||` ใน 3–4 component; แก้ด้วย hoist call ขึ้นมาก่อน guard เสมอ.

related: [[project_role_permissions]]
