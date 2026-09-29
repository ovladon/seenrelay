# Verified cross-worker browser overlap result — 2026-09-29

This document preserves the reviewed result of the bounded Firecrawl fleet-overlap benchmark merged in PR #332.

## Evidence class

- **Classification:** controlled first-party external failure-pattern replay
- **External pattern source:** https://github.com/langchain-ai/langgraph/issues/7417
- **Benchmark run:** https://github.com/ovladon/seenrelay/actions/runs/36557994133
- **Benchmark commit:** `7f5712d27f2ea091689b0a4624664bb7898b58c8`
- **Rounds:** 3
- **Workers per round:** 2 separate Node processes

This is not a LangGraph Cloud trace, not an independent customer workload and not a customer ROI claim.

## What was measured

Each worker requested the same exact read-only Firecrawl browser operation. The value under test was computed from browser layout state rather than copied from source HTML.

The Firecrawl path was:

`scrape + interact(code) + stop`

Provider-native cache behavior remained enabled. The benchmark did not set `maxAge: 0` or otherwise disable Firecrawl's normal cache behavior.

A local browser remains a legitimate competing control for a customer deployment and must be included in customer-specific economics.

## Result

| Metric | Uncoordinated baseline | SeenRelay active coordination |
| --- | ---: | ---: |
| Provider executions | 6 | 3 |
| Firecrawl credits | 18 | 9 |
| Leader executions | n/a | 3 |
| Follower reuses | 0 | 3 |
| Actual avoided executions | 0 | 3 |
| Median caller latency | 11,871.126 ms | 12,568.728 ms |

Across all three rounds:

- every expected overlap produced one leader and one follower reuse;
- the browser-computed authoritative value was stable across samples;
- `failOpenExecutions = 0`;
- `storeFailures = 0`;
- `coordinateFailures = 0`;
- `codecFailures = 0`;
- `followerTimeouts = 0`;
- mutation calls suppressed: 0;
- independent samples collapsed: 0.

The measured provider-unit result was therefore:

`6 provider executions / 18 credits -> 3 provider executions / 9 credits`

The run did **not** demonstrate a latency improvement; median caller latency was slightly higher with coordination in this sample.

## What this proves

For this exact two-worker collision shape, active SeenRelay coordination caused one worker per round to reuse the in-flight leader result instead of executing a second equivalent Firecrawl browser operation. Three real provider executions were avoided and measured Firecrawl usage fell by 9 credits.

## What this does not prove

It does not establish:

- a natural overlap rate in customer traffic;
- customer dollar savings;
- net savings after customer-specific store, integration and operational costs;
- that SeenRelay beats a caller-owned distributed single-flight implementation;
- that a local browser is more expensive than the SeenRelay path for a specific customer;
- that every duplicated tool call is safe to share.

Dollar savings remain intentionally unclaimed because provider credits do not automatically translate into a lower invoice under fixed plans or included-credit tiers.

Natural customer ROI remains governed by `docs/FLEET_OVERLAP_GATE.md`: collect natural eligible traffic, compare the best existing control, verify exact result compatibility, then count only actual follower reuse as avoided execution.
