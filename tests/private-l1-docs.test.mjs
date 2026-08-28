import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const doc = fs.readFileSync(new URL('../docs/ZERO_STATE_LOCAL_FIRST.md', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../clients/typescript/dist/zero-state.js', import.meta.url), 'utf8');

test('private L1 documentation preserves zero-state and encryption boundaries', () => {
  assert.match(doc, /Private completed-result reuse also defaults to TTL `0`/);
  assert.match(doc, /AES-256-GCM/);
  assert.match(doc, /private L1 hit is not an independent observation/i);
  assert.match(doc, /relay CHECK is off by default/i);
  assert.match(source, /createAesGcmPrivateCodec/);
  assert.match(source, /cipher\.setAAD\(Buffer\.from\(coordinateKey/);
  assert.match(source, /privateStore and privateCodec must be configured together/);
});
