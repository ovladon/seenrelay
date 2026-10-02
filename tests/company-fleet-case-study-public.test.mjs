import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('src/company-fleet-case-study.ts');
const index=read('src/index.ts');
const adoption=read('src/adoption.ts');
const landing=read('src/landing.ts');
const proof=read('src/proof-atlas.ts');

test('company fleet case study freezes the measured first-party receipt',()=>{
  assert.match(page,/provider_cost_usd: 0\.16499684/);
  assert.match(page,/provider_cost_usd: 0\.05560972/);
  assert.match(page,/gross_provider_cost_avoided_usd: 0\.10938712/);
  assert.match(page,/gross_provider_cost_reduction_fraction: 0\.662964939/);
  assert.match(page,/billable_web_search_actions: 13/);
  assert.match(page,/billable_web_search_actions: 4/);
  assert.match(page,/department_agents: 8/);
  assert.match(page,/independent_role_analyses_preserved: 8/);
  assert.match(page,/authoritative_shared_packets: 2/);
  assert.match(page,/cross_tenant_reuse: false/);
  assert.match(page,/semantic_contract_pass: true/);
  assert.match(page,/tenant_isolation_pass: true/);
});

test('case study keeps synthetic-client and customer-ROI boundaries explicit',()=>{
  assert.match(page,/first_party_tenants: 1/);
  assert.match(page,/synthetic_external_client_tenants: 1/);
  assert.match(page,/customer_roi_claim: false/);
  assert.match(page,/external_adoption_claim: false/);
  assert.match(page,/net_customer_savings_claim: false/);
  assert.match(page,/universal_savings_claim: false/);
  assert.match(page,/explicitly synthetic external-client rehearsal/i);
  assert.match(page,/not customer ROI/i);
  assert.match(page,/Local coordination, engineering and integration overhead were not monetized/i);
});

test('case study is discoverable by humans and agents',()=>{
  assert.match(index,/app\.get\('\/case-studies\/company-fleet'/);
  assert.match(index,/app\.get\('\/case-studies\/company-fleet\.json'/);
  assert.match(adoption,/path: '\/case-studies\/company-fleet'/);
  assert.match(adoption,/Machine-readable verified savings record: \${origin}\/case-studies\/company-fleet\.json/);
  assert.match(landing,/href="\/case-studies\/company-fleet"/);
  assert.match(proof,/adoption_path: '\/case-studies\/company-fleet'/);
  assert.match(proof,/link_label: 'Case study →'/);
});

test('case study calls for measurement instead of universal adoption',()=>{
  assert.match(page,/npx seenrelay scan/);
  assert.match(page,/Do not assume your workload has the same pattern/i);
  assert.match(page,/stronger native controls enabled/i);
  assert.match(page,/SeenRelay should be removed/i);
  assert.doesNotMatch(page,/guaranteed savings|always saves|customer ROI proven/i);
});
