import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const publicSource=read('src/public.ts');
const canonical=read('skills/seenrelay/SKILL.md');

test('service descriptor exposes one self-serve keep/remove adoption contract without a new hosted operation',()=>{
  assert.match(publicSource,/self_serve_adoption/);
  assert.match(publicSource,/seenrelay-machine-adoption-contract-v1/);
  assert.match(publicSource,/PRESCREEN.*SHADOW.*QUALIFIED.*ACTIVE.*DEMOTED.*REMOVE/s);
  assert.match(publicSource,/caller_or_project_owned_never_granted_by_seenrelay/);
  assert.match(publicSource,/negative_result_is_success:\s*true/);
  assert.match(publicSource,/native_control_first:\s*true/);
  assert.match(publicSource,/fail_open:\s*true/);
  assert.match(publicSource,/verdicts:\s*\['USE', 'DO NOT USE', 'INSUFFICIENT EVIDENCE'\]/);
  assert.match(publicSource,/operations:\s*\['CHECK', 'OBSERVE'\]/);
  assert.doesNotMatch(publicSource,/operations:\s*\[[^\]]*(?:ADOPT|ACTIVATE|MARKET|REWARD)/i);
});

test('Agent Skill treats USE as evidence, never as project mutation authority',async()=>{
  const {agentSkillMarkdown}=await import('../shared/agent-skill.mjs');
  assert.equal(canonical,agentSkillMarkdown());
  assert.match(canonical,/PRESCREEN → SHADOW → QUALIFIED → ACTIVE → DEMOTED \/ REMOVE/);
  assert.match(canonical,/does \*\*not\*\* give you permission to modify the project/i);
  assert.match(canonical,/Do not silently convert `USE` into project mutation authority/);
  assert.match(canonical,/no candidate, stronger native control, `DO NOT USE`/i);
});

test('public adoption contract does not expose private Relay Market or economic arming internals',()=>{
  assert.doesNotMatch(publicSource,/Relay Market|reward beacon|ECONOMIC_ARMED|Prospective Economic ARMED/i);
  assert.doesNotMatch(canonical,/Relay Market|reward beacon|ECONOMIC_ARMED|Prospective Economic ARMED/i);
});
