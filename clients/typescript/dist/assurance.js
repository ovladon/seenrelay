const CAVEAT = 'Multiple observer keys, cryptographic continuity keys and reuse-independence buckets are anti-poisoning signals only. They do not prove independent real-world actors or truth.';

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}
function nonNegativeFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return value;
}
function normalizeOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
  return Object.freeze({
    minObserverKeys: positiveInteger(options.minObserverKeys ?? 2, 'minObserverKeys'),
    minCryptographicObserverKeys: positiveInteger(options.minCryptographicObserverKeys ?? 2, 'minCryptographicObserverKeys'),
    minReuseIndependenceBuckets: positiveInteger(options.minReuseIndependenceBuckets ?? 2, 'minReuseIndependenceBuckets'),
    maxAgeSeconds: options.maxAgeSeconds === undefined ? undefined : nonNegativeFinite(options.maxAgeSeconds, 'maxAgeSeconds')
  });
}
function integerSignal(check, name) {
  const value = check?.[name];
  return Number.isInteger(value) && value >= 0 ? value : 0;
}
export function assessSharedCheckEvidence(check, options = {}) {
  const policy = normalizeOptions(options);
  const reasons = [];
  if (!check || typeof check !== 'object' || Array.isArray(check)) return Object.freeze({ eligible: false, reasons: Object.freeze(['invalid_check']), caveat: CAVEAT });
  if (check.status !== 'SAME_OBSERVED') reasons.push('status_not_same_observed');
  const knownHash = typeof check.known_value_hash === 'string' ? check.known_value_hash : null;
  const latestHash = typeof check.latest_value_hash === 'string' ? check.latest_value_hash : null;
  if (!knownHash || !latestHash || knownHash !== latestHash) reasons.push('value_fingerprint_mismatch_or_missing');
  const ageSeconds = typeof check.age_seconds === 'number' ? check.age_seconds : NaN;
  const serverMaxAgeSeconds = typeof check.max_age_seconds === 'number' ? check.max_age_seconds : NaN;
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) reasons.push('age_missing_or_invalid');
  if (!Number.isFinite(serverMaxAgeSeconds) || serverMaxAgeSeconds < 1) reasons.push('server_max_age_missing_or_invalid');
  if (Number.isFinite(ageSeconds) && Number.isFinite(serverMaxAgeSeconds) && ageSeconds > serverMaxAgeSeconds) reasons.push('older_than_check_window');
  if (policy.maxAgeSeconds !== undefined && Number.isFinite(ageSeconds) && ageSeconds > policy.maxAgeSeconds) reasons.push('older_than_policy_window');
  const observerKeys = integerSignal(check, 'recent_observer_keys');
  const cryptographicObserverKeys = integerSignal(check, 'recent_cryptographic_observer_keys');
  const reuseIndependenceBuckets = integerSignal(check, 'recent_reuse_independence_buckets');
  if (observerKeys < policy.minObserverKeys) reasons.push('insufficient_observer_keys');
  if (cryptographicObserverKeys < policy.minCryptographicObserverKeys) reasons.push('insufficient_cryptographic_observer_keys');
  if (reuseIndependenceBuckets < policy.minReuseIndependenceBuckets) reasons.push('insufficient_reuse_independence_buckets');
  return Object.freeze({ eligible: reasons.length === 0, reasons: Object.freeze(reasons), evidence: Object.freeze({ observer_keys: observerKeys, cryptographic_observer_keys: cryptographicObserverKeys, reuse_independence_buckets: reuseIndependenceBuckets, age_seconds: Number.isFinite(ageSeconds) ? ageSeconds : null, check_max_age_seconds: Number.isFinite(serverMaxAgeSeconds) ? serverMaxAgeSeconds : null }), policy, caveat: CAVEAT });
}

/** Explicit opt-in multi-signal helper for Zero-State reuseRetained. Thresholds cannot be reduced below 2/2/2. */
export function createMultiSignalRetainedReusePolicy(options = {}) {
  const policy = normalizeOptions(options);
  if (policy.minObserverKeys < 2 || policy.minCryptographicObserverKeys < 2 || policy.minReuseIndependenceBuckets < 2) {
    throw new TypeError('multi-signal retained reuse requires minimum thresholds of 2 observer keys, 2 cryptographic observer keys and 2 reuse-independence buckets');
  }
  return (check) => assessSharedCheckEvidence(check, policy).eligible;
}
export const sharedEvidenceCaveat = CAVEAT;
