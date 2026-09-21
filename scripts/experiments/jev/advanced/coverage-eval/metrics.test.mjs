import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRun,workflowCompletions} from './metrics.mjs';

test('required starts and recovered navigation cannot count as unrecovered model navigation',()=>{
 const before={page:'home',todos:[],count:0};
 const step={before,after:{...before,page:'todos'},action:'nav_todos',source:'jev',violations:['spa_route_stalled'],errors:[],recovery:{navigation:{kind:'document_reload_after_stalled_spa'}},excluded:{},decisionMilliseconds:1,actionMilliseconds:2};
 const r=summarizeRun({policy:'jev',repeat:0,episodes:[{startRoute:'home',steps:[step]},{startRoute:'workspace',steps:[{...step,source:'harness_single_choice',before:{...before,page:'workspace'}}]}]});
 assert.equal(r.requiredStarts,2);assert.equal(r.chosenNavigationAttempts,1);assert.equal(r.transitionsWithoutRecordedRecovery,0);assert.equal(r.recoveredChosenTransitions,1);assert.equal(r.forcedChoices,1);
});
test('browser exceptions prevent a passing-step claim even with no assertion label',()=>{
 const state={page:'home',todos:[],count:0};
 const r=summarizeRun({policy:'random',repeat:0,episodes:[{startRoute:'home',steps:[{before:state,after:state,action:'increment',source:'random',violations:[],errors:['late stream error'],excluded:{},decisionMilliseconds:0,actionMilliseconds:1}]}]});
 assert.equal(r.passingSteps,0);assert.deepEqual(r.browserErrors,['late stream error']);
});
test('workflow completion requires observed selection, nested opening and confirmation effect',()=>{
 const editor={outer:true,inner:false,selected:'',selections:0,confirmed:0};
 const state=editor=>({page:'workspace',editor});
 const selected={...editor,selected:'Beta',selections:1},opened={...selected,inner:true};
 const steps=[{action:'choose_project',before:state(editor),after:state(selected)},{action:'open_inner',before:state(selected),after:state(opened)},{action:'confirm',before:state(opened),after:state(opened)}];
 assert.equal(workflowCompletions({episodes:[{steps}]}).length,0);
 steps[2].after=state({...opened,confirmed:1});assert.equal(workflowCompletions({episodes:[{steps}]}).length,1);
 steps[1].recovery={stateDiscarded:true};assert.equal(workflowCompletions({episodes:[{steps}]}).length,0);
});
