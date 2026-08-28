import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'publish-clients.yml'), 'utf8');
const releaseVersion = fs.readFileSync(path.join(root, 'clients', 'RELEASE_VERSION'), 'utf8').trim();
const npmManifest = JSON.parse(fs.readFileSync(path.join(root, 'clients', 'typescript', 'package.json'), 'utf8'));
const pyproject = fs.readFileSync(path.join(root, 'clients', 'python', 'pyproject.toml'), 'utf8');
const pyVersion = pyproject.match(/\[project\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;

test('client package publishing is Git-audited and uses scoped OIDC without long-lived publish secrets', () => {
  assert.match(workflow, /release:\s*\n\s+types: \[published\]/);
  assert.match(workflow, /push:\s*\n\s+branches: \[main\][\s\S]*?clients\/RELEASE_VERSION/);
  assert.match(workflow, /startsWith\(github\.event\.release\.tag_name, 'clients-v'\)/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /publish-npm:[\s\S]*?id-token: write/);
  assert.match(workflow, /publish-pypi:[\s\S]*?id-token: write/);
  assert.match(workflow, /npm publish \"\$TARBALL\" --access public/);
  assert.match(workflow, /pypa\/gh-action-pypi-publish@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/download-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|PYPI_TOKEN|TWINE_PASSWORD|password:\s*\$\{\{\s*secrets\./);
});

test('release builds verify the requested version against both package manifests', () => {
  assert.match(releaseVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(npmManifest.version, releaseVersion);
  assert.equal(pyVersion, releaseVersion);
  const markerChecks = workflow.match(/clients\/RELEASE_VERSION/g) || [];
  assert.ok(markerChecks.length >= 3);
  assert.match(workflow, /GITHUB_REF_NAME#clients-v/);
  assert.match(workflow, /clients\/typescript\/package\.json/);
  assert.match(workflow, /clients\/python\/pyproject\.toml/);
  assert.match(workflow, /test \"\$EXPECTED\" = \"\$ACTUAL\"/);
  assert.match(workflow, /Install npm tarball in a clean project/);
  assert.match(workflow, /Install Python wheel in a clean virtual environment/);
});

test('npm bootstrap version is never republished when it already exists', () => {
  assert.match(workflow, /npm view \"seenrelay@\$VERSION\" version --json/);
  assert.match(workflow, /if: steps\.npm-version\.outputs\.exists != 'true'/);
});
