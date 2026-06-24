---
name: project-finance-manage-panel
description: Finance overview panel (พับ/กางได้) ใน Manage › ประวัติการขาย — Phase 1 Sales
metadata:
  type: project
---

## Finance overview panel — Manage › Sales

**สถานะ:** DONE 2026-06-24 (tsc PASS; verified Playwright e2e 15/15 — `tests/e2e/verify-finance-panel.mjs`, ขับแอปจริงที่ viewport 1440×800 บังคับผ่าน CDP `Emulation.setDeviceMetricsOverride`: admin เห็น/กางแผง KPI+กราฟ+โน้ต ค่าตรง, สลับ granularity, จำสถานะข้ามแท็บ, staff ไม่เห็น+0 console error)
**SSOT:** `docs/plans/Finance_Manage_Panel.html`
**ไฟล์เดียว:** `src/pages/Manage/Sales.tsx` (renderer-only, ไม่แตะ backend)

### ขอบเขตเจตนา

- Phase 1 = Sales เท่านั้น; เฟสถัดไปขยายไป Purchases / LowStock / DeadStock / Expiry / NegativeStock
- แผงตัวเลข **อิงช่วงวันที่อย่างเดียว** (ตั้งใจ) — ไม่ผูกช่องค้นหา / ตัวกรองสถานะ / VAT ของตาราง; ไม่ปิดแผงตอนผู้ใช้กรองข้อมูล
- `financeSummary` ตัดบิล voided ออกจากยอดขาย → ใช้ info-soft note กำกับขอบเขตให้ชัด

### IPC ที่ reuse (ไม่มีของใหม่)

- `reports.financeSummary({ date_from, date_to, with_compare: true })` → คืน `sales_net / sales_cost / sales_profit / sale_count / previous`
- `reports.salesPurchaseTrend({ date_from, date_to, granularity })` → คืน trend array
- ทั้งคู่ `requireAdmin` อยู่แล้ว → staff ไม่เห็นแผงเลย

### Component ที่ reuse

- `MetricCard`, `TrendChart` / `TrendDatum`, `GranularityTabs` / `Granularity`, `delta()`
- ต้นแบบการต่อสาย = `Dashboard.tsx`
- AnimatePresence collapse height = ยืมจาก `Manage/index.tsx`

### Gotchas ที่เจอระหว่างทำ

1. **ปุ่ม toggle ต้องเป็นไอคอนล้วน `h-9 w-9 p-0`** — ปุ่มมีป้ายกว้างล้นแถบ `h-12` ที่ 1440px viewport แคบ → ใช้ icon-only + `tooltip` prop แทน

2. **granularity effect ผูก `[dateMode]` เท่านั้น** — ถ้าผูก `[dateFrom, dateTo]` ด้วย จะ re-seed granularity ทุกครั้งที่ผู้ใช้แก้ช่วง custom ลบตัวเลือกที่เพิ่งเลือก; granularity เป็น manual override ไม่ clamp อัตโนมัติ

3. **preload คืน `any`** → ต้องกำหนด local interface + `?? null` / `?? []` กันค่า undefined หลุด; reset trend เป็น `[]` ตอน financeSummary error (ไม่ทิ้งค่าเก่าค้าง)

4. **token `info-soft-border` ไม่มีจริง** — อย่าเดาชื่อ `border-info-soft-border`; ตัวที่มีจริงคือ `border-info-soft` (shade DEFAULT) → note box ใช้ `border border-info-soft bg-info-soft/40 text-info-soft-foreground` (ยืนยัน render ได้จริงตอน e2e)

### Persistence

- `showFinancePanel` เก็บผ่าน `usePagePrefs` key `SalesPrefs.showFinancePanel` (default `false`) — พับโดย default ไม่กวนคนที่ไม่ต้องการ

### Related memories

- [[project_manage_restructure]] — หน้า Manage/Sales อยู่ใน phased restructure; Finance panel ส่วน Phase 1
- [[feedback_read_doc_before_ui_edit]] — ปุ่ม/แถบ ต้องอ่าน ui-table-card.md ก่อน (h-12 bar / h-9 controls)
- [[feedback_font_relative_sizing]] — ห้าม hardcode px; modal + panel sizing ต้องเป็น rem / vh
