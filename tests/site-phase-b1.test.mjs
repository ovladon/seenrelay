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
const factualCss = fs.readFileSync(new URL('../public/revamp-factual.css', import.meta.url), 'utf8');
const revampJs = fs.readFileSync(new URL('../public/revamp.js', import.meta.url), 'utf8');
const previewGate = fs.readFileSync(new URL('../scripts/preview-release-gate.sh', import.meta.url), 'utf8');

test('public route keeps HTML and machine surfaces separate', () => {
  assert.match(index, /publicLandingPage.*from '.\/landing\.js'/);
  assert.match(index, /serviceDescriptor.*from '.\/public\.js'/);
  assert.match(index, /accept\.includes\('text\/html'\)/);
});

test('homepage presents one product before the audit and secondary diagnostic', () => {
  const what = landing.indexOf('id="what"');
  const product = landing.indexOf('id="product"');
  const audit = landing.indexOf('id="audit"');
  const resources = landing.indexOf('id="resources"');
  assert.ok(what >= 0 && product > what && audit > product && resources > audit);
  assert.match(landing, /SeenRelay is a validation-reuse layer/i);
  assert.match(landing, /authoritative calls stay on/i);
  assert.match(landing, /USE · DO NOT USE · INSUFFICIENT EVIDENCE/i);
  assert.match(landing, /It is not the SeenRelay runtime product/i);
});

test('homepage derives only verified package facts needed for onboarding', () => {
  assert.match(landing, /publicProductFacts/);
  assert.match(landing, /f\.install\.client_version/);
  assert.match(landing, /f\.install\.npm_command/);
  assert.match(landing, /f\.install\.pypi_command/);
  assert.doesNotMatch(landing, /verified_benchmarks|provider calls avoided|first-party smoke|Firecrawl/i);
  assert.doesNotMatch(landing, /client\s+0\.2\.\d+/i);
});

test('homepage explains shadow measurement and the local-first runtime order', () => {
  for (const expected of ['Run normally', 'Measure recurrence', 'Price the waste', 'Promote narrowly']) {
    assert.match(landing, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(landing, /Local \/ in-flight/);
  assert.match(landing, /Caller-owned private L1/);
  assert.match(landing, /Source \/ provider native/);
  assert.match(landing, /Optional shared CHECK/);
  assert.match(landing, /original validation remains the authoritative fallback/i);
});

test('agent onboarding uses Agent Skill discovery from the SeenRelay origin', () => {
  assert.match(landing, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(quickstartSource, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(integrationsSource, /npx skills add \$\{origin\} --skill seenrelay --yes/);
});

test('first integration is behavior-preserving, free and produces a local report', () => {
  assert.match(landing, /ambientMcpClient\(rawMcpClient\)/);
  assert.doesNotMatch(landing, /ambientMcpClient\(rawMcpClient,\s*\{/);
  assert.match(landing, /seenRelayAmbient\.getReport\(\)/);
  assert.match(landing, /free today/i);
  assert.match(landing, /no account/i);
  assert.match(landing, /no API key/i);
  assert.match(landing, /Keep SeenRelay only if the math wins/i);
});

test('homepage does not promote synthetic benchmark results', () => {
  assert.doesNotMatch(landing, /rv-evidence-card|provider calls avoided|verified_benchmarks|first-party smoke|Firecrawl/i);
  assert.match(landing, /Measure my workload/);
  assert.match(landing, /See the economics/);
});

test('quickstart is factual, agent-compatible and behavior-preserving', () => {
  assert.match(quickstartSource, /INTEGRATION QUICKSTART/);
  assert.match(quickstartSource, /Measure first\. Reuse only where the fleet earns it\./);
  assert.match(quickstartSource, /CODING-AGENT INTEGRATION/);
  assert.match(quickstartSource, /MANUAL INTEGRATION/);
  assert.match(quickstartSource, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(quickstartSource, /ambient_mcp_client\(raw_mcp_client\)/);
  assert.match(quickstartSource, /original operation still runs/i);
  assert.match(quickstartSource, /The report is local; the wrapper does not authorize automatic reuse/i);
});

test('integration chooser makes measurement the primary path and hosted protocol connection separate', () => {
  for (const expected of ['INSTRUMENT AN APPLICATION', 'Coding agent', 'Existing MCP client', 'Python MCP', 'OpenAI Agents / AI SDK', 'LangChain / PydanticAI', 'Plain read-only function', 'REMOTE PROTOCOL', 'Cursor', 'VS Code / GitHub Copilot', 'Claude Code', 'Other MCP / REST clients']) {
    assert.match(integrationsSource, new RegExp(expected.replaceAll('/', '\\/')));
  }
  assert.match(integrationsSource, /does not by itself enable reuse/i);
  assert.match(integrationsSource, /does not instrument an application's existing validation path/i);
  assert.match(adoptionSource, /export \{ clientsPage \} from '.\/integrations\.js'/);
});

test('published Ambient wrappers are shown in their zero-config form', () => {
  assert.match(integrationsSource, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(integrationsSource, /ambient_mcp_client\(raw_mcp_client\)/);
  assert.doesNotMatch(integrationsSource, /ambientMcpClient\(rawMcpClient,\s*\{/);
  assert.doesNotMatch(integrationsSource, /ambient_mcp_client\(\s*raw_mcp_client,\s*server_key=/);
});

test('copy-ready MCP connection paths include current Cursor, VS Code and Claude Code forms', () => {
  assert.match(integrationsSource, /https:\/\/cursor\.com\/link\/mcp\/install\?name=seenrelay/);
  assert.match(integrationsSource, /vscode:mcp\/install\?/);
  assert.match(integrationsSource, /code --add-mcp/);
  assert.match(integrationsSource, /claude mcp add --transport http --scope user seenrelay/);
  assert.match(integrationsSource, /https:\/\/seenrelay\.com\/mcp/);
});

test('revamp visual system is responsive, accessible and dependency free', () => {
  assert.match(revampCss, /@media\(max-width:680px\)/);
  assert.match(revampCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(revampCss, /focus-visible/);
  assert.match(factualCss, /\.rv-flow-list/);
  assert.match(factualCss, /@media\(max-width:680px\)/);
  assert.match(landing, /href="\/revamp-factual\.css"/);
  assert.match(revampJs, /data-mode-button/);
  assert.match(revampJs, /navigator\.clipboard/);
  assert.doesNotMatch(revampJs, /fetch\(|XMLHttpRequest|WebSocket|createElement\('link'\)/);
});

test('factual adoption pages do not rely on CSP-blocked inline styles', () => {
  for (const source of [landing, quickstartSource, integrationsSource]) {
    assert.doesNotMatch(source, /\sstyle=/i);
  }
});

test('service descriptor continues to derive the public client release', () => {
  assert.match(publicSource, /implemented_public_client_\$\{publicProductFacts\.install\.client_version\}/);
  assert.match(publicSource, /python_mode: 'shadow_first'/);
  assert.doesNotMatch(publicSource, /implemented_public_client_0\.2\.1|shadow_first_in_0\.2\.1/);
});

test('preview gate enforces the focused product homepage contract', () => {
  for (const marker of ['Stop repaying for the same expensive read-only validation.', 'FREE SHADOW AUDIT', 'USE · DO NOT USE · INSUFFICIENT EVIDENCE', 'ONE PRODUCT', 'FREE DIAGNOSTIC TOOL']) {
    assert.match(previewGate, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(previewGate, /MEASURED · FIRST-PARTY SMOKE BENCHMARK|Firecrawl JSON extraction/);
  assert.doesNotMatch(landing, /Release-gate compatibility markers kept non-visual/);
});