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

test('homepage orders activation from problem to audit to report to evidence', () => {
  const what = landing.indexOf('id="what"');
  const audit = landing.indexOf('id="audit"');
  const report = landing.indexOf('id="report"');
  const tests = landing.indexOf('id="tests"');
  assert.ok(what >= 0 && audit > what && report > audit && tests > report);
  assert.match(landing, /Every authoritative validation stays enabled/i);
  assert.match(landing, /A negative result is useful because it tells you not to add another layer/i);
});

test('homepage derives verified package and benchmark facts', () => {
  assert.match(landing, /publicProductFacts/);
  assert.match(landing, /f\.install\.client_version/);
  assert.match(landing, /f\.install\.npm_command/);
  assert.match(landing, /f\.install\.pypi_command/);
  assert.match(landing, /publicProductFacts\.verified_benchmarks/);
  assert.match(landing, /matrix\.provider_calls_avoided/);
  assert.match(landing, /matrix\.provider_units_avoided/);
  assert.match(landing, /item\.reuse_median_ms/);
  assert.doesNotMatch(landing, /client\s+0\.2\.\d+/i);
});

test('homepage explains both shadow measurement and post-audit validation placement', () => {
  for (const expected of ['Run normally', 'Measure what repeats', 'Check safety', 'Get a verdict']) {
    assert.match(landing, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(landing, /In-flight\/local → caller-owned private L1 → source native → provider native → optional shared CHECK → validate/);
  assert.match(landing, /original validation remains the fallback/i);
});

test('agent onboarding uses well-known Agent Skill discovery from the SeenRelay origin', () => {
  assert.match(landing, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(quickstartSource, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(integrationsSource, /npx skills add \$\{origin\} --skill seenrelay --yes/);
});

test('first integration is behavior-preserving, zero-config and produces a local report', () => {
  assert.match(landing, /ambientMcpClient\(rawMcpClient\)/);
  assert.doesNotMatch(landing, /ambientMcpClient\(rawMcpClient,\s*\{/);
  assert.match(landing, /seenRelayAmbient\.getReport\(\)/);
  assert.match(landing, /Measure first/i);
  assert.match(landing, /A negative result is useful because it tells you not to add another layer/i);
  assert.match(landing, /If it does not, leave it alone/i);
});

test('homepage presents readable evidence and its limits together', () => {
  assert.match(landing, /rv-evidence-card/);
  assert.match(landing, /provider calls avoided/);
  assert.match(landing, /provider_unit_label/);
  assert.match(landing, /baseline → reuse median path latency/);
  assert.match(landing, /What SeenRelay has demonstrated — and what it has not/);
  assert.match(landing, /Established/);
  assert.match(landing, /Not established/);
  assert.match(landing, /Your workload decides/);
  assert.match(landing, /do not establish a universal hit rate, guaranteed savings/i);
  assert.match(landing, /first-party smoke tests, not a universal ROI claim/i);
  assert.match(landing, /Workload fit still has to be measured on your real traffic/i);
  assert.doesNotMatch(landing, /fit:\s*poor|poor-fit examples/i);
  assert.match(landing, /\/product-facts\.json/);
  assert.match(landing, /\/economics/);
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
  assert.match(factualCss, /\.rv-evidence-cards/);
  assert.match(factualCss, /\.rv-evidence-metrics/);
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

test('preview gate enforces the audit-first homepage contract', () => {
  for (const marker of ['Find out where your agent fleet is wasting time or provider spend on repeated validation.', 'FREE SHADOW AUDIT', 'Run the free shadow audit', 'WHAT YOU GET', 'USE · DO NOT USE · INSUFFICIENT EVIDENCE', 'provider calls avoided', 'What SeenRelay has demonstrated — and what it has not.', 'Not established', 'Your workload decides']) {
    assert.match(previewGate, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(previewGate, /SeenRelay is a reuse layer for repeated read-only validation\.|WHAT IT DOES|INSTALL AND USE|TESTS WE HAVE RUN/);
  assert.doesNotMatch(landing, /Release-gate compatibility markers kept non-visual/);
});