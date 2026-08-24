# SeenRelay Protocol

SeenRelay has exactly two domain operations: **CHECK** and **OBSERVE**. It reports recent observations of source-backed values. It does not browse, verify externally, adjudicate truth, or provide shared agent memory.

The operational target is **reusable information gain**: an incidental observation becomes valuable when it later helps another agent avoid or prioritize redundant revalidation.

## Fact identity v3

A fact descriptor separates a human label from deterministic network identity:

```json
{
  "subject": "Model X input price",
  "predicate": "price.current",
  "qualifiers": {"tier": "standard"},
  "source": "https://provider.example/pricing?utm_source=agent",
  "locator": {"scheme": "element_id", "value": "model-x-input-price"}
}
```

Canonical fact identity is versioned as `seenrelay-fact-v3`.

Identity precedence:

1. **Source-native locator** — `json_pointer`, `element_id`, or `source_key`.
2. **Predicate** — canonical machine predicate when no locator exists.

`subject` is descriptive and excluded from the fact key. **Mutable observed content is always excluded from fact identity.**

### Source canonicalization

`source` is canonicalized without external requests:

- fragment removed;
- hostname lowercased;
- default HTTP(S) ports removed;
- URL userinfo credentials rejected;
- known authentication/signature query parameters rejected entirely;
- known tracking parameters removed;
- remaining query parameters sorted deterministically.

Semantically meaningful query parameters are retained.

### Source-native locator schemes

- `json_pointer`: RFC 6901-style pointer, beginning with `/`;
- `element_id`: stable HTML element id supplied by the source;
- `source_key`: stable source-native field/resource identifier.

Locator bytes are preserved because case, whitespace and Unicode may be source-significant.

### Predicate fallback

If no source-native locator exists, `predicate` becomes identity-bearing. Prefer shared identifiers such as `price.current`, `availability.current`, `status.current`, `version.current`, `score.current`, or `capacity.current`.

SeenRelay deliberately does not collapse arbitrary aliases because false convergence is more dangerous than explicit `UNKNOWN`.

### Qualifier discipline

Qualifiers are identity-bearing. Include only fields required to distinguish multiple values that would otherwise share the same source and discriminator.

## CHECK

`POST /v1/check`

```json
{
  "fact": {
    "subject": "Model X input price",
    "predicate": "price.current",
    "qualifiers": {"tier": "standard"},
    "source": "https://provider.example/pricing",
    "locator": {"scheme": "element_id", "value": "model-x-input-price"}
  },
  "known_value": 17,
  "max_age_seconds": 3600
}
```

Possible status values:

- `SAME_OBSERVED`
- `CHANGED_OBSERVED`
- `CONTESTED`
- `STALE`
- `UNKNOWN`

`SAME_OBSERVED` and `CHANGED_OBSERVED` may create delayed qualified-reuse credit for contributor leases. `UNKNOWN`, `STALE` and `CONTESTED` do not manufacture contribution reward.

Evidence counts distinguish total observer keys, cryptographic observer keys and unverified observer keys. A cryptographic key is stronger provenance, but it is not proof that two keys belong to two independent real-world actors.

## OBSERVE

`POST /v1/observe`

```json
{
  "fact": {
    "subject": "Model X input price",
    "predicate": "price.current",
    "source": "https://provider.example/pricing",
    "locator": {"scheme": "element_id", "value": "model-x-input-price"}
  },
  "value": 17,
  "observed_at": "2026-08-24T08:00:00Z",
  "observer_id": "optional-unverified-continuity-label",
  "idempotency_key": "job-991/property-price"
}
```

OBSERVE means the caller independently obtained the observation for its own task. SeenRelay does not fetch the source to confirm it.

An accepted observation atomically updates the observation row, observer state and materialized fact summary. Idempotent retry does not increment those structures again.

## Observer provenance

SeenRelay deliberately distinguishes continuity from real-world identity.

### `cryptographic_key`

A valid `ed25519-v1` proof establishes possession of the corresponding private key, continuity when the same key signs future observations, and integrity of the signed OBSERVE payload. The database identity is privacy-scoped.

It does **not** establish legal identity, organizational identity, one-key-equals-one-agent, independence of different keys, or truth of the observed value.

### `self_asserted`

Without a cryptographic proof, `observer_id` is accepted only as an unverified privacy-scoped continuity hint.

### `anonymous_network_hint`

If neither proof nor `observer_id` is supplied over HTTP, SeenRelay derives an unverified privacy-scoped transport hint. This is the weakest observer class.

## Ed25519 proof contract

The proof is transport-independent, so the same proof works through HTTP and MCP.

```json
{
  "scheme": "ed25519-v1",
  "public_key": "BASE64URL_RAW_32_BYTE_PUBLIC_KEY",
  "timestamp": "2026-08-24T08:00:01Z",
  "nonce": "BASE64URL_16_TO_64_RANDOM_BYTES",
  "signature": "BASE64URL_RAW_64_BYTE_SIGNATURE"
}
```

The signed envelope uses deterministic JSON with domain `seenrelay-observe-proof-v1`, operation `OBSERVE`, the complete request payload with `observer_proof` removed, and proof metadata excluding the signature.

Objects are serialized recursively with lexicographically sorted keys, array order preserved, no insignificant whitespace, finite JSON numbers only, and no unpaired Unicode surrogates. Proof timestamps must fall within the configured skew window. Exact proof replay maps to the same deterministic observation id when no explicit idempotency key is supplied.

Clients should keep a persistent Ed25519 key pair per logical agent installation/security principal and rotate deliberately rather than generating a new key for every request.

## Hive Lease

SeenRelay does not require account creation, email, password or OAuth for normal CHECK/OBSERVE use.

On first contact the service creates an ephemeral **Hive Lease**: a signed operational slot. HTTP clients receive it in `x-seenrelay-lease`; responses also expose current Hive state.

If the token is omitted, the service may conservatively re-associate a request with a privacy-scoped operational client hint. This is continuity for rate/economic state, not an identity claim.

A Hive Lease records only operational state needed for abuse control and contribution economics, including free CHECK allowance/refill, operation counts, delayed contribution score, useful reuse generated/consumed, and recent operation/outcome telemetry.

## Bootstrap admission

- `CHECK` is free, subject to a token bucket;
- `OBSERVE` is free and does not consume CHECK allowance;
- exhausted CHECK allowance returns `429` / `HIVE_RATE_LIMITED` with a refill delay;
- useful contribution increases future CHECK capacity/refill.

Rate limiting exists to make trivial reset/spam less attractive, not to identify a real-world actor.

## Delayed reward: qualified useful reuse

**OBSERVE itself earns no contribution score.**

A contributor award exists only when a later fresh CHECK is backed by that observation and the consumer occupies a different conservative privacy-salted **reuse-independence bucket**. The bucket is derived from transport/network provenance; changing only a self-declared `x-seenrelay-client` value or user-agent does not establish reward independence.

The current anti-farming guard requires:

- contributor lease differs from consumer lease;
- contributor and consumer reuse-independence buckets are both present and differ;
- duplicate reward for the same fact/value/contributor/consumer tuple is suppressed;
- contributor awards are bounded by a daily cap.

Network separation is an anti-farming signal, not proof of independent real-world actors. Contribution score is an access/economic signal, never a truth score.

A single qualifying CHECK may reward more than one contributor. Public `qualified_reuse` telemetry counts that CHECK **once**, regardless of how many contributor awards it generated. Therefore `qualified_reuse_rate = qualified_reuse_checks / CHECKs` remains bounded to 0..1.

Current Hive classes:

- `new` — no useful reuse generated yet;
- `established` — at least one useful reuse, below contributor threshold;
- `contributor` — sustained useful reuse.

## Sybil posture

Hive Lease, conservative reuse-independence and Ed25519 solve different problems:

- Ed25519 proves key possession and payload integrity;
- Hive Lease limits frictionless operational abuse and persists contribution economics;
- delayed reward makes raw injection worthless by itself;
- reuse-independence buckets make trivial same-egress/self-declared-client reward farming harder.

None of these prove one key, one lease or one network bucket equals one independent real-world actor. SeenRelay treats independence as a signal, never a fact.

## MCP

SeenRelay exposes the same two operations through MCP revision `2026-07-28` using the official server SDK.

Before Hive admission, MCP applies the same stateless fact canonicalization/credential-URL validation as REST. The implemented core is stateless and verified end-to-end with:

- `server/discover`
- `tools/list`
- `tools/call` → `check_fact`
- `tools/call` → `observe_fact`

No `initialize` handshake or `Mcp-Session-Id` dependency is required by this revision.

## A2A

A2A `1.0.0` is tracked by the maintenance system but not exposed. SeenRelay is currently a tool/infrastructure service, not a task-oriented autonomous agent. An Agent Card will not be published until a genuine A2A task interface exists.

## Public machine surface

- `/` — machine descriptor unless the client explicitly requests HTML;
- `/service.json` — explicit service descriptor;
- `/public-stats.json` — privacy-safe aggregate metrics;
- `/openapi.json` — REST/OpenAPI contract;
- `/mcp` — MCP endpoint.

## Telemetry

`hive_metrics_daily` stores aggregate counters for CHECK/OBSERVE outcomes, qualified useful-reuse CHECKs and new leases. `hive_leases` retains ephemeral operational state used for the Control Room Radar.

The central product metric is **qualified reuse rate**, not raw request volume. It measures the fraction of CHECKs that produced at least one qualifying cross-bucket reuse award. It is directly observable; avoided downstream work remains an interpretation unless a client explicitly reports it.

OpenTelemetry and GenAI semantic conventions are tracked for future adoption. Any telemetry implementation must avoid exporting sensitive fact values, source URLs, raw keys, lease tokens or customer payloads by default.

## Billing state

Billing is disabled in this deployment:

```text
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=none
```

Any incompatible billing configuration fails closed before normal request handling. No pricing or private operator strategy is stored in this repository.
