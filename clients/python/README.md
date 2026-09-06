# SeenRelay Python client

**Measure and avoid redundant expensive validation.**

The base package is standard-library-only. It places SeenRelay CHECK around repeated source-backed validation while preserving the application's original validation by default, and it also provides a network-free Zero-State path for eligible caller-owned reuse.

Client 0.2.10 adds provider-independent Zero-State for explicit read-only validation: in-flight/local reuse, caller-owned private L1, and source-native conditional validation before the authoritative fallback. Ambient framework adapters remain shadow-only by default, and the hosted CHECK/OBSERVE protocol is unchanged. The direct Firecrawl SDK shadow adapter remains JavaScript / TypeScript-only.

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

Python Shadow Proof keeps the original validation. It measures CHECK status distribution, validation time and SeenRelay request latency locally. Potential savings count only `SAME_OBSERVED` calls and subtract caller-supplied request costs. Savings from conditional ETag / Last-Modified requests are deliberately excluded unless measured separately by the application.

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
