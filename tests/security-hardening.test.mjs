import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (...p) => fs.readFileSync(new URL(`../${p.join('/')}`, import.meta.url), 'utf8');

test('security analysis is pinned and least-privilege scoped', () => {
  const wf = read('.github','workflows','security-analysis.yml');
  assert.match(wf, /github\/codeql-action\/init@[0-9a-f]{40}/);
  assert.match(wf, /github\/codeql-action\/analyze@[0-9a-f]{40}/);
  assert.match(wf, /actions\/dependency-review-action@[0-9a-f]{40}/);
  assert.doesNotMatch(wf, /contents:\s*write|actions:\s*write|pull-requests:\s*write/);
});

test('required CI installs locked dependencies without lifecycle scripts', () => {
  assert.match(read('.github','workflows','ci.yml'), /npm ci --ignore-scripts/);
  assert.match(read('.github','workflows','ai-sdk-compatibility.yml'), /npm ci --ignore-scripts/);
});

test('future npm trusted publishes request provenance explicitly', () => {
  assert.match(read('.github','workflows','publish-clients.yml'), /npm publish "\$TARBALL" --access public --provenance/);
});

test('trust surface does not claim third-party certification', () => {
  const trust = read('src','trust.ts');
  assert.match(trust, /third_party_security_audit:\s*false/);
  assert.match(trust, /external_security_certification:\s*false/);
  assert.match(trust, /Do not take SeenRelay on faith/);
  assert.match(trust, /shadow mode/i);
  assert.match(trust, /Fail open/i);
});

test('MCP gets an explicit bounded transport request before SDK handling', () => {
  const mcp = read('src','mcp.ts');
  assert.match(mcp, /boundedRequest\(request, config\(\)\.maxBodyBytes\)/);
  assert.match(mcp, /handler\.fetch\(safeRequest\)/);
});

test('admin login route is transport-bounded before credential parsing', () => {
  const index = read('src','index.ts');
  assert.match(index, /boundedRequest\(c\.req\.raw, Math\.min\(config\(\)\.maxBodyBytes, 4096\)\)/);
  assert.match(index, /return adminLogin\(bounded\.request\)/);
});

test('trust surface is discoverable to humans and coding agents', () => {
  const adoption = read('src','adoption.ts');
  assert.match(adoption, /const urls = \[.*'\/trust'/);
  assert.match(adoption, /Trust \/ verification posture: \${origin}\/trust/);
});
