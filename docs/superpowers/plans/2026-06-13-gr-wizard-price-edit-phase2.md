# GR Wizard Price-Edit — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ Wizard step 4 แก้ราคาขายได้ **ทุกหน่วยที่ขายได้** (หน่วยฐาน + variants) ครบทั้ง **ราคาปลีก/ส่ง1/ส่ง2** — หน่วยฐานเขียนผ่าน `products:updatePrice` (log + gate), หน่วยอื่นผ่าน `products:updateUnitPrice` ใหม่ (gate, **ไม่ log** ตาม R5)

**Architecture:** ต่อยอดจาก Phase 1 (commit `a10b91e`). เพิ่ม handler `products:updateUnitPrice` สำหรับเขียน `product_units.{price_retail,price_wholesale1,price_wholesale2}` (allow-listed 3 คอลัมน์, admin-gated, ไม่แตะ `price_logs` → ไม่ต้องแก้ schema). ฝั่ง wizard เปลี่ยน step 4 จาก "ช่องราคาเดียว" → "ตารางทุกหน่วยขายได้ × 3 ราคา" โดยอ้างหน่วยจาก `prod.units` (is_for_sale) ไม่ใช่ `purchase_units` (กับดักที่ spec §7 เตือน). เขียนทันทีตอนยืนยัน row (D1) ด้วย override ที่ปลดล็อกไว้ (กลไก Phase 1).

**Tech Stack:** Electron 31 + better-sqlite3, React 18, Playwright `.mjs` e2e, `tsc`.

**SSOT (design):** `docs/superpowers/specs/2026-06-13-gr-wizard-price-edit-design.md` (§5.1 B3, §5.2 R3, §6 เฟส 2, §7 caution หน่วยรับเข้า≠หน่วยขาย)

**ฐานที่ต่อยอด (Phase 1 มีแล้ว):** `auth:verifyAdmin`, `useManagerOverride` ใน wizard, state `priceUnlocked`/`grantedOverride`/`canEditPrice`, `requestPriceUnlock`, banner ทุนเปลี่ยน, `stored_last_cost`.

---

## หมายเหตุการทดสอบ
เหมือน Phase 1 — standalone Playwright `.mjs` + `tsc`. ต่อยอดสคริปต์เดิม `tests/e2e/verify-gr-price-edit.mjs`.
```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
npx tsc --noEmit
```

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `electron/ipc/products.ts` | เพิ่ม handler `products:updateUnitPrice` (B3) | modify |
| `electron/preload.ts` | เพิ่ม `window.api.products.updateUnitPrice` | modify |
| `src/pages/Purchase/AddProductWizard.tsx` | ProductUnitOption +ws1/ws2; `sell_units` ใน row; step-4 ตารางทุกหน่วย; confirm เขียนหลายหน่วย/หลายราคา | modify |
| `src/pages/Purchase/index.tsx` | `buildRowFromProduct` เติม `sell_units`; ProductSuggestion +ws1/ws2 | modify |
| `tests/e2e/verify-gr-price-edit.mjs` | เพิ่ม check B3 (หน่วยอื่นเขียน+ไม่ log; ฐาน ws1 log) | modify |
| `docs/claude/business-logic.md` | อัปเดต: ราคาทุกหน่วยแก้จาก wizard | modify |

---

## Task 1: B3 — handler `products:updateUnitPrice` + preload

**Files:**
- Modify: `electron/ipc/products.ts` (หลัง `products:updatePrice` ~บรรทัด 499)
- Modify: `electron/preload.ts` (products namespace, ใกล้บรรทัด 20)
- Modify: `tests/e2e/verify-gr-price-edit.mjs`

- [ ] **Step 1: เพิ่ม check (failing) ใน e2e — updateUnitPrice เขียน product_units และไม่ log**

ต่อท้าย `tests/e2e/verify-gr-price-edit.mjs` ก่อน `}catch` (หลังบล็อก D1 เดิม) เพิ่ม:
```js
  // === B3: updateUnitPrice เขียน product_units.price_retail, ไม่ log price_logs ===
  const addU=await apiCall(page,'products.addUnit',{product_id:pid,unit_name:'กล่อง',qty_per_base:100,price_retail:300,price_wholesale1:0,price_wholesale2:0,is_for_sale:1,is_disabled:0})
  const puId=addU.value?.id
  const logsBefore=((await apiCall(page,'products.priceHistory',pid,50)).value||[]).length
  const uu=await apiCall(page,'products.updateUnitPrice',puId,{price_retail:333,price_wholesale1:0,price_wholesale2:0})
  const full=await apiCall(page,'products.get',pid)
  const unit=(full.value?.units||full.value?.purchase_units||[]).find(u=>u.id===puId)
  const logsAfter=((await apiCall(page,'products.priceHistory',pid,50)).value||[]).length
  check('B3: updateUnitPrice ok', uu.ok, JSON.stringify(uu))
  check('B3: product_units.price_retail = 333', unit && Number(unit.price_retail)===333, 'got='+(unit&&unit.price_retail))
  check('B3: ไม่มี price_logs เพิ่มจากหน่วยอื่น', logsAfter===logsBefore, 'before='+logsBefore+' after='+logsAfter)
```
> หมายเหตุ: ถ้า `products.get` ไม่คืน `units`/`purchase_units` ให้ hunter ปรับวิธีอ่าน (เช่นใช้ `products.getUnits` ถ้ามี) — เป็น harness detail.

- [ ] **Step 2: รัน e2e ให้เห็น FAIL**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: `FAIL B3: updateUnitPrice ok` — `no api:products.updateUnitPrice`

- [ ] **Step 3: เพิ่ม handler ใน `electron/ipc/products.ts`**

วางต่อจาก handler `products:updatePrice` (ก่อน `products:priceHistory`):
```ts
  // ตั้งราคาขายของ "หน่วยที่ไม่ใช่ฐาน" (product_units row หนึ่ง ๆ). admin-gated.
  // ตั้งใจ NOT log price_logs — ประวัติราคาเก็บเฉพาะหน่วยฐานเท่านั้น (decision R5).
  // Allow-list: เขียนได้แค่ 3 คอลัมน์ราคา ห้าม build SQL จาก key อื่น (กฎ HARD).
  ipcMain.handle('products:updateUnitPrice', (_e, productUnitId: number, data: { price_retail?: number; price_wholesale1?: number; price_wholesale2?: number }, override?: Override) => {
    requireAdmin(_e, override)
    const db = getDb()
    const allowed = ['price_retail', 'price_wholesale1', 'price_wholesale2'] as const
    const sets: string[] = []
    const params: Record<string, number> = {}
    for (const k of allowed) {
      if (data[k] != null && isFinite(Number(data[k]))) {
        sets.push(`${k} = @${k}`)
        params[k] = Number(data[k])
      }
    }
    if (sets.length === 0) return { product_unit_id: productUnitId, changed: false }
    const info = db.prepare(
      `UPDATE product_units SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE id = @id`
    ).run({ ...params, id: productUnitId })
    return { product_unit_id: productUnitId, changed: info.changes > 0 }
  })
```

- [ ] **Step 4: เพิ่ม method ใน `electron/preload.ts`**

ในก้อน `products: { ... }` (ใกล้ `updatePrice` บรรทัด 20) เพิ่ม:
```ts
    updateUnitPrice: (productUnitId: number, data: { price_retail?: number; price_wholesale1?: number; price_wholesale2?: number }, override?: { userId: number; password: string }) =>
      ipcRenderer.invoke('products:updateUnitPrice', productUnitId, data, override),
```

- [ ] **Step 5: รัน e2e ให้ผ่าน**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: `PASS B3: updateUnitPrice ok`, `PASS B3: product_units.price_retail = 333`, `PASS B3: ไม่มี price_logs เพิ่มจากหน่วยอื่น`

- [ ] **Step 6: typecheck + commit**

```powershell
npx tsc --noEmit
git add electron/ipc/products.ts electron/preload.ts tests/e2e/verify-gr-price-edit.mjs
git commit -m @'
feat(products): add products:updateUnitPrice (admin-gated, not logged)

Writes a product_units row''s price_retail/wholesale1/wholesale2 with an
allow-list (3 price columns only). Intentionally does NOT write price_logs
— price history stays base-unit-only (no schema change).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 2: Wizard — ขยาย ProductUnitOption + เก็บ sell_units ลง row

**Files:**
- Modify: `src/pages/Purchase/AddProductWizard.tsx` (interfaces, `pickProduct`)
- Modify: `src/pages/Purchase/index.tsx` (`ProductSuggestion`, `buildRowFromProduct`)

- [ ] **Step 1: ขยาย `ProductUnitOption` + เพิ่มชนิด `SellUnitPrice` + ฟิลด์ row**

ใน `AddProductWizard.tsx`:
```ts
export interface ProductUnitOption {
  id: number
  unit_name: string
  qty_per_base: number
  price_retail?: number
  price_wholesale1?: number
  price_wholesale2?: number
}

// ราคาขายต่อหน่วยที่แก้ได้ใน step 4 (ฐาน + variants ที่ is_for_sale).
// product_unit_id === null คือหน่วยฐาน (เขียนผ่าน updatePrice/log); ตัวเลข = product_units.id (updateUnitPrice/ไม่ log)
export interface SellUnitPrice {
  key: string
  product_unit_id: number | null
  unit_name: string
  qty_per_base: number
  price_retail: number
  price_wholesale1: number
  price_wholesale2: number
}
```
ใน interface `ReceiptRow` เพิ่ม:
```ts
  /** หน่วยที่ขายได้ (ฐาน + is_for_sale variants) สำหรับตัวแก้ราคา step 4 — capture ตอนเลือกสินค้า */
  sell_units?: SellUnitPrice[]
```

- [ ] **Step 2: เพิ่ม helper สร้าง sell_units (วางใต้ helpers ของไฟล์ ~บรรทัด 98)**

```ts
// สร้างรายการหน่วยที่ขายได้สำหรับตัวแก้ราคา: ฐาน (จาก product) ก่อน แล้ว variants is_for_sale (จาก p.units).
// ใช้ p.units (is_for_sale) ไม่ใช่ purchase_units — ตัวแก้ราคาคุมเฉพาะหน่วยที่ "ขาย" ได้ (spec §7)
function buildSellUnits(p: { unit_name?: string; price_retail?: number; price_wholesale1?: number; price_wholesale2?: number; units?: ProductUnitOption[] }): SellUnitPrice[] {
  const baseName = p.unit_name || 'ชิ้น'
  const base: SellUnitPrice = {
    key: 'base', product_unit_id: null, unit_name: baseName, qty_per_base: 1,
    price_retail: p.price_retail ?? 0,
    price_wholesale1: p.price_wholesale1 ?? 0,
    price_wholesale2: p.price_wholesale2 ?? 0,
  }
  const variants = (p.units ?? [])
    .filter(u => u.unit_name !== baseName)
    .map<SellUnitPrice>(u => ({
      key: String(u.id), product_unit_id: u.id, unit_name: u.unit_name, qty_per_base: u.qty_per_base,
      price_retail: u.price_retail ?? 0,
      price_wholesale1: u.price_wholesale1 ?? 0,
      price_wholesale2: u.price_wholesale2 ?? 0,
    }))
  return [base, ...variants]
}
```

- [ ] **Step 3: set `sell_units` ใน `pickProduct`**

ในบล็อก `setRow(r => ({ ...` ของ `pickProduct` เพิ่ม:
```ts
      sell_units: buildSellUnits(p),
```
> `p` ที่นี่คือ `ProductSuggestion` — ต้องมี `units`, `price_wholesale1/2` (ดู Step 4 ของ index.tsx)

- [ ] **Step 4: เพิ่ม fields ใน `ProductSuggestion` (index.tsx) + set sell_units ใน buildRowFromProduct**

ใน `src/pages/Purchase/index.tsx` interface `ProductSuggestion` เพิ่ม (ถ้ายังไม่มี):
```ts
  price_wholesale1?: number
  price_wholesale2?: number
```
ในฟังก์ชัน `buildRowFromProduct` (import `buildSellUnits` ไม่ได้เพราะอยู่คนละไฟล์ — export มันจาก AddProductWizard แล้ว import มา) ทำดังนี้:

4a. ที่ `AddProductWizard.tsx` export helper: เปลี่ยน `function buildSellUnits` เป็น `export function buildSellUnits`.

4b. ที่ `index.tsx` import เพิ่ม: `import { AddProductWizard, buildSellUnits, type ReceiptRow, type ProductUnitOption, emptyRow } from './AddProductWizard'`

4c. ใน return ของ `buildRowFromProduct` เพิ่ม:
```ts
      sell_units: buildSellUnits(p),
```

- [ ] **Step 5: typecheck + commit**

```powershell
npx tsc --noEmit
git add src/pages/Purchase/AddProductWizard.tsx src/pages/Purchase/index.tsx
git commit -m @'
feat(purchase): capture sellable units + per-unit prices into ReceiptRow

ProductUnitOption gains wholesale1/2; new SellUnitPrice[] (base + is_for_sale
variants) is captured on pick/import for the step-4 all-units price editor.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 3: Wizard step 4 — ตารางแก้ราคาทุกหน่วย (แทนช่องเดียว)

**Files:**
- Modify: `src/pages/Purchase/AddProductWizard.tsx` (state drafts, init effect, step-4 JSX)
- อ่านก่อน: `docs/claude/ui-theming.md` (token, ไม่มี emoji, ไม่มี palette literal, ไม่เขียน raw HTML — ใช้ `Input`/`PriceInput`)

- [ ] **Step 1: เพิ่ม state drafts ราคา (ใกล้ state Phase 1)**

```ts
  // drafts ราคาต่อหน่วย: key = SellUnitPrice.key ('base' | product_unit_id) → 3 ราคา (string)
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { retail: string; ws1: string; ws2: string }>>({})
```

- [ ] **Step 2: init drafts ตอนเปิด dialog/เลือกสินค้า**

ใน init effect `useEffect(() => { if (!open) return ... }, [open, editing])` เพิ่มท้าย (หลัง reset Phase 1):
```ts
    const su = (editing ?? base).sell_units ?? []
    const drafts: Record<string, { retail: string; ws1: string; ws2: string }> = {}
    for (const u of su) drafts[u.key] = { retail: String(u.price_retail || ''), ws1: String(u.price_wholesale1 || ''), ws2: String(u.price_wholesale2 || '') }
    setPriceDrafts(drafts)
```
> `base` คือตัวแปร row เริ่มต้นใน effect นี้ (`const base = editing ? {...editing} : emptyRow()`). ถ้า `pickProduct` set sell_units หลัง mount ต้อง sync เพิ่ม — ดู Step 3.

- [ ] **Step 3: sync drafts เมื่อ sell_units เปลี่ยน (หลังเลือกสินค้าใน step 1)**

เพิ่ม effect:
```ts
  // เมื่อเลือกสินค้าใหม่ (sell_units มาทีหลัง pick) → seed drafts ถ้ายังว่าง
  useEffect(() => {
    const su = row.sell_units ?? []
    if (su.length === 0) return
    setPriceDrafts(prev => {
      if (Object.keys(prev).length > 0) return prev
      const d: Record<string, { retail: string; ws1: string; ws2: string }> = {}
      for (const u of su) d[u.key] = { retail: String(u.price_retail || ''), ws1: String(u.price_wholesale1 || ''), ws2: String(u.price_wholesale2 || '') }
      return d
    })
  }, [row.sell_units])
```

- [ ] **Step 4: แทน UI ราคาเดิมใน step 4 ด้วยตารางทุกหน่วย**

แทนบล็อก `<div className="grid grid-cols-2 gap-5 items-end"> ... PriceInput ... </div>` (ราคาขาย/หน่วย เดิม) ด้วยตารางนี้ (วางหลัง banner ทุนเปลี่ยน):
```tsx
                <div className="rounded-card border border-border overflow-hidden">
                  <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-px bg-border text-sm">
                    {/* header */}
                    <div className="bg-muted px-3 py-2 font-semibold text-muted-foreground">หน่วย</div>
                    <div className="bg-muted px-3 py-2 font-semibold text-muted-foreground text-right">ราคาปลีก</div>
                    <div className="bg-muted px-3 py-2 font-semibold text-muted-foreground text-right">ราคาส่ง 1</div>
                    <div className="bg-muted px-3 py-2 font-semibold text-muted-foreground text-right">ราคาส่ง 2</div>
                    {(row.sell_units ?? []).map(u => {
                      const d = priceDrafts[u.key] ?? { retail: '', ws1: '', ws2: '' }
                      const setD = (field: 'retail' | 'ws1' | 'ws2', v: string) =>
                        setPriceDrafts(prev => ({ ...prev, [u.key]: { ...(prev[u.key] ?? { retail: '', ws1: '', ws2: '' }), [field]: v } }))
                      return (
                        <React.Fragment key={u.key}>
                          <div className="bg-card px-3 py-2 flex items-center gap-2">
                            <span className="font-semibold">{u.unit_name}</span>
                            {u.qty_per_base > 1 && <span className="text-xs text-foreground-subtle">×{u.qty_per_base}</span>}
                          </div>
                          <div className="bg-card px-2 py-1.5">
                            <PriceInput value={d.retail} onChange={v => setD('retail', v)} readOnly={!canEditPrice} onFocus={e => e.currentTarget.select()} className={`h-9 text-right ${!canEditPrice ? 'opacity-70 cursor-not-allowed' : ''}`} />
                          </div>
                          <div className="bg-card px-2 py-1.5">
                            <PriceInput value={d.ws1} onChange={v => setD('ws1', v)} readOnly={!canEditPrice} onFocus={e => e.currentTarget.select()} className={`h-9 text-right ${!canEditPrice ? 'opacity-70 cursor-not-allowed' : ''}`} />
                          </div>
                          <div className="bg-card px-2 py-1.5">
                            <PriceInput value={d.ws2} onChange={v => setD('ws2', v)} readOnly={!canEditPrice} onFocus={e => e.currentTarget.select()} className={`h-9 text-right ${!canEditPrice ? 'opacity-70 cursor-not-allowed' : ''}`} />
                          </div>
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
                {!canEditPrice && (
                  <Button type="button" variant="elevated" size="sm" onClick={requestPriceUnlock} className="mt-3 gap-1.5">
                    <Lock className="size-3.5" /> ขอสิทธิ์แก้ราคา
                  </Button>
                )}
```
> ลบช่อง `sellPrice` PriceInput เดิม (Phase 1) ออก. การ์ดกำไร (ทุน/กำไร/กำไร%) ด้านล่างยังเก็บได้ แต่ให้คิดจากราคาปลีก "หน่วยที่รับเข้า" — ดู Step 5.

- [ ] **Step 5: ปรับการ์ดกำไรให้อ้างราคาปลีกของหน่วยที่รับเข้า**

แทน `const sellNum = parseFloat(sellPrice) || 0` ด้วย:
```ts
  // ราคาปลีกของ "หน่วยที่รับเข้า" (row.unit_name) จาก drafts — ใช้คำนวณกำไรการ์ดสรุป
  const receivedUnitKey = (row.sell_units ?? []).find(u => u.unit_name === row.unit_name)?.key ?? 'base'
  const sellNum = parseFloat(priceDrafts[receivedUnitKey]?.retail ?? '') || 0
```
> ลบ state `sellPrice` + `setSellPrice` ทั้งหมด (Phase 1) และทุกที่ที่อ้าง (selectUnit, pickProduct seed, confirm) — แทนด้วย drafts. ตรวจ `selectUnit`/`pickProduct` ให้ไม่อ้าง `setSellPrice` อีก (ลบบรรทัดนั้น). railSub case 3 ที่ใช้ `sellPrice` → เปลี่ยนเป็น `priceDrafts[receivedUnitKey]?.retail`.

- [ ] **Step 6: typecheck**

```powershell
npx tsc --noEmit
```
Expected: ไม่มี error (แก้ทุกจุดที่อ้าง `sellPrice` จนหมด)

- [ ] **Step 7: commit**

```powershell
git add src/pages/Purchase/AddProductWizard.tsx
git commit -m @'
feat(purchase): all-units price editor table in GR wizard step 4

Replaces the single sell-price input with a unit x (retail/ws1/ws2) grid
covering the base unit + sellable variants, gated by the Phase-1 admin
unlock. Profit card now reads the received unit''s retail draft.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 4: Wizard confirm — เขียนราคาทุกหน่วยที่เปลี่ยน

**Files:**
- Modify: `src/pages/Purchase/AddProductWizard.tsx` (`confirm`)

- [ ] **Step 1: เขียน confirm ใหม่ (วนทุกหน่วย, เขียนเฉพาะที่เปลี่ยน)**

แทนฟังก์ชัน `confirm` (Phase 1):
```ts
  const confirm = async () => {
    const units = row.sell_units ?? []
    if (row.product_id > 0 && canEditPrice) {
      try {
        for (const u of units) {
          const d = priceDrafts[u.key]
          if (!d) continue
          const nRetail = parseFloat(d.retail); const nWs1 = parseFloat(d.ws1); const nWs2 = parseFloat(d.ws2)
          if (u.product_unit_id === null) {
            // หน่วยฐาน → updatePrice ต่อ price_type ที่เปลี่ยน (log + gate)
            if (isFinite(nRetail) && Math.abs(nRetail - u.price_retail) > 0.0001)
              await window.api.products.updatePrice(row.product_id, { price_type: 'retail', new_price: nRetail, note: 'แก้ราคาจากหน้ารับสินค้า' }, grantedOverride)
            if (isFinite(nWs1) && Math.abs(nWs1 - u.price_wholesale1) > 0.0001)
              await window.api.products.updatePrice(row.product_id, { price_type: 'wholesale1', new_price: nWs1, note: 'แก้ราคาจากหน้ารับสินค้า' }, grantedOverride)
            if (isFinite(nWs2) && Math.abs(nWs2 - u.price_wholesale2) > 0.0001)
              await window.api.products.updatePrice(row.product_id, { price_type: 'wholesale2', new_price: nWs2, note: 'แก้ราคาจากหน้ารับสินค้า' }, grantedOverride)
          } else {
            // หน่วยอื่น → updateUnitPrice (ไม่ log) เฉพาะฟิลด์ที่เปลี่ยน
            const patch: { price_retail?: number; price_wholesale1?: number; price_wholesale2?: number } = {}
            if (isFinite(nRetail) && Math.abs(nRetail - u.price_retail) > 0.0001) patch.price_retail = nRetail
            if (isFinite(nWs1) && Math.abs(nWs1 - u.price_wholesale1) > 0.0001) patch.price_wholesale1 = nWs1
            if (isFinite(nWs2) && Math.abs(nWs2 - u.price_wholesale2) > 0.0001) patch.price_wholesale2 = nWs2
            if (Object.keys(patch).length > 0)
              await window.api.products.updateUnitPrice(u.product_unit_id, patch, grantedOverride)
          }
        }
      } catch (e: any) {
        console.error('[wizard] price write failed:', e?.message)
        return  // ไม่ปิด wizard ถ้าเขียนราคาพลาด
      }
    }
    // default_sell_price ของ row = ราคาปลีกของหน่วยที่รับเข้า (สำหรับ lot.sell_price + แสดงในตาราง GR)
    const receivedKey = units.find(u => u.unit_name === row.unit_name)?.key ?? 'base'
    const receivedRetail = parseFloat(priceDrafts[receivedKey]?.retail ?? '') 
    onConfirm({ ...row, default_sell_price: isFinite(receivedRetail) ? receivedRetail : row.default_sell_price })
  }
```

- [ ] **Step 2: typecheck**

```powershell
npx tsc --noEmit
```
Expected: ไม่มี error

- [ ] **Step 3: commit**

```powershell
git add src/pages/Purchase/AddProductWizard.tsx
git commit -m @'
feat(purchase): write all changed unit prices on GR wizard confirm

Base unit -> products:updatePrice per changed price_type (logged); other
units -> products:updateUnitPrice with only the changed fields (not logged).
row.default_sell_price tracks the received unit''s retail for the lot record.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 5: e2e — ยืนยัน flow ราคาหลายหน่วย/หลายราคา (จำลองสิ่งที่ confirm ทำ)

**Files:**
- Modify: `tests/e2e/verify-gr-price-edit.mjs`

- [ ] **Step 1: เพิ่ม check — ฐาน ws1 เปลี่ยน → log wholesale1; หน่วยอื่น retail เปลี่ยน → ไม่ log**

ต่อท้ายสคริปต์ (ก่อน `}catch`):
```js
  // === R3: หน่วยฐาน ws1 → updatePrice(wholesale1) log; หน่วยอื่น retail → updateUnitPrice ไม่ log ===
  const lg0=((await apiCall(page,'products.priceHistory',pid,50)).value||[]).length
  await apiCall(page,'products.updatePrice',pid,{price_type:'wholesale1',new_price:9.25,note:'แก้ราคาจากหน้ารับสินค้า'})
  await apiCall(page,'products.updateUnitPrice',puId,{price_retail:345})
  const lg1=(await apiCall(page,'products.priceHistory',pid,50)).value||[]
  const ws1log=lg1.find(l=>l.price_type==='wholesale1'&&Number(l.new_price)===9.25)
  check('R3: ฐาน ws1 → มี price_logs wholesale1', !!ws1log, 'found='+!!ws1log)
  check('R3: หน่วยอื่น retail → log ไม่เพิ่มจาก unit', lg1.length===lg0+1, 'before='+lg0+' after='+lg1.length+' (เพิ่มแค่ ws1)')
```

- [ ] **Step 2: รัน e2e ทั้งไฟล์ให้ผ่านหมด**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: ทุก check `PASS` (B1×2, B4, R2, D1×2, B3×3, R3×2)

- [ ] **Step 3: commit**

```powershell
git add tests/e2e/verify-gr-price-edit.mjs
git commit -m @'
test(purchase): e2e for per-unit price writes (base logs, variants do not)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 6: เอกสาร

**Files:**
- Modify: `docs/claude/business-logic.md`

- [ ] **Step 1: อัปเดตบรรทัด pricing/GR ให้ครอบเฟส 2**

แก้/ต่อบรรทัดที่ Phase 1 เพิ่มไว้ ให้เป็น:
```markdown
- **ราคาขายแก้จาก GR wizard ได้ทุกหน่วย.** step 4 = ตารางทุกหน่วยที่ขายได้ (ฐาน + is_for_sale variants) × ปลีก/ส่ง1/ส่ง2.
  หน่วยฐาน → `products:updatePrice` (log `price_logs` + admin gate); หน่วยอื่น → `products:updateUnitPrice` (admin gate, **ไม่ log** — ประวัติเก็บเฉพาะหน่วยฐาน).
  เขียนทันทีตอนยืนยัน row (admin/override). `purchase.save` ยังไม่ตั้งราคาหลัก (price_retail) เอง.
```

- [ ] **Step 2: commit**

```powershell
git add docs/claude/business-logic.md
git commit -m @'
docs(business-logic): GR wizard edits all unit prices (phase 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Self-Review (ทำแล้ว)

**Spec coverage (เฟส 2):**
- R3 (ทุกหน่วย + ws1/ws2) → Task 2+3+4 ✓ · B3 handler → Task 1 ✓ · R5 (ไม่ log หน่วยอื่น) → Task 1 (ไม่ INSERT price_logs) + Task 5 ยืนยัน ✓
- caution §7 (หน่วยรับเข้า≠ขาย) → Task 2 `buildSellUnits` ใช้ `p.units` (is_for_sale) ไม่ใช่ purchase_units ✓

**Type consistency:**
- `SellUnitPrice.product_unit_id: number | null` ↔ `updateUnitPrice(productUnitId: number, ...)` (เรียกเฉพาะเมื่อ `!== null`) ✓
- `updateUnitPrice` payload keys (price_retail/price_wholesale1/price_wholesale2) ตรงทั้ง handler/preload/confirm ✓
- `buildSellUnits` export จาก AddProductWizard, import ใน index.tsx ✓
- ProductUnitOption.price_wholesale1/2 optional ↔ enrichProduct ส่ง `pu.*` (มีจริง) ✓

**Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีโค้ดจริง.

**ข้อควรระวังที่ฝากผู้ทำ:**
- Task 3 Step 5: ต้องลบ `sellPrice`/`setSellPrice` (Phase 1) ให้หมดทุก reference ก่อน tsc ผ่าน — รวม `selectUnit`, `pickProduct`, `railSub` case 3, init effect.
- Task 1 Step 1 (e2e): วิธีอ่าน unit กลับมาเช็ก (`products.get` คืน units ไหม) อาจต้องปรับ — hunter จัดการเป็น harness detail.
- การ์ดกำไร/แบนเนอร์ทุน (Phase 1) ต้องไม่พังหลังลบ `sellPrice` — sellNum มาจาก drafts ของหน่วยที่รับเข้าแทน.
- ราคาส่ง 0 = "ไม่ตั้ง" — input ว่าง/0 ไม่ถือเป็นเปลี่ยนถ้าเดิมก็ 0 (guard `Math.abs(diff) > 0.0001` ครอบ).
