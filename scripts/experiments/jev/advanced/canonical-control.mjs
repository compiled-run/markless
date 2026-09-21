import {launch,observe,save,sleep,url} from './common.mjs';
import {resolve} from 'node:path';
const browser=await launch(),rows=[];
for(let repeat=0;repeat<3;repeat++)for(const mode of ['routed_ssr','direct_csr']){
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL(mode==='routed_ssr'?'/todos':'/plain',url).href);
 if(mode==='direct_csr')await page.evaluate(async({core,app})=>{
  const {render}=await import(core),{App}=await import(app);
  document.body.replaceChildren();const target=document.createElement('div');document.body.appendChild(target);
  await render(App,{target});
 },{core:`/@fs${resolve('packages/core/src/index.ts')}`,app:`/@fs${resolve('scripts/experiments/jev/advanced/app/components/todos.tsrx')}`});
 await page.locator('.new-todo').fill('One');await page.locator('.new-todo').press('Enter');await page.locator('.todo-list li').waitFor();
 await page.locator('.todo-list .toggle').click();await sleep(1500);
 const individual=(await observe(page)).todos,nativeChecked=await page.locator('.todo-list .toggle').isChecked();
 await page.locator('.todo-list label').dblclick();await sleep(1500);
 rows.push({repeat,mode,individual,nativeChecked,afterEdit:(await observe(page)).todos,errors});
 save('canonical-control',{rows});console.log(JSON.stringify(rows.at(-1)));await context.close();
}
await browser.close();
