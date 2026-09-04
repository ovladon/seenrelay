import test from 'node:test';
import assert from 'node:assert/strict';
import { importMcpUseEvalsNeutralRun } from '../scripts/mcp-use-evals-neutral-importer-v1.mjs';
const C='e655f0ad26c02f47e4625cb48617ccff0a437696';
const S=`sha256:${'a'.repeat(64)}`;
const trial=(pass=true, extra={})=>({
  task:'secret-task-name', variant:'noskill+blank', trial:1, promptHash:'secret-prompt-hash', valid:true,
  grade:{contractPass:pass,scoredForPassRate:true,checks:[],failureCode:pass?null:'contract.calls',sdkPath:'mcp-use'},
  perf:{durationMs:100,turns:2,tokensIn:30,tokensOut:10,toolCalls:4,costUsd:null},
  memoPath:'secret/memo.md',transcriptPath:'secret/transcript.jsonl',error:null,...extra
});
const run=(trials)=>({runId:'secret-run-id',batchId:'secret-batch',startedAt:'secret-time',agentRunner:'codex',agentModel:'x',judgeModel:'y',manifest:{graderVersion:'2.1.0',sandbox:'docker',taskPromptHashes:{secret:'hash'},skillHash:null},trials});
const opts={repositoryCommit:C,sourceEvidenceFingerprint:S};

test('imports correctness and work without raw trial identity/content',()=>{
  const out=importMcpUseEvalsNeutralRun(run([trial(true),trial(false)]),opts);
  assert.equal(out.eligible_trials,2); assert.equal(out.passed_trials,1); assert.equal(out.correctness_pass_rate,.5);
  assert.match(out.sanitized_trials[0].task_coordinate,/^sha256:[0-9a-f]{64}$/);
  assert.match(out.sanitized_trials[0].runtime_coordinate,/^sha256:[0-9a-f]{64}$/);
  assert.match(out.sanitized_trials[0].attempt_coordinate,/^sha256:[0-9a-f]{64}$/);
  assert.equal(out.work_per_correct_completion.duration_ms,200);
  assert.equal(out.work_on_correct_tasks.median_duration_ms,100); assert.equal(out.work_on_correct_tasks.median_cost_usd,null);
  const text=JSON.stringify(out); for(const secret of ['secret-task-name','secret-prompt-hash','secret/memo.md','secret/transcript.jsonl','secret-run-id','secret-batch']) assert.equal(text.includes(secret),false);
  assert.equal(out.optimizer_authorized,false);
});
test('excludes infrastructure-invalid and unscored trials from correctness denominator',()=>{
  const bad=trial(false,{valid:false,error:'secret infra'}); const staticTrial=trial(true); staticTrial.grade.scoredForPassRate=false;
  const out=importMcpUseEvalsNeutralRun(run([bad,staticTrial,trial(true)]),opts);
  assert.equal(out.invalid_infrastructure_trials,1); assert.equal(out.unscored_trials,1); assert.equal(out.eligible_trials,1); assert.equal(out.correctness_pass_rate,1);
});
test('null metrics stay unknown rather than becoming zero',()=>{
  const t=trial(true); t.perf={durationMs:null,turns:null,tokensIn:null,tokensOut:null,toolCalls:null,costUsd:null};
  const out=importMcpUseEvalsNeutralRun(run([t]),opts);
  assert.equal(out.work_on_correct_tasks.median_duration_ms,null); assert.equal(out.work_per_correct_completion.duration_ms,null); assert.equal(out.known_metric_counts.durationMs,0); assert.equal(out.known_metric_counts.costUsd,0);
});
test('passing work medians exclude failed-but-valid trials',()=>{
  const a=trial(true); a.perf.durationMs=100; const b=trial(true); b.perf.durationMs=300; const f=trial(false); f.perf.durationMs=10000;
  const out=importMcpUseEvalsNeutralRun(run([a,b,f]),opts); assert.equal(out.work_on_correct_tasks.median_duration_ms,200); assert.equal(out.work_per_correct_completion.duration_ms,5200);
});
test('fails closed on grader or cohort commit drift',()=>{
  const r=run([trial(true)]); r.manifest.graderVersion='3.0.0'; assert.throws(()=>importMcpUseEvalsNeutralRun(r,opts),/graderVersion/);
  const r2=run([trial(true)]); assert.throws(()=>importMcpUseEvalsNeutralRun(r2,{...opts,repositoryCommit:'bad'}),/repository commit/);
});
test('fails closed when no valid scored trials exist',()=>{
  const t=trial(true); t.valid=false; assert.throws(()=>importMcpUseEvalsNeutralRun(run([t]),opts),/no valid scored/);
});
test('private task coordinate is stable but changes with task or prompt identity',()=>{
  const a=importMcpUseEvalsNeutralRun(run([trial(true)]),opts);
  const changedTask=trial(true); changedTask.task='other-secret-task';
  const b=importMcpUseEvalsNeutralRun(run([changedTask]),opts);
  const changedPrompt=trial(true); changedPrompt.promptHash='other-secret-prompt-hash';
  const c=importMcpUseEvalsNeutralRun(run([changedPrompt]),opts);
  assert.notEqual(a.sanitized_trials[0].task_coordinate,b.sanitized_trials[0].task_coordinate);
  assert.notEqual(a.sanitized_trials[0].task_coordinate,c.sanitized_trials[0].task_coordinate);
  assert.equal(JSON.stringify(a).includes('secret-task-name'),false);
});
test('proof is deterministic for identical sanitized evidence',()=>{
  const a=importMcpUseEvalsNeutralRun(run([trial(true)]),opts); const b=importMcpUseEvalsNeutralRun(run([trial(true)]),opts); assert.equal(a.proof_fingerprint,b.proof_fingerprint);
});
