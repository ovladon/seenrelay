# SeenRelay decision layer

SeenRelay helps an agent or application answer a narrow question:

> **I already know an external state. Do I need to pay to validate it again now?**

It does not replace the authoritative source, browse for arbitrary answers, or decide truth. The hosted protocol still has exactly two domain operations: **CHECK** and **OBSERVE**.

## Decision order

For eligible read-only validation, prefer the strongest simple control first:

1. exact in-flight coalescing and explicit caller-owned local/private reuse;
2. source-native conditional validation such as ETag / Last-Modified;
3. provider-native cache, monitor, webhook or change signal when it preserves the same semantics;
4. optional SeenRelay CHECK for compatible recent observations of the same deterministic source-backed fact;
5. the application's authoritative validation;
6. OBSERVE only after a fresh independent validation that is eligible for contribution.

A SeenRelay installation is not evidence that step 4 should be used. If steps 1–3 answer the same question more cheaply or more strongly, they win.

## Known-state revalidation

CHECK is not a database lookup for somebody else's raw answer. The caller supplies:

- a deterministic source-backed fact descriptor;
- the value it already knows;
- the maximum observation age its own policy is willing to consider.

SeenRelay then reports recent evidence such as `SAME_OBSERVED`, `CHANGED_OBSERVED`, `STALE`, `UNKNOWN` or `CONTESTED`.

The caller decides whether that evidence changes what it should do next.

## Canonical starter facts

Independent integrations only share evidence when they describe the same fact deterministically. The public starter catalog reduces accidental identity fragmentation for a small set of public source-backed facts:

- human page: https://seenrelay.com/starter-facts
- machine JSON: https://seenrelay.com/starter-facts.json

The catalog contains descriptors only. It does **not** publish observed values, recommend a TTL or authorize reuse.

For other facts, use the Fact Coordinate Kit only when the authoritative source exposes a stable locator. Prefer fragmentation to false convergence.

## Why this is different from a cache

A cache typically stores and serves payloads inside one application or provider boundary. SeenRelay can be useful when the important artifact is instead:

- evidence that a known condition was observed recently;
- temporal provenance about that observation;
- a deterministic cross-integration fact identity;
- a safe decision to validate again, not a replacement payload.

Caller-owned caches remain the preferred answer when they solve the same problem.

## Shadow before suppression

The first deployment should preserve every authoritative call.

Use the local scanner and Shadow Proof to measure:

- natural recurrence;
- exact fact identity;
- local/source/provider-native alternatives;
- agreement with the authoritative validation;
- latency and marginal cost;
- the break-even reusable rate.

The only acceptable runtime conclusions are:

- **USE** — measured residual value remains after stronger controls;
- **DO NOT USE** — a simpler or stronger path wins;
- **INSUFFICIENT EVIDENCE** — the workload does not yet support a decision.

## Network value

Shared evidence becomes more useful when independent callers ask the same freshness question. It must not be manufactured. First-party observations may make a fact non-empty, but they are not external adoption and do not prove that another caller should reuse anything.

## Safety boundary

- Mutating or destructive work is outside the suppression target.
- CHECK never independently browses or verifies the source.
- OBSERVE means the caller independently obtained the observation.
- Recent evidence is not universal truth.
- Failure falls through to the application's existing validation path.
- No model or LLM is allowed to invent fact equivalence.

See [PROTOCOL.md](PROTOCOL.md), [FACT_COORDINATE_KIT.md](FACT_COORDINATE_KIT.md), [SHADOW_AUDIT.md](SHADOW_AUDIT.md) and [ECONOMICS_LAB.md](ECONOMICS_LAB.md).
