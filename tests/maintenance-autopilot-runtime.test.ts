import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMaintenanceAutopilot } from '../src/maintenance-autopilot.js';
import { maintenanceCron } from '../src/maintenance.js';

const healthyInput = () => ({
  controls:{mode:'NORMAL',checks_enabled:true,observes_enabled:true,rewards_enabled:true},
  operational_summary:{checks_month:20,unknown_month:2},
  adoption:{status:'ok',summary:{leases_external:1,leases_external_repeat:0,leases_external_bidirectional:0,leases_external_reuse_consumers:0}},
  safety:{billing_enabled:false,admin_secret_configured:true,privacy_salt_configured:true,hive_signing_secret_dedicated:true,internal_telemetry_classifier_configured:true,maintenance_cron_configured:true,provider_spend_cap_verified_by_app:false},
  credential_rotation:{transition_active:false}
});

test('maintenance evaluator permits only retention housekeeping as automatic Production mutation', () => {
  const result=evaluateMaintenanceAutopilot(healthyInput());
  assert.equal(result.state,'HEALTHY');
  assert.deepEqual(result.automatic_mutation_policy.allowed,['retention-housekeeping']);
  assert.ok(result.automatic_mutation_policy.forbidden.includes('merge-to-main'));
  assert.ok(result.automatic_mutation_policy.forbidden.includes('auto-enable-reuse'));
  assert.deepEqual(result.recommendations.filter(x=>x.automatic_action!=='none').map(x=>x.id),['retention-housekeeping']);
});

test('maintenance evaluator degrades rather than guessing when adoption classification is unavailable', () => {
  const input=healthyInput();
  input.adoption={status:'unavailable',summary:{}};
  const result=evaluateMaintenanceAutopilot(input);
  assert.equal(result.state,'DEGRADED');
  assert.ok(result.recommendations.some(x=>x.id==='restore-adoption-classification'));
  assert.ok(!result.recommendations.some(x=>x.automatic_action!=='none' && x.id!=='retention-housekeeping'));
});

test('maintenance evaluator never responds to high UNKNOWN by enabling reuse or synthetic seeding', () => {
  const input=healthyInput();
  input.operational_summary={checks_month:1000,unknown_month:900};
  const result=evaluateMaintenanceAutopilot(input);
  const rec=result.recommendations.find(x=>x.id==='review-high-global-unknown');
  assert.ok(rec);
  assert.equal(rec?.automatic_action,'none');
  assert.match(rec?.message||'',/do not auto-enable reuse or seed synthetic traffic/i);
});

test('maintenance cron fails closed before any database work when CRON_SECRET is missing or incorrect', async () => {
  const previous=process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    let response=await maintenanceCron(new Request('https://seenrelay.test/internal/maintenance'));
    assert.equal(response.status,503);
    process.env.CRON_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    response=await maintenanceCron(new Request('https://seenrelay.test/internal/maintenance',{headers:{authorization:'Bearer wrong'}}));
    assert.equal(response.status,401);
  } finally {
    if(previous===undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET=previous;
  }
});
