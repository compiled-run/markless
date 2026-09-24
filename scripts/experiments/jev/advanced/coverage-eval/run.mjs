import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {launch,session,observe,settled,randomFor,url} from '../common.mjs';
import {blank,options,action,checks} from '../journeys.mjs';
import {Coverage,chooseAction} from './policy.mjs';
import {createJev} from '../../client.mjs';

const output='/tmp/jev-coverage';mkdirSync(output,{recursive:true});
const save=(name,data)=>writeFileSync(`${output}/${name}.json`,JSON.stringify(data,null,2)+'\n');
const replay=process.argv.includes('--replay'),preflight=process.argv.includes('--preflight');
const read=name=>JSON.parse(readFileSync(`${output}/${name}.json`));
const routes=['todos','workspace','home','slow'],policies=['random','least_visited','jev'];
const state=(s,model)=>({...s,taskFilter:model.filter,totalTasks:model.todos.length,completedTotal:model.todos.filter(t=>t.completed).length});
const path=route=>route==='home'?'/':`/${route}`;
async function stableObservation(page){
 for(let attempt=0;attempt<4;attempt++)try{return await observe(page);}catch(error){
  if(attempt===3||!error.message.includes('Execution context was destroyed'))throw error;
  await page.waitForLoadState('domcontentloaded');
 }
}
async function initialize(page,route,repeat,reload=false){
 if(reload){await page.goto(new URL(path(route),url).href);await page.locator('main[data-page]').waitFor();await page.evaluate(()=>window.experimentDocument='original');}
 let model=blank();const prefix=[];
 if(route==='todos')for(let i=0;i<2+repeat;i++){
  const before=await stableObservation(page);model=await action(page,'add',before,model,-10+i);
  const result=await settled(page,after=>checks(before,'add',after,model));prefix.push({action:'add',...result});
  if(result.violations.length)throw Error(`Seed task failed: ${result.violations.join(', ')}`);
 }
 return {model,prefix};
}
const browser=await launch(),runs=[];
const plans=replay?read('journeys').runs.filter(r=>r.repeat===0):preflight?[{policy:'least_visited',repeat:0}]:[0,1,2].flatMap(repeat=>policies.map((_,offset)=>({repeat,policy:policies[(repeat+offset)%3]})));
const api=!replay&&!preflight?createJev({ledgerPath:`${output}/api.jsonl`,capUSD:1}):null;
try{
 for(const plan of plans){
  const coverage=new Coverage(),episodes=[];const started=performance.now();
  const order=routes.map((_,i)=>routes[(i+plan.repeat)%routes.length]);
  for(const startRoute of order){
   const {page,context,errors,initialIndex}=await session(browser,path(startRoute));
   page.setDefaultNavigationTimeout(20000);
   const initial=await initialize(page,startRoute,plan.repeat);let model=initial.model;coverage.start(startRoute);
   const steps=[];let pendingRecovery=null;const rng=randomFor(1701+plan.repeat*101+routes.indexOf(startRoute));
   const recorded=replay?plan.episodes.find(e=>e.startRoute===startRoute):null;
   for(let index=0;index<(preflight?8:12);index++){
    let recovery=null;
    if(pendingRecovery){
     const restored=await initialize(page,pendingRecovery.route,plan.repeat,true);model=restored.model;
     recovery={kind:'reload_failed_route_and_restore_seed',...pendingRecovery,stateDiscarded:true,seedActions:restored.prefix};pendingRecovery=null;
    }
    let before=state(await stableObservation(page),model);
    if(before.editor?.outer&&(!before.editor.contained||!before.documentFocused)){
     await page.getByTestId(before.editor.inner?'inner-content':'outer-content').click({position:{x:2,y:2}});
     recovery={...recovery,focusRestoredBy:'trusted_click_inside_current_dialog'};before=state(await stableObservation(page),model);
    }
    const available=options(before,model,initialIndex);
    for(const id of Object.keys(available))if(id.startsWith('nav_'))available[id]+={nav_home:'; exercise the home counter',nav_workspace:'; explore project selection and nested confirmation dialogs',nav_todos:'; explore editable task rows and filters',nav_slow:'; exercise the asynchronous report and route counter'}[id];
    const shuffled=Object.fromEntries(Object.entries(available).map(entry=>({entry,order:rng()})).sort((a,b)=>a.order-b.order).map(({entry})=>entry));
    const menu=coverage.menu(before,shuffled),feedback={...coverage.feedback(before,recovery),stepsRemaining:12-index,menuRestrictions:menu.excluded};
    const decisionStart=performance.now();
    const selected=replay?{action:recorded.steps[index].action,source:'replay'}:await chooseAction({policy:plan.policy,options:menu.options,feedback,rng,ask:request=>api.ask(request,`coverage/${plan.repeat}/${startRoute}/${index}`)});
    if(!menu.options[selected.action])throw Error(`Replay action no longer available: ${selected.action}`);
    const decisionMilliseconds=performance.now()-decisionStart,errorStart=errors.length;page.experimentRecovery=null;
    let result,actionError=null,failureKind=null;const actionStart=performance.now();
    try{
     model=await action(page,selected.action,before,model,index);
     result=await settled(page,after=>checks(before,selected.action,after,model));
     if(result.violations.includes('todo_reference_model'))failureKind='todo_data_mismatch';
     if(result.violations.includes('route_counter_exact_effect'))failureKind='counter_effect_mismatch';
    }catch(error){
     actionError=error.message;
     failureKind=['edit_first','cancel_edit'].includes(selected.action)&&error.message.includes('waitForFunction')?'editing_did_not_start':'action_exception';
     result={after:await stableObservation(page),violations:[failureKind]};
    }
    if(page.experimentRecovery){recovery={...recovery,navigation:page.experimentRecovery};if(page.experimentRecovery.kind==='document_reload_after_stalled_spa')result.violations.push('spa_route_stalled');}
    if(failureKind)pendingRecovery={route:before.page,reason:actionError??result.violations.join(', '),failedAction:selected.action};
    const step={index,before,action:selected.action,source:selected.source,...result,after:state(result.after,model),expectedModel:structuredClone(model),actionError,failureKind,recovery,recoveryPlanned:pendingRecovery,originalMenu:shuffled,permittedMenu:menu.options,excluded:menu.excluded,intervention:menu.intervention,errors:errors.slice(errorStart),decisionMilliseconds,actionMilliseconds:performance.now()-actionStart};
    coverage.record(step);steps.push(step);
    save(replay?'journeys-replay-progress':preflight?'preflight-progress':'journeys-progress',{runs,current:{...plan,startRoute,steps}});
   }
   episodes.push({startRoute,prefix:initial.prefix,steps,errors});await context.close();
   console.log(JSON.stringify({policy:plan.policy,repeat:plan.repeat,startRoute,steps:steps.length,actions:[...new Set(steps.map(s=>s.action))],failures:[...new Set(steps.flatMap(s=>s.violations))]}));
  }
  runs.push({...plan,episodes,milliseconds:performance.now()-started,coverage:coverage.feedback({},null).coverage});
  save(replay?'journeys-replay':preflight?'preflight':'journeys',{runs});
 }
}finally{await browser.close();}
