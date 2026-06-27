---
name: project_role_permissions
description: ระบบสิทธิ์ตาม role (owner/pharmacist/staff, 3 สถานะ) — แผนผ่าน audit 4 รอบ พร้อมลงมือเฟส 1
metadata:
  type: project
---

**PLANNED 2026-06-28 — แผนเสร็จ ผ่าน audit 4 รอบ (CLEAN) ยังไม่เริ่ม execute. รออนุญาตเริ่มเฟส 1.**

เปลี่ยนสิทธิ์จากฮาร์ดโค้ด `requireAdmin()` (62 จุดใน electron/ipc) → data-driven ตั้งค่าได้.

**SSOT แผน:** `docs/plans/Role_Permissions.html` (Section B = executable). Design spec: `docs/superpowers/specs/2026-06-27-role-permissions-design.md`. แผน supersede spec ตรง export key.

**ตัดสินแล้ว:**
- 3 role ตายตัว: `owner` (เจ้าของร้าน, เต็ม+ล็อก, = `admin` เดิม rename) · `pharmacist` (ใหม่) · `staff` (พนักงาน). ไม่มี CRUD role.
- 3 สถานะต่อ (role × permission): `off`/`allow`/`override`. สิทธิ์ชนิด view มีแค่ off/allow.
- 15 permission keys ใน registry ใหม่ `src/lib/permissions/registry.ts` (pure, electron import ได้). DB ตารางใหม่ `role_permissions`.
- enforcement ใหม่ `electron/auth/permissions.ts` → `requirePermission(e,key,override?)` + `stateFor`. renderer `src/hooks/useCan.ts`.
- override approver = ใครก็ได้ที่ role มีสิทธิ์นั้น=allow (หรือ owner). กัน self-approval.

**3 เฟส (execute ทีละเฟส มี checkpoint tsc):** 1=foundation (registry+DB+seed+rename admin→owner+People 3 role+requirePermission) · 2=swap 62 gate + useCan + override hook (11 run()+7 .isAdmin, permKey required) · 3=Settings matrix tab "สิทธิ์การใช้งาน" (owner-only).

**กับดักที่ audit จับ (อยู่ในแผนแล้ว):** `schema.ts:1095 base='admin'`=username อย่าแตะ; `seed.ts:78` 'admin' 2 ตัว เปลี่ยนแค่ตัวหลัง(role); จุดเทียบ 'admin' กระจาย รวม object-key (ROLE_LABEL, People ROLES:675); กัน owner demote ตัวเอง 2 ชั้น (renderer lock + people.ts guard); fail-safe unknown key→off.

related: [[ipc-role-enforcement]] · [[project_user_login_licensing]]
