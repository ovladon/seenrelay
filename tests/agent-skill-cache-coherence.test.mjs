import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const gate=fs.readFileSync(new URL('../.github/workflows/production-adoption-gate.yml',import.meta.url),'utf8');

test('Agent Skill discovery disables stale browser and CDN caching',()=>{
  assert.ok(index.includes("function noStoreMachineDiscovery"));
  assert.ok(index.includes("c.header('cache-control', 'no-store')"));
  assert.ok(index.includes("c.header('cdn-cache-control', 'no-store')"));
  assert.ok(index.includes("c.header('vercel-cdn-cache-control', 'no-store')"));
  for(const route of [
    '/.well-known/agent-skills/index.json',
    '/.well-known/skills/index.json',
    '/.well-known/agent-skills/seenrelay/SKILL.md',
    '/.well-known/skills/seenrelay/SKILL.md'
  ]) {
    const line=index.split('\n').find(x=>x.includes(route));
    assert.ok(line, route);
    assert.ok(line.includes('noStoreMachineDiscovery(c)'), line);
  }
});

test('Production canonical skill verification is release cache-busted',()=>{
  assert.ok(gate.includes('SKILL.md?release=$RELEASE_SHA'));
  assert.ok(gate.includes('steps.applicability.outputs.release_sha'));
});
