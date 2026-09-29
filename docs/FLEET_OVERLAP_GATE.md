# Natural fleet-overlap admission gate

This gate is for **exact eligible in-flight duplication across independent workers or processes**. It is separate from [NATURAL_WORKLOAD_GATE.md](./NATURAL_WORKLOAD_GATE.md), which evaluates temporal shared CHECK / OBSERVE reuse after a completed observation.

The fleet-overlap gate exists because a call can be wastefully duplicated while the first exact call is still running even when temporal caching is intentionally disabled.

## Admission boundary

A candidate can enter shadow measurement only when all of the following are true:

1. the original operation is already part of a natural deployed or faithfully replayed workload;
2. the operation is `read_only` or `idempotent_read`;
3. the exact result is shareable for the full result-affecting coordinate;
4. independent samples, voting or diversity are **not** required;
5. every result-affecting option is included in the coordinate, including tenant/auth scope, provider, model/tool version, locale, files and retrieval/render options where relevant;
6. an existing zero-marginal-cost provider-native exact response cache does not already dominate;
7. simpler request-local or process-local single-flight is measured first when all competing callers already share that boundary;
8. shadow mode leaves every authoritative operation enabled.

Mutations and consequential external actions are not fleet-overlap savings candidates. Retry/idempotency bugs involving writes belong to an execution-safety boundary, not this gate.

## Natural evidence floor

Static repository inspection and issue reports can nominate candidates but cannot establish savings.


When a workload already has caller-owned traces, [FLEET_TRACE_CENSUS.md](./FLEET_TRACE_CENSUS.md) may be used as an earlier local ranking step. Trace-census overlap is still pre-activation opportunity evidence: it cannot establish result compatibility, actual avoided executions or net savings.

Before a natural workload is promoted to active fleet coordination, retain at least 100 eligible call starts from the frozen workload distribution. This is a screening floor, not a statistical-confidence claim. Commissioning, synthetic collision injection and tuning runs do not count toward the floor.

The shadow report must retain, at minimum:

- eligible calls;
- authoritative executions;
- exact classified overlap starts;
- unclassified eligible calls;
- store failures;
- native-control dominated calls;
- observed provider/unit cost with provenance when available;
- observed cost of calls that started behind an identical in-flight predecessor;
- the best measured existing non-SeenRelay control.

If exact overlap is absent or immaterial, the result is negative.

## Safety evidence

Shadow measurement never suppresses an authoritative call. Before activation, the consuming workload must additionally establish that overlapping exact-coordinate results are compatible with its declared shareability policy. Any observed mismatch, incomparable result or unresolved identity ambiguity blocks activation.

Active coordination must remain fail-open:

- shared-store failure -> run the original operation;
- follower timeout -> run the original operation;
- decrypt/open failure -> run the original operation;
- leader failure -> no false success is inherited.

## Economics

Shadow overlap is **observed waste opportunity**, not savings.

After a reviewed operation advances to active coordination, only actual follower reuse counts as an avoided execution.

For usage-based marginal cost:

```text
gross avoided cost = actual follower reuses * measured marginal cost per authoritative execution

net savings = gross avoided cost
              - coordination-store cost
              - additional network/compute overhead
```

Fixed subscriptions, included credits, rate-limit value and tier boundaries must be reported separately. A lower call count is not automatically a lower invoice.

A positive deployment result requires SeenRelay to beat the best existing path on the consuming workload's actual objective. If a simpler native/local control wins, the verdict is `DO NOT USE`.

## Current external lead status — 2026-09-29

| External workload | State | Why |
| --- | --- | --- |
| LangGraph Cloud #7417 | `INSUFFICIENT_EVIDENCE` | Strongest natural lead found so far: the reporter observed identical tool-call arguments re-dispatched while the original was still running, with both executions completing and 2-3x redundant work/cost. It is Cloud-specific and no independently replayable >=100-call trace sample is public, so it cannot yet support a SeenRelay ROI claim. |
| LangGraph #8393 | `REJECT_BEFORE_COLLECTION` | The repro demonstrates an in-flight duplicate PUSH child on parent retry, but the reported cause is a direct framework dedup bug with a simple native correction. Native repair wins before an additional coordination layer. |
| LangGraph #9106 | `REJECT_BEFORE_COLLECTION` | A completed sibling is re-run on a later interrupt resume. The duplicate is sequential rather than in-flight, so fleet coordination intentionally does not apply; local/native completed-result state should win first for eligible reads. |
| GPT Researcher #2180 hypothesis | `REJECT_BEFORE_COLLECTION` on current same-process deep-research path | Current deep-research branches share the same `visited_urls` set. `_get_new_urls()` claims a URL in that shared set before its first await, preventing two same-event-loop branches from both passing the same URL into scraping. Cross-process or cross-request exact recurrence remains unproven. |
| qldpc-challenge #2314 replicated agent sessions | `REJECT_BEFORE_COLLECTION` | The project explicitly uses replicated executors so results can be compared. That is independent sampling by design and must not be collapsed. |

The strongest unresolved lead is LangGraph Cloud #7417. Do not convert the reported 2-3x redundancy into a SeenRelay savings claim unless a natural eligible trace is collected under this gate.
