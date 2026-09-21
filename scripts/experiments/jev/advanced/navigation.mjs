import { launch,session,observe,save,read,sleep,url } from './common.mjs';
import { createJev,choice } from '../client.mjs';

const patterns={held_supersede:'Hold destination module loading, click outgoing counter twice, supersede navigation, release stale loading',held_back:'Hold destination module loading, go Back before release, verify stale destination never commits',pending_leave:'Navigate into a pending async boundary, interact, leave before settlement, verify no stale DOM',ssr_pending_leave:'Start on a streamed SSR pending page, interact and navigate away while the response is unfinished',ssr_rapid_pair:'Send two trusted clicks during SSR pending work, then verify exactly two effects',history_roundtrip:'Mutate route state, visit async route, go Back and Forward and verify fresh route state'};
const browser=await launch();const results=[];const replay=process.argv.includes('--replay'),check=process.argv.includes('--check');
async function run(pattern,policy){
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(5000);
 const errors=[],requests=[],events=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push({url:request.url(),type:request.resourceType()}));
 let release=()=>{},heldUrl=null,gateReady;
 const barrier=new Promise(resolve=>{release=resolve}),gotGate=new Promise(resolve=>{gateReady=resolve});
 const checks=[];let failure=null;let conditionAchieved=true;const started=performance.now();
 const assert=(condition,name)=>{checks.push({name,pass:Boolean(condition)});};
 try{
  if(pattern.startsWith('ssr_')){
   await page.goto(new URL('/pending-control',url).href,{waitUntil:'commit'});
   await page.locator('[data-page="pending-control"]').waitFor();await page.evaluate(()=>window.experimentDocument='original');
   const initial=await observe(page);events.push({phase:'initial',state:initial});conditionAchieved=initial.reportPending&&!initial.report;
   await page.getByTestId('count').click();
   if(pattern==='ssr_rapid_pair'){
    await page.getByTestId('count').click();await page.waitForFunction(()=>document.querySelector('[data-testid="count"]').textContent==='2');await page.getByTestId('report-ready').waitFor();
    assert((await observe(page)).count===2,'two_exact_ssr_effects');
   }else{
    await page.getByTestId('nav-plain').click();await page.locator('[data-page="plain"]').waitFor();await sleep(1500);
    const state=await observe(page);assert(state.page==='plain'&&!state.report,'no_late_ssr_route_overwrite');assert(state.sameDocument,'same_document_navigation');
    await page.getByTestId('count').click();await page.waitForFunction(()=>document.querySelector('[data-testid="count"]').textContent==='1');
   }
  }else{
   await page.goto(url);await page.evaluate(()=>window.experimentDocument='original');await page.getByTestId('nav-todos').click();
   for(let i=0;i<100&&!requests.some(r=>r.url.includes('virtual:markless-router/navigation-entry'));i++)await sleep(50);
   const moduleUrl=requests.find(r=>r.url.includes('virtual:markless-router/navigation-entry')).url;
   const navigate=href=>page.evaluate(async ({moduleUrl,href})=>(await import(moduleUrl)).navigateMarklessRouterLink({href}),{moduleUrl,href});
   await navigate('/plain');await page.locator('[data-page="plain"]').waitFor();events.push({phase:'primed_plain',state:await observe(page)});
   if(pattern.startsWith('held_')){
    await context.route('**/*',async route=>{
     if(!heldUrl&&route.request().resourceType()==='script'&&route.request().url().includes('/pages/pending-control.tsrx')){heldUrl=route.request().url();gateReady();await barrier;}
     await route.continue();
    });
    await navigate('/pending-control');await Promise.race([gotGate,sleep(3000)]);conditionAchieved=Boolean(heldUrl);
    const before=await observe(page);events.push({phase:'held',state:before});assert(before.page==='plain','outgoing_page_retained_during_load');
    if(pattern==='held_supersede'){
     await page.getByTestId('count').click();await page.getByTestId('count').click();await page.waitForFunction(()=>document.querySelector('[data-testid="count"]').textContent==='2');
     events.push({phase:'outgoing_two_clicks',state:await observe(page)});await navigate('/plain');
    }else await page.evaluate(()=>history.back());
    await page.waitForFunction(()=>location.pathname==='/plain');await sleep(200);release();await sleep(1700);
    const after=await observe(page);assert(after.page==='plain'&&after.path==='/plain'&&!after.report,'stale_route_does_not_commit');assert(after.count===0,'new_route_counter_is_fresh');
   }else if(pattern==='pending_leave'){
    await navigate('/pending-control');await page.locator('[data-page="pending-control"]').waitFor();const pending=await observe(page);events.push({phase:'pending',state:pending});conditionAchieved=pending.reportPending;
    await page.getByTestId('count').click();await page.getByTestId('nav-plain').click();await page.locator('[data-page="plain"]').waitFor();await sleep(1500);
    const after=await observe(page);assert(after.page==='plain'&&!after.report,'no_late_async_route_overwrite');assert(after.count===0,'replacement_route_counter_is_fresh');
   }else{
    await page.getByTestId('count').click();await page.waitForFunction(()=>document.querySelector('[data-testid="count"]').textContent==='1');
    await navigate('/pending-control');await page.getByTestId('report-ready').waitFor();await page.getByTestId('count').click();await page.waitForFunction(()=>document.querySelector('[data-testid="count"]').textContent==='1');
    await page.evaluate(()=>history.back());await page.locator('[data-page="plain"]').waitFor();assert((await observe(page)).count===0,'back_recreates_route_state');
    await page.evaluate(()=>history.forward());await page.locator('[data-page="pending-control"]').waitFor();await page.getByTestId('report-ready').waitFor();assert((await observe(page)).count===0,'forward_recreates_route_state');
   }
   assert((await observe(page)).sameDocument,'same_document_navigation');
  }
  events.push({phase:'final',state:await observe(page)});
 }catch(error){failure=error.message;try{events.push({phase:'failure',state:await observe(page)})}catch{}}
 finally{release();}
 const result={pattern,policy,conditionAchieved,heldUrl,checks,failure,errors,events,milliseconds:performance.now()-started,documentRequests:requests.filter(r=>r.type==='document').length};results.push(result);save(replay?'navigation-replay':check?'navigation-check':'navigation',{results});
 console.log(JSON.stringify({pattern,policy,conditionAchieved,checks,failure,errors}));await context.close();
}
if(replay){for(const result of read('navigation').results)await run(result.pattern,result.policy);}
else{
 for(const pattern of Object.keys(patterns))await run(pattern,'enumerated');
 if(!check){const api=createJev();for(let i=0;i<6;i++){const previous=results.filter(r=>r.policy==='jev').map(({pattern,conditionAchieved,checks,failure})=>({pattern,conditionAchieved,checks,failure}));const response=await api.ask({state:{previous},questions:{action:choice('Choose the next schedule to expose stale route commits, lost effects or broken history under interrupted Markless SSR/navigation. Prioritize untested schedules and distinct mechanisms. Actions within the schedule execute at controlled timing without model calls.',patterns)}},`advanced-navigation/${i}`);await run(response.answers.action.choice,'jev');}}
}
await browser.close();
