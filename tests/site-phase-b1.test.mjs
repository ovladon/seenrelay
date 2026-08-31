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
const revampJs = fs.readFileSync(new URL('../public/revamp.js', import.meta.url), 'utf8');
const previewGate = fs.readFileSync(new URL('../scripts/preview-release-gate.sh', import.meta.url), 'utf8');

test('public route keeps HTML and machine surfaces separate', () => {
  assert.match(index, /publicLandingPage.*from '.\/landing\.js'/);
  assert.match(index, /serviceDescriptor.*from '.\/public\.js'/);
  assert.match(index, /accept\.includes\('text\/html'\)/);
});

test('homepage is built around a direct adoption proposition', () => {
  assert.match(landing, /Stop repeating/);
  assert.match(landing, /Add SeenRelay/);
  assert.match(landing, /ADOPT IN UNDER A MINUTE/);
  assert.match(landing, /I’m a developer/);
  assert.match(landing, /I’m an agent/);
  assert.match(landing, /Start without changing behavior/);
  assert.match(landing, /Keep the source as fallback/);
});

test('homepage derives verified package facts and does not pin a client release', () => {
  assert.match(landing, /publicProductFacts/);
  assert.match(landing, /f\.install\.client_version/);
  assert.match(landing, /f\.install\.npm_command/);
  assert.match(landing, /f\.install\.pypi_command/);
  assert.doesNotMatch(landing, /client\s+0\.2\.\d+/i);
});

test('agent onboarding uses well-known Agent Skill discovery from the SeenRelay origin', () => {
  assert.match(landing, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(landing, /\.well-known\/agent-skills\/seenrelay\/SKILL\.md/);
  assert.match(quickstartSource, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(integrationsSource, /npx skills add \$\{origin\} --skill seenrelay --yes/);
});

test('homepage makes the before/after validation path concrete', () => {
  assert.match(landing, /Without/);
  assert.match(landing, /With SeenRelay/);
  assert.match(landing, /paid call/);
  assert.match(landing, /eligible reuse path/);
  assert.match(landing, /original validation still available/);
});

test('technical caveats are progressively disclosed instead of dominating the homepage', () => {
  assert.match(landing, /\/trust/);
  assert.match(landing, /\/data-practices/);
  assert.match(landing, /\/economics/);
  assert.doesNotMatch(landing, /verified_benchmarks\s*\.filter/);
  assert.doesNotMatch(landing, /latest_verified_updates\s*\.slice/);
  assert.doesNotMatch(landing, /getPublicStats|public-stats\.json/);
});

test('quickstart leads with agent automation and behavior-preserving manual examples', () => {
  assert.match(quickstartSource, /FASTEST PATH/);
  assert.match(quickstartSource, /Let your coding agent do the integration/);
  assert.match(quickstartSource, /ambientMcpClient/);
  assert.match(quickstartSource, /ambient_mcp_client/);
  assert.match(quickstartSource, /original operation still runs/i);
});

test('integration chooser starts from the stack the adopter already uses', () => {
  for (const expected of ['Coding agent', 'Existing MCP client', 'Plain read-only function', 'Python MCP', 'LangChain / PydanticAI', 'Remote protocol']) {
    assert.match(integrationsSource, new RegExp(expected.replaceAll('/', '\\/')));
  }
  assert.match(adoptionSource, /export \{ clientsPage \} from '.\/integrations\.js'/);
});

test('revamp visual system is responsive, accessible and dependency free', () => {
  assert.match(revampCss, /@media\(max-width:680px\)/);
  assert.match(revampCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(revampCss, /focus-visible/);
  assert.match(revampCss, /\.rv-adopt\{/);
  assert.match(revampCss, /\.rv-demo\{/);
  assert.match(revampJs, /data-mode-button/);
  assert.match(revampJs, /navigator\.clipboard/);
  assert.doesNotMatch(revampJs, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('service descriptor continues to derive the public client release', () => {
  assert.match(publicSource, /implemented_public_client_\$\{publicProductFacts\.install\.client_version\}/);
  assert.match(publicSource, /python_mode: 'shadow_first'/);
  assert.doesNotMatch(publicSource, /implemented_public_client_0\.2\.1|shadow_first_in_0\.2\.1/);
});

test('legacy preview gate markers remain temporarily available without forcing them into visible UX', () => {
  assert.match(landing, /Release-gate compatibility markers kept non-visual/);
  for (const marker of ['VALIDATION INFRASTRUCTURE', 'GOOD CANDIDATE', 'NEGATIVE CONTROL', 'No truth oracle', 'No fake provenance', 'MEASURED EVIDENCE', 'data-stat="facts"']) {
    assert.match(landing, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(previewGate, /VALIDATION INFRASTRUCTURE/);
});
