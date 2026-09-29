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

test('homepage follows a short human journey from value to proof to audit', () => {
  const ids = ['what', 'proof', 'where', 'start'].map((id) => landing.indexOf(`id="${id}"`));
  assert.ok(ids.every((x) => x >= 0));
  assert.ok(ids.every((x, i) => i === 0 || x > ids[i - 1]));
  assert.match(landing, /Pay less now\./);
  assert.match(landing, /Run the free audit/i);
  assert.match(landing, /It already reduces real provider work/i);
  assert.match(landing, /Customer ROI is measured, not assumed/i);
});

test('homepage derives the verified client version and keeps proof bounded', () => {
  assert.match(landing, /publicProductFacts/);
  assert.match(landing, /publicProductFacts\.install\.client_version/);
  assert.match(landing, /publicProductFacts\.install\.scan_command/);
  assert.match(landing, /18 → 9/);
  assert.match(landing, /5 → 1/);
  assert.match(landing, /15/);
  assert.match(landing, /recommended only where it is the cheapest safe option/i);
  assert.doesNotMatch(landing, /guaranteed savings|universal savings percentage/i);
  assert.doesNotMatch(landing, /client\s+0\.2\.\d+/i);
});

test('first use is free, behavior-preserving and self-service', () => {
  assert.match(landing, /free audit/i);
  assert.match(landing, /no API key/i);
  assert.match(landing, /Every original authoritative call still runs/i);
  assert.match(landing, /npx seenrelay scan/);
  assert.match(landing, /USE \/ DO NOT USE \/ INSUFFICIENT EVIDENCE/);
});

test('homepage names the expanded market without turning into documentation', () => {
  assert.match(landing, /Agents are only the beginning/i);
  assert.match(landing, /Agents/);
  assert.match(landing, /Services/);
  assert.match(landing, /CI \/ tests/);
  assert.match(landing, /IoT \/ edge/);
  assert.match(landing, /href="\/substrate"/);
  assert.match(landing, /href="\/commercial"/);
  assert.doesNotMatch(landing, /live-check-form|data-install-view="agent"|npx skills add/);
});

test('agent onboarding remains on dedicated technical surfaces', () => {
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
  assert.match(revampJs, /navigator\.clipboard/);
  assert.doesNotMatch(revampJs, /XMLHttpRequest|WebSocket|createElement\('link'\)|\/v1\/observe/);
  assert.doesNotMatch(landing, /\sstyle=/i);
});

test('preview gate enforces the concise savings homepage and bounded proof', () => {
  for (const marker of ['Pay less now.', 'Run the free audit', '18 → 9', '5 → 1', 'Customer ROI is measured, not assumed', 'Every original authoritative call still runs']) {
    assert.ok(previewGate.includes(marker), `preview gate must require: ${marker}`);
  }
  assert.match(previewGate, /grep -qi 'Firecrawl' \/tmp\/site\.html/);
  assert.match(previewGate, /! grep -qi 'guaranteed savings' \/tmp\/site\.html/);
  assert.match(previewGate, /product-facts\.json/);
});

test('service descriptor continues to derive the public client release', () => {
  assert.match(publicSource, /implemented_public_client_\$\{publicProductFacts\.install\.client_version\}/);
  assert.match(publicSource, /python_mode: 'shadow_first'/);
});

test('preview gate enforces the self-service audit and bounded mechanism proof', () => {
  for (const marker of ['Find out if your agents are wasting money on repeated checks.', 'Run the free savings audit', 'START HERE', 'WHAT IS ALREADY PROVEN', 'Customer ROI is measured, not assumed', 'OPTIONAL PROTOCOL DEMO — NOT REQUIRED TO START', 'Evidence trial only.', 'SeenRelay does not replace your source of truth.']) {
    assert.ok(previewGate.includes(marker), `preview gate must require: ${marker}`);
  }
  assert.match(previewGate, /grep -q '15 CREDITS' \/tmp\/site\.html/);
  assert.match(previewGate, /grep -q '9 CREDITS' \/tmp\/site\.html/);
  assert.match(previewGate, /grep -qi 'Firecrawl' \/tmp\/site\.html/);
  assert.match(previewGate, /grep -q 'Customer ROI is measured, not assumed' \/tmp\/site\.html/);
  assert.match(previewGate, /! grep -qi 'first-party smoke' \/tmp\/economics\.html/);
  assert.match(previewGate, /product-facts\.json/);
});
