import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminDb = fs.readFileSync(new URL('../src/admin-db.ts', import.meta.url), 'utf8');
const publicAdoption = fs.readFileSync(new URL('../src/external-adoption.ts', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('qualified public adoption aggregate requires external contributor and consumer and excludes benchmark facts', () => {
  assert.match(adminDb, /reuse_external_qualified_cross_client_total/);
  assert.match(adminDb, /h\.lease_id=e\.consumer_lease_id AND \$\{meaningfulExternalLease\}/);
  assert.match(adminDb, /h\.lease_id=e\.contributor_lease_id AND \$\{meaningfulExternalLease\}/);
  assert.match(adminDb, /f\.fact_key=e\.fact_key AND \$\{internalBenchmarkFact\}/);
});

test('external adoption endpoint exposes aggregates only with strict claim boundaries', () => {
  assert.match(publicAdoption, /privacy-safe-aggregate-external-technical-adoption/);
  assert.match(publicAdoption, /qualified_cross_client_reuse_events/);
  assert.match(publicAdoption, /unique_humans_or_companies:\s*false/);
  assert.match(publicAdoption, /customer_monetary_savings:\s*false/);
  assert.match(publicAdoption, /recurring_paid_income:\s*false/);
  assert.doesNotMatch(publicAdoption, /lease_id|client_key|independence_key|fact_key|source_url|observer_key/i);
  assert.match(index, /\/external-adoption\.json/);
});
