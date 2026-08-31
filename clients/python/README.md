# SeenRelay Python client

**Measure and avoid redundant expensive validation.**

Deterministic, standard-library-only client that places SeenRelay CHECK around repeated source-backed validation while preserving the application's original validation by default.

Client 0.2.7 adds Ambient integrations for LangChain and PydanticAI plus a local machine-readable integration catalog. Python behavior remains conservative and shadow-first. The direct Firecrawl SDK shadow adapter is JavaScript / TypeScript-only; Python parity is not claimed.


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

The report stores aggregate metrics plus SHA-256 fingerprints only. It identifies exact repetition worth reviewing; it does not claim savings. Active Ambient reuse is intentionally unavailable in the Python client until its local-first semantics match the TypeScript implementation.


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
