import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = process.platform === 'win32' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe') : process.platform === 'darwin' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron') : pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-posunit-e2e-'))
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
  const admin=users.find(u=>(u.role==='owner'||u.role==='admin')); if(!admin)throw new Error('no admin')
  const la=await apiCall(page,'auth.login',admin.id,ADMIN_PW); if(!la.ok)throw new Error('login:'+la.error)

  // ── seed product + a non-base unit (qty_per_base=10) ──
  // unique trade_name so the search modal returns exactly this product (the seeded
  // DB already occupies P0001.. so products.create assigns the next free code).
  const TRADE='ยาทดสอบหน่วยE2E'
  const prod=await apiCall(page,'products.create',{trade_name:TRADE,category_id:1,unit_id:1,unit_name:'เม็ด',price_retail:10,cost_price:4,last_cost_price:4,reorder_point:0,notes:''})
  if(!prod.ok||!prod.value?.id)throw new Error('create:'+prod.error)
  const pid=prod.value.id
  const code=prod.value.code
  const unitList=(await apiCall(page,'settings.listUnits')).value||[]
  // base unit = product.unit_id (=1); its display name is what the cart row shows for the base line.
  const baseUnitName=unitList.find(u=>u.id===1)?.name||'ชิ้น'
  // big unit must be a DIFFERENT unit_id than the base, else names collide in the cart row.
  const bigUnit=unitList.find(u=>u.id!==1)||unitList[0]
  const unitId=bigUnit?.id||2
  const addU=await apiCall(page,'products.addUnit',{product_id:pid,unit_id:unitId,barcode:null,qty_per_base:10,price_retail:100,price_wholesale1:0,price_wholesale2:0,is_for_sale:1,is_for_purchase:0,is_disabled:0})
  if(!addU.ok||!addU.value?.id)throw new Error('addUnit:'+addU.error)
  const puId=addU.value.id
  const bigUnitName=bigUnit?.name||''

  // give it stock so it can be sold (1 lot, 1000 base units)
  const sup=(await apiCall(page,'suppliers.list')).value||[]
  const supplierId=sup[0]?.id||1
  const grNo=(await apiCall(page,'purchase.nextGRNumber')).value||'GR-TEST'
  await apiCall(page,'purchase.save',{invoice_no:grNo,supplier_id:supplierId,supplier_invoice_no:'INV-1',receive_date:'2026-06-23',payment_type:'cash',is_paid:true,vat_mode:'none',vat_rate:0,userId:admin.id,items:[{product_id:pid,lot_number:'L1',expiry_date:'2030-12-31',cost_price:4,sell_price:10,qty:1000}]})

  // ══════════ Part A — IPC pos:getUnitFactors ══════════
  const a1=await apiCall(page,'pos.getUnitFactors',[puId])
  check('A1: getUnitFactors([puId]) → qty_per_base=10', a1.ok && Array.isArray(a1.value) && a1.value.length===1 && a1.value[0].id===puId && Number(a1.value[0].qty_per_base)===10, JSON.stringify(a1.value))

  const upd=await apiCall(page,'products.updateUnit',puId,{qty_per_base:5})
  const a2=await apiCall(page,'pos.getUnitFactors',[puId])
  check('A2: หลัง updateUnit → อ่านสดได้ 5 (ไม่ cache)', upd.ok && a2.ok && a2.value.length===1 && Number(a2.value[0].qty_per_base)===5, 'upd='+JSON.stringify(upd)+' got='+JSON.stringify(a2.value))

  // reset back to 10 for the UI flow
  await apiCall(page,'products.updateUnit',puId,{qty_per_base:10})

  const a3a=await apiCall(page,'pos.getUnitFactors',[-1,0,puId,puId])
  const a3b=await apiCall(page,'pos.getUnitFactors',[])
  check('A3: กรอง id<=0 + dedup → 1 แถว, [] → []', a3a.ok && a3a.value.length===1 && a3a.value[0].id===puId && a3b.ok && Array.isArray(a3b.value) && a3b.value.length===0, 'a3a='+JSON.stringify(a3a.value)+' a3b='+JSON.stringify(a3b.value))

  // ══════════ Part B — UI guard flow ══════════
  // The App reads setup_completed/login state once at mount; completeSetup+login
  // were done via IPC AFTER that, so reload the renderer to pass the setup/login
  // gate and render the real router (POS page). Session lives in the main process,
  // so it survives the reload.
  await page.evaluate(()=>{window.location.hash='#/'})
  await page.reload()
  const mainInput=page.locator('input[placeholder*="ค้นหาสินค้า"]').first()
  await mainInput.waitFor({state:'visible',timeout:45000})

  // type the unique trade name → opens shared ProductSearchDialog
  await mainInput.click()
  await mainInput.fill(TRADE)
  // wait for search dialog rows to populate (the product name appears in the modal)
  const searchRow=page.locator('text='+TRADE).first()
  await searchRow.waitFor({state:'visible',timeout:8000})
  // press Enter → selects the highlighted (first = base unit) row → adds to cart
  await page.keyboard.press('Enter')

  // cart should now have 1 line. The cart unit button shows the unit name (primary-soft size sm).
  // Wait until the empty-state text is gone (cart not empty).
  await page.locator('text=ยังไม่มีรายการสั่งซื้อ').waitFor({state:'detached',timeout:8000}).catch(()=>{})
  const cartUnitBtn=page.locator('button:has(span.truncate)').filter({hasText:baseUnitName}).first()
  const addedOk=await cartUnitBtn.count()>0
  check('B-setup: เพิ่มสินค้าลงตะกร้า 1 บรรทัด (หน่วยฐาน "'+baseUnitName+'")', addedOk, 'cartUnitBtn='+(await cartUnitBtn.count()))
  if(!addedOk)throw new Error('cart line not added — cannot continue Part B')

  // open unit dialog from the cart row unit button
  await cartUnitBtn.click()
  await page.locator('text=เลือกหน่วย').first().waitFor({state:'visible',timeout:5000})
  // pick the BIG unit (the one showing "บรรจุ 10 ..."). Base row shows "หน่วยหลัก" — skip it.
  const bigUnitOption=page.locator('button').filter({hasText:'บรรจุ 10'}).first()
  await bigUnitOption.waitFor({state:'visible',timeout:5000})
  await bigUnitOption.click()
  // dialog closes; cart row unit should now be the big unit (no longer "เม็ด")
  await page.locator('text=เลือกหน่วย').first().waitFor({state:'detached',timeout:5000}).catch(()=>{})
  const cartUnitNow=await page.locator('button:has(span.truncate)').filter({hasText:bigUnitName}).first().count()
  check('B-setup: เปลี่ยนหน่วยตะกร้าเป็นหน่วยใหญ่ ('+bigUnitName+')', cartUnitNow>0, 'matchBig='+cartUnitNow)

  // simulate someone editing the unit factor AFTER it was added (10 → 5)
  const sim=await apiCall(page,'products.updateUnit',puId,{qty_per_base:5})
  if(!sim.ok)throw new Error('sim updateUnit:'+sim.error)

  // click the big "ชำระเงิน" pay button (text-4xl span in the cart panel)
  const payBtn=page.locator('button:has-text("ชำระเงิน")').first()
  await payBtn.click()

  // B1: mismatch ConfirmDialog "ตัวคูณหน่วยเปลี่ยนไป" appears
  const mismatchTitle=page.locator('text=ตัวคูณหน่วยเปลี่ยนไป').first()
  let b1=false
  try{ await mismatchTitle.waitFor({state:'visible',timeout:2500}); b1=true }catch{}
  check('B1: ConfirmDialog "ตัวคูณหน่วยเปลี่ยนไป" ปรากฏ', b1)

  // B2: payment dialog did NOT open (its DialogTitle "ชำระเงิน" + the cash input placeholder 0.00 should be absent)
  // payment dialog header is a DialogTitle text-2xl; differentiate from the pay button (text-4xl span).
  const payDialogTitle=page.locator('h2:has-text("ชำระเงิน"), [role="dialog"] >> text=ชำระเงิน')
  // robust: check for the cash input that only exists inside the payment dialog
  const cashInput=page.locator('input[placeholder="0.00"]')
  const cashVisible=await cashInput.first().isVisible().catch(()=>false)
  check('B2: หน้าจ่ายเงินไม่เปิด (ไม่มี cash input 0.00)', cashVisible===false, 'cashVisible='+cashVisible)

  // B3: dialog shows "× 10" (snapshot) and "× 5" (current)
  let b3=false
  if(b1){
    const has10=await page.locator('text=× 10').count()
    const has5=await page.locator('text=× 5').count()
    b3=has10>0 && has5>0
    check('B3: แสดง "× 10" (ตอนหยิบ) และ "× 5" (ปัจจุบัน)', b3, 'has10='+has10+' has5='+has5)
  } else {
    check('B3: แสดง "× 10" และ "× 5"', false, 'skipped — B1 dialog not visible')
  }

  // click "ลบรายการแล้วหยิบใหม่"
  if(b1){
    const removeBtn=page.locator('button:has-text("ลบรายการแล้วหยิบใหม่")').first()
    await removeBtn.click()
    // dialog closes + cart empty
    await mismatchTitle.waitFor({state:'detached',timeout:5000}).catch(()=>{})
    const dialogGone=await mismatchTitle.isVisible().catch(()=>false)
    const emptyAgain=await page.locator('text=ยังไม่มีรายการสั่งซื้อ').first().isVisible().catch(()=>false)
    check('ลบรายการ: dialog ปิด + ตะกร้าว่าง', dialogGone===false && emptyAgain===true, 'dialogVisible='+dialogGone+' emptyState='+emptyAgain)
  } else {
    check('ลบรายการ: dialog ปิด + ตะกร้าว่าง', false, 'skipped — B1 dialog not visible')
  }

  // ══════════ Part C — happy path (base unit, no mismatch) ══════════
  // add base unit again, do NOT change unit, do NOT edit factor → pay opens
  await mainInput.click()
  await mainInput.fill(TRADE)
  await page.locator('text='+TRADE).first().waitFor({state:'visible',timeout:8000})
  await page.keyboard.press('Enter')
  await page.locator('text=ยังไม่มีรายการสั่งซื้อ').waitFor({state:'detached',timeout:8000}).catch(()=>{})
  const payBtn2=page.locator('button:has-text("ชำระเงิน")').first()
  await payBtn2.click()
  let cOk=false
  try{ await page.locator('input[placeholder="0.00"]').first().waitFor({state:'visible',timeout:3000}); cOk=true }catch{}
  const noMismatch=(await page.locator('text=ตัวคูณหน่วยเปลี่ยนไป').count())===0
  check('C: happy path หน่วยฐาน → payment เปิด, ไม่มี mismatch', cOk && noMismatch, 'paymentOpen='+cOk+' noMismatch='+noMismatch)

}catch(e){console.log('ERROR:'+e.message);failed++}
finally{await app.close().catch(()=>{});fsSync.rmSync(userDataDir,{recursive:true,force:true})}
console.log('\n=== '+passed+' passed, '+failed+' failed ===')
process.exit(failed>0?1:0)
