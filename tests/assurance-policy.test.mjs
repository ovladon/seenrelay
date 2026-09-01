import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { assessSharedCheckEvidence, createMultiSignalRetainedReusePolicy, sharedEvidenceCaveat } from '../clients/typescript/dist/assurance.js';
const strong = Object.freeze({ status: 'SAME_OBSERVED', known_value_hash: 'h1:aaa', latest_value_hash: 'h1:aaa', age_seconds: 10, max_age_seconds: 300, recent_observer_keys: 2, recent_cryptographic_observer_keys: 2, recent_unverified_observer_keys: 0, recent_reuse_independence_buckets: 2 });
test('multi-signal shared-evidence helper requires multiple signal classes', () => {
  assert.equal(assessSharedCheckEvidence(strong).eligible, true);
  assert.equal(createMultiSignalRetainedReusePolicy()(strong, {v:1}, {v:1}), true);
  assert.throws(() => createMultiSignalRetainedReusePolicy({ minObserverKeys: 1 }), /minimum thresholds of 2/);
  assert.throws(() => createMultiSignalRetainedReusePolicy({ minCryptographicObserverKeys: 1 }), /minimum thresholds of 2/);
  assert.throws(() => createMultiSignalRetainedReusePolicy({ minReuseIndependenceBuckets: 1 }), /minimum thresholds of 2/);
  assert.equal(assessSharedCheckEvidence({ ...strong, recent_reuse_independence_buckets: 1 }).eligible, false);
  assert.equal(assessSharedCheckEvidence({ ...strong, recent_cryptographic_observer_keys: 1 }).eligible, false);
  assert.equal(assessSharedCheckEvidence({ ...strong, status: 'CHANGED_OBSERVED' }).eligible, false);
  assert.equal(assessSharedCheckEvidence({ ...strong, latest_value_hash: 'h1:bbb' }).eligible, false);
  assert.equal(assessSharedCheckEvidence({ ...strong, age_seconds: 301 }).eligible, false);
  assert.equal(assessSharedCheckEvidence(strong, { maxAgeSeconds: 5 }).eligible, false);
  assert.match(sharedEvidenceCaveat, /do not prove independent real-world actors or truth/i);
});
test('TypeScript and Python assurance policy agree on deterministic vectors', () => {
  const vectors = [strong, { ...strong, recent_observer_keys: 1 }, { ...strong, recent_cryptographic_observer_keys: 0 }, { ...strong, recent_reuse_independence_buckets: 1 }, { ...strong, status: 'CONTESTED' }, { ...strong, age_seconds: 999 }];
  const js = vectors.map((check) => assessSharedCheckEvidence(check));
  const py = JSON.parse(execFileSync('python3', ['-c', String.raw`
import json,sys
sys.path.insert(0,'clients/python')
from seenrelay_assurance import assess_shared_check_evidence
vectors=json.loads(sys.stdin.read())
print(json.dumps([assess_shared_check_evidence(v) for v in vectors]))
`], { cwd: new URL('..', import.meta.url), input: JSON.stringify(vectors), encoding: 'utf8' }));
  assert.deepEqual(py.map((x) => ({eligible:x.eligible,reasons:x.reasons,evidence:x.evidence})), js.map((x) => ({eligible:x.eligible,reasons:[...x.reasons],evidence:x.evidence})));
});
