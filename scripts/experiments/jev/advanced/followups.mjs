import {launch,session,observe,save,sleep,read,url} from './common.mjs';
import {resolve} from 'node:path';
const browser=await launch();const rows=[],modals=[];
for(let repeat=0;repeat<3;repeat++){
 for(const mode of ['routed_ssr','direct_ssr','direct_csr']){
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(mode==='direct_ssr')await page.goto(read('todo-control-server').url);
  else if(mode==='routed_ssr')await page.goto(new URL('/todos',url).href);
  else{
   await page.goto(new URL('/plain',url).href);
   await page.evaluate(async({core,app})=>{
    const {render}=await import(core);
    const {App}=await import(app);
    document.body.replaceChildren();const target=document.createElement('div');document.body.appendChild(target);await Promise.race([render(App,{target}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Direct CSR control did not mount within 10 seconds')),10000))]);
   },{core:`/@fs${resolve('packages/core/src/index.ts')}`,app:`/@fs${resolve('demos/todomvc/fixture/app.tsrx')}`});
  }
  await page.locator('.new-todo').fill('One');await page.locator('.new-todo').press('Enter');await page.locator('.todo-list li').waitFor();
  await page.locator('.todo-list .toggle').click();await sleep(1500);const individual=await observe(page);const checked=await page.locator('.todo-list .toggle').isChecked();
  await page.locator('.toggle-all').click();await sleep(300);const all=await observe(page);
  rows.push({repeat,mode,individual:individual.todos,nativeChecked:checked,all:all.todos,errors});save('followups',{rows,modals});console.log(JSON.stringify(rows.at(-1)));await context.close();
 }
 for(const mode of ['routed_composition','routed_flat','direct_nested']){
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(mode==='direct_nested'?read('modal-control-server').url:new URL(mode==='routed_flat'?'/modal-control':'/workspace',url).href);
  await page.getByTestId('outer-trigger').click();let opened=true;try{await page.waitForFunction(()=>document.querySelector('[data-testid="outer-backdrop"]').hidden===false,null,{timeout:5000})}catch{opened=false}
  await sleep(1000);const before=await page.evaluate(()=>({inert:Boolean(document.querySelector('[data-testid="background"]').closest('[inert]')),text:document.querySelector('[data-testid="background"]').textContent,focus:document.activeElement?.getAttribute('data-testid')}));
  let click='accepted';try{await page.getByTestId('background').click({timeout:700})}catch{click='blocked'}await sleep(100);
  const after=await page.getByTestId('background').textContent();await page.getByTestId('outer-content').click({position:{x:2,y:2}}).catch(()=>{});await page.keyboard.press('Escape');await sleep(1000);
  const closed=await page.getByTestId('outer-backdrop').evaluate(e=>e.hidden);modals.push({repeat,mode,opened,before,backgroundClick:click,after,escapeClosed:closed,errors});save('followups',{rows,modals});console.log(JSON.stringify(modals.at(-1)));await context.close();
 }
}
await browser.close();
