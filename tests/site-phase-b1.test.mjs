import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const landing = fs.readFileSync(new URL('../src/landing.ts', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const publicSource = fs.readFileSync(new URL('../src/public.ts', import.meta.url), 'utf8');
const quickstartSource = fs.readFileSync(new URL('../src/quickstart.ts', import.meta.url), 'utf8');
const adoptionSource = fs.readFileSync(new URL('../src/adoption.ts', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/site.css', import.meta.url), 'utf8');

test('Phase B.1 public route uses the adoption landing', () => {
  assert.match(index, /publicLandingPage.*from '.\/landing\.js'/);
  assert.match(index, /serviceDescriptor.*from '.\/public\.js'/);
});

test('landing derives release facts instead of hard-coding a client version', () => {
  assert.match(landing, /publicProductFacts/);
  assert.match(landing, /f\.install\.client_version/);
  assert.match(landing, /f\.install\.npm_command/);
  assert.match(landing, /f\.install\.pypi_command/);
  assert.match(landing, /f\.install\.registry_install_verified_at/);
  assert.doesNotMatch(landing, /0\.2\.\d+/);
});

test('landing gives humans and agents direct integration paths', () => {
  for (const expected of [
    '/clients',
    '/mcp',
    '/openapi.json',
    '/.well-known/agent-skills/seenrelay/SKILL.md',
    '/product-facts.json',
    '/service.json'
  ]) assert.match(landing, new RegExp(expected.replaceAll('/', '\\/')));
});

test('landing preserves conservative product boundaries', () => {
  assert.match(landing, /original validation still runs/i);
  assert.match(landing, /does not decide truth/i);
  assert.match(landing, /No hidden research/i);
  assert.match(landing, /No fake provenance/i);
  assert.match(landing, /No mutation suppression/i);
  assert.match(landing, /Fail open/i);
  assert.doesNotMatch(landing, /guaranteed savings|verified truth|independent agents confirmed/i);
});

test('landing exposes both positive fit and negative controls from canonical facts', () => {
  assert.match(landing, /f\.fit\.use_when/);
  assert.match(landing, /f\.fit\.do_not_use_when/);
  assert.match(landing, /GOOD CANDIDATE/);
  assert.match(landing, /NEGATIVE CONTROL/);
});

test('landing presents evidence with caveats and live aggregate metrics', () => {
  assert.match(landing, /verified_benchmarks/);
  assert.match(landing, /item\.caveat/);
  assert.match(landing, /first-party smoke evidence/i);
  assert.match(landing, /data-stat="facts"/);
  assert.match(landing, /data-stat-pct="qualified_reuse_rate"/);
  assert.match(landing, /not presented as external adoption/i);
});

test('service descriptor no longer pins obsolete client version literals', () => {
  assert.match(publicSource, /implemented_public_client_\$\{publicProductFacts\.install\.client_version\}/);
  assert.match(publicSource, /python_mode: 'shadow_first'/);
  assert.doesNotMatch(publicSource, /implemented_public_client_0\.2\.1|shadow_first_in_0\.2\.1/);
});

test('visual system has responsive and accessible motion handling', () => {
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /focus-visible/);
});


test('secondary public adoption surfaces derive the verified client version', () => {
  assert.match(quickstartSource, /publicProductFacts\.install\.client_version/);
  assert.match(adoptionSource, /publicProductFacts\.install\.client_version/);
  assert.doesNotMatch(quickstartSource, /0\.2\.1/);
  assert.doesNotMatch(adoptionSource, /0\.2\.1/);
});

test('shared stylesheet preserves non-home human pages and benchmark matrix', () => {
  assert.match(css, /legacy-human-pages-compat/);
  assert.match(css, /\.nav \+ main \.terminal/);
  assert.match(css, /\.nav \+ main \.proof-grid/);
  assert.match(css, /\.nav \+ main \.benchmark-table/);
});
