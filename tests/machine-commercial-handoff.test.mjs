import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const commercial=read('src/commercial.ts');
const agent=read('src/agent-adoption.ts');
const index=read('src/index.ts');
const adoption=read('src/adoption.ts');
const publicSource=read('src/public.ts');
const issue=read('.github/ISSUE_TEMPLATE/commercial-interest.yml');

test('commercial descriptor remains non-binding with billing off',()=>{
  assert.match(commercial,/schema: 'seenrelay-value-handoff-v1'/);
  assert.match(commercial,/billing_enabled: false/);
  assert.match(commercial,/purchase_available: false/);
  assert.match(commercial,/commercial_activation_authorized: false/);
  assert.match(commercial,/binding_order: false/);
  assert.match(commercial,/payment_obligation_created: false/);
  assert.match(commercial,/current_checkout_url: null/);
  assert.match(commercial,/current_payment_provider: null/);
  assert.match(commercial,/current_price_offer: null/);
});

test('machine discovery exposes the commercial handoff without a payment surface',()=>{
  assert.match(index,/app\.get\('\/commercial\.json'/);
  assert.match(index,/commercial\.json.*service-meta/);
  assert.match(publicSource,/commercial: .*commercial\.json/);
  assert.match(adoption,/Value handoff after measured savings/);
  assert.match(adoption,/billing is OFF/);
  assert.match(adoption,/may not create a payment or activate billing/);
});

test('agent post-receipt growth loop recommends adjacent scans without auto-mutation',()=>{
  assert.match(agent,/scan_adjacent_workloads_without_auto_installing_or_mutating_them/);
  assert.match(agent,/emit_sanitized_receipt_to_project_operator/);
  assert.match(agent,/if_independent_wtp_or_procurement_intent_exists_open_commercial_handoff/);
  assert.match(agent,/requires_project_or_human_authority: true/);
  assert.match(agent,/may_create_payment: false/);
  assert.match(agent,/may_activate_billing: false/);
  assert.match(agent,/may_auto_install_into_adjacent_project: false/);
  assert.match(agent,/may_auto_enable_reuse: false/);
});

test('commercial interest issue collects broad non-sensitive WTP evidence only',()=>{
  assert.match(issue,/Commercial interest after measured savings/);
  assert.match(issue,/non-binding demand\/WTP evidence only/i);
  assert.match(issue,/Under \$120\/year/);
  assert.match(issue,/Over \$15,000\/year/);
  assert.match(issue,/Low-friction self-serve/);
  assert.match(issue,/Enterprise \/ offline \/ air-gapped/);
  assert.match(issue,/OEM \/ embedded licensing/);
  assert.match(issue,/do not post confidential invoices/i);
  assert.match(issue,/public, non-binding demand signal/i);
});

test('public commercial surfaces do not pretend a current checkout exists',()=>{
  assert.doesNotMatch(commercial,/stripe|checkout\.session|buy now|subscribe now/i);
  assert.doesNotMatch(agent,/auto[-_ ]?purchase|charge customer|activate billing automatically/i);
});
