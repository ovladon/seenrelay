import test from 'node:test';
import assert from 'node:assert/strict';
import { importBrowserGymWebArenaNeutralRecords } from '../scripts/browsergym-webarena-neutral-importer-v1.mjs';

const B='9e779f087de9a65668b6974d11f9ce9816026e96';
const A='cbc35a9bc0facaf731bc858c5825edbe757c719f';
const S=`sha256:${'c'.repeat(64)}`;
const R=`sha256:${'d'.repeat(64)}`;
const opts={browserGymCommit:B,agentLabCommit:A,sourceEvidenceFingerprint:S,runtimeEvidenceFingerprint:R};
const rec=(reward=1, extra={})=>({
  'env_args.task_name':'secret-webarena-task',
  'env_args.task_seed':42,
  'env_args.max_steps':20,
  'env_args.task_kwargs.secret_server':'secret-value',
  'agent_args.agent_name':'secret-agent',exp_id:'secret-exp-id',
  n_steps:5,cum_reward:reward,cum_raw_reward:reward,err_msg:null,stack_trace:null,terminated:true,truncated:false,
  'stats.cum_agent_elapsed':3.5,'stats.cum_step_elapsed':6.5,
  ...extra
});

test('imports WebArenaVerified reward and AgentLab work without raw content',()=>{
  const out=importBrowserGymWebArenaNeutralRecords([rec(1),rec(0)],opts);
  assert.equal(out.eligible_episodes,2); assert.equal(out.passed_episodes,1); assert.equal(out.correctness_pass_rate,.5);
  assert.equal(out.work_on_correct_tasks.median_agent_elapsed_seconds,3.5);
  assert.equal(out.work_on_correct_tasks.median_environment_step_elapsed_seconds,6.5);
  assert.equal(out.work_on_correct_tasks.median_browser_actions,5);
  assert.equal(out.work_on_correct_tasks.median_model_tokens,null);
  assert.equal(out.work_per_correct_completion.agent_elapsed_seconds,7);
  assert.equal(out.work_per_correct_completion.environment_step_elapsed_seconds,13);
  assert.equal(out.work_per_correct_completion.browser_actions,10);
  assert.match(out.sanitized_episodes[0].task_coordinate,/^sha256:[0-9a-f]{64}$/);
  assert.match(out.sanitized_episodes[0].attempt_coordinate,/^sha256:[0-9a-f]{64}$/);
  const text=JSON.stringify(out);
  for(const secret of ['secret-webarena-task','secret-value','secret-agent','secret-exp-id']) assert.equal(text.includes(secret),false);
});

test('full success requires score 1, termination and no truncation',()=>{
  const truncated=rec(1,{terminated:false,truncated:true});
  const partial=rec(.5);
  const out=importBrowserGymWebArenaNeutralRecords([truncated,partial],opts);
  assert.equal(out.passed_episodes,0); assert.equal(out.failed_episodes,2); assert.equal(out.correctness_pass_rate,0);
});

test('AgentLab errors are excluded as ambiguous rather than counted as task failure',()=>{
  const bad=rec(0,{err_msg:'secret infrastructure or agent error',stack_trace:'secret stack'});
  const out=importBrowserGymWebArenaNeutralRecords([bad,rec(1)],opts);
  assert.equal(out.ambiguous_error_episodes_excluded,1); assert.equal(out.eligible_episodes,1); assert.equal(out.correctness_pass_rate,1);
  const text=JSON.stringify(out); assert.equal(text.includes('secret infrastructure'),false); assert.equal(text.includes('secret stack'),false);
});

test('incomplete episodes are excluded but budget truncation is a valid failure',()=>{
  const incomplete=rec(0,{terminated:false,truncated:false});
  const budget=rec(0,{terminated:false,truncated:true});
  const out=importBrowserGymWebArenaNeutralRecords([incomplete,budget],opts);
  assert.equal(out.incomplete_episodes_excluded,1); assert.equal(out.eligible_episodes,1); assert.equal(out.failed_episodes,1);
});

test('private task coordinate changes with task seed or task kwargs without retaining them',()=>{
  const a=importBrowserGymWebArenaNeutralRecords([rec(1)],opts);
  const b=importBrowserGymWebArenaNeutralRecords([rec(1,{'env_args.task_seed':43})],opts);
  const c=importBrowserGymWebArenaNeutralRecords([rec(1,{'env_args.task_kwargs.secret_server':'other-secret'})],opts);
  assert.notEqual(a.sanitized_episodes[0].task_coordinate,b.sanitized_episodes[0].task_coordinate);
  assert.notEqual(a.sanitized_episodes[0].task_coordinate,c.sanitized_episodes[0].task_coordinate);
  assert.equal(JSON.stringify(c).includes('other-secret'),false);
});

test('fails closed on cohort revision or proof drift',()=>{
  assert.throws(()=>importBrowserGymWebArenaNeutralRecords([rec(1)],{...opts,browserGymCommit:'bad'}),/BrowserGym commit/);
  assert.throws(()=>importBrowserGymWebArenaNeutralRecords([rec(1)],{...opts,agentLabCommit:'bad'}),/AgentLab commit/);
  assert.throws(()=>importBrowserGymWebArenaNeutralRecords([rec(1)],{...opts,runtimeEvidenceFingerprint:'bad'}),/runtimeEvidenceFingerprint/);
});

test('fails closed on malformed/out-of-scale evaluator or work values',()=>{
  assert.throws(()=>importBrowserGymWebArenaNeutralRecords([rec(2)],opts),/outside full-success scale/);
  assert.throws(()=>importBrowserGymWebArenaNeutralRecords([rec(1,{'stats.cum_agent_elapsed':-1})],opts),/agent_elapsed/);
  assert.throws(()=>importBrowserGymWebArenaNeutralRecords([rec(1,{n_steps:1.5})],opts),/integer/);
});

test('proof is deterministic for identical sanitized evidence',()=>{
  const a=importBrowserGymWebArenaNeutralRecords([rec(1)],opts);
  const b=importBrowserGymWebArenaNeutralRecords([rec(1)],opts);
  assert.equal(a.proof_fingerprint,b.proof_fingerprint);
});
