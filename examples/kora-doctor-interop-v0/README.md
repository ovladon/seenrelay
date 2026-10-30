# KORA Doctor × SeenRelay — interoperable synthetic fixture v0

A small, offline, **privacy-preserving and negative-case-heavy** test of the boundary between KORA's repeated-tool heuristics and SeenRelay's native-first, fail-closed shadow admission.

This is **not a benchmark**, proof of savings, customer telemetry, or permission to skip an authoritative call.

### Run

```bash
cd examples/kora-doctor-interop-v0
python3 generate_fixture.py
node --test test.mjs
node classify.mjs fixture.audr.jsonl > seenrelay-advisory.json
# With pinned KORA Doctor installed:
kora-doctor audit fixture.audr.jsonl --json > kora-audit.json
node compare-16.mjs kora-audit.json seenrelay-advisory.json
```

The generator creates `fixture.audr.jsonl` and `expected.json`. The fixture has **32 synthetic AUDR 1.0.0-style tool records**, grouped into **16 two-record runs**. It uses KORA's documented `attribution.labels.tool_args_hash` and `tool_result_hash`, plus optional string-valued `sr.*` evidence labels. It includes tool identity, timestamps and durations, source versions, scope separation, expiry, stream gaps, status and cost-shaped *synthetic* telemetry. No prompts, raw arguments/results, source content or credentials.

### Next-step exchange proposal

Read [CONTRACT_V0_1.md](./CONTRACT_V0_1.md) for the six-field optional freshness/dependency transport, explicit source identity, independently enforced trust boundaries, and the **16-case per-ID** comparison. This is a draft for maintainer review, not a production protocol. CI runs the actual pinned KORA CLI and uploads the generated JSON and Markdown explanation table; no dependency on KORA Doctor is added to SeenRelay runtime.

### Evidence labels

- `sr.tenant_hmac`, `sr.auth_scope_hmac`: opaque authorization boundaries.
- `sr.environment_hash`, `sr.dependencies_hash`, `sr.dependencies_complete`: result-affecting input and dependency completeness *claims*.
- `sr.source_id_hash`: opaque source coordinate identity; mismatches force revalidation, absent identity is insufficient.
- `sr.source_version_hash`, `sr.source_confirmation`, `sr.hard_valid_until`, `sr.freshness_policy`: *claimed* source-state validity.
- `sr.stream_gap_free`, `sr.stream_watermark_verified`: *claimed* event-stream continuity.
- `sr.side_effect_class`, `sr.independent_samples_required`, `sr.exact_single_answer_shareable`: hard safety exclusions.
- `sr.native_zero_marginal_cost_hit`: prioritize already-effective native cache.
- KORA's `operation_status` provides timeout/failed/succeeded context.

**Never trust these labels as authority in a real integration**: the synthetic `sr.source_confirmation=synthetic_source_native_304` is a marker, not a verifiable HTTP response or attestation. A production adapter must authenticate source/version claims and prove dependency completeness, source freshness and authorization scope. SHA-256 of low-entropy real arguments can be guessable; consider producer-owned HMACs rather than unsalted raw hashes.

### Outcomes (synthetic pairwise fixture)

| Outcome | Number of scenarios | Interpretation |
|---|---:|---|
| `SHADOW_CANDIDATE` | 1 | Compatible, but **only** for measurement. The authoritative call still runs |
| `NATIVE_CONTROL_FIRST` | 1 | Existing zero-marginal-cost native cache wins |
| `NOT_DUPLICATE` | 1 | Different argument fingerprints |
| `REVALIDATION_REQUIRED` | 4 | Changed source, changed result, or hard expiry |
| `REJECT_SCOPE` | 2 | Tenant or authorization mismatch |
| `REJECT_UNSAFE` | 2 | Write operation or independent confirmation required |
| `INSUFFICIENT_EVIDENCE` | 5 | Missing source proof, timeout/retry uncertainty, stream gap, incomplete dependencies or missing strict-latest watermark |

**Every outcome has `auto_reuse_authorized: false` and `verified_saved_usd: null`.** A matching fingerprint is never proof that a call is removable. KORA's finding can be correct even if SeenRelay rejects reuse.

### Interoperability experiment

1. Generate the JSONL; let KORA report repeated reads with its native `audit --json`.
2. Run `node classify.mjs` to compare the same records with the conservative admission expectations.
3. Treat both outputs as separate questions: **is repetition suspicious?** versus **is it safe and economically preferable to measure/reuse?**
4. Keep all authoritative executions on. Compare real providers and native controls separately before an active integration.

The fixture classifier is an independent educational test, **not** SeenRelay's published production reuse admission implementation. The pinned KORA Doctor CLI is exercised and parsed in CI; the per-scenario reconciliation checks actual KORA findings rather than merely the aggregate count.
