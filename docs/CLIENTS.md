# SeenRelay client integrations

Canonical remote MCP endpoint: `https://seenrelay.com/mcp`

Official MCP Registry identifier: `io.github.ovladon/seenrelay`

SeenRelay exposes exactly two domain operations through MCP and REST: `check_fact` / CHECK and `observe_fact` / OBSERVE. Treat it as freshness infrastructure, not as a browser, search engine, fact checker, truth oracle, or shared general memory.

## Recommended integration order

For JavaScript / TypeScript 0.2.1, the preferred application path is local-first for explicitly eligible read-only operations:

1. exact in-flight / explicit-TTL local reuse;
2. optional encrypted caller-owned private L1 reuse;
3. source-native ETag / Last-Modified confirmation when available;
4. optional shared CHECK only when configured and useful;
5. the application's existing validation as fallback;
6. OBSERVE only after genuinely fresh independent validation.

The hosted CHECK/OBSERVE protocol is unchanged. Python 0.2.1 and the classic JavaScript / TypeScript client remain shadow-first.

## JavaScript / TypeScript Zero-State

```js
import { SeenRelayZeroState } from 'seenrelay/zero-state';

const edge = new SeenRelayZeroState({ localMaxAgeMs: 30_000 });

const result = await edge.guard({
  coordinate: {
    tool: 'catalog.read',
    arguments: { id: 42 }
  },
  validate: async () => expensiveRead()
});
```

Zero-State does not place a shared CHECK on the hot path by default. Completed-result TTL defaults to `0`, so arbitrary freshness is not invented.

### MCP bind-once interception

```js
import { protectMcpClient } from 'seenrelay/mcp-auto';

const client = protectMcpClient(rawMcpClient, {
  serverKey: 'catalog-server',
  tools: {
    'catalog.read': { maxAgeMs: 30_000 }
  }
});
```

Only explicitly allowlisted tool names are eligible. Unlisted tools pass through unchanged. The generic core does not infer read-only safety from a tool name, description, or untrusted annotation.

### Generic dispatcher

`seenrelay/auto` provides provider-independent adapter-based dispatch around an application's existing tool runner. Provider-specific adapters are optional integrations and cannot become runtime dependencies of SeenRelay Core.

## Classic JavaScript and Python wrappers

The classic wrappers remain available when an application specifically wants deterministic shared CHECK measurement/reuse around a selected fact validation.

### JavaScript / TypeScript

```js
import {
  SeenRelayClient,
  reuseKnownOnSameObserved
} from 'seenrelay';

const relay = new SeenRelayClient();

const value = await relay.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => existingValidation(conditionalHeaders)
});
```

The example above remains shadow mode because no reuse policy was supplied. Explicit bounded reuse remains caller policy.

### Python

```python
from seenrelay import SeenRelayClient, reuse_known_on_same_observed

relay = SeenRelayClient()

value = relay.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda context: existing_validation(context.conditional_headers),
)
```

Python behavior remains shadow-first in 0.2.1. JavaScript / TypeScript Zero-State parity is not claimed for Python in this release.

Relay-side timeout, 429, malformed response or outage fails open into the original validation path. Application validation failures still propagate.

## Source-native and private reuse

For ordinary HTTP reads, ETag / Last-Modified confirmation is preferable to guessing freshness. A `304 Not Modified` response confirms the retained result at the source.

JavaScript / TypeScript Zero-State can also use a caller-supplied private store and AES-256-GCM codec helper. The caller owns its key, storage and namespace. Private values are not automatically sent to the public relay.

## Claude Code

Anthropic documents remote Streamable HTTP MCP servers through `claude mcp add --transport http`.

```bash
claude mcp add --transport http seenrelay https://seenrelay.com/mcp
claude mcp list
```

Use MCP when model/tool routing is appropriate. MCP exposes the same CHECK and OBSERVE operations; it does not automatically apply the client-side Zero-State optimization to arbitrary third-party tools.

Official reference: <https://docs.anthropic.com/en/docs/claude-code/mcp>

## Cursor

Cursor supports remote Streamable HTTP MCP servers in `.cursor/mcp.json` for a project or `~/.cursor/mcp.json` globally.

**One-click install:** [Add SeenRelay to Cursor](https://cursor.com/install-mcp?name=seenrelay&config=eyJ1cmwiOiJodHRwczovL3NlZW5yZWxheS5jb20vbWNwIn0%3D)

```json
{
  "mcpServers": {
    "seenrelay": {
      "url": "https://seenrelay.com/mcp"
    }
  }
}
```

Cursor tool approval and enterprise allowlists remain controlled by Cursor and your organization.

Official references:

- <https://cursor.com/docs/mcp>
- <https://cursor.com/docs/mcp/install-links>

## VS Code / GitHub Copilot

```json
{
  "servers": {
    "seenrelay": {
      "type": "http",
      "url": "https://seenrelay.com/mcp"
    }
  }
}
```

For workspace configuration, use `.vscode/mcp.json`.

```bash
code --add-mcp '{"name":"seenrelay","type":"http","url":"https://seenrelay.com/mcp"}'
```

Official references:

- <https://code.visualstudio.com/docs/agent-customization/mcp-servers>
- <https://code.visualstudio.com/docs/agents/reference/mcp-configuration>

## ChatGPT custom MCP apps

Where the user's plan and workspace policy permit custom remote MCP apps, configure:

```text
MCP endpoint: https://seenrelay.com/mcp
```

Review the resulting permissions before enabling the app. Full MCP availability and administrative controls vary by plan and can change.

Official reference: <https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt>

## REST clients and agent frameworks

- OpenAPI: `https://seenrelay.com/openapi.json`
- CHECK: `POST https://seenrelay.com/v1/check`
- OBSERVE: `POST https://seenrelay.com/v1/observe`

See [`QUICKSTART.md`](QUICKSTART.md) for concrete requests and [`PROTOCOL.md`](PROTOCOL.md) for deterministic fact identity.

## Recommended rollout

For JavaScript / TypeScript Zero-State, begin with only explicitly eligible read-only operations and a TTL of `0` unless the caller/source already supplies a defensible freshness window. Measure local/private/source-native savings before adding shared CHECK.

For the classic shared-evidence path, start in **shadow mode**: keep the original validation, measure what CHECK would have saved, and enable bounded reuse only after the consuming application's own results and risk policy justify it.

## Security note

Connecting any MCP server expands an agent's tool surface. Wrapping application validation adds code to the call path. Review endpoint, source, permissions and semantics before enabling either route. SeenRelay's public source is available in this repository, and Production changes are exercised by CI plus an isolated Preview Release Gate before promotion.
