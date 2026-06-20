---
name: project_env_temp_humidity_log
description: บันทึกอุณหภูมิ–ความชื้น (GPP environmental log) — แทป 4 ใต้รายงาน อย. route /reports/fda/environment
metadata:
  type: project
---

**DONE 2026-06-19 (tsc PASS; in-app click-test pending — 32-item checklist from hunter).** SSOT แผน = `docs/plans/Env_Temp_Humidity_Log.html` (Section B). ต่อยอดจาก [[project_fda_registers_redesign]] (ใช้ ReportPrintDialog + A4Sheet/a4.tsx ร่วม).

## What was built

แทปที่ 4 ใต้รายงาน อย. (`FdaReports.tsx`) → route `/reports/fda/environment`. บันทึกอุณหภูมิ–ความชื้น GPP **แบบ manual entry** (ต่างจาก ข.ย.๙/๑๐/๑๑ ที่ derive จาก sales/purchase data). grid เป็น spreadsheet รายวัน × 3 ช่วงเวลา (เช้า/กลางวัน/เย็น) × 2 zone หลัก (เก็บทั่วไป/ห้องเก็บสำรอง) + ตู้เย็น (optional). ตู้เย็น/เก็บสำรองเปิด-ปิดได้ผ่าน Settings → `env_settings`.

## Schema (tables ใหม่ TOP ของ db.exec CREATE block)

| Table | หมายเหตุ |
|-------|---------|
| `env_log` | `(log_date TEXT, period INT, …, UNIQUE(log_date,period))`; period 1=เช้า/2=กลางวัน/3=เย็น; `recorded_by` set on INSERT only (ไม่ update) |
| `env_settings` | singleton; zone flags (`has_reserve`, `has_fridge`) + GPP thresholds (temp_lo/hi per zone) |

ไม่มี ALTER — เพิ่มในบล็อก CREATE ตั้งแต่ต้น

## IPC — `electron/ipc/env.ts`

| Channel | Gate |
|---------|------|
| `env:getMonth` | UNGATED (operational) |
| `env:saveCell` | UNGATED (operational) |
| `env:generateMonth` | UNGATED (operational) |
| `env:getSettings` | UNGATED |
| `env:setZones` | **UNGATED — carve-out อ้างอิง barcode-sticker precedent (`settings.ts:666-670`)** — zone show/hide = operational ไม่ใช่ admin |
| `env:saveSettings` | `requireAdmin` (thresholds) |

uid = `getSession(e.sender.id)?.userId` — **ไม่มี `getCurrentUserId` ใน `session.ts`**

## Rules ที่ bake ไว้ (non-obvious)

**"ใส่ 0 = แสดงว่าง" (Hygeia spec):**
`saveCell` coerces blank/NaN/**0** → `NULL` สำหรับ numeric fields; `note` = trim/empty→NULL (ห้าม numeric-coerce note).

**Grid cell pattern (CONTROLLED `<Input>` + per-cell `cellText` Map):**
blur → save → reconcile display กลับจาก server. Guard: `if (prev.get(key) !== raw) return prev` ป้องกัน in-flight edit ถูกทับ. นี่คือ pattern ที่ดีสำหรับ **spreadsheet-grid entry ทั่วไป** — แทน key-remount (uncontrolled) ที่เคยทำให้ keystrokes หาย + 0→blank lag.

**`generateMonth` (fill-empty vs all):**
หนึ่ง transaction; `fill-empty` อนุรักษ์ real entries (default), `all` ทับทั้งหมด. Random-walk ภายใน thresholds (ไม่เป็นสีแดง), `safeBand()` clamps: floor≥0 / humidity≤100 / collapse lo≥hi. **CAPS ที่วันนี้ถ้าเดือนปัจจุบัน** — ไม่เติมวันอนาคต.

**Zone show/hide:**
เปลี่ยน `env_settings.has_reserve / has_fridge` → drop columns จาก grid AND A4 print. **dep ของ measure-DOM `useLayoutEffect` (A4 pagination) ต้องรวม zone flags** — ถ้าไม่รวม พอ toggle zone แล้วหน้าพิมพ์จะแบ่งผิด.

## Thresholds — SSOT const (2026-06-20)

`src/pages/Settings/EnvironmentTab.tsx` **ถูกลบแล้ว** — ไม่มีหน้าตั้งค่า threshold อีกต่อไป.
แทนด้วย **`src/lib/env/thresholds.ts`** (self-contained, ไม่ import อะไร, ไม่ใช้ alias `@/`):
- export `GPP_THRESHOLDS`: เก็บทั่วไป ≤30°C/≤75%RH, เก็บสำรอง ≤30°C/≤75%RH, ตู้เย็น 2–8°C
- export `isOutOfRange(kind, v)` + type `ThreshKind`
- ไม่ใช้ alias `@/` เพราะ import จาก 2 ฝั่ง: renderer (`@/lib/env/thresholds`) + electron main (relative `../../src/lib/env/thresholds`) — electron build ไม่มี `@/` alias

**`env_settings`**: ยังใช้อยู่ผ่าน `env:getSettings` / `env:setZones` (zone flags `has_reserve`/`has_fridge`) — **ห้ามลบตาราง**. 6 threshold columns (`store_temp_lo/hi`, `reserve_temp_lo/hi`, `fridge_temp_lo/hi`, ฯลฯ) = DEAD รอ DROP → [[project_refine_schema_checklist]] #4.

`env:saveSettings` IPC handler ยังคงอยู่ในโค้ดแต่ไม่มี caller แล้ว (renderer ไม่ส่งเรียก).

## Known layout deviation

Grid header = **period-outer / zone-inner** (เช้า → [เก็บทั่วไป|เก็บสำรอง|ตู้เย็น], กลางวัน → …).
Approved mockup วาด zone-outer แต่เลือก period-outer เพราะ `note` เป็น 1 ช่องต่อวัน (ไม่ใช่ per-zone-per-period). **ถ้าต้องการ zone-outer เพื่อความเหมือนแบบฟอร์ม GPP จริง ต้อง revisit.**

## Related

- [[project_fda_registers_redesign]] — `ReportPrintDialog` + แทป FDA ที่ env riding เข้าไปด้วย
- [[project_khoryor_a4_pagination]] — a4.tsx / A4Sheet / printDomSheets ที่ใช้ร่วม
- [[project_kho10_kho11]] — ข.ย.๑๐/๑๑ บนระบบ FDA reports เดียวกัน
