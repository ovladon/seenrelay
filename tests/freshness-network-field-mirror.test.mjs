import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIRROR_VERSION, INTEREST_VERSION, MirrorValidationError,
  buildFieldMirror, compareFieldMirrors, validateInterestManifest, assessInterest
} from '../experimental/freshness-network/field-mirror.mjs';

const rootFactKey = 'f'.repeat(64);
const hashKey = 'private-key-material-for-tests-only-0123456789';
const H = c => 'h1:' + c.repeat(64);
const time1 = '2026-10-30T10:00:00Z';
const time2 = '2026-10-30T10:05:00Z';
function mirror(fields, extras = {}) {
  return buildFieldMirror({
    rootFactKey, hashKey, keyId: 'key-2026', profileId: 'catalog-v1', scopeId: 'public-eu',
    observedAt: time2, coverage: 'complete',
    fields, ...extras
  });
}
const f = (path, char, observedAt = time2) => ({ path, fingerprint: H(char), observedAt });
function interests(fields) {
  return { version: INTEREST_VERSION, rootFactKey, disclosure: 'local_only', fields };
}

test('stable hierarchical hashes do not depend on field insertion order', () => {
  const fields = [f('/commercial/price', 'a'), f('/technical/ram', 'b'), f('/commercial/color', 'c')];
  const a = mirror(fields);
  const b = mirror([...fields].reverse());
  assert.equal(a.version, MIRROR_VERSION);
  assert.equal(a.rootFingerprint, b.rootFingerprint);
  assert.deepEqual(a.nodes, b.nodes);
  assert.ok(a.nodes.some(n => n.path === '/commercial' && n.kind === 'branch' && /^m1:/.test(n.fingerprint)));
  assert.ok(a.nodes.some(n => n.path === '' && n.kind === 'branch' && n.fingerprint === a.rootFingerprint));
  assert.equal(a.nodes.find(n => n.path === '/commercial/price').fingerprint, H('a'));
  assert.equal(JSON.stringify(a).includes(hashKey), false);
});

test('only observed price changes, not color, are identified', () => {
  const a = mirror([f('/commercial/price', 'a', time1), f('/commercial/color', 'c', time1)], { observedAt: time1 });
  const b = mirror([f('/commercial/price', 'b'), f('/commercial/color', 'c')]);
  const result = compareFieldMirrors(a, b);
  assert.equal(result.status, 'DIFFERENT_OBSERVED');
  assert.equal(result.rootEqual, false);
  assert.deepEqual(result.changes.map(x => [x.path, x.status]), [
    ['/commercial/color', 'SAME_OBSERVED'], ['/commercial/price', 'CHANGED_OBSERVED']
  ]);
});

test('same observed snapshots cannot assert anything about intermediate reversions', () => {
  const a = mirror([f('/commercial/price', 'a', time1)], { observedAt: time1 });
  const b = mirror([f('/commercial/price', 'a')]);
  const result = compareFieldMirrors(a, b);
  assert.equal(result.status, 'SAME_OBSERVED');
  assert.equal(result.rootEqual, true);
  assert.equal(result.changes[0].status, 'SAME_OBSERVED');
});

test('complete coverage distinguishes added and removed fields, partial does not', () => {
  const a = mirror([f('/price', 'a')]);
  const b = mirror([f('/price', 'a'), f('/color', 'c')]);
  assert.equal(compareFieldMirrors(a, b).changes.find(x => x.path === '/color').status, 'ADDED_OBSERVED');
  assert.equal(compareFieldMirrors(b, a).changes.find(x => x.path === '/color').status, 'REMOVED_OBSERVED');
  assert.equal(compareFieldMirrors(a, mirror([f('/price', 'a'), f('/color', 'c')], { coverage: 'partial' }))
    .changes.find(x => x.path === '/color').status, 'UNOBSERVED');
});

test('unknown or unobserved data never turn into a comparable known root', () => {
  const a = mirror([f('/price', 'a')]);
  const b = mirror([f('/price', 'a'), { path: '/color', fingerprint: null, state: 'unknown' }]);
  assert.equal(b.rootFingerprint, null);
  assert.equal(compareFieldMirrors(a, b).status, 'INCOMPLETE');
  const c = mirror([{ path: '/price', fingerprint: null, state: 'unobserved' }]);
  assert.equal(compareFieldMirrors(a, c).changes[0].status, 'UNOBSERVED');
});

test('scope, extractor profile and key epoch cannot be silently compared', () => {
  const a = mirror([f('/price', 'a')]);
  const variants = [
    { scopeId: 'private-eu' }, { profileId: 'catalog-v2' }, { keyId: 'key-2027' },
    { rootFactKey: '0'.repeat(64) }
  ];
  for (const extras of variants) {
    assert.equal(compareFieldMirrors(a, mirror([f('/price', 'a')], extras)).status, 'INCOMPARABLE');
  }
});

test('rejects raw content, extra structural fields, invalid paths, and unkeyed hashes', () => {
  const invalidFields = [
    [{ path: '/price', value: 19, fingerprint: H('a') }],
    [{ path: '/price', fingerprint: 'a'.repeat(64) }],
    [{ path: '/price', fingerprint: H('a'), raw_content: 'secret' }],
    [{ path: '/bad~2escape', fingerprint: H('a') }],
    [{ path: '/x//y', fingerprint: H('a') }],
    [{ path: '/x', fingerprint: H('a') }, { path: '/x/y', fingerprint: H('b') }],
    [{ path: '/x', fingerprint: H('a') }, { path: '/x', fingerprint: H('b') }]
  ];
  for (const fields of invalidFields) {
    assert.throws(() => mirror(fields), MirrorValidationError);
  }
  assert.throws(() => mirror([f('/price', 'a')], { sourceContent: '<html>secret</html>' }), MirrorValidationError);
  assert.throws(() => mirror([f('/price', 'a')], { hashKey: 'short' }), MirrorValidationError);
  assert.throws(() => mirror([f('/price', 'a')], { observedAt: '2030-99-99T10:00:00Z' }), MirrorValidationError);
});

test('interest manifests reject unknown keys and remain local-by-default', () => {
  const a = validateInterestManifest(interests([
    { path: '/price', maxAgeSeconds: 60, required: true, needsValue: false }
  ]));
  assert.equal(a.disclosure, 'local_only');
  assert.throws(() => validateInterestManifest({ ...interests([]), fields: [] }), MirrorValidationError);
  assert.throws(() => validateInterestManifest({
    ...interests([{ path: '/price', maxAgeSeconds: 60, required: true, needsValue: false }]),
    sourceUrl: 'https://user-private-source.example'
  }), MirrorValidationError);
});

test('interest evaluation refuses automated reuse and refuses inventing new source values', () => {
  const before = mirror([f('/price', 'a', time1)], { observedAt: time1 });
  const after = mirror([f('/price', 'a')]);
  const manifest = interests([{ path: '/price', maxAgeSeconds: 600, required: true, needsValue: false }]);
  const result = assessInterest(before, after, manifest, { now: '2026-10-30T10:06:00Z' });
  assert.equal(result.verdict, 'CANDIDATE_ONLY_NOT_AUTHORIZED');
  assert.equal(result.fields[0].action, 'CANDIDATE_RELIANCE_REVIEW');
  const needsValue = interests([{ path: '/price', maxAgeSeconds: 600, required: true, needsValue: true }]);
  const resultB = assessInterest(before, after, needsValue, { now: '2026-10-30T10:06:00Z' });
  assert.equal(resultB.verdict, 'SOURCE_OR_POLICY_REVIEW_REQUIRED');
  assert.equal(resultB.fields[0].action, 'AUTHORITATIVE_VALUE_REQUIRED');
});

test('strict max-age and future timestamps cannot be silently trusted', () => {
  const before = mirror([f('/price', 'a', time1)], { observedAt: time1 });
  const after = mirror([f('/price', 'a')]);
  const manifest = interests([{ path: '/price', maxAgeSeconds: 30, required: true, needsValue: false }]);
  const stale = assessInterest(before, after, manifest, { now: '2026-10-30T10:06:00Z' });
  assert.equal(stale.fields[0].fresh, false);
  assert.equal(stale.fields[0].action, 'REVALIDATE_OR_REPORT_UNKNOWN');
  const future = assessInterest(before, after, manifest, { now: '2026-10-30T10:04:00Z' });
  assert.equal(future.fields[0].fresh, false);
});

test('no network, storage, marketplace, external calls or payment side effects', () => {
  const before = mirror([f('/price', 'a', time1)], { observedAt: time1 });
  const after = mirror([f('/price', 'b')]);
  const diff = compareFieldMirrors(before, after);
  assert.ok(diff.changes.every(c => !Object.hasOwn(c, 'value') && !Object.hasOwn(c, 'content')));
  assert.ok(after.nodes.every(n => !Object.hasOwn(n, 'value') && !Object.hasOwn(n, 'rawContent')));
  assert.deepEqual(Object.keys(after).sort(), [
    'coverage', 'keyId', 'nodes', 'observedAt', 'profileId', 'rootFactKey',
    'rootFingerprint', 'scopeId', 'version'
  ]);
});
