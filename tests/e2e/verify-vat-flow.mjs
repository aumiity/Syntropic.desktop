// Real-Electron e2e — VAT flow (project_vat_phasing memory, click-test replacement).
// Fresh temp DB. Covers: NO-VAT hide/force, vat_enabled un-flippable via
// saveSalesSettings, guarded one-way upgradeToVat (+validation +double-upgrade),
// VAT sale snapshot → vatSummary output (voided excluded), GR input VAT
// (inclusive extract + gross cost model + per-bill 'none'), expense input VAT
// (has_tax_invoice forcing), net_vat, guarded downgrade (password+reason),
// hasVatHistory keeps the ภาษี tab visible after downgrade.
//
// Run:  node tests/e2e/verify-vat-flow.mjs   (needs `npm run dev` on :5173)
import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = process.platform === 'win32' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe') : process.platform === 'darwin' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron') : pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-vat-e2e-'))
function loadElectron(){for(const c of [process.env.PLAYWRIGHT_CORE,'playwright-core'].filter(Boolean)){try{return require(c)._electron}catch{}}throw new Error('playwright-core not found')}
const electron=loadElectron()
let passed=0,failed=0
function check(n,ok,d){if(ok){console.log('  PASS '+n+(d?' -- '+d:''));passed++}else{console.log('  FAIL '+n+(d?' -- '+d:''));failed++}}
async function api(pg,dotted,...args){return pg.evaluate(async({dotted,args})=>{const fn=dotted.split('.').reduce((o,k)=>o?o[k]:undefined,window.api);if(typeof fn!=='function')return{ok:false,error:'no api:'+dotted};try{return{ok:true,value:await fn(...args)}}catch(e){return{ok:false,error:String(e&&e.message||e)}}},{dotted,args})}
const errHas=(r,s)=>!r.ok&&String(r.error).includes(s)
async function getMainPage(app){for(let i=0;i<80;i++){for(const w of app.windows()){try{if(await w.evaluate(()=>!!(window.api&&window.api.auth)))return w}catch{}}await new Promise(r=>setTimeout(r,500))}throw new Error('main window never appeared')}
function localToday(){const d=new Date();const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
const near=(a,b,eps=0.01)=>Math.abs(Number(a)-Number(b))<=eps

const ADMIN_PW='admin123'
const app=await electron.launch({executablePath:electronExe,args:['.','--user-data-dir='+userDataDir],cwd:projectRoot,env:{...process.env,NODE_ENV:'development'}})
try{
  const page=await getMainPage(app)
  const today=localToday()

  // ── setup: NO-VAT shop + owner login + a product with stock ──
  const setup=await api(page,'settings.completeSetup',{shop:{shop_name:'VAT E2E'},vat:{vat_enabled:false},adminPassword:ADMIN_PW})
  if(!setup.ok)throw new Error('setup:'+setup.error)
  const users=(await api(page,'auth.listLoginUsers')).value||[]
  const owner=users.find(u=>u.role==='owner'||u.role==='admin'); if(!owner)throw new Error('no owner')
  const la=await api(page,'auth.login',owner.id,ADMIN_PW); if(!la.ok)throw new Error('login:'+la.error)
  const prod=await api(page,'products.create',{trade_name:'ยาแวตเทส',category_id:1,unit_id:1,unit_name:'เม็ด',price_retail:107,cost_price:50,last_cost_price:50,reorder_point:0,notes:''})
  if(!prod.ok)throw new Error('create:'+prod.error)
  const pid=prod.value.id
  const sup=(await api(page,'suppliers.list')).value||[]
  const supplierId=(Array.isArray(sup)?sup[0]?.id:sup.rows?.[0]?.id)||1
  async function gr(no,vatMode,vatRate,costPrice,qty,lot){
    return api(page,'purchase.save',{invoice_no:no,supplier_id:supplierId,supplier_invoice_no:no,receive_date:today,payment_type:'cash',is_paid:true,vat_mode:vatMode,vat_rate:vatRate,userId:owner.id,items:[{product_id:pid,lot_number:lot,expiry_date:'2030-12-31',cost_price:costPrice,sell_price:107,qty}]})
  }

  // ── V1: fresh shop = NO-VAT ──
  console.log('\n=== V1 fresh shop is NO-VAT ===')
  const ss0=(await api(page,'settings.getSalesSettings')).value
  check('V1: sales_settings.vat_enabled = 0',Number(ss0?.vat_enabled)===0,'got='+ss0?.vat_enabled)
  check('V1: hasVatHistory = false',(await api(page,'settings.hasVatHistory')).value===false)

  // ── V2: vat_enabled is NOT flippable via generic settings save ──
  console.log('\n=== V2 saveSalesSettings strips vat_enabled/vat_rate ===')
  const flip=await api(page,'settings.saveSalesSettings',{vat_enabled:1,vat_rate:10})
  const ss1=(await api(page,'settings.getSalesSettings')).value
  check('V2: หลังพยายาม flip ผ่าน saveSalesSettings → vat_enabled ยังเป็น 0',flip.ok&&Number(ss1?.vat_enabled)===0,'got='+ss1?.vat_enabled)

  // ── V3: NO-VAT shop forces GR vat_mode='none' main-side ──
  console.log('\n=== V3 NO-VAT GR forced none ===')
  const g1=await gr('GR-VAT-1','inclusive',7,10,10,'LN1')  // lineSum 100, asks inclusive
  const r1=(await api(page,'purchase.getReceipt','GR-VAT-1')).value||[]
  check('V3: GR ก่อนจด VAT → vat_mode=none, vat_amount=0',g1.ok&&r1[0]?.vat_mode==='none'&&near(r1[0]?.vat_amount,0),JSON.stringify({m:r1[0]?.vat_mode,a:r1[0]?.vat_amount}))

  // ── V4: NO-VAT sale snapshot total_vat=0 ──
  console.log('\n=== V4 NO-VAT sale ===')
  const b0=await api(page,'pos.saveBill',{sale_type:'retail',customer_id:null,customer_name_free:'',items:[{product_id:pid,item_name:'ยาแวตเทส',unit_name:'เม็ด',qty:1,qty_per_base:1,unit_price:107,discount:0,unit_vat:0,line_total:107}],subtotal:107,total_discount:0,total_vat:0,total_amount:107,cash_amount:107,card_amount:0,transfer_amount:0,change_amount:0,sold_by:owner.id})
  const s0=(await api(page,'reports.getSaleByInvoice',b0.value?.invoice_no)).value
  check('V4: บิลก่อนจด VAT เก็บ total_vat=0',b0.ok&&near(s0?.total_vat,0),'got='+s0?.total_vat)

  // ── V5: upgradeToVat validation ──
  console.log('\n=== V5 upgradeToVat validation ===')
  check('V5a: tax id ไม่ครบ 13 หลัก → reject',errHas(await api(page,'settings.upgradeToVat',{tax_id:'123',vat_rate:7,effective_date:today}),'13 หลัก'))
  check('V5b: rate 0 → reject',errHas(await api(page,'settings.upgradeToVat',{tax_id:'1234567890123',vat_rate:0,effective_date:today}),'อัตราภาษี'))
  check('V5c: ไม่มี effective date → reject',errHas(await api(page,'settings.upgradeToVat',{tax_id:'1234567890123',vat_rate:7,effective_date:''}),'วันที่จดทะเบียน'))

  // ── V6: upgrade (one-way, audited) ──
  console.log('\n=== V6 upgrade to VAT ===')
  const up=await api(page,'settings.upgradeToVat',{tax_id:'1234567890123',branch:'สำนักงานใหญ่',vat_rate:7,effective_date:today})
  const ss2=(await api(page,'settings.getSalesSettings')).value
  check('V6a: upgrade สำเร็จ → vat_enabled=1 rate=7',up.ok&&Number(ss2?.vat_enabled)===1&&Number(ss2?.vat_rate)===7,up.ok?JSON.stringify({e:ss2?.vat_enabled,r:ss2?.vat_rate}):up.error)
  check('V6b: hasVatHistory = true (audit log)',(await api(page,'settings.hasVatHistory')).value===true)
  check('V6c: upgrade ซ้ำ → reject',errHas(await api(page,'settings.upgradeToVat',{tax_id:'1234567890123',vat_rate:7,effective_date:today}),'อยู่แล้ว'))

  // ── V7: VAT sale snapshot → vatSummary output; voided excluded ──
  console.log('\n=== V7 VAT sales → output VAT ===')
  const mkVatBill=async()=>api(page,'pos.saveBill',{sale_type:'retail',customer_id:null,customer_name_free:'',items:[{product_id:pid,item_name:'ยาแวตเทส',unit_name:'เม็ด',qty:1,qty_per_base:1,unit_price:107,discount:0,unit_vat:7,line_total:107}],subtotal:107,total_discount:0,total_vat:7,total_amount:107,cash_amount:107,card_amount:0,transfer_amount:0,change_amount:0,sold_by:owner.id})
  const b1=await mkVatBill()
  check('V7a: บิล VAT เก็บ total_vat=7 (inclusive — ลูกค้าจ่ายเท่าเดิม)',b1.ok&&near(((await api(page,'reports.getSaleByInvoice',b1.value?.invoice_no)).value)?.total_vat,7))
  const b2=await mkVatBill()
  const s2=(await api(page,'reports.getSaleByInvoice',b2.value?.invoice_no)).value
  const vd=await api(page,'reports.voidSale',s2.id,'vat e2e void')
  const vs1=(await api(page,'reports.vatSummary',{date_from:today,date_to:today})).value
  check('V7b: void แล้ว → output VAT นับเฉพาะบิลที่เหลือ = 7 (1 บิล)',vd.ok&&near(vs1?.output?.vat_total,7)&&Number(vs1?.output?.bill_count)===1,JSON.stringify(vs1?.output))

  // ── V8: GR input VAT — inclusive extract + gross cost model + per-bill none ──
  console.log('\n=== V8 GR input VAT ===')
  const g2=await gr('GR-VAT-2','inclusive',7,107,2,'LV2')   // lineSum 214 → vat 14
  const r2=(await api(page,'purchase.getReceipt','GR-VAT-2')).value||[]
  check('V8a: GR inclusive → vat_amount = 214×7/107 = 14',g2.ok&&r2[0]?.vat_mode==='inclusive'&&near(r2[0]?.vat_amount,14),JSON.stringify({m:r2[0]?.vat_mode,a:r2[0]?.vat_amount}))
  const lots=(await api(page,'products.getLots',pid)).value||[]
  const lv2=lots.find(l=>l.lot_number==='LV2')
  check('V8b: cost model เก็บ GROSS (รวม VAT) = 107 ตามกฏ VAT-inclusive display',near(lv2?.cost_price,107),'got='+lv2?.cost_price)
  const g3=await gr('GR-VAT-3','none',0,10,1,'LV3')          // supplier ไม่จด VAT
  const r3=(await api(page,'purchase.getReceipt','GR-VAT-3')).value||[]
  check('V8c: ร้าน VAT แต่บิลนี้เลือก none ได้ (ผู้ขายไม่จด) → vat_amount=0',g3.ok&&r3[0]?.vat_mode==='none'&&near(r3[0]?.vat_amount,0))

  // ── V9: expense input VAT — claimable only with full tax invoice ──
  console.log('\n=== V9 expense input VAT ===')
  const cats=(await api(page,'expenses.listCategories')).value||[]
  const catId=cats[0]?.id; if(!catId)throw new Error('no expense category seeded')
  const e1=await api(page,'expenses.save',{expense_date:today,category_id:catId,amount:107,has_tax_invoice:true,vat_amount:7,note:'vat e2e'})
  check('V9a: expense + ใบกำกับเต็มรูป → บันทึก vat 7',e1.ok,e1.error)
  const e2=await api(page,'expenses.save',{expense_date:today,category_id:catId,amount:50,has_tax_invoice:false,vat_amount:99,note:'no invoice'})
  const elist=(await api(page,'expenses.list',{date_from:today,date_to:today,pageSize:0})).value
  const erows=Array.isArray(elist)?elist:(elist?.rows||[])
  const noInv=erows.find(r=>r.note==='no invoice')
  check('V9b: ไม่มีใบกำกับ → vat_amount ถูกบังคับเป็น 0',e2.ok&&near(noInv?.vat_amount,0),'got='+noInv?.vat_amount)
  check('V9c: vat >= amount → reject',errHas(await api(page,'expenses.save',{expense_date:today,category_id:catId,amount:10,has_tax_invoice:true,vat_amount:10}),'น้อยกว่า'))

  // ── V10: vatSummary composite (ภ.พ.30) ──
  console.log('\n=== V10 vatSummary net ===')
  const vs2=(await api(page,'reports.vatSummary',{date_from:today,date_to:today})).value
  check('V10a: input purchase_vat=14 expense_vat=7 รวม 21',near(vs2?.input?.purchase_vat,14)&&near(vs2?.input?.expense_vat,7)&&near(vs2?.input?.vat_total,21),JSON.stringify(vs2?.input))
  check('V10b: net_vat = 7 − 21 = −14 (ขอคืน)',near(vs2?.net_vat,-14),'got='+vs2?.net_vat)
  // staff must not read the VAT report (report.vat default off)
  const sw=await api(page,'auth.devSetRole','staff')
  if(sw.ok){
    check('V10c: staff → vatSummary FORBIDDEN',errHas(await api(page,'reports.vatSummary',{}),'FORBIDDEN'))
    await api(page,'auth.devSetRole','owner')
  } else { check('V10c: staff → vatSummary FORBIDDEN',false,'devSetRole unavailable: '+sw.error) }

  // ── V11: guarded downgrade ──
  console.log('\n=== V11 guarded downgrade ===')
  check('V11a: ไม่ใส่เหตุผล → reject',errHas(await api(page,'settings.downgradeFromVat',{password:ADMIN_PW,reason:''}),'เหตุผล'))
  check('V11b: รหัสผ่านผิด → reject',errHas(await api(page,'settings.downgradeFromVat',{password:'wrong-pw',reason:'e2e'}),'รหัสผ่านไม่ถูกต้อง'))
  const dg=await api(page,'settings.downgradeFromVat',{password:ADMIN_PW,reason:'ทดสอบเพิกถอน e2e'})
  const ss3=(await api(page,'settings.getSalesSettings')).value
  check('V11c: downgrade สำเร็จ → vat_enabled=0',dg.ok&&Number(ss3?.vat_enabled)===0,dg.ok?('got='+ss3?.vat_enabled):dg.error)
  check('V11d: hasVatHistory ยัง true (ประวัติต้องตรวจสอบได้)',(await api(page,'settings.hasVatHistory')).value===true)
  check('V11e: downgrade ซ้ำ → reject (ไม่ได้อยู่ในโหมด VAT)',errHas(await api(page,'settings.downgradeFromVat',{password:ADMIN_PW,reason:'ซ้ำ'}),'ไม่ได้อยู่ในโหมด'))
  const g4=await gr('GR-VAT-4','inclusive',7,10,1,'LV4')
  const r4=(await api(page,'purchase.getReceipt','GR-VAT-4')).value||[]
  check('V11f: GR หลัง downgrade → forced none อีกครั้ง',g4.ok&&r4[0]?.vat_mode==='none')
  const vs3=(await api(page,'reports.vatSummary',{date_from:today,date_to:today})).value
  check('V11g: บิล/GR VAT เก่า snapshot ไม่ถูกแตะ (output ยัง 7, purchase_vat ยัง 14)',near(vs3?.output?.vat_total,7)&&near(vs3?.input?.purchase_vat,14),JSON.stringify({o:vs3?.output?.vat_total,p:vs3?.input?.purchase_vat}))

  // ── V12: Reports tab "ภาษี (VAT)" still visible after downgrade (hasVatHistory) ──
  console.log('\n=== V12 ภาษี tab visible via hasVatHistory ===')
  await page.evaluate(()=>{window.location.hash='#/reports'})
  await page.waitForTimeout(1500)
  const vatTab=await page.locator('text=ภาษี (VAT)').count()
  check('V12: แท็บ "ภาษี (VAT)" ยังแสดงหลัง downgrade',vatTab>0,'count='+vatTab)

  check('BINARY: better-sqlite3 native binary intact',fsSync.existsSync(pathMod.join(projectRoot,'node_modules','better-sqlite3','build','Release','better_sqlite3.node')))
}catch(e){
  console.log('  FATAL',e&&e.message||e);failed++
}finally{
  console.log(`\n=== ${passed} passed, ${failed} failed ===`)
  await app.close().catch(()=>{})
  try{fsSync.rmSync(userDataDir,{recursive:true,force:true})}catch{}
  process.exit(failed>0?1:0)
}
