# Langfuse opportunity census

SeenRelay can analyze a local export of Langfuse TOOL observations before you add any runtime coordination.

This is a **candidate census**, not an automatic cache and not a SeenRelay USE verdict.

## Why

Langfuse already records production agent observations, including tool calls, timing and optional cost fields. If you already have those traces, the cheapest first question is:

> Do the same exact tool calls naturally repeat, and do any repeats overlap while the first execution is still running?

SeenRelay can answer that from an export without uploading the export to SeenRelay.

## Input

Use Langfuse Observations API v2, a UI/blob export, or another JSON/JSONL export whose rows contain TOOL observations.

Supported shapes:

- JSON array of observation rows;
- Langfuse API envelope: `{"data": [...]}`;
- JSONL, one observation row per line.

The census reads the common Langfuse fields:

- `type` — only `TOOL` observations are considered;
- `name`;
- `input`;
- `traceId` / `trace_id`;
- `startTime` / `start_time`;
- `endTime` / `end_time`;
- optional `totalCost` / `total_cost`.

## Run

```bash
npx seenrelay langfuse-census observations.json --json
```

The command is local-only. It does not contact Langfuse or SeenRelay.

## Privacy

Tool inputs may contain customer or application data. SeenRelay therefore uses them only in memory to construct an exact local coordinate:

```text
sha256(canonical(tool_name + tool_input))
```

Raw tool input and output are not copied into the report.

Tool names remain visible in the local report so the developer can identify which candidate to inspect. Treat the generated report as local operational data unless you have reviewed it for sharing.

## What the report measures

The report distinguishes:

- exact repeat starts;
- exact repeats inside the same trace;
- exact coordinates seen across multiple traces;
- exact in-flight overlap starts;
- coverage of Langfuse `totalCost`;
- recorded cost attached to repeat observations.

JSON object key ordering is canonicalized. Different values remain different coordinates. This is exact recurrence, not fuzzy or semantic matching.

## What it does not prove

An identical tool name and input do **not** establish that:

- the tool is read-only;
- one result may safely satisfy multiple callers;
- freshness policy permits reuse;
- two observations ran on different workers;
- the result is deterministic;
- a stronger native cache or local single-flight does not already solve the problem.

Therefore:

- `candidate_status` is `NEEDS_POLICY_REVIEW` when repeats exist;
- `actual_avoided_executions` remains null;
- `actual_net_savings_usd` remains null;
- executor identity is not inferred from Langfuse trace identity.

## Cost interpretation

Langfuse `totalCost`, when present on TOOL observations, is reported as **recorded cost**.

It is not automatically called avoidable cost. Tool/provider charges may be absent from Langfuse or may use a different accounting boundary.

A repeated observation with recorded cost is a useful candidate for review, not a savings receipt.

## Promotion path

A candidate should advance only after:

1. review the tool's side-effect and exact-shareability semantics;
2. identify the best existing local/provider/native control;
3. instrument worker/executor identity when cross-worker coordination matters;
4. run SeenRelay shadow measurement while every authoritative call still executes;
5. activate only the bounded reviewed path if natural overlap and economics remain positive;
6. count only actual follower reuse as avoided execution.

This keeps Langfuse as the observation source and SeenRelay as the optional execution-reuse layer only where the workload proves it is useful.
