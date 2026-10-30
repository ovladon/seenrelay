import { createHmac } from 'node:crypto';

/**
 * Experimental, in-memory, content-free change mirror.
 * No network access, source fetching, database writes, settlement or CHECK/OBSERVE changes.
 * Its input consists entirely of pre-keyed fingerprints, stable structural IDs and metadata.
 */
export const MIRROR_VERSION = 'seenrelay-field-mirror-v1';
export const INTEREST_VERSION = 'seenrelay-agent-interest-v1';
const KEYED_FINGERPRINT = /^h1:[0-9a-f]{64}$/;
const FACT_KEY = /^[0-9a-f]{64}$/;
const OPAQUE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_FIELDS = 512;
const MAX_DEPTH = 8;
const MAX_PATH_BYTES = 512;

export class MirrorValidationError extends Error {
  constructor(message) { super(message); this.name = 'MirrorValidationError'; }
}

function fail(message) { throw new MirrorValidationError(message); }
function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(label + ' has unexpected key: ' + key);
}
function opaque(value, label) {
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) fail(label + ' must be a bounded opaque identifier');
  return value;
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))) fail(label + ' must be a valid UTC ISO-8601 timestamp');
  if (new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    fail(label + ' has an invalid calendar date');
  }
  return value;
}
function fieldPath(value) {
  if (typeof value !== 'string' || value.length > MAX_PATH_BYTES || !value.startsWith('/') || value === '/') {
    fail('field path must be a bounded non-root JSON pointer');
  }
  if (/(^|[^~])~(?![01])/.test(value) || /~(?![01])/.test(value)) fail('field path contains an invalid JSON pointer escape');
  const parts = value.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (parts.length > MAX_DEPTH || parts.some(s => !s || s.length > 128 || /[\u0000-\u001f\u007f]/.test(s))) {
    fail('field path has an empty, excessive, or control-character segment');
  }
  const canonical = '/' + parts.map(s => s.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
  if (canonical !== value) fail('field path must be canonically escaped');
  return { path: value, parts };
}
function compareBytes(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function pathFromParts(parts) {
  return parts.length ? '/' + parts.map(s => s.replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '';
}
function hashBranch(secret, rootFactKey, keyId, profileId, scopeId, path, children) {
  const message = JSON.stringify([
    MIRROR_VERSION, 'branch', rootFactKey, keyId, profileId, scopeId, path,
    children.map(child => [child.path, child.fingerprint])
  ]);
  return 'm1:' + createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

/** Build one explicitly scoped snapshot; the hashKey is never returned or persisted here. */
export function buildFieldMirror(input) {
  exactKeys(input, ['rootFactKey', 'hashKey', 'keyId', 'profileId', 'scopeId', 'observedAt', 'coverage', 'fields'], 'mirror');
  const { rootFactKey, hashKey, fields } = input;
  if (typeof rootFactKey !== 'string' || !FACT_KEY.test(rootFactKey)) fail('rootFactKey must be a canonical fact-v3 SHA-256 key');
  if (typeof hashKey !== 'string' || Buffer.byteLength(hashKey) < 32) fail('hashKey must be at least 32 bytes');
  const keyId = opaque(input.keyId, 'keyId');
  const profileId = opaque(input.profileId, 'profileId');
  const scopeId = opaque(input.scopeId, 'scopeId');
  const observedAt = timestamp(input.observedAt, 'observedAt');
  if (!['partial', 'complete'].includes(input.coverage)) fail('coverage must be partial or complete');
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > MAX_FIELDS) fail('fields must contain 1..512 leaves');

  const leafMap = new Map();
  for (const entry of fields) {
    exactKeys(entry, ['path', 'fingerprint', 'state', 'observedAt'], 'field');
    const parsed = fieldPath(entry.path);
    if (leafMap.has(parsed.path)) fail('duplicate field path: ' + parsed.path);
    const state = entry.state ?? 'observed';
    if (!['observed', 'unknown', 'unobserved'].includes(state)) fail('field state is invalid');
    const known = state === 'observed';
    if (known && (typeof entry.fingerprint !== 'string' || !KEYED_FINGERPRINT.test(entry.fingerprint))) {
      fail('observed field requires a server-keyed h1 fingerprint; raw values are forbidden');
    }
    if (!known && entry.fingerprint !== null) fail('unknown/unobserved fields must have null fingerprints');
    const at = known ? timestamp(entry.observedAt ?? observedAt, 'field.observedAt') : null;
    if (at && Date.parse(at) > Date.parse(observedAt)) fail('field observation cannot follow snapshot observedAt');
    leafMap.set(parsed.path, {
      path: parsed.path, parts: parsed.parts, kind: 'leaf',
      state, fingerprint: known ? entry.fingerprint : null, observedAt: at
    });
  }

  const sortedPaths = [...leafMap.keys()].sort(compareBytes);
  for (const path of sortedPaths) {
    const parts = leafMap.get(path).parts;
    for (let depth = 1; depth < parts.length; depth++) {
      if (leafMap.has(pathFromParts(parts.slice(0, depth)))) {
        fail('a field cannot simultaneously be a leaf and a parent');
      }
    }
  }
  const nodes = new Map([...leafMap].map(([path, entry]) => [path, entry]));
  const branchPaths = new Set(['']);
  for (const leaf of leafMap.values()) {
    for (let depth = 0; depth < leaf.parts.length; depth++) {
      branchPaths.add(pathFromParts(leaf.parts.slice(0, depth)));
    }
  }
  for (const path of branchPaths) nodes.set(path, { path, kind: 'branch', fingerprint: null });
  const orderedBranches = [...branchPaths].sort((a, b) =>
    (b ? b.split('/').length : 0) - (a ? a.split('/').length : 0) || compareBytes(a, b));
  for (const path of orderedBranches) {
    const children = [...nodes.values()].filter(node => node.path !== path && (
      path === '' ? node.path.lastIndexOf('/') === 0 :
      node.path.startsWith(path + '/') && node.path.slice(path.length + 1).indexOf('/') === -1
    )).sort((a, b) => compareBytes(a.path, b.path));
    if (children.length < 1) fail('empty branch');
    const allKnown = children.every(child => child.fingerprint !== null);
    nodes.get(path).fingerprint = allKnown ?
      hashBranch(hashKey, rootFactKey, keyId, profileId, scopeId, path, children) : null;
  }
  const publicNodes = [...nodes.values()].sort((a, b) => compareBytes(a.path, b.path)).map(node => Object.freeze({
    path: node.path, kind: node.kind, state: node.kind === 'leaf' ? node.state : (node.fingerprint ? 'observed' : 'incomplete'),
    fingerprint: node.fingerprint, observedAt: node.kind === 'leaf' ? node.observedAt : undefined
  }));
  return Object.freeze({
    version: MIRROR_VERSION, rootFactKey, keyId, profileId, scopeId,
    observedAt, coverage: input.coverage, rootFingerprint: nodes.get('').fingerprint,
    nodes: Object.freeze(publicNodes)
  });
}

function leaves(snapshot) {
  return new Map(snapshot.nodes.filter(node => node.kind === 'leaf').map(node => [node.path, node]));
}
function comparable(a, b) {
  return a?.version === MIRROR_VERSION && b?.version === MIRROR_VERSION &&
    ['rootFactKey', 'keyId', 'profileId', 'scopeId'].every(k => a[k] === b[k]);
}

/** Compare the two observed snapshots. This cannot prove nothing changed between them. */
export function compareFieldMirrors(previous, current) {
  if (!comparable(previous, current)) {
    return { status: 'INCOMPARABLE', changes: [], reason: 'identity, profile, key epoch or rights scope mismatch' };
  }
  const before = leaves(previous), after = leaves(current);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort(compareBytes);
  const bothComplete = previous.coverage === 'complete' && current.coverage === 'complete';
  const changes = paths.map(path => {
    const a = before.get(path), b = after.get(path);
    let status;
    if (!a || !b) {
      const present = a ?? b;
      status = present.fingerprint === null ?
        (present.state === 'unobserved' ? 'UNOBSERVED' : 'UNKNOWN') :
        bothComplete ? (!a ? 'ADDED_OBSERVED' : 'REMOVED_OBSERVED') : 'UNOBSERVED';
    }
    else if (a.fingerprint === null || b.fingerprint === null) {
      status = a.state === 'unobserved' || b.state === 'unobserved' ? 'UNOBSERVED' : 'UNKNOWN';
    } else status = a.fingerprint === b.fingerprint ? 'SAME_OBSERVED' : 'CHANGED_OBSERVED';
    return { path, status, previousObservedAt: a?.observedAt ?? null, currentObservedAt: b?.observedAt ?? null };
  });
  return {
    status: changes.every(c => c.status === 'SAME_OBSERVED') ? 'SAME_OBSERVED' :
      changes.some(c => ['UNKNOWN', 'UNOBSERVED'].includes(c.status)) ? 'INCOMPLETE' : 'DIFFERENT_OBSERVED',
    rootCompared: previous.rootFingerprint !== null && current.rootFingerprint !== null,
    rootEqual: previous.rootFingerprint !== null && current.rootFingerprint !== null &&
      previous.rootFingerprint === current.rootFingerprint,
    changes
  };
}

/** Agent interests are local by default and never create a subscription or a fetch. */
export function validateInterestManifest(input) {
  exactKeys(input, ['version', 'rootFactKey', 'fields', 'disclosure'], 'interest manifest');
  if (input.version !== INTEREST_VERSION) fail('unknown interest manifest version');
  if (typeof input.rootFactKey !== 'string' || !FACT_KEY.test(input.rootFactKey)) fail('interest rootFactKey must be canonical');
  if (!['local_only', 'minimal_opt_in'].includes(input.disclosure)) fail('disclosure must be explicit');
  if (!Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > MAX_FIELDS) fail('interest fields must contain 1..512 entries');
  const seen = new Set();
  const fields = input.fields.map(entry => {
    exactKeys(entry, ['path', 'maxAgeSeconds', 'required', 'needsValue'], 'interest field');
    const { path } = fieldPath(entry.path);
    if (seen.has(path)) fail('duplicate interest path');
    seen.add(path);
    if (!Number.isSafeInteger(entry.maxAgeSeconds) || entry.maxAgeSeconds < 0 ||
        entry.maxAgeSeconds > 604800) fail('maxAgeSeconds must be 0..604800');
    if (typeof entry.required !== 'boolean' || typeof entry.needsValue !== 'boolean') fail('interest field booleans required');
    return { path, maxAgeSeconds: entry.maxAgeSeconds, required: entry.required, needsValue: entry.needsValue };
  });
  return {
    version: INTEREST_VERSION, rootFactKey: input.rootFactKey,
    disclosure: input.disclosure, fields: fields.sort((a, b) => compareBytes(a.path, b.path))
  };
}

/**
 * Advisory decision impact only. Safe-source permissions, actual values, buyer local
 * policies and native controls are intentionally outside the mirror's authority.
 */
export function assessInterest(previous, current, manifest, { now } = {}) {
  const interest = validateInterestManifest(manifest);
  const nowIso = timestamp(now, 'now');
  const diff = compareFieldMirrors(previous, current);
  if (diff.status === 'INCOMPARABLE' || interest.rootFactKey !== current.rootFactKey) {
    return { verdict: 'INSUFFICIENT_EVIDENCE', fields: [], comparison: 'INCOMPARABLE' };
  }
  const byPath = new Map(diff.changes.map(c => [c.path, c]));
  const evaluated = interest.fields.map(field => {
    const delta = byPath.get(field.path);
    const observedMs = delta?.currentObservedAt ? Date.parse(delta.currentObservedAt) : NaN;
    const age = Date.parse(nowIso) - observedMs;
    const fresh = Number.isFinite(age) && age >= 0 && age <= field.maxAgeSeconds * 1000;
    let action = 'REVALIDATE_OR_REPORT_UNKNOWN';
    if (field.needsValue) action = 'AUTHORITATIVE_VALUE_REQUIRED';
    else if (delta?.status === 'SAME_OBSERVED' && fresh) action = 'CANDIDATE_RELIANCE_REVIEW';
    else if (delta?.status === 'CHANGED_OBSERVED' && fresh) action = 'KNOWN_VALUE_MAY_BE_OBSOLETE';
    return {
      path: field.path, required: field.required,
      observedChange: delta?.status ?? 'UNOBSERVED', fresh, action
    };
  });
  const required = evaluated.filter(x => x.required);
  return {
    verdict: required.length > 0 && required.every(x => x.action === 'CANDIDATE_RELIANCE_REVIEW') ?
      'CANDIDATE_ONLY_NOT_AUTHORIZED' : 'SOURCE_OR_POLICY_REVIEW_REQUIRED',
    comparison: diff.status,
    fields: evaluated
  };
}
