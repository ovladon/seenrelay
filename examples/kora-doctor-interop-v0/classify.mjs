// Local, advisory-only comparator for synthetic AUDR 1.0.0 with optional sr.* labels.
// This is NOT the production SeenRelay decision engine and never authorizes skipping.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const str=x=>typeof x==='string'&&x.length>0;
const hash=x=>str(x)&&/^sha256:[0-9a-f]{64}$/.test(x);
const label=(r,k)=>r?.attribution?.labels?.[k];
const ms=r=>Date.parse(r?.timing?.event_time||'');
const same=(a,b,key)=>label(a,key)===label(b,key);
function decide(a,b){
  const no=(status,reason)=>({status,reason,auto_reuse_authorized:false,verified_saved_usd:null});
  if(!a||!b||!Number.isFinite(ms(a))||!Number.isFinite(ms(b))||ms(a)>=ms(b))
    return no('INSUFFICIENT_EVIDENCE','INVALID_EVENT_ORDER');
  if(a.run?.run_id!==b.run?.run_id)return no('INSUFFICIENT_EVIDENCE','RUN_MISMATCH');
  if(['provider','type','name','operation'].some(k=>a.resource?.[k]!==b.resource?.[k]))
    return no('NOT_DUPLICATE','TOOL_IDENTITY_DIFFERENT');
  if(!hash(label(a,'tool_args_hash'))||!hash(label(b,'tool_args_hash')))
    return no('INSUFFICIENT_EVIDENCE','ARG_FINGERPRINT_UNAVAILABLE');
  if(!same(a,b,'tool_args_hash'))return no('NOT_DUPLICATE','DIFFERENT_ARGS');
  for(const k of ['sr.tenant_hmac','sr.auth_scope_hmac']){
    if(!hash(label(a,k))||!hash(label(b,k)))return no('INSUFFICIENT_EVIDENCE','SCOPE_NOT_PROVEN');
    if(!same(a,b,k))return no('REJECT_SCOPE','SCOPE_CHANGED');
  }
  if(label(a,'sr.side_effect_class')!=='read_only'||label(b,'sr.side_effect_class')!=='read_only'||
     label(a,'sr.independent_samples_required')!=='false'||label(b,'sr.independent_samples_required')!=='false'||
     label(a,'sr.exact_single_answer_shareable')!=='true'||label(b,'sr.exact_single_answer_shareable')!=='true')
    return no('REJECT_UNSAFE','NOT_ONE_SAFE_READ_ANSWER');
  if(label(a,'operation_status')!=='success'||label(b,'operation_status')!=='success')
    return no('INSUFFICIENT_EVIDENCE','UNRELIABLE_EXECUTION_STATUS');
  if(['sr.environment_hash','sr.dependencies_hash'].some(k=>!hash(label(a,k))||!hash(label(b,k))))
    return no('INSUFFICIENT_EVIDENCE','DEPENDENCY_OR_ENVIRONMENT_NOT_PROVEN');
  if(!same(a,b,'sr.environment_hash')||!same(a,b,'sr.dependencies_hash'))
    return no('REVALIDATION_REQUIRED','EXECUTION_INPUT_CHANGED');
  if(label(a,'sr.dependencies_complete')!=='true'||label(b,'sr.dependencies_complete')!=='true')
    return no('INSUFFICIENT_EVIDENCE','INCOMPLETE_DEPENDENCIES');
  if(!hash(label(a,'sr.source_id_hash'))||!hash(label(b,'sr.source_id_hash')))
    return no('INSUFFICIENT_EVIDENCE','SOURCE_IDENTITY_UNKNOWN');
  if(!same(a,b,'sr.source_id_hash'))return no('REVALIDATION_REQUIRED','SOURCE_IDENTITY_CHANGED');
  if(!hash(label(a,'sr.source_version_hash'))||!hash(label(b,'sr.source_version_hash')))
    return no('INSUFFICIENT_EVIDENCE','SOURCE_VERSION_UNKNOWN');
  if(!same(a,b,'sr.source_version_hash'))return no('REVALIDATION_REQUIRED','SOURCE_VERSION_CHANGED');
  if(!hash(label(a,'tool_result_hash'))||!hash(label(b,'tool_result_hash')))
    return no('INSUFFICIENT_EVIDENCE','RESULT_FINGERPRINT_UNAVAILABLE');
  if(!same(a,b,'tool_result_hash'))return no('REVALIDATION_REQUIRED','RESULT_CHANGED');
  if(label(b,'sr.native_zero_marginal_cost_hit')==='true')
    return no('NATIVE_CONTROL_FIRST','NATIVE_CACHE_DOMINATES');
  if(label(a,'sr.source_confirmation')!=='synthetic_source_native_304'||
     label(b,'sr.source_confirmation')!=='synthetic_source_native_304')
    return no('INSUFFICIENT_EVIDENCE','AUTHORITATIVE_SOURCE_CONFIRMATION_UNAVAILABLE');
  if(label(b,'sr.stream_gap_free')!=='true'||label(b,'sr.stream_watermark_verified')!=='true')
    return no('INSUFFICIENT_EVIDENCE','STREAM_CONTINUITY_UNPROVEN');
  if(!['bounded','strict_latest'].includes(label(b,'sr.freshness_policy')))
    return no('INSUFFICIENT_EVIDENCE','FRESHNESS_POLICY_UNKNOWN');
  const valid=Date.parse(label(b,'sr.hard_valid_until')||'');
  if(!Number.isFinite(valid))return no('INSUFFICIENT_EVIDENCE','FRESHNESS_DEADLINE_MISSING');
  if(ms(b)>valid)return no('REVALIDATION_REQUIRED','HARD_FRESHNESS_EXPIRED');
  return no('SHADOW_CANDIDATE','EXACT_COMPATIBLE_WITH_CALLER_SUPPLIED_PROOF');
}
export function analyze(records){
  const groups=new Map();
  for(const r of records){const key=r?.run?.run_id;if(!str(key))throw new Error('missing run_id');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  return [...groups].map(([run_id,arr])=>{
    if(arr.length!==2)throw new Error('fixture expected exactly two records in '+run_id);
    const [a,b]=arr.sort((x,y)=>ms(x)-ms(y));
    return {run_id,first_record_id:a.record_id,second_record_id:b.record_id,...decide(a,b)}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const records=readFileSync(process.argv[2]||path.join(here,'fixture.audr.jsonl'),'utf8').trim().split(/\n/).map(x=>JSON.parse(x));
  const decisions=analyze(records);
  console.log(JSON.stringify({schema:'seenrelay-kora-advisory-report-v0',decisions,
    summary:decisions.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{})},null,2));
}
