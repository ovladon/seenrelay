import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const landing = fs.readFileSync(new URL('../src/landing.ts', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const publicSource = fs.readFileSync(new URL('../src/public.ts', import.meta.url), 'utf8');
const quickstartSource = fs.readFileSync(new URL('../src/quickstart.ts', import.meta.url), 'utf8');
const adoptionSource = fs.readFileSync(new URL('../src/adoption.ts', import.meta.url), 'utf8');
const integrationsSource = fs.readFileSync(new URL('../src/integrations.ts', import.meta.url), 'utf8');
const revampCss = fs.readFileSync(new URL('../public/revamp.css', import.meta.url), 'utf8');
const funnelCss = fs.readFileSync(new URL('../public/funnel.css', import.meta.url), 'utf8');
const revampJs = fs.readFileSync(new URL('../public/revamp.js', import.meta.url), 'utf8');
const previewGate = fs.readFileSync(new URL('../scripts/preview-release-gate.sh', import.meta.url), 'utf8');

test('public route keeps HTML and machine surfaces separate', () => {
  assert.match(index, /publicLandingPage.*from '.\/landing\.js'/);
  assert.match(index, /serviceDescriptor.*from '.\/public\.js'/);
  assert.match(index, /accept\.includes\('text\/html'\)/);
});

test('homepage follows the customer journey from value to trial to safety', () => {
  const ids = ['what', 'how', 'start', 'fit', 'safety', 'resources'].map((id) => landing.indexOf(`id="${id}"`));
  assert.ok(ids.every((x) => x >= 0));
  assert.ok(ids.every((x, i) => i === 0 || x > ids[i - 1]));
  assert.match(landing, /Your agents repeat expensive checks/i);
  assert.match(landing, /SeenRelay finds the ones you can stop repaying for/i);
  assert.match(landing, /Run the free shadow audit/i);
  assert.match(landing, /No guessed hit rate/i);
  assert.match(landing, /Your workload decides/i);
});

test('homepage derives package facts but never promotes benchmark results', () => {
  assert.match(landing, /publicProductFacts/);
  assert.match(landing, /f\.install\.client_version/);
  assert.match(landing, /f\.install\.npm_command/);
  assert.match(landing, /f\.install\.pypi_command/);
  assert.doesNotMatch(landing, /verified_benchmarks|provider calls avoided|first-party smoke|Firecrawl/i);
  assert.doesNotMatch(landing, /client\s+0\.2\.\d+/i);
});

test('first use is free, behavior-preserving and self-service', () => {
  assert.match(landing, /FREE · NO ACCOUNT/);
  assert.match(landing, /no SeenRelay API key/i);
  assert.match(landing, /every authoritative call still runs/i);
  assert.match(landing, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(landing, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(landing, /seenRelayAmbient\.getReport\(\)/);
  assert.match(landing, /USE \/ DO NOT USE \/ INSUFFICIENT EVIDENCE/);
});

test('homepage explains narrow fit and safe fallback without requiring protocol knowledge first', () => {
  assert.match(landing, /Paid web search/);
  assert.match(landing, /Browser \/ portal checks/);
  assert.match(landing, /Metered extraction/);
  assert.match(landing, /Agent fleets/);
  assert.match(landing, /SeenRelay does not replace your source of truth/i);
  assert.match(landing, /When in doubt, validate normally/i);
  assert.match(landing, /Hosted SeenRelay still exposes exactly CHECK and OBSERVE/i);
});

test('agent onboarding uses Agent Skill discovery from the SeenRelay origin', () => {
  assert.match(landing, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(quickstartSource, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(integrationsSource, /npx skills add \$\{origin\} --skill seenrelay --yes/);
});

test('quickstart and integration chooser remain behavior-preserving', () => {
  assert.match(quickstartSource, /INTEGRATION QUICKSTART/);
  assert.match(quickstartSource, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(quickstartSource, /ambient_mcp_client\(raw_mcp_client\)/);
  assert.match(integrationsSource, /INSTRUMENT AN APPLICATION/);
  assert.match(integrationsSource, /does not by itself enable reuse/i);
  assert.match(adoptionSource, /export \{ clientsPage \} from '.\/integrations\.js'/);
});

test('homepage visual system remains responsive, accessible and dependency free', () => {
  assert.match(revampCss, /@media\(max-width:680px\)/);
  assert.match(revampCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(revampCss, /focus-visible/);
  assert.match(funnelCss, /\.rv-verdict-card/);
  assert.match(funnelCss, /@media\(max-width:680px\)/);
  assert.match(revampJs, /data-mode-button/);
  assert.match(revampJs, /navigator\.clipboard/);
  assert.doesNotMatch(revampJs, /fetch\(|XMLHttpRequest|WebSocket|createElement\('link'\)/);
  assert.doesNotMatch(landing, /\sstyle=/i);
});

test('service descriptor continues to derive the public client release', () => {
  assert.match(publicSource, /implemented_public_client_\$\{publicProductFacts\.install\.client_version\}/);
  assert.match(publicSource, /python_mode: 'shadow_first'/);
});

test('preview gate enforces the self-service homepage and rejects benchmark marketing', () => {
  for (const marker of ['Your agents repeat expensive checks.', 'Run the free shadow audit', 'No guessed hit rate.', 'Three steps. No platform migration.', 'SeenRelay does not replace your source of truth.']) {
    assert.match(previewGate, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(previewGate, /MEASURED · FIRST-PARTY SMOKE BENCHMARK|Firecrawl JSON extraction|provider calls avoided/);
});
