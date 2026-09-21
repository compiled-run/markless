import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {patterns} from '../production-patterns.mjs';

const root='/tmp/jev-coverage',read=name=>JSON.parse(readFileSync(`${root}/${name}.json`));
const runs=read('journeys').runs,production=read('production').results;
assert.equal(new Set(runs.map(r=>`${r.policy}/${r.repeat}`)).size,9);
const ledger=readFileSync(`${root}/api.jsonl`,'utf8').trim().split('\n').map(JSON.parse),starts=ledger.filter(r=>r.kind==='start'),results=ledger.filter(r=>r.kind==='result');
assert.equal(starts.length,results.length);assert.equal(ledger.length,starts.length+results.length);
let modelDecisions=0,steps=0;
for(const run of runs){
 assert.deepEqual(run.episodes.map(e=>e.startRoute).sort(),['home','slow','todos','workspace']);
 const failed={};
 for(const episode of run.episodes){
  assert.equal(episode.steps.length,12);
  for(const step of episode.steps){
   steps++;assert.ok(Object.hasOwn(step.permittedMenu,step.action));
   const key=`${step.before.page}/${step.action}/${Boolean(step.before.editor?.inner)}`;
   assert.ok((failed[key]??0)<2,`Repeated suppressed failure ${key}`);
   if(step.failureKind)failed[key]=(failed[key]??0)+1;
   if(step.source==='harness_single_choice')assert.equal(Object.keys(step.permittedMenu).length,1);
   if(step.source==='jev'){
    modelDecisions++;
    const request=starts.find(r=>r.tag===`coverage/${run.repeat}/${episode.startRoute}/${step.index}`);assert.ok(request);
    assert.deepEqual(request.request.questions.action.criteria,step.permittedMenu);
    assert.equal(results.find(r=>r.id===request.id).response.answers.action.choice,step.action);
    assert.ok(Array.isArray(request.request.state.knownFailures));
    if(step.recovery?.stateDiscarded)assert.equal(request.request.state.recovery.stateDiscarded,true);
   }
  }
 }
}
assert.equal(steps,432);assert.equal(production.length,18);
for(const policy of ['random','least_visited','jev']){
 const selected=production.filter(r=>r.policy===policy);assert.deepEqual(selected.map(r=>r.pattern).sort(),Object.keys(patterns).sort());
 for(const r of selected){assert.equal(r.conditionAchieved,true,`Timing condition missing: ${policy}/${r.pattern}`);if(r.source==='jev')modelDecisions++;}
}
assert.equal(starts.length,modelDecisions);
const replay=read('journeys-replay').runs;assert.equal(replay.length,3);
const project=s=>({action:s.action,before:{page:s.before.page,todos:s.before.todos,editor:s.before.editor,count:s.before.count},after:{page:s.after.page,todos:s.after.todos,editor:s.after.editor,count:s.after.count},violations:s.violations,failureKind:s.failureKind});
const replayComparison=[];
for(const r of replay){
 const original=runs.find(a=>a.policy===r.policy&&a.repeat===r.repeat);assert.ok(original);assert.equal(r.episodes.length,4);
 for(const episode of r.episodes){
  const before=original.episodes.find(e=>e.startRoute===episode.startRoute);assert.equal(episode.steps.length,12);
  replayComparison.push({policy:r.policy,startRoute:episode.startRoute,steps:12,semanticStateAndAssertionMatches:episode.steps.filter((s,i)=>JSON.stringify(project(s))===JSON.stringify(project(before.steps[i]))).length,browserErrorMatches:episode.steps.filter((s,i)=>JSON.stringify(s.errors)===JSON.stringify(before.steps[i].errors)).length});
 }
}
const productionReplay=read('production-replay').results;assert.equal(productionReplay.length,6);
const productionComparison=productionReplay.map(r=>{
 const original=production.find(a=>a.policy==='jev'&&a.pattern===r.pattern);assert.ok(original);
 const select=x=>({conditionAchieved:x.conditionAchieved,checks:x.checks,errors:x.errors,failure:x.failure});
 return {pattern:r.pattern,matched:JSON.stringify(select(r))===JSON.stringify(select(original))};
});
const result={primarySteps:steps,modelDecisions,successfulAPIResults:results.length,productionConditionsAchieved:18,repeatedFailureLimitVerified:true,modelMenusAndChoicesVerified:true,replayComparison,productionComparison};
writeFileSync(`${root}/audit.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
