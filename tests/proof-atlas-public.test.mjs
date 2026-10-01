import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const proof=read('src/proof-atlas.ts');
const landing=read('src/landing.ts');
const index=read('src/index.ts');
const publicDescriptor=read('src/public.ts');
const adoption=read('src/adoption.ts');

test('Proof Atlas exposes repeated controlled results without customer ROI claims',()=>{
  assert.match(proof,/controlled_first_party_benchmark/);
  assert.match(proof,/74\.95%/);
  assert.match(proof,/66\.88% mean/);
  assert.match(proof,/Retail price monitoring/);
  assert.match(proof,/repeatability: '3\/3'/);
  assert.match(proof,/customer_roi_claim: false/);
  assert.match(proof,/natural_prevalence_claim: false/);
  assert.match(proof,/OCR.*NO PASS|NO PASS[\s\S]*OCR/i);
});

test('Proof Atlas is available to humans and machines',()=>{
  assert.match(index,/app\.get\('\/proof'/);
  assert.match(index,/app\.get\('\/proof\.json'/);
  assert.match(publicDescriptor,/controlled_proof_atlas/);
  assert.match(publicDescriptor,/proof_atlas/);
  assert.match(adoption,/path: '\/proof'/);
  assert.match(adoption,/Machine-readable Proof Atlas/);
});

test('homepage leads with measured controlled proof rather than try-and-see claims',()=>{
  assert.match(landing,/We have already paid both sides of the experiment/);
  assert.match(landing,/\$1\.44/);
  assert.match(landing,/75%/);
  assert.match(landing,/66\.88%/);
  assert.match(landing,/Controlled proof is not customer savings|first-party mechanism\/unit-economics/i);
  assert.doesNotMatch(landing,/guaranteed savings|always saves|customer ROI proven/i);
});
