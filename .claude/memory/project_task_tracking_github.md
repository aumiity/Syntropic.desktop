# Task tracking = Veriton home server (`/note`)

**SSOT ของ backlog งานพัฒนา = task board บนเว็บเซิร์ฟเวอร์ที่บ้าน (Veriton)** ออนไลน์ 24/7 ผ่าน Tailscale ที่ **`http://100.94.208.11:8088/note`** (โทนขาว-ม่วง, 2 คอลัมน์ เสร็จแล้ว/กำลังทำ, undo + flash) — **เซิร์ฟเวอร์ = SSOT, ไม่ต้อง git/sync**. เปิดจากเครื่องไหน/มือถือผ่าน Tailscale ก็เห็นชุดเดียวกัน.

## ✅ ย้ายขึ้นเซิร์ฟเวอร์แล้ว + ลบไฟล์ local (2026-07-07)
เดิม board เป็นไฟล์ใน repo (`docs/NOTE.html` + `NOTE.data.js` + `NOTE.md` + `NOTE_SERVER_HANDOFF.md`). เจ้าของ**ย้ายขึ้น Veriton สำเร็จแล้ว** → **ลบไฟล์ทั้ง 4 ออกจาก repo แล้ว** (git rm). อย่ามองหาไฟล์ NOTE ใน `docs/` อีก — มันไม่มีแล้ว. อยากดู/แก้ backlog → เปิด URL ข้างบน (เราอ่าน/แก้จากฝั่งเดสก์ท็อปนี้ผ่านโค้ดไม่ได้ — งานอยู่บนเซิร์ฟเวอร์).

## ⚠️ เคยลอง GitHub Issues/Projects แล้ว "เลิก" (2026-06-19)
ลองย้าย backlog ขึ้น GitHub Issues + Project board — **เจ้าของไม่ชอบ: "ตัวอักษรเยอะ ยุ่งเหยิง ไม่คลีน"** → revert + ลบ board/issues/labels ออกจาก GitHub หมดแล้ว.

**How to apply:** อยากรู้ว่างานเหลืออะไร/backlog → ชี้ไปที่ `http://100.94.208.11:8088/note` (Veriton). **อย่าเสนอ GitHub Issues/Projects หรือ Notion** และ **อย่าพยายามสร้างไฟล์ NOTE.* ใน repo กลับมา** — SSOT คือเซิร์ฟเวอร์.
