import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('public distribution manifests stay aligned with the runtime', () => {
  const pkg = JSON.parse(read('package.json'));
  const mcp = JSON.parse(read('mcp.json'));
  const plugin = JSON.parse(read('plugin.json'));
  const gemini = JSON.parse(read('gemini-extension.json'));
  const registry = JSON.parse(read('registry', 'server.json'));
  const service = read('src', 'service.ts');
  const version = read('src', 'version.ts');

  assert.match(version, /SERVICE_RELEASE = '0\.3\.10'/);
  assert.equal(mcp.mcpServers.seenrelay.url, 'https://seenrelay.com/mcp');
  assert.equal(plugin.mcpServers.seenrelay.url, 'https://seenrelay.com/mcp');
  assert.equal(gemini.mcpServers.seenrelay.url, 'https://seenrelay.com/mcp');
  assert.equal(registry.remotes[0].url, 'https://seenrelay.com/mcp');
  assert.match(registry.version, /^0\.3\.10$/);
  assert.match(pkg.engines.node, />=22/);
  assert.match(service, /SERVICE_RELEASE/);
});

test('public docs point agents to supported discovery and conservative use', () => {
  const llms = read('src', 'public.ts');
  const skill = read('skills', 'seenrelay', 'SKILL.md');
  const quickstart = read('docs', 'QUICKSTART.md');
  const adoption = read('src', 'adoption.ts');

  assert.match(llms, /\.well-known\/agent-skills\/seenrelay\/SKILL\.md/);
  assert.match(llms, /\.well-known\/skills\/seenrelay\/SKILL\.md/);
  assert.match(skill, /CHECK/);
  assert.match(skill, /OBSERVE/);
  assert.match(skill, /stronger source-native|source-native/i);
  assert.match(quickstart, /read-only/i);
  assert.match(adoption, /shared CHECK is off by default/i);
});

test('client and quickstart adoption guides are concrete and conservative', () => {
  const clients = read('docs', 'CLIENTS.md');
  const adoption = read('src', 'adoption.ts');
  const quickstart = read('docs', 'QUICKSTART.md');
  const publicFacts = JSON.parse(read('public', 'product-facts.json'));
  const clientVersion = publicFacts.install?.client_version;
  assert.match(clientVersion, /^\d+\.\d+\.\d+$/);
  assert.match(clients, /claude mcp add --transport http seenrelay https:\/\/seenrelay\.com\/mcp/);
  assert.match(clients, /\.cursor\/mcp\.json/);
  assert.match(clients, /cursor\.com\/install-mcp\?name=seenrelay/);
  assert.match(clients, /code --add-mcp/);
  assert.match(clients, /VS Code \/ GitHub Copilot/);
  assert.match(clients, /ChatGPT custom MCP apps/);
  assert.match(clients, /shadow mode/i);
  assert.match(clients, /provider-independent/i);
  assert.match(adoption, /Add SeenRelay to Cursor/);
  assert.match(adoption, /seenrelay\/mcp-auto/);
  assert.match(quickstart, /currently free/i);
  assert.ok(
    quickstart.toLowerCase().includes(`recommended ${clientVersion} path is local-first in both javascript/typescript and python`),
    `quickstart must identify verified client ${clientVersion} as the recommended cross-language local-first Zero-State path`
  );
  assert.match(quickstart, /classic Python API and Python Ambient adapters remain shadow-first by default/i);
  assert.match(quickstart, /UNKNOWN/);
  assert.match(quickstart, /observer-supplied, unverified ETag \/ Last-Modified/i);
  assert.match(quickstart, /conditional-request hint/i);
  assert.match(quickstart, /304 Not Modified/);
  assert.doesNotMatch(`${clients}\n${quickstart}`, /certified truth|guaranteed truth|kill criteria/i);
});

test('public discovery surfaces expose clients without indexing admin', () => {
  const publicTs = read('src', 'public.ts');
  const service = read('src', 'service.ts');
  assert.match(publicTs, /\/clients/);
  assert.match(service, /\/clients/);
  assert.doesNotMatch(publicTs, /\/admin/);
});

test('MCP Registry publishing uses GitHub OIDC and a checksum-pinned publisher binary', () => {
  const workflow = read('.github', 'workflows', 'mcp-registry-publish.yml');
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /sha256sum\s+-c/);
  assert.match(workflow, /mcp-publisher/);
  assert.doesNotMatch(workflow, /MCP_REGISTRY_TOKEN|REGISTRY_TOKEN/);
});

test('operator spend threshold is not published as a numeric default', () => {
  const economics = read('docs', 'ECONOMICS_LAB.md');
  const env = read('.env.example');
  assert.match(economics, /operator-owned/i);
  assert.doesNotMatch(economics, /€\s*20|20\s*EUR|20\s*euro/i);
  assert.doesNotMatch(env, /20/);
});

test('security documentation matches reject-not-strip URL policy', () => {
  const security = read('SECURITY.md');
  assert.match(security, /reject/i);
  assert.match(security, /userinfo|fragment/i);
  assert.doesNotMatch(security, /strip credentials and continue/i);
});

test('GitHub Actions are pinned to immutable commit SHAs', () => {
  const workflowDir = path.join(root, '.github', 'workflows');
  const workflows = fs.readdirSync(workflowDir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
  for (const name of workflows) {
    const text = fs.readFileSync(path.join(workflowDir, name), 'utf8');
    for (const match of text.matchAll(/uses:\s*[^\s@]+@([^\s#]+)/g)) {
      assert.match(match[1], /^[0-9a-f]{40}$/, `${name} action ${match[0]} is not commit-pinned`);
    }
  }
});

test('public source-available ownership and third-party notices are explicit', () => {
  const licensing = read('LICENSING.md');
  const notices = read('THIRD_PARTY_NOTICES.md');
  assert.match(licensing, /source-available/i);
  assert.match(licensing, /client/i);
  assert.match(notices, /third-party/i);
});
