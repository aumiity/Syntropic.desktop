# Reports → แดชบอร์ด (Dashboard)

## Context

หน้า `Reports/Finance.tsx` ปัจจุบัน (`/reports` index, ชื่อแท็บ "ภาพรวม") เป็น financial summary
หลัก แต่ยังเน้น KPI การเงิน + trend + payment breakdown เท่านั้น — ไม่มี view ที่รวม
**operational metrics** เช่น traffic, top sellers, stock risk, leaderboard ของแคชเชียร์,
ความเคลื่อนไหวของลูกค้า, สินค้าค้างสต็อก, และตัวช่วยตั้ง safety_stock ไว้ในที่เดียว

แผนคือเพิ่มแท็บใหม่ **"แดชบอร์ด"** ที่ `/reports/dashboard` โดย:
- **ไม่ลบหน้า Finance เดิม** — user อยากเทียบของเก่ากับใหม่ก่อน
- ใส่ทุกอย่างเข้าไปอย่างครบถ้วน (KPI + trend + traffic + top lists + stock risk + AP aging + velocity + safety stock helper)
- Default date range = **วันนี้** (Finance default = 7 วัน; แดชบอร์ดเป็น operations view ที่อยากรู้ "วันนี้เป็นยังไง")
- ใช้ design system เดิม 100% (MetricCard, SectionCard, TrendChart, DateRangePicker, GranularityTabs)
- Reuse handlers `reports:*` เดิม + เพิ่ม 7 endpoints ใหม่สำหรับ top-N / traffic / velocity

---

## Decisions

1. **Data fetching = parallel calls จาก renderer** (ไม่สร้าง `reports:dashboard` endpoint รวม)
   - reuse: `financeSummary` / `salesPurchaseTrend` / `accountsPayable` / `expiringLots` / `products:lowStock` / `negativeStock:list`
   - Electron IPC เป็น local — `Promise.all` รัวๆ ไม่กระทบ perf
   - หลีกเลี่ยง duplicate logic จาก handlers เดิม + แต่ละ card revalidate แยกได้

2. **Tab order / route**
   - `TABS` ใน `Reports/index.tsx` เพิ่ม `dashboard` เป็น **ตัวแรก** ก่อน `finance`
   - route ที่ `/reports/dashboard` (Finance ยังครอง `/reports` index)
   - `resolveTab` เพิ่ม branch: `if (pathname.startsWith('/reports/dashboard')) return 'dashboard'`

3. **Hour granularity** — ขยาย `salesPurchaseTrend` ให้รับ `'hour'`
   - SQL key: `strftime('%Y-%m-%d %H:00', s.sold_at)`
   - `Granularity` type เพิ่ม `'hour'` + label `ชั่วโมง`
   - `trend-chart.tsx` `formatBucket` รองรับ `'hour'` → `dayjs(key).format('HH:mm')`

4. **Auto-granularity** (ผู้ใช้กดเปลี่ยน override ได้)
   - 1 วัน → `hour`
   - 2–31 วัน → `day`
   - 32–180 วัน → `week`
   - 180+ วัน → `month`

5. **Velocity ใช้ฐาน base unit จาก `sale_item_lots`** (CLAUDE.md HARD: base unit = `products.unit_id`)
   - แปลงแผง/กล่อง → ฐานแล้วใน `sale_item_lots.qty` (POS ทำให้ตอนบันทึก)
   - Bundle: นับ consumption ที่ component level ไม่ใช่ bundle shell
   - หัก return (`sale_type='return'`) ออกจาก consumption

6. **Safety stock = แนะนำเท่านั้น** — ไม่ auto-save
   - `avg_daily = avg_monthly_6m / 30`
   - `suggested_safety_stock = ceil(avg_daily * 30)`
   - `suggested_reorder_point = ceil(avg_daily * 14)`
   - ถ้าข้อมูลย้อนหลังไม่ครบ 6 เดือน แสดงเดือนที่มีข้อมูล + flag "ข้อมูลยังน้อย"
   - ผู้ใช้ไปแก้ในหน้าสินค้าเอง (มี link drill-down ไป `/products/edit/:id`)

7. **Inactive products = สินค้าที่มี stock แต่ไม่มี movement ขายใน date range ที่เลือก** (ตามฟิลเตอร์ ไม่ใช่ fixed window)

8. **Walk-in (C0000) เป็นลูกค้าจริง** (CLAUDE.md HARD invariant) — customer stats `JOIN customers` ปกติ ไม่มี COALESCE special-case

9. **ไม่ทำ URL filter sync** — เก็บเป็น local state เหมือนหน้าอื่น

---

## Backend changes — `electron/ipc/reports.ts`

### A) `reports:salesPurchaseTrend` — เพิ่ม `'hour'` granularity
- type guard: `granularity?: 'hour' | 'day' | 'week' | 'month' | 'year'`
- เคส hour: `strftime('%Y-%m-%d %H:00', s.sold_at)`

### B) `reports:topProducts` (ใหม่)
```ts
ipcMain.handle('reports:topProducts', (_e, filters: {
  date_from?: string; date_to?: string
  by: 'qty' | 'revenue' | 'profit' | 'low_profit'
  limit?: number  // default 10
}) => { ... })
```
- JOIN `sale_items si` → `products p`; กรอง `s.status != 'voided'` + `si.is_cancelled = 0`
- คำนวณ: `qty`, `revenue = SUM(si.line_total)`, `cost = Σ(sale_item_lots.qty * product_lots.cost_price)`
- by: `qty` / `revenue` / `profit (revenue - cost) DESC` / `low_profit (revenue - cost) ASC`
- return: `[{ product_id, trade_name, unit_name, qty, revenue, cost, profit, margin_pct }]`

### C) `reports:topSuppliers` (ใหม่)
- JOIN `purchase_receipts pr` → `suppliers s`, GROUP BY `pr.supplier_id`
- ใช้ `PURCHASE_NET_SUB` เดิม + filter `pr.status != 'cancelled'` + date range
- return: `[{ supplier_id, supplier_name, total_amount, receipt_count }]`

### D) `reports:hourlyTraffic` (ใหม่)
- Input: `{ date_from, date_to }`
- ถ้า 1 วัน → 24 จุด timeline เต็มของวันนั้น
- ถ้า > 1 วัน → aggregate hour-of-day (เวลาไหนยุ่ง)
- SQL: `SELECT CAST(strftime('%H', s.sold_at) AS INTEGER) AS hour, COUNT(*) AS bills, SUM(s.total_amount) AS sales FROM sales s WHERE status != 'voided' AND <date range> GROUP BY hour`
- return: `{ mode: 'single_day' | 'aggregated', points: [{ hour, bills, sales }] }`

### E) `reports:cashierLeaderboard` (ใหม่)
- `sales.sold_by` → `users.name`, GROUP BY sold_by
- return: `[{ user_id, user_name, bill_count, total_amount, profit }]`

### F) `reports:salesStats` (ใหม่) — extra metrics รวมก้อนเดียว
- New vs returning customers (first sale within window vs all-time)
- Avg basket value: `SUM(total_amount) / COUNT(*)` (non-voided non-return)
- Avg items per bill: `Σ qty / bill_count`
- Return rate: `count(sale_type='return') / count(non-voided)`
- Void rate: `count(voided) / count(all)`
- Discount usage: `count(total_discount > 0) / count(non-voided)`
- Bundle revenue share: `Σ line_total where p.is_bundle = 1 / total revenue`
- Sale type breakdown counts (retail/wholesale/rx/return/voided)

### G) `reports:inactiveProducts` (ใหม่)
- Products ที่มี `qty_on_hand > 0` (รวม open lots) แต่ไม่มี `sale_items` ใน date range ที่เลือก
- Input: `{ date_from, date_to, limit? }`
- return: `[{ product_id, trade_name, unit_name, qty_on_hand, cost_value, last_sold_at, avg_monthly_6m }]`

### H) `reports:productVelocity` (ใหม่) — สำหรับ safety stock helper
- คำนวณ avg consumption ต่อเดือน ย้อนหลัง 6 เดือน (rolling, ไม่ผูกกับ date filter)
- Input: `{ limit?: number; q?: string; sort_by?: 'days_cover' | 'avg_monthly' }`
- SQL: `SUM(sil.qty) - SUM(sil.qty where sale_type='return')` group by product, แปลงเป็น `avg_monthly_6m`
- คำนวณต่อ: `avg_daily = avg_monthly_6m / 30`, `current_stock = SUM(open lots qty_on_hand)`, `days_cover = current_stock / avg_daily`, `suggested_safety_stock = ceil(avg_daily * 30)`, `suggested_reorder_point = ceil(avg_daily * 14)`
- return: `[{ product_id, trade_name, unit_name, current_stock, avg_monthly_6m, avg_daily, days_cover, reorder_point, safety_stock, suggested_safety_stock, suggested_reorder_point, months_with_data }]`
- ถ้า `months_with_data < 6` → frontend แสดง flag "ข้อมูลยังน้อย"

### Expose ใน `electron/preload.ts`
```ts
topProducts:        (f: any) => ipcRenderer.invoke('reports:topProducts', f),
topSuppliers:       (f: any) => ipcRenderer.invoke('reports:topSuppliers', f),
hourlyTraffic:      (f: any) => ipcRenderer.invoke('reports:hourlyTraffic', f),
cashierLeaderboard: (f: any) => ipcRenderer.invoke('reports:cashierLeaderboard', f),
salesStats:         (f: any) => ipcRenderer.invoke('reports:salesStats', f),
inactiveProducts:   (f: any) => ipcRenderer.invoke('reports:inactiveProducts', f),
productVelocity:    (f: any) => ipcRenderer.invoke('reports:productVelocity', f),
```

---

## Frontend changes

### New: `src/pages/Reports/Dashboard.tsx`
`useOutletContext<ReportsOutletContext>()` เหมือน Finance.tsx — set summary (6 cards) + set toolbar (DateRangePicker)

**Default state**: `dateFrom = dateTo = today`, granularity = auto (hour เมื่อ 1 วัน)

**Load**: `Promise.all` ของ ~11 calls (parallel)

**Summary cards (6 ใบใน layout slot)**
1. ยอดขายสุทธิ (`primary`, sparkline จาก trend)
2. กำไรขั้นต้น + margin% (`success`/`destructive`)
3. จำนวนบิล + ขนาดบิลเฉลี่ย (`info-soft`)
4. คืนสินค้า (`warm`)
5. ยอดซื้อ (`info-soft`)
6. หนี้ค้างชำระ (`warning` ถ้า > 0)

**Body sections (vertical scroll)**
1. **Trend + Traffic** (2-col)
   - "แนวโน้มยอดขาย-กำไร-ซื้อ" + GranularityTabs + TrendChart
   - "Traffic ลูกค้าที่เข้าร้าน" + bar/area chart ของ hourly bills
2. **Top products** (3-col) — ขายดี / กำไรสูง / กำไรต่ำ-ติดลบ
3. **People & ops** (3-col) — Top suppliers / Cashier leaderboard / Customer stats (payRow)
4. **Stock risk** (4 MetricCard sm, clickable) — Low stock / Expired lots / Expiring 30d / Negative stock → `/manage`
5. **Inactive products** — สินค้าค้างสต็อก ในช่วงนี้ พร้อม last_sold_at + avg_monthly_6m
6. **Velocity & Safety Stock Helper** — ตารางแสดง current_stock, avg/month, avg/day, days_cover, reorder_point ปัจจุบัน + suggested values; คลิกชื่อสินค้า → `/products/edit/:id`
7. **AP aging** — 4 stat bars (not_due / 1-30 / 31-60 / 60+) + "ดูทั้งหมด" → `/reports/purchases`
8. **Sale type breakdown** — retail / wholesale / rx / return / voided

### New: `src/components/ui/top-list-card.tsx`
```tsx
interface TopListCardItem {
  rank?: number
  label: string
  value: string | number
  sub?: string
  onClick?: () => void
}
interface TopListCardProps {
  items: TopListCardItem[]
  emptyIcon?: LucideIcon
  emptyText?: string
  maxHeight?: number  // default 280
}
```
- แถว `flex justify-between` — left = rank badge + label, right = tabular-nums value
- Empty state ตาม convention (icon `size-10 opacity-30` + `py-16`)

### Extend chart primitives
- `granularity-tabs.tsx` / `granularity-select.tsx` — เพิ่ม `'hour'` + label `ชั่วโมง`
- `trend-chart.tsx` — `formatBucket(key, 'hour')` → `dayjs(key).format('HH:mm')`

### Update `src/pages/Reports/index.tsx`
- TABS เพิ่ม `{ value: 'dashboard', to: '/reports/dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard }` (ตัวแรก)
- `resolveTab` เพิ่ม branch `/reports/dashboard`

### Update `src/App.tsx`
- lazy import `ReportsDashboard`
- เพิ่ม `<Route path="dashboard" element={<ReportsDashboard />} />` ใต้ `/reports`

---

## Critical files

| Action | File |
|---|---|
| Edit | `electron/ipc/reports.ts` (hour + 7 new handlers) |
| Edit | `electron/preload.ts` (expose 7 methods) |
| Edit | `src/pages/Reports/index.tsx` (TABS + resolveTab) |
| Edit | `src/App.tsx` (route) |
| Edit | `src/components/ui/charts/granularity-tabs.tsx`, `granularity-select.tsx`, `trend-chart.tsx` |
| New | `src/pages/Reports/Dashboard.tsx` |
| New | `src/components/ui/top-list-card.tsx` |

---

## Reuse map

| Need | Reuse |
|---|---|
| Summary (sales/profit/purchase/AP) | `reports:financeSummary` (with_compare: true) |
| Trend (sales/profit/purchase) | `reports:salesPurchaseTrend` |
| AP aging buckets + list | `reports:accountsPayable` |
| Expiring lot count | `reports:expiringLots` (filter='expired' + 30) |
| Low stock count | `window.api.products.lowStock` |
| Negative stock count | `window.api.negativeStock.list` |
| Sale type counts | `reports:salesList` summary.count_* (หรือ `salesStats`) |
| PoP delta logic | helper `delta()` จาก Finance.tsx |
| Date range UI | `<DateRangePicker>` h-10 (มี role-based 7-day clamp ใน Finance) |
| KPI cards | `<MetricCard>` พร้อม sparkline + subClassName |
| Empty state | icon `size-10 opacity-30` + `py-16` (เช่นใน Sales.tsx) |

---

## Verification

### Build
```bash
npm run build
```

### Manual scenarios (`npm run electron:dev`)
1. **Default = วันนี้** — เปิด `/reports/dashboard` ครั้งแรก → granularity = hour, data วันนี้
2. **Date range change** — เลือก "7 วันที่ผ่านมา" → granularity auto = day, hourly traffic mode = aggregated
3. **Empty state** — เลือกวันในอนาคต → ทุก section empty placeholder, ไม่ crash, KPI = 0/-
4. **คืนสินค้า** — มี `sale_type='return'` → card คืนสินค้าแสดงยอด, ยอดขายสุทธิรวมยอดติดลบ
5. **Voided** — ไม่ถูกนับใน revenue/profit/trend, แสดงใน sale type breakdown
6. **AP aging** — บิลซื้อเครดิตเลย due_date → bucket `d1_30`/`d31_60`/`d60_plus` ถูก
7. **Stock risk drill-down** — คลิก "สินค้าต่ำ" → navigate `/manage` (Low stock); จำนวนตรงกัน
8. **Top products** — ranking ตรงกับการคำนวณมือ, lot_id NULL ไม่ throw
9. **Hourly traffic single-day** — 1 วัน → 24 จุด, 7 วัน → aggregated 24 จุด
10. **Tab persistence** — สลับ tab แล้วกลับ → summary/toolbar ของ Dashboard โชว์ถูก (per-tab guard)
11. **Role gate** — staff → clamp 7 วัน เหมือน Finance
12. **Walk-in (C0000)** — customer stats `JOIN customers` ไม่แตก
13. **Unit base** — สินค้าขายเป็นแผง/กล่อง → avg/month คิดเป็นหน่วยฐานถูก
14. **Bundle** — consumption นับที่ component ไม่ใช่ shell
15. **Safety stock helper** — สินค้าที่ขายน้อยกว่า 6 เดือน → แสดง flag "ข้อมูลยังน้อย"; สูตร `ceil(avg_daily * 30)` ตรง

### Regression check
- `/reports` (Finance) — ทำงานเหมือนเดิม (เปลี่ยนแค่ TABS + resolveTab + เพิ่ม 'hour' ที่เป็น additive)
- `/reports/sales`, `/reports/purchases`, `/reports/fda` — ไม่กระทบ
