import assert from 'node:assert/strict';
import {choice} from '../../client.mjs';

const routes=['home','workspace','todos','slow'];
export const contextKey=s=>`${s.page}/${s.taskFilter??'all'}/${Math.min(s.todos?.length??0,3)}/${Math.min(s.todos?.filter(t=>t.completed).length??0,3)}/${Boolean(s.editor?.outer)}/${Boolean(s.editor?.inner)}/${Boolean(s.editor?.selected)}/${Math.min(s.count??0,2)}`;
const failureKey=(s,action)=>`${s.page}/${action}/${Boolean(s.editor?.inner)}`;

export function legalChoices(state,choices){
 const result={...choices};
 if(state.page==='todos'){
  delete result[`filter_${state.taskFilter??'all'}`];
  if(!(state.totalTasks??state.todos.length))for(const id of ['filter_all','filter_active','filter_completed','toggle_all','clear_completed'])delete result[id];
  if(!(state.completedTotal??state.todos.filter(t=>t.completed).length))delete result.clear_completed;
  if(!state.todos.length)for(const id of ['toggle_first','destroy_first','edit_first','cancel_edit'])delete result[id];
 }
 return result;
}

export class Coverage{
 visits={};actions={};failures={};recent=[];visited=new Set();starts=[];transitions=[];stale=0;
 start(route){this.visited.add(route);this.starts.push(route);}
 record(step){
  const key=`${contextKey(step.before)}/${step.action}`;
  this.stale=this.visits[key]?this.stale+1:0;
  this.visits[key]=(this.visits[key]??0)+1;
  const actionKey=`${step.before.page}/${step.action}`;this.actions[actionKey]=(this.actions[actionKey]??0)+1;
  this.visited.add(step.before.page);this.visited.add(step.after.page);
  if(step.after.page!==step.before.page)this.transitions.push({from:step.before.page,to:step.after.page,recovered:Boolean(step.recovery),action:step.action});
  if(step.failureKind){
   const key=failureKey(step.before,step.action),previous=this.failures[key];
   this.failures[key]={key,action:step.action,route:step.before.page,kind:step.failureKind,message:step.actionError??step.violations.join(', '),count:(previous?.count??0)+1};
  }
  this.recent.push({action:step.action,before:step.before,after:step.after,violations:step.violations,actionError:step.actionError??null,failureKind:step.failureKind??null,recovery:step.recovery??null,recoveryPlanned:step.recoveryPlanned??null,errors:step.errors??[]});
  this.recent=this.recent.slice(-6);
 }
 menu(state,choices){
  let options=legalChoices(state,choices);const excluded={};let intervention=null;
  for(const id of Object.keys(choices))if(!options[id])excluded[id]='no_effect_or_missing_precondition';
  for(const id of Object.keys(options))if((this.failures[failureKey(state,id)]?.count??0)>=2){delete options[id];excluded[id]='repeated_failure';}
  if(this.stale>=4){
   const untried=Object.fromEntries(Object.entries(options).filter(([id])=>!this.visits[`${contextKey(state)}/${id}`]));
   if(Object.keys(untried).length){
    for(const id of Object.keys(options))if(!untried[id])excluded[id]='repeated_without_new_coverage';
    options=untried;intervention='require_untried_action';
   }
  }
  assert.ok(Object.keys(options).length,'No actions remain after coverage restrictions');
  return {options,excluded,intervention};
 }
 feedback(state,recovery){
  return {current:state,recovery:recovery??null,coverage:{routeStarts:this.starts,observedRoutes:[...this.visited],transitions:this.transitions,actionCounts:this.actions,stateActionVisits:this.visits,decisionsWithoutNewStateAction:this.stale},unvisitedRoutes:routes.filter(r=>!this.visited.has(r)),knownFailures:Object.values(this.failures),recent:this.recent};
 }
}

export async function chooseAction({policy,options,feedback,rng,ask}){
 const ids=Object.keys(options);assert.ok(ids.length,'No available action');
 if(ids.length===1)return {action:ids[0],source:'harness_single_choice'};
 if(policy==='jev'){
  const response=await ask({state:feedback,questions:{action:choice('Explore new Markless behavior using an available action. Prioritize unvisited routes and untested interactions. Known failures have already been recorded: reproducing them again adds no coverage. Recovery is performed by the harness and may discard app state; do not mistake a reset for a successful action. Use the explicit failure messages and coverage counts to move on. Select one available action.',options)}});
  const action=response.answers.action.choice;assert.ok(Object.hasOwn(options,action),'Unavailable model action');return {action,source:'jev'};
 }
 const visits=feedback.coverage?.stateActionVisits??{},key=contextKey(feedback.current??{});
 const candidates=policy==='least_visited'?ids.filter(id=>(visits[`${key}/${id}`]??0)===Math.min(...ids.map(id=>visits[`${key}/${id}`]??0))):ids;
 return {action:candidates[Math.floor(rng()*candidates.length)],source:policy};
}
