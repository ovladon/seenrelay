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
  assert.match(proof,/74\.84%/);
  assert.match(proof,/Retail extraction guarded by price state/);
  assert.match(proof,/Inventory \/ availability downstream extraction/);
  assert.match(proof,/AI gateway cold concurrent cache misses/);
  assert.match(proof,/79\.61% mean/);
  assert.match(proof,/provider-native maxAge also stayed at 4 calls \/ 4 credits/);
  assert.match(proof,/51\.58% mean/);
  assert.match(proof,/repeatability: '3\/3'/);
  assert.match(proof,/customer_roi_claim: false/);
  assert.match(proof,/natural_prevalence_claim: false/);
  assert.match(proof,/best_available_baseline_claim: false/);
  assert.match(proof,/tool_necessity_is_separate_gate: true/);
  assert.match(proof,/baseline_quality: 'MECHANISM_ONLY_LOCAL_WINS'/);
  assert.match(proof,/baseline_quality: 'MECHANISM_ONLY_SOURCE_NATIVE_WINS'/);
  assert.match(proof,/baseline_quality: 'NATIVE_FIRST_CONDITIONAL'/);
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

test('homepage leads with workload-relevant live proof while preserving mechanism/baseline boundaries',()=>{
  assert.match(landing,/REAL PROVIDER PROOF/i);
  assert.match(landing,/Real live event monitoring/i);
  assert.match(landing,/79\.61%/);
  assert.match(landing,/Refresh when the event changes/i);
  assert.match(landing,/\$1\.44/);
  assert.match(landing,/Controlled proof is not customer savings/i);
  assert.match(landing,/Mechanism proof is not best-baseline proof/i);
  assert.match(landing,/Mechanism-only:/i);
  assert.doesNotMatch(landing,/guaranteed savings|always saves|customer ROI proven/i);
});


test('Use-case Atlas separates validated verticals from experimental and research domains',()=>{
  assert.match(useCases,/VALIDATED_VERTICAL/);
  assert.match(useCases,/Retail prices & product monitoring/);
  assert.match(useCases,/Weather-driven downstream analysis/);
  assert.match(useCases,/News & event-driven monitoring/);
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
