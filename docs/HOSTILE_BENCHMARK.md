# Hostile benchmark controls

This benchmark is designed to test whether a shared SeenRelay CHECK adds value after the consuming application has already used the best non-shared optimization available to it.

It does not change runtime behavior and it never enables reuse automatically.

## Baseline rule

For each measured call, `baseline_ms` and `baseline_cost` must represent the best existing non-shared path that satisfies the caller's freshness and safety policy.

Before evaluating shared CHECK, explicitly consider these controls:

- local/private cache;
- source-native conditional validation such as ETag or Last-Modified;
- provider-native cache or cache-only mode.

If one of those controls is available, it must be measured. Do not compare SeenRelay only with an intentionally uncached provider path when a qualifying native cache exists.

## Evidence classes

Use `sample_type: "fixed_fact_smoke"` only to prove mechanics. Fixed-fact smoke results must not be presented as a natural workload reuse rate.

Use `sample_type: "natural_workload"` for captured or replayed workload evidence where the fact-frequency distribution was not manufactured to guarantee reuse.

## Input format

The evaluator accepts a JSON document:

```json
{
  "schema_version": 1,
  "workload_id": "example",
  "sample_type": "natural_workload",
  "baseline_definition": "best_existing_non_shared_path",
  "observe_off_critical_path": false,
  "controls": {
    "local_cache": { "available": true, "measured": true },
    "source_native_conditional": { "available": true, "measured": true },
    "provider_native_cache": { "available": true, "measured": true }
  },
  "records": [
    {
      "check_status": "SAME_OBSERVED",
      "policy_reusable": true,
      "baseline_ms": 800,
      "baseline_cost": 1,
      "check_ms": 120,
      "observe_ms": 100,
      "check_cost": 0,
      "observe_cost": 0
    }
  ]
}
```

Cost units are caller-defined but must remain consistent within one benchmark. They may be currency, provider credits, or another measured marginal unit.

`policy_reusable` may be true only for `SAME_OBSERVED`. The evaluator rejects other statuses rather than treating them as reusable.

## Run

```bash
node scripts/evaluate-hostile-benchmark.mjs benchmark.json
```

The report compares the measured baseline with the prospective shared-relay path and returns aggregate cost and latency outcomes plus p50/p95 latency. OBSERVE cost is always counted. OBSERVE latency is excluded only when the caller explicitly states that it is genuinely outside the response critical path.

## Interpretation

A positive fixed-fact smoke result demonstrates mechanics only.

A natural-workload result is useful evidence only for the measured workload and policy. It is not a universal hit-rate or savings claim.

If provider-native cache is available but unmeasured, the evaluator fails instead of producing a favorable comparison. If the prospective relay path is slower or more expensive than the best qualifying baseline, keep shared CHECK out of that path.
