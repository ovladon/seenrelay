import fs from 'node:fs';

const ORIGIN = 'https://seenrelay.com';
const registryManifest = JSON.parse(fs.readFileSync(new URL('../registry/server.json', import.meta.url), 'utf8'));
const productFacts = JSON.parse(fs.readFileSync(new URL('../public/product-facts.json', import.meta.url), 'utf8'));
const pluginManifest = JSON.parse(fs.readFileSync(new URL('../plugin.json', import.meta.url), 'utf8'));
const portableMcp = JSON.parse(fs.readFileSync(new URL('../mcp.json', import.meta.url), 'utf8'));
const checks = [];

const userAgent = 'SeenRelay-Distribution-Radar/1.0 (+https://seenrelay.com)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { json = false } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': userAgent, accept: json ? 'application/json' : '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000)
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      if (!json) return text;
      try { return JSON.parse(text); }
      catch { throw new Error('response was not valid JSON'); }
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(750 * attempt);
    }
  }
  throw lastError;
}

function containsObject(root, predicate) {
  if (Array.isArray(root)) return root.some((value) => containsObject(value, predicate));
  if (!root || typeof root !== 'object') return false;
  if (predicate(root)) return true;
  return Object.values(root).some((value) => containsObject(value, predicate));
}

function repositoryString(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return String(value.url || value.web || value.repository || '');
}

async function run(id, label, severity, fn) {
  try {
    const detail = await fn();
    checks.push({ id, label, severity, status: 'ok', detail: String(detail || 'healthy') });
  } catch (error) {
    checks.push({ id, label, severity, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
  }
}

await run('production-health', 'Production health', 'critical', async () => {
  const body = await request(`${ORIGIN}/healthz`, { json: true });
  if (body?.ok !== true) throw new Error('healthz did not report ok=true');
  if (body?.environment !== 'production') throw new Error(`expected production environment, got ${body?.environment ?? 'missing'}`);
  if (body?.billing_enabled !== false) throw new Error('billing must remain disabled during the current adoption phase');
  if (!body?.deployment_sha) throw new Error('deployment_sha is missing');
  return `production ${body.deployment_sha}`;
});

await run('service-descriptor', 'Machine service descriptor', 'critical', async () => {
  const body = await request(`${ORIGIN}/service.json`, { json: true });
  if (body?.service !== 'SeenRelay') throw new Error(`unexpected service name: ${body?.service ?? 'missing'}`);
  if (!Array.isArray(body?.operations) || body.operations.join(',') !== 'CHECK,OBSERVE') {
    throw new Error('service descriptor no longer exposes exactly CHECK and OBSERVE');
  }
  return `${body.service} ${body.version || ''}`.trim();
});

await run('agent-skill-index', 'Agent Skill discovery index', 'critical', async () => {
  const body = await request(`${ORIGIN}/.well-known/agent-skills/index.json`, { json: true });
  const found = containsObject(body, (value) => value?.name === 'seenrelay' && typeof value?.url === 'string' && value.url.includes('/.well-known/agent-skills/seenrelay/SKILL.md'));
  if (!found) throw new Error('SeenRelay skill entry is missing from the canonical discovery index');
  return 'seenrelay skill is discoverable';
});

await run('agent-skill-document', 'Canonical Agent Skill document', 'critical', async () => {
  const text = await request(`${ORIGIN}/.well-known/agent-skills/seenrelay/SKILL.md`);
  if (!/^---\s*\nname:\s*seenrelay\b/m.test(text)) throw new Error('canonical SKILL.md frontmatter is missing');
  if (!/USE \/ DO NOT USE \/ INSUFFICIENT EVIDENCE/.test(text)) throw new Error('shadow-audit verdict contract is missing');
  if (!/seenrelay-shadow-audit-v1/.test(text)) throw new Error('machine audit schema version is missing');
  return 'canonical skill and audit contract are present';
});

await run('mcp-registry', 'Official MCP Registry', 'critical', async () => {
  const body = await request('https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ovladon%2Fseenrelay', { json: true });
  const found = containsObject(body, (value) => value?.name === registryManifest.name && value?.version === registryManifest.version);
  if (!found) throw new Error(`${registryManifest.name}@${registryManifest.version} is not discoverable in the Official MCP Registry response`);
  return `${registryManifest.name}@${registryManifest.version}`;
});

await run('npm', 'npm promoted client', 'critical', async () => {
  const version = productFacts.install.client_version;
  const body = await request(`https://registry.npmjs.org/seenrelay/${encodeURIComponent(version)}`, { json: true });
  if (body?.name !== 'seenrelay' || body?.version !== version) throw new Error(`expected seenrelay@${version}`);
  const repo = repositoryString(body?.repository);
  if (!repo.includes('github.com/ovladon/seenrelay')) throw new Error('npm metadata no longer points to the canonical repository');
  return `seenrelay@${version}`;
});

await run('pypi', 'PyPI promoted client', 'critical', async () => {
  const version = productFacts.install.client_version;
  const body = await request(`https://pypi.org/pypi/seenrelay/${encodeURIComponent(version)}/json`, { json: true });
  if (body?.info?.name?.toLowerCase() !== 'seenrelay' || body?.info?.version !== version) throw new Error(`expected seenrelay==${version}`);
  const urls = Object.values(body?.info?.project_urls || {}).map(String);
  if (!urls.some((value) => value.includes('github.com/ovladon/seenrelay'))) throw new Error('PyPI metadata no longer points to the canonical repository');
  return `seenrelay==${version}`;
});

await run('glama', 'Glama connector listing', 'advisory', async () => {
  const text = await request('https://glama.ai/mcp/connectors/io.github.ovladon/seenrelay');
  if (!/SeenRelay/i.test(text)) throw new Error('listing no longer identifies SeenRelay');
  if (!/Healthy/i.test(text)) throw new Error('listing does not currently expose Healthy status');
  return 'listing present and reports Healthy';
});

await run('agent-plugins-directory', 'Agent Plugins Directory', 'advisory', async () => {
  const text = await request('https://agent-plugins.directory/ovladon/seenrelay');
  if (!/SeenRelay/i.test(text)) throw new Error('directory page no longer identifies SeenRelay');
  if (!text.includes(pluginManifest.version)) throw new Error(`directory has not indexed current plugin version ${pluginManifest.version}`);
  if (!text.includes(pluginManifest.description)) throw new Error('directory description has not converged to current plugin metadata');
  return `indexed ${pluginManifest.version} with current discovery copy`;
});

await run('agent-plugins-package', 'Agent Plugins portable package', 'informational', async () => {
  if (pluginManifest?.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') throw new Error('plugin.json schema drift');
  if (pluginManifest?.name !== 'seenrelay') throw new Error('plugin.json name drift');
  if (portableMcp?.mcpServers?.seenrelay?.url !== `${ORIGIN}/mcp`) throw new Error('mcp.json canonical endpoint drift');
  return 'portable package is internally consistent';
});

const failures = checks.filter((check) => check.status === 'fail');
const criticalFailures = failures.filter((check) => check.severity === 'critical');
const report = {
  schema_version: 'seenrelay-distribution-radar-v1',
  generated_at: new Date().toISOString(),
  drift: failures.length > 0,
  critical_failure_count: criticalFailures.length,
  advisory_failure_count: failures.filter((check) => check.severity === 'advisory').length,
  checks
};

fs.writeFileSync('distribution-radar-report.json', `${JSON.stringify(report, null, 2)}\n`);

const escaped = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const rows = checks.map((check) => `| ${escaped(check.label)} | ${check.severity} | ${check.status.toUpperCase()} | ${escaped(check.detail)} |`).join('\n');
const markdown = `# SeenRelay distribution radar\n\nGenerated: ${report.generated_at}\n\nThis report distinguishes public discovery/availability from actual external adoption. A green surface means the path is available; it does not prove that an external user installed or retained SeenRelay.\n\n| Surface | Severity | Status | Detail |\n| --- | --- | --- | --- |\n${rows}\n\nCritical failures: **${report.critical_failure_count}**  \nAdvisory failures: **${report.advisory_failure_count}**\n`;
fs.writeFileSync('distribution-radar-report.md', markdown);

console.log(markdown);
