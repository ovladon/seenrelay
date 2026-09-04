import fs from 'node:fs';
import { createHash } from 'node:crypto';

const SHA=/^sha256:[0-9a-f]{64}$/;
const POLICY=JSON.parse(fs.readFileSync(new URL('../research/neutral-task-admission-v1.json',import.meta.url),'utf8'));
const ALLOWED_WORKLOADS=new Set(Object.keys(POLICY.sample_floors));

function stable(v){
  if(v===null||typeof v==='string'||typeof v==='boolean') return JSON.stringify(v);
  if(typeof v==='number'){if(!Number.isFinite(v)) throw new TypeError('non-finite value'); return JSON.stringify(v);}
  if(Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if(v&&typeof v==='object') return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  throw new TypeError('unsupported value');
}
function fp(v){return `sha256:${createHash('sha256').update(stable(v)).digest('hex')}`;}
function requireSha(v,name){if(typeof v!=='string'||!SHA.test(v)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);return v;}
function evidenceArray(v,name){const a=Array.isArray(v)?v:[v]; if(!a.length) throw new TypeError(`${name} must be non-empty`); return a;}
function attemptsFrom(evidence,name){
  const out=[];
  for(let i=0;i<evidence.length;i++){
    const e=evidence[i];
    if(!e||typeof e!=='object'||Array.isArray(e)) throw new TypeError(`${name}[${i}] must be object`);
    if(!Array.isArray(e.normalized_attempts)||!e.normalized_attempts.length) throw new TypeError(`${name}[${i}].normalized_attempts required`);
    for(const a of e.normalized_attempts){
      if(!a||typeof a!=='object'||Array.isArray(a)) throw new TypeError('normalized attempt invalid');
      for(const key of ['attempt_coordinate','task_coordinate','implementation_coordinate','runtime_coordinate']) requireSha(a[key],key);
      if(typeof a.accepted_outcome!=='boolean') throw new TypeError('accepted_outcome invalid');
      if(!a.work||typeof a.work!=='object'||Array.isArray(a.work)) throw new TypeError('work invalid');
      out.push(a);
    }
  }
  return out;
}
function indexUnique(attempts,name){
  const m=new Map();
  for(const a of attempts){if(m.has(a.attempt_coordinate)) throw new TypeError(`${name} duplicate attempt_coordinate`);m.set(a.attempt_coordinate,a);} return m;
}
function floorFor(workloadId){if(!ALLOWED_WORKLOADS.has(workloadId)) throw new TypeError('unknown workloadId');return POLICY.sample_floors[workloadId];}
function summarizeFloor(attempts,workloadId){
  const floor=floorFor(workloadId); const taskCounts=new Map(); const implementations=new Set(); const runtimes=new Set();
  for(const a of attempts){taskCounts.set(a.task_coordinate,(taskCounts.get(a.task_coordinate)||0)+1); implementations.add(a.implementation_coordinate); runtimes.add(a.runtime_coordinate);}
  const blockers=[];
  if(attempts.length<floor.minimum_eligible_attempts) blockers.push('minimum_eligible_attempts_not_met');
  if(taskCounts.size!==floor.distinct_tasks) blockers.push('distinct_task_floor_not_met');
  if([...taskCounts.values()].some(n=>n<floor.minimum_attempts_per_task)) blockers.push('attempts_per_task_floor_not_met');
  if(runtimes.size!==1) blockers.push('runtime_coordinate_not_uniform');
  return Object.freeze({
    workload_id:workloadId,
    eligible_attempts:attempts.length,
    distinct_tasks:taskCounts.size,
    minimum_attempts_observed_per_task:Math.min(...taskCounts.values()),
    distinct_implementation_coordinates:implementations.size,
    distinct_runtime_coordinates:runtimes.size,
    sample_floor_met:blockers.length===0,
    blockers:Object.freeze(blockers),
  });
}

export function evaluateNeutralTaskEvidenceFloor(evidence,workloadId){
  const attempts=attemptsFrom(evidenceArray(evidence,'evidence'),'evidence');
  indexUnique(attempts,'evidence');
  const summary=summarizeFloor(attempts,workloadId);
  return Object.freeze({
    schema:'seenrelay-neutral-task-evidence-floor-v1',
    ...summary,
    evidence_class:'external_neutral_task_replay',
    primary_outcome:'work_per_correct_completion',
    optimizer_authorized:false,
    proof_fingerprint:fp({workload_id:workloadId,attempts:attempts.map(a=>({attempt_coordinate:a.attempt_coordinate,task_coordinate:a.task_coordinate,implementation_coordinate:a.implementation_coordinate,runtime_coordinate:a.runtime_coordinate,accepted_outcome:a.accepted_outcome})).sort((a,b)=>a.attempt_coordinate.localeCompare(b.attempt_coordinate))}),
  });
}

function comparableMetrics(baseline,candidate){
  const keys=new Set();
  for(const a of baseline) for(const k of Object.keys(a.work)) keys.add(k);
  for(const a of candidate) for(const k of Object.keys(a.work)) keys.add(k);
  const result={};
  const passed=baseline.filter(a=>a.accepted_outcome).length;
  for(const key of [...keys].sort()){
    let bTotal=0,cTotal=0,known=true;
    for(let i=0;i<baseline.length;i++){
      const b=baseline[i].work[key],c=candidate[i].work[key];
      if(b===null||b===undefined||c===null||c===undefined){known=false;break;}
      if(typeof b!=='number'||!Number.isFinite(b)||b<0||typeof c!=='number'||!Number.isFinite(c)||c<0) throw new TypeError(`metric ${key} invalid`);
      bTotal+=b;cTotal+=c;
    }
    if(!known||passed===0){result[key]=Object.freeze({fully_observed:false,baseline_per_correct:null,candidate_per_correct:null,improvement_percent:null});continue;}
    const bpc=bTotal/passed,cpc=cTotal/passed;
    const improvement=bpc===0?(cpc===0?0:null):((bpc-cpc)/bpc)*100;
    result[key]=Object.freeze({fully_observed:true,baseline_per_correct:bpc,candidate_per_correct:cpc,improvement_percent:improvement});
  }
  return Object.freeze(result);
}

export function compareNeutralTaskReplay(input){
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new TypeError('input must be object');
  const workloadId=input.workloadId; floorFor(workloadId);
  const counterfactualProofFingerprint=requireSha(input.counterfactualProofFingerprint,'counterfactualProofFingerprint');
  const decisionOverheadEvidenceFingerprint=requireSha(input.decisionOverheadEvidenceFingerprint,'decisionOverheadEvidenceFingerprint');
  const decisionPolicyFingerprint=requireSha(input.decisionPolicyFingerprint,'decisionPolicyFingerprint');
  if(input.candidateWorkIncludesDecisionOverhead!==true) throw new TypeError('candidate work must include decision overhead');
  const baseline=attemptsFrom(evidenceArray(input.baselineEvidence,'baselineEvidence'),'baselineEvidence');
  const candidate=attemptsFrom(evidenceArray(input.candidateEvidence,'candidateEvidence'),'candidateEvidence');
  const bIndex=indexUnique(baseline,'baseline'); const cIndex=indexUnique(candidate,'candidate');
  const bFloor=summarizeFloor(baseline,workloadId); const cFloor=summarizeFloor(candidate,workloadId);
  const blockers=[];
  if(!bFloor.sample_floor_met) blockers.push('baseline_sample_floor_not_met');
  if(!cFloor.sample_floor_met) blockers.push('candidate_sample_floor_not_met');
  if(bIndex.size!==cIndex.size||[...bIndex.keys()].some(k=>!cIndex.has(k))) blockers.push('attempt_coordinate_set_mismatch');

  const pairedB=[],pairedC=[];
  if(!blockers.includes('attempt_coordinate_set_mismatch')){
    for(const key of [...bIndex.keys()].sort()){
      const b=bIndex.get(key),c=cIndex.get(key);
      if(b.task_coordinate!==c.task_coordinate) blockers.push('task_coordinate_mismatch');
      if(b.implementation_coordinate!==c.implementation_coordinate) blockers.push('implementation_coordinate_mismatch');
      if(b.runtime_coordinate!==c.runtime_coordinate) blockers.push('runtime_coordinate_mismatch');
      if(b.accepted_outcome!==c.accepted_outcome) blockers.push('accepted_outcome_changed');
      pairedB.push(b);pairedC.push(c);
    }
  }
  const metrics=blockers.some(b=>['attempt_coordinate_set_mismatch','task_coordinate_mismatch','implementation_coordinate_mismatch','runtime_coordinate_mismatch','accepted_outcome_changed'].includes(b))?Object.freeze({}):comparableMetrics(pairedB,pairedC);
  const observed=Object.values(metrics).filter(m=>m.fully_observed&&m.improvement_percent!==null);
  const best=observed.length?Math.max(...observed.map(m=>m.improvement_percent)):null;
  const worst=observed.length?Math.min(...observed.map(m=>m.improvement_percent)):null;
  const maxRegression=POLICY.vector_admission.maximum_allowed_regression_percent_on_any_other_fully_observed_metric;
  const vectorCandidate=blockers.length===0&&best!==null&&best>=POLICY.vector_admission.candidate_minimum_improvement_percent&&worst>=-maxRegression;
  const strongSignal=blockers.length===0&&best!==null&&best>=POLICY.vector_admission.strong_signal_minimum_improvement_percent&&worst>=-maxRegression;

  let economicEvidence=false;
  let scalarMetric=null;
  if(input.scalarCostMetric!==undefined){
    scalarMetric=String(input.scalarCostMetric);
    requireSha(input.scalarCostPolicyFingerprint,'scalarCostPolicyFingerprint');
    const m=metrics[scalarMetric];
    economicEvidence=Boolean(blockers.length===0&&m&&m.fully_observed&&m.improvement_percent!==null&&m.improvement_percent>0);
  }

  return Object.freeze({
    schema:'seenrelay-neutral-task-replay-comparison-v1',
    workload_id:workloadId,
    sample_floor_met:bFloor.sample_floor_met&&cFloor.sample_floor_met,
    exact_attempt_pairing:blockers.includes('attempt_coordinate_set_mismatch')===false,
    accepted_outcome_preserved:blockers.includes('attempt_coordinate_set_mismatch')===false&&blockers.includes('task_coordinate_mismatch')===false&&blockers.includes('implementation_coordinate_mismatch')===false&&blockers.includes('runtime_coordinate_mismatch')===false&&blockers.includes('accepted_outcome_changed')===false,
    counterfactual_same_outcome_proof_fingerprint:counterfactualProofFingerprint,
    decision_overhead_evidence_fingerprint:decisionOverheadEvidenceFingerprint,
    decision_policy_fingerprint:decisionPolicyFingerprint,
    metrics,
    best_fully_observed_improvement_percent:best,
    worst_fully_observed_improvement_percent:worst,
    vector_candidate:vectorCandidate,
    strong_signal:strongSignal,
    scalar_cost_metric:scalarMetric,
    economic_value_proven:economicEvidence,
    blockers:Object.freeze([...new Set(blockers)]),
    attention_microkernel_authorized:false,
    active_optimizer_authorized:false,
    production_change_authorized:false,
    proof_fingerprint:fp({workload_id:workloadId,counterfactualProofFingerprint,decisionOverheadEvidenceFingerprint,decisionPolicyFingerprint,metrics,blockers:[...new Set(blockers)]}),
  });
}

export function evaluateNeutralTaskProgramAdmission(replayInputs){
  if(!Array.isArray(replayInputs)||replayInputs.length===0) throw new TypeError('replayInputs must be non-empty array');
  const comparisons=replayInputs.map((input,index)=>{
    try{return compareNeutralTaskReplay(input);}
    catch(error){throw new TypeError(`replayInputs[${index}] invalid: ${error instanceof Error?error.message:String(error)}`);}
  });
  const candidateByWorkload=new Map();
  const policyClasses=new Map();
  for(const comparison of comparisons){
    const admitted=Boolean(
      comparison.sample_floor_met&&
      comparison.exact_attempt_pairing&&
      comparison.accepted_outcome_preserved&&
      comparison.vector_candidate&&
      comparison.blockers.length===0
    );
    if(admitted){
      candidateByWorkload.set(comparison.workload_id,true);
      const set=policyClasses.get(comparison.decision_policy_fingerprint)||new Set();
      set.add(comparison.workload_id);
      policyClasses.set(comparison.decision_policy_fingerprint,set);
    }else if(!candidateByWorkload.has(comparison.workload_id)){
      candidateByWorkload.set(comparison.workload_id,false);
    }
  }
  const candidateClasses=[...candidateByWorkload.entries()].filter(([,admitted])=>admitted).map(([id])=>id).sort();
  const strongClasses=[...new Set(comparisons.filter(c=>c.strong_signal&&c.blockers.length===0).map(c=>c.workload_id))].sort();
  const required=POLICY.program_admission.minimum_independent_vector_candidate_classes;
  const sharedPolicyEntries=[...policyClasses.entries()].map(([policy,set])=>({policy,classes:[...set].sort()})).sort((a,b)=>b.classes.length-a.classes.length||a.policy.localeCompare(b.policy));
  const qualifyingPolicy=sharedPolicyEntries.find(x=>x.classes.length>=required)||null;
  const researchCandidate=Boolean(qualifyingPolicy);
  return Object.freeze({
    schema:'seenrelay-neutral-task-program-admission-v1',
    independent_workload_classes_evaluated:candidateByWorkload.size,
    independent_vector_candidate_classes:candidateClasses.length,
    vector_candidate_workload_ids:Object.freeze(candidateClasses),
    strong_signal_workload_ids:Object.freeze(strongClasses),
    required_independent_vector_candidate_classes:required,
    shared_decision_policy_required:true,
    qualifying_decision_policy_fingerprint:qualifyingPolicy?qualifyingPolicy.policy:null,
    qualifying_policy_workload_ids:Object.freeze(qualifyingPolicy?qualifyingPolicy.classes:[]),
    attention_microkernel_research_prototype_candidate:researchCandidate,
    attention_microkernel_authorized:false,
    active_optimizer_authorized:false,
    production_change_authorized:false,
    generalization_authorized:false,
    proof_fingerprint:fp({
      comparisons:comparisons.map(c=>({workload_id:c.workload_id,proof_fingerprint:c.proof_fingerprint,vector_candidate:c.vector_candidate,strong_signal:c.strong_signal,blockers:c.blockers})).sort((a,b)=>a.workload_id.localeCompare(b.workload_id)||a.proof_fingerprint.localeCompare(b.proof_fingerprint)),
      candidateClasses,
      sharedPolicyEntries,
      required,
    }),
  });
}
