---
name: project_env_temp_humidity_log
description: บันทึกอุณหภูมิ–ความชื้น (GPP environmental log) — แท็บหลักของรายงาน route /reports/environment (ย้ายออกจากใต้ อย. 2026-07-08)
metadata:
  type: project
---

**DONE 2026-06-19 (tsc PASS; in-app click-test pending — 32-item checklist from hunter).** SSOT แผน = `docs/plans/Env_Temp_Humidity_Log.html` (Section B). ต่อยอดจาก [[project_fda_registers_redesign]] (ใช้ ReportPrintDialog + A4Sheet/a4.tsx ร่วม).

## REDESIGN 2 (2026-07-08) — table → DASHBOARD (กราฟ + ปฏิทิน heatmap) (tsc PASS renderer+node; in-app/visual pending)

เจ้าของยังไม่ถูกใจตาราง (iteration 3) → เปลี่ยนหน้าจอหลักเป็น **dashboard** (ตารางบนจอถูกถอดทั้งหมด; modal day-editor + IPC saveDay จาก REDESIGN 1 ยังใช้อยู่):
- **MetricStrip** 4-5 KPI: อุณหภูมิ/ความชื้น/ตู้เย็นเฉลี่ย (ตู้เย็นเฉพาะ fridgeOn) · บันทึกแล้ว X/Y วัน · หลุดเกณฑ์ N ครั้ง
- **กราฟเส้น 2-3 อัน** (`EnvTrendChart` ใหม่ `src/components/ui/charts/env-trend-chart.tsx`): อุณหภูมิ / ความชื้น / ตู้เย็น (แยกสเกล = ไม่ dual-axis). ComposedChart: Area เส้นค่าเฉลี่ย/วัน + `ReferenceLine` เกณฑ์แดง (temp 30 / humid 75) หรือ `ReferenceArea` แถบเขียว 2-8 (ตู้เย็น) + **จุดหลุดเกณฑ์สีแดง** (Line stroke=transparent, breach point = max หรือค่าไกลจาก mid 5 ตู้เย็น)
- **ปฏิทิน heatmap** (inline ใน EnvLog, SectionCard): 7 คอลัมน์ อา-ส, สีตามสถานะ (เขียว=ปกติ/แดง=หลุด/เทา=ยังไม่บันทึก), **คลิกวัน → openDayEditor** (ทางเข้าแก้ไขแทนตาราง); firstWeekday = `new Date(year,month-1,1).getDay()`
- สี categorical (validate ผ่าน dataviz CVD 75.7): ร้าน=`--primary`(teal), สำรอง=`--violet`, ตู้เย็น=`--info`; เกณฑ์/หลุด=`--destructive`, แถบ=`--success` — semantic token ล้วน (chroma-floor teal เตือนแต่ยึด brand ตาม trend-chart.tsx)
- ทุกอย่างคำนวณ client-side จาก rowMap ใน memo `dash` (ไม่เพิ่ม backend read); **print A4/measure/blank/generate/toggle ไม่แตะเลย**
- recharts เข้าผ่าน component (ไม่ import recharts ตรงใน EnvLog) — สอดคล้องกฎ [[project_dashboard_rebuild]]
- **PROMOTED เป็นแท็บหลัก 2026-07-08**: ย้ายออกจาก sub-tab อย. (dashboard คนละพวกกับเอกสารพิมพ์ ข.ย.9/10/11) → route `/reports/environment` (เดิม `/reports/fda/environment`); เพิ่มแท็บใน `Reports/index.tsx` TABS (หลัง fda ก่อน export) + resolveTab; ถอดออกจาก `FdaReports.tsx` FORMS/resolveForm; EnvLog เปลี่ยน context `FdaOutletContext`→`ReportsOutletContext` (`setActions`→`setToolbar`); content wrapper ใน Reports layout ให้ environment = `pt-3 flex-1 min-h-0 flex flex-col` (scroll ภายในเหมือน fda)

## REDESIGN 2026-07-07 — inline grid → read-only table + modal day-editor (tsc PASS renderer+node; in-app pending)

เจ้าของขอเลิกกรอก inline. ตอนนี้ **ตารางหลัก = read-only** (ค่าเต็มทุกช่อง, ผิดเกณฑ์ = `bg-destructive-soft text-destructive`, ว่าง = `–` muted) + คอลัมน์ท้าย **ปุ่มแก้ไข** (`Pencil`, `size="icon-lg" variant="elevated"`) → เปิด **modal แก้ทั้งวัน** (3 ช่วง × จุดวัดที่เปิด + หมายเหตุ 1 ช่อง; grid `gridTemplateColumns: 4.5rem repeat(N,…)`; Enter=บันทึก; h-[480px] divided size=2xl).
- **ถอดทิ้ง**: `cellText`/`buildCellText`/`cellKey`/`saveCell` (กลไก CONTROLLED-input Map เดิมใน "Rules ที่ bake ไว้" ด้านล่าง — **ตอนนี้ใช้เฉพาะกับ spreadsheet-grid อื่น ไม่ใช่หน้านี้แล้ว**). draft ของ modal seed จาก rowMap ตอนเปิด, ส่ง raw string ให้ backend coerce.
- **IPC ใหม่ `env:saveDay`** (`electron/ipc/env.ts` + preload): upsert 3 period + note ใน 1 transaction; coercion เดียวกับ saveCell (blank/NaN/0→NULL, note trim→NULL); แตะเฉพาะ field ที่ modal ส่ง (disabled zone ไม่โดนล้าง); period ที่ค่า null หมด = skip เว้นแต่ row มีอยู่แล้ว (ให้ clear ได้); regex guard log_date; ungated (operational เหมือน saveCell). `env:saveCell` เดิมยังอยู่ (ไม่มี caller ในหน้านี้แล้ว แต่คงไว้).
- คงครบ: print A4/measure/pagination, ฟอร์มเปล่า, generateMonth, toggle จุดวัด, outOfRangeCount, month picker. rowMap คือ SSOT เดียวของ view หลังถอด cellText.

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
