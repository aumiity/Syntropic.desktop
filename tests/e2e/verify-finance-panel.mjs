import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-finpanel-e2e-'))
const shotDir = pathMod.join(projectRoot, 'tests', 'e2e', '_shots')
fsSync.mkdirSync(shotDir, { recursive: true })
function loadElectron(){for(const c of [process.env.PLAYWRIGHT_CORE,'playwright-core'].filter(Boolean)){try{return require(c)._electron}catch{}}throw new Error('playwright-core not found')}
const electron=loadElectron()
let passed=0,failed=0
function check(n,ok,d){if(ok){console.log('  PASS '+n+(d?' -- '+d:''));passed++}else{console.log('  FAIL '+n+(d?' -- '+d:''));failed++}}
async function apiCall(pg,dotted,...args){return pg.evaluate(async({dotted,args})=>{const fn=dotted.split('.').reduce((o,k)=>o?o[k]:undefined,window.api);if(typeof fn!=='function')return{ok:false,error:'no api:'+dotted};try{return{ok:true,value:await fn(...args)}}catch(e){return{ok:false,error:String(e&&e.message||e)}}},{dotted,args})}
async function getMainPage(app){for(let i=0;i<80;i++){for(const w of app.windows()){try{if(await w.evaluate(()=>!!(window.api&&window.api.auth)))return w}catch{}}await new Promise(r=>setTimeout(r,500))}throw new Error('main window never appeared')}
function localToday(){const d=new Date();const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
const ADMIN_PW='admin123'
const app=await electron.launch({executablePath:electronExe,args:['.','--user-data-dir='+userDataDir],cwd:projectRoot,env:{...process.env,NODE_ENV:'development'}})
let page
const consoleErrors=[]
try{
  page=await getMainPage(app)
  // lock the window to 1440x800 (main process)
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w){w.setMinimumSize(1440,800);w.setBounds({width:1440,height:800})}}).catch(()=>{})

  const setup=await apiCall(page,'settings.completeSetup',{shop:{shop_name:'E2E'},vat:{vat_enabled:false},adminPassword:ADMIN_PW})
  if(!setup.ok)throw new Error('setup:'+setup.error)
  const users=(await apiCall(page,'auth.listLoginUsers')).value||[]
  const admin=users.find(u=>u.role==='admin'); if(!admin)throw new Error('no admin')
  const la=await apiCall(page,'auth.login',admin.id,ADMIN_PW); if(!la.ok)throw new Error('login:'+la.error)

  // ── seed a product, stock (GR), and ONE retail sale TODAY so finance != empty ──
  const TRADE='ยาทดสอบไฟแนนซ์E2E'
  const prod=await apiCall(page,'products.create',{trade_name:TRADE,category_id:1,unit_id:1,unit_name:'เม็ด',price_retail:10,cost_price:4,last_cost_price:4,reorder_point:0,notes:''})
  if(!prod.ok||!prod.value?.id)throw new Error('create:'+prod.error)
  const pid=prod.value.id
  const sup=(await apiCall(page,'suppliers.list')).value||[]
  const supplierId=sup[0]?.id||1
  const grNo=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-TEST'
  const gr=await apiCall(page,'purchase.save',{invoice_no:grNo,supplier_id:supplierId,supplier_invoice_no:'INV-1',receive_date:localToday(),payment_type:'cash',is_paid:true,vat_mode:'none',vat_rate:0,userId:admin.id,items:[{product_id:pid,lot_number:'L1',expiry_date:'2030-12-31',cost_price:4,sell_price:10,qty:100}]})
  if(!gr.ok)throw new Error('gr:'+gr.error)
  const sale=await apiCall(page,'pos.saveBill',{sale_type:'retail',customer_id:null,customer_name_free:'',items:[{product_id:pid,item_name:TRADE,unit_name:'เม็ด',qty:5,qty_per_base:1,unit_price:10,discount:0,line_total:50}],subtotal:50,total_discount:0,total_vat:0,total_amount:50,cash_amount:50,card_amount:0,transfer_amount:0,change_amount:0,sold_by:admin.id})
  if(!sale.ok)throw new Error('sale:'+sale.error)

  // ══════════ Part A — IPC sanity (admin) ══════════
  const today=localToday()
  const fs1=await apiCall(page,'reports.financeSummary',{date_from:today,date_to:today,with_compare:true})
  check('A1: financeSummary (admin) ok, net=50 cost=20 profit=30', fs1.ok && Number(fs1.value?.sales_net)===50 && Number(fs1.value?.sales_cost)===20 && Number(fs1.value?.sales_profit)===30, JSON.stringify(fs1.ok?{net:fs1.value.sales_net,cost:fs1.value.sales_cost,profit:fs1.value.sales_profit,prev:fs1.value.previous?'set':null}:fs1.error))
  const tr1=await apiCall(page,'reports.salesPurchaseTrend',{date_from:today,date_to:today,granularity:'day'})
  check('A2: salesPurchaseTrend (admin) ok, returns array', tr1.ok && Array.isArray(tr1.value) && tr1.value.length>=1, tr1.ok?('len='+tr1.value.length):tr1.error)

  // ══════════ Part B — UI flow (admin) ══════════
  page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()) })
  page.on('pageerror', e=>consoleErrors.push('pageerror:'+e.message))
  await page.evaluate(()=>{window.location.hash='#/manage'})
  await page.reload()
  // wait for the Sales page header
  await page.locator('text=ประวัติการขาย').first().waitFor({state:'visible',timeout:45000})

  const toggle=page.locator('button[aria-label="ภาพรวมการเงิน"]')
  await toggle.first().waitFor({state:'visible',timeout:8000}).catch(()=>{})
  check('B1: admin เห็นปุ่ม toggle ไอคอน (aria-label ภาพรวมการเงิน) ในแถบ', await toggle.count()===1, 'count='+await toggle.count())

  // panel closed by default → KPI labels absent
  check('B2: ค่าเริ่มต้นแผงปิด (ยังไม่เห็น KPI)', await page.locator('text=ยอดขายสุทธิ').count()===0)

  await toggle.first().click()
  // panel expands → 4 KPI labels + note + chart + granularity
  const lblNet=page.locator('text=ยอดขายสุทธิ').first()
  await lblNet.waitFor({state:'visible',timeout:6000}).catch(()=>{})
  const haveKpis = (await page.locator('text=ยอดขายสุทธิ').count())>0
    && (await page.locator('text=ต้นทุนขาย').count())>0
    && (await page.locator('text=กำไรขั้นต้น').count())>0
    && (await page.locator('text=อัตรากำไร').count())>0
  check('B3: กดเปิด → KPI 4 ใบครบ (ยอดขายสุทธิ/ต้นทุนขาย/กำไรขั้นต้น/อัตรากำไร)', haveKpis)

  // KPI values: net ฿50.00, cost ฿20.00, profit ฿30.00, margin 60.0%
  const txt=await page.locator('body').innerText()
  check('B4: ค่าตัวเลขถูก (50.00 / 20.00 / 30.00 / 60.0%)', txt.includes('50.00')&&txt.includes('20.00')&&txt.includes('30.00')&&txt.includes('60.0%'), 'has50='+txt.includes('50.00')+' has20='+txt.includes('20.00')+' has30='+txt.includes('30.00')+' hasMargin='+txt.includes('60.0%'))

  check('B5: โน้ตขอบเขต info-soft แสดง', (await page.locator('text=ไม่ขึ้นกับช่องค้นหา').count())>0)
  check('B6: กราฟ TrendChart (recharts svg) วาด', (await page.locator('.recharts-surface').count())>0, 'svg='+await page.locator('.recharts-surface').count())
  check('B7: GranularityTabs แสดง (วัน/สัปดาห์/เดือน)', (await page.locator('text=สัปดาห์').count())>0 && (await page.locator('text=เดือน').count())>0)
  // delta sub renders on ยอดขายสุทธิ (prev window empty → "ใหม่ในช่วงนี้")
  check('B8: delta sub แสดง (เทียบช่วงก่อน — prev ว่าง = "ใหม่ในช่วงนี้")', (await page.locator('text=ใหม่ในช่วงนี้').count())>0, 'newCount='+await page.locator('text=ใหม่ในช่วงนี้').count())

  await page.screenshot({path:pathMod.join(shotDir,'finance-panel-admin-open.png')})

  // ── switch granularity → refetch, no crash ──
  await page.locator('text=เดือน').first().click()
  await new Promise(r=>setTimeout(r,800))
  check('B9: สลับ granularity (เดือน) → แผงยังอยู่ ไม่ crash', (await page.locator('text=ยอดขายสุทธิ').count())>0 && (await page.locator('.recharts-surface').count())>0)

  // ── persistence across tab switch ──
  await page.evaluate(()=>{window.location.hash='#/manage/expiry'})
  await new Promise(r=>setTimeout(r,600))
  const onExpiry=(await page.locator('button[aria-label="ภาพรวมการเงิน"]').count())===0
  await page.evaluate(()=>{window.location.hash='#/manage'})
  await page.locator('text=ประวัติการขาย').first().waitFor({state:'visible',timeout:8000})
  await new Promise(r=>setTimeout(r,500))
  check('B10: พับ/กางจำสถานะข้ามแท็บ (กลับมาแล้วแผงยังเปิด)', onExpiry && (await page.locator('text=ยอดขายสุทธิ').count())>0)

  // ══════════ Part C — staff role (no button, no panel, no admin-IPC error) ══════════
  consoleErrors.length=0
  const roleBtn=page.locator('button[title="สลับ role (admin/staff) สำหรับทดสอบ"]')
  await roleBtn.first().waitFor({state:'visible',timeout:5000})
  await roleBtn.first().click() // admin → staff
  await new Promise(r=>setTimeout(r,900))
  check('C1: staff ไม่เห็นปุ่ม toggle', (await page.locator('button[aria-label="ภาพรวมการเงิน"]').count())===0)
  check('C2: staff ไม่เห็น panel (KPI หาย)', (await page.locator('text=ยอดขายสุทธิ').count())===0)
  const finErr=consoleErrors.filter(e=>/financeSummary|salesPurchaseTrend|FORBIDDEN|requireAdmin/i.test(e))
  check('C3: staff ไม่มี admin-IPC error ใน console', finErr.length===0, finErr.join(' | ')||'clean')
  await page.screenshot({path:pathMod.join(shotDir,'finance-panel-staff.png')})

}catch(e){console.log('ERROR:'+e.message);failed++}
finally{await app.close().catch(()=>{});fsSync.rmSync(userDataDir,{recursive:true,force:true})}
console.log('\nconsole errors seen (all): '+consoleErrors.length)
console.log('=== '+passed+' passed, '+failed+' failed ===')
process.exit(failed>0?1:0)
