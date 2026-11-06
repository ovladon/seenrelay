import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analyzeAgentEvidenceCensus} from '../clients/typescript/scripts/agent-evidence-census-lib.mjs';
const H=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
function fixture(){
 const dep=(id,v,k='git_blob',extra={})=>({key_hash:H(id),fingerprint:H(v),kind:k,...extra});
 const base=[dep('source','version1'),dep('provider','state1','mutable_external',{authoritative_state_checked:true,valid_until_ms:5000})];
 const capsule={capsule_id:'c1',scope_hash:H('scope'),operation_hash:H('read'),environment_hash:H('tool'),
  output_hash:H('observed'),authoritative_validated:true,dependencies_complete:true,artifact_available:true,
  dependencies:base.map(x=>({key_hash:x.key_hash,fingerprint:x.fingerprint,kind:x.kind}))};
 const req=(id,other={})=>({request_id:id,capsule_id:'c1',scope_hash:capsule.scope_hash,operation_hash:capsule.operation_hash,
  environment_hash:capsule.environment_hash,requested_at_ms:1000,side_effect_class:'read_only',
  exact_single_answer_shareable:true,independent_samples_required:false,artifact_available:true,
  observed_authoritative_execution:true,observed_output_hash:capsule.output_hash,native_status:'measured_miss',
  marginal_cost_usd:0.4,cost_provenance:'provider_reported',dependencies:base.map(x=>({...x})),...other});
 return {capsule,req,base,dep};
}
test('only version-correct shadow equivalence after native misses qualifies as potential',()=>{
 const {capsule,req,base,dep}=fixture();
 const requests=[
  req('same'), req('source-changed',{dependencies:[dep('source','version2'),base[1]]}),
  req('source-expired',{requested_at_ms:5000}),req('native-hit',{native_status:'measured_hit'}),
  req('no-native',{native_status:'not_measured'}),req('independent',{independent_samples_required:true}),
  req('scope',{scope_hash:H('other')}),req('mismatch',{observed_output_hash:H('different')}),
  req('missing',{observed_authoritative_execution:false})
 ];
 const r=analyzeAgentEvidenceCensus({schema_version:'seenrelay-agent-evidence-census-v0',capsules:[capsule],requests});
 assert.equal(r.input_requests,9);assert.equal(r.exact_candidate_after_native_miss,1);
 assert.equal(r.classification_counts.DEPENDENCY_CHANGED,1);
 assert.equal(r.classification_counts.EXTERNAL_STATE_UNVERIFIED_OR_STALE,1);
 assert.equal(r.classification_counts.NATIVE_DOMINATES,1);
 assert.equal(r.classification_counts.NATIVE_COMPARATOR_NOT_MEASURED,1);
 assert.equal(r.classification_counts.POLICY_INELIGIBLE,1);
 assert.equal(r.classification_counts.SCOPE_CHANGED,1);
 assert.equal(r.classification_counts.SEMANTIC_MISMATCH,1);
 assert.equal(r.classification_counts.AUTHORITATIVE_RESULT_UNOBSERVED,1);
 assert.equal(r.gross_upper_bound_usd,0.4);
 assert.equal(r.verified_net_savings_usd,null);
 console.log('DELTA_AGENT_SHADOW '+JSON.stringify({calls:r.input_requests,potential:r.exact_candidate_after_native_miss,
  native_first:r.classification_counts.NATIVE_DOMINATES,actual_net:null}));
});
test('unknown native economics, missing evidence and repeated dependency hashes stay non-authoritative',()=>{
 const {capsule,req}=fixture();
 const report=analyzeAgentEvidenceCensus({schema_version:'seenrelay-agent-evidence-census-v0',
  capsules:[capsule],requests:[req('unknown',{marginal_cost_usd:undefined,cost_provenance:undefined})]});
 assert.equal(report.gross_upper_bound_usd,null);
 assert.equal(report.realized_avoided_executions,null);
 const input={schema_version:'seenrelay-agent-evidence-census-v0',capsules:[capsule],requests:[req('bad')]};
 input.requests[0].dependencies.push(input.requests[0].dependencies[0]);
 assert.throws(()=>analyzeAgentEvidenceCensus(input),/duplicate dependency/);
});
