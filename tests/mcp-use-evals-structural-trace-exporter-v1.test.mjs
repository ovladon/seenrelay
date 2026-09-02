import test from 'node:test';
import assert from 'node:assert/strict';
import { exportMcpUseEvalsStructuralTrace } from '../scripts/mcp-use-evals-structural-trace-exporter-v1.mjs';

const A=`sha256:${'a'.repeat(64)}`;
const B=`sha256:${'b'.repeat(64)}`;
const KEY='0123456789abcdef0123456789abcdef';
const lines=(events)=>events.map((event)=>JSON.stringify(event)).join('\n');
const baseEvents=()=>[
  {type:'text-delta',text:'SECRET PROMPT/RESPONSE'},
  {type:'tool-call',toolCallId:'secret-call-1',toolName:'secret_tool',input:{path:'/secret/path',value:'low-entropy'}},
  {type:'tool-result',toolCallId:'secret-call-1',toolName:'secret_tool',output:{secret:'SECRET OUTPUT'}},
  {type:'tool-call',toolCallId:'secret-call-2',toolName:'secret_tool',input:{path:'/secret/path',value:'low-entropy'}},
  {type:'tool-error',toolCallId:'secret-call-2',toolName:'secret_tool',error:'SECRET ERROR'},
  {type:'diagnostic',level:'warn',message:'SECRET DIAGNOSTIC'},
  {type:'finish',providerMetadata:{secret:'SECRET PROVIDER'}},
  {type:'result',subtype:'success',duration_ms:1234,num_turns:3,total_usage:{inputTokens:100,outputTokens:20,totalTokens:120}},
];
const opts={coordinateKey:KEY,attemptCoordinate:A,sourceEvidenceFingerprint:B};

test('exports only privacy-minimized structural evidence and work counters',()=>{
  const out=exportMcpUseEvalsStructuralTrace(lines(baseEvents()),opts);
  assert.equal(out.counts.tool_calls,2);
  assert.equal(out.counts.tool_results,1);
  assert.equal(out.counts.tool_errors,1);
  assert.equal(out.counts.orphan_terminal_events,0);
  assert.equal(out.counts.exact_duplicate_operation_groups,1);
  assert.equal(out.counts.repeated_operation_calls,1);
  assert.equal(out.final_result_work.duration_ms,1234);
  assert.equal(out.final_result_work.turns,3);
  assert.equal(out.final_result_work.input_tokens,100);
  assert.equal(out.final_result_work.output_tokens,20);
  assert.equal(out.final_result_work.reasoning_tokens,null);
  assert.equal(out.raw_outputs_retained,false);
  assert.equal(out.eliminability_inferred,false);
  assert.equal(out.same_outcome_proven,false);
  const text=JSON.stringify(out);
  for(const secret of ['SECRET','secret_tool','secret-call-1','secret-call-2','/secret/path','low-entropy']) assert.equal(text.includes(secret),false);
});

test('same operation under same local key has stable coordinate but a different key changes it',()=>{
  const a=exportMcpUseEvalsStructuralTrace(lines(baseEvents()),opts);
  const b=exportMcpUseEvalsStructuralTrace(lines(baseEvents()),opts);
  const c=exportMcpUseEvalsStructuralTrace(lines(baseEvents()),{...opts,coordinateKey:'fedcba9876543210fedcba9876543210'});
  const ac=a.structural_events.filter(e=>e.event_type==='tool-call').map(e=>e.operation_coordinate);
  const bc=b.structural_events.filter(e=>e.event_type==='tool-call').map(e=>e.operation_coordinate);
  const cc=c.structural_events.filter(e=>e.event_type==='tool-call').map(e=>e.operation_coordinate);
  assert.deepEqual(ac,bc);
  assert.notDeepEqual(ac,cc);
  assert.equal(a.coordinate_key_retained,false);
});

test('duplicate structural calls are observations, never inferred redundancy',()=>{
  const out=exportMcpUseEvalsStructuralTrace(lines(baseEvents()),opts);
  assert.equal(out.counts.repeated_operation_calls,1);
  assert.equal(out.effect_classification_inferred,false);
  assert.equal(out.mutability_inferred,false);
  assert.equal(out.freshness_inferred,false);
  assert.equal(out.candidate_headroom_proven,false);
  assert.equal(out.optimizer_authorized,false);
});

test('structural sequence indexes do not reveal hidden text or diagnostic event counts',()=>{
  const out=exportMcpUseEvalsStructuralTrace(lines(baseEvents()),opts);
  assert.deepEqual(out.structural_events.map(e=>e.sequence_index),[0,1,2,3]);
});

test('does not retain tool outputs or output fingerprints',()=>{
  const out=exportMcpUseEvalsStructuralTrace(lines(baseEvents()),opts);
  const terminals=out.structural_events.filter(e=>e.event_type!=='tool-call');
  assert.equal(terminals.some(e=>'output' in e || 'output_coordinate' in e || 'error' in e),false);
});

test('fails closed on malformed JSONL or multiple/missing final result events',()=>{
  assert.throws(()=>exportMcpUseEvalsStructuralTrace('{bad json',opts),/not valid JSON/);
  const noResult=baseEvents().filter(e=>e.type!=='result');
  assert.throws(()=>exportMcpUseEvalsStructuralTrace(lines(noResult),opts),/exactly one final result/);
  const two=[...baseEvents(),{type:'result',duration_ms:1,num_turns:1,total_usage:{}}];
  assert.throws(()=>exportMcpUseEvalsStructuralTrace(lines(two),opts),/exactly one final result/);
});

test('fails closed on weak coordinate keys and duplicate raw call ids',()=>{
  assert.throws(()=>exportMcpUseEvalsStructuralTrace(lines(baseEvents()),{...opts,coordinateKey:'short'}),/at least 32 bytes/);
  const dup=[
    {type:'tool-call',toolCallId:'same',toolName:'a',input:{}},
    {type:'tool-call',toolCallId:'same',toolName:'b',input:{}},
    {type:'result',duration_ms:1,num_turns:1,total_usage:{}},
  ];
  assert.throws(()=>exportMcpUseEvalsStructuralTrace(lines(dup),opts),/duplicate raw toolCallId/);
});

test('orphan terminal events are surfaced rather than silently trusted',()=>{
  const events=[
    {type:'tool-result',toolCallId:'missing-call',toolName:'x',output:'SECRET'},
    {type:'result',duration_ms:1,num_turns:1,total_usage:{}},
  ];
  const out=exportMcpUseEvalsStructuralTrace(lines(events),opts);
  assert.equal(out.counts.orphan_terminal_events,1);
  assert.equal(out.candidate_headroom_proven,false);
});

test('unknown and absent usage fields remain null rather than zero',()=>{
  const events=[
    {type:'tool-call',toolName:'x',input:null},
    {type:'result',duration_ms:null,num_turns:null,total_usage:{inputTokens:10}},
  ];
  const out=exportMcpUseEvalsStructuralTrace(lines(events),opts);
  assert.equal(out.final_result_work.duration_ms,null);
  assert.equal(out.final_result_work.turns,null);
  assert.equal(out.final_result_work.input_tokens,10);
  assert.equal(out.final_result_work.output_tokens,null);
  assert.equal(out.counts.unmatched_tool_calls,0);
});
