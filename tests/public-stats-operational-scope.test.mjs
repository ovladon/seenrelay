import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const publicDb = fs.readFileSync(new URL('../src/public-db.ts', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const landing = fs.readFileSync(new URL('../src/landing.ts', import.meta.url), 'utf8');

test('public stats declares raw hosted activity as operational, not external adoption', () => {
  assert.match(publicDb, /classification:\s*'aggregate-hosted-operational-activity-not-external-adoption'/);
  assert.match(publicDb, /includes_first_party:\s*true/);
  assert.match(publicDb, /includes_controlled_benchmarks:\s*true/);
  assert.match(publicDb, /external_adoption_metric:\s*false/);
  assert.match(publicDb, /unique_actor_metric:\s*false/);
  assert.match(publicDb, /client_only_usage_visible:\s*false/);
  assert.match(publicDb, /active_hive_leases_5m:\s*'pseudonymous operational leases; not unique callers'/);
  assert.match(publicDb, /useful_reuse_metrics:\s*'qualified hosted reuse events across all traffic; not external-adoption reuse'/);
});

test('existing numeric public-stat keys and raw operational formulas remain backward compatible', () => {
  for (const key of [
    'facts', 'recent_observations', 'active_hive_leases_5m', 'checks_month', 'observes_month',
    'useful_reuse_month', 'useful_reuse_total', 'unknown_month', 'qualified_reuse_rate', 'unknown_rate'
  ]) assert.match(publicDb, new RegExp(`\\b${key}\\b`));
  assert.match(publicDb, /qualified_reuse_rate:\s*checks \? reuseChecks \/ checks : 0/);
  assert.match(publicDb, /unknown_rate:\s*checks \? unknown \/ checks : 0/);
});

test('live HTML route uses the factual landing and does not present raw public stats as adoption', () => {
  assert.match(index, /publicLandingPage.*from '.\/landing\.js'/);
  assert.doesNotMatch(landing, /active_hive_leases_5m|qualified_reuse_rate|Useful reuse rate|Active callers/);
});
