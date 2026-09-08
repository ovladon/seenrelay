import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const readiness = read('.github', 'workflows', 'package-registry-readiness.yml');
const verification = read('.github', 'workflows', 'public-registry-verification.yml');
const publishing = read('.github', 'workflows', 'publish-clients.yml');

test('routine registry readiness checks metadata without downloading SeenRelay packages', () => {
  assert.match(readiness, /npm view seenrelay name version repository\.url --json/);
  assert.match(readiness, /https:\/\/pypi\.org\/pypi\/seenrelay\/json/);
  assert.doesNotMatch(readiness, /npm install[^\n]*seenrelay@/);
  assert.doesNotMatch(readiness, /pip install[^\n]*seenrelay==/);
});

test('public SeenRelay clean installs are confined to canonical public verification', () => {
  assert.match(verification, /- 'public\/product-facts\.json'/);
  assert.match(verification, /- '\.github\/workflows\/public-registry-verification\.yml'/);
  assert.doesNotMatch(verification, /clients\/RELEASE_VERSION/);
  assert.doesNotMatch(verification, /clients\/typescript\/package\.json/);
  assert.doesNotMatch(verification, /clients\/python\/pyproject\.toml/);
  assert.match(verification, /npm install[^\n]*"seenrelay@\$VERSION"/);
  assert.match(verification, /pip install[^\n]*"seenrelay==\$VERSION"/);
});

test('client publishing smoke tests use local release artifacts for SeenRelay', () => {
  assert.match(publishing, /npm install "\$GITHUB_WORKSPACE\/clients\/typescript\/\$\{\{ steps\.pack\.outputs\.tarball \}\}"/);
  assert.match(publishing, /pip install --disable-pip-version-check "\$WHEEL"/);
  assert.doesNotMatch(publishing, /npm install[^\n]*"seenrelay@/);
  assert.doesNotMatch(publishing, /pip install[^\n]*"seenrelay==/);
});
