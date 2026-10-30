// Offline, deterministic cross-project comparison. Requires *actual* pinned KORA Doctor
// --json output and the independent SeenRelay synthetic advisory output.
// Fail closed on missing cases, unexpected identifiers, statuses or new findings.
// No network requests, reused calls, provider costs or runtime integration.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const home=dirname(fileURLToPath(import.meta.url));
const koraPath=process.argv[2];
const srPath=process.argv[3];
if(!koraPath||!srPath)throw new Error('Usage: node compare-16.mjs KORA_AUDIT.json SEENRELAY_ADVISORY.json [OUTPUT_DIR]');
const outputDir=resolve(process.argv[4]||home);
const parse=p=>JSON.parse(readFileSync(p,'utf8'));
const expected=parse(join(home,'expected.json')).cases;
const kora=parse(koraPath), sr=parse(srPath);
assert.equal(kora.records,32,'KORA must have parsed 32 synthetic AUDR records');
assert.equal(kora.runs,16,'KORA must have parsed 16 synthetic runs');
assert.equal(kora.tool_calls,32);
assert.equal(sr?.decisions?.length,16);
assert.equal(expected.length,16);
const repeated=(kora.findings||[]).filter(f=>f.category==='repeated_tool_retrieval');
const byId=new Map();
for(const f of repeated)for(const id of f.record_ids||[]){
 assert.ok(!byId.has(id),'Duplicate KORA repeated finding record '+id);
 byId.set(id,f);
}
assert.equal(byId.size,15,'Expected exactly 15 KORA repeated-record candidates');
const byRun=new Map(sr.decisions.map(x=>[x.run_id,x]));
assert.equal(byRun.size,16);
const WHY={
 compatible_read:'All synthetic scope, source, dependency and freshness claims match; only a shadow measurement candidate.',
 native_zero_cost:'An effective native cache already handles the repeat; SeenRelay has no incremental work to save.',
 different_arguments:'Argument fingerprints differ; no duplicate read exists.',
 source_version_change:'The purported authoritative source version changed; revalidation is required.',
 same_result_but_source_changed:'Identical output fingerprints do not override a changed source version.',
 result_mismatch:'Results differ, so this cannot be treated as unchanged evidence.',
 expired_proof:'The source validity deadline had passed at the second observation.',
 tenant_change:'Evidence belongs to a different pseudonymous tenant boundary.',
 auth_scope_change:'The authorization scope differs despite matching arguments.',
 independent_review:'An independently required review must not be replaced.',
 side_effect:'A write/side-effectful operation cannot be skipped using a read-only equivalence test.',
 missing_source_proof:'No evidence of authoritative source confirmation was supplied.',
 timeout_retry:'An earlier timeout does not establish a successful, shareable prior execution.',
 event_stream_gap:'A discontinuous change stream cannot prove no changes were missed.',
 incomplete_dependencies:'Result-affecting dependencies are not shown to be complete.',
 strict_latest_without_watermark:'Strict-latest semantics require a verified change-stream watermark.'
};
const rows=[];
for(const c of expected){
 const s=byRun.get(c.run_id);
 assert.ok(s,'Missing SeenRelay decision for '+c.case);
 assert.equal(s.status,c.expected,'SeenRelay classification changed for '+c.case);
 assert.deepEqual([s.first_record_id,s.second_record_id],c.record_ids,'Record order changed for '+c.case);
 assert.equal(s.auto_reuse_authorized,false);
 assert.equal(s.verified_saved_usd,null);
 const finding=byId.get(c.record_ids[1]);
 const shouldRepeat=c.case!=='different_arguments';
 assert.equal(Boolean(finding),shouldRepeat,'KORA discrepancy for '+c.case);
 assert.equal(byId.has(c.record_ids[0]),false,'KORA marked first/producer as duplicate');
 assert.ok(WHY[c.case]);
 if(finding){
   assert.ok((finding.run_ids||[]).includes(c.run_id),'KORA wrong run for '+c.case);
   assert.ok(typeof finding.reason==='string'&&finding.reason.length>20,'KORA explanation missing for '+c.case);
   assert.ok(['low','medium','high'].includes(finding.confidence),'KORA confidence missing');
 }
 assert.ok(s.reason&&s.reason.length>4,'SeenRelay reasoning missing for '+c.case);
 rows.push({scenario_id:c.case,run_id:c.run_id,
  kora_repeated_read_candidate:Boolean(finding),
  kora_reason:finding?.reason||'Different argument fingerprints; no repeated-tool finding.',
  kora_confidence:finding?.confidence||null,
  seenrelay_advisory_decision:s.status,
  seenrelay_reason_code:s.reason,
  explanation:WHY[c.case],
  auto_reuse_authorized:false,verified_saved_usd:null});
}
const expectedSecond=new Set(expected.filter(c=>c.case!=='different_arguments').map(c=>c.record_ids[1]));
assert.deepEqual([...byId.keys()].sort(),[...expectedSecond].sort(),'KORA extra/unexpected candidate records');
const payload={schema:'kora-seenrelay-offline-comparison-v1',
 source:'entirely synthetic, pinned KORA Doctor CLI and standalone SeenRelay fixture evaluator',
 constraints:{production_integration:false,automatic_reuse:false,real_customer_cost_evidence:false,tool_payloads_exported:false},
 kora:{records:kora.records,runs:kora.runs,repeated_record_candidates:byId.size},
 seenrelay:{total_cases:rows.length,shadow_candidates:rows.filter(r=>r.seenrelay_advisory_decision==='SHADOW_CANDIDATE').length},
 rows};
writeFileSync(join(outputDir,'comparison-16.json'),JSON.stringify(payload,null,2)+'\n');
const esc=s=>String(s).replaceAll('|','/').replaceAll('\n',' ');
const table=[
'# KORA Doctor / SeenRelay — 16-case offline comparison',
'',
'**Synthetic evidence only.** KORA findings report suspicious repetition, not safe skips. SeenRelay decisions are from a standalone fixture classifier, not a production authorization engine. No provider calls or verified monetary savings.',
'',
'Pinned KORA Doctor: commit `986f2d44bb8f74aa9e83839e66118884fe446627` (v0.1.10).',
'',
'**Summary:** 32 AUDR tool records, 16 cases, 15 KORA repetition candidates, 1 SeenRelay shadow candidate; all 16 mapped by ID with separate explanations.',
'',
'| Scenario ID | KORA: suspected repeat | SeenRelay verdict | Reason SeenRelay differs |',
'|---|---|---|---|',
...rows.map(r=>'| `'+r.scenario_id+'` | '+(r.kora_repeated_read_candidate?'Yes':'No')+' | `'+r.seenrelay_advisory_decision+'` | '+esc(r.explanation)+' |'),
'',
'For every case: `auto_reuse_authorized=false`, `verified_saved_usd=null`. KORA\'s actual per-case explanation is preserved in `comparison-16.json`; SeenRelay\'s independent reason code is also stored there. All freshness/identity/provenance labels are synthetic, caller-supplied assertions; none are authenticated production proofs.',
''];
writeFileSync(join(outputDir,'comparison-16.md'),table.join('\n')+'\n');
console.log('PASS: 16 scenario IDs and explanations reconciled; KORA 15 repetition candidates; SeenRelay 1 advisory shadow candidate.');
