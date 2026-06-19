# Task tracking = `docs/NOTE.html` (custom clean tool)

**SSOT ของ backlog งานพัฒนา = `docs/NOTE.html` + `docs/NOTE.data.js`** (เครื่องมือ task board ทำเองแบบ self-contained, โทนขาว-ม่วง, 2 คอลัมน์ เสร็จแล้ว/กำลังทำ, มี undo + flash)

- `NOTE.html` อ่าน `NOTE.data.js` อัตโนมัติตอนเปิด (ผ่าน `<script src>` — ทำงานบน `file://` ได้)
- แก้ในเครื่อง → autosave localStorage; **sync ข้ามเครื่อง = กดปุ่ม "ส่งออก NOTE.data.js" → วางทับใน `docs/` → git commit + push → เครื่องอื่น pull แล้วเปิด NOTE.html** (timestamp ใหม่กว่าชนะ)
- `docs/NOTE.md` = ไฟล์ลิสต์งานเดิม (markdown 🟢/🟡) ยังเก็บไว้

## ▶️ แผนล่าสุด: ย้ายบอร์ดไปเซิร์ฟเวอร์บ้าน (2026-06-19)
เจ้าของจะย้าย task board ไปรันบน **เว็บเซิร์ฟเวอร์ที่บ้าน** (ออนไลน์ 24/7 ผ่าน Tailscale `http://100.94.208.11:8088` — มีเว็บค้นหาสินค้าอยู่แล้ว) ที่ path `/note` → **เซิร์ฟเวอร์ = SSOT, ไม่ต้อง git/sync อีก**. เตรียม prompt handoff ไว้ที่ **`docs/NOTE_SERVER_HANDOFF.md`** (ส่งให้เจ้าของพร้อม NOTE.html + NOTE.data.js เอาไปให้ Claude บนเซิร์ฟเวอร์ทำต่อ). **ฝั่งเดสก์ท็อปนี้ไม่ต้องทำต่อ** — งานอยู่ที่เครื่องเซิร์ฟเวอร์ (เราอ่าน/แก้ของบนนั้นไม่ได้)

## ⚠️ เคยลอง GitHub Issues/Projects แล้ว "เลิก" (2026-06-19)
ลองย้าย backlog ขึ้น GitHub Issues + Project board (repo PUBLIC, label ม่วง 8 หมวด, open=กำลังทำ/closed=เสร็จแล้ว) — **เจ้าของลองแล้วไม่ชอบ: "ตัวอักษรเยอะ ยุ่งเหยิง ไม่คลีนเหมือนทำเอง"** → revert กลับมา `NOTE.html` และ **ลบ board + issues + labels ออกจาก GitHub หมดแล้ว**

**How to apply:** งาน backlog/TODO → ใช้ `docs/NOTE.html` (หรือแก้ `NOTE.data.js` ตรงๆ ก็ได้). **อย่าเสนอย้ายไป GitHub Issues/Projects หรือ Notion อีก** — เจ้าของเลือกเครื่องมือ in-repo คลีนๆ ที่ทำเองแล้ว
