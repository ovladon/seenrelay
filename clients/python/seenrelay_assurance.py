"""Conservative SeenRelay shared-evidence policy helpers.

These helpers evaluate anti-poisoning signals. They do not establish truth,
legal identity, or independent real-world actors.
"""

CAVEAT = (
    "Multiple observer keys, cryptographic continuity keys and reuse-independence "
    "buckets are anti-poisoning signals only. They do not prove independent "
    "real-world actors or truth."
)


def _positive_int(value, name):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise TypeError(f"{name} must be a positive integer")
    return value


def _non_negative_number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise TypeError(f"{name} must be a non-negative finite number")
    if value != value or value in (float("inf"), float("-inf")):
        raise TypeError(f"{name} must be a non-negative finite number")
    return float(value)


def _options(options):
    options = {} if options is None else options
    if not isinstance(options, dict):
        raise TypeError("options must be a dict")
    out = {
        "minObserverKeys": _positive_int(options.get("minObserverKeys", 2), "minObserverKeys"),
        "minCryptographicObserverKeys": _positive_int(options.get("minCryptographicObserverKeys", 2), "minCryptographicObserverKeys"),
        "minReuseIndependenceBuckets": _positive_int(options.get("minReuseIndependenceBuckets", 2), "minReuseIndependenceBuckets"),
    }
    if "maxAgeSeconds" in options:
        out["maxAgeSeconds"] = _non_negative_number(options["maxAgeSeconds"], "maxAgeSeconds")
    return out


def _signal(check, name):
    value = check.get(name, 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def assess_shared_check_evidence(check, options=None):
    policy = _options(options)
    if not isinstance(check, dict):
        return {"eligible": False, "reasons": ["invalid_check"], "caveat": CAVEAT}
    reasons = []
    if check.get("status") != "SAME_OBSERVED": reasons.append("status_not_same_observed")
    known_hash = check.get("known_value_hash")
    latest_hash = check.get("latest_value_hash")
    if not isinstance(known_hash, str) or not isinstance(latest_hash, str) or known_hash != latest_hash:
        reasons.append("value_fingerprint_mismatch_or_missing")
    age = check.get("age_seconds")
    max_age = check.get("max_age_seconds")
    valid_age = isinstance(age, (int, float)) and not isinstance(age, bool) and age >= 0
    valid_max = isinstance(max_age, (int, float)) and not isinstance(max_age, bool) and max_age >= 1
    if not valid_age: reasons.append("age_missing_or_invalid")
    if not valid_max: reasons.append("server_max_age_missing_or_invalid")
    if valid_age and valid_max and age > max_age: reasons.append("older_than_check_window")
    if valid_age and "maxAgeSeconds" in policy and age > policy["maxAgeSeconds"]: reasons.append("older_than_policy_window")
    observers = _signal(check, "recent_observer_keys")
    crypto = _signal(check, "recent_cryptographic_observer_keys")
    buckets = _signal(check, "recent_reuse_independence_buckets")
    if observers < policy["minObserverKeys"]: reasons.append("insufficient_observer_keys")
    if crypto < policy["minCryptographicObserverKeys"]: reasons.append("insufficient_cryptographic_observer_keys")
    if buckets < policy["minReuseIndependenceBuckets"]: reasons.append("insufficient_reuse_independence_buckets")
    return {
        "eligible": not reasons,
        "reasons": reasons,
        "evidence": {"observer_keys": observers, "cryptographic_observer_keys": crypto, "reuse_independence_buckets": buckets, "age_seconds": age if valid_age else None, "check_max_age_seconds": max_age if valid_max else None},
        "policy": policy,
        "caveat": CAVEAT,
    }


def conservative_retained_reuse_policy(options=None):
    policy = _options(options)
    def decide(check, retained_value=None, evidence_value=None):
        del retained_value, evidence_value
        return assess_shared_check_evidence(check, policy)["eligible"]
    return decide


shared_evidence_caveat = CAVEAT
