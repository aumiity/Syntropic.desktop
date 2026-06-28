---
name: project-finance-manage-panel
description: Finance overview ใน Manage › ประวัติการขาย — admin แสดงตลอด+เลื่อนทั้งหน้า (rework 2026-06-25), staff เต็มจอเดิม
metadata:
  type: project
---

## Finance overview panel — Manage › Sales

**สถานะ:** DONE 2026-06-24; **REWORK layout 2026-06-25 (tsc PASS; in-app verify pending)** — เลิก toggle/animated band, เปลี่ยนเป็นการ์ดแยกแสดงตลอด + เลื่อนทั้งหน้า (ดู §Layout rework ล่าง)
**SSOT:** `docs/plans/Finance_Manage_Panel.html`
**ไฟล์เดียว:** `src/pages/Manage/Sales.tsx` (renderer-only, ไม่แตะ backend)

### Layout rework 2026-06-25 (เจ้าของสั่ง)

- **เลิกปุ่ม toggle + pref `showFinancePanel` + AnimatePresence band ทิ้งทั้งหมด** (ลบ import `framer-motion` ด้วย) — admin เห็นภาพรวมการเงิน **แสดงตลอด** ไม่มีพับ/กาง
- **แก้ 2 ไฟล์:** `Sales.tsx` + **`Manage/index.tsx`** (scroll container ต้องอยู่ที่ layout เพื่อให้การ์ดสรุป 5 ใบ "เลื่อนรวม" ไปด้วย — ถ้า scroll อยู่ใน Sales.tsx การ์ดสรุปที่ render ใน slot นอก Outlet จะปักนิ่ง; เจ้าของขอให้เลื่อนด้วย)
- **`Manage/index.tsx`:** `const scrollPage = current === 'sales' && isAdmin`; ครอบ [summary block + Outlet] ใน region เดียว — `scrollPage ? 'flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col gap-2' : 'flex-1 min-h-0 flex flex-col gap-2'`; outlet wrapper sizing สลับด้วย `scrollPage ? 'flex flex-col shrink-0 …' : 'flex flex-1 min-h-0 flex-col …'` (shrink-0 = สูงตามเนื้อหา → overflow → region scroll พา summary ไปด้วย; flex-1 = เต็มจอ ไม่ overflow แท็บอื่นไม่กระทบ)
- **แยกตาม role ตรง ๆ ด้วย `isAdmin`:**
  - **staff (ไม่ admin):** หน้า Sales เดิมเป๊ะ — การ์ดเดียว `flex flex-1 flex-col min-h-0` เต็มจอ, ตาราง scroll ในตัว, footer ติดล่าง (ไม่มีภาพรวมการเงินอยู่แล้ว)
  - **admin:** Sales outer = **stack ธรรมดา `flex flex-col gap-3`** (ไม่ใช่ scroll container เอง — parent layout เลื่อนแทน); ลูก 2 ใบ = (1) การ์ดภาพรวมการเงิน `shrink-0` แสดงตลอด (2) การ์ดประวัติการขาย `shrink-0` พื้นที่ตาราง **สูงตายตัว `h-[34rem]` (~10 แถว)** scroll ในตัว
- **ความสูงตาราง = `h-[34rem]`** (rem ตาม font-relative invariant, ห้าม px); แถวเปิดคอลัมน์ "รายการ" → 2 บรรทัด สูง ~3.5rem ดังนั้น 28rem ได้แค่ ~7-8 แถว ต้อง 34rem ถึงได้ ~10 — จุดจูนถ้าเจ้าของอยากได้มาก/น้อยกว่านี้
- table area + history card open ใช้ ternary `isAdmin ? ... : ...` สลับ className (fixed-h vs flex-1) — staff path = string เดิมทุกตัว
- finance fetch effect เลิก gate `showFinancePanel` เหลือ `if (!isAdmin) return` + dep `[isAdmin, dateFrom, dateTo, gran, toast]`
- **หมายเหตุ:** e2e `verify-finance-panel.mjs` เดิมเช็ค toggle/persist → **ล้าสมัย ต้องรื้อก่อนรันซ้ำ**

### Phase 2 — Purchases (DONE 2026-06-28; tsc PASS exit 0; click-test pending)

**SSOT แผน:** `docs/plans/Purchases_Finance_Dashboard.html` (ผ่าน /write-plan + audit 2 รอบ ไม่มี P0/P1)
**Layout A = มิเรอร์ Sales เป๊ะ** สำหรับ admin (`useCan('report.finance') !== 'off'`), staff คงหน้าเดิมทุกพิกเซล (การ์ดนับ 5 ใบ + ตารางเต็มจอ)
- **แตะ 5 ไฟล์:**
  1. `electron/ipc/reports.ts` — เพิ่ม `COUNT(*) AS purchase_count` ต่อ bucket ใน `salesPurchaseTrend` (+ ใส่ใน Map type/seed/merge) — backward-compatible (Dashboard/Sales ไม่สน field ใหม่)
  2. `src/components/ui/charts/trend-chart.tsx` — เพิ่ม `purchase_count?: number` ใน `TrendDatum`
  3. **`src/lib/finance-panel.ts` (ไฟล์ใหม่)** — ดึง 4 pure helper ออกจาก Sales: `trendOf` / `compareLabelForMode` / `prevWindowForMode` / `granularityForMode` (ลดโค้ดซ้ำ; Sales import จาก lib นี้แทน + ลบ orphan import `dayjs` + `type Granularity`)
  4. `src/pages/Manage/index.tsx` — `scrollPage = (current === 'sales' || current === 'purchases') && canFinancePanel`
  5. `src/pages/Manage/Purchases.tsx` — dashboard: MetricStrip 4 (ยอดซื้อรวม/เงินสด/เครดิต/ค้างชำระ) + กราฟ toggle ยอดซื้อ/จำนวนบิล + `purchaseStatusCard` + `purchaseSummaryCard` (lowercase render helper ในไฟล์ ตาม precedent Sales)
- **gotchas เฉพาะ Purchases:**
  - `toast` ของ Purchases = **positional** `toast(msg, 'error')` (ไม่ใช่ object เหมือน Sales)
  - **`unpaid_count` ⊂ `credit_count`** (purchase.ts history summary) → proportion bar ต้องแยก เงินสด/เครดิต(จ่ายแล้ว=credit−unpaid)/ค้างชำระ/ยกเลิก = disjoint รวม=ทุกบิล (อย่าใส่ unpaid เป็น segment แยกข้าง credit ตรง ๆ จะนับซ้ำ)
  - header การ์ดสถานะใช้ `histSummary.count` (ทุกบิล) เป็น total; ฐาน % คำนวณจากผลรวม segment ภายในการ์ดเอง
  - headline delta ใช้ `{ invert: true }` (ซื้อเพิ่ม = แดง, cost-style เหมือนการ์ด "ต้นทุนรวม" ของ Sales) — ถอด arg ถ้าอยากให้ขึ้น=เขียว
  - การ์ดสถานะ = ค้างชำระ (`payable_total`) อิงยอดคงค้าง **ปัจจุบัน** (ไม่ผูกช่วงวันที่); ที่เหลืออิงช่วงวันที่
- ยังเหลือเฟสถัดไป: LowStock / DeadStock / Expiry / NegativeStock

### ขอบเขตเจตนา

- Phase 1 = Sales; **Phase 2 = Purchases (DONE)**; เฟสถัดไปขยายไป LowStock / DeadStock / Expiry / NegativeStock
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

- ~~`showFinancePanel` เก็บผ่าน `usePagePrefs`~~ — **ลบทิ้งแล้ว 2026-06-25** (ดู §Layout rework); admin เห็นตลอด ไม่ต้องจำสถานะเปิด/ปิดอีก

### Related memories

- [[project_manage_restructure]] — หน้า Manage/Sales อยู่ใน phased restructure; Finance panel ส่วน Phase 1
- [[feedback_read_doc_before_ui_edit]] — ปุ่ม/แถบ ต้องอ่าน ui-table-card.md ก่อน (h-12 bar / h-9 controls)
- [[feedback_font_relative_sizing]] — ห้าม hardcode px; modal + panel sizing ต้องเป็น rem / vh
