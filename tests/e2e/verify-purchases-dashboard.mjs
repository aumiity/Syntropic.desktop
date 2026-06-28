// Real-Electron e2e — Purchases admin finance dashboard (mac).
// Launches the built renderer via vite dev (localhost:5173) + electron under
// playwright, seeds 2 GRs today (cash 100 + credit-unpaid 50), then drives the
// /manage/purchases UI as admin and as staff.
import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
// mac electron binary
const electronExe = pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-purch-e2e-'))
const shotDir = pathMod.join(projectRoot, 'tests', 'e2e', '_shots')
fsSync.mkdirSync(shotDir, { recursive: true })
function loadElectron(){for(const c of [process.env.PLAYWRIGHT_CORE,'playwright-core'].filter(Boolean)){try{return require(c)._electron}catch{}}throw new Error('playwright-core not found')}
const electron=loadElectron()
let passed=0,failed=0
function check(n,ok,d){if(ok){console.log('  PASS '+n+(d?' -- '+d:''));passed++}else{console.log('  FAIL '+n+(d?' -- '+d:''));failed++}}
async function apiCall(pg,dotted,...args){return pg.evaluate(async({dotted,args})=>{const fn=dotted.split('.').reduce((o,k)=>o?o[k]:undefined,window.api);if(typeof fn!=='function')return{ok:false,error:'no api:'+dotted};try{return{ok:true,value:await fn(...args)}}catch(e){return{ok:false,error:String(e&&e.message||e)}}},{dotted,args})}
async function getMainPage(app){for(let i=0;i<80;i++){for(const w of app.windows()){try{if(await w.evaluate(()=>!!(window.api&&window.api.auth)))return w}catch{}}await new Promise(r=>setTimeout(r,500))}throw new Error('main window never appeared')}
function localToday(){const d=new Date();const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function plusDays(n){const d=new Date();d.setDate(d.getDate()+n);const p=x=>String(x).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
const ADMIN_PW='admin123'
const app=await electron.launch({executablePath:electronExe,args:['.','--user-data-dir='+userDataDir],cwd:projectRoot,env:{...process.env,NODE_ENV:'development'}})
let page
const consoleErrors=[]
try{
  page=await getMainPage(app)
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w){w.setMinimumSize(1440,800);w.setBounds({width:1440,height:900})}}).catch(()=>{})

  const setup=await apiCall(page,'settings.completeSetup',{shop:{shop_name:'E2E'},vat:{vat_enabled:false},adminPassword:ADMIN_PW})
  if(!setup.ok)throw new Error('setup:'+setup.error)
  const users=(await apiCall(page,'auth.listLoginUsers')).value||[]
  const admin=users[0]; if(!admin)throw new Error('no login user')
  const la=await apiCall(page,'auth.login',admin.id,ADMIN_PW); if(!la.ok)throw new Error('login:'+la.error)
  console.log('  seeded login role =', admin.role)

  // ── seed product + 2 GRs today: cash 100, credit-unpaid 50 ──
  const prod=await apiCall(page,'products.create',{trade_name:'ยาทดสอบซื้อE2E',category_id:1,unit_id:1,unit_name:'เม็ด',price_retail:10,cost_price:10,last_cost_price:10,reorder_point:0,notes:''})
  if(!prod.ok||!prod.value?.id)throw new Error('create:'+prod.error)
  const pid=prod.value.id
  const sup=(await apiCall(page,'suppliers.list')).value||[]
  const supplierId=sup[0]?.id||1
  const gr1No=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-1'
  const gr1=await apiCall(page,'purchase.save',{invoice_no:gr1No,supplier_id:supplierId,supplier_invoice_no:'INV-CASH',receive_date:localToday(),payment_type:'cash',is_paid:true,vat_mode:'none',vat_rate:0,userId:admin.id,items:[{product_id:pid,lot_number:'LC',expiry_date:'2030-12-31',cost_price:10,sell_price:20,qty:10}]})
  if(!gr1.ok)throw new Error('gr1:'+gr1.error)
  const gr2No=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-2'
  const gr2=await apiCall(page,'purchase.save',{invoice_no:gr2No,supplier_id:supplierId,supplier_invoice_no:'INV-CREDIT',receive_date:localToday(),payment_type:'credit',is_paid:false,due_date:plusDays(30),vat_mode:'none',vat_rate:0,userId:admin.id,items:[{product_id:pid,lot_number:'LK',expiry_date:'2030-12-31',cost_price:5,sell_price:20,qty:10}]})
  if(!gr2.ok)throw new Error('gr2:'+gr2.error)

  // ══════════ Part A — IPC sanity (admin window) ══════════
  const today=localToday()
  const fs1=await apiCall(page,'reports.financeSummary',{date_from:today,date_to:today,with_compare:true})
  check('A1: financeSummary purchase_total=150 cash=100 credit=50 count=2', fs1.ok && Number(fs1.value?.purchase_total)===150 && Number(fs1.value?.purchase_cash)===100 && Number(fs1.value?.purchase_credit)===50 && Number(fs1.value?.purchase_count)===2, fs1.ok?JSON.stringify({t:fs1.value.purchase_total,c:fs1.value.purchase_cash,cr:fs1.value.purchase_credit,n:fs1.value.purchase_count,pay:fs1.value.payable_total,payc:fs1.value.payable_count}):fs1.error)
  check('A2: payable_total=50 payable_count=1 (current outstanding)', fs1.ok && Number(fs1.value?.payable_total)===50 && Number(fs1.value?.payable_count)===1)
  const tr1=await apiCall(page,'reports.salesPurchaseTrend',{date_from:today,date_to:today,granularity:'hour'})
  const bucketHasCount = tr1.ok && Array.isArray(tr1.value) && tr1.value.some(r=>Number(r.purchase_count)>0)
  check('A3: salesPurchaseTrend returns purchase_count per bucket', bucketHasCount, tr1.ok?('rows='+tr1.value.length+' sumCount='+tr1.value.reduce((s,r)=>s+(Number(r.purchase_count)||0),0)):tr1.error)

  // ══════════ Part B — admin UI ══════════
  page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()) })
  page.on('pageerror', e=>consoleErrors.push('pageerror:'+e.message))
  await page.evaluate(()=>{window.location.hash='#/manage/purchases'})
  await page.reload()
  await page.locator('text=ประวัติการซื้อ').first().waitFor({state:'visible',timeout:45000})
  await page.waitForTimeout(1500) // let finance fetch resolve

  const labels=['ยอดซื้อรวม','เงินสด','เครดิต','ค้างชำระ']
  for(const l of labels){ check('B-strip: เห็นการ์ด "'+l+'"', await page.locator('text='+l).count()>0) }
  check('B: เห็นกราฟ "แนวโน้มการซื้อ"', await page.locator('text=แนวโน้มการซื้อ').count()>0)
  check('B: เห็น toggle "ยอดซื้อ"', await page.locator('button:has-text("ยอดซื้อ")').count()>0)
  check('B: เห็น toggle "จำนวนบิล"', await page.locator('button:has-text("จำนวนบิล")').count()>0)
  check('B: เห็นการ์ด "สถานะการซื้อ"', await page.locator('text=สถานะการซื้อ').count()>0)
  check('B: เห็นการ์ด "สรุปการซื้อ"', await page.locator('text=สรุปการซื้อ').count()>0)

  // value binding: the ยอดซื้อรวม cell shows 150.00
  const stripText=await page.locator('[data-slot="metric-strip"]').first().innerText().catch(()=>'')
  check('B: MetricStrip แสดงยอด 150.00 + ค้างชำระ 50.00', stripText.includes('150.00') && stripText.includes('50.00'), JSON.stringify(stripText.replace(/\n/g,' | ')))

  await page.screenshot({path:pathMod.join(shotDir,'purchases-admin.png'),fullPage:false})

  // toggle chart to จำนวนบิล → no crash, chart container still present
  await page.locator('button:has-text("จำนวนบิล")').first().click()
  await page.waitForTimeout(600)
  check('B: คลิก toggle จำนวนบิล แล้วกราฟยังอยู่ ไม่ crash', await page.locator('text=แนวโน้มการซื้อ').count()>0 && await page.locator('text=ยอดซื้อรวม').count()>0)

  // date reactivity: step to previous month (empty) → ยอดซื้อรวม → 0.00
  const prevBtn=page.locator('button[title="ก่อนหน้า"]')
  check('B: เจอปุ่ม date stepper "ก่อนหน้า"', await prevBtn.count()>0)
  if(await prevBtn.count()>0){
    await prevBtn.first().click()
    await page.waitForTimeout(1500)
    const stripText2=await page.locator('[data-slot="metric-strip"]').first().innerText().catch(()=>'')
    check('B: เปลี่ยนช่วงวันที่ (เดือนก่อน ว่าง) → ยอดอัปเดตเป็น 0.00 (ไม่ใช่ 150)', stripText2.includes('0.00') && !stripText2.includes('150.00'), JSON.stringify(stripText2.replace(/\n/g,' | ')))
    // step back to this month
    await page.locator('button[title="ถัดไป"]').first().click()
    await page.waitForTimeout(1200)
  }
  check('B: ไม่มี white screen (body มีเนื้อหา)', (await page.locator('body').innerText()).length>50)

  // ══════════ Part C — switch to STAFF role ══════════
  const roleBtn=page.locator('button[title^="สลับ role"]')
  check('C: เจอปุ่ม DEV role-switch', await roleBtn.count()>0)
  // cycle until label = พนักงาน (staff)
  for(let i=0;i<4;i++){
    const txt=await roleBtn.first().innerText().catch(()=>'')
    if(txt.includes('พนักงาน')) break
    await roleBtn.first().click()
    await page.waitForTimeout(800)
  }
  const roleTxt=await roleBtn.first().innerText().catch(()=>'')
  check('C: สลับเป็น role พนักงาน (staff) สำเร็จ', roleTxt.includes('พนักงาน'), 'label='+JSON.stringify(roleTxt))
  await page.waitForTimeout(1000)

  // staff: dashboard GONE, table + slot cards present, no white screen
  check('C: staff ไม่เห็น dashboard (ไม่มี "แนวโน้มการซื้อ")', await page.locator('text=แนวโน้มการซื้อ').count()===0)
  check('C: staff ไม่เห็น "สถานะการซื้อ"', await page.locator('text=สถานะการซื้อ').count()===0)
  check('C: staff ไม่มี MetricStrip', await page.locator('[data-slot="metric-strip"]').count()===0)
  check('C: staff ยังเห็นตาราง "ประวัติการซื้อ"', await page.locator('text=ประวัติการซื้อ').count()>0)
  check('C: staff ไม่ white screen', (await page.locator('body').innerText()).length>50)
  await page.screenshot({path:pathMod.join(shotDir,'purchases-staff.png'),fullPage:false})

  // ══════════ console errors ══════════
  const fatal=consoleErrors.filter(e=>!/Autofill|DevTools|Download the React DevTools|favicon/i.test(e))
  check('D: ไม่มี console error ร้ายแรง', fatal.length===0, fatal.slice(0,3).join(' || ')||'clean')

}catch(e){
  console.log('  FATAL', e && e.message || e); failed++
}finally{
  console.log(`\n  ${passed} PASS / ${failed} FAIL`)
  await app.close().catch(()=>{})
  fsSync.rmSync(userDataDir,{recursive:true,force:true})
  process.exit(failed>0?1:0)
}
