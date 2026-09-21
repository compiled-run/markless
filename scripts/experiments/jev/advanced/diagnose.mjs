import {launch,session,observe,save,sleep} from './common.mjs';
const browser=await launch();const {page,context,errors,requests}=await session(browser,'/');
const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
const responses=[];page.on('response',r=>{if(r.status()>=400)responses.push({url:r.url(),status:r.status()})});
console.log('link',await page.getByTestId('nav-workspace').evaluate(e=>e.outerHTML));
await page.getByTestId('count').click();await sleep(200);
await page.getByTestId('nav-workspace').click();await sleep(3000);
const result={state:await observe(page),errors,consoleErrors,responses,requests,body:(await page.locator('body').textContent()).slice(-3000)};save('diagnose',result);console.log(JSON.stringify({state:result.state,errors,consoleErrors,responses,body:result.body}));
await context.close();await browser.close();
