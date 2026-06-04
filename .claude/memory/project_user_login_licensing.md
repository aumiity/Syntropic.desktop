---
name: project_user_login_licensing
description: User/Login + License/Activation initiative — 3-tier identity model, PIN-6 login, signed-token offline licensing; plans written, nothing built yet
metadata:
  type: project
---

**เริ่ม 2026-06-04 — plan เขียนแล้ว, ยังไม่ลงมือโค้ด.** งานเปิดระบบผู้ใช้/เข้าสู่ระบบ + การขาย/ป้องกันโปรแกรม

**โมเดล identity 3 ชั้น (เคลียร์ความสับสน "มีสอง user แยกยังไง"):**
- ชั้น A — **License/สิทธิ์ใช้โปรแกรม** (ผู้ขายคุม) = "ขายโปรแกรม"
- ชั้น B — **Setup ร้าน** (มีแล้ว, `SetupGate`)
- ชั้น C — **Login พนักงาน** (เจ้าของร้านคุม) = ตาราง `users` เดิม + People→StaffTab
- gate order: `License → Setup → Login → แอป` — แต่ละชั้นคนละ wrapper คนละไฟล์ อย่าปน
- **ไม่มี "สองตาราง user"** — พนักงาน = บัญชี login ตัวเดียวกัน แยกบทบาทด้วย `role` (admin/staff)

**Login (ชั้น C) — locked decisions:** PIN **6 หลัก ทุกคน** (ยืนยัน 2026-06-04, ไม่เอา password/hybrid), เลือกผู้ใช้→PinPad→auto-submit, คนเดียวข้ามหน้าเลือก, manager-override dialog (admin กด PIN รับรองงาน sensitive แทน logout), ล็อกหน้าจอไม่ล้าง cart. UI mirror `SetupWizard`. ต้องเพิ่ม primitive ใหม่ตัวเดียว `PinPad` (+ demo /theme). password ตอนนี้เก็บ **plaintext** ต้องเปลี่ยนเป็น hash ด้วย Node `crypto` scrypt (legacy plaintext fallback→upgrade). `auth:getCurrentUser` ตอนนี้ hardcode `staff@syntropic.local` ต้องแทนด้วย login จริง. ลบปุ่ม DEV สลับ role ใน `Finance.tsx`.

**License (ชั้น A):** signed **Ed25519 token** (Node crypto built-in, ห้าม npm install), ผูกเครื่อง (fingerprint 2-of-3 tolerance), ตรวจลายเซ็นในเครื่อง = **ขายออฟไลน์ 100%**, online เป็น background. expired/invalid = ล็อกทางเข้าแต่**ห้ามลบข้อมูล**. เริ่ม infra ศูนย์บาท (ผู้ขายเซ็นไฟล์เอง) → ค่อยอัปเป็น server/subscription. Private key ห้ามเข้า repo/แอป (แอปมีแค่ public key). เริ่ม **ขายขาด** ก่อน.

**เอกสาร:** `docs/plans/User_Login_System.md` (logic+phases), `docs/plans/Login_UI_Design.md` (shape brief, ผ่าน impeccable), `docs/plans/License_Activation_System.md`. ยังมี Open Questions ในแต่ละไฟล์ (auto-lock, grace days, per-เครื่อง/ร้าน ฯลฯ) รอยืนยันก่อน craft. ใช้ [[input-elevated-default-flip]] + dialog/button convention ตอนทำ UI.
