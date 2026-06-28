---
name: project_role_permissions
description: ระบบสิทธิ์ตาม role (owner/pharmacist/staff, 3 สถานะ) — แผนผ่าน audit 4 รอบ พร้อมลงมือเฟส 1
metadata:
  type: project
---

**PHASE 1+2 DONE 2026-06-28 (tsc PASS; in-app verify pending). PHASE 3 (matrix UI) รอเริ่ม.** แผนผ่าน audit 4 รอบ (CLEAN).

**เฟส 2 ลงแล้ว (swap gates + renderer fine-grained):** สลับ **62 requireAdmin→requirePermission** ครบ (grep requireAdmin ใน electron/ipc = 0) ด้วย script ตาม line-map (products7/purchase1/reports12/settings20/expenses8/backup5/people4/exports4 + auth verifyAdmin→product.editPrice); แต่ละไฟล์เปลี่ยน import เป็น `../auth/permissions`. cost-strip 3 จุด (reports:955, exports:350/403) → `stateFor(role,'cost.view')==='allow'`. **2.1b**: downgradeFromVat ตัด `role!=='owner'` ที่ :560 เหลือ verify รหัส session user (vat.toggle คุม role แล้ว). **2.2 override refactor**: ใหม่ `electron/ipc/permissions.ts` (`permissions:listApprovers({permKey})` = active users role owner|stateFor allow) + register main + preload `window.api.permissions`; `manager-override-dialog` รับ prop `permKey` + ใช้ listApprovers (เลิก listLoginUsers+filter) + copy "ต้องขออนุมัติ/ผู้อนุมัติ"; **`useManagerOverride` รื้อ: `run(action,{permKey required})` คืน `'inline'|'prompt'|'noop'` (resolveCan ใน useCan.ts), เลิก expose isAdmin**; ทุก consumer (11 run + 7 isAdmin) เปลี่ยน `if(!x.isAdmin)setBusy` → `if(mode!=='inline')setBusy`. **2.3 renderer gates** (เลิก isAdmin→useCan): Sidebar(/reports=report.finance, /settings=settings.manage), Layout:42(report.finance), Manage/index(expenses=expense.manage, scrollPage=report.finance), DeadStock(cost.view), Dashboard(report.finance), VatReport(report.vat), People(staff tab=user.manage), Sales finance panel(report.finance), ExportHub(per-card: sales/purchases=export.finance, expenses=expense.manage, vat=report.vat, fin fetch=report.finance). usePermission เหลือใช้แค่ Sidebar (owner fallback) + hook เอง. **requireAdmin def ยังอยู่ใน session.ts — ลบเฟส 3.**

**เฟส 1 ลงแล้ว (foundation):** `src/lib/permissions/registry.ts` (15 keys) · ตาราง `role_permissions` (schema.ts) + seed defaults (idempotent ก่อน userCount guard) · `electron/auth/permissions.ts` (`stateFor`/`requirePermission`/`permissionSnapshot`) · rename role `admin`→`owner` (seed.ts:78 ตัวหลัง + session.ts:44/:60 + auth.ts devLogin + settings.ts:559) · **+ migration กันDBเก่า: `UPDATE users SET role='owner' WHERE email='admin@syntropic.local' AND role='admin'` (schema.ts ~1131)** · login/devLogin/devSetRole คืน `permissions` snapshot · renderer: userStore.CurrentUser.permissions, usePermission.isAdmin=`owner`, ใหม่ `src/hooks/useCan.ts` · People form 3 role + lock owner Select + people.ts guard (saveStaff role + setStaffStatus กัน demote/disable owner ที่ผูกอีเมล) · labels: SidebarUser RoleBadge+ROLE_LABEL, People ROLES, LoginScreen type+PREVIEW_USERS+owner-first sort, TitleBar DEV switch 3-way owner→pharmacist→staff (ดึง permissions กลับ). **interim-safe (กันพังช่วงคาบเฟส 1↔2):** cost-strip reports.ts:955/exports.ts:350,403 + manager-override-dialog filter → rename `'admin'`→`'owner'` ชั่วคราว (เฟส 2 จะแปลงเป็น stateFor/listApprovers). requireAdmin ยังอยู่ (ลบเฟส 3).

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
