import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'publish-clients.yml'), 'utf8');

test('client package publishing is release-gated and uses scoped OIDC without long-lived publish secrets', () => {
  assert.match(workflow, /release:\s*\n\s+types: \[published\]/);
  assert.match(workflow, /startsWith\(github\.event\.release\.tag_name, 'clients-v'\)/);
  assert.match(workflow, /publish-npm:[\s\S]*?id-token: write/);
  assert.match(workflow, /publish-pypi:[\s\S]*?id-token: write/);
  assert.match(workflow, /npm publish \"\$TARBALL\" --access public/);
  assert.match(workflow, /pypa\/gh-action-pypi-publish@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/download-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|PYPI_TOKEN|TWINE_PASSWORD|password:\s*\$\{\{\s*secrets\./);
});

test('release builds verify tag and package versions before publishing', () => {
  const tagChecks = workflow.match(/EXPECTED=\"\$\{GITHUB_REF_NAME#clients-v\}\"/g) || [];
  assert.equal(tagChecks.length, 2);
  assert.match(workflow, /clients\/typescript\/package\.json/);
  assert.match(workflow, /clients\/python\/pyproject\.toml/);
  assert.match(workflow, /test \"\$EXPECTED\" = \"\$ACTUAL\"/);
  assert.match(workflow, /Install npm tarball in a clean project/);
  assert.match(workflow, /Install Python wheel in a clean virtual environment/);
});
