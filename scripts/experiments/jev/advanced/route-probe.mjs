import {launch,session,observe,save,sleep} from './common.mjs';
const browser=await launch(),results=[];
for(const target of ['todos','slow','workspace']){
 const {page,context,errors,requests}=await session(browser,'/');const outstanding=new Set();page.on('request',r=>outstanding.add(r.url()));page.on('requestfinished',r=>outstanding.delete(r.url()));page.on('requestfailed',r=>outstanding.delete(r.url()));
 await page.getByTestId(`nav-${target}`).click();
 let reached=true;try{await page.locator(`[data-page="${target}"]`).waitFor({timeout:15000})}catch{reached=false}
 const result={target,reached,state:await observe(page),errors,outstanding:[...outstanding],documentRequests:requests.filter(r=>r.type==='document').length};results.push(result);console.log(JSON.stringify(result));await context.close();
}
const {page,context,errors}=await session(browser,'/workspace');await page.getByTestId('outer-trigger').click();await sleep(1000);
const before=await page.getByTestId('background').textContent();let backgroundClick='succeeded';try{await page.getByTestId('background').click({timeout:1000})}catch{backgroundClick='blocked'}await sleep(300);
const overlay={state:await observe(page),before,after:await page.getByTestId('background').textContent(),backgroundClick,outer:await page.getByTestId('outer-backdrop').evaluate(e=>e.outerHTML.slice(0,700)),errors};console.log(JSON.stringify(overlay));save('route-probe',{results,overlay});await context.close();await browser.close();
