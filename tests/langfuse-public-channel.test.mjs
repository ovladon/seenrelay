import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../src/langfuse.ts',import.meta.url),'utf8');
const integrations=fs.readFileSync(new URL('../src/integrations.ts',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const adoption=fs.readFileSync(new URL('../src/adoption.ts',import.meta.url),'utf8');

test('Langfuse page offers a local candidate census without claiming savings',()=>{
  assert.match(page,/Already have Langfuse\? Find repeated TOOL spend/);
  assert.match(page,/npx seenrelay langfuse-census observations\.json --json/);
  assert.match(page,/Raw tool input is hashed locally/i);
  assert.match(page,/NEEDS_POLICY_REVIEW/);
  assert.match(page,/recorded repeat cost/i);
  assert.doesNotMatch(page,/guaranteed savings|Langfuse API key.*SeenRelay/i);
});

test('Langfuse is exposed through integrations and discovery surfaces',()=>{
  assert.match(integrations,/Langfuse/);
  assert.match(integrations,/langfuse-census observations\.json --json/);
  assert.match(index,/app\.get\('\/langfuse'/);
  assert.match(adoption,/path: '\/langfuse'/);
  assert.match(adoption,/Langfuse local TOOL census/);
});
