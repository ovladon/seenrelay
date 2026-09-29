# Local fleet trace census

`seenrelay trace-census` measures exact eligible in-flight overlap from a caller-owned sanitized trace without contacting SeenRelay or executing the traced workload.

It answers a deliberately narrow pre-activation question:

> If exact-shareable read-only calls in this trace had used one exact in-flight leader, how often did another eligible call begin before that leader finished, and what measured marginal cost was attached to those follower candidates?

It does **not** claim actual savings. Actual avoided executions require active coordination and follower-reuse receipts.

## Run

```bash
npx seenrelay trace-census fleet-trace.jsonl
npx seenrelay trace-census fleet-trace.jsonl --json
```

The command is local-only. It reads the supplied file and emits aggregate output.

## Event schema

Each JSON or JSONL event uses `schema_version: "seenrelay-fleet-trace-event-v1"`:

```json
{
  "schema_version": "seenrelay-fleet-trace-event-v1",
  "call_id": "opaque-call-001",
  "worker_id": "opaque-worker-a",
  "clock_domain": "otel-unix-epoch-ms",
  "coordinate_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "started_at_ms": 1780000000000,
  "ended_at_ms": 1780000001500,
  "side_effect_class": "read_only",
  "exact_single_answer_shareable": true,
  "independent_samples_required": false,
  "native_exact_cache_zero_cost": false,
  "outcome": "success",
  "marginal_cost_usd": 0.48,
  "provider_units": 1,
  "provider_unit_label": "credit",
  "cost_provenance": "provider_reported"
}
```

A JSON array of events and an object with a top-level `calls` array are also accepted.

## Privacy boundary

Do not export raw prompts, tool arguments, URLs, headers, messages, provider responses or source values. The analyzer requires an opaque SHA-256 coordinate for eligible calls and rejects common raw-content fields, including nested occurrences.

The coordinate hash must bind every result-affecting qualifier needed for exact shareability. The analyzer cannot infer whether the caller omitted tenant/auth scope, model/tool version, locale, files, render/extraction options or another relevant qualifier.

## Eligibility

The analyzer derives eligibility; it does not trust an `eligible: true` flag.

A record is included only when:

- `side_effect_class` is `read_only` or `idempotent_read`;
- `exact_single_answer_shareable` is true;
- `independent_samples_required` is false;
- `native_exact_cache_zero_cost` is not true.

Mutations, unknown side effects, independent sampling and a declared zero-cost exact native cache are excluded before economics.

## Overlap model

For each `(clock_domain, coordinate_hash)`, events are ordered by start time. The first eligible call becomes the modeled leader until its observed end time.

Calls that begin before that leader ends are overlap followers. A shadow follower does **not** extend the leader lease merely because its original execution continued longer. This prevents chain-overlap inflation.

If the observed leader outcome is not `success`, its overlap followers remain observed overlap but are not counted as successful-leader reuse opportunities.

`clock_domain` is a caller assertion that timestamps are comparable. SeenRelay does not prove clock synchronization.

## Cost output

Dollar and provider-unit totals are emitted only from caller-supplied values with explicit provenance. Missing cost remains missing; cost coverage is reported.

The main fields are:

- `observed_exact_overlap_starts` — eligible calls that began behind the current exact leader;
- `cross_worker_overlap_starts` — overlap calls whose worker differed from the leader;
- `successful_leader_overlap_opportunities` — overlap calls whose modeled leader later succeeded;
- `gross_potential_avoided_cost_usd` — explicit marginal USD attached to that last set;
- `potential_avoided_provider_units_by_label` — equivalent caller-supplied provider units;
- `actual_avoided_executions: null`;
- `actual_net_savings_usd: null`.

Those last two fields stay null by design. They become factual only after active follower reuse and measured overhead.

## Deployment boundary

Use the trace census to rank natural workloads for real shadow instrumentation. Then apply [FLEET_OVERLAP_GATE.md](./FLEET_OVERLAP_GATE.md): measure the best native/local control, preserve authoritative execution in shadow mode, establish result compatibility, and activate only the reviewed operation whose own workload shows positive economics.
