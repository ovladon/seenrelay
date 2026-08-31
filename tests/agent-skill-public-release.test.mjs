import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const index=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const adoption=fs.readFileSync(new URL('../src/adoption.ts',import.meta.url),'utf8');
const pub=fs.readFileSync(new URL('../src/public.ts',import.meta.url),'utf8');
const skill=fs.readFileSync(new URL('../skills/seenrelay/SKILL.md',import.meta.url),'utf8');
test('preferred and legacy Agent Skill discovery routes are additive and CORS-readable',()=>{
  for(const route of ['/.well-known/agent-skills/index.json','/.well-known/skills/index.json','/.well-known/agent-skills/seenrelay/SKILL.md','/.well-known/skills/seenrelay/SKILL.md']) assert.match(index,new RegExp(route.replaceAll('/','\\/')));
  assert.equal((index.match(/access-control-allow-origin','\*'/g)??[]).length,4);
  assert.doesNotMatch(index,/app\.(?:get|post|all)\('\/v1\/(?:skill|capability|profile)/i);
});
test('llms surface advertises preferred skill discovery and legacy fallback',()=>{
  assert.match(adoption,/\.well-known\/agent-skills\/index\.json/);
  assert.match(adoption,/\.well-known\/agent-skills\/seenrelay\/SKILL\.md/);
  assert.match(adoption,/Legacy Agent Skill discovery fallback/);
});
test('service descriptor exposes only discovery links',()=>{
  assert.match(pub,/agent_skills_index/); assert.match(pub,/agent_skill/);
  assert.doesNotMatch(pub,/\/v1\/(?:skill|capability|profile)/i);
});
test('skill remains version-agnostic and conservative',()=>{
  assert.doesNotMatch(skill,/client v?0\.2\.7|version: 0\.2\.7/);
  assert.match(skill,/Ambient starts as measurement, not authorization/i);
  assert.match(skill,/Do not invent an integration for Google ADK, Microsoft Agent Framework, CrewAI/i);
});
