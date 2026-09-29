# Verified five-worker provider-concurrency headroom result — 2026-09-29

This document preserves a bounded follow-up to the verified two-worker Firecrawl browser-overlap benchmark.

## Evidence class

- **Classification:** controlled provider-concurrency headroom proof
- **Uncoordinated boundary run:** https://github.com/ovladon/seenrelay/actions/runs/36560937224
- **Coordinated five-worker run:** https://github.com/ovladon/seenrelay/actions/runs/36561339801
- **Workers:** 5 separate Node processes
- **Rounds:** 1
- **Operation:** exact read-only Firecrawl browser-computed layout probe

This is not a natural customer workload, not a customer ROI claim and not a dollar-savings claim.

## Uncoordinated boundary

The first bounded five-worker attempt did not produce five successful provider executions. Firecrawl returned:

`HTTP 429: You have reached the maximum number of concurrent jobs (2).`

That provider limit is itself the relevant baseline boundary. It would be misleading to convert the failed five-worker workload into a five-call credit baseline or an 80% savings claim.

## Coordinated result

The follow-up retained five separate callers but enabled exact in-flight coordination:

| Metric | Coordinated result |
| --- | ---: |
| Callers | 5 |
| Provider executions | 1 |
| Leader executions | 1 |
| Follower joins | 4 |
| Follower reuses | 4 |
| Actual avoided executions | 4 |
| Firecrawl credits used by the authoritative job | 3 |
| Median caller latency | 11,613.808 ms |

Safety/operational telemetry:

- `failOpenExecutions = 0`
- `storeFailures = 0`
- `coordinateFailures = 0`
- `codecFailures = 0`
- `followerTimeouts = 0`
- `receiptFailures = 0`
- browser-computed authoritative result stable: true
- mutation calls suppressed: 0
- independent samples collapsed: 0

The final machine report intentionally keeps:

- `measured_credit_delta_baseline_minus_active = null`
- `normalized_credits_avoided_at_baseline_mean = null`
- `dollar_savings_claim = null`
- `net_savings_claim = null`

because the five-worker baseline did not complete under the provider concurrency ceiling.

## What this proves

For this exact controlled collision shape, five independent callers were able to share one authoritative provider job through SeenRelay fleet coordination. The provider saw one browser job instead of receiving five simultaneous equivalent jobs, and all five callers completed from that one authoritative result.

This demonstrates **capacity/headroom value** in addition to the separate two-worker provider-unit reduction proof.

## What this does not prove

It does not establish:

- how often a customer's natural traffic contains five-way exact overlap;
- that SeenRelay is preferable to a caller-owned distributed single-flight implementation;
- customer dollar savings;
- net savings after coordination-store and integration costs;
- a universal latency improvement;
- that provider concurrency limits are identical across plans or providers.

Natural deployment still follows `docs/FLEET_OVERLAP_GATE.md`: measure real traffic, identify the best existing native/local control, verify exact compatibility and enable coordination only for the reviewed operation.
