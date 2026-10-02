import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const updates=read('src/updates.ts');
const index=read('src/index.ts');
const adoption=read('src/adoption.ts');
const service=read('src/public.ts');

test('owned update stream is derived from canonical public evidence',()=>{
  assert.match(updates,/publicProductFacts\.latest_verified_updates/);
  assert.match(updates,/companyFleetCaseStudy\.verified_at/);
  assert.match(updates,/13 to 4|13.*4/);
  assert.match(updates,/\$0\.16499684/);
  assert.match(updates,/\$0\.05560972/);
  assert.match(updates,/not customer ROI or net customer savings/i);
  assert.match(updates,/not a third-party security certification or vulnerability-free claim/i);
});

test('owned update stream has human JSON and Atom routes',()=>{
  assert.match(index,/\/updates'/);
  assert.match(index,/\/updates\.json'/);
  assert.match(index,/\/updates\.atom'/);
  assert.match(index,/application\/atom\+xml/);
  assert.match(adoption,/path: '\/updates'/);
  assert.match(adoption,/Owned verified update stream/);
  assert.match(service,/updates: .*updates\.json/);
  assert.match(service,/updates_atom: .*updates\.atom/);
});

test('owned update stream does not require social platforms or model generation',()=>{
  assert.doesNotMatch(updates,/twitter|linkedin|reddit|metricool|bufferapp|openai|anthropic/i);
  assert.match(updates,/generated_from:'canonical_public_product_facts_and_verified_public_evidence'/);
});
