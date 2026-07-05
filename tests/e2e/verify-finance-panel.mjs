// Real-Electron e2e — Sales finance ownership after Dashboard Phase B.
// REWRITTEN 2026-07-05: the admin finance overview (MetricStrip + trend +
// status/averages cards) was REMOVED from /manage/sales on 2026-06-29 —
// finance numbers live on the Dashboard only. This test seeds one retail
// sale and verifies: financeSummary IPC numbers (admin), the ABSENCE of the
// old panel in Manage (admin sees the same view as staff), the numbers
// showing on the Dashboard MetricStrip, and the staff FORBIDDEN gate.
import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = process.platform === 'win32' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe') : process.platform === 'darwin' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron') : pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
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
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(w){w.setMinimumSize(1440,800);w.setBounds({width:1440,height:900})}}).catch(()=>{})

  const setup=await apiCall(page,'settings.completeSetup',{shop:{shop_name:'E2E'},vat:{vat_enabled:false},adminPassword:ADMIN_PW})
  if(!setup.ok)throw new Error('setup:'+setup.error)
  const users=(await apiCall(page,'auth.listLoginUsers')).value||[]
  const admin=users.find(u=>u.role==='owner'||u.role==='admin'); if(!admin)throw new Error('no owner login user')
  const la=await apiCall(page,'auth.login',admin.id,ADMIN_PW); if(!la.ok)throw new Error('login:'+la.error)

  // ── seed: product, stock (GR cost 4), ONE retail sale today 10×10 = 100 ──
  const prod=await apiCall(page,'products.create',{trade_name:'ยาทดสอบไฟแนนซ์E2E',category_id:1,unit_id:1,unit_name:'เม็ด',price_retail:10,cost_price:4,last_cost_price:4,reorder_point:0,notes:''})
  if(!prod.ok||!prod.value?.id)throw new Error('create:'+prod.error)
  const pid=prod.value.id
  const supList=(await apiCall(page,'suppliers.list')).value||[]
  const supplierId=(Array.isArray(supList)?supList[0]?.id:supList.rows?.[0]?.id)||1
  const grNo=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-FIN'
  const gr=await apiCall(page,'purchase.save',{invoice_no:grNo,supplier_id:supplierId,supplier_invoice_no:'INV-FIN',receive_date:localToday(),payment_type:'cash',is_paid:true,vat_mode:'none',vat_rate:0,userId:admin.id,items:[{product_id:pid,lot_number:'LF',expiry_date:'2030-12-31',cost_price:4,sell_price:10,qty:50}]})
  if(!gr.ok)throw new Error('gr:'+gr.error)
  const bill=await apiCall(page,'pos.saveBill',{sale_type:'retail',customer_id:null,customer_name_free:'',items:[{product_id:pid,item_name:'ยาทดสอบไฟแนนซ์E2E',unit_name:'เม็ด',qty:10,qty_per_base:1,unit_price:10,discount:0,unit_vat:0,line_total:100}],subtotal:100,total_discount:0,total_vat:0,total_amount:100,cash_amount:100,card_amount:0,transfer_amount:0,change_amount:0,sold_by:admin.id})
  if(!bill.ok)throw new Error('saveBill:'+bill.error)
  const invoiceNo=bill.value.invoice_no

  // ══════════ Part A — financeSummary IPC (Dashboard's data source) ══════════
  const today=localToday()
  const fs1=await apiCall(page,'reports.financeSummary',{date_from:today,date_to:today})
  check('A1: sales_net=100 sale_count=1', fs1.ok && Number(fs1.value?.sales_net)===100 && Number(fs1.value?.sale_count)===1, fs1.ok?JSON.stringify({net:fs1.value.sales_net,n:fs1.value.sale_count}):fs1.error)
  check('A2: sales_cost=40 (FEFO lot cost) sales_profit=60', fs1.ok && Number(fs1.value?.sales_cost)===40 && Number(fs1.value?.sales_profit)===60, fs1.ok?JSON.stringify({c:fs1.value.sales_cost,p:fs1.value.sales_profit}):fs1.error)
  check('A3: cash_amount=100 (ช่องทางชำระ)', fs1.ok && Number(fs1.value?.cash_amount)===100, 'got='+fs1.value?.cash_amount)

  // ══════════ Part B — admin UI: finance panel REMOVED from Manage/Sales ══════════
  page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()) })
  page.on('pageerror', e=>consoleErrors.push('pageerror:'+e.message))
  await page.evaluate(()=>{window.location.hash='#/manage'})
  await page.reload()
  await page.locator('text=ประวัติการขาย').first().waitFor({state:'visible',timeout:45000})
  await page.waitForTimeout(1200)

  check('B1: admin ไม่เห็น MetricStrip การเงินใน Manage/Sales (Phase B removal)', await page.locator('[data-slot="metric-strip"]').count()===0)
  check('B2: admin ไม่เห็น "ภาพรวมการเงิน"/กราฟแนวโน้มใน Manage/Sales', (await page.locator('text=ภาพรวมการเงิน').count())+(await page.locator('text=แนวโน้มการขาย').count())===0)
  check('B3: ตาราง "ประวัติการขาย" แสดง + เห็นเลขบิลที่เพิ่งขาย', await page.locator('text='+invoiceNo).count()>0, 'invoice='+invoiceNo)
  await page.screenshot({path:pathMod.join(shotDir,'finance-sales-admin.png'),fullPage:false})

  // ── B4: finance numbers now live on the Dashboard ──
  await page.evaluate(()=>{window.location.hash='#/reports'})
  await page.waitForTimeout(2500)
  const stripText=await page.locator('[data-slot="metric-strip"]').first().innerText().catch(()=>'')
  check('B4: Dashboard MetricStrip = ยอดขาย 100.00 / กำไร 60.00', stripText.includes('100.00') && stripText.includes('60.00'), JSON.stringify(stripText.replace(/\n/g,' | ')))
  await page.screenshot({path:pathMod.join(shotDir,'finance-dashboard.png'),fullPage:false})

  // ══════════ Part C — staff: same Manage view, IPC gate intact ══════════
  const roleBtn=page.locator('button[title*="สลับ role"]').first()
  let switched=false
  try{ await roleBtn.waitFor({state:'visible',timeout:3000}); switched=true }catch{}
  if(!switched){
    check('C: สลับ role เป็น staff', false, 'TitleBar DEV switch not found')
  }else{
    await roleBtn.click(); await page.waitForTimeout(500)   // owner → pharmacist
    await roleBtn.click(); await page.waitForTimeout(800)   // pharmacist → staff
    await page.evaluate(()=>{window.location.hash='#/manage'})
    await page.waitForTimeout(1500)
    check('C1: staff เห็นตาราง "ประวัติการขาย" (view เดียวกับ admin)', await page.locator('text=ประวัติการขาย').count()>0)
    check('C2: staff ไม่มี MetricStrip เช่นกัน', await page.locator('[data-slot="metric-strip"]').count()===0)
    const fsStaff=await apiCall(page,'reports.financeSummary',{date_from:today,date_to:today})
    check('C3: staff → financeSummary FORBIDDEN', !fsStaff.ok && String(fsStaff.error).includes('FORBIDDEN'), fsStaff.error)
    check('C4: staff ไม่ white screen', (await page.locator('body').innerText()).length>50)
    await page.screenshot({path:pathMod.join(shotDir,'finance-sales-staff.png'),fullPage:false})
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
