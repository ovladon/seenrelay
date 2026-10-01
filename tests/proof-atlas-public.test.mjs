import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const proof=read('src/proof-atlas.ts');
const landing=read('src/landing.ts');
const index=read('src/index.ts');
const publicDescriptor=read('src/public.ts');
const adoption=read('src/adoption.ts');
const useCases=read('src/use-cases.ts');

test('Proof Atlas exposes repeated controlled results without customer ROI claims',()=>{
  assert.match(proof,/controlled_first_party_benchmark/);
  assert.match(proof,/74\.95%/);
  assert.match(proof,/66\.88% mean/);
  assert.match(proof,/Retail price monitoring/);
  assert.match(proof,/Inventory \/ availability downstream extraction/);
  assert.match(proof,/provider-native maxAge also stayed at 4 calls \/ 4 credits/);
  assert.match(proof,/51\.58% mean/);
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
  assert.match(landing,/We have already run both sides of the experiment against real providers/);
  assert.match(landing,/\$1\.44/);
  assert.match(landing,/75%/);
  assert.match(landing,/66\.88%/);
  assert.match(landing,/Controlled proof is not customer savings|first-party mechanism\/unit-economics/i);
  assert.doesNotMatch(landing,/guaranteed savings|always saves|customer ROI proven/i);
});


test('Use-case Atlas separates validated verticals from experimental and research domains',()=>{
  assert.match(useCases,/VALIDATED_VERTICAL/);
  assert.match(useCases,/Retail prices & product monitoring/);
  assert.match(useCases,/Weather-driven downstream analysis/);
  assert.match(useCases,/Inventory & availability monitoring/);
  assert.match(useCases,/native state endpoint fully answers the need, SeenRelay should self-reject/);
  assert.match(useCases,/Large-scale IoT \/ edge analytics/);
  assert.match(useCases,/Blockchain RPC & agentic chain reads/);
  assert.match(useCases,/Inter-blockchain status & finality evidence/);
  assert.match(useCases,/Robotics & autonomous fleets/);
  assert.match(useCases,/A listed domain is not a deployment or customer-ROI claim/);
  assert.match(index,/app\.get\('\/use-cases'/);
  assert.match(index,/app\.get\('\/use-cases\.json'/);
  assert.match(publicDescriptor,/use_case_atlas/);
  assert.match(adoption,/Machine-readable Use-case Atlas/);
  assert.match(landing,/Explore the full use-case atlas/);
});
