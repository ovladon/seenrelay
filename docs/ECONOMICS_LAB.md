# SeenRelay Economics Lab

SeenRelay should be evaluated against the validation work it is intended to protect, not against a generic claim that network reuse is always cheaper.

The Economics Lab defines a reproducible way to decide whether a specific workload benefits from SeenRelay.

## 1. Start with the workload, not the relay

A good candidate has all of these properties:

- the application already knows a value and periodically revalidates it;
- the same deterministic source-backed fact is likely to be checked again;
- full validation has meaningful cost, latency, token use, proxy/browser use, rate-limit pressure, or multiple downstream steps;
- different processes, runs, workers, agents, or teams do not already share an equivalent authoritative cache.

A cheap one-off HTTP GET is an intentionally weak candidate. SeenRelay must not be assumed to improve it.

For a fleet, measure aggregate repetition across the whole protected path, not only per-agent repetition. One agent's necessary validation can become another agent's avoided work if both refer to the same deterministic fact identity and the later caller's policy accepts the evidence.

## 2. Run strict shadow mode first

Shadow mode keeps the original validation authoritative and skips nothing.

Use `SeenRelayShadowProof` from the JavaScript or Python client. For every protected validation it records locally:

- CHECK status;
- time spent in the original validation;
- CHECK and OBSERVE request latency from client telemetry;
- whether a conditional request hint was available.

No proof telemetry is uploaded by the helper.

A first report should contain enough calls to represent the workload's normal repetition pattern. Do not enable reuse merely because one call returned `SAME_OBSERVED`.

### Natural-workload hostile input

The staged JavaScript / TypeScript Shadow Proof can retain a bounded, sanitized per-call record and explicitly export schema-v2 input for `scripts/evaluate-hostile-benchmark.mjs`. This path remains strict shadow mode: a simulated reuse policy is evaluated only after the authoritative validation has completed and cannot suppress it.

The exported record contains only:

- CHECK status, including an explicit unavailable state when CHECK produced no usable status;
- whether the caller's simulated policy would have reused the result;
- whether that hypothetical reuse deterministically matched the authoritative validation, or `null` when comparison was unavailable;
- measured baseline-validation, CHECK and blocking-OBSERVE milliseconds;
- caller-supplied baseline, CHECK and OBSERVE cost units;
- whether an active non-reuse path would have OBSERVEd after baseline validation.

It does not contain the fact descriptor, source URL, known value, validated value or a per-call timestamp. Use only a non-sensitive opaque workload identifier when one is needed. Record overflow or an invalid simulated policy invalidates the export instead of silently truncating evidence.

The hostile evaluator requires the baseline `best_existing_non_shared_path` and explicit measurement declarations for local cache, source-native conditional validation and provider-native caching. If one of those controls is available but was not measured, the evaluator rejects the benchmark as incomplete. CHECK-unavailable calls remain in the natural sample instead of disappearing. A policy-accepted hypothetical reuse that cannot be compared deterministically is `incomplete`, not a safety pass; any observed mismatch fails safety evidence.

Python continues to support shadow measurement but does not claim parity with this natural-workload collector in the staged client release.

## 3. Direct-reuse economics

Let:

- `r` = fraction of protected calls returning `SAME_OBSERVED` that the caller's policy would actually reuse;
- `V` = average full-validation latency;
- `C` = average CHECK latency;
- `O` = average OBSERVE latency for validations that still run.

### Blocking OBSERVE

The default clients await OBSERVE for compatibility and explicit completion. Ignoring conditional-request savings, active direct reuse has positive expected latency value when approximately:

```text
r * V > C + (1 - r) * O
```

or equivalently:

```text
r > (C + O) / (V + O)
```

### Caller-scheduled OBSERVE

The clients also support an optional caller-owned scheduler. The client itself never creates a background worker. The caller decides whether and where the supplied OBSERVE task runs, for example through a request-lifecycle `waitUntil` facility or an application-owned executor.

If — and only if — that scheduler actually keeps OBSERVE outside the response critical path, the latency condition becomes approximately:

```text
r * V > C
```

or:

```text
r > C / V
```

This does **not** remove OBSERVE's monetary/network/compute cost; it removes its latency from the caller's critical response path. A scheduler that invokes the task synchronously is not off-critical-path just because the scheduler API was supplied.

`SeenRelayShadowProof.report()` therefore models this case only when the caller explicitly sets `observeOffCriticalPath: true` in JavaScript or `observe_off_critical_path=True` in Python.

For monetary cost, let:

- `K_v` = caller-measured marginal cost of one full validation;
- `K_c` = caller-assigned cost of one CHECK request;
- `K_o` = caller-assigned cost of one OBSERVE request.

The corresponding direct-reuse threshold remains:

```text
r > (K_c + K_o) / (K_v + K_o)
```

SeenRelay currently charges no API fee during bootstrap. `K_c` and `K_o` can therefore be zero when the consuming application only wants invoice-level provider savings, or can include its own compute/network accounting if desired.

For purely usage-based provider billing, the first-order fleet arithmetic is:

```text
baseline provider spend ~= N * K_v
provider spend after accepted reuse ~= N * (1 - r) * K_v
gross provider spend avoided ~= N * r * K_v
```

where `N` is the number of protected validations. Fixed subscriptions, included credits and tier boundaries must be modeled separately.

## 4. Public-price illustrations are not proof

The public `/economics` page gives current list-price illustrations so a developer can understand the shape of the opportunity. As of 26 August 2026, examples include:

- OpenAI Web Search at $10 / 1,000 calls;
- Firecrawl Pay As You Go at $5 / 1,000 credits, with a standard scrape using 1 credit;
- Browserbase Extract at a published marginal rate of $4 / 1,000 calls without proxies after included allowance;
- Firecrawl Standard as a fixed-tier counterexample where 100,000 calls reduced to 70,000 can still leave the subscription fee unchanged.

Those prices can change. Never use the public example as a production savings claim. Use the consuming application's current invoice, included allowances, overage rules and actual measured reusable rate.

## 5. Conditional revalidation is a separate benefit

A fresh CHECK may return an observer-supplied ETag or Last-Modified hint. That can let the application attempt a conditional source request before more expensive downstream work.

Shadow Proof counts how often such hints appear but deliberately does **not** convert them into money or time savings. The consuming application must measure whether the conditional request actually avoided browser, extraction, API, or model work.

Do not add conditional savings to the direct-reuse estimate unless the application has measured them.

## 6. Required benchmark classes

A credible evaluation should include at least these three classes:

### A. Cheap direct fetch

A small, inexpensive HTTP/API request with little downstream work.

Expected result: SeenRelay may be neutral or negative. This negative control is required because it demonstrates the integration is not being evaluated with a predetermined conclusion.

### B. Metered or rate-limited validation

A validation that consumes a paid API unit, scrape/browser credit, proxy request, or scarce rate limit.

Measure the actual unit from the consuming application's invoice or provider telemetry rather than embedding vendor pricing in SeenRelay.

### C. Multi-step validation

A source fetch followed by rendering, extraction, parsing, model inference, or another expensive downstream chain.

Measure the whole validation path that a reusable observation can actually prevent.

## 7. Report without marketing arithmetic

For every benchmark publish or retain:

- protected calls;
- CHECK status distribution, including unavailable CHECKs;
- `SAME_OBSERVED` rate;
- policy-accepted reusable rate;
- safety state for the policy-accepted hypothetical reuses;
- validation latency distribution or at minimum average plus p50/p95 where available;
- CHECK latency distribution;
- OBSERVE latency distribution;
- whether OBSERVE was actually outside the response critical path;
- direct validation calls potentially avoided;
- caller-measured cost per validation where monetary claims are made;
- gross potential saving;
- relay overhead;
- net potential saving;
- conditional-hint frequency;
- conditional savings separately measured or explicitly excluded;
- fixed plan minimums, included credits and tier effects when relevant.

If `SAME_OBSERVED` is zero, direct gross potential savings are zero. If there are no policy-accepted reuse opportunities, that is not a safety pass. If any policy-accepted hypothetical reuse is uncomparable, evidence is incomplete. If any such reuse disagrees with authoritative validation, safety fails.

## 8. Deployment decision

Keep the integration in shadow mode when:

- the observed reuse rate is below the measured break-even threshold;
- the fact class is too risky for reuse under the application's policy;
- the sample is too small or incomplete;
- hypothetical reuse safety is not a strict pass;
- `CONTESTED`, `STALE`, `UNKNOWN` or CHECK-unavailable outcomes dominate and there is no useful conditional-validation benefit;
- a fixed provider plan means reduced calls do not create meaningful capacity or invoice value.

Consider bounded reuse only when the consuming application's own measurements show positive value and its policy accepts the relevant fact class and freshness window.

SeenRelay supplies evidence and optimization opportunities. The consuming application retains the decision.
