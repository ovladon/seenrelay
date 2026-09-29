import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/benchmark-fleet-firecrawl-cross-worker.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/fleet-firecrawl-cross-worker-economics.yml', 'utf8');

test('cross-worker Firecrawl benchmark preserves native-control and evidence boundaries', () => {
  assert.match(script, /SeenRelayFleetShadowMeter/);
  assert.match(script, /SeenRelayFleetCoordinator/);
  assert.match(script, /boundingBox\(\)/);
  assert.match(script, /providerNativeCache:\s*'enabled'/);
  assert.doesNotMatch(script, /maxAge\s*:\s*0/);
  assert.match(script, /first_party_controlled_mechanics/);
  assert.match(script, /dollarSavingsClaim:\s*null/);
  assert.match(script, /not a natural customer workload/i);
  assert.match(script, /distributed single-flight/i);
  assert.match(script, /Natural fleet ROI still requires the separate FLEET_OVERLAP_GATE/i);
});

test('benchmark workflow runs the exact branch code and retains raw evidence artifact', () => {
  assert.match(workflow, /Fleet Firecrawl Cross-Worker Economics/);
  assert.match(workflow, /benchmark-fleet-firecrawl-cross-worker\.mjs/);
  assert.match(workflow, /fleet-firecrawl-cross-worker-economics\.json/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /pull_request/);
});
