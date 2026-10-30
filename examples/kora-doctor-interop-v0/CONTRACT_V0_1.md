# KORA Doctor × SeenRelay — minimum offline exchange contract, draft v0.1

**Status:** Proposal for mutual review, not a protocol standard or a production integration. Existing 16 scenario IDs are stable. Format: AUDR 1.0.0 tool records, with string-valued optional labels. No runtime dependency, external requests, raw prompts, arguments, tool results, source URLs, credentials, agent identity or payloads.

## Responsibilities

**KORA Doctor-owned observations:** AUDR `resource.{provider,type,name,operation}`, `run.run_id`, `record_id`, `timing.event_time`, `timing.duration_ms`, `attribution.labels.tool_args_hash` and `tool_result_hash`, optionally `operation_status`. KORA evaluates whether observed calls repeat. It **does not** certify that the second operation could have been removed, that source state is current, or that there are monetary savings.

**Optional source change/freshness transport** (string labels; can be **absent**; never required by KORA Doctor):

| Field | Why we carry it | What it does **not** prove |
|---|---|---|
| `sr.source_id_hash` | Opaque stable coordinate identifying which source was examined | Real source identity or ownership without an authenticated adapter |
| `sr.source_version_hash` | Opaque fingerprint of source version/snapshot; compare both records | That the source was unchanged **between** observations |
| `sr.hard_valid_until` | UTC ISO 8601 deadline; past deadline forces another authoritative read | Safety beyond the deadline or independent verification of a claimed deadline |
| `sr.dependencies_hash` | Opaque fingerprint of the result-affecting dependency manifest | Completeness of the dependencies |
| `sr.dependencies_complete` | Explicit `true` / `false` assertion about dependency coverage | An audit of the completeness assertion |
| `sr.source_confirmation` | Describes presence/claimed type of native validation proof | Valid 304 response, provenance, or any other source authority on its own |

Where a caller requests strict-latest semantics, extra optional evidence is required: `sr.freshness_policy=strict_latest`, `sr.stream_gap_free=true`, and `sr.stream_watermark_verified=true` **all independently authenticated by the SeenRelay-side adapter**. A claimed proof token or `synthetic_source_native_304` value in this fixture is **not** a validated source response. For bounded-freshness semantics, the hard validity deadline and an accepted age policy are required.

**SeenRelay-owned local admission checks** are *not KORA permission flags*: `sr.tenant_hmac`, `sr.auth_scope_hmac`, `sr.environment_hash`, `sr.side_effect_class`, `sr.independent_samples_required`, `sr.exact_single_answer_shareable`, `sr.native_zero_marginal_cost_hit`. These are represented as `sr.*` labels **only to exercise the synthetic fixture**. In production, this context must come from SeenRelay's trusted environment/integration policy, not untrusted AUDR event data. Native/source controls always precede a relay economics claim. Cross-tenant reuse is forbidden by default.

**Integrity and privacy:** `sha256:` samples are fixed **synthetic** digest values. Do not use unsalted SHA-256 of low-entropy live inputs as a privacy guarantee: offline dictionary recovery is possible. Any real deployment requires keyed producer-owned fingerprints (and an explicitly negotiated opaque format) and must not transmit the key. Hash equality is scoped to the producer, tenant, canonicalization and schema version; incomparable fingerprint domains -> `INSUFFICIENT_EVIDENCE`.

## What "optional" means

Missing or unverified metadata **does not disable KORA Doctor repetition detection**; it prevents SeenRelay from elevating a finding to `SHADOW_CANDIDATE` under this fixture's synthetic proof semantics. A mismatched authenticated source version or dependency manifest mandates revalidation. A native cache with zero marginal cost wins. Independent reviews, writes, and scope mismatch cannot be authorized by a diagnostic record.

Even `SHADOW_CANDIDATE` is **only** permission for *measurement*; the authoritative tool still runs. No actual skip, monetary savings, or customer value is claimed. `verified_saved_usd=null` for all decisions.

## Reproducible, per-scenario check

Run in `examples/kora-doctor-interop-v0`:

```sh
python3 generate_fixture.py
node --test test.mjs
node classify.mjs fixture.audr.jsonl > seenrelay-advisory.json
PYTHONPATH=/path/to/pinned/kora-doctor python3 -m kora_doctor audit fixture.audr.jsonl --json > kora-audit.json
node compare-16.mjs kora-audit.json seenrelay-advisory.json
```

`compare-16.mjs` **requires the KORA-produced JSON**, matches the 16 `expected.json` case IDs to KORA `finding.record_ids` and SeenRelay reasons, rejects changed/missing cases and exports `comparison-16.json` and `comparison-16.md`. CI pins KORA Doctor commit `986f2d44bb8f74aa9e83839e66118884fe446627`, instead of relying on a mutable branch.

**Expected sample:** 16 paired cases / 32 AUDR records, 15 KORA repeated-record candidates (all but changed arguments), 1 SeenRelay `SHADOW_CANDIDATE`, 1 `NATIVE_CONTROL_FIRST`, 1 `NOT_DUPLICATE`, 4 `REVALIDATION_REQUIRED`, 2 `REJECT_SCOPE`, 2 `REJECT_UNSAFE`, 5 `INSUFFICIENT_EVIDENCE`.

**Review question for KORA maintainer:** Is this six-field source/freshness/dependency **transport** acceptable, with the understanding that KORA owns detection only, SeenRelay owns untrusted-evidence rejection, and strict-current proofs require additional SeenRelay-side evidence? If not, which fields are redundant? We can agree on the contract and publish this offline result without adding either project as the other's runtime dependency.
