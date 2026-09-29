import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync(new URL('../scripts/benchmark-fleet-firecrawl-browser-overlap.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/fleet-firecrawl-browser-overlap.yml', import.meta.url), 'utf8');

test('fleet browser overlap benchmark preserves evidence boundaries', () => {
  assert.match(script, /SeenRelayFleetCoordinator/);
  assert.match(script, /createRedisRestFleetStore/);
  assert.match(script, /spawn\(/);
  assert.match(script, /page\.goto/);
  assert.match(script, /getBoundingClientRect/);
  assert.doesNotMatch(script, /missing h1/);
  assert.match(script, /provider_native_cache_left_enabled:\s*true/);
  assert.match(script, /explicit_max_age_override:\s*false/);
  assert.doesNotMatch(script, /maxAge\s*:\s*0/);
  assert.match(script, /ordinary_source_fetch_equivalent:\s*false/);
  assert.match(script, /local_browser_is_competing_control:\s*true/);
  assert.match(script, /natural_customer_roi:\s*false/);
  assert.match(script, /langchain-ai\/langgraph\/issues\/7417/);
  assert.match(script, /dollar_savings_claim:\s*null/);
  assert.match(script, /net_savings_claim:\s*null/);
  assert.match(script, /mutation_calls_suppressed:\s*0/);
  assert.match(script, /independent_samples_collapsed:\s*0/);
});

test('workflow is bounded and uploads raw benchmark evidence', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /timeout-minutes:\s*15/);
  assert.match(workflow, /Provision temporary Redis REST test store/);
  assert.match(workflow, /benchmark-fleet-firecrawl-browser-overlap\.mjs/);
  assert.match(workflow, /fleet-firecrawl-browser-overlap-benchmark\.json/);
  assert.match(workflow, /retention-days:\s*30/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
});
