import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { runStandardsShadowBenchmark } from './standards-shadow-benchmark.mjs';
import { evaluateStandardsShadowGateV3 } from './standards-shadow-evidence-gate-v3.mjs';

const CHECK_MODES = Object.freeze(['UNKNOWN','SAME_OBSERVED','CHANGED_OBSERVED','CONTESTED','STALE','CHECK_ERROR']);
const SOURCE_URLS = Object.freeze([
  'https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification?ref=main',
  'https://registry.npmjs.org/%40modelcontextprotocol%2Fserver/latest',
  'https://api.github.com/repos/a2aproject/A2A/releases/latest',
  'https://api.github.com/repos/open-telemetry/semantic-conventions/releases/latest'
]);
const SOURCE_BODIES = new Map([
  [SOURCE_URLS[0],[{name:'2026-03-01'},{name:'2026-07-28'}]],
  [SOURCE_URLS[1],{version:'2.0.0'}],
  [SOURCE_URLS[2],{tag_name:'v1.0.0'}],
  [SOURCE_URLS[3],{tag_name:'v1.44.0'}]
]);
const STANDARDS_SOURCE = `export const standardsPosture={mcp:{implemented:'2026-07-28',sdk:'@modelcontextprotocol/server@2.0.0'},a2a:{tracked:'1.0.0'},observability:{opentelemetry_semconv_tracked:'1.44.0'}};`;

function stable(v){
  if(v===null||typeof v==='string'||typeof v==='boolean') return JSON.stringify(v);
  if(typeof v==='number'){ if(!Number.isFinite(v)) throw new TypeError('non-finite proof value'); return JSON.stringify(v); }
  if(Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if(v&&typeof v==='object') return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  throw new TypeError('unsupported proof value');
}
const fingerprint=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex')}`;
function reply(body,{status=200,etag=null}={}){
  const headers=new Headers();
  if(status!==304) headers.set('content-type','application/json');
  if(etag) headers.set('etag',etag);
  return new Response(status===304?null:JSON.stringify(body),{status,headers});
}
function priorState(enabled){
  if(!enabled) return null;
  const entries={};
  for(const [i,k] of ['mcp','mcp_sdk','a2a','otel'].entries()) entries[k]={validator:{kind:'etag',value:`"prior-${i}"`},value_fingerprint:'0'.repeat(64)};
  return {schema_version:1,workload_id:'standards-watch-daily-v1',entries};
}
function priorLedger(){
  return {workload_id:'standards-watch-daily-v1',workload_class:'structured_source_reads',records:[],control_evidence:{validator_available_calls:0,conditional_available_calls:0,conditional_attempts:0,conditional_304_confirmations:0}};
}
function requestEnvelope(url,options={}){
  const h=new Headers(options.headers);
  return Object.freeze({url,method:options.method??'GET',headers:Object.freeze(Object.fromEntries([...h.entries()].sort(([a],[b])=>a.localeCompare(b)))),option_keys:Object.freeze(Object.keys(options).sort()),signal_present:options.signal!==undefined,signal_aborted_at_call:options.signal?.aborted===true});
}
function validationEnvelope(r){
  return Object.freeze({source_native_conditional_available:r.source_native_conditional_available,source_native_conditional_attempted:r.source_native_conditional_attempted,observe_after_baseline:r.observe_after_baseline,baseline_cost:r.baseline_cost,observe_ms:r.observe_ms,observe_cost:r.observe_cost});
}
async function scenario({checkMode,withPriorValidator,conditionalResponse}){
  const requests=[]; let observeCalls=0;
  const fetchImpl=async(url,options={})=>{
    const target=String(url);
    if(target==='https://relay.invalid/v1/check'){
      if(checkMode==='CHECK_ERROR') throw new Error('synthetic CHECK transport failure');
      return reply({status:checkMode});
    }
    if(target==='https://relay.invalid/v1/observe'){ observeCalls+=1; throw new Error('OBSERVE must not be called'); }
    if(!SOURCE_BODIES.has(target)) throw new Error(`unexpected source ${target}`);
    const envelope=requestEnvelope(target,options); requests.push(envelope);
    const hasPrior=typeof envelope.headers['if-none-match']==='string';
    if(hasPrior!==withPriorValidator) throw new Error('source-native conditional availability mismatch');
    if(conditionalResponse==='304'){
      if(!withPriorValidator) throw new Error('304 scenario requires prior validator');
      return reply(null,{status:304,etag:`"current-${SOURCE_URLS.indexOf(target)}"`});
    }
    return reply(SOURCE_BODIES.get(target),{etag:`"current-${SOURCE_URLS.indexOf(target)}"`});
  };
  const result=await runStandardsShadowBenchmark({fetchImpl,origin:'https://relay.invalid',standardsSource:STANDARDS_SOURCE,previousState:priorState(withPriorValidator),previousLedger:withPriorValidator?priorLedger():null});
  return Object.freeze({requests,observeCalls,stateEntries:result.state.entries,validationRecords:result.input.records.map(validationEnvelope),conditionalAvailable:result.summary.source_native_conditional_available_count,conditionalAttempts:result.summary.source_native_conditional_attempt_count});
}
async function verifyBehavior(){
  const cases=[];
  for(const mode of [{withPriorValidator:false,conditionalResponse:'200'},{withPriorValidator:true,conditionalResponse:'200'},{withPriorValidator:true,conditionalResponse:'304'}]){
    const reference=await scenario({checkMode:'UNKNOWN',...mode});
    if(reference.requests.length!==4||reference.observeCalls!==0) throw new Error('reference did not execute four authoritative source requests');
    for(const checkMode of CHECK_MODES){
      const candidate=checkMode==='UNKNOWN'?reference:await scenario({checkMode,...mode});
      if(stable(candidate.requests)!==stable(reference.requests)) throw new Error(`authoritative request changed for ${checkMode}`);
      if(stable(candidate.stateEntries)!==stable(reference.stateEntries)) throw new Error(`authoritative state changed for ${checkMode}`);
      if(stable(candidate.validationRecords)!==stable(reference.validationRecords)) throw new Error(`validation record changed for ${checkMode}`);
      if(candidate.observeCalls!==0) throw new Error(`OBSERVE called for ${checkMode}`);
      if(candidate.conditionalAvailable!==reference.conditionalAvailable||candidate.conditionalAttempts!==reference.conditionalAttempts) throw new Error(`native control evidence changed for ${checkMode}`);
      cases.push(Object.freeze({check_mode:checkMode,prior_validator:mode.withPriorValidator,conditional_response:mode.conditionalResponse,authoritative_request_fingerprint:fingerprint(candidate.requests),authoritative_state_fingerprint:fingerprint(candidate.stateEntries)}));
    }
  }
  return Object.freeze(cases);
}
async function verifySequentiality(){
  const cases=[];
  for(const checkMode of CHECK_MODES){
    const events=[]; let checkInFlight=false,violation=false,checkIndex=0,sourceIndex=0;
    const fetchImpl=async(url)=>{
      const target=String(url);
      if(target==='https://relay.invalid/v1/check'){
        const i=checkIndex++;
        if(checkInFlight) throw new Error('overlapping CHECK calls outside reviewed workload');
        checkInFlight=true; events.push(`check:${i}:start`); await new Promise(r=>setImmediate(r)); events.push(`check:${i}:settled`); checkInFlight=false;
        if(checkMode==='CHECK_ERROR') throw new Error('synthetic delayed CHECK failure');
        return reply({status:checkMode});
      }
      if(target==='https://relay.invalid/v1/observe') throw new Error('OBSERVE must not be called');
      if(!SOURCE_BODIES.has(target)) throw new Error(`unexpected source ${target}`);
      if(checkInFlight) violation=true;
      events.push(`source:${sourceIndex++}:start`);
      return reply(SOURCE_BODIES.get(target),{etag:`"seq-${sourceIndex}"`});
    };
    await runStandardsShadowBenchmark({fetchImpl,origin:'https://relay.invalid',standardsSource:STANDARDS_SOURCE});
    if(violation) throw new Error(`source validation started before CHECK settled for ${checkMode}`);
    if(checkIndex!==4||sourceIndex!==4) throw new Error(`unexpected CHECK/source count for ${checkMode}`);
    for(let i=0;i<4;i++){
      const start=events.indexOf(`check:${i}:start`),settled=events.indexOf(`check:${i}:settled`),source=events.indexOf(`source:${i}:start`);
      if(!(start>=0&&start<settled&&settled<source)) throw new Error(`CHECK/source order failed for ${checkMode} pair ${i}`);
    }
    cases.push(Object.freeze({check_mode:checkMode,pair_count:4,event_fingerprint:fingerprint(events)}));
  }
  return Object.freeze(cases);
}
async function implementationEvidence(){
  const files=[
    ['scripts/standards-shadow-execution-proof-v1.mjs',new URL('./standards-shadow-execution-proof-v1.mjs',import.meta.url)],
    ['scripts/standards-shadow-evidence-gate-v3.mjs',new URL('./standards-shadow-evidence-gate-v3.mjs',import.meta.url)],
    ['scripts/standards-shadow-benchmark.mjs',new URL('./standards-shadow-benchmark.mjs',import.meta.url)],
    ['clients/typescript/dist/shadow-proof.js',new URL('../clients/typescript/dist/shadow-proof.js',import.meta.url)],
    ['clients/typescript/dist/seenrelay.js',new URL('../clients/typescript/dist/seenrelay.js',import.meta.url)]
  ];
  const out=[];
  for(const [file,url] of files){ const bytes=await fs.readFile(url); out.push(Object.freeze({file,sha256:`sha256:${createHash('sha256').update(bytes).digest('hex')}`})); }
  return Object.freeze(out);
}
export async function verifyStandardsShadowExecutionContractV1(){
  if(arguments.length!==0) throw new TypeError('execution verifier accepts no injected runner or options');
  const behavior_cases=await verifyBehavior(),sequentiality_cases=await verifySequentiality(),implementation_files=await implementationEvidence();
  const core=Object.freeze({schema:'seenrelay-standards-shadow-execution-proof-v1',workload_id:'standards-watch-daily-v1',behavior_scope:'authoritative-source-request-and-validation-state-independent-of-check-result-or-check-transport-failure',sequentiality_scope:'authoritative-source-validation-does-not-start-before-check-settles',behavior_cases,sequentiality_cases,implementation_files,behavior_equivalence_verified_by_harness:true,sequentiality_verified_by_harness:true,validation_suppression_observed:false,observe_requests_observed:0,literal_return_value_identity_claimed:false,accepted_validation_policy_preserved:true,temporal_source_value_identity_claimed:false,production_behavior_change_authorized:false,optimizer_authorized:false});
  return Object.freeze({...core,proof_fingerprint:fingerprint(core)});
}
export async function evaluateStandardsShadowGateV3Verified(input,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)) throw new TypeError('options must be an object');
  const proof=await verifyStandardsShadowExecutionContractV1();
  const base=evaluateStandardsShadowGateV3(input,{benchmarkEvidenceFingerprint:options.benchmarkEvidenceFingerprint,implementationEvidenceFingerprint:proof.proof_fingerprint,behaviorProofFingerprint:proof.proof_fingerprint,sequentialityProofFingerprint:proof.proof_fingerprint,lineageBundles:options.lineageBundles});
  const removed=new Set(['behavior_proof_not_verified_by_harness','sequentiality_proof_not_verified_by_harness']);
  const blockers=base.gate_b.admission_blockers.filter(x=>!removed.has(x));
  const ready=base.sample_type==='natural_workload'&&base.gate_a.pass===true&&base.gate_b.preliminary_sample_floor_met===true&&base.gate_b.positive_conditional_headroom===true&&base.gate_b.above_marginal_floor===true&&blockers.length===0;
  return Object.freeze({...base,schema:'seenrelay-standards-shadow-evidence-gate-v3-verified-execution-v1',evidence:Object.freeze({...base.evidence,implementation_evidence_fingerprint:proof.proof_fingerprint,behavior_proof_fingerprint:proof.proof_fingerprint,sequentiality_proof_fingerprint:proof.proof_fingerprint,behavior_proof_verified_by_harness:true,sequentiality_proof_verified_by_harness:true,execution_contract_proof_fingerprint:proof.proof_fingerprint}),gate_b:Object.freeze({...base.gate_b,admission_blockers:Object.freeze(blockers),workload_evidence_ready:ready,global_gate_pass:false}),execution_contract:proof,interpretation:Object.freeze({...base.interpretation,shadow_check_bypass_supported_for_this_workload:false,conditional_bypass_evidence_ready_for_this_workload:ready,optimizer_authorized:false,attention_microkernel_prototype_authorized:false,generalization_authorized:false})});
}
