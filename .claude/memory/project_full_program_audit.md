# Full Program Audit — แผนพร้อมรัน, PARKED

**สถานะ: PLANNED 2026-06-10, PARKED — ผู้ใช้ทำงาน VAT ก่อน ([[project_vat_phasing]] Phase 2-3) แล้วค่อยกลับมารันทีเดียว. อย่าเริ่ม audit เชิงรุก — รอผู้ใช้สั่ง resume.**

## แผน = SSOT

`docs/plans/Full_Program_Audit.html` — Section B คือแผนปฏิบัติ (ผ่าน audit แผน 2 รอบ: 1 P0, 6 P1, 15 P2 แก้ครบแล้ว)

## หัวใจของแผน

- Audit ทั้งโปรแกรม ~45K LOC, 4 มิติ: เงิน / สต็อก+FEFO / security / คุณภาพโค้ด + UI consistency
- **11 รอบ**: R0 เตรียม → R1 เงิน → R2 สต็อก → R3 security → R4 คุณภาพโค้ด → R5-R9 UI ตามหน้า (POS→Products→Purchase/People→Manage/Reports→Settings/primitives) → R10 ปิดรายงาน — ~7-8 เซสชัน
- **Report-only** — ไม่แก้โค้ดในรอบตรวจ; findings จัด P0-P3 ลง `docs/audits/full-program/R<n>-*.md` + `MASTER.md`; จบ R10 เสนอ shortlist ให้ผู้ใช้เลือกแก้
- Agents ขนานรอบละ 2-3 ตัว, orchestrator ยืนยัน file:line เองก่อนใส่ MASTER, ของซ้ำ backlog เดิม tag `KNOWN-TRACKED`
- ข้าม Quotation/Theme/CSS — ยกเว้นมิติ security ห้ามข้าม quotation (route+handler ยังลงทะเบียน)

## กับดักที่ audit แผนเจอ (ห้ามลืมตอนรัน)

- **P0:** `npm run dev` → vite-plugin-electron auto-spawn Electron บน userData **จริง** — ต้องปิดหน้าต่างที่เด้งเองทิ้ง, ใช้เฉพาะหน้าต่างจาก `npx electron --user-data-dir=<tmp> .` (flag ก่อน `.`) ที่มี marker `[AUDIT-TMP]`
- DB สำเนาต้องวางที่ `<tmp>/database/syntropic.db` (มี subfolder) + copy ทั้ง `.db`/`-wal`/`-shm` ไม่งั้น seed เปล่าเงียบ ๆ
- ทำหมันสำเนาก่อนเปิด: `backup_settings.backup_dir=NULL, auto_enabled=0` (กัน on-quit backup ทับของจริง) + shop_name marker
- ตอน resume: เริ่ม R0 ตาม Section B, อัปเดตไฟล์ memory นี้ว่าถึงรอบไหนทุกครั้งที่จบรอบ
