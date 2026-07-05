// Real-Electron e2e — Purchases taxonomy + Dashboard-owned purchase finance.
// REWRITTEN 2026-07-05 for Dashboard Phase B: the admin finance panel was
// REMOVED from /manage/purchases (finance numbers live on the Dashboard now,
// admin sees Manage exactly like staff). Old Part B asserting MetricStrip/
// trend chart inside Manage is inverted to ABSENCE checks.
// Seeds 5 GRs today (cash 100 / credit-unpaid 50 / credit-paid 70 /
// credit-overdue 80 / cancelled 90) then verifies IPC buckets + UI.
import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = process.platform === 'win32' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe') : process.platform === 'darwin' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron') : pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
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
  const admin=users.find(u=>u.role==='owner'||u.role==='admin'); if(!admin)throw new Error('no owner login user')
  const la=await apiCall(page,'auth.login',admin.id,ADMIN_PW); if(!la.ok)throw new Error('login:'+la.error)
  console.log('  seeded login role =', admin.role)

  // ── seed product + 5 GRs today: cash100 / credit-unpaid50 / paid70 / overdue80 / cancelled90 ──
  const prod=await apiCall(page,'products.create',{trade_name:'ยาทดสอบซื้อE2E',category_id:1,unit_id:1,unit_name:'เม็ด',price_retail:10,cost_price:10,last_cost_price:10,reorder_point:0,notes:''})
  if(!prod.ok||!prod.value?.id)throw new Error('create:'+prod.error)
  const pid=prod.value.id
  const supList=(await apiCall(page,'suppliers.list')).value||[]
  const supplierId=(Array.isArray(supList)?supList[0]?.id:supList.rows?.[0]?.id)||1
  async function gr(inv,payment_type,is_paid,extra,cost,qty,lot){
    const no=(await apiCall(page,'purchase.nextGRNumber')).value||inv
    const r=await apiCall(page,'purchase.save',{invoice_no:no,supplier_id:supplierId,supplier_invoice_no:inv,receive_date:localToday(),payment_type,is_paid,vat_mode:'none',vat_rate:0,userId:admin.id,...extra,items:[{product_id:pid,lot_number:lot,expiry_date:'2030-12-31',cost_price:cost,sell_price:20,qty}]})
    if(!r.ok)throw new Error(inv+':'+r.error)
    return no
  }
  await gr('INV-CASH','cash',true,{},10,10,'LC')                                              // 100
  await gr('INV-CREDIT','credit',false,{due_date:plusDays(30)},5,10,'LK')                     // 50
  await gr('INV-PAID','credit',true,{due_date:plusDays(30),paid_date:localToday()},7,10,'LP') // 70
  await gr('INV-OVERDUE','credit',false,{due_date:plusDays(-5)},8,10,'LO')                    // 80
  const gr5No=await gr('INV-CANCEL','credit',false,{due_date:plusDays(30)},9,10,'LX')         // 90 → cancel
  const gr5cancel=await apiCall(page,'purchase.cancel',{invoice_no:gr5No,reason:'e2e cancel',userId:admin.id})
  if(!gr5cancel.ok||!gr5cancel.value?.success)throw new Error('gr5cancel:'+(gr5cancel.error||JSON.stringify(gr5cancel.value)))

  // ══════════ Part A — IPC sanity (unchanged: the Dashboard still consumes these) ══════════
  const today=localToday()
  const fs1=await apiCall(page,'reports.financeSummary',{date_from:today,date_to:today,with_compare:true})
  // 4 non-cancelled bills: cash100 + credit-unpaid50 + credit-paid70 + credit-overdue80 = 300 (cancelled 90 excluded)
  check('A1: financeSummary purchase_total=300 cash=100 credit=200 count=4', fs1.ok && Number(fs1.value?.purchase_total)===300 && Number(fs1.value?.purchase_cash)===100 && Number(fs1.value?.purchase_credit)===200 && Number(fs1.value?.purchase_count)===4, fs1.ok?JSON.stringify({t:fs1.value.purchase_total,c:fs1.value.purchase_cash,cr:fs1.value.purchase_credit,n:fs1.value.purchase_count}):fs1.error)
  check('A2: payable_total=130 payable_count=2 (current outstanding)', fs1.ok && Number(fs1.value?.payable_total)===130 && Number(fs1.value?.payable_count)===2)
  const tr1=await apiCall(page,'reports.salesPurchaseTrend',{date_from:today,date_to:today,granularity:'hour'})
  const bucketHasCount = tr1.ok && Array.isArray(tr1.value) && tr1.value.some(r=>Number(r.purchase_count)>0)
  check('A3: salesPurchaseTrend returns purchase_count per bucket', bucketHasCount, tr1.ok?('rows='+tr1.value.length):tr1.error)

  const hist=await apiCall(page,'purchase.history',{date_from:today,date_to:today,page:1,limit:50})
  const sum=hist.ok?(hist.value.summary||{}):{}
  check('A4: history summary paid_count=1', Number(sum.paid_count)===1, JSON.stringify(sum))
  check('A5: history summary overdue_count=1', Number(sum.overdue_count)===1, JSON.stringify(sum))
  const duenow=Math.max(0,Number(sum.unpaid_count)-Number(sum.overdue_count))
  check('A6: 5-way exclusive (cash+paid+duenow+overdue+cancelled === count)', Number(sum.cash_count)+Number(sum.paid_count)+duenow+Number(sum.overdue_count)+Number(sum.cancelled_count)===Number(sum.count), JSON.stringify({...sum,duenow}))
  const hPaid=await apiCall(page,'purchase.history',{date_from:today,date_to:today,payment_type:'paid',page:1,limit:50})
  check('A7: filter paid → only credit+is_paid rows', hPaid.ok && hPaid.value.rows.length===1 && hPaid.value.rows.every(r=>r.payment_type==='credit'&&Number(r.is_paid)===1), hPaid.ok?('rows='+hPaid.value.rows.length):hPaid.error)
  const hDue=await apiCall(page,'purchase.history',{date_from:today,date_to:today,payment_type:'duenow',page:1,limit:50})
  check('A8: filter duenow → only unpaid credit not past due', hDue.ok && hDue.value.rows.length===1 && hDue.value.rows.every(r=>r.payment_type==='credit'&&Number(r.is_paid)===0&&(!r.due_date||r.due_date>=today)), hDue.ok?('rows='+hDue.value.rows.length):hDue.error)
  const hOver=await apiCall(page,'purchase.history',{date_from:today,date_to:today,payment_type:'overdue',page:1,limit:50})
  check('A9: filter overdue → only unpaid credit past due', hOver.ok && hOver.value.rows.length===1 && hOver.value.rows.every(r=>r.payment_type==='credit'&&Number(r.is_paid)===0&&r.due_date&&r.due_date<today), hOver.ok?('rows='+hOver.value.rows.length):hOver.error)

  // ══════════ Part B — admin UI: finance panel REMOVED from Manage ══════════
  page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()) })
  page.on('pageerror', e=>consoleErrors.push('pageerror:'+e.message))
  await page.evaluate(()=>{window.location.hash='#/manage/purchases'})
  await page.reload()
  await page.locator('text=ประวัติการซื้อ').first().waitFor({state:'visible',timeout:45000})
  await page.waitForTimeout(1200)

  check('B1: admin ไม่เห็น MetricStrip การเงินใน Manage (Phase B removal)', await page.locator('[data-slot="metric-strip"]').count()===0)
  check('B2: admin ไม่เห็นกราฟ "แนวโน้มการซื้อ" ใน Manage', await page.locator('text=แนวโน้มการซื้อ').count()===0)
  check('B3: admin ไม่เห็นการ์ด "สถานะการซื้อ"/"สรุปการซื้อ" ใน Manage', (await page.locator('text=สถานะการซื้อ').count())+(await page.locator('text=สรุปการซื้อ').count())===0)
  for(const l of ['จำนวนบิล','เงินสด','ชำระแล้ว','ค้างชำระ','เกินกำหนด','ยกเลิก']){
    check('B4: การ์ดนับ "'+l+'" แสดง (summary slot)', await page.locator('text='+l).count()>0)
  }
  check('B5: ตาราง "ประวัติการซื้อ" ยังอยู่', await page.locator('text=ประวัติการซื้อ').count()>0)
  await page.screenshot({path:pathMod.join(shotDir,'purchases-admin.png'),fullPage:false})

  // ── B6: finance numbers now live on the Dashboard ──
  await page.evaluate(()=>{window.location.hash='#/reports'})
  await page.waitForTimeout(2500)
  const stripText=await page.locator('[data-slot="metric-strip"]').first().innerText().catch(()=>'')
  check('B6: Dashboard MetricStrip แสดงยอดซื้อ 300.00 (finance ย้ายมาที่นี่)', stripText.includes('ยอดซื้อ') && stripText.includes('300.00'), JSON.stringify(stripText.replace(/\n/g,' | ')))
  await page.screenshot({path:pathMod.join(shotDir,'purchases-dashboard.png'),fullPage:false})

  // ══════════ Part C — staff sees the SAME Manage view; finance IPC stays gated ══════════
  const roleBtn=page.locator('button[title*="สลับ role"]').first()
  let switched=false
  try{ await roleBtn.waitFor({state:'visible',timeout:3000}); switched=true }catch{}
  if(!switched){
    check('C: สลับ role เป็น staff', false, 'TitleBar DEV switch not found')
  }else{
    // cycles owner → pharmacist → staff
    await roleBtn.click(); await page.waitForTimeout(500)
    await roleBtn.click(); await page.waitForTimeout(800)
    await page.evaluate(()=>{window.location.hash='#/manage/purchases'})
    await page.waitForTimeout(1500)
    check('C1: staff เห็นตาราง "ประวัติการซื้อ" (view เดียวกับ admin)', await page.locator('text=ประวัติการซื้อ').count()>0)
    check('C2: staff ไม่มี MetricStrip เช่นกัน', await page.locator('[data-slot="metric-strip"]').count()===0)
    check('C3: staff เห็นการ์ด "ชำระแล้ว"/"เกินกำหนด"', (await page.locator('text=ชำระแล้ว').count())>0 && (await page.locator('text=เกินกำหนด').count())>0)
    const fsStaff=await apiCall(page,'reports.financeSummary',{date_from:today,date_to:today})
    check('C4: staff → financeSummary FORBIDDEN (gate ยังอยู่แม้ UI หายทั้งคู่)', !fsStaff.ok && String(fsStaff.error).includes('FORBIDDEN'), fsStaff.error)
    check('C5: staff ไม่ white screen', (await page.locator('body').innerText()).length>50)
    await page.screenshot({path:pathMod.join(shotDir,'purchases-staff.png'),fullPage:false})
  }

  const fatal=consoleErrors.filter(e=>!/Autofill|DevTools|Download the React DevTools|favicon/i.test(e))
  check('D: ไม่มี console error ร้ายแรง', fatal.length===0, fatal.slice(0,3).join(' || ')||'clean')
}catch(e){
  console.log('  FATAL', e && e.message || e); failed++
}finally{
  console.log(`\n  ${passed} PASS / ${failed} FAIL`)
  await app.close().catch(()=>{})
  try{fsSync.rmSync(userDataDir,{recursive:true,force:true})}catch{}
  process.exit(failed>0?1:0)
}
