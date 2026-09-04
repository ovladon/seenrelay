import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateNeutralTaskEvidenceFloor, compareNeutralTaskReplay, evaluateNeutralTaskProgramAdmission } from '../scripts/neutral-task-evidence-gate-v1.mjs';
const H=c=>`sha256:${c.repeat(64)}`;
function coord(prefix,n){return `sha256:${(prefix+n.toString(16).padStart(8,'0')).padEnd(64,'0').slice(0,64)}`;}
function evidence(tasks,perTask,workFn=()=>({duration_ms:100,tokens:100,cost_usd:null}),outcomeFn=()=>true,runtime=coord('f',1)){
  const attempts=[];let n=0;
  for(let t=0;t<tasks;t++)for(let j=0;j<perTask;j++,n++)attempts.push({attempt_coordinate:coord('a',n),task_coordinate:coord('b',t),implementation_coordinate:coord('9',1),runtime_coordinate:runtime,accepted_outcome:outcomeFn(t,j),work:workFn(t,j)});
  return {normalized_attempts:attempts};
}
function candidateFrom(base,scale=.6){return {normalized_attempts:base.normalized_attempts.map(a=>({...a,work:Object.fromEntries(Object.entries(a.work).map(([k,v])=>[k,typeof v==='number'?v*scale:v]))}))};}

test('MCP floor requires 9 tasks x 3 and one runtime coordinate',()=>{
  let out=evaluateNeutralTaskEvidenceFloor(evidence(9,3),'mcp-use-evals-v2'); assert.equal(out.sample_floor_met,true); assert.equal(out.eligible_attempts,27);
  out=evaluateNeutralTaskEvidenceFloor(evidence(8,3),'mcp-use-evals-v2'); assert.equal(out.sample_floor_met,false); assert.ok(out.blockers.includes('minimum_eligible_attempts_not_met'));
  const mixed=evidence(9,3); mixed.normalized_attempts[0]={...mixed.normalized_attempts[0],runtime_coordinate:coord('e',2)};
  out=evaluateNeutralTaskEvidenceFloor(mixed,'mcp-use-evals-v2'); assert.equal(out.sample_floor_met,false); assert.ok(out.blockers.includes('runtime_coordinate_not_uniform'));
});

test('implementation drift is separate from logical task identity at the evidence floor',()=>{
  const e=evidence(9,3);
  e.normalized_attempts[0]={...e.normalized_attempts[0],implementation_coordinate:coord('9',2)};
  const out=evaluateNeutralTaskEvidenceFloor(e,'mcp-use-evals-v2');
  assert.equal(out.distinct_tasks,9);
  assert.equal(out.sample_floor_met,true);
});

test('coding and browser floors are fixed at 10 tasks x 3',()=>{
  assert.equal(evaluateNeutralTaskEvidenceFloor(evidence(10,3),'agentarena-coding-v1').sample_floor_met,true);
  assert.equal(evaluateNeutralTaskEvidenceFloor(evidence(10,3),'browsergym-webarena-verified-v1').sample_floor_met,true);
});

test('exact replay with 40% reduction and no regressions becomes vector candidate, not active optimizer',()=>{
  const b=evidence(9,3); const c=candidateFrom(b,.6);
  const out=compareNeutralTaskReplay({workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true});
  assert.equal(out.sample_floor_met,true); assert.equal(out.accepted_outcome_preserved,true); assert.equal(out.vector_candidate,true); assert.equal(out.strong_signal,false); assert.equal(out.active_optimizer_authorized,false); assert.equal(out.economic_value_proven,false);
  assert.ok(out.metrics.duration_ms.improvement_percent>39.9);
});

test('50% or greater becomes strong signal but still not product authorization',()=>{
  const b=evidence(9,3); const c=candidateFrom(b,.5);
  const out=compareNeutralTaskReplay({workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true});
  assert.equal(out.strong_signal,true); assert.equal(out.attention_microkernel_authorized,false); assert.equal(out.production_change_authorized,false);
});

test('one metric improving 40% cannot hide another fully observed metric regressing more than 5%',()=>{
  const b=evidence(9,3); const c={normalized_attempts:b.normalized_attempts.map(a=>({...a,work:{duration_ms:a.work.duration_ms*.6,tokens:a.work.tokens*1.06,cost_usd:null}}))};
  const out=compareNeutralTaskReplay({workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true});
  assert.equal(out.vector_candidate,false); assert.ok(out.worst_fully_observed_improvement_percent < -5);
});

test('changed outcome, task, runtime, or attempt set blocks headroom admission',()=>{
  const b=evidence(9,3);
  for(const mutate of [
    c=>{c.normalized_attempts[0]={...c.normalized_attempts[0],accepted_outcome:false};},
    c=>{c.normalized_attempts[0]={...c.normalized_attempts[0],task_coordinate:coord('c',99)};},
    c=>{c.normalized_attempts[0]={...c.normalized_attempts[0],implementation_coordinate:coord('9',99)};},
    c=>{c.normalized_attempts[0]={...c.normalized_attempts[0],runtime_coordinate:coord('d',99)};},
    c=>{c.normalized_attempts.pop();},
  ]){
    const c=candidateFrom(b,.5); mutate(c);
    const out=compareNeutralTaskReplay({workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true});
    assert.equal(out.vector_candidate,false); assert.ok(out.blockers.length>0);
  }
});

test('unknown metrics stay unknown and cannot create a fake regression or improvement',()=>{
  const b=evidence(9,3,()=>({duration_ms:100,tokens:null,cost_usd:null})); const c=candidateFrom(b,.5);
  const out=compareNeutralTaskReplay({workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true});
  assert.equal(out.metrics.tokens.fully_observed,false); assert.equal(out.metrics.tokens.improvement_percent,null); assert.equal(out.vector_candidate,true);
});

test('economic evidence requires an explicit scalar metric and reproducible policy fingerprint',()=>{
  const b=evidence(9,3,()=>({duration_ms:100,tokens:100,cost_usd:2})); const c=candidateFrom(b,.8);
  assert.throws(()=>compareNeutralTaskReplay({workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true,scalarCostMetric:'cost_usd'}),/scalarCostPolicyFingerprint/);
  const out=compareNeutralTaskReplay({workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true,scalarCostMetric:'cost_usd',scalarCostPolicyFingerprint:H('3')});
  assert.equal(out.economic_value_proven,true);
});

test('decision overhead must be included rather than subtracted off-book',()=>{
  const b=evidence(9,3),c=candidateFrom(b,.5);
  assert.throws(()=>compareNeutralTaskReplay({workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:false}),/decision overhead/);
});

test('admission policy itself is frozen before headroom measurement',()=>{
  const policy=JSON.parse(fs.readFileSync(new URL('../research/neutral-task-admission-v1.json',import.meta.url),'utf8'));
  assert.equal(policy.frozen_before_headroom_measurement,true); assert.equal(policy.vector_admission.candidate_minimum_improvement_percent,30); assert.equal(policy.vector_admission.strong_signal_minimum_improvement_percent,50); assert.equal(policy.program_admission.minimum_independent_vector_candidate_classes,2); assert.equal(policy.program_admission.shared_decision_policy_fingerprint_required,true); assert.equal(policy.program_admission.active_optimizer_authorized,false);
});

test('program admission requires two independent workload classes, not two runs of one class',()=>{
  const b=evidence(9,3),c=candidateFrom(b,.6);
  const replay={workloadId:'mcp-use-evals-v2',baselineEvidence:b,candidateEvidence:c,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true};
  const out=evaluateNeutralTaskProgramAdmission([replay,{...replay,counterfactualProofFingerprint:H('3')}]);
  assert.equal(out.independent_vector_candidate_classes,1);
  assert.equal(out.attention_microkernel_research_prototype_candidate,false);
  assert.equal(out.active_optimizer_authorized,false);
});

test('two independent vector-candidate classes create only a research prototype candidate',()=>{
  const mb=evidence(9,3),mc=candidateFrom(mb,.6);
  const cb=evidence(10,3,()=>({duration_ms:200,tokens:500,cost_usd:null}),()=>true,coord('e',1));
  const cc=candidateFrom(cb,.6);
  const out=evaluateNeutralTaskProgramAdmission([
    {workloadId:'mcp-use-evals-v2',baselineEvidence:mb,candidateEvidence:mc,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true},
    {workloadId:'agentarena-coding-v1',baselineEvidence:cb,candidateEvidence:cc,counterfactualProofFingerprint:H('3'),decisionOverheadEvidenceFingerprint:H('4'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true},
  ]);
  assert.equal(out.independent_vector_candidate_classes,2);
  assert.equal(out.attention_microkernel_research_prototype_candidate,true);
  assert.equal(out.attention_microkernel_authorized,false);
  assert.equal(out.production_change_authorized,false);
  assert.equal(out.generalization_authorized,false);
});

test('a second class with a fully observed regression above the cap does not satisfy program admission',()=>{
  const mb=evidence(9,3),mc=candidateFrom(mb,.6);
  const bb=evidence(10,3,()=>({duration_ms:100,browser_actions:10,cost_usd:null}),()=>true,coord('d',1));
  const bc={normalized_attempts:bb.normalized_attempts.map(a=>({...a,work:{duration_ms:60,browser_actions:10.6,cost_usd:null}}))};
  const out=evaluateNeutralTaskProgramAdmission([
    {workloadId:'mcp-use-evals-v2',baselineEvidence:mb,candidateEvidence:mc,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true},
    {workloadId:'browsergym-webarena-verified-v1',baselineEvidence:bb,candidateEvidence:bc,counterfactualProofFingerprint:H('3'),decisionOverheadEvidenceFingerprint:H('4'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true},
  ]);
  assert.equal(out.independent_vector_candidate_classes,1);
  assert.equal(out.attention_microkernel_research_prototype_candidate,false);
});

test('two candidate classes under different decision policies do not justify a shared kernel prototype',()=>{
  const mb=evidence(9,3),mc=candidateFrom(mb,.6);
  const cb=evidence(10,3,()=>({duration_ms:200,tokens:500,cost_usd:null}),()=>true,coord('e',1));
  const cc=candidateFrom(cb,.6);
  const out=evaluateNeutralTaskProgramAdmission([
    {workloadId:'mcp-use-evals-v2',baselineEvidence:mb,candidateEvidence:mc,counterfactualProofFingerprint:H('1'),decisionOverheadEvidenceFingerprint:H('2'),decisionPolicyFingerprint:H('5'),candidateWorkIncludesDecisionOverhead:true},
    {workloadId:'agentarena-coding-v1',baselineEvidence:cb,candidateEvidence:cc,counterfactualProofFingerprint:H('3'),decisionOverheadEvidenceFingerprint:H('4'),decisionPolicyFingerprint:H('6'),candidateWorkIncludesDecisionOverhead:true},
  ]);
  assert.equal(out.independent_vector_candidate_classes,2);
  assert.equal(out.qualifying_decision_policy_fingerprint,null);
  assert.equal(out.attention_microkernel_research_prototype_candidate,false);
});
