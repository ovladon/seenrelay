import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('verified first-party classification is lease-stable and cannot affect reward independence', () => {
  const hive=read('src/hive.ts');
  const admission=read('src/hive-lease-admission-db.ts');
  const identity=read('src/identity.ts');

  assert.match(hive,/const internalTelemetry = request \? await isVerifiedInternalTelemetry\(request\) : false/);
  assert.match(hive,/leaseClassMatches/);
  assert.match(hive,/row\.client_key\.startsWith\('internal:'\) === internalTelemetry/);
  assert.match(hive,/consumeVerifiedHiveCheckLease\([\s\S]*internalTelemetry\n\s*\)/);
  assert.match(admission,/expectedInternalTelemetry: boolean/);
  assert.match(admission,/client_key LIKE 'internal:%'/);
  assert.match(admission,/client_key NOT LIKE 'internal:%'/);
  assert.match(identity,/deriveReuseIndependenceKey/);
  assert.doesNotMatch(identity.match(/export async function deriveReuseIndependenceKey[\s\S]*?\n}/)?.[0]||'',/internalTelemetry|x-seenrelay-internal-telemetry/);
});
