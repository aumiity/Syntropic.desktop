# E2E readiness pass — 2026-07-05 (MacBook)

**ผล: ชุด e2e ที่รันได้ทั้งหมด 11 suite / 201 checks PASS กับ Electron จริง** (vite :5173 + temp `--user-data-dir` — ไม่แตะ DB จริง)

| Suite | ผล |
|---|---|
| verify-role-permissions | 18/18 |
| verify-role-permissions-ui | 21/21 |
| verify-pos-unit-guard | 10/10 |
| verify-gr-price-edit | 11/11 |
| verify-purchase-search | 8/8 |
| verify-excel-export | 24/24 |
| verify-excel-export-phase2 | 16/16 |
| verify-manage-export | 11/11 |
| verify-dashboard-rebuild | 40/40 |
| login-security | 29/29 |
| **verify-sale-cycle (ใหม่)** | 13/13 |

## เทสต์ใหม่: `tests/e2e/verify-sale-cycle.mjs`
วงจรขายหน้าร้านเต็มวง: GR 2 ล็อต (คนละ expiry) → `pos.saveBill` walk-in ข้ามล็อต → FEFO ตัดล็อตหมดอายุก่อนจนหมด + ล็อต 0 หายจาก POS availability → daily stats → `voidSale` คืนสต็อกครบ + status voided

## แก้เทสต์เก่าให้ทันระบบปัจจุบัน (ยกชุด)
- **electron path cross-platform** ทุกไฟล์ที่เคย hardcode `electron.exe`/mac path (7 ไฟล์)
- **role rename admin→owner**: เทสต์ที่ `u.role==='admin'` หา user ไม่เจอ → ยอมรับทั้ง `owner`/`admin`
- **NEEDS_OVERRIDE**: staff เรียก key ที่ state=override โดยไม่แนบ credential ได้ error `NEEDS_OVERRIDE` (ไม่ใช่ FORBIDDEN) — ยัง block เหมือนเดิม (permissions.ts:49)
- **T9 login-security + DEV auto-login**: `App.tsx` LoginGate auto-devLogin หลัง reload (DEV เท่านั้น, double-gated `import.meta.env.DEV` + `app.isPackaged`) → reload-clear ถูก mask; เทสต์เปลี่ยนเป็น reload→logout→FORBIDDEN
- **locator ชนกัน**: `title="ก่อนหน้า"` มีทั้งใน period-picker และ pagination ตาราง Dashboard → scope ด้วย `[class*="w-9"]`; ปุ่ม Export ย้ายไปแถว TabStrip บน (ยุบ stock tabs 2026-06-26) → เทสต์ manage-export ยอมรับแถว tab ใดก็ได้

## FIX จริง: `tsconfig.node.json` (production build เคยล้มแน่นอน)
`npm run build` (`tsc -p tsconfig.node.json`) เคยพัง 5 errors: ไม่มี `target` (Set iteration TS2802 ×2 ใน env.ts) + electron import ไฟล์ src นอก include (TS6307: env/thresholds, permissions/registry, label/sections) → เพิ่ม `"target": "ES2022"` + include 3 ไฟล์ src นั้น; ทั้ง tsconfig.json และ tsconfig.node.json ผ่านแล้ว exit 0

## รอบ 2 (บ่ายวันเดียวกัน) — เขียนใหม่ 2 stale + VAT flow ใหม่
- **`verify-purchases-dashboard.mjs` เขียนใหม่ 26/26 PASS** — Part A (IPC taxonomy 5-bucket + financeSummary) คงเดิม; UI กลับด้านเป็น ABSENCE (Phase B) + ยืนยันยอดซื้อ 300 ขึ้น Dashboard MetricStrip; staff เห็น view เดียวกับ admin + FORBIDDEN gate
- **`verify-finance-panel.mjs` เขียนใหม่ 12/12 PASS** — ฝั่ง Sales มิเรอร์กัน; **กับดัก: Manage/Sales = index route → `#/manage` ไม่ใช่ `#/manage/sales`**
- **`verify-vat-flow.mjs` ใหม่ 31/31 PASS** — ครอบ VAT phasing ทั้งวง: NO-VAT strip/force, upgradeToVat validation+audit+ซ้ำ, VAT sale snapshot → vatSummary (voided excluded), GR inclusive extract (214→14) + cost GROSS + per-bill none, expense has_tax_invoice forcing, net_vat ภ.พ.30 (−14), staff FORBIDDEN, guarded downgrade (เหตุผล+รหัสผ่าน+lockout), hasVatHistory คงแท็บภาษีหลัง downgrade, snapshot เก่าไม่ถูกแตะ

## ยังค้าง / จุดเสี่ยงที่ e2e แตะไม่ได้
- งานพิมพ์จริงทุกชนิด (สลิป/ใบกำกับ/สติ๊กเกอร์/ฉลากยา/ข.ย./GR) ยังไม่เคยยิงเครื่องพิมพ์จริง
- VAT dialog UI (UpgradeVatDialog/DowngradeVatDialog/POS VAT checkbox) ยังไม่ click-test ด้วยมือ — e2e คุม IPC+แท็บแล้ว; ใบลดหนี้ยังไม่สร้างตามแผน
- ห้ามใช้ dev mode หน้าร้าน (DEV auto-login = เปิดแอปเป็น owner ทันที) — ต้อง build production + pre-build cleanup ก่อน ([[project_prebuild_cleanup]])
