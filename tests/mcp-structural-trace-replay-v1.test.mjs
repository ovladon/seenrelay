import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { classifyStructuralBashRead, replayMcpStructuralTrace, POLICY_FINGERPRINT } from '../scripts/mcp-structural-trace-replay-v1.mjs';

const sh = (script) => ({ command: `/bin/bash -lc "${script.replaceAll('"','\\"')}"` });
const ev = (xs) => xs.map((x) => JSON.stringify(x)).join('\n');
const tsha = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

const call=(id,input,toolName='bash')=>({type:'tool-call',toolCallId:id,toolName,input,providerExecuted:false});
const result=(id,output,toolName='bash')=>({type:'tool-result',toolCallId:id,toolName,output});

test('admits only conservative workspace read shapes',()=>{
  for (const input of [
    sh('pwd'), sh('ls -la'), sh('rg --files | head -20'), sh("cat package.json | head -20"), sh("sed -n '1,20p' package.json"), sh('rg foo src && ls src')
  ]) assert.equal(classifyStructuralBashRead(input).admitted,true,input.command);
});

test('rejects mutation, network, interpreter, process, redirect, subshell and unsafe readers',()=>{
  for (const script of [
    'npm install x','npx tsc --noEmit','node -e "console.log(1)"','curl https://example.com','ps -ef','kill 1',
    'echo x > file','cat $(pwd)/x','cat /etc/passwd','cat ../secret','find . -delete','git status','sed -i s/a/b/ x',
    'rg --pre cat foo .','PORT=3000 ls','ls; rm -rf x','ls || true','ls & echo x'
  ]) assert.equal(classifyStructuralBashRead(sh(script)).admitted,false,script);
});

test('reuses an exact read only inside one mutation epoch',()=>{
  const trace=ev([
    call('1',sh('ls -la')),result('1',{stdout:'same'}),
    call('2',sh('ls -la')),result('2',{stdout:'same'}),
  ]);
  const out=replayMcpStructuralTrace(trace,{expectedTraceSha256:tsha(trace)});
  assert.equal(out.predicted_cache_hits,1);
  assert.equal(out.verified_equivalent_hits,1);
  assert.equal(out.same_outcome_structural_proof,true);
  assert.equal(out.baseline_executed_tool_calls,2);
  assert.equal(out.candidate_executed_tool_calls,1);
  assert.equal(out.structural_execution_reduction_percent,50);
});

test('fileChange and unknown bash calls are barriers',()=>{
  const trace=ev([
    call('1',sh('ls -la')),result('1',{stdout:'same'}),
    call('fc',{event:'modify',path:'x'},'fileChange'),result('fc',{},'fileChange'),
    call('2',sh('ls -la')),result('2',{stdout:'same'}),
    call('3',sh('npm install x')),result('3',{stdout:'done'}),
    call('4',sh('ls -la')),result('4',{stdout:'same'}),
  ]);
  const out=replayMcpStructuralTrace(trace);
  assert.equal(out.predicted_cache_hits,0);
  assert.equal(out.same_outcome_structural_proof,true);
});

test('current output never changes the decision; it only falsifies equivalence afterward',()=>{
  const prefix=[call('1',sh('ls -la')),result('1',{stdout:'A'}),call('2',sh('ls -la'))];
  const same=replayMcpStructuralTrace(ev([...prefix,result('2',{stdout:'A'})]));
  const changed=replayMcpStructuralTrace(ev([...prefix,result('2',{stdout:'B'})]));
  assert.equal(same.predicted_cache_hits,1);
  assert.equal(changed.predicted_cache_hits,1);
  assert.equal(same.same_outcome_structural_proof,true);
  assert.equal(changed.same_outcome_structural_proof,false);
  assert.equal(changed.mismatch_hits,1);
});

test('parallel unresolved reads do not become speculative hits',()=>{
  const trace=ev([call('1',sh('ls -la')),call('2',sh('ls -la')),result('1',{stdout:'same'}),result('2',{stdout:'same'})]);
  const out=replayMcpStructuralTrace(trace);
  assert.equal(out.predicted_cache_hits,0);
});

test('tool errors create barriers and never count as equivalent hits',()=>{
  const trace=ev([
    call('1',sh('ls -la')),result('1',{stdout:'same'}),
    call('2',sh('ls -la')),{type:'tool-error',toolCallId:'2',toolName:'bash',error:'x'},
    call('3',sh('ls -la')),result('3',{stdout:'same'}),
  ]);
  const out=replayMcpStructuralTrace(trace);
  assert.equal(out.predicted_cache_hits,1);
  assert.equal(out.same_outcome_structural_proof,false);
});

test('malformed events fail closed',()=>{
  const trace='not-json\n'+ev([call('1',sh('ls -la')),result('1',{stdout:'x'})]);
  const out=replayMcpStructuralTrace(trace);
  assert.equal(out.malformed_events,1);
  assert.equal(out.same_outcome_structural_proof,false);
});

test('result is privacy-minimized and structural reduction cannot authorize admission',()=>{
  const secret='TOP-SECRET-COMMAND-FRAGMENT';
  const trace=ev([call('1',sh(`rg ${secret} src`)),result('1',{stdout:secret})]);
  const out=replayMcpStructuralTrace(trace);
  const text=JSON.stringify(out);
  assert.equal(text.includes(secret),false);
  assert.equal('candidate_key_fingerprints' in out,false);
  assert.match(POLICY_FINGERPRINT,/^sha256:[0-9a-f]{64}$/);
  assert.equal(out.decision_overhead_scalarized,false);
  assert.equal(out.structural_reduction_descriptive_only,true);
  assert.equal(out.vector_candidate_authorized,false);
  assert.equal(out.economic_value_proven,false);
  assert.equal(out.active_optimizer_authorized,false);
  assert.equal(out.production_change_authorized,false);
});
