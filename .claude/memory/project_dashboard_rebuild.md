---
name: project-dashboard-rebuild
description: Dashboard v2 "ศูนย์บัญชาการ" 5-block rebuild — Phase A+B DONE 2026-06-29 (e2e PASS); finance panel ย้ายออกจาก Manage มาอยู่ที่ Dashboard แล้ว
metadata:
  type: project
---

## Dashboard v2 rebuild

**สถานะ:** Phase A+B DONE 2026-06-29 — tsc PASS; real-Electron Playwright e2e PASS; click-test pending
- Phase A (39/40 — 1 fail = selector false-positive, ไม่ใช่ bug)
- Phase B DONE 2026-06-29 (real-Electron Playwright e2e PASS)
**SSOT mockup:** `docs/plans/Dashboard_Rebuild_Mockup.html` — มีระบบ click-to-annotate note ในตัว (เจ้าของใช้ให้ feedback); export notes → paste กลับ
**SSOT plan:** `docs/plans/Dashboard_Rebuild.html` (v2, เขียนใหม่จาก mockup)

### Layout — 5 blocks (ไม่มี band heading)

| Block | เนื้อหา |
|---|---|
| 1 | MetricStrip 6 cells |
| 2 | Diverging chart + การขาย status card |
| 3 | สินค้าขายดี / กำไรสูงสุด / การซื้อ |
| 4 | ผู้จัดจำหน่าย / พนักงานขาย / ค่าใช้จ่าย |
| 5 | Alert tiles + standard table |

### Component ใหม่

**`src/components/ui/charts/diverging-trend-chart.tsx`** — recharts `BarChart`:
- **Sales bars UP:** profit (`--success`) stacked ที่ base + cost (`--primary`) ด้านบน = `sales_net` รวม
- **Purchase bars DOWN:** `purchase_neg = −purchase_total` (`--info`); แกน y ลงใต้ศูนย์
- `ReferenceLine y=0`; YAxis tick labels มีเครื่องหมาย signed (เช่น `-฿150k` ใต้แกน)
- prop `mode: 'all'|'sales'|'purchase'|'profit'` toggle ว่า bar ไหนโชว์

**`formatBucket` ต้อง import จาก `trend-chart.tsx`** (EXPORTED แล้ว) — diverging-trend-chart ใช้ฟังก์ชันเดียวกัน; ห้าม redefine ใหม่

### Gotchas ที่ต้องจำ

1. **Dead-stock detail table ต้องส่ง 6-MONTH window ให้ `reports.inactiveProducts`** — ถ้าไม่ส่ง handler คืนเฉพาะ "ไม่เคยขายเลยตลอดชีวิต" (subset เล็กกว่า); `last_sold_at` จะแสดง 'ไม่เคยขาย' ทุกแถว; count tile m6 จะไม่ตรงกับ detail table

2. **ห้าม import recharts ใน `Dashboard.tsx` โดยตรง** — recharts `Tooltip` name-collides กับ UI `Tooltip` จาก `src/components/ui/`; recharts อยู่ใน `diverging-trend-chart.tsx` เท่านั้น

3. **Alert tile counts ไม่กรองตาม main picker** (ตั้งใจ) — ใช้:
   - `negativeStock.count` (สต็อกติดลบ)
   - `products.lowStock({}).count` (สต็อกเหลือน้อย)
   - `expiringLots({ count_only: true }).counts.d30` (หมดอายุ 30 วัน)
   - `inactiveCounts().m6` (dead-stock 6 เดือน)

4. **"เปิดตารางเต็ม" navigate ไป `/manage/{negative-stock,low-stock,expiry,dead-stock}`** — pagination ใน alert table = client-side slice (~8/page)

5. **MetricStrip 6 cells แน่นที่ min-window 1440px** — พฤติกรรม MetricStrip เดิม (ไม่ใช่ bug); ถ้า root font-size ขึ้นจาก 18px อาจล้นเกิน → จุดเฝ้าระวัง

6. **KPI "ค่าใช้จ่ายอื่นๆ" ผูก main picker ผ่าน `financeSummary.expense_total`** — การ์ด expense-breakdown (block 4) มี period dropdown ของตัวเอง (อิสระจาก main)

### Phase B — DONE 2026-06-29 (real-Electron Playwright e2e PASS)

ลบ admin-only finance overview panel (MetricStrip + trend chart + status/averages cards) ออกจาก `src/pages/Manage/Sales.tsx` และ `src/pages/Manage/Purchases.tsx`; ลบ `scrollPage` / `scrollRef` / `forwardWheel` / `canFinancePanel` logic ออกจาก `src/pages/Manage/index.tsx` — admin เห็นหน้า Manage เหมือน staff: count MetricCards (5 ใบ Sales, 6 ใบ Purchases) + history table เท่านั้น (search/filters/VAT column ไม่กระทบ)

**`src/lib/finance-panel.ts` ตอนนี้ import โดย `Dashboard.tsx` เท่านั้น** — Manage ไม่ใช้แล้ว

### Gotcha — e2e scripts ที่ล้าสมัยหลัง Phase B

**`tests/e2e/verify-purchases-dashboard.mjs`** และ **`tests/e2e/verify-finance-panel.mjs`** assert UI ของ finance panel เก่าใน Manage (MetricStrip, trend chart, "สถานะการซื้อ"/finance cards) ที่ถูกลบใน Phase B แล้ว — หลัง Phase B ทั้งสอง script จะ FAIL เสมอ; ความล้มเหลวนี้ **ไม่ใช่ code regression** — ต้อง retire หรือเขียนใหม่ก่อนรันซ้ำ

### Related memories

- [[project_finance_manage_panel]] — Phase B ของ dashboard คือการรื้อ finance panel ที่สร้างใน initiative นั้น
- [[recharts_focus_outline]] — กรอบเหลืองเมื่อคลิกกราฟ recharts; แก้แล้วที่ `index.css`
