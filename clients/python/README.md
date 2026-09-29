# SeenRelay Python client

**Measure and avoid redundant expensive validation.**

The base package is standard-library-only. It places SeenRelay CHECK around repeated source-backed validation while preserving the application's original validation by default, and it also provides a network-free Zero-State path for eligible caller-owned reuse.

Client 0.2.11 adds local natural-workload evidence parity: Python Shadow Proof can retain a bounded sanitized cohort and export the same schema-v2 hostile-benchmark input used by JavaScript / TypeScript, while `seenrelay_economics` evaluates that cohort against the best measured non-shared path. It keeps authoritative validation enabled, exports no fact identity/source/raw value/per-call timestamp, and never enables reuse. Provider-independent Zero-State, Ambient adapters, and the hosted CHECK/OBSERVE protocol are otherwise unchanged. The direct Firecrawl SDK shadow adapter remains JavaScript / TypeScript-only.

## Shared CHECK assurance

`seenrelay_assurance` evaluates additive CHECK evidence without treating it as truth. The multi-signal retained-reuse preset requires at least two observer keys, two cryptographic continuity keys, and two reuse-independence buckets, plus matching value fingerprints and acceptable freshness.

```python
from seenrelay_assurance import multi_signal_retained_reuse_policy

reuse = multi_signal_retained_reuse_policy({"maxAgeSeconds": 300})
```

Using the policy is explicit caller opt-in. Multiple keys and buckets make trivial single-origin poisoning harder; they do not prove independent real-world actors or truth. High-consequence validation should still require authoritative source confirmation under the application's own policy.

## Deterministic coordinates

`seenrelay_coordinates` keeps local call coordinates separate from shared source-backed fact descriptors.

```python
from seenrelay_coordinates import (
    mcp_tool_coordinate,
    openapi_operation_coordinate,
    json_pointer_fact,
)

local_call = mcp_tool_coordinate(
    "catalog-prod",
    "catalog.read",
    {"id": 42},
)

api_call = openapi_operation_coordinate(
    "catalog-api",
    "getProduct",
    {"id": 42},
)

fact = json_pointer_fact(
    "Product 42 stock",
    "availability.current",
    "https://api.example.com/products/42",
    "/stock",
)
```

MCP/OpenAPI coordinates are local repetition keys only. Shared fact builders require a stable source-native locator. Prefer fragmentation to guessed semantic convergence.

## Python Zero-State for fleet-local reuse

`seenrelay_zero_state` adds no hosted operation and performs no SeenRelay network call by itself. It is for applications that control an eligible read-only validation path and want the cheapest caller-owned path first.

```python
from seenrelay_zero_state import SeenRelayZeroState, fresh_result

edge = SeenRelayZeroState(local_max_age_ms=5_000)

value = await edge.guard(
    coordinate={"tool": "catalog.read", "arguments": {"id": 42}},
    validate=lambda conditional_headers: fetch_catalog(42, conditional_headers),
)
```

The authoritative validator remains the fallback. A positive local/private freshness window is explicit caller policy; the default completed-result TTL is zero. A retained ETag or Last-Modified value may still be used for conditional source confirmation when completed-result reuse is disabled.

For caller-owned private L1 across workers or restarts, supply both a store and a codec. The backing store receives only an opaque SHA-256 coordinate key and a sealed payload.

```bash
pip install 'seenrelay[crypto]'
```

```python
import os
from seenrelay_zero_state import SeenRelayZeroState, create_aes_gcm_private_codec

# Provision this as a 64-hex-character secret in your own secret manager.
key_bytes = bytes.fromhex(os.environ["SEENRELAY_L1_KEY_HEX"])

edge = SeenRelayZeroState(
    private_store=fleet_store,  # sync/async get(key) + set(key, sealed_value)
    private_codec=create_aes_gcm_private_codec(key_bytes),
    private_max_age_ms=30_000,
)
```

The built-in codec requires exactly 32 key bytes and uses AES-256-GCM. Store/codec/decrypt failures fail open to normal validation. A private L1 hit is never relabeled as an independent OBSERVE. The base `seenrelay` install remains dependency-free; only the built-in AES helper needs the optional `crypto` extra.

Coordinate fingerprints match the JavaScript Zero-State contract for interoperable JSON values. Python rejects integers that cannot be represented exactly by JavaScript numbers instead of silently changing the coordinate. The built-in encrypted payload formats intentionally do **not** claim mixed-language ciphertext interoperability. A mixed Python/JavaScript fleet that shares one private store must provide one caller-owned codec format understood by both languages.

## Fleet exact in-flight coordination

The repository now includes an opt-in Python fleet coordinator for exact simultaneous read-only work across processes or workers that share a caller-owned coordination store. This is separate from completed-result freshness reuse: when no equivalent call is currently in flight, the operation executes normally.

```python
import os

from seenrelay_fleet import (
    SeenRelayFleetCoordinator,
    create_fleet_savings_ledger,
    create_redis_rest_fleet_store,
    fleet_codec_from_private_codec,
)
from seenrelay_zero_state import create_aes_gcm_private_codec

store = create_redis_rest_fleet_store(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"],
)

key_bytes = bytes.fromhex(os.environ["SEENRELAY_FLEET_KEY_HEX"])
fleet = SeenRelayFleetCoordinator(
    store=store,
    codec=fleet_codec_from_private_codec(
        create_aes_gcm_private_codec(key_bytes)
    ),
    scope_key=os.environ["SEENRELAY_FLEET_SCOPE"],
)

savings = create_fleet_savings_ledger()

result = await fleet.run(
    coordinate={
        "provider": "openai",
        "operation": "responses.create",
        "model": model,
        "input": input_payload,
    },
    policy={
        "side_effect_class": "read_only",
        "exact_single_answer_shareable": True,
        "independent_samples_required": False,
    },
    execute=expensive_read_only_call,
    cost={
        "marginal_cost_usd": 0.48,
        "provenance": "provider_list_price",
    },
    on_receipt=savings.record,
)
```

The coordinator activates only for explicitly eligible read-only/idempotent work that accepts one exact shared answer. Mutations, independent sampling, different fleet scopes, and underspecified policies pass through. If an equivalent zero-cost provider-native exact response cache already dominates, declare it and the fleet coordinator steps aside.

The Redis REST adapter uses atomic claim/publish/fail operations. Shared results are sealed with the caller's codec before entering the store. Store errors, wait expiry and codec failures fail open to the original operation. A later sequential call is not treated as a cache hit.

Savings receipts are deliberately conservative: only an actual follower reuse counts as an avoided execution. Dollar value appears only when the caller supplies or resolves a marginal cost with explicit provenance; unknown cost stays unknown. Receipt callback failures never change the application result.

The built-in AES codec requires `pip install 'seenrelay[crypto]'`. Mixed-language fleets should use a caller-owned codec format understood by every participating runtime; the built-in Python and JavaScript ciphertext formats do not claim cross-language interoperability.

## Ambient MCP

Python can start in local-only shadow mode with no SeenRelay network call and no result suppression:

```python
from seenrelay_ambient import ambient_mcp_client

client = ambient_mcp_client(raw_mcp_client, server_key="docs")
# await client.call_tool(...) normally
print(client.get_report())
```

For OpenAI Agents Python:

```python
from seenrelay_ambient import ambient_openai_agents_mcp_server

server = ambient_openai_agents_mcp_server(raw_mcp_server)
# pass `server` to the Agent exactly as before
```

The report stores aggregate metrics plus SHA-256 fingerprints only. It identifies exact repetition worth reviewing; it does not claim savings. Active Ambient reuse is intentionally unavailable in the Python client; Zero-State must be configured explicitly around a caller-controlled read-only validation path.

## Install

```bash
pip install seenrelay
```

## Smallest integration: bind once, one line per revalidation

```python
from seenrelay import SeenRelayClient
from seenrelay_easy import protect_validation

relay = SeenRelayClient()

validate_price = protect_validation(
    relay,
    fact=fact,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
)

value = validate_price(known_value)
```

That is strict shadow mode by default: SeenRelay CHECK runs, your original validation still runs, and the independently obtained result is OBSERVEd best-effort. Nothing is skipped merely because SeenRelay is installed.

Only after measurement and policy approval should you add an explicit reuse policy:

```python
from seenrelay import reuse_known_on_same_observed

validate_price = protect_validation(
    relay,
    fact=fact,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
    reuse=reuse_known_on_same_observed,
)
```

## Direct client form

```python
value = relay.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
)
```

Without an explicit reuse policy, validation is never skipped.

## Prove value before enabling reuse

```python
from seenrelay import SeenRelayClient
from seenrelay_shadow import SeenRelayShadowProof

proof = SeenRelayShadowProof(SeenRelayClient())

value = proof.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
)

print(proof.report(
    avoided_validation_cost=0.01,
))
```

Python Shadow Proof keeps the original validation. It measures CHECK status distribution, validation time and SeenRelay request latency locally. For `SAME_OBSERVED`, it also compares the caller-known deterministic JSON value with the authoritative validation result and reports safety as pass/fail/incomplete/no-opportunities without retaining compared raw values. Potential savings count only `SAME_OBSERVED` calls and subtract caller-supplied request costs. Savings from conditional ETag / Last-Modified requests are deliberately excluded unless measured separately by the application.

## Collect sanitized natural-workload evidence

Natural-workload collection is explicit and local. The simulated reuse policy runs only after authoritative validation and cannot suppress it.

```python
from seenrelay import SeenRelayClient, reuse_known_on_same_observed
from seenrelay_shadow import SeenRelayShadowProof
from seenrelay_economics import evaluate_hostile_benchmark

proof = SeenRelayShadowProof(
    SeenRelayClient(),
    benchmark_record_limit=10_000,
)

value = proof.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda ctx: expensive_validation(ctx.conditional_headers),
    benchmark={
        "reuse": reuse_known_on_same_observed,
        "baseline_cost": 5,
        "check_cost": 0,
        "observe_cost": 0,
        "observe_after_baseline": True,
    },
)

benchmark_input = proof.hostile_benchmark_input(
    workload_id="opaque-run-id",
    controls={
        "local_cache": {"available": True, "measured": True},
        "source_native_conditional": {"available": True, "measured": True},
        "provider_native_cache": {"available": True, "measured": True},
    },
)

result = evaluate_hostile_benchmark(benchmark_input)
```

Each retained record contains only CHECK outcome, simulated-policy decision, comparison result, per-path timings and caller-supplied cost units. The export omits the fact descriptor, source, known value, validated value and per-call timestamp. CHECK-unavailable calls remain in schema v2. A native control declared available but not measured makes evaluation fail closed. If concurrent relay traffic makes one call's CHECK/OBSERVE telemetry timing impossible to attribute unambiguously, Python invalidates the benchmark export instead of guessing. The evaluator always reports `automatic_reuse_enabled_by_evaluator = False`.

Use SeenRelay around repeated validation that is materially more expensive than the preflight: paid search, scraping/proxy work, browser or extraction calls, rate-limited APIs, model-assisted parsing, or multi-step validation. It is generally a poor fit for a cheap one-off GET.

## Protocol boundary

The Python client does not add a SeenRelay operation. The hosted service still exposes only CHECK and OBSERVE and does not browse, search or verify arbitrary facts on demand.

## License

The client package is MIT licensed. The hosted SeenRelay service implementation remains governed by the repository root license.

## Ambient framework integrations

All integrations below are optional. SeenRelay imports the framework only when the corresponding adapter is requested. Ambient measurement is local-only, preserves the authoritative call, and never enables reuse automatically.

```python
from seenrelay_ambient import ambient_langchain_mcp_client
client = ambient_langchain_mcp_client(client)
tools = await client.get_tools()
print(client.seenrelay_ambient["get_report"]())
```

```python
from seenrelay_ambient import ambient_pydantic_ai_toolset
toolset = ambient_pydantic_ai_toolset(toolset)
```

Coding agents and integration tooling can inspect the installed package without network discovery:

```python
from seenrelay_ambient import ambient_integration_catalog
print(ambient_integration_catalog())
```

The catalog is local metadata only. It adds no telemetry, hosted operation, or reuse authorization.
