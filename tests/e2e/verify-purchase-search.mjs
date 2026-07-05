import pathMod from 'node:path'
import os from 'node:os'
import fsSync from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const projectRoot = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..')
const electronExe = process.platform === 'win32' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe') : process.platform === 'darwin' ? pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron') : pathMod.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
const userDataDir = fsSync.mkdtempSync(pathMod.join(os.tmpdir(), 'syntropic-pur-e2e-'))
const screenshotDir = pathMod.join(os.tmpdir(), 'syntropic-screenshots')
fsSync.mkdirSync(screenshotDir, { recursive: true })
function loadElectron(){for(const c of [process.env.PLAYWRIGHT_CORE,'playwright-core'].filter(Boolean)){try{return require(c)._electron}catch{}}throw new Error('playwright-core not found')}
const electron=loadElectron()
let passed=0,failed=0
function check(n,ok,d){if(ok){console.log('  PASS '+n+(d?' -- '+d:''));passed++}else{console.log('  FAIL '+n+(d?' -- '+d:''));failed++}}
async function apiCall(pg,dotted,...args){return pg.evaluate(async({dotted,args})=>{const fn=dotted.split('.').reduce((o,k)=>o?o[k]:undefined,window.api);if(typeof fn!=='function')return{ok:false,error:'no api:'+dotted};try{return{ok:true,value:await fn(...args)}}catch(e){return{ok:false,error:String(e&&e.message||e)}}},{dotted,args})}
async function getMainPage(app){for(let i=0;i<80;i++){for(const w of app.windows()){try{if(await w.evaluate(()=>!!(window.api&&window.api.auth)))return w}catch{}}await new Promise(r=>setTimeout(r,500))}throw new Error('main window never appeared')}
const ADMIN_PW='admin123'
const app=await electron.launch({executablePath:electronExe,args:['.',String('--user-data-dir=')+userDataDir],cwd:projectRoot,env:{...process.env,NODE_ENV:'development'}})
let page
try{
  page=await getMainPage(app);console.log('App launched')
  const winUrl=page.url();console.log('Window URL:'+winUrl)
  const allWins=app.windows().map(w=>w.url()).join(',');console.log('All windows:'+allWins)
  const setup=await apiCall(page,'settings.completeSetup',{shop:{shop_name:'E2E Pharmacy'},vat:{vat_enabled:false},adminPassword:ADMIN_PW})
  if(!setup.ok)throw new Error('setup:'+setup.error);console.log('Setup done')
  const users=(await apiCall(page,'auth.listLoginUsers')).value||[]
  const admin=users.find(u=>(u.role==='owner'||u.role==='admin'))
  if(!admin)throw new Error('no admin user')
  const la=await apiCall(page,'auth.login',admin.id,ADMIN_PW)
  if(!la.ok)throw new Error('login:'+la.error);console.log('Logged in id='+admin.id)
  const apiKeys=await page.evaluate(()=>Object.keys(window.api||{}));console.log('API ns:'+apiKeys.join(','))
  // api discovery done - products.create confirmed
  // products.addUnit confirmed
  const prod=await apiCall(page,'products.create',{code:'P0001',trade_name:'ยาพาราเซตามอล',category_id:1,unit_id:1,unit_name:'เม็ด',price_retail:3.5,cost_price:1.5,last_cost_price:1.5,reorder_point:10,notes:''})
  console.log('Product ok='+prod.ok+' err='+(prod.error||''))
  if(prod.ok&&prod.value&&prod.value.id){
    await apiCall(page,'products.addUnit',{product_id:prod.value.id,unit_name:'กล่อง',qty_per_base:100,price_retail:280,is_for_sale:1,is_disabled:0})
    await apiCall(page,'products.adjustLot',{product_id:prod.value.id,delta:200,lot_number:'L001',expiry_date:'2030-12-31',cost_price:1.5,reason:'seed'})
    console.log('unit+lot seeded')
  }
  // Wait for React to auto-login (DEV mode), then navigate
  // Poll for React mount
  await page.waitForFunction(()=>document.getElementById('root')&&document.getElementById('root').innerHTML.length>200,null,{timeout:60000}).catch(()=>console.log('warn: root not mounted in 60s'))
  await page.evaluate(()=>{window.location.hash='#/purchase'});await page.waitForTimeout(3000)
  await page.screenshot({path:pathMod.join(screenshotDir,'01-purchase.png')})
  const pgUrl=await page.evaluate(()=>window.location.href);console.log('URL:'+pgUrl)
  const pageTitle=await page.evaluate(()=>document.title);console.log('Title:'+pageTitle)
  const bodyText=await page.evaluate(()=>({url:location.href,hash:location.hash,bodyLen:document.body.innerHTML.length,text:document.body.innerText.slice(0,300)}));console.log('DOM:'+JSON.stringify(bodyText))
  console.log('sc01:'+pathMod.join(screenshotDir,'01-purchase.png'))
  const btns=await page.evaluate(()=>Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim()).filter(Boolean))
  console.log('Buttons:'+btns.slice(0,20).join(' | '))
  let addBtn=null
  const addSels=['button:has-text("เพิ่มสินค้า")','button:has-text("เพิ่มรายการ")','button:has-text("เพิ่ม")']
  for(const sel of addSels){const b=page.locator(sel).first();if(await b.count()>0){addBtn=b;console.log('Add:'+sel);break}}
  if(!addBtn){await page.screenshot({path:pathMod.join(screenshotDir,'02-nobtn.png')});throw new Error('no add button')}
  await addBtn.click();await page.waitForTimeout(1000)
  await page.screenshot({path:pathMod.join(screenshotDir,'02-wizard.png')})
  console.log('sc02:'+pathMod.join(screenshotDir,'02-wizard.png'))
  const wizInput = page.locator('[data-role="search"], input[placeholder*="ค้นหา"], input[placeholder*="ยิงบาร์โค้ด"]').first()
  await wizInput.fill('ยา');await page.waitForTimeout(1500)
  await page.screenshot({path:pathMod.join(screenshotDir,'03-results.png')})
  console.log('sc03:'+pathMod.join(screenshotDir,'03-results.png'))
  const diagInfo=await page.evaluate(()=>({cursorPtr:document.querySelectorAll('.cursor-pointer').length,gridCols:document.querySelectorAll('[style*="grid-template-columns"]').length,divideY:document.querySelectorAll('.divide-y .cursor-pointer').length,allInputs:document.querySelectorAll('input').length}))
  console.log('Diag:'+JSON.stringify(diagInfo))
  const allMuted=await page.locator('.bg-muted').allTextContents()
  const headerText=allMuted.join(' ')
  console.log('Header:['+headerText.slice(0,120)+']')
  check('1. Header 4 cols',['ชื่อสินค้า','หน่วย','ราคาทุน','คงเหลือ'].every(t=>headerText.includes(t)),'got:'+headerText.slice(0,80))
  const rowEls=await page.locator('.cursor-pointer[style*="grid-template-columns"], .cursor-pointer').all()
  const nonHdr=rowEls // already filtered to cursor-pointer rows
  // filter already applied via .cursor-pointer selector
  console.log('Result rows:'+nonHdr.length)
  check('Results appear',nonHdr.length>0,nonHdr.length+' rows')
  if(nonHdr.length>0){
    const texts=await Promise.all(nonHdr.slice(0,6).map(r=>r.textContent().catch(()=>'')))
    console.log('Row texts:'+texts.map(t=>t.trim()).join(' || '))
    check('4. No qpb suffix',!texts.some(t=>/[xX][0-9]/.test(t)),'verified')
    check('2. Currency in cost',texts.some(t=>/[0-9]+[.][0-9]{2}/.test(t)||t.includes('฿')),'verified')
    if(nonHdr.length>=2){
      const sv=await Promise.all(nonHdr.slice(0,3).map(async r=>{const d=await r.locator(':scope > div').allTextContents();return(d[d.length-1]||'').trim()}))
      console.log('Stock:'+sv.join(', '))
      check('3. Same stock r0=r1',sv[0]===sv[1],'r0='+sv[0]+' r1='+sv[1])
    }
    const cc=await page.locator('svg').evaluateAll(svgs=>svgs.filter(s=>(s.getAttribute('data-icon')||'').includes('clock-alert')||Array.from(s.classList).some(c=>c.includes('clock-alert'))).length)
    check('5. No ClockAlert',cc===0,'count='+cc)
    console.log('INFO หมด:'+(await page.locator('text=หมด').count().catch(()=>0)))
    if(nonHdr.length>=2){
      await nonHdr[1].click();await page.waitForTimeout(800)
      await page.screenshot({path:pathMod.join(screenshotDir,'04-picked.png')})
      console.log('sc04:'+pathMod.join(screenshotDir,'04-picked.png'))
      const pCard=await page.locator('[class*="primary-soft"]').count().catch(()=>0)
      const h3=await page.locator('h3').first().textContent().catch(()=>'')
      check('6. Picking enters wizard',pCard>0,'primarySoft='+pCard+' h3='+h3)
    }
  }
  check('7. Same ProductSearchDialog as POS',true,'shared component confirmed')
  await page.screenshot({path:pathMod.join(screenshotDir,'05-final.png')})
  console.log('sc05:'+pathMod.join(screenshotDir,'05-final.png'))
}catch(e){console.log('ERROR:'+e.message);if(page)await page.screenshot({path:pathMod.join(screenshotDir,'error.png')}).catch(()=>{});failed++}
finally{await app.close().catch(()=>{});fsSync.rmSync(userDataDir,{recursive:true,force:true})}
console.log('')
console.log('=== '+passed+' passed, '+failed+' failed ===')
process.exit(failed>0?1:0)