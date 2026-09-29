import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const landing = readFileSync('src/landing.ts', 'utf8');
const evidence = readFileSync('docs/VERIFIED_FLEET_BROWSER_OVERLAP_2026-09-29.md', 'utf8');

test('homepage exposes a compact bounded provider-unit proof and links to full evidence', () => {
  assert.match(landing, /18 → 9/);
  assert.match(landing, /6 browser jobs became 3 jobs \+ 3 follower reuses/i);
  assert.match(landing, /href="\/fleet#measured-proof"/);
  assert.match(landing, /Customer ROI is measured, not assumed/i);
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
