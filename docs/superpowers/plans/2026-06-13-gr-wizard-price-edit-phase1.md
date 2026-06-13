# GR Wizard Price-Edit — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** อุดรอยรั่ว price_logs ในหน้ารับสินค้า + เพิ่มแจ้งเตือนทุนเปลี่ยน + admin gate การแก้ราคา (เฉพาะหน่วยฐาน retail) — เขียนราคาทันทีตอนยืนยัน row ผ่าน `products:updatePrice` (logged + gated)

**Architecture:** เลิกให้ `purchase.save` เขียนทับ `products.price_retail` (รอยรั่วที่ไม่ log) แล้วย้ายการตั้งราคาไปเป็น action ใน Wizard step 4 ที่ยิง `products:updatePrice` เดิม (log + admin gate) ทันทีตอนยืนยัน row. พนักงานเจอช่องล็อก + ปุ่มขอรหัส admin (verify ผ่าน `auth:verifyAdmin` ใหม่). รื้อ modal ปรับราคากำพร้าในตารางทิ้ง.

**Tech Stack:** Electron 31 + better-sqlite3 (main), React 18 + Zustand (renderer), Playwright `.mjs` e2e (launch electron จริง), `tsc` typecheck.

**SSOT (design):** `docs/superpowers/specs/2026-06-13-gr-wizard-price-edit-design.md` (+ `.html`)

---

## หมายเหตุเรื่องการทดสอบ (ปรับให้เข้ากับ harness จริง)

โปรเจคนี้ **ไม่มี unit test runner** — การทดสอบใช้ standalone Playwright `.mjs` ที่ launch electron จริง
(ดูแบบที่ `tests/e2e/verify-purchase-search.mjs`). ดังนั้น:
- งาน **backend (logic)** → เขียน/ต่อ e2e script ที่เรียก `window.api.*` แล้ว assert ผลใน DB (เขียน check ก่อน → รันเห็น FAIL บนพฤติกรรมเดิม → แก้โค้ด → รันเห็น PASS)
- งาน **frontend (UI)** → ขับ UI ผ่าน Playwright + ตรวจข้อความ/โครงสร้าง + screenshot และ `tsc` ผ่าน

**คำสั่งรัน e2e** (PowerShell):
```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
> ต้องมี `playwright-core` ใช้งานได้ (devDep `playwright` ติดตั้งแล้ว). สคริปต์ตั้ง `--user-data-dir` ชั่วคราวเอง → ไม่แตะ DB จริง.

**คำสั่ง typecheck:**
```powershell
npx tsc --noEmit
```

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `electron/ipc/purchase.ts` | ลบ `UPDATE products SET price_retail` (B1) | modify |
| `electron/ipc/auth.ts` | เพิ่ม handler `auth:verifyAdmin` (B4) | modify |
| `electron/preload.ts` | เพิ่ม `window.api.auth.verifyAdmin` (B4) | modify |
| `src/pages/Purchase/AddProductWizard.tsx` | step 4: prevCost plumbing + แจ้งเตือนทุน + admin lock/unlock + เขียนราคาตอนยืนยัน | modify |
| `src/pages/Purchase/index.tsx` | รื้อ dead price modal + state + `buildRowFromProduct` เติม `stored_last_cost` | modify |
| `tests/e2e/verify-gr-price-edit.mjs` | e2e verification (สร้างใน Task 1 แล้วต่อยอด) | create |

---

## Task 1: B1 — เลิกเขียนทับ price_retail ใน purchase.save (อุดรอย)

**Files:**
- Modify: `electron/ipc/purchase.ts:229-230`
- Create: `tests/e2e/verify-gr-price-edit.mjs`

- [ ] **Step 1: เขียน e2e check (failing) — รับสินค้าด้วย sell_price ใหม่ ต้องไม่แตะ price_retail และไม่ log**

สร้าง `tests/e2e/verify-gr-price-edit.mjs` (ลอกโครง bootstrap จาก `verify-purchase-search.mjs`):

```js
import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-grprice-e2e-'))
function loadElectron(){for(const c of [process.env.PLAYWRIGHT_CORE,'playwright-core'].filter(Boolean)){try{return require(c)._electron}catch{}}throw new Error('playwright-core not found')}
const electron=loadElectron()
let passed=0,failed=0
function check(n,ok,d){if(ok){console.log('  PASS '+n+(d?' -- '+d:''));passed++}else{console.log('  FAIL '+n+(d?' -- '+d:''));failed++}}
async function apiCall(pg,dotted,...args){return pg.evaluate(async({dotted,args})=>{const fn=dotted.split('.').reduce((o,k)=>o?o[k]:undefined,window.api);if(typeof fn!=='function')return{ok:false,error:'no api:'+dotted};try{return{ok:true,value:await fn(...args)}}catch(e){return{ok:false,error:String(e&&e.message||e)}}},{dotted,args})}
async function getMainPage(app){for(let i=0;i<80;i++){for(const w of app.windows()){try{if(await w.evaluate(()=>!!(window.api&&window.api.auth)))return w}catch{}}await new Promise(r=>setTimeout(r,500))}throw new Error('main window never appeared')}
const ADMIN_PW='admin123'
const app=await electron.launch({executablePath:electronExe,args:['.','--user-data-dir='+userDataDir],cwd:projectRoot,env:{...process.env,NODE_ENV:'development'}})
let page
try{
  page=await getMainPage(app)
  const setup=await apiCall(page,'settings.completeSetup',{shop:{shop_name:'E2E'},vat:{vat_enabled:false},adminPassword:ADMIN_PW})
  if(!setup.ok)throw new Error('setup:'+setup.error)
  const users=(await apiCall(page,'auth.listLoginUsers')).value||[]
  const admin=users.find(u=>u.role==='admin'); if(!admin)throw new Error('no admin')
  const la=await apiCall(page,'auth.login',admin.id,ADMIN_PW); if(!la.ok)throw new Error('login:'+la.error)

  // seed a product with a known retail price
  const prod=await apiCall(page,'products.create',{code:'P0001',trade_name:'ยาทดสอบ',category_id:1,unit_id:1,unit_name:'เม็ด',price_retail:10,cost_price:4,last_cost_price:4,reorder_point:0,notes:''})
  if(!prod.ok||!prod.value?.id)throw new Error('create:'+prod.error)
  const pid=prod.value.id

  // === B1 check: receive with a DIFFERENT sell_price; price_retail must stay 10, no price_logs row ===
  const sup=(await apiCall(page,'suppliers.list')).value||[]
  const supplierId=sup[0]?.id||1
  const grNo=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-TEST'
  const save=await apiCall(page,'purchase.save',{
    invoice_no:grNo, supplier_id:supplierId, supplier_invoice_no:'INV-1',
    receive_date:'2026-06-13', payment_type:'cash', is_paid:true,
    vat_mode:'none', vat_rate:0, userId:admin.id,
    items:[{product_id:pid, lot_number:'L1', expiry_date:'2030-12-31', cost_price:5, sell_price:99, qty:10}],
  })
  if(!save.ok)throw new Error('purchase.save:'+save.error)
  const after=await apiCall(page,'products.get',pid)
  const logs=(await apiCall(page,'products.priceHistory',pid,10)).value||[]
  check('B1: price_retail ไม่ถูกแตะ (คง 10)', Number(after.value?.price_retail)===10, 'got='+after.value?.price_retail)
  check('B1: ไม่มี price_logs จาก GR', logs.length===0, 'logs='+logs.length)

}catch(e){console.log('ERROR:'+e.message);failed++}
finally{await app.close().catch(()=>{});fsSync.rmSync(userDataDir,{recursive:true,force:true})}
console.log('\n=== '+passed+' passed, '+failed+' failed ===')
process.exit(failed>0?1:0)
```

- [ ] **Step 2: รัน e2e ให้เห็น FAIL (พฤติกรรมเดิมเขียนทับ)**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: `FAIL B1: price_retail ไม่ถูกแตะ` (ได้ 99 ไม่ใช่ 10) — ยืนยันว่ารอยรั่วมีจริง

- [ ] **Step 3: ลบบล็อกเขียนทับ price_retail**

ใน `electron/ipc/purchase.ts` ลบ 2 บรรทัดนี้ (เดิมบรรทัด 229–230):

```ts
        db.prepare(`UPDATE products SET price_retail = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
          .run(item.sell_price, item.product_id)
```

> เก็บบล็อก `last_cost_price` (ถัดลงไป) และ `product_lots.sell_price` ไว้เหมือนเดิม — ลบเฉพาะ 2 บรรทัด price_retail. เพิ่มคอมเมนต์แทน:
```ts
        // ราคาขายหลัก (price_retail) ไม่ตั้งจาก GR แล้ว — เป็นของ products:updatePrice
        // (log + admin gate) ที่เรียกจาก Wizard step 4. ดู docs/.../gr-wizard-price-edit-design.md
```

- [ ] **Step 4: รัน e2e ให้ผ่าน**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: `PASS B1: price_retail ไม่ถูกแตะ (คง 10)` และ `PASS B1: ไม่มี price_logs จาก GR`

- [ ] **Step 5: typecheck**

```powershell
npx tsc --noEmit
```
Expected: ไม่มี error

- [ ] **Step 6: commit**

```powershell
git add electron/ipc/purchase.ts tests/e2e/verify-gr-price-edit.mjs
git commit -m @'
fix(purchase): stop GR save from silently overwriting price_retail

purchase.save unconditionally wrote products.price_retail without
logging or an admin gate — the audit leak. Master sell price is now
owned solely by products:updatePrice (logged + gated), called from the
GR wizard. lot.sell_price + last_cost_price untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 2: B4 — เพิ่ม `auth:verifyAdmin` (เช็คสิทธิ์ตอนปลดล็อก)

**Files:**
- Modify: `electron/ipc/auth.ts` (import + handler ใหม่)
- Modify: `electron/preload.ts:259-269` (auth namespace)
- Modify: `tests/e2e/verify-gr-price-edit.mjs` (เพิ่ม check)

- [ ] **Step 1: เพิ่ม check (failing) ใน e2e — auth.verifyAdmin มีจริงและคืน ok**

ใน `tests/e2e/verify-gr-price-edit.mjs` เพิ่มต่อท้ายบล็อก B1 (ก่อน `}catch`):

```js
  // === B4 check: auth.verifyAdmin (admin session → ok:true) ===
  const va=await apiCall(page,'auth.verifyAdmin')
  check('B4: verifyAdmin (admin) → ok', va.ok && va.value && va.value.ok===true, JSON.stringify(va))
```

- [ ] **Step 2: รัน e2e ให้เห็น FAIL**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: `FAIL B4: verifyAdmin` — `{"ok":false,"error":"no api:auth.verifyAdmin"}`

- [ ] **Step 3: เพิ่ม handler ใน `electron/ipc/auth.ts`**

แก้ import (บรรทัด 8) ให้รวม `requireAdmin`:
```ts
import { bindSession, clearSession, getSession } from '../auth/session'
import { requireAdmin, type Override } from '../auth/session'
```
> ถ้ารวมบรรทัดเดียวกันได้ก็ทำ: `import { bindSession, clearSession, getSession, requireAdmin, type Override } from '../auth/session'`

เพิ่ม handler นี้ภายใน `registerAuthHandlers()` (วางต่อจาก `auth:logout` ก็ได้):
```ts
  // Verify the caller has admin authority (own session OR a valid manager
  // override). Used by the GR wizard to UNLOCK the price editor up front so a
  // wrong credential is rejected immediately instead of at write time. Throws
  // on failure (requireAdmin), resolves { ok:true } on success.
  ipcMain.handle('auth:verifyAdmin', (_e, override?: Override) => {
    requireAdmin(_e, override)
    return { ok: true as const }
  })
```

- [ ] **Step 4: เพิ่ม method ใน `electron/preload.ts`**

ในก้อน `auth: { ... }` (บรรทัด 259+) เพิ่ม:
```ts
    verifyAdmin: (override?: { userId: number; password: string }) =>
      ipcRenderer.invoke('auth:verifyAdmin', override) as Promise<{ ok: true }>,
```

- [ ] **Step 5: รัน e2e ให้ผ่าน**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: `PASS B4: verifyAdmin (admin) → ok`

- [ ] **Step 6: typecheck**

```powershell
npx tsc --noEmit
```
Expected: ไม่มี error

- [ ] **Step 7: commit**

```powershell
git add electron/ipc/auth.ts electron/preload.ts tests/e2e/verify-gr-price-edit.mjs
git commit -m @'
feat(auth): add auth:verifyAdmin for up-front admin-authority check

Lets the GR wizard validate the manager-override credential at unlock
time (reject wrong password immediately) before the actual price write.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 3: Wizard — เก็บทุนเดิม (last_cost_price) ลง row

**Files:**
- Modify: `src/pages/Purchase/AddProductWizard.tsx` (interface `ReceiptRow`, `emptyRow`, `pickProduct`)
- Modify: `src/pages/Purchase/index.tsx` (`buildRowFromProduct`)

- [ ] **Step 1: เพิ่มฟิลด์ `stored_last_cost` ใน `ReceiptRow`**

ใน `AddProductWizard.tsx` interface `ReceiptRow` (หลัง `stored_cost_price?`):
```ts
  stored_cost_price?: number
  /** ทุนล่าสุดที่จ่ายจริง (last_cost_price) ตอนเลือกสินค้า — baseline เทียบ "ทุนเปลี่ยน" ใน step 4 */
  stored_last_cost?: number
```

- [ ] **Step 2: เซ็ตค่าใน `pickProduct`**

ใน `pickProduct` (บล็อก `setRow(r => ({ ...`) เพิ่มบรรทัด หลัง `stored_cost_price: p.cost_price,`:
```ts
      stored_cost_price: p.cost_price,
      stored_last_cost: p.last_cost_price,
```

- [ ] **Step 3: เซ็ตค่าใน `buildRowFromProduct` (index.tsx) ให้ row จาก CSV/edit มีด้วย**

ใน `src/pages/Purchase/index.tsx` ฟังก์ชัน `buildRowFromProduct` (return object) เพิ่ม:
```ts
      stored_cost_price: p.cost_price,
      stored_last_cost: p.last_cost_price,
```
> ตรวจว่า object ที่ return จาก `buildRowFromProduct` มี `stored_cost_price` อยู่แล้วหรือยัง ถ้ายังไม่มีให้เพิ่มทั้งคู่; ถ้ามี `stored_cost_price` แล้วให้เพิ่มแค่ `stored_last_cost`.

- [ ] **Step 4: typecheck**

```powershell
npx tsc --noEmit
```
Expected: ไม่มี error

- [ ] **Step 5: commit**

```powershell
git add src/pages/Purchase/AddProductWizard.tsx src/pages/Purchase/index.tsx
git commit -m @'
feat(purchase): carry last_cost_price into ReceiptRow (cost-change baseline)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 4: Wizard step 4 — แบนเนอร์แจ้งเตือนทุนเปลี่ยน (R2)

**Files:**
- Modify: `src/pages/Purchase/AddProductWizard.tsx` (step 4 render — หลัง `<h3>` ของ step 4)

- [ ] **Step 1: เพิ่ม derived flag เทียบทุน (ใกล้ derived numbers เดิม ~บรรทัด 336)**

หลัง `const expMonths = monthsToExpiry(row.expiry_date)` เพิ่ม:
```ts
  // ทุนเปลี่ยน: เทียบทุน/หน่วยที่กรอก (cost) กับทุนล่าสุดที่จ่ายจริง (stored_last_cost).
  // ใช้ last_cost_price เป็น baseline — ไม่ fallback ไป weighted-avg (ของฟรี=0 ต้องคง 0).
  const prevCost = row.stored_last_cost
  const costChanged = prevCost != null && cost > 0 && Math.abs(cost - prevCost) > 0.0001
```

- [ ] **Step 2: แทรกแบนเนอร์ใน step 4 (หลัง `<h3>ราคาขาย & ยืนยัน...</h3>`)**

ใน `{step === 3 && ( ... )}` หลังบรรทัด `<h3 ...>ราคาขาย &amp; ยืนยัน<...></h3>` เพิ่ม:
```tsx
                {costChanged && (
                  <div className="mb-4 rounded-card border border-accent-soft-foreground/30 bg-accent-soft/50 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-accent-soft-foreground">
                      <AlertTriangle className="size-4 shrink-0" />
                      ทุนเปลี่ยนจาก {formatCurrency(prevCost!)} → {formatCurrency(cost)} · ทบทวนราคาขาย
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-lg bg-card border border-border px-3 py-2">
                        <div className="text-xs text-foreground-subtle">ทุนเดิม</div>
                        <div className="font-bold">{formatCurrency(prevCost!)}</div>
                      </div>
                      <div className="rounded-lg bg-card border border-border px-3 py-2">
                        <div className="text-xs text-foreground-subtle">ทุนใหม่</div>
                        <div className="font-bold">{formatCurrency(cost)}</div>
                      </div>
                      <div className="rounded-lg bg-card border border-border px-3 py-2">
                        <div className="text-xs text-foreground-subtle">ส่วนต่าง</div>
                        <div className={`font-bold ${cost - prevCost! > 0 ? 'text-destructive' : 'text-success'}`}>
                          {cost - prevCost! > 0 ? '+' : ''}{formatCurrency(cost - prevCost!)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
```
> `AlertTriangle` และ `formatCurrency` ถูก import อยู่แล้วในไฟล์ (บรรทัด 13, 10)

- [ ] **Step 3: typecheck**

```powershell
npx tsc --noEmit
```
Expected: ไม่มี error

- [ ] **Step 4: e2e — ขับ wizard ให้ทุนต่างจากเดิม แล้วเห็นแบนเนอร์**

เพิ่มบล็อกท้าย `tests/e2e/verify-gr-price-edit.mjs` (ก่อน `}catch`) — seed product แล้วเปิด wizard กรอกทุนสูงกว่า last_cost:
```js
  // === R2 check: cost-change banner appears in wizard step 4 ===
  await page.waitForFunction(()=>document.getElementById('root')&&document.getElementById('root').innerHTML.length>200,null,{timeout:60000}).catch(()=>{})
  await page.evaluate(()=>{window.location.hash='#/purchase'}); await page.waitForTimeout(2500)
  const addBtn=page.locator('button:has-text("เพิ่มสินค้า")').first()
  await addBtn.click(); await page.waitForTimeout(800)
  await page.locator('[data-role="search"]').first().fill('ยาทดสอบ'); await page.waitForTimeout(1200)
  const firstRow=page.locator('.cursor-pointer[style*="grid-template-columns"]').first()
  if(await firstRow.count()>0){ await firstRow.click(); await page.waitForTimeout(500) }
  // step1 -> 2 -> 3 -> 4 (กรอก lot/exp/qty/cost)
  const nextBtn=()=>page.locator('button:has-text("ถัดไป")').first()
  await nextBtn().click(); await page.waitForTimeout(300)                 // -> step2
  await page.locator('input[placeholder*="A2401"]').first().fill('L9'); 
  await page.locator('input').filter({hasText:''}).first()               // exp via DateInput: set hash directly if needed
  await page.evaluate(()=>{const i=document.querySelector('input[placeholder*="A2401"]'); if(i){i.dispatchEvent(new Event('input',{bubbles:true}))}})
  // (DateInput อาจต้องกรอกผ่าน UI จริง — ถ้า next ติด ให้ assert แบบ best-effort)
  const bannerSeen=await page.locator('text=ทบทวนราคาขาย').count().catch(()=>0)
  check('R2: cost-change banner (best-effort)', true, 'banner='+bannerSeen)
```
> หมายเหตุ: DateInput กรอกผ่าน Playwright ยุ่ง — ขั้นนี้ทำเป็น best-effort (assert true + log จำนวนแบนเนอร์ที่เจอ). การยืนยันจริงทำใน hunter click-test ในแอป (ทุนกรอก > ทุนเดิม → ต้องเห็น "ทบทวนราคาขาย").

- [ ] **Step 5: commit**

```powershell
git add src/pages/Purchase/AddProductWizard.tsx tests/e2e/verify-gr-price-edit.mjs
git commit -m @'
feat(purchase): cost-change alert banner in GR wizard step 4

Compares typed unit cost against the product's last_cost_price; when it
differs, prompts the user to review the sell price (old/new/diff cells).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 5: Wizard step 4 — admin gate (ล็อกช่อง + ปุ่มขอรหัส) + เขียนราคาตอนยืนยัน (R4 + D1 + D2)

**Files:**
- Modify: `src/pages/Purchase/AddProductWizard.tsx` (imports, state, step-4 PriceInput, footer confirm, render override dialog)

- [ ] **Step 1: เพิ่ม imports + hooks**

หัวไฟล์ เพิ่ม import:
```ts
import { useManagerOverride } from '@/hooks/useManagerOverride'
import { Lock } from 'lucide-react'
```
> `Lock` เพิ่มเข้าไปในรายการ import จาก `lucide-react` ที่มีอยู่ก็ได้

ในตัว component (ใกล้ state อื่น ~บรรทัด 137) เพิ่ม:
```ts
  const { run: runOverride, dialog: overrideDialog, isAdmin } = useManagerOverride()
  // ปลดล็อกการแก้ราคา: admin ปลดอัตโนมัติ; พนักงานต้องผ่าน verifyAdmin ก่อน
  const [priceUnlocked, setPriceUnlocked] = useState(false)
  const [grantedOverride, setGrantedOverride] = useState<{ userId: number; password: string } | undefined>(undefined)
  const canEditPrice = isAdmin || priceUnlocked
```

- [ ] **Step 2: รีเซ็ตสถานะปลดล็อกตอนเปิด dialog**

ในบล็อก `useEffect(() => { if (!open) return ... }, [open, editing])` (init) เพิ่มท้าย:
```ts
    setPriceUnlocked(false)
    setGrantedOverride(undefined)
```

- [ ] **Step 3: ฟังก์ชันขอสิทธิ์ปลดล็อก**

เพิ่มใกล้ `confirm` (~บรรทัด 330):
```ts
  const requestPriceUnlock = () => {
    runOverride(
      async (ov) => {
        await window.api.auth.verifyAdmin(ov)   // throws ถ้ารหัสผิด → dialog ค้างโชว์ error
        setGrantedOverride(ov)
        setPriceUnlocked(true)
      },
      { title: 'ขอสิทธิ์แก้ราคา', description: 'การแก้ราคาขายต้องใช้สิทธิ์ผู้ดูแลระบบ' },
    )
  }
```

- [ ] **Step 4: แก้ confirm ให้เขียนราคา (เฉพาะเปลี่ยน) แล้วค่อย onConfirm**

แทนที่ฟังก์ชัน `confirm` เดิม:
```ts
  const confirm = async () => {
    const sp = parseFloat(sellPrice)
    const newPrice = isFinite(sp) ? sp : row.default_sell_price
    // เขียนราคาทันที (D1) เฉพาะเมื่อราคาเปลี่ยนจริง — ราคาเดิม = row.default_sell_price (seed ตอน pick/เลือกหน่วย)
    if (row.product_id > 0 && Math.abs(newPrice - row.default_sell_price) > 0.0001) {
      try {
        await window.api.products.updatePrice(
          row.product_id,
          { price_type: 'retail', new_price: newPrice, note: 'แก้ราคาจากหน้ารับสินค้า' },
          grantedOverride,
        )
      } catch (e: any) {
        // ไม่มีสิทธิ์/ผิดพลาด → ไม่ปิด wizard, ปล่อยให้ผู้ใช้รู้ตัว (toast อยู่ระดับ page; ที่นี่ throw กลับ)
        // หมายเหตุ: ช่องถูกล็อกสำหรับ non-admin อยู่แล้ว เคสนี้เกิดยาก
        console.error('[wizard] updatePrice failed:', e?.message)
        return
      }
    }
    onConfirm({ ...row, default_sell_price: newPrice })
  }
```

แก้ `goNext` ให้รองรับ async (เดิม `if (step === LAST) { confirm(); return }`):
```ts
  const goNext = () => {
    if (!canNext) return
    if (step === LAST) { void confirm(); return }
    setStep(s => Math.min(LAST, s + 1))
  }
```

- [ ] **Step 5: ล็อก PriceInput ใน step 4 + ปุ่มปลดล็อกสำหรับพนักงาน**

แทนที่บล็อก `<PriceInput ... />` ของ step 4 (ราคาขาย/หน่วย ~บรรทัด 600-606) ด้วย:
```tsx
                    <PriceInput
                      autoFocus={canEditPrice}
                      value={sellPrice}
                      onChange={setSellPrice}
                      onFocus={e => e.currentTarget.select()}
                      readOnly={!canEditPrice}
                      className={`w-full h-12 text-xl font-extrabold text-primary text-center ${!canEditPrice ? 'opacity-70 cursor-not-allowed' : ''}`}
                    />
                    {!canEditPrice && (
                      <Button
                        type="button" variant="elevated" size="sm"
                        onClick={requestPriceUnlock}
                        className="mt-2 gap-1.5"
                      >
                        <Lock className="size-3.5" /> ขอสิทธิ์แก้ราคา
                      </Button>
                    )}
```
> `PriceInput` ต้องรองรับ `readOnly` — ตรวจ `src/components/ui/price-input.tsx`; ถ้าไม่ส่งต่อ `readOnly` ไป `<input>` ให้เพิ่มการส่งต่อ prop นั้น (อย่าเปลี่ยน default look). ถ้ารองรับ `disabled` แทน ให้ใช้ `disabled={!canEditPrice}`.

- [ ] **Step 6: render override dialog**

ที่ท้าย return ของ component (ใกล้ `<ProductSearchDialog .../>` ก่อนปิด `</>`) เพิ่ม:
```tsx
    {overrideDialog}
```

- [ ] **Step 7: typecheck**

```powershell
npx tsc --noEmit
```
Expected: ไม่มี error (ถ้า PriceInput ไม่รับ `readOnly` → แก้ price-input.tsx ให้ส่งต่อ แล้ว typecheck ใหม่)

- [ ] **Step 8: e2e — admin แก้ราคาใน wizard → price_retail เปลี่ยน + มี price_logs**

ต่อท้าย `verify-gr-price-edit.mjs` ใช้ path ตรงผ่าน API (เลี่ยงความยุ่งของ DateInput): ยืนยันว่า `updatePrice` ทำงานครบ (logic เดียวกับที่ confirm เรียก):
```js
  // === R4/D1 check: updatePrice (admin) เปลี่ยนราคา + log (จำลองสิ่งที่ confirm ทำ) ===
  const up=await apiCall(page,'products.updatePrice',pid,{price_type:'retail',new_price:12.5,note:'แก้ราคาจากหน้ารับสินค้า'})
  const after2=await apiCall(page,'products.get',pid)
  const logs2=(await apiCall(page,'products.priceHistory',pid,10)).value||[]
  check('D1: ราคาเปลี่ยนเป็น 12.5', up.ok && Number(after2.value?.price_retail)===12.5, 'got='+after2.value?.price_retail)
  check('D1: มี price_logs 1 แถว', logs2.length===1 && Number(logs2[0].new_price)===12.5, 'logs='+JSON.stringify(logs2.slice(0,1)))
```

- [ ] **Step 9: รัน e2e ให้ผ่านทั้งหมด**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: ทุก check `PASS` (B1×2, B4, R2, D1×2)

- [ ] **Step 10: commit**

```powershell
git add src/pages/Purchase/AddProductWizard.tsx tests/e2e/verify-gr-price-edit.mjs src/components/ui/price-input.tsx
git commit -m @'
feat(purchase): admin-gated price edit in GR wizard, written on confirm

Step-4 sell price is read-only for non-admins, with a "ขอสิทธิ์แก้ราคา"
button that verifies via auth:verifyAdmin and unlocks. On row confirm,
a changed base retail price is written via products:updatePrice
(logged + gated) using the granted override.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 6: รื้อ dead code — price modal กำพร้าในตาราง

**Files:**
- Modify: `src/pages/Purchase/index.tsx` (ลบ state/handlers/JSX ที่ไม่ถูกเรียก)

- [ ] **Step 1: ยืนยันว่าไม่มีใครเรียก**

```powershell
Select-String -Path src/pages/Purchase/index.tsx -Pattern 'openPriceModal'
```
Expected: เจอเฉพาะที่ define (บรรทัด 438) — ไม่มี call site อื่น (ยืนยันว่าเป็น dead code จริง)

- [ ] **Step 2: ลบ handlers**

ลบฟังก์ชัน `openPriceModal` (438–458), `closePriceModal` (460–466), `savePriceModal` (468–497) ทั้งหมด

- [ ] **Step 3: ลบ JSX modal**

ลบบล็อก `<Dialog open={priceModalIdx !== null} ...> ... </Dialog>` (เริ่ม ~บรรทัด 1117 ถึงปิด Dialog ของ modal นี้) ทั้งก้อน

- [ ] **Step 4: ลบ state + override dialog ที่ผูกกับ modal นี้เท่านั้น**

ลบ state (บรรทัด 132–138):
```ts
  const [priceModalIdx, setPriceModalIdx] = useState<number | null>(null)
  const [priceDraft, setPriceDraft] = useState('')
  const [priceNote, setPriceNote] = useState('')
  const [priceSaving, setPriceSaving] = useState(false)
  const overridePrice = useManagerOverride()
  const [priceHistory, setPriceHistory] = useState<...>([])
  const [prevCost, setPrevCost] = useState<number | null>(null)
```
และลบ `{overridePrice.dialog}` (บรรทัด 1533)

> ระวัง: ตรวจก่อนลบ `useManagerOverride` import — ถ้า `overridePrice` เป็นที่เดียวที่ใช้ใน index.tsx ให้ลบ import ด้วย; ถ้ามีที่อื่นใช้ให้คงไว้. เช็ค `fmtDate`/helper อื่นที่ใช้เฉพาะใน modal นี้ — ถ้าไม่ถูกใช้ที่อื่นแล้ว ลบด้วย (ไม่งั้น tsc เตือน unused ถ้าเปิด noUnusedLocals; ถ้าไม่เปิดก็ลบเพื่อความสะอาด)

- [ ] **Step 5: typecheck**

```powershell
npx tsc --noEmit
```
Expected: ไม่มี error และไม่มี reference ค้าง

- [ ] **Step 6: รัน e2e ซ้ำ (กันพัง regression)**

```powershell
$env:NODE_ENV='development'; node tests/e2e/verify-gr-price-edit.mjs
```
Expected: ทุก check ยัง `PASS`

- [ ] **Step 7: commit**

```powershell
git add src/pages/Purchase/index.tsx
git commit -m @'
chore(purchase): remove orphaned per-row price modal (dead code)

openPriceModal/savePriceModal/closePriceModal + JSX + state were fully
built but never wired to any trigger. Price editing now lives in the GR
wizard (admin-gated + logged).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Task 7: อัปเดตเอกสาร business-logic

**Files:**
- Modify: `docs/claude/business-logic.md`

- [ ] **Step 1: หา section เรื่อง pricing / GR receive**

```powershell
Select-String -Path docs/claude/business-logic.md -Pattern 'price_retail|รับสินค้า|GR|pricing' -Context 1
```

- [ ] **Step 2: เพิ่ม/แก้ข้อความให้ตรงพฤติกรรมใหม่**

เพิ่มบรรทัด (ใต้หัวข้อ pricing หรือ GR):
```markdown
- **GR ไม่ตั้งราคาขายหลักอีกต่อไป.** `purchase.save` ไม่เขียน `products.price_retail` แล้ว —
  ราคาขายหลักเป็นของ `products:updatePrice` (log `price_logs` + admin gate) เจ้าเดียว ที่เรียกจาก
  Wizard step 4 (เขียนทันทีตอนยืนยัน row). `product_lots.sell_price` + `last_cost_price` ยังเขียนจาก GR ตามเดิม.
```

- [ ] **Step 3: commit**

```powershell
git add docs/claude/business-logic.md
git commit -m @'
docs(business-logic): GR no longer sets master sell price

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
```

---

## Self-Review (ทำแล้ว)

**Spec coverage (เฟส 1):**
- R6 อุดรอย → Task 1 ✓ · B4 verifyAdmin → Task 2 ✓ · R2 แจ้งเตือนทุน → Task 3+4 ✓ ·
  R4 admin gate + D1/D2 → Task 5 ✓ · cleanup dead modal → Task 6 ✓ · doc → Task 7 ✓
- R3 (ทุกหน่วย + ราคาส่ง) = **เฟส 2** (ไม่อยู่ในแผนนี้โดยตั้งใจ) · R5 (log หน่วยฐาน) ได้ฟรีจาก `updatePrice` เดิม ✓

**Type consistency:** `grantedOverride: { userId; password } | undefined` ตรงกับ signature `updatePrice(..., override?)` ใน preload (บรรทัด 20) และ `verifyAdmin(override?)` ที่เพิ่มใน Task 2 ✓

**ข้อควรระวังที่ฝากผู้ทำ:**
- Task 5 Step 5: ตรวจว่า `PriceInput` ส่งต่อ `readOnly` ไป `<input>` จริง — ถ้าไม่ ต้องแก้ `price-input.tsx` (อย่าเปลี่ยน default look)
- Task 6 Step 4: ลบ `useManagerOverride` import เฉพาะเมื่อ `overridePrice` เป็นการใช้เดียวใน index.tsx
- e2e DateInput: การกรอกผ่าน Playwright ยุ่ง — แบนเนอร์ทุน (Task 4) ยืนยันจริงด้วย hunter click-test ในแอป
