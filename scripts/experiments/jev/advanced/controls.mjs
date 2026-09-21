import { launch,session,observe,save,sleep,url } from './common.mjs';
const browser=await launch(),results=[];
for(const target of ['plain','todos','workspace']){
 const {page,context,errors,requests}=await session(browser,'/');await page.getByTestId('nav-todos').click();await sleep(1000);
 const moduleUrl=requests.find(r=>r.url.includes('virtual:markless-router/navigation-entry')).url;
 await page.evaluate(async ({moduleUrl,href})=>(await import(moduleUrl)).navigateMarklessRouterLink({href}),{moduleUrl,href:`/${target}`});
 let reached=true;try{await page.locator(`[data-page="${target}"]`).waitFor({timeout:5000})}catch{reached=false}
 results.push({target,reached,state:await observe(page),errors});await context.close();
}
const page=await browser.newPage();await page.goto(new URL('/modal-control',url).href);await page.getByTestId('outer-trigger').click();await sleep(600);const modal=await page.evaluate(()=>({inert:Boolean(document.querySelector('[data-testid="background"]').closest('[inert]')),open:!document.querySelector('[data-testid="outer-backdrop"]').hidden}));
console.log(JSON.stringify({results,modal}));save('controls',{results,modal});await browser.close();
