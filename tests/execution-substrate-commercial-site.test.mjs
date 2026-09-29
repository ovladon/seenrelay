import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const landing = fs.readFileSync(new URL('../src/landing.ts', import.meta.url), 'utf8');
const substrate = fs.readFileSync(new URL('../src/substrate.ts', import.meta.url), 'utf8');
const commercial = fs.readFileSync(new URL('../src/commercial.ts', import.meta.url), 'utf8');
const integrations = fs.readFileSync(new URL('../src/integrations.ts', import.meta.url), 'utf8');
const quickstart = fs.readFileSync(new URL('../src/quickstart.ts', import.meta.url), 'utf8');
const fleet = fs.readFileSync(new URL('../src/fleet.ts', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const adoption = fs.readFileSync(new URL('../src/adoption.ts', import.meta.url), 'utf8');
const pilotTemplate = fs.readFileSync(new URL('../.github/ISSUE_TEMPLATE/commercial-pilot.yml', import.meta.url), 'utf8');

test('public positioning expands below agents without weakening the audit gate', () => {
  assert.match(landing, /Stop paying for the same work twice/);
  assert.match(landing, /Across agents, services, browser jobs, CI and IoT/);
  assert.match(landing, /Find out if your agents are wasting money on repeated checks/);
  assert.match(landing, /Every original authoritative call still runs/);
  assert.match(landing, /DO NOT USE/);
  assert.match(landing, /caller-owned private reuse/i);
  assert.match(landing, /Agent fleets/);
  assert.match(landing, /Commercial pilot/);
});

test('execution substrate page names expanded surfaces and stays native-control-first', () => {
  assert.match(substrate, /Agents \+ MCP tools/);
  assert.match(substrate, /HTTP \/ RPC \/ services/);
  assert.match(substrate, /Tests and validation jobs/);
  assert.match(substrate, /Browser and scraping/);
  assert.match(substrate, /IoT and edge fleets/);
  assert.match(substrate, /OpenTelemetry/);
  assert.match(substrate, /Native state first/);
  assert.match(substrate, /No control suppression/);
  assert.match(substrate, /device shadow/i);
  assert.match(substrate, /subscription/i);
  assert.match(substrate, /Instrument broad\. Coordinate narrow\./);
  assert.match(substrate, /otel-trace-census/);
});

test('commercial surface creates a measured pilot path without silently enabling usage billing', () => {
  assert.match(commercial, /Buy a measured result, not a savings promise/);
  assert.match(commercial, /hosted CHECK\/OBSERVE service remains free during bootstrap/i);
  assert.match(commercial, /self-serve service billing is disabled/i);
  assert.match(commercial, /commercial-pilot\.yml/);
  assert.match(commercial, /Do not include secrets or customer data/i);
  assert.match(pilotTemplate, /This issue is public/i);
  assert.match(pilotTemplate, /Current cost or constrained capacity/);
  assert.match(pilotTemplate, /Native\/local controls already available/);
  assert.match(pilotTemplate, /IoT \/ edge read-only validation/);
});

test('secondary pages and machine discovery expose substrate and commercial routes', () => {
  assert.match(index, /app\.get\('\/substrate'/);
  assert.match(index, /app\.get\('\/commercial'/);
  assert.match(adoption, /path: '\/substrate'/);
  assert.match(adoption, /path: '\/commercial'/);
  assert.match(adoption, /execution-reuse/i);
  assert.match(integrations, /OpenTelemetry \/ OTLP/);
  assert.match(integrations, /IoT \/ edge/);
  assert.match(quickstart, /CLIENT 0\.2\.22\+/);
  assert.match(quickstart, /otel-trace-census/);
  assert.match(fleet, /Distributed callers/);
  assert.match(fleet, /OPENTELEMETRY DISCOVERY/);
});

test('expanded positioning does not claim generic mutation or physical-world suppression', () => {
  assert.match(substrate, /Read-only residual work/i);
  assert.match(substrate, /Actuation, safety-critical commands, independent sensing/i);
  assert.doesNotMatch(substrate + commercial, /guaranteed savings|always cheaper|universal savings/i);
});
