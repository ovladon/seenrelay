import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/standards.ts', import.meta.url), 'utf8');
const pick = (re, label) => {
  const m = source.match(re);
  if (!m?.[1]) throw new Error(`Unable to read ${label} from src/standards.ts`);
  return m[1];
};
const tracked = {
  reviewed_at: pick(/reviewed_at:\s*'([^']+)'/, 'reviewed_at'),
  mcp: pick(/mcp:\s*\{[\s\S]*?implemented:\s*'([^']+)'/, 'MCP revision'),
  mcp_sdk: pick(/sdk:\s*'@modelcontextprotocol\/server@([^']+)'/, 'MCP SDK'),
  a2a: pick(/a2a:\s*\{[\s\S]*?tracked:\s*'([^']+)'/, 'A2A revision'),
  otel: pick(/opentelemetry_semconv_tracked:\s*'([^']+)'/, 'OpenTelemetry semantic conventions')
};

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'seenrelay-standards-watch/1.0',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
};
async function json(url, opts={}) {
  const response = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}
async function latestRelease(repo) {
  const data = await json(`https://api.github.com/repos/${repo}/releases/latest`);
  return String(data.tag_name || '').replace(/^v/, '');
}
async function latestMcpSpec() {
  const data = await json('https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification?ref=main');
  const versions = data.map(x => x.name).filter(x => /^20\d\d-\d\d-\d\d$/.test(x)).sort();
  if (!versions.length) throw new Error('No dated MCP specification directories found');
  return versions.at(-1);
}
async function latestNpmVersion(name) {
  const encoded = encodeURIComponent(name);
  const data = await json(`https://registry.npmjs.org/${encoded}/latest`, { headers: { accept: 'application/json' } });
  return String(data.version || '');
}
async function latestCommit(repo) {
  const data = await json(`https://api.github.com/repos/${repo}/commits?per_page=1`);
  return { sha: data[0]?.sha || null, date: data[0]?.commit?.committer?.date || null };
}

const discovered = {};
const errors = [];
async function capture(key, fn) {
  try { discovered[key] = await fn(); }
  catch (error) { errors.push({ key, error: error instanceof Error ? error.message : String(error) }); }
}
await Promise.all([
  capture('mcp', latestMcpSpec),
  capture('mcp_sdk', () => latestNpmVersion('@modelcontextprotocol/server')),
  capture('a2a', () => latestRelease('a2aproject/A2A')),
  capture('otel', () => latestRelease('open-telemetry/semantic-conventions')),
  capture('otel_genai_activity', () => latestCommit('open-telemetry/semantic-conventions-genai'))
]);

const comparisons = [
  ['MCP specification', tracked.mcp, discovered.mcp],
  ['MCP TypeScript server SDK', tracked.mcp_sdk, discovered.mcp_sdk],
  ['A2A specification', tracked.a2a, discovered.a2a],
  ['OpenTelemetry semantic conventions', tracked.otel, discovered.otel]
].map(([name, expected, actual]) => ({ name, tracked: expected, discovered: actual || null, drift: Boolean(actual && actual !== expected) }));
const drift = comparisons.some(x => x.drift) || errors.length > 0;
const report = {
  generated_at: new Date().toISOString(),
  tracked,
  discovered,
  comparisons,
  errors,
  drift,
  policy: 'Discovery never mutates production. Dependency upgrades arrive as isolated PRs; protocol-semantic changes require an explicit compatibility candidate and the full SeenRelay verification gates.'
};
await fs.writeFile('standards-watch-report.json', JSON.stringify(report, null, 2));
const md = [
  '# SeenRelay standards watch',
  '',
  `Generated: ${report.generated_at}`,
  '',
  '| Surface | Tracked/implemented | Discovered | Status |',
  '|---|---:|---:|---|',
  ...comparisons.map(x => `| ${x.name} | ${x.tracked} | ${x.discovered ?? 'unavailable'} | ${x.drift ? 'DRIFT' : 'aligned'} |`),
  '',
  `OpenTelemetry GenAI repo latest activity: ${discovered.otel_genai_activity?.date || 'unavailable'} (${discovered.otel_genai_activity?.sha?.slice(0,12) || 'n/a'})`,
  '',
  ...(errors.length ? ['## Retrieval errors', '', ...errors.map(x => `- **${x.key}**: ${x.error}`), ''] : []),
  '## Policy',
  '',
  report.policy,
  '',
  'A drift signal means “investigate and prepare a candidate”, not “merge automatically”. The existing branch protections and CI/E2E remain mandatory.'
].join('\n');
await fs.writeFile('standards-watch-report.md', md);
console.log(md);
