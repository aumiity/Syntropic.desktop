# Plan: รายงาน ขย.9 (บัญชีการซื้อยา) — On-screen + Print

> **Status:** v2 — audit-corrected (2026-05-20). Both Gemini and DeepSeek audits applied:
> - SQL join fixed: `pr.invoice_no = pri.invoice_no` (not `pr.id = pri.receipt_id`) — `purchase_receipts.invoice_no` is the PK; no `id`/`receipt_id` columns exist.
> - File name corrected: `FdaReports.tsx` (not `Fda.tsx`).
> - Routing restructured: `fda` becomes a parent route with `index` + `khor-yor-9` children (the existing flat route can't hold children without an Outlet).
> - `is_bundle = 0` filter added — bundles can carry `is_drug=1` but are never bought as a single SKU.
> - `reports:khorYor9` appended to existing `electron/ipc/reports.ts` (file already has 8 handlers).
> - Shop name fetch via `window.api.settings.shopSettings()` explicitly called out.
> - Added loading/empty/error states and `qty REAL` display rule.

## Context

ขย.9 is the official Thai pharmacy purchase record (ตามแบบของสภาเภสัชกรรม). The template (per the official PDF at https://papc.pharmacycouncil.org/share/file/file_1716.ขย9.pdf) is **A4 landscape**, one centered title, a single 8-column table that records every drug purchase line — no totals, no footer, no signature blocks at the bottom (the operator signs *per row* in the dedicated column).

The user wants:
1. A screen view of the report inside the existing **`/reports`** area.
2. A **Print** button that produces output matching the official template exactly.
3. **Forward-compatible UX** — ขย.11 and ขย.13 are next, so the entry point must scale to multiple official forms (user explicitly asked for this: "ทำเป็น card หลักด้านบน ยังมี ขย13 11 อีก").

Confirmed user choices (asked during planning):
- Place inside `/reports/fda` (the existing "รายงาน อย." tab) and turn that tab into a **card grid hub** for official forms.
- "ลายมือชื่อผู้มีหน้าที่ปฏิบัติการ" column → **blank** on the printout (sign by hand).
- "หมายเหตุ" column → **blank**.
- Date column format → **พ.ศ. แบบไทยย่อ** (e.g. `20 พ.ค. 2569`).

---

## Information architecture

```
/reports                                    (existing — 3 top tabs)
 ├─ /reports               Finance         (existing)
 ├─ /reports/payables      Payables        (existing)
 └─ /reports/fda           [HUB]           ← rewritten as card grid
      ├─ card: ขย.9  บัญชีซื้อยา        →  /reports/fda/khor-yor-9   ← NEW page
      ├─ card: ขย.11 …                  →  (disabled placeholder)
      └─ card: ขย.13 …                  →  (disabled placeholder)
```

The FDA tab is currently the placeholder at `src/pages/Reports/FdaReports.tsx` (audit-corrected filename — *not* `Fda.tsx`). Repurpose this file: drop the "อยู่ระหว่างพัฒนา" empty state, replace with a 3-card `StatCard` grid. Only ขย.9 is enabled now; ขย.11/13 cards are visually present but disabled with a "เร็วๆ นี้" badge — this hardwires the architecture for the user's stated future scope without committing UI to forms that don't exist yet.

**Routing change in `src/App.tsx`** — the current line `<Route path="fda" element={<ReportsFda />} />` cannot hold a child route while ReportsFda is a leaf component. Refactor to a parent-without-element with index + child:

```tsx
<Route path="fda">
  <Route index element={<ReportsFda />} />              {/* hub, rewritten file */}
  <Route path="khor-yor-9" element={<KhorYor9 />} />    {/* new page */}
</Route>
```

This works cleanly with the existing `ReportsLayout.resolveTab()` — that function already uses `pathname.startsWith('/reports/fda')`, so the "รายงาน อย." top tab stays highlighted on both `/reports/fda` (hub) and `/reports/fda/khor-yor-9` (the report). Verified in `src/pages/Reports/index.tsx:22`.

---

## ขย.9 page layout (`/reports/fda/khor-yor-9`)

Two visual zones inside the standard manage-page outer layout:

**A. Filter strip (h-14, app chrome — NOT printed)**
- Left: back-link icon button → `/reports/fda`
- `DateRangePicker` (default: this month) — canonical usage `src/pages/Manage/Sales.tsx:163-168`
- Right: `<Button size="lg" variant="default">พิมพ์</Button>` calls `window.print()`

**Loading / empty / error states** (all rendered *inside* the A4 preview so the page never blanks out):
- **Loading:** skeleton — render the column headers and N=20 empty grey-tinted body rows (`bg-muted/30 animate-pulse`) until the IPC resolves.
- **Empty result:** still render the title + subtitle + table headers + filler empty rows (the official form looks identical empty vs. filled — that's intentional). Show a small italic line below the table: `ไม่มีรายการซื้อยาในช่วงวันที่ที่เลือก` — `.no-print` so the printed page stays clean.
- **IPC error:** toast (`useToast`), and leave the previous result on-screen (don't blank it).

**B. A4 landscape "paper" preview (the print canvas)**
A white card sized to A4 landscape ratio at typical screen scale (~`w-[1123px] h-[794px]` centered, with horizontal scroll on narrow screens). This is BOTH the on-screen preview AND the printed surface — WYSIWYG. Inside:

- **Top-right corner:** `แบบ ข.ย. ๙` (right-aligned, small)
- **Centered title:** `บัญชีการซื้อยา` (text-xl)
- **Subtitle row:** `………… (ชื่อสถานที่ขายยา) …………` — dotted line filled with `shop_settings.shop_name`
- **8-column table** (the exact official columns, no more, no less):

| # | Column header (Thai) | Source |
|---|---|---|
| 1 | ลำดับที่ | running index 1..N |
| 2 | วัน เดือน ปี ที่ซื้อ | `purchase_receipts.created_at` → formatted `20 พ.ค. 2569` |
| 3 | ชื่อผู้ขาย | `suppliers.name` |
| 4 | ชื่อยา | `COALESCE(NULLIF(products.name_for_print,''), products.trade_name)` |
| 5 | เลขที่หรืออักษรของครั้งที่ผลิต | `purchase_receipt_items.lot_number` |
| 6 | จำนวน / ปริมาณ | formatted qty + `item_units.name` (e.g. `100 เม็ด` or `0.5 ขวด`) |
| 7 | ลายมือชื่อผู้มีหน้าที่ปฏิบัติการ | **blank** (handwritten) |
| 8 | หมายเหตุ | **blank** |

**Qty formatting** — `purchase_receipt_items.qty` is `REAL` (per schema.ts), so fractional values are possible. Display rule: integers as-is (`100`), fractional with up to 2 decimals trimmed of trailing zeros (`0.5`, `1.25`). Helper: `n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString()`.

**Shop name source** — fetch via `window.api.settings.shopSettings()` on page mount and read `.shop_name`. Cache the result in component state. (The Gemini audit flagged this — the plan must explicitly call it out, not just say `shop_settings.shop_name`.)

Header cells use the official template's wrapped/centered look: white bg with thin borders all-round, `text-sm font-semibold text-center`. Body cells use thin borders + `text-sm` + `min-h` to keep row height even when empty. When the result set is short, append filler empty rows so the page never has a half-empty grid (matches the official paper look).

Multi-page output: if rows overflow one A4 page, page-break naturally; repeat the column-header row on each new page via `<thead>` (browsers honor `thead` repeat in print).

---

## Data flow

**`electron/ipc/reports.ts` already exists** with 8 handlers (`salesList`, `getSaleByInvoice`, `getSale`, `voidSale`, `expiringLots`, `financeSummary`, `salesPurchaseTrend`, `accountsPayable`) — verified. **Append** the new handler; do not create a new file.

```
reports:khorYor9({ date_from, date_to }) → Row[]
```

SQL — **audit-corrected** join (per `schema.ts`: `purchase_receipts.invoice_no` is the PRIMARY KEY, and `purchase_receipt_items.invoice_no` is the FK — there is no `id` column on the header and no `receipt_id` column on the items):

```sql
SELECT
  pr.invoice_no                                                AS invoice_no,
  pr.created_at                                                AS purchase_date,
  COALESCE(s.name, '')                                         AS supplier_name,
  COALESCE(NULLIF(p.name_for_print,''), p.trade_name)          AS drug_name,
  COALESCE(pri.lot_number, '')                                 AS lot_number,
  pri.qty                                                      AS qty,
  COALESCE(u.name, '')                                         AS unit_name
FROM purchase_receipt_items pri
JOIN purchase_receipts pr  ON pr.invoice_no = pri.invoice_no
JOIN products          p   ON p.id  = pri.product_id
LEFT JOIN suppliers    s   ON s.id  = pr.supplier_id
LEFT JOIN item_units   u   ON u.id  = p.unit_id
WHERE pr.status = 'completed'
  AND pr.cancelled_at IS NULL
  AND p.is_drug = 1
  AND p.is_bundle = 0
  AND date(pr.created_at) BETWEEN date(?) AND date(?)
ORDER BY pr.created_at ASC, pri.invoice_no ASC, pri.id ASC;
```

Why these filters (per CLAUDE.md + exploration + audit):
- `p.is_drug = 1` — the ขย.9 form is *only* for drugs; CLAUDE.md defines `is_drug` as the canonical "this is a drug under the law" flag.
- `p.is_bundle = 0` — **added per DeepSeek audit.** A bundle row (e.g. a "ชุดยาแก้หวัด" kit) can be flagged `is_drug=1` but is never something purchased from a supplier as one SKU — purchases hit the bundle's component lots, not the bundle itself. Excluding bundles avoids phantom ขย.9 entries.
- `pr.status = 'completed' AND pr.cancelled_at IS NULL` — exclude cancelled GRs (schema uses `status` + `cancelled_at`, not an `is_cancelled` boolean on the header).
- `name_for_print` fallback to `trade_name` — matches the rule in CLAUDE.md ("ถ้าว่างใช้ชื่อสินค้า").

**Expose** via `electron/preload.ts` under `window.api.reports.khorYor9(...)` and add the type to `src/types/index.ts` alongside the existing reports IPC types.

---

## Print mechanism

`window.print()` + targeted `@media print` rules. No PDF lib, no extra deps — the on-screen A4 preview *is* the printed surface, so we only need to hide app chrome.

Approach (single source of truth = the preview element):

1. Tag the A4 preview wrapper with `className="print-area"` and the outer app shell with `className="no-print"` (sidebar, titlebar, page filter strip).
2. Add to `src/index.css`:

```css
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  body { background: white; }
  .no-print { display: none !important; }
  .print-area {
    position: absolute;
    inset: 0;
    width: 100%;
    height: auto;
    box-shadow: none !important;
    border-radius: 0 !important;
  }
  /* Repeat the <thead> on each page */
  thead { display: table-header-group; }
  tr, td, th { page-break-inside: avoid; }
}
```

3. Print button handler: simply `() => window.print()`. (No state — `<thead>` repeat + page break rules handle pagination.)

This is the project's first print flow (the Explore agent confirmed: zero existing `window.print()` / `@media print` matches), so it sets the pattern for future ขย.11/13.

---

## Reusable bits

- **Date formatter** — new helper `src/lib/thaiDate.ts` exporting `formatThaiShortBE(iso: string): string` → `"20 พ.ค. 2569"`. Months use the standard Thai abbreviations array. Reused by ขย.11/13 later.
- **Existing primitives reused** (no new components):
  - `DateRangePicker` from `src/components/ui/date-range-picker.tsx`
  - `Button` (variant `default` for พิมพ์, `outline` for back-link)
  - `Table` family from `src/components/ui/table.tsx` — but inside `.print-area` we explicitly disable the sticky/muted header styling and use a plain `<table>` with hand-styled borders, because the official template needs an all-bordered grid (`bg-muted` sticky head is wrong for a printed form). Inline that styling on the form table only — do not override the primitive.
  - `StatCard` from `src/components/ui/card.tsx` for the FDA tab's hub cards (matches existing Products stock-filter pattern).

---

## Files to create / modify

**New**
- `src/pages/Reports/KhorYor9.tsx` — the ขย.9 page (filter strip + A4 preview).
- `src/lib/thaiDate.ts` — `formatThaiShortBE()` helper.

**Modify**
- `src/pages/Reports/FdaReports.tsx` — **rewrite** placeholder content into a 3-card grid (ขย.9 enabled, ขย.11/13 disabled with "เร็วๆ นี้" badge). Keep the file's outlet-context wiring (`useOutletContext` + `setSummary(null)`) — only the JSX body changes.
- `src/App.tsx` (lines 67-71) — restructure the `fda` route from a leaf to a parent with index + child:
  ```tsx
  <Route path="fda">
    <Route index element={<ReportsFda />} />
    <Route path="khor-yor-9" element={<KhorYor9 />} />
  </Route>
  ```
- `electron/ipc/reports.ts` — **append** `reports:khorYor9` handler to the existing file (do NOT create a new file — 8 handlers already live here).
- `electron/preload.ts` — expose `reports.khorYor9({ date_from, date_to })`.
- `src/types/index.ts` — add the IPC signature + the returned `KhorYor9Row` shape.
- `src/index.css` — add the `@media print` block.
- The app shell (sidebar/titlebar containers) — add `className="no-print"` on the elements that should disappear when printing. Locations: `src/components/layout/Sidebar.tsx`, `src/components/layout/TitleBar.tsx`, plus the ขย.9 page's filter strip wrapper.

---

## Verification

1. `npm run electron:dev` → app boots.
2. Navigate `/reports` → click "รายงาน อย." tab → see 3 cards. Cards for ขย.11 and ขย.13 are visibly disabled (greyed + "เร็วๆ นี้" badge).
3. Click "ขย.9 บัญชีซื้อยา" card → navigates to `/reports/fda/khor-yor-9`.
4. Default range = this month. Verify the A4 preview shows: top-right "แบบ ข.ย. ๙", centered "บัญชีการซื้อยา", subtitle with the shop name from `settings.shop_name`, and the 8-column table.
5. Change date range → results re-fetch. Pick a range that includes a known GR with at least one `is_drug=1` line — verify the row shows up; pick a range with only non-drug purchases → verify the table is empty (filler rows only).
6. Receive a new GR with a drug, then view ขย.9 with that date → row appears. **ยกเลิก GR** (in `/manage/purchases`) → row disappears from ขย.9 (the `cancelled_at IS NULL` filter takes effect).
6b. Create a `is_bundle=1` product flagged `is_drug=1`, receive a GR with that bundle line → it must NOT appear in ขย.9 (the `is_bundle = 0` filter).
7. Click "พิมพ์" → browser print dialog opens. Inspect the preview: app chrome (sidebar, titlebar, filter strip) is hidden; only the A4 form is visible; page orientation = landscape; column-header row repeats on page 2+ when rows overflow.
8. Print to PDF and visually diff against the official template PDF — title, column order, column header wording must match exactly.
9. Spot-check Thai date format on at least one row: e.g. a GR dated `2026-05-20` displays `20 พ.ค. 2569`.
