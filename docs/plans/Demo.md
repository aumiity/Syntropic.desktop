# Demo.md — แผนแปลง Syntropic เป็น Web Demo

สถานะ: **ยังไม่เริ่ม** — รอ v.electron นิ่งพอที่จะปล่อยก่อน ค่อย sync ลง demo

## 1. เป้าหมาย

แปลงโปรเจคนี้เป็น **web demo** บน GitHub Pages เพื่อให้คนเข้ามาคลิกเล่น UI ได้ พร้อม sample data ที่รีเซ็ตทุก refresh **ไม่ใช่ production / ไม่ใช่ใช้งานจริง**

- Demo URL ปลายทาง (ตัวอย่าง): `https://aumiity.github.io/Syntropic.demo/`
- เป้าหมายผู้ใช้: คนภายนอกเข้ามาทดสอบหน้าตา + flow ของแอป
- ไม่ต้องการ: persistence ข้าม session, multi-user, printer/cash drawer จริง

## 2. กลยุทธ์: แยก repo ใหม่ + sync ทางเดียว

- **Repo ใหม่:** `/Users/anya/Documents/GitHub/Syntropic.demo` (ไม่มี git relationship กับ Electron repo)
- **ทำงานหลักใน Electron repo ตามปกติ** — fix bug, เพิ่ม feature, ปรับ UI
- **เมื่ออยากอัปเดต demo:** รัน `./sync-from-electron.sh` ใน demo repo (ดึง src/ จาก Electron มาทับ) → commit → push → GitHub Actions deploy
- **ห้ามแก้ไฟล์ที่ sync มาใน demo เด็ดขาด** (rsync จะทับทิ้ง) — แก้ใน Electron ก่อนเสมอ

### Stack
| Layer | Electron (เดิม) | Web Demo (ปลายทาง) |
|-------|----------------|--------------------|
| DB | better-sqlite3 (native) | **sql.js** (WASM, in-memory) |
| Seed | runtime ตอนเปิดแอป | pre-seeded `.sqlite` file ใน `public/` |
| IPC | `window.api.X` via ipcRenderer | `window.api.X` mounted from `src/lib/web-api/` |
| Print | native ESC/POS | modal preview + `window.print()` |
| Cash drawer | native | toast "เปิดลิ้นชักแล้ว (Demo)" |
| Window controls | Electron BrowserWindow | no-op (TitleBar `return null`) |
| Persistence | SQLite file on disk | in-memory, reset on refresh |
| Build | `electron-builder` | `vite build` → static |
| Deploy | `.exe` installer | GitHub Pages |

## 3. ไฟล์ที่ sync vs ไฟล์เฉพาะ demo

### Sync จาก Electron → demo (one-way, ทับทุกครั้งที่ sync)
```
src/components/                  ทั้งโฟลเดอร์ (UI primitives + Layout + TitleBar)
src/pages/                       ทั้งโฟลเดอร์
src/stores/                      ทั้งโฟลเดอร์
src/types/                       ทั้งโฟลเดอร์
src/lib/utils.ts
src/lib/accent-presets.ts
src/lib/tailwind-palette.ts
src/index.css
src/App.tsx
tailwind.config.js
postcss.config.js
electron/db/schema.ts            → demo: src/lib/web-api/db/schema.ts
electron/db/seed.ts              → demo: src/lib/web-api/db/seed.ts
electron/db/seed-data/           → demo: src/lib/web-api/db/seed-data/
```

### อยู่ใน demo เท่านั้น (sync script จะไม่แตะ)
```
src/lib/web-api/*.ts             sql.js implementations ของ namespaces
                                   (pos, products, purchase, people, reports, settings,
                                    printer, window, app, matcher, auth, dev)
src/lib/web-api/db/index.ts      sql.js init + db helper (mimic better-sqlite3 API)
src/main.tsx                     loading screen สำหรับ sql.js wasm init
index.html                       title "Syntropic RX (Demo)"
package.json                     ไม่มี electron, ไม่มี better-sqlite3, เพิ่ม sql.js
vite.config.ts                   ไม่มี electron plugins, มี base path สำหรับ GH Pages
tsconfig.json                    ปรับ paths (เอา @electron/* ออก)
public/sql-wasm.wasm             sql.js binary
public/demo.sqlite               pre-seeded database
.github/workflows/deploy.yml     auto-deploy ไป gh-pages branch
.gitignore                       เพิ่ม sync-from-electron.sh
sync-from-electron.sh            ใน .gitignore — ไม่ push ขึ้น GitHub
CLAUDE.md                        self-contained (copy กฎจาก Electron + เพิ่ม sql.js rules)
README.md                        คำอธิบาย demo + วิธี dev/build
PROGRESS.md                      single source of truth สถานะ phase
```

## 4. Sync script (เก็บไว้ใน demo, ไม่ push GitHub)

```bash
#!/usr/bin/env bash
# Syntropic.demo/sync-from-electron.sh
set -euo pipefail

SRC=../Syntropic.desktop
[ -d "$SRC" ] || { echo "✗ $SRC not found"; exit 1; }

echo "→ Syncing src/components/"
rsync -a --delete "$SRC/src/components/" src/components/

echo "→ Syncing src/pages/"
rsync -a --delete "$SRC/src/pages/" src/pages/

echo "→ Syncing src/stores/"
rsync -a --delete "$SRC/src/stores/" src/stores/

echo "→ Syncing src/types/"
rsync -a --delete "$SRC/src/types/" src/types/

echo "→ Copying single files"
cp "$SRC/src/index.css" src/
cp "$SRC/src/App.tsx" src/
cp "$SRC/src/lib/utils.ts" src/lib/
cp "$SRC/src/lib/accent-presets.ts" src/lib/
cp "$SRC/src/lib/tailwind-palette.ts" src/lib/
cp "$SRC/tailwind.config.js" .
cp "$SRC/postcss.config.js" .

echo "→ Syncing DB schema/seed"
mkdir -p src/lib/web-api/db/seed-data
cp "$SRC/electron/db/schema.ts" src/lib/web-api/db/
cp "$SRC/electron/db/seed.ts" src/lib/web-api/db/
rsync -a --delete "$SRC/electron/db/seed-data/" src/lib/web-api/db/seed-data/

echo "✓ Sync complete. Next steps:"
echo "  1. npm run build  # check for TS errors (new IPC handlers ที่ยังไม่ implement)"
echo "  2. ถ้าผ่าน → npm run dev เพื่อทดสอบ"
echo "  3. ถ้า error → เพิ่ม method ใน src/lib/web-api/<namespace>.ts"
```

## 5. การ patch ที่ต้องทำใน Electron repo (รอทำตอนเริ่ม Phase 0)

### `src/components/layout/TitleBar.tsx`
ตอนนี้ TitleBar เรียก `window.api.window.isMaximized()` ตรงๆ ตอน mount — บน web จะ crash เพราะไม่มี `window.api.window`

เพิ่ม guard ให้ return null เมื่อไม่มี `window.api?.window` (กรณี web build) — Electron ยังทำงานเหมือนเดิมเพราะ `window.api.window` ถูก expose จาก preload อยู่แล้ว

```tsx
export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const [hovered, setHovered] = useState<'close' | 'minimize' | 'maximize' | null>(null)
  const hasWindowApi = typeof window !== 'undefined' && !!window.api?.window?.minimize

  useEffect(() => {
    if (!hasWindowApi) return
    window.api.window.isMaximized().then(setMaximized)
  }, [hasWindowApi])

  if (!hasWindowApi) return null
  // ... rest unchanged
}
```

**ทำไมต้อง guard ก่อน hooks ไม่ได้:** React Rules of Hooks — hooks ต้องเรียกในลำดับเดียวกันทุก render ห้ามมี `if (...) return` ก่อน `useState`/`useEffect`

## 6. Phase Breakdown

ทำตามลำดับ phase 0 → 4 แต่ละ phase **commit แยกใน demo repo** และ **อัปเดต `PROGRESS.md`** ก่อน close session

### Phase 0 — Skeleton repo
**เป้าหมาย:** `npm run dev` ขึ้น UI ได้ — หน้า /theme + Layout + Sidebar เห็นครบ; หน้าที่ดึงข้อมูล error (caught) เพราะ stub throw

ขั้นตอน:
1. `mkdir Syntropic.demo && cd Syntropic.demo && git init -b main`
2. Copy: `src/`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `components.json`
3. สร้าง `package.json` ใหม่ (ลบ electron deps, เพิ่ม `sql.js`)
4. สร้าง `vite.config.ts` ใหม่ (ลบ electron plugins, `base: '/Syntropic.demo/'`)
5. สร้าง `src/lib/web-api/index.ts` — stub ทุก namespace + method, throw `Error('Not implemented in demo build')`
6. Mount `window.api = stub` ใน `src/main.tsx` ก่อน React render
7. แก้ `src/components/layout/TitleBar.tsx` — ถ้า sync จาก Electron ก็ได้ guard นี้แล้ว
8. เขียน `CLAUDE.md` (copy จาก Electron CLAUDE.md + เปลี่ยน Electron section เป็น sql.js section + เพิ่ม sync rules)
9. เขียน `README.md`
10. เขียน `PROGRESS.md` — phase 0 in_progress
11. เขียน `sync-from-electron.sh`, add to `.gitignore`
12. `npm install && npm run dev` → ตรวจสอบ UI

**ออกจาก phase นี้เมื่อ:** dev server รัน, หน้า `/theme` แสดงเต็ม, console error เฉพาะ "Not implemented" ตามคาด

---

### Phase 1 — DB foundation (sql.js)
**เป้าหมาย:** Console เรียก `db.prepare('SELECT * FROM products LIMIT 5').all()` ได้ข้อมูล seed กลับมา

ขั้นตอน:
1. `npm install sql.js --ignore-scripts`
2. Copy `electron/db/schema.ts`, `seed.ts`, `seed-data/` ไป `src/lib/web-api/db/`
3. สร้าง `src/lib/web-api/db/index.ts`:
   - โหลด `sql-wasm.wasm` (จาก public/ — copy จาก `node_modules/sql.js/dist/sql-wasm.wasm`)
   - Init `SQL.Database()`
   - Wrapper ที่ mimic better-sqlite3 API: `prepare(sql)` คืน object ที่มี `.run/.all/.get`
   - `transaction(fn)` ใช้ `BEGIN`/`COMMIT`
4. รัน `runSchema(db)` + `runSeed(db)` ตอน boot (ใน `main.tsx`) — แสดง loading screen ระหว่าง init
5. Expose `(window as any).db = db` สำหรับ debug

**ออกจาก phase นี้เมื่อ:** DevTools รัน `db.prepare('SELECT name FROM sqlite_master WHERE type="table"').all()` เห็นตารางครบ; query products เห็นข้อมูล seed

**Gotcha:**
- sql.js bind params ใช้ `?` หรือ `@name` คล้าย better-sqlite3 แต่ result format ต่างกัน (`exec()` คืน `[{columns, values}]` — ต้อง wrap)
- `Date` หรือ `bigint` ที่ better-sqlite3 รับได้บางที่ sql.js ต้อง convert เป็น string/number ก่อน

---

### Phase 2a — API: settings + lookups (read-only first)
**เป้าหมาย:** หน้า Settings tabs (Categories, Units, Drug Types, Label, Shop, Theme) ทำงานครบ

Port จาก `electron/ipc/settings.ts`:
- Read: `getShop`, `listCategories`, `listUnits`, `listDrugTypes`, `listLabel{Frequencies,Dosages,MealRelations,Times,Advices}`, `allUnits`, `allCategories`, `allDrugTypes`, `allDosageForms`, `getLabelSettings`, `getThemeColors`, `getThemeFontSize`, `getThemeFonts`
- Write: `saveCategory`, `saveUnit`, `reorderCategories`, `saveShop`, `saveLabelSettings`, `saveTheme*` (เขียนลง in-memory DB)

Mount เข้า `window.api.settings`

**ออกจาก phase นี้เมื่อ:** เปิดหน้า Settings → ทุก tab โหลดข้อมูล, แก้แล้ว reflect ใน UI (รีเซ็ตเมื่อ refresh ตามคาด)

---

### Phase 2b — API: products + lots
**เป้าหมาย:** Products list + EditProduct ทุก tab ทำงานครบ

Port จาก `electron/ipc/products.ts`:
- Read: `list`, `get`, `getLots`, `priceHistory`, `stockMovements`, `stockStats`, `searchGenericNames`, `getLabels`
- Write: `create`, `update`, `updatePrice`, `addUnit`, `updateUnit`, `deleteUnit`, `saveLabel`, `deleteLabel`
- Stock: `adjustStock`, `adjustLot`, `adjustLotBatch`, `updateLot`, `expireLot`

**Gotcha:**
- `products:update` dynamic SQL จาก `Object.keys(data)` — port มาตรงๆ ได้ แต่ allow-list ที่ Electron มีต้องตามมาด้วย (CLAUDE.md กฎ `"...form` blindly")
- `updateLot` logic ซับซ้อน: `qty=0 → is_closed=1`, recompute `products.cost_price` weighted avg ของ open lots — port เป็นชุด ทดสอบให้ครบ

**ออกจาก phase นี้เมื่อ:** Products list filter/search ได้, EditProduct tabs ทั้งหมด (General/Units/Lots/Labels/Price History/Stock Movements) ทำงาน

---

### Phase 2c — API: POS (FEFO + saveBill)
**เป้าหมาย:** ขายของได้ + return ได้

Port จาก `electron/ipc/pos.ts` + `electron/ipc/codes.ts`:
- `searchProducts` (เร็ว — LIKE หรือ FTS), `searchCustomers`, `addCustomer`
- `getDailyStats`
- `saveBill` — FEFO deduction, `sale_item_lots`, `stock_movements`, generate `RC-YYYYMMDD-NNN`
- `returnItems` — generate `RT-YYYYMMDD-NNN`, restore lots, log
- Walk-in C0000 invariant: helper `walkInCustomerId(db)` (port จาก codes.ts)

**Gotcha:**
- FEFO: `ORDER BY expiry_date ASC, id ASC` (ASC ของ id เป็น tiebreaker)
- `sales.customer_id` ห้ามเขียน NULL — resolve เป็น C0000 ทุก path

**ออกจาก phase นี้เมื่อ:** POS — เพิ่มสินค้า, สลับ unit, ชำระเงิน, บันทึก, return — ทำงานครบ

---

### Phase 2d — API: people
Port `electron/ipc/people.ts`:
- Customers/Suppliers/Staff: `list`, `get`, `save`, `setStatus`
- `allSuppliers`
- C0000 guards (saveCustomer/setCustomerStatus throw ถ้าชี้ C0000; listCustomers/searchCustomers exclude C0000)

**ออกจาก phase นี้เมื่อ:** หน้า People ทุก sub-tab ทำงาน

---

### Phase 2e — API: purchase + matcher
Port `electron/ipc/purchase.ts` + `matcher.ts`:
- Purchase: `nextGRNumber`, `save`, `history`, `getReceipt`, `cancel`, `updateHeader`
- Matcher: `matchLines`, `saveAliases`, `listAliases`, `exportCSV` (CSV → Blob + download link)

**ออกจาก phase นี้เมื่อ:** Purchase + PurchaseIntake ทำงานครบ

---

### Phase 2f — API: reports + stubs
- Reports: port `electron/ipc/reports.ts` — `salesList`, `getSale`, `getSaleByInvoice`, `voidSale`, `purchaseList`, `expiringLots`
- Auth stub: `getCurrentUser` คืน mock user
- Dev stub: `seedSalesHistory` (port logic เผื่อ)
- App stub: `getVersion` คืน `"demo-1.0"`
- Window stub: ทุก method no-op (TitleBar guard return null อยู่แล้ว)
- Printer stub:
  - `printReceipt` → เปิด modal preview ใบเสร็จ + `window.print()`
  - `openCashDrawer` → toast "เปิดลิ้นชักแล้ว (Demo)"

**ออกจาก phase นี้เมื่อ:** Manage/Reports + ใบเสร็จ preview ทำงาน

---

### Phase 3 — Polish
- Pre-seed: รัน seed → `db.export()` → save เป็น `public/demo.sqlite` (โหลดเร็วกว่ารัน seed ทุก boot)
- Demo Mode badge ที่ Header
- Banner ครั้งแรก: "นี่คือ demo — ข้อมูลจะรีเซ็ตเมื่อ refresh"
- ตรวจ console ทุกหน้า — ลบ stub throws ที่ยังเหลือ

**ออกจาก phase นี้เมื่อ:** คลิกทุกหน้าไม่มี error ใน console

---

### Phase 4 — Deploy GitHub Pages
- Set `base: '/Syntropic.demo/'` ใน `vite.config.ts`
- สร้าง `.github/workflows/deploy.yml` (build → deploy ไป `gh-pages` branch)
- GitHub: Settings → Pages → `gh-pages` branch
- ทดสอบ URL: เช็ค wasm loading + asset paths บน production
- เพิ่ม live URL ใน README

**ออกจาก phase นี้เมื่อ:** Public URL เปิดได้, demo ทำงานครบ

## 7. Session-resumability

`Syntropic.demo/PROGRESS.md` = single source of truth สำหรับ session ใหม่ ทุก phase ที่จบให้:
1. Update `PROGRESS.md` — phase ไหนเสร็จ, ถัดไปเริ่มจากไฟล์ไหน, gotcha อะไร
2. `git commit -m "phase X: <name>"` — `git log` กลายเป็น timeline
3. ลบ TODO/stub ที่ทำเสร็จ ออกจาก `web-api/index.ts` — งานที่เหลือเห็นจากโค้ดเอง

**Session ใหม่ลำดับการอ่าน:**
1. `Syntropic.demo/PROGRESS.md` (สถานะ)
2. `Syntropic.demo/CLAUDE.md` (กฎ — self-contained, ไม่ต้องไปอ่าน Electron)
3. `Syntropic.demo/src/lib/web-api/` (ดู namespace ที่เสร็จแล้ว)
4. `Syntropic.desktop/electron/ipc/<namespace>.ts` (reference สำหรับ port ตัวถัดไป)

## 8. ข้อตกลงที่ผ่านมา (memory)

- ✅ Repo ใหม่แยก ไม่มี git relationship กับ Electron
- ✅ ตั้งข้าง Electron: `/Users/anya/Documents/GitHub/Syntropic.demo`
- ✅ รีเซ็ตข้อมูลทุก refresh (ไม่ใช้ localStorage)
- ✅ Deploy GitHub Pages
- ✅ Patch `TitleBar.tsx` ใน Electron repo ได้ (เพิ่ม guard) — **ยังไม่ได้ทำ ทำตอนเริ่ม Phase 0**
- ✅ `sync-from-electron.sh` อยู่ใน `.gitignore` (เครื่องใครเครื่องมัน sync)
- ✅ CLAUDE.md ของ demo เป็น self-contained (copy กฎทั้งหมดจาก Electron)
- ⏸️ เริ่ม Phase 0 — รอ Electron นิ่งก่อน

## 9. เริ่มเมื่อไหร่

เมื่อ v.electron อยู่ในสภาพที่ "พอใจปล่อยได้" ค่อยเปิด session ใหม่ บอก Claude ให้:
> "อ่าน Demo.md แล้วเริ่ม Phase 0"

Claude จะเข้าใจ context ทันทีจากไฟล์นี้ + ไม่ต้องอธิบายซ้ำ
