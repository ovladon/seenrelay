import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync(new URL('../scripts/overlap-proof.ts', import.meta.url), 'utf8');
const docs = fs.readFileSync(new URL('../docs/OVERLAP_PROOF.md', import.meta.url), 'utf8');

test('overlap proof remains local-only and does not accept raw result fields', () => {
  assert.match(script, /network_calls:\s*0/);
  assert.match(script, /raw_values_accepted:\s*false/);
  assert.match(script, /source_urls_emitted:\s*false/);
  assert.match(script, /fact_keys_emitted:\s*false/);
  for (const field of ['value', 'known_value', 'result', 'payload', 'response', 'output', 'content']) {
    assert.match(script, new RegExp(`['\"]${field}['\"]`));
  }
  assert.doesNotMatch(script, /fetch\s*\(/);
  assert.doesNotMatch(script, /https:\/\/seenrelay\.com/);
  assert.match(docs, /measurement tool only/i);
  assert.match(docs, /not.*safe to skip/i);
});
