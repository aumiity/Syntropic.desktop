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
  // credit-PAID 70 (is_paid today)
  const gr3No=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-3'
  const gr3=await apiCall(page,'purchase.save',{invoice_no:gr3No,supplier_id:supplierId,supplier_invoice_no:'INV-PAID',receive_date:localToday(),payment_type:'credit',is_paid:true,due_date:plusDays(30),paid_date:localToday(),vat_mode:'none',vat_rate:0,userId:admin.id,items:[{product_id:pid,lot_number:'LP',expiry_date:'2030-12-31',cost_price:7,sell_price:20,qty:10}]})
  if(!gr3.ok)throw new Error('gr3:'+gr3.error)
  // credit-OVERDUE 80 (unpaid, due 5 days ago)
  const gr4No=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-4'
  const gr4=await apiCall(page,'purchase.save',{invoice_no:gr4No,supplier_id:supplierId,supplier_invoice_no:'INV-OVERDUE',receive_date:localToday(),payment_type:'credit',is_paid:false,due_date:plusDays(-5),vat_mode:'none',vat_rate:0,userId:admin.id,items:[{product_id:pid,lot_number:'LO',expiry_date:'2030-12-31',cost_price:8,sell_price:20,qty:10}]})
  if(!gr4.ok)throw new Error('gr4:'+gr4.error)
  // CANCELLED 90 (save then cancel — stock untouched so cancel is allowed)
  const gr5No=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-5'
  const gr5=await apiCall(page,'purchase.save',{invoice_no:gr5No,supplier_id:supplierId,supplier_invoice_no:'INV-CANCEL',receive_date:localToday(),payment_type:'credit',is_paid:false,due_date:plusDays(30),vat_mode:'none',vat_rate:0,userId:admin.id,items:[{product_id:pid,lot_number:'LX',expiry_date:'2030-12-31',cost_price:9,sell_price:20,qty:10}]})
  if(!gr5.ok)throw new Error('gr5:'+gr5.error)
  const gr5cancel=await apiCall(page,'purchase.cancel',{invoice_no:gr5No,reason:'e2e cancel',userId:admin.id})
  if(!gr5cancel.ok||!gr5cancel.value?.success)throw new Error('gr5cancel:'+(gr5cancel.error||JSON.stringify(gr5cancel.value)))

  // ══════════ Part A — IPC sanity (admin window) ══════════
  const today=localToday()
  const fs1=await apiCall(page,'reports.financeSummary',{date_from:today,date_to:today,with_compare:true})
  // 4 non-cancelled bills: cash100 + credit-unpaid50 + credit-paid70 + credit-overdue80 = 300 (cancelled 90 excluded)
  check('A1: financeSummary purchase_total=300 cash=100 credit=200 count=4', fs1.ok && Number(fs1.value?.purchase_total)===300 && Number(fs1.value?.purchase_cash)===100 && Number(fs1.value?.purchase_credit)===200 && Number(fs1.value?.purchase_count)===4, fs1.ok?JSON.stringify({t:fs1.value.purchase_total,c:fs1.value.purchase_cash,cr:fs1.value.purchase_credit,n:fs1.value.purchase_count,pay:fs1.value.payable_total,payc:fs1.value.payable_count}):fs1.error)
  // payable = current outstanding unpaid credit = 50 (unpaid) + 80 (overdue) = 130, 2 bills
  check('A2: payable_total=130 payable_count=2 (current outstanding)', fs1.ok && Number(fs1.value?.payable_total)===130 && Number(fs1.value?.payable_count)===2)
  const tr1=await apiCall(page,'reports.salesPurchaseTrend',{date_from:today,date_to:today,granularity:'hour'})
  const bucketHasCount = tr1.ok && Array.isArray(tr1.value) && tr1.value.some(r=>Number(r.purchase_count)>0)
  check('A3: salesPurchaseTrend returns purchase_count per bucket', bucketHasCount, tr1.ok?('rows='+tr1.value.length+' sumCount='+tr1.value.reduce((s,r)=>s+(Number(r.purchase_count)||0),0)):tr1.error)

  // ── purchase.history summary + grouped status filters ──
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

  // ══════════ Part B — admin UI ══════════
  page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()) })
  page.on('pageerror', e=>consoleErrors.push('pageerror:'+e.message))
  await page.evaluate(()=>{window.location.hash='#/manage/purchases'})
  await page.reload()
  await page.locator('text=ประวัติการซื้อ').first().waitFor({state:'visible',timeout:45000})
  await page.waitForTimeout(1500) // let finance fetch resolve

  const labels=['ยอดซื้อรวม','เงินสด','เครดิต (ทั้งหมด)','ค้างชำระ (ทั้งหมด)']
  for(const l of labels){ check('B-strip: เห็นการ์ด "'+l+'"', await page.locator('text='+l).count()>0) }
  check('B: เห็นกราฟ "แนวโน้มการซื้อ"', await page.locator('text=แนวโน้มการซื้อ').count()>0)
  check('B: เห็น toggle "ยอดซื้อ"', await page.locator('button:has-text("ยอดซื้อ")').count()>0)
  check('B: เห็น toggle "จำนวนบิล"', await page.locator('button:has-text("จำนวนบิล")').count()>0)
  check('B: เห็นการ์ด "สถานะการซื้อ"', await page.locator('text=สถานะการซื้อ').count()>0)
  check('B: เห็นการ์ด "สรุปการซื้อ"', await page.locator('text=สรุปการซื้อ').count()>0)

  // value binding: ยอดซื้อรวม = 300.00, ค้างชำระ (ทั้งหมด) = 130.00
  const stripText=await page.locator('[data-slot="metric-strip"]').first().innerText().catch(()=>'')
  check('B: MetricStrip แสดงยอด 300.00 + ค้างชำระ (ทั้งหมด) 130.00', stripText.includes('300.00') && stripText.includes('130.00'), JSON.stringify(stripText.replace(/\n/g,' | ')))

  // table status badges (new 5-color taxonomy): ชำระแล้ว / ค้างชำระ / เกินกำหนด appear
  for(const l of ['ชำระแล้ว','ค้างชำระ','เกินกำหนด']){ check('B-badge: เห็น label "'+l+'"', await page.locator('text='+l).count()>0) }

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
    check('B: เปลี่ยนช่วงวันที่ (เดือนก่อน ว่าง) → ยอดอัปเดตเป็น 0.00 (ไม่ใช่ 300)', stripText2.includes('0.00') && !stripText2.includes('300.00'), JSON.stringify(stripText2.replace(/\n/g,' | ')))
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
  // staff status cards (6): incl ชำระแล้ว + เกินกำหนด (new buckets)
  check('C: staff เห็นการ์ด "ชำระแล้ว"', await page.locator('text=ชำระแล้ว').count()>0)
  check('C: staff เห็นการ์ด "เกินกำหนด"', await page.locator('text=เกินกำหนด').count()>0)
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
