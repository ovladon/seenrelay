# Break-even surface model

This model answers a narrow question: for a measured or hypothetical validation path, what policy-accepted reuse rate would be required before adding a SeenRelay CHECK has positive expected latency or marginal-cost value?

It is scenario analysis, not workload proof. Natural-workload evidence still belongs in `docs/HOSTILE_BENCHMARK.md` and `scripts/evaluate-hostile-benchmark.mjs`.

## Inputs

Create a JSON file such as:

```json
{
  "schema_version": 1,
  "check_latency_ms": [100, 200],
  "validation_latency_ms": [100, 250, 500, 1000, 2500],
  "observe_latency_ms": 100,
  "observe_eligible_fraction": 1,
  "observe_off_critical_path": false,
  "reuse_rates": [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1],
  "cost": {
    "check_units": 0.1,
    "observe_units": 0.1,
    "validation_units": [0, 0.5, 1, 5]
  }
}
```

Run:

```bash
npm run economics:surface -- surface.json
```

All cost units are caller-defined marginal units and must be internally consistent. They can represent currency, provider credits, rate-limit opportunity cost, or another explicitly measured unit.

`observe_eligible_fraction` is the fraction of non-reused authoritative validations that are independently obtained and therefore eligible for OBSERVE. A provider-cache hit or another intermediary-cache result that does not satisfy SeenRelay provenance rules must not be counted as OBSERVE-eligible.

## Latency threshold

Let:

- `r` = policy-accepted reuse rate over all protected calls;
- `V` = validation latency after the best qualifying non-shared optimization;
- `C` = CHECK latency;
- `O` = OBSERVE latency;
- `q` = OBSERVE-eligible fraction among non-reused validations.

When OBSERVE blocks the response path, prospective expected latency is:

```text
C + (1 - r) * V + (1 - r) * q * O
```

It is strictly better than baseline validation latency `V` when:

```text
r > (C + q * O) / (V + q * O)
```

When the caller genuinely schedules OBSERVE outside the response critical path, the latency threshold is:

```text
r > C / V
```

Moving OBSERVE off the critical path changes latency accounting only. It does not remove OBSERVE cost or provenance requirements.

## Marginal-cost threshold

Let:

- `K_v` = marginal cost of one baseline validation;
- `K_c` = marginal cost assigned to CHECK;
- `K_o` = marginal cost assigned to OBSERVE.

Prospective expected marginal cost is:

```text
K_c + (1 - r) * K_v + (1 - r) * q * K_o
```

Strict positive cost value requires:

```text
r > (K_c + q * K_o) / (K_v + q * K_o)
```

A zero invoice price for SeenRelay does not require `K_c` or `K_o` to be zero. A caller may include its own networking, compute, logging, or operational marginal cost. Conversely, fixed subscriptions and included allowances can make avoided provider calls have zero near-term invoice value; model the marginal economics actually faced by the application.

## Sparse-hive negative control

The output always includes the `reuse_rate = 0` rows under `sparse_hive`.

With no usable reuse, adding a positive-latency remote CHECK cannot improve response latency. If a non-reused validation is OBSERVE-eligible, blocking OBSERVE adds further latency. This is intentional: a cold or low-overlap workload is allowed to fail the economics test.

The client should not infer that a remote CHECK is rational merely because SeenRelay is available.

## Interpretation

`break_even_reuse_rate_exclusive` is the reuse rate that must be exceeded for strict improvement under the stated scenario. A threshold at or above `1` is marked `not_strictly_feasible` because no attainable reuse rate can strictly beat that baseline under those inputs.

The model deliberately treats reuse rate as an external input. It does not infer reuse from agent count, source-change rate, or freshness horizon because doing so would require an explicit stochastic model that may not match the consuming workload. Measure those effects in shadow mode whenever possible.

Before entering `V` or `K_v`, first apply the best qualifying non-shared path: fresh local cache, source-native conditional validation, provider-native caching, or another authoritative optimization. Otherwise the surface compares SeenRelay against an artificially weak baseline.

Use the surface to identify candidate regions and negative controls. Use the hostile natural-workload evaluator to decide whether a real integration has evidence strong enough to leave shadow mode.
