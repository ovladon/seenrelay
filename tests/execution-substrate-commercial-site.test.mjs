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
const supportTemplate = fs.readFileSync(new URL('../.github/ISSUE_TEMPLATE/deployment-support.yml', import.meta.url), 'utf8');
const obsoletePilotTemplateExists = fs.existsSync(new URL('../.github/ISSUE_TEMPLATE/commercial-pilot.yml', import.meta.url));

test('public positioning expands below agents without weakening the audit gate', () => {
  assert.match(landing, /Stop paying twice for the same read-only work/);
  assert.match(landing, /measures what actually repeats/i);
  assert.match(landing, /Shadow measurement keeps the original authoritative call/);
  assert.match(landing, /DO NOT USE/);
  assert.match(landing, /Optimize execution, not just tokens/);
  assert.doesNotMatch(landing, /Commercial pilot/);
  assert.doesNotMatch(landing, /live-check-form|data-install-view="agent"/);
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

test('commercial route is optional noindex support rather than a required pilot funnel', () => {
  assert.match(commercial, /noindex,nofollow,noarchive/);
  assert.match(commercial, /SeenRelay is self-serve by default/i);
  assert.match(commercial, /Start locally/);
  assert.match(commercial, /hosted CHECK\/OBSERVE service remains free during bootstrap/i);
  assert.match(commercial, /self-serve service billing is disabled/i);
  assert.match(commercial, /not required to use SeenRelay/i);
  assert.match(commercial, /deployment-support\.yml/);
  assert.doesNotMatch(commercial, /commercial-pilot\.yml|Commercial pilot|Start pilot inquiry/i);
  assert.match(commercial, /Do not include secrets or customer data/i);
  assert.doesNotMatch(commercial, />Commercial pilot<|>Start pilot inquiry</i);
  assert.match(supportTemplate, /This issue is public/i);
  assert.match(supportTemplate, /Current cost or constrained capacity/);
  assert.match(supportTemplate, /Native\/local controls already available/);
  assert.match(supportTemplate, /IoT \/ edge read-only validation/);
  assert.match(supportTemplate, /Optional deployment support/);
  assert.match(supportTemplate, /\[Support\]/);
  assert.match(supportTemplate, /A recommendation to use a stronger native control or remove SeenRelay is a valid result/i);
  assert.doesNotMatch(supportTemplate, /Commercial pilot|\[Pilot\]|pilot commercially useful/i);
  assert.equal(obsoletePilotTemplateExists, false);
});

test('secondary pages expose self-serve product paths while commercial support stays direct-only', () => {
  assert.match(index, /app\.get\('\/substrate'/);
  assert.match(index, /app\.get\('\/commercial'/);
  assert.match(adoption, /path: '\/substrate'/);
  assert.doesNotMatch(adoption, /path: '\/commercial'|Commercial pilots:/);
  assert.match(adoption, /Start locally:/);
  assert.match(adoption, /execution-reuse/i);
  assert.match(integrations, /OpenTelemetry \/ OTLP/);
  assert.match(integrations, /IoT \/ edge/);
  assert.match(quickstart, /CLIENT \$\{esc\(clientVersion\)\}/);
  assert.match(quickstart, /otel-trace-census/);
  assert.doesNotMatch(substrate + integrations + quickstart, /href="\/commercial"/);
  assert.match(fleet, /Distributed callers/);
  assert.match(fleet, /OPENTELEMETRY DISCOVERY/);
});

test('expanded positioning does not claim generic mutation or physical-world suppression', () => {
  assert.match(substrate, /Read-only residual work/i);
  assert.match(substrate, /Actuation, safety-critical commands, independent sensing/i);
  assert.doesNotMatch(substrate + commercial, /guaranteed savings|always cheaper|universal savings/i);
});
