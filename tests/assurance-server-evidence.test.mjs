import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const evidence = fs.readFileSync(new URL('../src/check-evidence.ts', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/service.ts', import.meta.url), 'utf8');
test('CHECK exposes only an aggregate reuse-independence count', () => {
  assert.match(evidence, /COUNT\(DISTINCT CASE WHEN h\.independence_key IS NOT NULL THEN h\.independence_key END\)::int AS reuse_independence_buckets/);
  assert.match(evidence, /LEFT JOIN hive_leases h ON h\.lease_id = o\.lease_id/);
  assert.match(service, /recent_reuse_independence_buckets: latest\.reuse_independence_buckets \?\? 0/);
  assert.match(service, /reuse_independence_buckets: g\.reuse_independence_buckets \?\? 0/);
  assert.doesNotMatch(service, /independence_key:/);
});
