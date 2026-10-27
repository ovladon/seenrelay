import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyDeltaEvidence as classify } from '../scripts/commit-delta-shadow-v0.mjs';

const h = s => createHash('sha256').update(s).digest('hex');
const env = h('node22:syntax-check:tenant1');
const git = (dir,...args) => execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
const dep = (key,value,kind='git_blob') => ({key,kind,fingerprint:h(value)});
const frozen = (op,deps,environment=env) => ({
  schema:'seenrelay-commit-evidence-snapshot-v0',
  scope:'private-fixture-tenant',operation:op,environment_digest:environment,
  proof:{authoritative_validated:true,dependencies_complete:true,artifact_present:true,output_digest:h(op)},
  policy:{side_effect_class:'read_only',exact_single_answer_shareable:true,independent_samples_required:false},
  dependencies:deps
});
const now = (snap,deps,extra={}) => ({
  schema:'seenrelay-commit-evidence-current-v0',
  scope:snap.scope,operation:snap.operation,
  environment_digest:snap.environment_digest,
  artifact_present:true,now_ms:1000,dependencies:deps.map(d=>({
    ...d,...(d.kind==='mutable_external'?{source_verified:true,valid_until_ms:2000}:{})
  })),...extra
});

test('Delta compares real git blob identity, not entire commit SHA',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seenrelay-delta-git-'));
  try {
    git(dir,'init','-q');
    git(dir,'config','user.name','CI Fixture');
    git(dir,'config','user.email','ci@example.invalid');
    fs.mkdirSync(path.join(dir,'src'));
    const put=(p,s)=>fs.writeFileSync(path.join(dir,p),s);
    const commit=(message)=>{git(dir,'add','.');git(dir,'commit','-qm',message);return git(dir,'rev-parse','HEAD')};
    put('src/api.mjs','export const add=(a,b)=>a+b;\n');
    put('src/ui.mjs','export const label="alpha";\n');
    put('README.md','initial\n');
    const a=commit('A');
    const blob=(sha)=>git(dir,'show',sha+':src/api.mjs');
    const old=frozen('node-check-api',[dep('src/api.mjs',blob(a))]);
    put('README.md','changed docs\n');
    const b=commit('B');
    assert.notEqual(a,b);
    assert.equal(classify(old,now(old,[dep('src/api.mjs',blob(b))])).decision,'REUSE_CANDIDATE_AFTER_NATIVE_CONTROLS');
    put('src/ui.mjs','export const label="beta";\n');
    const c=commit('C');
    assert.equal(classify(old,now(old,[dep('src/api.mjs',blob(c))])).decision,'REUSE_CANDIDATE_AFTER_NATIVE_CONTROLS');
    put('src/api.mjs','export const add=(a,b)=>a+b+1;\n');
    const d=commit('D');
    assert.deepEqual(classify(old,now(old,[dep('src/api.mjs',blob(d))])).affected,['src/api.mjs']);
    put('src/api.mjs','export const add=(a,b)=>a+b;\n');
    const e=commit('E');
    assert.equal(classify(old,now(old,[dep('src/api.mjs',blob(e))])).decision,'REUSE_CANDIDATE_AFTER_NATIVE_CONTROLS');
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});

test('external Delta cannot claim freshness without current source evidence',()=>{
  const deps=[dep('src/a','a'),dep('provider:feed','v1','mutable_external')];
  const prior=frozen('check-external',deps);
  assert.equal(classify(prior,now(prior,deps)).decision,'REUSE_CANDIDATE_AFTER_NATIVE_CONTROLS');
  assert.deepEqual(classify(prior,now(prior,[deps[0],dep('provider:feed','v2','mutable_external')])).affected,['provider:feed']);
  assert.equal(classify(prior,now(prior,deps,{now_ms:2000})).reason,'EXTERNAL_STATE_NOT_AUTHORITATIVELY_FRESH');
  assert.equal(classify(prior,now(prior,[deps[0],{...deps[1],source_verified:false}],{
    dependencies:[deps[0],{...deps[1],source_verified:false,valid_until_ms:2000}]
  })).decision,'REVALIDATION_REQUIRED');
});

test('incomplete lineage, scope/environment mismatch and independent reviews fail closed',()=>{
  const deps=[dep('src/a','a')], old=frozen('review-evidence',deps);
  assert.equal(classify(old,now(old,deps,{scope:'another-tenant'})).reason,'SCOPE_CHANGED_OR_MISSING');
  assert.equal(classify(old,now(old,deps,{environment_digest:h('other-runner')})).reason,'ENVIRONMENT_CHANGED_OR_MISSING');
  assert.equal(classify(old,now(old,[])).reason,'DEPENDENCY_SET_CHANGED');
  assert.equal(classify({...old,proof:{...old.proof,dependencies_complete:false}},now(old,deps)).reason,'PROOF_OR_ARTIFACT_UNAVAILABLE');
  assert.equal(classify({...old,policy:{...old.policy,independent_samples_required:true}},now(old,deps)).reason,'UNSAFE_OR_INDEPENDENT_WORK');
  assert.equal(classify({...old,policy:{...old.policy,side_effect_class:'mutation'}},now(old,deps)).reason,'UNSAFE_OR_INDEPENDENT_WORK');
});

test('five-stage controlled workload: Delta selective invalidation ties strongest task-input cache',()=>{
  const tasks=[{op:'api-check',keys:['api']},{op:'ui-check',keys:['ui']},{op:'feed-analysis',keys:['api','feed']}];
  const state={api:h('api1'),ui:h('ui1'),feed:h('feed1')};
  const retained=new Map(),nativeCache=new Set();
  let environment=env,global=0,delta=0,bestNative=0;
  const stages=[
    ()=>{},
    ()=>{state.docs=h('docs changed')},
    ()=>{state.ui=h('ui2')},
    ()=>{state.feed=h('feed2')},
    ()=>{environment=h('toolchain changed')}
  ];
  for (const change of stages) {
    change();
    for (const task of tasks) {
      global++;
      const deps=task.keys.map(k=>({key:k==='feed'?'provider:feed':'src/'+k+'.mjs',kind:k==='feed'?'mutable_external':'git_blob',fingerprint:state[k]}));
      const nativeKey=h(task.op+environment+JSON.stringify(deps));
      if (!nativeCache.has(nativeKey)){nativeCache.add(nativeKey);bestNative++}
      const old=retained.get(task.op);
      const query=old?now(old,deps,{environment_digest:environment}):null;
      if (!old||classify(old,query).decision==='REVALIDATION_REQUIRED'){
        delta++;
        retained.set(task.op,frozen(task.op,deps,environment));
      }
    }
  }
  assert.deepEqual({global,delta,bestNative},{global:15,delta:8,bestNative:8});
  console.log('COMMIT_DELTA_SHADOW '+JSON.stringify({
    scope:'controlled_simulation_not_real_AI_provider_cost',
    phases:5,checks_per_phase:3,
    global_invalidation_checks:global,delta_checks:delta,strong_native_input_cache_checks:bestNative,
    candidate_checks_preserved_vs_global:global-delta,
    incremental_savings_vs_strong_native:bestNative-delta,
    independent_review_reuse:false,customer_net_savings_usd:null
  }));
});
