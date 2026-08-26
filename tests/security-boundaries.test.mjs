import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('admin JSON inputs use the shared bounded reader', () => {
  const admin = read('src/admin.ts');
  assert.match(admin, /readJsonBody<\{secret\?:unknown\}>/);
  assert.match(admin, /readJsonBody<Record<string,unknown>>/);
  assert.match(admin, /readJsonBody<\{playbook\?:unknown\}>/);
  assert.doesNotMatch(admin, /await request\.json\(\)/);
});

test('MCP enters the SDK only after SeenRelay-owned body limiting', () => {
  const index = read('src/index.ts');
  assert.match(index, /handleMcp\(await limitRequestBody\(c\.req\.raw, config\(\)\.maxBodyBytes\)\)/);
});
