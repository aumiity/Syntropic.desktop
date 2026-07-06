---
name: project_cash_drawer
description: Cash-drawer (ลิ้นชักเก็บเงิน) serial/COM open — PowerShell spawn, no native module, config in receipt_settings
metadata:
  type: project
---

**DONE 2026-07-06 (tsc PASS; e2e 13/13 macOS; Windows-serial verify PENDING)** — ปุ่ม "เปิดลิ้นชัก" + F10 ในหน้า POS ต่อเข้าลิ้นชักจริงที่เสียบ serial/COM port ตรงกับ PC (แยกจากเครื่องพิมพ์ — เครื่องพิมพ์ยังพิมพ์ผ่านไดรเวอร์ OS ปกติ, ไม่เกี่ยว TCP 9100 เดิม).

**Follow-up DONE 2026-07-06 (tsc PASS; e2e 14/14 macOS)** — เพิ่มออปชัน "เปิดลิ้นชักอัตโนมัติหลังรับเงินสด": คอลัมน์ที่ 5 `cash_drawer_auto_open` INTEGER DEFAULT 0 (CREATE+ALTER migration), SettingRow checkbox ใหม่ใต้แถว master-enable ใน `ReceiptSettingsTab.tsx`. **Decision:** เด้งเฉพาะบิลที่มี `cash_amount > 0` — บัตร/โอนล้วนไม่เด้ง (เลือกโดยเจ้าของ); ผูกที่ POS หลัง `saveBill` สำเร็จ เรียก `openCashDrawer()` แบบ fire-and-forget **ไม่มี toast** (ไม่ส่ง arg → handler เช็ค master `cash_drawer_enabled` เอง — auto_open=1 แต่ master ปิดอยู่ = no-op เงียบ ไม่ error).

**สถาปัตยกรรม — จงใจไม่ใช้ native module:** `serialport`/`node-hid` จะพัง prebuilt binary ของ better-sqlite3 ตามกฏ CLAUDE.md ("ห้าม `npm install` ตรงๆ") จึงใช้ **PowerShell ในตัว Windows** แทน — Electron main สั่ง `child_process.spawn('powershell.exe', ...)` เขียนไบต์ลง COM port ผ่าน `System.IO.Ports.SerialPort` ของ .NET. Pattern นี้ reusable สำหรับ hardware อื่นที่ต้องพูด serial ในอนาคต — อย่ารีบเพิ่ม native module ก่อนเช็คว่า PowerShell ทำได้ไหม.

**Config เก็บใน `receipt_settings` เดิม** (ไม่สร้างตารางใหม่) 5 คอลัมน์: `cash_drawer_enabled` / `cash_drawer_port` / `cash_drawer_baud` / `cash_drawer_open_code` (default hex `1B 70 00 19 FA`) / `cash_drawer_auto_open` (default 0). ผลคือ get/save + allow-list (dynamic SQL) ของ receipt_settings เดิมทำงานได้ฟรีทันที ไม่ต้องเพิ่ม handler ใหม่สำหรับ config.

**IPC:** `printer:listSerialPorts` (PowerShell `[System.IO.Ports.SerialPort]::GetPortNames()`; guard ไม่ใช่ win32 → คืน `[]`), `printer:openCashDrawer` rewritten เป็น serial (อ่าน config เอง, รับ override arg จากปุ่ม "ทดสอบเปิดลิ้นชัก", guard win32). ทั้งสอง handler **ต้องไม่มี `requirePermission`** — POS ทุก role (owner/pharmacist/staff) ต้องเปิดลิ้นชักได้ระหว่างขาย; มีแค่การ save config ผ่าน `saveReceiptSettings` เดิมที่เป็น admin-gated.

**PowerShell injection guard (สำคัญ):** ก่อน interpolate ค่าใดๆ เข้า `-Command` string — port ต้องผ่าน `/^COM\d+$/`, baud ต้องเป็น number, ไบต์ต้องเป็นตัวเลขล้วน. ห้าม interpolate string ดิบจาก DB/user เข้าไปตรงๆ.

**UI:** SectionCard "ลิ้นชักเก็บเงิน" ใน Settings › เครื่องพิมพ์ › ใบเสร็จ (`ReceiptSettingsTab.tsx`) — checkbox master-enable (`SettingRow`) + SettingRow checkbox auto-open (ใต้ master) + Select พอร์ต (merge saved port เข้า options กัน trigger ว่างถ้าพอร์ตหายไปจากเครื่อง) + baud Select + hex Input + ปุ่มทดสอบ.

**กับดัก/insight:**
- **`cash_drawer_enabled` = สวิตช์เปิดใช้งานปุ่ม/F10 + เงื่อนไขจำเป็นของ auto-open** (auto_open=1 แต่ master=0 → ไม่เด้ง, handler เช็ค master เองไม่ต้องเช็คซ้ำฝั่ง POS) ระวังสับสนตอนอ่าน label ทั้งสองคอลัมน์
- macOS/non-Windows: ปุ่มทดสอบ/F10 คืนข้อความ "ลิ้นชักรองรับเฉพาะ Windows" + toast แทนที่จะ silent fail — ถูก platform guard ดักไว้ตั้งแต่ต้น (regex guard เลยยังไม่ได้ทดสอบจริงบน mac); auto-open หลัง saveBill เป็น fire-and-forget ไม่มี toast เลย (ไม่รบกวน flow ขาย ต่างจากปุ่ม/F10 ที่ user กดเอง)

**PENDING — ต้องทำบน PC Windows จริง:** `listSerialPorts` เรียก PowerShell จริงขึ้น dropdown, `openCashDrawer` เปิด COM จริงส่งไบต์จริง (แนะนำ com0com สร้าง COM คู่จำลอง + listener ดักไบต์ = ทดสอบได้โดยไม่ต้องมีลิ้นชักจริง), regex guard กับ input จริง, กด F10 ให้ลิ้นชักเด้งจริง.

Relates to [[project_printer_settings]] (เครื่องพิมพ์ hub เดิม, เป็นคนละ subsystem — printer=ใบพิมพ์, นี่=ฮาร์ดแวร์ลิ้นชักแยก).
