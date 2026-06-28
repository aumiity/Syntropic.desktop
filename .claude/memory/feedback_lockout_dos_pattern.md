---
name: feedback-lockout-dos-pattern
description: Security pitfall — เรียก recordFailure() ก่อน verify credential ใน override/verify path ทำให้ใครก็ได้ lock account เหยื่อโดยรู้แค่ userId
metadata:
  type: feedback
---

## กฎ

`recordFailure(userId)` ต้องเรียก **เฉพาะตอน wrong-password ของ user ที่ qualify แล้ว** — ไม่ใช่ก่อน หรือแทน credential check.

## เหตุผล

`lockout_attempts` / `lockout_until` ใน `users` table ใช้ร่วมกันระหว่าง `auth:login` และทุก endpoint ที่ verify รหัสผ่าน.
ถ้า endpoint ใด (เช่น `auth:verifyAdmin`, override dialog `permissions:verify`) เรียก `recordFailure(victimId)` ก่อนตรวจสอบ credential — ใครก็ตามที่รู้ `userId` ของเหยื่อสามารถยิง IPC loop แล้ว lock เหยื่อออกจากระบบได้ (lockout-DoS).

## Pattern ที่ถูก

```ts
// 1. ค้น user + ตรวจ role qualify → throw ทันทีถ้า fail (ไม่ record)
// 2. verifySecret(password, hash)
// 3. ถ้า password ผิด → recordFailure(userId)   // record เฉพาะตรงนี้
// 4. ถ้า lockout active → throw locked error (ก่อน verify secret)
```

ลำดับ: **exist → lockout-check → verify → record-failure-if-wrong**.

## บริบทที่เจอ

audit เฟส 2 (`permissions.ts` `listApprovers`/verify path); ตรวจสอบตอน priest review งานสิทธิ์ 2026-06-28.

related: [[project_role_permissions]] · [[project_user_login_licensing]]
