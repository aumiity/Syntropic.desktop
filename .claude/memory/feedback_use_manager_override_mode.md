---
name: feedback-use-manager-override-mode
description: `useManagerOverride().run()` คืน `'inline'|'prompt'|'noop'` — ใช้ `mode!=='inline'` ไม่ใช่ `!isAdmin` เพราะ pharmacist state=allow → inline ไม่ใช่ prompt
metadata:
  type: feedback
---

## API contract

`useManagerOverride().run(action, { permKey })` คืน `'inline' | 'prompt' | 'noop'`:

| ค่า | ความหมาย | สิ่งที่เกิด |
|-----|----------|------------|
| `'inline'` | session user มีสิทธิ์เอง (owner หรือ pharmacist state=allow) | ทำต่อเลย |
| `'prompt'` | ต้องขออนุมัติ (state=override) | dialog เปิดขึ้น — hook จัดการเอง |
| `'noop'` | สิทธิ์ปิด | ยกเลิกเงียบ |

## กฎสำหรับ consumer

```ts
const mode = await run(myAction, { permKey: 'product.edit' })
if (mode !== 'inline') { setBusy(false); return }
// ... ทำงานต่อ
```

**ห้ามใช้ `.isAdmin`** (ลบออกแล้ว) หรือเช็ค role โดยตรง.

## เหตุผลที่ไม่ expose isAdmin

pharmacist (role=`pharmacist`, state=`allow`) → `resolveCan` คืน `'inline'` แต่ `isAdmin` = false.
ถ้าใช้ `if (!isAdmin) setBusy(false)` จะหยุด pharmacist โดยไม่ควร — เป็น permission bug ที่ tsc/review จับยาก เพราะตรรกะ "ดูถูก" แต่ semantics ผิด.

## บริบทที่เปลี่ยน (เฟส 2 ระบบสิทธิ์ 2026-06-28)

11 จุด `run()` + 7 จุด `.isAdmin` migrate ทั้งหมด; SSOT hook = `src/hooks/useManagerOverride.ts`.

related: [[project_role_permissions]]
