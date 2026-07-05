// Real-Electron e2e — Dashboard rebuild Phase A
import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = process.platform === 'win32' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe') : process.platform === 'darwin' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron') : pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-dash-e2e-'))
const shotDir = pathMod.join(projectRoot, 'tests', 'e2e', '_shots')
fsSync.mkdirSync(shotDir, { recursive: true })
function loadElectron(){for(const c of [process.env.PLAYWRIGHT_CORE,'playwright-core'].filter(Boolean)){try{return require(c)._electron}catch{}}throw new Error('playwright-core not found')}
const electron = loadElectron()
let passed=0, failed=0
function check(n, ok, d) {
  if(ok){ console.log('  PASS '+n+(d?' -- '+d:'')); passed++ }
  else  { console.log('  FAIL '+n+(d?' -- '+d:'')); failed++ }
}
async function apiCall(pg, dotted, ...args) {
  return pg.evaluate(async({dotted,args})=>{
    const fn=dotted.split('.').reduce((o,k)=>o?o[k]:undefined,window.api)
    if(typeof fn!=='function') return{ok:false,error:'no api:'+dotted}
    try{return{ok:true,value:await fn(...args)}}catch(e){return{ok:false,error:String(e&&e.message||e)}}
  },{dotted,args})
}
async function getMainPage(app) {
  for(let i=0;i<80;i++){
    for(const w of app.windows()){try{if(await w.evaluate(()=>!!(window.api&&window.api.auth)))return w}catch{}}
    await new Promise(r=>setTimeout(r,500))
  }
  throw new Error('main window never appeared')
}
function localToday() {
  const d=new Date(); const p=n=>String(n).padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}
function plusDays(n) {
  const d=new Date(); d.setDate(d.getDate()+n)
  const p=x=>String(x).padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}

const ADMIN_PW = 'admin123'
const app = await electron.launch({
  executablePath: electronExe,
  args: ['.', '--user-data-dir='+userDataDir],
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: 'development' }
})
let page
const consoleErrors = []
try {
  page = await getMainPage(app)
  await app.evaluate(({BrowserWindow})=>{
    const w=BrowserWindow.getAllWindows()[0]
    if(w){ w.setMinimumSize(1440,800); w.setBounds({width:1440,height:900}) }
  }).catch(()=>{})

  // ── Setup + login ──
  const setup = await apiCall(page, 'settings.completeSetup', {
    shop:{shop_name:'E2E Dash'}, vat:{vat_enabled:false}, adminPassword:ADMIN_PW
  })
  if(!setup.ok) throw new Error('setup:'+setup.error)
  const users = (await apiCall(page,'auth.listLoginUsers')).value||[]
  const admin = users[0]; if(!admin) throw new Error('no login user')
  const la = await apiCall(page,'auth.login',admin.id,ADMIN_PW)
  if(!la.ok) throw new Error('login:'+la.error)
  console.log('  Logged in as', admin.role)

  // ── Seed: product + GR (creates stock, gives purchase data) ──
  const today = localToday()
  const prodR = await apiCall(page,'products.create',{
    trade_name:'ยาทดสอบ Dashboard E2E',category_id:1,unit_id:1,unit_name:'เม็ด',
    price_retail:20,cost_price:10,last_cost_price:10,reorder_point:5,notes:''
  })
  if(!prodR.ok||!prodR.value?.id) throw new Error('create product:'+prodR.error)
  const pid = prodR.value.id
  const sup = (await apiCall(page,'suppliers.list')).value||[]
  const supplierId = sup[0]?.id||1
  const grNo = (await apiCall(page,'purchase.nextGRNumber')).value||'GR-1'
  const gr = await apiCall(page,'purchase.save',{
    invoice_no:grNo,supplier_id:supplierId,supplier_invoice_no:'INV-DASH',
    receive_date:today,payment_type:'cash',is_paid:true,
    vat_mode:'none',vat_rate:0,userId:admin.id,
    items:[{product_id:pid,lot_number:'LD01',expiry_date:plusDays(20),cost_price:10,sell_price:20,qty:50}]
  })
  if(!gr.ok) throw new Error('gr:'+gr.error)
  console.log('  Seeded GR ok, product id='+pid)

  // ── Navigate to Dashboard ──
  page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()) })
  page.on('pageerror', e=>consoleErrors.push('pageerror:'+e.message))

  await page.evaluate(()=>{ window.location.hash='#/reports' })
  await page.reload()

  // Wait for any dashboard text to appear
  await page.locator('text=ยอดขาย').first().waitFor({state:'visible',timeout:45000})
  await page.waitForTimeout(3000) // let all 12 parallel fetches settle

  await page.screenshot({path:pathMod.join(shotDir,'dashboard-full.png'),fullPage:true})
  console.log('  Screenshot: dashboard-full.png')

  // ── CHECK 1: No blank screen ──
  const bodyText = await page.locator('body').innerText()
  check('1: ไม่มี blank screen', bodyText.length > 100, 'bodyLen='+bodyText.length)

  // ── CHECK 2: MetricStrip 6 cells ──
  const stripEl = page.locator('[data-slot="metric-strip"]')
  check('2a: MetricStrip element อยู่ใน DOM', await stripEl.count() > 0)
  const labels6 = ['ยอดขาย','ต้นทุน','กำไร','ยอดซื้อ','ค้างชำระ','ค่าใช้จ่าย']
  for (const l of labels6) {
    check('2b: MetricStrip label "'+l+'"', await page.locator('text='+l).count() > 0)
  }
  if (await stripEl.count() > 0) {
    // count child metric cells — each has data-slot="metric-cell" or similar
    const stripText = await stripEl.first().innerText().catch(()=>'')
    // กำไร % note should be present (check 6 in spec: shows margin even with no delta)
    const hasMarginNote = stripText.includes('%') || await page.locator('text=/กำไร.*%/').count() > 0
    check('2c / check-6: KPI "กำไร" cell แสดง margin % note', hasMarginNote, 'stripText snippet='+stripText.substring(0,120))
  }

  // ── CHECK 3: Diverging chart ──
  const chartWrapper = page.locator('.recharts-wrapper')
  check('3a: Diverging chart svg อยู่ใน DOM', await chartWrapper.count() > 0)
  const refLine = page.locator('.recharts-reference-line')
  check('3b: Zero reference line y=0 มีอยู่', await refLine.count() > 0)
  check('3c: Chart card title "แนวโน้มรวม"', await page.locator('text=แนวโน้มรวม').count() > 0)
  // mode tabs
  for (const t of ['รวม','ขาย','ซื้อ','กำไร']) {
    const tabCount = await page.locator('[role="tab"]:has-text("'+t+'")').count() +
                     await page.locator('button:has-text("'+t+'")').count()
    check('3d: chart tab "'+t+'"', tabCount > 0)
  }
  // legend items
  check('3e: legend "ยอดขาย"', await page.locator('text=ยอดขาย').count() > 0)
  check('3e: legend "ยอดซื้อ (พุ่งลง)"', await page.locator('text=ยอดซื้อ').count() > 0)

  // ── CHECK 4: All section blocks ──
  for (const s of ['สินค้าขายดี','กำไรสูงสุด','ผู้จัดจำหน่าย','พนักงานขาย','ค่าใช้จ่ายอื่นๆ','การขาย']) {
    check('4: section "'+s+'"', await page.locator('text='+s).count() > 0)
  }

  // ── CHECK 5: Alert tiles + table swap ──
  check('5a: card "แจ้งเตือน"', await page.locator('text=แจ้งเตือน').count() > 0)
  const tileTests = [
    { text: 'สต็อกติดลบ',       head: 'คงเหลือ' },
    { text: 'ต่ำกว่าจุดสั่งซื้อ', head: 'จุดสั่งซื้อ' },
    { text: 'ใกล้หมดอายุ',      head: 'วันหมดอายุ' },
    { text: 'ค้างเกิน',          head: 'เคลื่อนไหวล่าสุด' },
  ]
  for (const tile of tileTests) {
    // find button that contains the tile text
    const tileBtn = page.locator('button').filter({ hasText: tile.text }).first()
    const found = await tileBtn.count() > 0
    check('5b: alert tile "'+tile.text+'"', found)
    if (found) {
      await tileBtn.click()
      await page.waitForTimeout(900)
      const headVisible = await page.locator('th:has-text("'+tile.head+'")').count() > 0
      check('5c: คลิก "'+tile.text+'" → th "'+tile.head+'" ปรากฏ', headVisible)
    }
  }
  await page.screenshot({path:pathMod.join(shotDir,'dashboard-alerts.png'),fullPage:false})

  // ── CHECK 6: Pagination buttons ──
  // Scope to the alert-table footer buttons (h-9 w-9 elevated) — the period
  // picker's prev/next arrows share the same title but are size-8 ghost.
  const prevPag = page.locator('button[title="ก่อนหน้า"][class*="w-9"]')
  const nextPag = page.locator('button[title="ถัดไป"][class*="w-9"]')
  check('6a: ปุ่ม pagination "ก่อนหน้า"', await prevPag.count() > 0)
  check('6b: ปุ่ม pagination "ถัดไป"', await nextPag.count() > 0)
  if (await prevPag.count() > 0) {
    check('6c: ปุ่ม "ก่อนหน้า" disabled ที่หน้า 1', await prevPag.first().isDisabled().catch(()=>false))
  }

  // ── CHECK 7: "เปิดตารางเต็ม" nav ──
  const fullBtn = page.locator('button:has-text("เปิดตารางเต็ม")').first()
  check('7a: ปุ่ม "เปิดตารางเต็ม" อยู่', await fullBtn.count() > 0)
  if (await fullBtn.count() > 0) {
    await fullBtn.click()
    await page.waitForTimeout(1200)
    const hash = await page.evaluate(()=>window.location.hash)
    check('7b: navigate → /manage/* route', hash.startsWith('#/manage/'), 'hash='+hash)
    // back
    await page.evaluate(()=>{ window.location.hash='#/reports' })
    await page.waitForTimeout(2000)
  }

  // ── CHECK 8: MultiDatePicker reactivity ──
  // The "ก่อนหน้า" button title is used by both date-stepper in toolbar AND pagination
  // Try to find it in the toolbar area specifically. Toolbar is inside the page header.
  const allPrev = page.locator('button[title="ก่อนหน้า"]')
  const prevCount = await allPrev.count()
  if (prevCount > 0) {
    const stripBefore = await page.locator('[data-slot="metric-strip"]').first().innerText()
    // Click first prev button (may be in toolbar date picker)
    await allPrev.first().click()
    await page.waitForTimeout(2500)
    const stripAfter = await page.locator('[data-slot="metric-strip"]').first().innerText()
    check('8: เปลี่ยน period → MetricStrip ตัวเลขเปลี่ยน', stripBefore !== stripAfter,
      'before_snap='+stripBefore.substring(0,80)+'\nafter_snap='+stripAfter.substring(0,80))
  } else {
    check('8: มีปุ่ม prev ใน toolbar', false, 'ไม่พบปุ่ม ก่อนหน้า ใดเลย')
  }

  // ── CHECK 9: No fatal console errors ──
  const fatal = consoleErrors.filter(e =>
    !e.includes('Autofill') && !e.includes('postcss') &&
    !e.includes('favicon') && !e.includes('DevTools') &&
    !e.includes('[vite]')
  )
  check('9: ไม่มี console error', fatal.length === 0, fatal.length ? fatal.slice(0,3).join(' | ') : '')

  await page.screenshot({path:pathMod.join(shotDir,'dashboard-final.png'),fullPage:true})
  console.log('  Screenshot: dashboard-final.png')

} catch(e) {
  console.error('FATAL:', e.message, e.stack?.split('\n').slice(1,4).join(' '))
  if(page) await page.screenshot({path:pathMod.join(shotDir,'dashboard-crash.png'),fullPage:false}).catch(()=>{})
  failed++
} finally {
  await app.close().catch(()=>{})
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`TOTAL  PASS=${passed}  FAIL=${failed}`)
  process.exit(failed > 0 ? 1 : 0)
}
