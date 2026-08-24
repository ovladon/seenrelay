import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('public MCP registry metadata is production-ready', () => {
  const registry = JSON.parse(read('registry', 'server.json'));
  assert.equal(registry.name, 'io.github.ovladon/seenrelay');
  assert.equal(registry.repository?.url, 'https://github.com/ovladon/seenrelay');
  assert.equal(registry.remotes?.[0]?.type, 'streamable-http');
  assert.equal(registry.remotes?.[0]?.url, 'https://seenrelay.com/mcp');
  assert.doesNotMatch(JSON.stringify(registry), /REPLACE_WITH|localhost|127\.0\.0\.1/i);
});

test('operator spend threshold is not published as a numeric default', () => {
  const env = read('.env.example');
  assert.match(env, /^VERCEL_HARD_SPEND_CAP_USD=$/m);
  const config = read('src', 'config.ts');
  assert.match(config, /optionalNum\('VERCEL_HARD_SPEND_CAP_USD'\)/);
  assert.doesNotMatch(config, /VERCEL_HARD_SPEND_CAP_USD['"],\s*5\b/);
});

test('security documentation matches reject-not-strip URL policy', () => {
  const security = read('SECURITY.md');
  assert.match(security, /rejects authentication\/signature-bearing query parameters before stateful Hive admission/i);
  assert.doesNotMatch(security, /removes known tracking and authentication\/signature query parameters/i);
  assert.match(security, /private vulnerability reporting/i);
});

test('GitHub Actions are pinned to immutable commit SHAs', () => {
  const files = [
    ['.github', 'workflows', 'ci.yml'],
    ['.github', 'workflows', 'preview-release-gate.yml'],
    ['.github', 'workflows', 'standards-watch.yml']
  ];
  for (const parts of files) {
    const text = read(...parts);
    const uses = [...text.matchAll(/^\s*uses:\s*(actions\/(?:checkout|setup-node|upload-artifact))@([^\s#]+)/gm)];
    assert.ok(uses.length > 0, `${parts.join('/')} must use pinned official actions`);
    for (const [, action, ref] of uses) {
      assert.match(ref, /^[0-9a-f]{40}$/, `${action} must be pinned to a full commit SHA`);
    }
    assert.doesNotMatch(text, /uses:\s*actions\/(?:checkout|setup-node|upload-artifact)@v\d/i);
  }
});

test('public source-available ownership and third-party notices are explicit', () => {
  const license = read('LICENSE');
  assert.match(license, /Copyright \(c\) 2026 ovladon/);
  assert.match(license, /THIRD_PARTY_NOTICES\.md/);
  const notices = read('THIRD_PARTY_NOTICES.md');
  for (const dependency of ['@modelcontextprotocol/server', '@neondatabase/serverless', 'hono', 'zod', 'typescript']) {
    assert.ok(notices.includes(dependency), `missing third-party notice for ${dependency}`);
  }
});
