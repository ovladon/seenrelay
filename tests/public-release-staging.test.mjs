import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REQUIRED = [
  'scripts/sync-public-surfaces.mjs',
  'public/product-facts.json',
  'clients/RELEASE_VERSION',
  'clients/typescript/package.json',
  'clients/python/pyproject.toml',
  'src/version.ts',
  'README.md',
  'clients/README.md',
  'docs/QUICKSTART.md'
];

function fixture(publicVersion, releaseVersion) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'seenrelay-release-staging-'));
  for (const rel of REQUIRED) {
    const target = path.join(dir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(ROOT, rel), target);
  }

  writeFileSync(path.join(dir, 'clients/RELEASE_VERSION'), `${releaseVersion}\n`);

  const npmPath = path.join(dir, 'clients/typescript/package.json');
  const npmManifest = JSON.parse(readFileSync(npmPath, 'utf8'));
  npmManifest.version = releaseVersion;
  writeFileSync(npmPath, `${JSON.stringify(npmManifest, null, 2)}\n`);

  const pyPath = path.join(dir, 'clients/python/pyproject.toml');
  const py = readFileSync(pyPath, 'utf8').replace(
    /(^\[project\][\s\S]*?^version\s*=\s*")[^"]+(".*$)/m,
    `$1${releaseVersion}$2`
  );
  writeFileSync(pyPath, py);

  const factsPath = path.join(dir, 'public/product-facts.json');
  const facts = JSON.parse(readFileSync(factsPath, 'utf8'));
  facts.install.client_version = publicVersion;
  writeFileSync(factsPath, `${JSON.stringify(facts, null, 2)}\n`);

  return dir;
}

function runSync(dir, ...args) {
  return spawnSync(process.execPath, ['scripts/sync-public-surfaces.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8'
  });
}

test('a staged source release may be newer than the verified public registry version', () => {
  const dir = fixture('0.1.0', '0.2.0');
  const write = runSync(dir, '--write');
  assert.equal(write.status, 0, write.stderr || write.stdout);

  const generated = readFileSync(path.join(dir, 'src/public-facts.generated.ts'), 'utf8');
  const readme = readFileSync(path.join(dir, 'README.md'), 'utf8');
  const clients = readFileSync(path.join(dir, 'clients/README.md'), 'utf8');
  const quickstart = readFileSync(path.join(dir, 'docs/QUICKSTART.md'), 'utf8');

  assert.match(generated, /"client_version": "0\.1\.0"/);
  assert.match(readme, /client v0\.1\.0/);
  assert.match(clients, /client v0\.1\.0/);
  assert.match(quickstart, /Client v0\.1\.0 was clean-install verified/);
  assert.doesNotMatch(generated, /"client_version": "0\.2\.0"/);

  const check = runSync(dir);
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test('public registry facts may never claim a version newer than the staged source release', () => {
  const dir = fixture('0.3.0', '0.2.0');
  const result = runSync(dir, '--write');
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /public client version 0\.3\.0 is newer than RELEASE_VERSION 0\.2\.0/);
});
