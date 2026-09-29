# OpenTelemetry / OTLP trace census

`seenrelay otel-trace-census` lets an existing OpenTelemetry deployment feed the local SeenRelay fleet-overlap census without integrating SeenRelay into a specific agent framework.

The command is deliberately **observation-only**:

- reads a local OTLP/JSON export;
- makes no SeenRelay network call;
- executes no traced workload;
- enables no reuse;
- reports pre-activation overlap opportunity, never actual savings.

This is the substrate path: Claude Code, Codex, OpenCode, custom agents, CI workers and ordinary services can all converge on the same trace boundary if their actual execution is already instrumented.

## Run

```bash
npx seenrelay otel-trace-census traces.otlp.json
npx seenrelay otel-trace-census traces.otlp.json --json
```

The input must use the OTLP JSON `resourceSpans -> scopeSpans -> spans` shape.

## Why OpenTelemetry

OpenTelemetry already defines span conventions for common execution layers, including:

- GenAI tool execution;
- HTTP client calls;
- RPC and database calls;
- messaging;
- CI/CD pipeline/task runs.

SeenRelay does **not** infer reuse safety from those operation types. They provide a common place to observe executions; policy remains explicit.

## Required SeenRelay span attributes

A span is considered by the adapter only when it carries an opaque exact coordinate and explicit policy:

| Attribute | Type | Meaning |
| --- | --- | --- |
| `seenrelay.coordinate_hash` | string | `sha256:<64 hex>` over every result-affecting qualifier |
| `seenrelay.side_effect_class` | string | `read_only`, `idempotent_read`, `mutation`, or `unknown` |
| `seenrelay.exact_single_answer_shareable` | boolean | whether one authoritative result may satisfy exact concurrent callers |
| `seenrelay.independent_samples_required` | boolean | true when callers need independent executions/samples |
| `seenrelay.native_exact_cache_zero_cost` | boolean, optional | marks a stronger zero-cost native exact cache |
| `seenrelay.outcome` | string, recommended | `success`, `error`, or `unknown` |
| `seenrelay.worker_id` | string, optional | opaque worker identity; otherwise safe resource identity is used |
| `seenrelay.clock_domain` | string, optional | timestamp comparability assertion; defaults to `otel-unix-epoch` |

Optional economics attributes:

- `seenrelay.marginal_cost_usd`
- `seenrelay.provider_units`
- `seenrelay.provider_unit_label`
- `seenrelay.cost_provenance`

Missing economics remain unknown.

## Coordinate creation

Compute the coordinate locally at instrumentation time. Do not export raw tool arguments just to let SeenRelay compute it later.

For a browser read, the hash may need to bind fields such as:

- operation/tool version;
- target identity;
- browser/render options;
- authentication/tenant scope when relevant;
- extraction or query parameters;
- locale/proxy/session qualifiers;
- any other field that can change the authoritative result.

For a build/test command it may need the tree/content digest, command, toolchain/config version and relevant environment identity.

A weak coordinate is unsafe. If the full result identity is not known, do not mark the operation exact-shareable.

## Privacy boundary

OpenTelemetry GenAI conventions allow tool arguments and results to be recorded, and HTTP spans can carry URLs and headers. Those fields can contain sensitive information.

The OTLP adapter therefore does not copy generic span attributes into the SeenRelay census. It maps only:

- the allowlisted `seenrelay.*` policy/economics fields;
- span ID and timing;
- an opaque worker identity derived from explicit `seenrelay.worker_id` or resource identity.

Raw prompts, tool arguments/results, URLs, headers, request bodies and unrelated attributes do not appear in the report.

## Outcome discipline

OpenTelemetry status `ERROR` is mapped to SeenRelay `error`.

A non-error or unset OTel span is **not** automatically promoted to `success`; without explicit `seenrelay.outcome = "success"`, the adapter records `unknown`. This prevents incomplete instrumentation from creating false successful-leader opportunities.

## What this enables

The same census can now rank overlap below the agent layer:

```text
agent / terminal / CI worker
          |
          v
tool / HTTP / browser / test / validation execution
          |
          v
OpenTelemetry span + local opaque exact coordinate
          |
          v
SeenRelay OTLP trace census
          |
          v
native control first -> shadow -> active coordination only if justified
```

Actual avoided executions still require active follower reuse. Net savings still require measured coordination/store overhead and comparison with the best existing native/local control.
