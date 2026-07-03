---
name: project_expiry_exclusive_bands
description: หน้าใกล้หมดอายุ (Manage/Expiry) ใช้ช่วงแยกไม่ทับ (exclusive bands) ไม่ใช่แบบสะสมแล้ว
metadata:
  type: project
---

**DONE 2026-07-03 (tsc PASS; click-test pending)** — ตัวกรอง/การ์ดนับของหน้า `src/pages/Manage/Expiry.tsx` เปลี่ยนจาก **cumulative** (≤30 รวมของหมดอายุ, ≤180 รวมทุกอย่าง — ซ้อนทับกัน) เป็น **exclusive bands** (แต่ละช่วงเป็นคนละคนละหน้าต่าง ไม่ทับกัน):

| การ์ด (key) | ช่วง |
|-----|------|
| หมดอายุแล้ว (`expired`) | `days < 0` |
| 0–30 วัน (`30`) | `0 ≤ days ≤ 30` |
| 31–90 วัน (`90`) | `31 ≤ days ≤ 90` |
| 91–180 วัน (`180`) | `91 ≤ days ≤ 180` |

- **SSOT = helper `expiryBandSql(band, col='pl.expiry_date')`** exported จาก `electron/ipc/reports.ts` — คืน SQL literal ล้วน (ไม่มี bound param) ใช้ได้ทั้ง `WHERE` (row filter) และ `SUM(CASE …)` (counts) เลยกัน drift. numeric key = ขอบบนของช่วงเป็นวัน, ขอบล่าง = ขอบบนของช่วงก่อนหน้า (exclusive).
- `electron/ipc/exports.ts` (`export:expiry`) import helper ตัวเดียวกัน → Excel export ตรงกับหน้าจอ. **ถ้าจะปรับขอบช่วง แก้ที่ helper ที่เดียว** อย่าไปแก้ inline.
- default filter เปิดหน้า = `30` (ช่วง 0–30 วัน = ด่วนสุดที่ยังขายได้) ไม่ใช่ `90` เดิม.
- FilterType คงเดิม `'expired' | 30 | 90 | 180` — ค่าคือ label ของ band ไม่ใช่ upper-bound แบบสะสมอีกต่อไป.
