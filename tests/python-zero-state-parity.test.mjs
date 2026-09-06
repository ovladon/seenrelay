import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { sha256JsonFingerprint } from '../clients/typescript/dist/zero-state.js';

const vectors = [
  { b: 2, a: 1 },
  { nested: { z: [1, 1.0, -0, 0.000001, 1e-7, 1e20, 1e21], a: true }, n: null },
  { '\u{1F600}': 'astral', '\uE000': 'bmp-private-use', a: 'x' },
  { text: 'quote" slash/ backslash\\ newline\n tab\t', array: [false, null, 'é', '\u2028', '\u2029'] },
  { exact_large: 9007199254740992 },
];

test('Python Zero-State coordinate fingerprints match JavaScript for interoperable JSON vectors', () => {
  const js = vectors.map(sha256JsonFingerprint);
  const py = JSON.parse(execFileSync('python3', ['-c', String.raw`
import json,sys
sys.path.insert(0,'clients/python')
from seenrelay_zero_state import sha256_json_fingerprint
vectors=json.load(sys.stdin)
print(json.dumps([sha256_json_fingerprint(v) for v in vectors]))
`], {
    cwd: new URL('..', import.meta.url),
    input: JSON.stringify(vectors),
    encoding: 'utf8',
  }));
  assert.deepEqual(py, js);
});
