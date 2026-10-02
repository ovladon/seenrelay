import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const action=fs.readFileSync(new URL('../actions/cost-prescreen/action.yml',import.meta.url),'utf8');
const facts=JSON.parse(fs.readFileSync(new URL('../public/product-facts.json',import.meta.url),'utf8'));
const agent=fs.readFileSync(new URL('../src/agent-adoption.ts',import.meta.url),'utf8');
const skill=fs.readFileSync(new URL('../shared/agent-skill.mjs',import.meta.url),'utf8');

test('GitHub cost prescreen pins the current verified public client',()=>{
  assert.match(action,new RegExp('seenrelay@'+facts.install.client_version.replace(/\./g,'\\.')));
});

test('GitHub cost prescreen remains local-only and pre-evidentiary',()=>{
  assert.match(action,/seenrelay@[^\s]+ scan/);
  assert.match(action,/seenrelay@[^\s]+ adopt-plan/);
  assert.doesNotMatch(action,/https:\/\/seenrelay\.com|\/v1\/check|\/v1\/observe|OPENAI|ANTHROPIC/i);
  assert.match(action,/does not contact SeenRelay/i);
  assert.match(action,/does not.*enable reuse/i);
  assert.match(action,/does not.*USE verdict/i);
});

test('agents may propose but not silently install the CI prescreen',()=>{
  assert.match(agent,/github_cost_prescreen_action/);
  assert.match(agent,/project authority permits CI changes/i);
  assert.match(skill,/Do not add or modify a GitHub workflow without caller\/project authority/i);
});

test('action exposes bounded team-visible outputs without failing on candidates',()=>{
  for(const output of ['static_status','candidate_files','decision','report_path','plan_path']){
    assert.match(action,new RegExp(output+':'));
  }
  assert.doesNotMatch(action,/exit\s+1|fail_on_candidate/i);
  assert.match(action,/GITHUB_STEP_SUMMARY/);
});
