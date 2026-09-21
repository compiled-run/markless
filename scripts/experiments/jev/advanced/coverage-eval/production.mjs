import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {patterns} from '../production-patterns.mjs';
import {randomFor} from '../common.mjs';
import {createJev} from '../../client.mjs';
import {chooseAction} from './policy.mjs';

const output='/tmp/jev-coverage';mkdirSync(output,{recursive:true});
const replay=process.argv.includes('--replay'),results=[];
const recorded=replay?JSON.parse(readFileSync(`${output}/production.json`)).results.filter(r=>r.policy==='jev'):null;
const api=replay?null:createJev({ledgerPath:`${output}/api.jsonl`,capUSD:1});
for(const policy of replay?['jev']:['random','least_visited','jev']){
 const remaining={...patterns},rng=randomFor(101),previous=[];
 for(let index=0;index<Object.keys(patterns).length;index++){
  const selected=replay?{action:recorded[index].pattern,source:'replay'}:await chooseAction({policy,options:remaining,rng,feedback:{current:{page:'production'},previous,untriedSchedules:Object.keys(remaining),goal:'Exercise distinct real loading conditions; compare browser errors and exact effects. Completed schedules cannot be selected again.'},ask:request=>api.ask(request,`coverage-production/${index}`)});
  if(!Object.hasOwn(remaining,selected.action))throw Error('Duplicate or unknown schedule');
  const child=spawn(process.execPath,['scripts/experiments/jev/advanced/production-navigation.mjs',`--coverage-pattern=${selected.action}`],{stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const status=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});
  writeFileSync(`${output}/production-${replay?'replay-':''}${policy}-${index}.log`,log);
  if(status!==0)throw Error(`Production collector failed: ${status}`);
  const result=JSON.parse(readFileSync(`${output}/production-single.json`)).results[0];
  if(result.pattern!==selected.action)throw Error('Stale production result');
  const entry={...result,policy,source:selected.source,permittedSchedules:Object.keys(remaining)};results.push(entry);
  previous.push({pattern:entry.pattern,conditionAchieved:entry.conditionAchieved,checks:entry.checks,errors:entry.errors,failure:entry.failure});
  delete remaining[selected.action];
  writeFileSync(`${output}/production${replay?'-replay':''}.json`,JSON.stringify({results},null,2)+'\n');
  console.log(JSON.stringify(previous.at(-1)));
 }
}
