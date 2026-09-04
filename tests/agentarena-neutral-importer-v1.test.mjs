import test from 'node:test';
import assert from 'node:assert/strict';
import { importAgentArenaNeutralRun } from '../scripts/agentarena-neutral-importer-v1.mjs';

const C='8aa817633747ad650f39b3d2708e4c09e30106ce';
const S=`sha256:${'b'.repeat(64)}`;
const opts={repositoryCommit:C,sourceEvidenceFingerprint:S};
const judge=(type='test-result',success=true,critical=true)=>({judgeId:'secret-judge-id',label:'secret label',type,critical,exitCode:success?0:1,success,stdout:'secret stdout',stderr:'secret stderr',durationMs:12});
const result=(success=true, extra={})=>({
  agentId:'codex-default',baseAgentId:'codex',variantId:'codex-default',displayLabel:'Secret Codex',
  requestedConfig:{model:'secret-model',reasoningEffort:'high',providerProfileId:'secret-provider'},
  resolvedRuntime:{effectiveModel:'secret-model',effectiveReasoningEffort:'high',effectiveAgentVersion:'secret-version',verification:'confirmed'},
  agentTitle:'Codex',status:success?'success':'failed',executionStatus:'completed',validationStatus:success?'passed':'failed',adapterKind:'external',
  preflight:{status:'ready'},summary:'secret summary',durationMs:1000,tokenUsage:500,estimatedCostUsd:9.9,costKnown:false,costQuality:'unavailable',tokenUsageReliable:true,
  tokenUsageBreakdown:{inputTokens:300,outputTokens:100,reasoningTokens:100,cacheReadTokens:20,cacheWriteTokens:0},
  changedFiles:['secret/file.ts'],fileDiffs:[{path:'secret/file.ts',text:'secret diff'}],judgeResults:[judge()],tracePath:'/secret/trace.jsonl',workspacePath:'/secret/ws',
  compositeScore:99,assembledPrompt:'secret prompt',...extra
});
const run=(results)=>({runId:'secret-run',repoPath:'/secret/repo',outputPath:'/secret/out',fairComparison:{taskIdentity:'secret-task-id',judgeIdentity:'secret-judge-set',repoBaselineIdentity:'secret-repo-baseline'},results});

test('imports functional correctness and work without raw content or identities',()=>{
  const out=importAgentArenaNeutralRun(run([result(true)]),opts);
  assert.equal(out.correctness_pass_rate,1);
  assert.equal(out.work_on_correct_tasks.median_duration_ms,1000);
  assert.equal(out.work_on_correct_tasks.median_tokens,500);
  assert.equal(out.work_on_correct_tasks.median_cost_usd,null);
  assert.equal(out.work_per_correct_completion.duration_ms,1000);
  assert.equal(out.work_per_correct_completion.tokens,500);
  assert.equal(out.work_per_correct_completion.cost_usd,null);
  assert.equal(out.composite_score_used_for_correctness,false);
  assert.match(out.task_coordinate,/^sha256:[0-9a-f]{64}$/);
  assert.match(out.sanitized_attempts[0].attempt_coordinate,/^sha256:[0-9a-f]{64}$/);
  const text=JSON.stringify(out);
  for(const secret of ['secret-task-id','secret-judge-set','secret-repo-baseline','secret-model','secret-provider','secret-version','secret summary','secret diff','secret prompt','secret stdout','secret stderr','/secret/trace.jsonl','/secret/ws']) assert.equal(text.includes(secret),false);
});

test('does not let composite score override failed functional evidence',()=>{
  const r=result(false,{compositeScore:100,judgeResults:[judge('test-result',false,true)]});
  const out=importAgentArenaNeutralRun(run([r]),opts);
  assert.equal(out.passed_attempts,0); assert.equal(out.failed_attempts,1); assert.equal(out.correctness_pass_rate,0);
});

test('requires execution, validation and every functional judge to pass',()=>{
  const r=result(true,{judgeResults:[judge('test-result',true,true),judge('file-contains',false,false)]});
  const out=importAgentArenaNeutralRun(run([r]),opts);
  assert.equal(out.correctness_pass_rate,0);
});

test('excludes task-pack/environment/cancelled and preflight-invalid attempts',()=>{
  const excluded1=result(false,{scoreExcluded:true,failureCategory:'task-pack'});
  const excluded2=result(false,{failureCategory:'environment'});
  const excluded3=result(false,{status:'cancelled',failureCategory:'cancelled'});
  const excluded4=result(false,{preflight:{status:'blocked'}});
  const out=importAgentArenaNeutralRun(run([excluded1,excluded2,excluded3,excluded4,result(true)]),opts);
  assert.equal(out.infrastructure_excluded_attempts,4); assert.equal(out.eligible_attempts,1); assert.equal(out.correctness_pass_rate,1);
});

test('agent/model failures remain eligible failed task attempts',()=>{
  const failed=result(false,{failureCategory:'agent',executionStatus:'failed',validationStatus:'not-run'});
  const out=importAgentArenaNeutralRun(run([failed,result(true)]),opts);
  assert.equal(out.eligible_attempts,2); assert.equal(out.failed_attempts,1); assert.equal(out.correctness_pass_rate,.5);
});

test('unreliable token and unavailable cost metrics remain unknown',()=>{
  const r=result(true,{tokenUsageReliable:false,dataQualityWarning:'secret warning',missingCriticalEvents:['secret'],costKnown:true,costQuality:'estimated',estimatedCostUsd:4});
  const out=importAgentArenaNeutralRun(run([r]),opts);
  assert.equal(out.work_on_correct_tasks.median_tokens,null);
  assert.equal(out.work_on_correct_tasks.median_input_tokens,null);
  assert.equal(out.work_on_correct_tasks.median_cost_usd,null);
  assert.equal(out.work_per_correct_completion.duration_ms,1000);
  assert.equal(out.work_per_correct_completion.tokens,null);
  assert.equal(out.work_per_correct_completion.cost_usd,null);
  assert.equal(JSON.stringify(out).includes('secret warning'),false);
});

test('fails closed without matched fairness identity or functional judges',()=>{
  const r=run([result(true)]); delete r.fairComparison.taskIdentity;
  assert.throws(()=>importAgentArenaNeutralRun(r,opts),/taskIdentity/);
  const noFunctional=result(true,{judgeResults:[judge('token-efficiency',true,false),judge('lint-check',true,false)]});
  assert.throws(()=>importAgentArenaNeutralRun(run([noFunctional]),opts),/lacks deterministic functional judge/);
});

test('filters non-Codex and demo rows rather than mixing incomparable harnesses',()=>{
  const other=result(true,{baseAgentId:'claude-code'});
  const demo=result(true,{adapterKind:'demo'});
  const out=importAgentArenaNeutralRun(run([other,demo,result(true)]),opts);
  assert.equal(out.eligible_attempts,1);
});

test('proof is deterministic and runtime coordinate changes with model identity without retaining it',()=>{
  const a=importAgentArenaNeutralRun(run([result(true)]),opts);
  const changed=result(true,{requestedConfig:{model:'other-secret-model',reasoningEffort:'high'},resolvedRuntime:{effectiveModel:'other-secret-model',effectiveReasoningEffort:'high',effectiveAgentVersion:'secret-version',verification:'confirmed'}});
  const b=importAgentArenaNeutralRun(run([changed]),opts);
  assert.equal(a.proof_fingerprint,importAgentArenaNeutralRun(run([result(true)]),opts).proof_fingerprint);
  assert.notEqual(a.sanitized_attempts[0].runtime_coordinate,b.sanitized_attempts[0].runtime_coordinate);
  assert.equal(JSON.stringify(b).includes('other-secret-model'),false);
});
