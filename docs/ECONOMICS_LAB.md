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

## 2. Run strict shadow mode first

Shadow mode keeps the original validation authoritative and skips nothing.

Use `SeenRelayShadowProof` from the JavaScript or Python client. For every protected validation it records locally:

- CHECK status;
- time spent in the original validation;
- CHECK and OBSERVE request latency from client telemetry;
- whether a conditional request hint was available.

No proof telemetry is uploaded by the helper.

A first report should contain enough calls to represent the workload's normal repetition pattern. Do not enable reuse merely because one call returned `SAME_OBSERVED`.

## 3. Direct-reuse economics

Let:

- `r` = fraction of protected calls returning `SAME_OBSERVED`;
- `V` = average full-validation latency;
- `C` = average CHECK latency;
- `O` = average OBSERVE latency for validations that still run.

Ignoring conditional-request savings, active direct reuse has positive expected latency value when approximately:

```text
r * V > C + (1 - r) * O
```

or equivalently:

```text
r > (C + O) / (V + O)
```

The Shadow Proof helper computes this break-even rate from measured timings.

For monetary cost, let:

- `K_v` = caller-measured cost of one full validation;
- `K_c` = caller-assigned cost of one CHECK request;
- `K_o` = caller-assigned cost of one OBSERVE request.

The corresponding direct-reuse threshold is:

```text
r > (K_c + K_o) / (K_v + K_o)
```

SeenRelay currently charges no API fee during bootstrap. `K_c` and `K_o` can therefore be zero when the consuming application only wants invoice-level provider savings, or can include its own compute/network accounting if desired.

## 4. Conditional revalidation is a separate benefit

A fresh CHECK may return an observer-supplied ETag or Last-Modified hint. That can let the application attempt a conditional source request before more expensive downstream work.

Shadow Proof counts how often such hints appear but deliberately does **not** convert them into money or time savings. The consuming application must measure whether the conditional request actually avoided browser, extraction, API, or model work.

Do not add conditional savings to the direct-reuse estimate unless the application has measured them.

## 5. Required benchmark classes

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

## 6. Report without marketing arithmetic

For every benchmark publish or retain:

- protected calls;
- CHECK status distribution;
- `SAME_OBSERVED` rate;
- validation latency distribution or at minimum average plus p50/p95 where available;
- CHECK latency distribution;
- OBSERVE latency distribution;
- direct validation calls potentially avoided;
- caller-measured cost per validation where monetary claims are made;
- gross potential saving;
- relay overhead;
- net potential saving;
- conditional-hint frequency;
- conditional savings separately measured or explicitly excluded.

If `SAME_OBSERVED` is zero, direct gross potential savings are zero.

## 7. Deployment decision

Keep the integration in shadow mode when:

- the observed reuse rate is below the measured break-even threshold;
- the fact class is too risky for reuse under the application's policy;
- the sample is too small;
- `CONTESTED`, `STALE`, or `UNKNOWN` dominate and there is no useful conditional-validation benefit.

Consider bounded reuse only when the consuming application's own measurements show positive value and its policy accepts the relevant fact class and freshness window.

SeenRelay supplies evidence and optimization opportunities. The consuming application retains the decision.
