import { launch, session, observe, selector, settled, editorKey, baseChecks, save, read } from './common.mjs';

export function options(state) {
  const e = state.editor;
  if (!e.outer) return { open: 'Open the project editor dialog', background: 'Click background control while no modal is open' };
  if (e.inner) return { close_inner: 'Close only the nested confirmation dialog', escape: 'Press Escape to dismiss only the top overlay', confirm: 'Increment confirmation count exactly once', tab: 'Tab forward within nested dialog', shift_tab: 'Tab backward within nested dialog' };
  const choices = { filter_a: 'Focus project combobox and type a, retaining matching options', filter_beta: 'Filter projects to Beta', filter_none: 'Type zzz, leaving no matching options', clear: 'Clear the project query', down: 'Focus input and press ArrowDown', up: 'Focus input and press ArrowUp', open_inner: 'Open nested confirmation dialog', close: 'Close editor dialog', escape: 'Press Escape to dismiss only the top overlay', tab: 'Tab forward from current focus', shift_tab: 'Tab backward from current focus' };
  if (e.combo && e.options.some(o=>o.highlighted)) choices.enter = 'Choose the highlighted option with Enter, toggling it if already selected';
  if (e.combo) for (const option of e.options) choices[`choose_${option.value}`] = `Click project ${option.value}; selection callbacks fire once`;
  return choices;
}
export async function perform(page, action) {
  const click = { open:'outer-trigger',close:'outer-close',open_inner:'inner-trigger',close_inner:'inner-close',confirm:'confirm',background:'background' }[action];
  if(click) return page.getByTestId(click).click();
  if(action.startsWith('choose_')) return page.locator(`[data-option="${action.slice(7)}"]`).click();
  const query = {filter_a:'a',filter_beta:'Beta',filter_none:'zzz',clear:''}[action];
  if(query !== undefined) return page.getByTestId('combo-input').fill(query);
  if(['down','up','enter'].includes(action)) { await page.getByTestId('combo-input').focus(); return page.keyboard.press({down:'ArrowDown',up:'ArrowUp',enter:'Enter'}[action]); }
  return page.keyboard.press({escape:'Escape',tab:'Tab',shift_tab:'Shift+Tab'}[action]);
}
export function checks(before, action, after) {
  const violations = baseChecks(after), a=before.editor, b=after.editor;
  if (!b) return [...violations,'editor_missing'];
  const expect = (yes,name) => {if(!yes) violations.push(name);};
  expect(b.combo !== b.comboHidden,'combobox_expansion_sync');
  expect(b.activeIdValid,'combobox_dangling_active_id');
  expect(b.options.map(o=>o.value).join('|') === ['Alpha','Beta','Gamma','Delta'].filter(n=>n.toLowerCase().includes(b.input.toLowerCase())).join('|'),'filtered_options');
  expect(b.backgroundInert === b.outer,'background_inertness');
  if(b.outer) expect(b.contained,'modal_focus_containment');
  if(action==='open') expect(b.outer&&!b.inner,'open_editor');
  if(action==='close') expect(!b.outer,'close_editor');
  if(action==='open_inner') expect(b.outer&&b.inner,'open_nested');
  if(action==='close_inner') expect(b.outer&&!b.inner,'close_nested_only');
  if(action==='escape') {
    if(a.inner) expect(b.outer&&!b.inner,'escape_nested_only');
    else if(a.combo) expect(b.outer&&!b.combo,'escape_combobox_only');
    else expect(!b.outer,'escape_editor');
  }
  if(action==='confirm') expect(b.confirmed===a.confirmed+1,'confirmation_exactly_once');
  const selected = action.startsWith('choose_') ? action.slice(7) : action==='enter' ? a.options.find(o=>o.highlighted)?.value : null;
  if(selected) { expect(b.selected===(a.selected===selected?'':selected),'selection_value');expect(b.selections===a.selections+1,'selection_exactly_once');expect(!b.combo,'selection_closes_list'); }
  if(action==='clear' && a.selected!=='') {
    expect(b.selected==='' && b.selections===a.selections+1,'clear_selection_exactly_once');
  } else if(!selected) expect(b.selections===a.selections,'unexpected_selection_callback');
  return violations;
}

if (process.argv[1]?.endsWith('/composition.mjs')) {
  const replay = process.argv.includes('--replay'), check = process.argv.includes('--check');
  const browser = await launch(); const runs=[];
  const plans = replay ? read('composition').runs : check ? [{policy:'fixed',seed:17}] : [17,29,43].flatMap((seed,index)=>['random','least_visited','jev'].map((_,offset)=>({seed,policy:['random','least_visited','jev'][(index+offset)%3]})));
  for (const plan of plans) {
    const {page,context,errors,requests} = await session(browser,'/workspace');
    await perform(page,'open');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='outer-content');
    const choose = selector(replay?'replay':plan.policy,plan.seed,'composition');const steps=[];let fatal=null;
    const started=performance.now();
    const fixed=['filter_a','down','enter','open_inner','confirm','close_inner','filter_beta','choose_Beta','close','open','filter_none','escape','close'];
    for(let i=0;i<(replay?plan.steps.length:check?fixed.length:24);i++) {
      let before = await observe(page);let recovery=null;
      if(before.editor.outer&&!before.editor.contained){recovery='focus_current_dialog';await page.getByTestId(before.editor.inner?'inner-content':'outer-content').focus();before=await observe(page);}
      const available=options(before);const start=performance.now();
      const action=replay?plan.steps[i].action:check?fixed[i]:await choose.choose(before,editorKey(before),available,steps,i);
      const decisionMilliseconds=performance.now()-start;
      let result;
      try { if(!available[action])throw new Error(`Unavailable action ${action}`);await perform(page,action);result=await settled(page,after=>checks(before,action,after)); }
      catch(error){fatal=error.message;result={after:await observe(page),violations:['harness_or_action_error']};}
      steps.push({before,action,...result,recovery,decisionMilliseconds});
      if(fatal)break;
    }
    const result={policy:plan.policy,seed:plan.seed,steps,errors,fatal,milliseconds:performance.now()-started,documentRequests:requests.filter(r=>r.type==='document').length};runs.push(result);
    save(replay?'composition-replay':check?'composition-check':'composition',{runs});
    console.log(JSON.stringify({policy:plan.policy,seed:plan.seed,steps:steps.length,violations:[...new Set(steps.flatMap(s=>s.violations))],fatal,errors}));
    await context.close();
  }
  await browser.close();
}
