import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('postgres core migration contains the three fact tables', () => {
  const sql = fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  for (const table of ['facts', 'observations_recent', 'observer_fact_state']) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql, /jsonb/i);
});

test('Hive migrations contain lease, useful-reuse, telemetry and conservative independence state', () => {
  const hive = fs.readFileSync(new URL('../migrations/0002_hive.sql', import.meta.url), 'utf8');
  const hardening = fs.readFileSync(new URL('../migrations/0004_reuse_independence.sql', import.meta.url), 'utf8');
  for (const table of ['hive_leases', 'useful_reuse_events', 'hive_metrics_daily']) assert.match(hive, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(hive, /lease_id/);
  assert.match(hive, /client_key/);
  assert.match(hive, /contributor_lease_id/);
  assert.match(hive, /consumer_lease_id/);
  assert.match(hardening, /independence_key/);
  assert.match(hardening, /privacy-salted conservative network bucket/i);
  assert.doesNotMatch(`${hive}\n${hardening}`, /email|password|real_name/i);
});

test('MCP uses the official v2 server SDK', () => {
  const text = fs.readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['@modelcontextprotocol/server'], '2.0.0');
  assert.match(text, /createMcpHandler/);
  assert.match(text, /McpServer/);
  assert.doesNotMatch(text, /notifications\/initialized/);
});
