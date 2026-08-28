# Local overlap proof

`scripts/overlap-proof.ts` measures exact repeated-validation opportunities in an existing workload trace without calling SeenRelay or accepting raw validation values.

It is a measurement tool only. An overlap is **not** a claim that validation was safe to skip.

## Input

Use JSON Lines. Each line contains one validation attempt:

```json
{"timestamp":"2026-08-28T08:00:00Z","process_id":"worker-1","fleet_id":"fleet-a","max_age_seconds":3600,"validator_ms":1200,"validator_cost":0.01,"fact":{"subject":"Example price","predicate":"price.current","source":"https://example.com/api/item/42","locator":{"scheme":"json_pointer","value":"/price"}}}
```

Required fields:

- `timestamp` — observation/validation-attempt time;
- `process_id` — opaque local process/worker label used only for equality classification;
- `fleet_id` — opaque fleet/tenant label used only for equality classification;
- `fact` — a normal SeenRelay fact descriptor.

Optional fields:

- `max_age_seconds` — reuse-window candidate for this event; defaults to the CLI value;
- `validator_ms` — measured validator latency;
- `validator_cost` — caller-defined cost units.

Do not include validation results or source values. The analyzer rejects common raw-payload fields including `value`, `known_value`, `result`, `payload`, `response`, `output`, and `content`.

## Run

```bash
npx tsx scripts/overlap-proof.ts TRACE.jsonl 3600
```

The second argument is the default max-age window in seconds.

## Classification

For each event, the analyzer uses the production fact-v3 canonicalizer and looks for a prior matching fact within that event's allowed window. It assigns at most one incremental locality class, preferring the nearest layer:

1. `same_process`
2. `same_fleet_cross_process`
3. `cross_fleet`

This ordering answers a narrow question: how much additional repeat opportunity remains after closer/local reuse layers are considered?

The report emits aggregate counts/rates and optional aggregate validator latency/cost exposure. It does not emit source URLs, fact keys, process IDs, fleet IDs, or raw values.

## Interpretation

`validator_work_exposed_to_overlap` is not estimated savings. The analyzer intentionally does not know whether the underlying value changed, whether evidence would meet an assurance threshold, or whether caller policy would allow reuse.

Use this tool to establish whether exact source-coordinate overlap exists before modeling freshness, assurance, or savings.
