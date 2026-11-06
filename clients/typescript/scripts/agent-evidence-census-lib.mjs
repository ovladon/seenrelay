import fs from 'node:fs';

const HASH=/^sha256:[a-f0-9]{64}$/;
const forbidden=new Set(['prompt','prompts','messages','response','responses','body','url','headers','source_code','file_contents','raw_value','arguments','args','credentials','secrets','api_key','access_token']);
const costSources=new Set(['provider_reported','invoice','metered_billing']);
const kinds=new Set(['git_blob','tool_config','mutable_external']);
const statuses=new Set(['measured_hit','measured_miss','not_measured']);

function fail(message) { throw new TypeError(message); }
function object(v) { return v!==null && typeof v==='object' && !Array.isArray(v); }
function hash(v,label) { if(typeof v!=='string'||!HASH.test(v)) fail(label+' must be opaque sha256:<64-hex>');return v; }
function scanPrivacy(v,trail='input') {
  if(Array.isArray(v)) return v.forEach((x,i)=>scanPrivacy(x,trail+'['+i+']'));
  if(!object(v)) return;
  for(const [k,val] of Object.entries(v)) {
    if(forbidden.has(k.toLowerCase())) fail('disallowed raw/private field '+trail+'.'+k);
    scanPrivacy(val,trail+'.'+k);
  }
}
function deps(rows,ref,requestTime) {
  if(!Array.isArray(rows)||rows.length===0) fail(ref+' requires complete non-empty dependencies');
  const result=new Map();
  for(const item of rows) {
    if(!object(item)||!kinds.has(item.kind)) fail(ref+' dependency kind unsupported');
    const id=hash(item.key_hash,ref+'.key_hash');
    const digest=hash(item.fingerprint,ref+'.fingerprint');
    if(result.has(id)) fail(ref+' duplicate dependency identity');
    if(item.kind==='mutable_external') {
      if(ref==='request') {
        // No inferred TTL or trust based solely on equal fingerprint.
        if(typeof item.authoritative_state_checked!=='boolean') fail('external dependency source check status required');
        if(!Number.isSafeInteger(item.valid_until_ms)) fail('external dependency valid_until_ms required');
      }
    }
    result.set(id,{...item,key_hash:id,fingerprint:digest});
  }
  return result;
}
function normalize(input) {
  scanPrivacy(input);
  if(!object(input)||input.schema_version!=='seenrelay-agent-evidence-census-v0') fail('unsupported input schema');
  if(!Array.isArray(input.capsules)||!Array.isArray(input.requests)||!input.requests.length)
    fail('non-empty requests and capsules required');
  const capsules=new Map();
  for(const cap of input.capsules) {
    if(!object(cap)||typeof cap.capsule_id!=='string'||!cap.capsule_id||capsules.has(cap.capsule_id))
      fail('missing/duplicate capsule ID');
    hash(cap.scope_hash,'capsule.scope_hash');
    hash(cap.operation_hash,'capsule.operation_hash');
    hash(cap.environment_hash,'capsule.environment_hash');
    hash(cap.output_hash,'capsule.output_hash');
    capsules.set(cap.capsule_id,{...cap, _deps:deps(cap.dependencies,'capsule')});
  }
  const ids=new Set();
  for(const r of input.requests) {
    if(!object(r)||typeof r.request_id!=='string'||!r.request_id||ids.has(r.request_id)) fail('missing/duplicate request ID');
    ids.add(r.request_id);
    if(!Number.isSafeInteger(r.requested_at_ms)||r.requested_at_ms<0) fail('invalid request timestamp');
    hash(r.scope_hash,'request.scope_hash');
    hash(r.operation_hash,'request.operation_hash');
    hash(r.environment_hash,'request.environment_hash');
    if(r.observed_authoritative_execution===true)hash(r.observed_output_hash,'request.observed_output_hash');
    if(r.native_status!==undefined&&!statuses.has(r.native_status)) fail('invalid native_status');
    if(r.marginal_cost_usd!==undefined&&(!Number.isFinite(r.marginal_cost_usd)||r.marginal_cost_usd<0))
      fail('marginal_cost_usd must be non-negative finite');
    if(r.cost_provenance!==undefined&&!costSources.has(r.cost_provenance)) fail('unsupported cost provenance');
    if(r.marginal_cost_usd!==undefined&&!r.cost_provenance)fail('cost provenance required');
    r._deps=deps(r.dependencies,'request',r.requested_at_ms);
  }
  return {capsules,requests:input.requests};
}
function assess(cap,r) {
  if(!cap) return 'CAPSULE_NOT_FOUND';
  if(r.side_effect_class!=='read_only'||r.independent_samples_required!==false||
     r.exact_single_answer_shareable!==true)return 'POLICY_INELIGIBLE';
  if(cap.authoritative_validated!==true||cap.dependencies_complete!==true||cap.artifact_available!==true||
     r.artifact_available!==true)return 'PROOF_OR_ARTIFACT_INCOMPLETE';
  if(cap.scope_hash!==r.scope_hash)return 'SCOPE_CHANGED';
  if(cap.operation_hash!==r.operation_hash)return 'OPERATION_CHANGED';
  if(cap.environment_hash!==r.environment_hash)return 'ENVIRONMENT_CHANGED';
  if(cap._deps.size!==r._deps.size)return 'DEPENDENCY_SET_CHANGED';
  for(const [id,old] of cap._deps) {
    const current=r._deps.get(id);
    if(!current||current.kind!==old.kind)return 'DEPENDENCY_SET_CHANGED';
    if(current.kind==='mutable_external' &&
       (current.authoritative_state_checked!==true||current.valid_until_ms<=r.requested_at_ms))
      return 'EXTERNAL_STATE_UNVERIFIED_OR_STALE';
    if(old.fingerprint!==current.fingerprint)return 'DEPENDENCY_CHANGED';
  }
  // Every original call remains on. We evaluate only observed, successful result equivalence.
  if(r.observed_authoritative_execution!==true)return 'AUTHORITATIVE_RESULT_UNOBSERVED';
  if(r.observed_output_hash!==cap.output_hash)return 'SEMANTIC_MISMATCH';
  if(r.native_status==='measured_hit')return 'NATIVE_DOMINATES';
  if(r.native_status!=='measured_miss')return 'NATIVE_COMPARATOR_NOT_MEASURED';
  return 'CANDIDATE_AFTER_MEASURED_NATIVE_MISS';
}
export function analyzeAgentEvidenceCensus(input) {
  const {capsules,requests}=normalize(input);
  const counts={};let candidates=0,costed=0,gross=0,native=0;
  for(const r of requests) {
    const reason=assess(capsules.get(r.capsule_id),r);
    counts[reason]=(counts[reason]||0)+1;
    if(reason==='NATIVE_DOMINATES')native++;
    if(reason==='CANDIDATE_AFTER_MEASURED_NATIVE_MISS') {
      candidates++;
      if(typeof r.marginal_cost_usd==='number'){costed++;gross+=r.marginal_cost_usd}
    }
    delete r._deps;
  }
  return {
    schema_version:'seenrelay-agent-evidence-census-report-v0',
    mode:'SHADOW_LOCAL_ONLY',input_requests:requests.length,capsules:capsules.size,
    classification_counts:counts,exact_candidate_after_native_miss:candidates,
    provider_cost_coverage:{priced_candidates:costed,total_candidates:candidates},
    gross_upper_bound_usd:costed===candidates?Number(gross.toFixed(8)):null,
    realized_avoided_executions:null,verified_net_savings_usd:null,
    safety:'NO_REUSE_AUTHORIZATION',
    recommendation:candidates>0?'INSUFFICIENT_EVIDENCE_SHADOW_NATURAL_WORKLOAD':
      'DO_NOT_USE_OR_INSUFFICIENT_EVIDENCE',
    caveats:[
      'Candidates are hypothetical: every original authoritative operation must remain enabled.',
      'Even measured native misses do not establish superiority to all feasible stronger native controls.',
      'A shadow output mismatch blocks reuse, and required independent agent reviews never qualify.',
      'No model-context or token savings, integration overhead, or customer ROI is established.',
      'The audit does not send data to SeenRelay or any external service.'
    ]
  };
}
export function analyzeAgentEvidenceFile(file) {
  return analyzeAgentEvidenceCensus(JSON.parse(fs.readFileSync(file,'utf8')));
}
export function renderAgentEvidenceReport(r) {
  const counts=Object.entries(r.classification_counts).sort(([a],[b])=>a.localeCompare(b))
    .map(([key,n])=>'  '+key+': '+n).join('\n');
  return [
    'SeenRelay Delta / Agent Evidence Census (local-only shadow)',
    'Requests: '+r.input_requests+' | Candidate after measured native miss: '+r.exact_candidate_after_native_miss,
    'Classifications:\n'+counts,
    'Gross upper bound (not savings): '+(r.gross_upper_bound_usd===null?'unknown':'$'+r.gross_upper_bound_usd),
    'Actual net savings: NOT MEASURED','Verdict: '+r.recommendation,
    'No active reuse, no customer data upload, no authorization to skip a review.'
  ].join('\n')+'\n';
}
