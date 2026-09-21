import { launch, session, observe, selector, settled, journeyKey, baseChecks, save, read, sleep } from './common.mjs';
import { perform as editorAction, checks as editorChecks } from './composition.mjs';

export const blank = () => ({ todos: [], filter: 'all', nextId: 1, count: 0 });
const visible = model => model.todos.filter(t=>model.filter==='all'||(model.filter==='completed')===t.completed);
const row = (page,id) => page.locator('.todo-list li').filter({has:page.locator('.todo-id',{hasText:new RegExp(`^${id}$`)})});
const routePath = name => name==='home'?'/':`/${name}`;

export function options(state, model, initialIndex) {
  if(state.editor?.inner) return { close_inner:'Close nested dialog', confirm:'Confirm selected project once', escape:'Dismiss top overlay with Escape', leave_workspace:'Close dialogs and navigate to tasks, removing the editor instance' };
  if(state.editor?.outer) return { choose_project:'Filter to Beta, walk to it, select it with Enter', open_inner:'Open nested confirmation dialog', close:'Close the editor', escape:'Dismiss top overlay with Escape', leave_workspace:'Close dialogs and navigate to tasks, removing the editor instance' };
  const choices = {};
  for(const target of ['home','workspace','todos','slow']) if(state.page!==target) choices[`nav_${target}`]=`Navigate to ${target} without a document reload`;
  if(state.historyIndex>initialIndex) choices.back='Go back one application history entry';
  if(state.historyIndex<state.historyLength-1) choices.forward='Go forward one application history entry';
  if(state.page==='home'||state.page==='slow') choices.increment='Increment current route counter exactly once';
  if(state.page==='workspace') choices.open='Open a newly mounted project editor';
  if(state.page==='todos') {
    Object.assign(choices,{add:'Add a uniquely named task',filter_all:'Show all tasks',filter_active:'Show only incomplete tasks',filter_completed:'Show only completed tasks',toggle_all:'Toggle every task using the all-tasks checkbox',clear_completed:'Remove completed tasks, including hidden rows'});
    if(visible(model).length) Object.assign(choices,{toggle_first:'Toggle the first visible task',destroy_first:'Delete the first visible task',edit_first:'Edit the first visible task and commit with Enter',cancel_edit:'Begin editing the first visible task and cancel with Escape'});
  }
  return choices;
}
async function leaveWorkspace(page) {
  const state=await observe(page);
  if(state.editor?.inner){await editorAction(page,'close_inner');await page.waitForFunction(()=>document.querySelector('[data-testid="inner-backdrop"]').hidden);}
  if((await observe(page)).editor?.outer){await editorAction(page,'close');await page.waitForFunction(()=>document.querySelector('[data-testid="outer-backdrop"]').hidden);}
  await page.getByTestId('nav-todos').click();
}
async function waitRoute(page, target) {
  try { await page.locator(`[data-page="${target}"]`).waitFor({timeout:2000}); }
  catch {
    const stalled = await observe(page);
    await page.goto(new URL(routePath(target), page.url()).href);
    await page.locator(`[data-page="${target}"]`).waitFor();
    await page.evaluate(()=>window.experimentDocument='original');
    page.experimentRecovery = {kind:'document_reload_after_stalled_spa',stalled};
  }
}
export async function action(page,id,before,model,index) {
  if(id.startsWith('nav_')){await page.getByTestId(id.replace('nav_','nav-')).click();await waitRoute(page,id.slice(4));return blank();}
  if(id==='back'||id==='forward'){
    await page[id==='back'?'goBack':'goForward']({waitUntil:'domcontentloaded'});
    await page.locator('main[data-page]').waitFor();
    if(!(await observe(page)).sameDocument){await page.evaluate(()=>window.experimentDocument='original');page.experimentRecovery={kind:'history_document_navigation_after_recovery'};}
    await waitRoute(page,new URL(page.url()).pathname==='/'?'home':new URL(page.url()).pathname.slice(1));
    return blank();
  }
  if(id==='leave_workspace'){await leaveWorkspace(page);await waitRoute(page,'todos');return blank();}
  if(id==='increment'){await page.getByTestId('count').click();model.count++;return model;}
  if(id==='choose_project') {
    await editorAction(page,'filter_beta');await page.waitForFunction(()=>document.querySelector('[data-testid="combo-input"]').value==='Beta');
    await editorAction(page,'down');await page.waitForFunction(()=>document.querySelector('[data-option="Beta"]')?.hasAttribute('ui-highlighted'));
    await editorAction(page,'enter');return model;
  }
  if(['open','open_inner','close_inner','close','escape','confirm'].includes(id)){await editorAction(page,id);return model;}
  const first=visible(model)[0];
  if(id==='add') {
    const title=`Task ${index}-${model.nextId}`;
    await page.locator('.new-todo').fill(title);await page.locator('.new-todo').press('Enter');
    model.todos.push({id:model.nextId++,title,completed:false,editing:false});
  } else if(id.startsWith('filter_')) {model.filter=id.slice(7);await page.locator(`[data-filter="${model.filter}"]`).click();}
  else if(id==='toggle_all'){await page.locator('.toggle-all').click();model.todos.forEach(t=>t.completed=!before.toggleAll);}
  else if(id==='toggle_first'){await row(page,first.id).locator('.toggle').click();first.completed=!first.completed;}
  else if(id==='destroy_first'){await row(page,first.id).locator('.destroy').click();model.todos=model.todos.filter(t=>t.id!==first.id);}
  else if(id==='clear_completed'){await page.locator('.clear-completed').click();model.todos=model.todos.filter(t=>!t.completed);}
  else if(id==='edit_first'||id==='cancel_edit'){
    await row(page,first.id).locator('label').dblclick();
    await page.waitForFunction(id=>[...document.querySelectorAll('.todo-list li')].find(row=>row.querySelector('.todo-id').textContent===String(id))?.querySelector('.todo-editing').textContent==='true',first.id);
    const title=`Edited ${index}-${first.id}`;await row(page,first.id).locator('.edit').fill(title);
    await row(page,first.id).locator('.edit').press(id==='edit_first'?'Enter':'Escape');if(id==='edit_first') first.title=title;
  }
  return model;
}
export function checks(before,id,after,model) {
  const violations=baseChecks(after);
  if(after.page==='todos'&&JSON.stringify(after.todos)!==JSON.stringify(visible(model)))violations.push('todo_reference_model');
  if((after.page==='home'||after.page==='slow')&&after.count!==model.count)violations.push('route_counter_exact_effect');
  if(after.path!==routePath(after.page))violations.push('route_url_content_agreement');
  if(after.page!=='workspace'&&after.editor)violations.push('removed_editor_retained');
  if(after.editor&&before.editor&&['open','open_inner','close_inner','close','escape','confirm'].includes(id))violations.push(...editorChecks(before,id,after).filter(v=>!violations.includes(v)));
  if(after.editor&&(id.startsWith('nav_')||id==='back'||id==='forward')){
    if(after.editor.outer||after.editor.inner||after.editor.selected!==''||after.editor.selections!==0||after.editor.confirmed!==0)violations.push('new_editor_state');
  }
  if(id==='choose_project'){
    if(after.editor.selected!==(before.editor.selected==='Beta'?'':'Beta')||after.editor.selections!==before.editor.selections+1)violations.push('composed_selection_exact_effect');
  }
  return violations;
}
if(process.argv[1]?.endsWith('/journeys.mjs')){
const replay=process.argv.includes('--replay'),check=process.argv.includes('--check');
const replayName=process.argv.includes('--canonical')?'journeys-canonical-replay':'journeys-replay';
const browser=await launch(),runs=[];
const candidates=replay?read('journeys').runs:check?[{policy:'fixed',seed:17}]:[17,29,43].flatMap((seed,index)=>['random','least_visited','jev'].map((_,offset)=>({seed,policy:['random','least_visited','jev'][(index+offset)%3]})));
const plans=replay&&process.argv.includes('--sample')?candidates.filter(r=>r.seed===17&&r.policy!=='least_visited'):candidates;
for(const plan of plans.filter(plan=>!process.argv.includes('--jev-only')||plan.policy==='jev')){
  const {page,context,errors,requests,initialIndex}=await session(browser,'/todos');let model=blank();
  const prefix=[];
  for(let i=0;i<3;i++){const before=await observe(page);model=await action(page,'add',before,model,-3+i);const result=await settled(page,after=>checks(before,'add',after,model));prefix.push({action:'add',...result});}
  const choose=selector(replay?'replay':plan.policy,plan.seed,'journey');const steps=[];let fatal=null;let resetNext=false;const started=performance.now();
  const fixed=['toggle_first','filter_completed','edit_first','filter_all','cancel_edit','nav_workspace','open','choose_project','open_inner','confirm','close_inner','leave_workspace','add','back','nav_home','increment','back','forward','nav_todos','add','clear_completed','nav_slow','increment','nav_todos'];
  for(let i=0;i<(replay?plan.steps.length:check?fixed.length:32);i++){
    let recovery=null;page.experimentRecovery=null;
    if(resetNext){await page.goto(new URL('/todos',page.url()).href);await page.locator('.new-todo').waitFor();await page.evaluate(()=>window.experimentDocument='original');model=blank();recovery='reload_tasks_after_failed_action';resetNext=false;}
    let before=await observe(page);
    if(before.editor?.outer&&(!before.editor.contained||!before.documentFocused)){recovery='click_current_dialog';await page.getByTestId(before.editor.inner?'inner-content':'outer-content').click({position:{x:2,y:2}});before=await observe(page);}
    const available=options(before,model,initialIndex);const begin=performance.now();
    const id=replay?plan.steps[i].action:check?fixed[i]:await choose.choose({...before,taskFilter:model.filter,totalTasks:model.todos.length},journeyKey(before),available,steps,i);
    const decisionMilliseconds=performance.now()-begin;let result;
    try{
      if(!available[id])throw new Error(`Unavailable action ${id}`);
      model=await action(page,id,before,model,i);result=await settled(page,after=>checks(before,id,after,model));
      if(page.experimentRecovery){recovery=page.experimentRecovery;if(recovery.kind==='document_reload_after_stalled_spa')result.violations.push('spa_route_stalled');}
    }catch(error){await page.waitForLoadState('domcontentloaded').catch(()=>{});result={after:await observe(page),violations:['harness_or_action_error'],actionError:error.message};resetNext=true;}
    steps.push({before,action:id,...result,expectedModel:structuredClone(model),recovery,decisionMilliseconds});
    save(replay?`${replayName}-progress`:check?'journeys-check-progress':'journeys-progress',{completed:runs,current:{policy:plan.policy,seed:plan.seed,prefix,steps,errors}});
    if(result.violations.includes('todo_reference_model'))resetNext=true;
  }
  const result={policy:plan.policy,seed:plan.seed,prefix,steps,errors,fatal,milliseconds:performance.now()-started,documentRequests:requests.filter(r=>r.type==='document').length};runs.push(result);
  save(replay?replayName:check?'journeys-check':'journeys',{runs});console.log(JSON.stringify({policy:plan.policy,seed:plan.seed,steps:steps.length,violations:[...new Set(steps.flatMap(s=>s.violations))],fatal,errors}));
  await context.close();
}
await browser.close();
}
