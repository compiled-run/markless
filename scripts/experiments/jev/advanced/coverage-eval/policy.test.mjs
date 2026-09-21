import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Coverage,legalChoices,chooseAction} from './policy.mjs';

const state=(extra={})=>({page:'todos',todos:[{id:1,title:'One',completed:false,editing:false}],editor:null,taskFilter:'all',totalTasks:1,...extra});
const choices={nav_home:'Home',add:'Add',edit_first:'Edit',filter_all:'All',clear_completed:'Clear',toggle_all:'Toggle'};
const step=(action,extra={})=>({before:state(),after:state(),action,violations:[],...extra});

test('empty/filter state excludes ineffective operations without removing navigation',()=>{
 assert.deepEqual(legalChoices(state({todos:[],totalTasks:0}),choices),{nav_home:'Home',add:'Add'});
 assert.ok(!Object.hasOwn(legalChoices(state(),choices),'clear_completed'));
});
test('two equivalent failures suppress an action despite new task names; unrelated invariant failures do not',()=>{
 const c=new Coverage();
 for(let i=0;i<2;i++)c.record(step('edit_first',{actionError:'Editing state did not appear',failureKind:'editing_timeout',violations:['action_timeout'],before:state({todos:[{id:i+1,title:`New ${i}`,completed:false,editing:false}]})}));
 const menu=c.menu(state(),choices);assert.ok(!menu.options.edit_first);assert.equal(menu.excluded.edit_first,'repeated_failure');assert.ok(menu.options.nav_home);
 const d=new Coverage();for(let i=0;i<2;i++)d.record(step('add',{violations:['background_inertness']}));assert.ok(d.menu(state(),choices).options.add);
});
test('feedback preserves error, recovery and lifetime failure memory beyond six recent steps',()=>{
 const c=new Coverage();c.record(step('edit_first',{actionError:'Timed out waiting for editing=true',failureKind:'editing_timeout',violations:['action_timeout'],recovery:{kind:'reload',reason:'editing failed',stateDiscarded:true}}));
 for(let i=0;i<7;i++)c.record(step('add'));
 const feedback=c.feedback(state(),{kind:'reload',reason:'failed edit',stateDiscarded:true});
 assert.equal(feedback.recent.length,6);assert.match(feedback.knownFailures[0].message,/editing=true/);assert.equal(feedback.recovery.stateDiscarded,true);assert.ok(feedback.unvisitedRoutes.includes('workspace'));
});
test('repeated unproductive choices require an untried action and disclose the intervention',()=>{
 const c=new Coverage();for(let i=0;i<5;i++)c.record(step('add'));
 const menu=c.menu(state(),choices);assert.equal(menu.intervention,'require_untried_action');assert.ok(!menu.options.add);assert.ok(menu.options.nav_home);
});
test('single remaining choice is attributed to the harness and makes no API request',async()=>{
 const result=await chooseAction({policy:'jev',options:{nav_home:'Home'},feedback:{},rng:()=>0,ask:()=>{throw Error('must not call API')}});
 assert.deepEqual(result,{action:'nav_home',source:'harness_single_choice'});
});
test('recent feedback includes browser exceptions and planned recovery',()=>{
 const c=new Coverage();c.record(step('nav_home',{errors:['Missing stream anchors'],recoveryPlanned:{route:'home',stateDiscarded:true}}));
 const feedback=c.feedback(state(),null);assert.deepEqual(feedback.recent[0].errors,['Missing stream anchors']);assert.equal(feedback.recent[0].recoveryPlanned.route,'home');
});
test('Jev receives the permitted menu and full feedback; invalid choices fail closed',async()=>{
 const feedback={knownFailures:[{message:'Editing timed out'}],recovery:{stateDiscarded:true}};
 const ask=async request=>{assert.deepEqual(request.state,feedback);assert.deepEqual(request.questions.action.criteria,{add:'Add',nav_home:'Home'});return {answers:{action:{choice:'nav_home'}}};};
 assert.equal((await chooseAction({policy:'jev',options:{add:'Add',nav_home:'Home'},feedback,rng:()=>0,ask})).source,'jev');
 await assert.rejects(chooseAction({policy:'jev',options:{add:'Add',nav_home:'Home'},feedback,rng:()=>0,ask:async()=>({answers:{action:{choice:'deleted'}}})}),/Unavailable/);
});
