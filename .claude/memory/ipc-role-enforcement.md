---
name: ipc-role-enforcement
description: Main-side session + IPC role enforcement pattern — requireAdmin, manager-override, did-start-navigation guard, DeadStock cost-strip
metadata:
  type: reference
---

Pattern เพิ่มเมื่อ Phase 3 ของ [[project_user_login_licensing]] (2026-06-05).

## Main-side session (`electron/auth/session.ts`)

`Map<webContents.id, {userId, role}>` in-memory (ไม่ persist — ตายทุก boot โดยเจตนา).

Key exports:
- `bindSession(e, {userId, role})` — เรียกหลัง `auth:login` สำเร็จ
- `clearSession(e)` — เรียกใน `auth:logout` handler
- `clearSessionById(id)` — เรียกตอน `webContents` `destroyed`
- `getSessionRole(e)` → `'admin'|'staff'|null`
- `requireAdmin(e, override?)` → throws `{code:'FORBIDDEN'}` หรือ `{code:'UNAUTHORIZED'}` ถ้าไม่ผ่าน

## did-start-navigation guard — ข้อควรระวัง

```ts
webContents.on('did-start-navigation', (_e, _url, isMainFrame, isSameDocument) => {
  if (isMainFrame && !isSameDocument) clearSessionById(wc.id)
})
```

**ต้อง gate ด้วย `!isSameDocument`** — HashRouter เปลี่ยน route = same-document navigation → ถ้าไม่ gate จะล้าง session กลางแอปทำให้ role พังทันที. `did-finish-load` อย่าใช้แทน (ยิงหลัง hard reload เท่านั้น ไม่ครอบ SPA navigation).

## IPC handler pattern

```ts
// admin-only ซ่อนสนิท
ipcMain.handle('expenses:create', async (e, data) => {
  requireAdmin(e)          // throws FORBIDDEN ก่อนถึง logic
  ...
})

// admin-only + override ได้ (staff กด → dialog → แนบ credential)
ipcMain.handle('reports:voidSale', async (e, {id, override}) => {
  requireAdmin(e, override)
  ...
})
```

`requireAdmin` signature: `(e: IpcMainInvokeEvent, override?: {userId: string, password: string}) => void`  
Override flow: session ไม่ใช่ admin แต่มี override → query admin row (ต้อง `role==='admin'`) → verifySecret → lockout เดียวกับ login → ผ่าน/โยน error

## usePermission hook (renderer — UX เท่านั้น, ไม่ใช่ security)

`src/hooks/usePermission.ts` → `{role, isAdmin}` จาก userStore.  
R1: ซ่อนปุ่ม/tab ฝั่ง renderer = UX convenience เท่านั้น; security จริงต้องอยู่ที่ `requireAdmin` ใน main เสมอ. อย่าพึ่ง UX gate แทน main-side check.

## useManagerOverride hook + dialog

`src/hooks/useManagerOverride.tsx` + `src/components/ui/manager-override-dialog.tsx`

```tsx
const { run, dialog, isAdmin } = useManagerOverride()

// admin = รันตรง (ไม่เปิด dialog)
// staff = เปิด dialog ให้ admin ใส่ credential → แนบไปกับ IPC call
await run(async (cred) => window.api.reports.voidSale({ id, override: cred }))
```

Inline credential (ไม่มี token leak) — credential ใช้ครั้งเดียวแนบไปกับ IPC แล้วทิ้ง ไม่เก็บใน store/state.

## DeadStock cost-strip (R1 backend variant)

`reports:inactiveProducts` — คืน `cost_value: null` เมื่อ `getSessionRole(e) !== 'admin'` ฝั่ง main (กัน DevTools leak).  
DeadStock.tsx — ซ่อน column + footer ต้นทุนเมื่อ `!isAdmin` ด้วย colSpan dynamic.  
Pattern นี้ใช้เมื่อ: ต้องการซ่อนตัวเลขจาก staff แต่ยังให้เห็นแถวข้อมูล (ต่างจาก ซ่อนทั้ง endpoint).
