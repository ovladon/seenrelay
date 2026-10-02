import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const landing = readFileSync('src/landing.ts', 'utf8');
const evidence = readFileSync('docs/VERIFIED_FLEET_BROWSER_OVERLAP_2026-09-29.md', 'utf8');
const proofAtlas = readFileSync('src/proof-atlas.ts', 'utf8');

test('homepage leads with real monitoring proof while technical provider-unit proof remains in Proof Atlas', () => {
  assert.match(landing, /Real live event monitoring/i);
  assert.match(landing, /79\.61%/);
  assert.match(landing, /href="\/proof"/);
  assert.match(landing, /Controlled proof is not customer savings/i);
  assert.match(proofAtlas, /75%/);
  assert.match(proofAtlas, /Retail extraction guarded by price state/i);
});

test('durable evidence preserves the external-pattern and economics boundaries', () => {
  assert.match(evidence, /langchain-ai\/langgraph\/issues\/7417/);
  assert.match(evidence, /Provider executions \| 6 \| 3/);
  assert.match(evidence, /Firecrawl credits \| 18 \| 9/);
  assert.match(evidence, /Actual avoided executions \| 0 \| 3/);
  assert.match(evidence, /not an independent customer workload/i);
  assert.match(evidence, /Dollar savings remain intentionally unclaimed/i);
  assert.match(evidence, /distributed single-flight implementation/i);
  assert.match(evidence, /FLEET_OVERLAP_GATE\.md/);
});
