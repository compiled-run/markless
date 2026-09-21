import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {contextKey} from './policy.mjs';

const unique=values=>[...new Set(values)];
const counts=values=>values.reduce((out,key)=>(out[key]=(out[key]??0)+1,out),{});
const navigation=s=>s.action.startsWith('nav_')||['back','forward','leave_workspace'].includes(s.action);
const recovered=s=>Boolean(s.recovery?.navigation);
export function workflowCompletions(run){
 const completed=[];
 for(const episode of run.episodes){
  let selection=null,opening=null;
  for(const [index,s] of episode.steps.entries()){
   const before=s.before.editor,after=s.after.editor;
   if(s.after.page!=='workspace'||!after?.outer||s.recovery?.stateDiscarded||recovered(s)){selection=null;opening=null;continue;}
   if(s.action==='choose_project'){
    selection=!s.actionError&&after.selected==='Beta'&&after.selections===before.selections+1?index:null;opening=null;
   }
   if(s.action==='open_inner'&&selection!==null&&after.inner&&after.selected==='Beta')opening=index;
   if(s.action==='confirm'&&opening!==null&&before.inner&&after.inner&&after.selected==='Beta'&&after.confirmed===before.confirmed+1){
    completed.push({startRoute:episode.startRoute,selection,opening,confirmation:index});selection=null;opening=null;
   }
  }
 }
 return completed;
}
export function summarizeRun(run){
 const steps=run.episodes.flatMap(e=>e.steps),chosen=steps.filter(s=>s.source!=='harness_single_choice'),transitions=chosen.filter(s=>navigation(s)&&s.before.page!==s.after.page);
 return {policy:run.policy,repeat:run.repeat,steps:steps.length,requiredStarts:run.episodes.length,observedRoutes:unique(steps.flatMap(s=>[s.before.page,s.after.page])),chosenNavigationAttempts:chosen.filter(navigation).length,chosenTransitionDestinations:unique(transitions.map(s=>s.after.page)),transitionsWithoutRecordedRecovery:transitions.filter(s=>!recovered(s)&&s.after.sameDocument&&!s.actionError).length,recoveredChosenTransitions:transitions.filter(recovered).length,distinctActions:unique(steps.map(s=>s.action)).length,actions:unique(steps.map(s=>s.action)),distinctRouteActions:unique(steps.map(s=>`${s.before.page}/${s.action}`)).length,distinctStateActions:unique(steps.map(s=>`${contextKey(s.before)}/${s.action}`)).length,policyChoices:chosen.length,forcedChoices:steps.length-chosen.length,noveltyInterventions:steps.filter(s=>s.intervention).length,stepsWithFailureExclusions:steps.filter(s=>Object.values(s.excluded??{}).includes('repeated_failure')).length,passingSteps:steps.filter(s=>!s.violations.length&&!s.errors?.length&&!s.actionError).length,violations:counts(steps.flatMap(s=>s.violations)),actionFailures:counts(steps.filter(s=>s.failureKind).map(s=>`${s.before.page}/${s.action}/${s.failureKind}`)),browserErrors:unique(steps.flatMap(s=>s.errors??[])),actionCounts:counts(steps.map(s=>s.action)),decisionMilliseconds:steps.reduce((sum,s)=>sum+(s.decisionMilliseconds??0),0),actionMilliseconds:steps.reduce((sum,s)=>sum+(s.actionMilliseconds??0),0)};
}

if(process.argv[1]?.endsWith('/metrics.mjs')){
 const root='/tmp/jev-coverage',read=name=>JSON.parse(readFileSync(`${root}/${name}.json`));
 const runs=read('journeys').runs;assert.equal(runs.length,9);for(const r of runs){assert.equal(r.episodes.length,4);for(const e of r.episodes)assert.equal(e.steps.length,12);}
 const summary={runs:runs.map(summarizeRun),selectionConfirmationWorkflows:runs.map(r=>({policy:r.policy,repeat:r.repeat,completed:workflowCompletions(r)}))};
 summary.policies=Object.fromEntries(['random','least_visited','jev'].map(policy=>{
  const subset=summary.runs.filter(r=>r.policy===policy),mean=key=>subset.reduce((n,r)=>n+r[key],0)/subset.length;
  return [policy,{runs:subset.length,decisions:subset.reduce((n,r)=>n+r.steps,0),meanDistinctActions:mean('distinctActions'),meanDistinctRouteActions:mean('distinctRouteActions'),meanDistinctStateActions:mean('distinctStateActions'),chosenNavigationAttempts:subset.reduce((n,r)=>n+r.chosenNavigationAttempts,0),forcedChoices:subset.reduce((n,r)=>n+r.forcedChoices,0),noveltyInterventions:subset.reduce((n,r)=>n+r.noveltyInterventions,0),stepsWithFailureExclusions:subset.reduce((n,r)=>n+r.stepsWithFailureExclusions,0),actions:unique(subset.flatMap(r=>r.actions)),browserErrors:unique(subset.flatMap(r=>r.browserErrors))}];
 }));
 if(existsSync(`${root}/production.json`)){
  const results=read('production').results;assert.equal(results.length,18);
  summary.production=results.map(({policy,pattern,source,conditionAchieved,checks,errors,failure})=>({policy,pattern,source,conditionAchieved,checks,errors,failure}));
 }
 const ledger=readFileSync(`${root}/api.jsonl`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 summary.api={attempts:ledger.filter(r=>r.kind==='start').length,successes:ledger.filter(r=>r.kind==='result').length,inputTokens:ledger.reduce((n,r)=>n+(r.response?.usage?.input_tokens??0),0),estimatedUSD:ledger.reduce((n,r)=>n+(r.costUSD??0),0)};
 writeFileSync(`${root}/metrics.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({policies:summary.policies,api:summary.api},null,2));
}
