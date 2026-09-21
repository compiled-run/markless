import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createJev,choice} from '../client.mjs';
const {url}=JSON.parse(readFileSync('/tmp/jev-advanced/production-server.json'));
import {patterns} from './production-patterns.mjs';
const single=process.argv.find(a=>a.startsWith('--coverage-pattern='))?.split('=')[1];
if(single&&!Object.hasOwn(patterns,single))throw new Error('Unknown production schedule');
const browser=await chromium.launch({headless:true}),results=[];
const replay=process.argv.includes('--replay');
const heldFollowup=process.argv.includes('--held-followup')||single==='held_back';
const pendingAssets=heldFollowup?readdirSync('/tmp/jev-advanced/production/public/build').filter(name=>name.endsWith('.js')&&readFileSync(`/tmp/jev-advanced/production/public/build/${name}`,'utf8').includes('Report loading')):[];
if(heldFollowup&&pendingAssets.length!==1)throw new Error('Expected one compiled pending-page render-data asset');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const observe=page=>page.evaluate(()=>({page:document.querySelector('main')?.getAttribute('data-page'),path:location.pathname,count:Number(document.querySelector('[data-testid="count"]')?.textContent),pending:Boolean(document.querySelector('[data-testid="report-pending"]')),ready:Boolean(document.querySelector('[data-testid="report-ready"]')),sameDocument:window.productionExperiment==='original'}));
async function run(pattern,policy){
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(7000);const errors=[],events=[],checks=[],held=[];let failure=null,conditionAchieved=false,gating=false,release=()=>{},gateSeen;
 const gated=new Promise(resolve=>{release=resolve}),firstGate=new Promise(resolve=>{gateSeen=resolve});let documents=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.resourceType()==='document')documents++});
 await context.route('**/*',async route=>{if(gating&&route.request().resourceType()==='script'&&(!heldFollowup||pendingAssets.some(name=>new URL(route.request().url()).pathname.endsWith(`/${name}`)))){held.push(route.request().url());gateSeen();await gated;}await route.continue();});
 const assert=(yes,name)=>checks.push({name,pass:Boolean(yes)});
 const isPage=name=>page.locator(`[data-page="${name}"]`).waitFor();
 const count=n=>page.waitForFunction(n=>document.querySelector('[data-testid="count"]').textContent===String(n),n);
 const start=performance.now();
 try{
  const cold=pattern.startsWith('cold_');gating=cold||heldFollowup;
  await page.goto(new URL(pattern==='ssr_pending_leave'?'/pending':'/',url).href,{waitUntil:'commit'});await page.locator('main').waitFor();await page.evaluate(()=>window.productionExperiment='original');events.push({phase:'initial',state:await observe(page)});
  if(cold){
   await page.getByTestId('count').click();if(pattern==='cold_pair')await page.getByTestId('count').click();else await page.getByTestId('nav-destination').click();
   await Promise.race([firstGate,wait(2000)]);await wait(150);const before=await observe(page);events.push({phase:'held',state:before});conditionAchieved=held.length>0&&before.count===0;
   gating=false;release();
   if(pattern==='cold_pair'){await count(2);assert((await observe(page)).count===2,'two_exact_effects_after_release');}
   else {await isPage('destination');await wait(300);assert((await observe(page)).count===0,'no_old_counter_effect_on_destination');await page.getByTestId('count').click();await count(1);}
  }else if(pattern==='ssr_pending_leave'||pattern==='spa_pending_leave'){
   if(pattern==='spa_pending_leave'){await page.getByTestId('nav-pending').click();await isPage('pending');}
   const pending=await observe(page);events.push({phase:'pending',state:pending});conditionAchieved=pending.pending&&!pending.ready;
   await page.getByTestId('count').click();await page.getByTestId('nav-destination').click();await isPage('destination');await wait(2400);
   const after=await observe(page);assert(after.page==='destination'&&!after.ready,'late_result_does_not_overwrite_destination');assert(after.count===0,'destination_has_fresh_state');await page.getByTestId('count').click();await count(1);
  }else if(pattern==='held_back'){
   await page.getByTestId('nav-destination').click();await isPage('destination');gating=true;
   await page.getByTestId('nav-pending').click();await Promise.race([firstGate,wait(2000)]);conditionAchieved=held.length>0;events.push({phase:'held',state:await observe(page)});
   await page.goBack();gating=false;release();await isPage('destination');await wait(2400);const after=await observe(page);assert(after.page==='destination'&&!after.ready,'abandoned_destination_does_not_commit');assert(after.count===0,'back_has_fresh_route_state');
  }else{
   await page.getByTestId('count').click();await count(1);await page.getByTestId('nav-pending').click();await isPage('pending');await page.getByTestId('report-ready').waitFor();await page.getByTestId('count').click();await count(1);
   await page.goBack();await isPage('home');assert((await observe(page)).count===0,'back_recreates_route_state');await page.goForward();await isPage('pending');await page.getByTestId('report-ready').waitFor();assert((await observe(page)).count===0,'forward_recreates_route_state');conditionAchieved=true;
  }
  const final=await observe(page);events.push({phase:'final',state:final});assert(final.sameDocument,'same_document');
 }catch(error){failure=error.message;await page.waitForLoadState('domcontentloaded',{timeout:1000}).catch(()=>{});try{events.push({phase:'failure',state:await observe(page)})}catch{}}
 finally{gating=false;release();}
 const result={pattern,policy,conditionAchieved,checks,errors,failure,held,events,documents,milliseconds:performance.now()-start};results.push(result);writeFileSync(single?'/tmp/jev-coverage/production-single.json':`/tmp/jev-advanced/${heldFollowup?'production-held-followup':`production-navigation${replay?'-replay':''}`}.json`,JSON.stringify({results},null,2));console.log(JSON.stringify({pattern,policy,conditionAchieved,checks,errors,failure}));await context.close();
}
if(single)await run(single,'coverage');
else if(heldFollowup){for(let i=0;i<3;i++)await run('held_back','followup');}
else if(replay){for(const r of JSON.parse(readFileSync('/tmp/jev-advanced/production-navigation.json')).results)await run(r.pattern,r.policy);}
else{
 for(const pattern of Object.keys(patterns))await run(pattern,'enumerated');
 const api=createJev();for(let i=0;i<6;i++){const response=await api.ask({state:{previous:results.filter(r=>r.policy==='jev').map(({pattern,checks,conditionAchieved,failure})=>({pattern,checks,conditionAchieved,failure}))},questions:{action:choice('Choose the next production browser schedule to expose loss or duplication of user effects, stale async route commits, or history defects. Prefer untried schedules covering different mechanisms. No model call occurs between gestures.',patterns)}},`advanced-production/${i}`);await run(response.answers.action.choice,'jev');}
}
await browser.close();
