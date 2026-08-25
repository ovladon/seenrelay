# SeenRelay client integrations

Canonical remote MCP endpoint: `https://seenrelay.com/mcp`

Official MCP Registry identifier: `io.github.ovladon/seenrelay`

SeenRelay exposes exactly two domain operations through MCP and REST: `check_fact` / CHECK and `observe_fact` / OBSERVE. Treat it as freshness infrastructure, not as a browser, search engine, fact checker, truth oracle, or shared general memory.

The integration policy is simple:

1. call CHECK before source-backed revalidation work that might be redundant;
2. if the result is not reusable under your own policy, perform the validation you already intended to perform;
3. call OBSERVE only after your agent independently obtained the result for its own task.

## Deterministic JavaScript and Python wrappers

MCP is the standard discovery and tool interface. Some applications, however, need the SeenRelay preflight to execute deterministically whenever a selected validation path runs instead of depending on model tool-routing behavior.

SeenRelay therefore also ships vendorable, zero-third-party-runtime-dependency reference wrappers:

- JavaScript / TypeScript runtime: [`../clients/typescript/dist/seenrelay.js`](../clients/typescript/dist/seenrelay.js)
- Python: [`../clients/python/seenrelay.py`](../clients/python/seenrelay.py)
- wrapper design and usage: [`../clients/README.md`](../clients/README.md)

The wrappers do not add a protocol operation or a local fact cache. Their default is shadow mode:

1. CHECK;
2. unless the caller explicitly supplied a reuse policy that accepts the result, continue to the application's existing validation;
3. pass only safe observer-supplied ETag / Last-Modified conditional hints to that validation when available;
4. OBSERVE the independently obtained result best-effort;
5. if SeenRelay times out, returns 429, returns malformed output, or is unavailable, fail open into the original validation path.

Application validation failures still propagate; fail-open applies to the relay, not to the application's own source validation.

### JavaScript / TypeScript

```js
import {
  SeenRelayClient,
  reuseKnownOnSameObserved
} from './clients/typescript/dist/seenrelay.js';

const relay = new SeenRelayClient();

const value = await relay.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => existingValidation(conditionalHeaders)
});
```

The example above remains shadow mode because no reuse policy was supplied. If a narrowly defined application policy permits reusing its already-known value when CHECK returns `SAME_OBSERVED`, it can opt in explicitly:

```js
const value = await relay.guard({
  fact,
  knownValue,
  validate: ({ conditionalHeaders }) => existingValidation(conditionalHeaders),
  reuse: reuseKnownOnSameObserved
});
```

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

Explicit bounded reuse is opt-in:

```python
value = relay.guard(
    fact=fact,
    known_value=known_value,
    validate=lambda context: existing_validation(context.conditional_headers),
    reuse=reuse_known_on_same_observed,
)
```

The wrappers also expose in-process telemetry for CHECK network requests, coalesced simultaneous checks, validations, reuse hits, OBSERVE attempts, failures, and request latency. They do not upload that telemetry. Cost estimation uses only caller-supplied cost units; SeenRelay does not invent provider pricing or count unmeasured conditional-request savings.

Use this path around work that is materially more expensive than the SeenRelay preflight, such as browser rendering, proxies/scraping, paid APIs, extraction, LLM parsing, rate-limited sources, or multi-step validation. It is a poor fit for a one-off trivial request with little chance of repeated work.

## Claude Code

Anthropic documents remote Streamable HTTP MCP servers through `claude mcp add --transport http`.

```bash
claude mcp add --transport http seenrelay https://seenrelay.com/mcp
claude mcp list
```

Then ask Claude Code to use SeenRelay before repeating a source-backed validation. Keep your existing validation policy in place during the first pilot.

Official reference: <https://docs.anthropic.com/en/docs/claude-code/mcp>

## Cursor

Cursor supports remote Streamable HTTP MCP servers in `.cursor/mcp.json` for a project or `~/.cursor/mcp.json` globally.

**One-click install:** [Add SeenRelay to Cursor](https://cursor.com/install-mcp?name=seenrelay&config=eyJ1cmwiOiJodHRwczovL3NlZW5yZWxheS5jb20vbWNwIn0%3D)

The deeplink encodes only this remote configuration:

```json
{
  "url": "https://seenrelay.com/mcp"
}
```

Manual project/global configuration remains:

```json
{
  "mcpServers": {
    "seenrelay": {
      "url": "https://seenrelay.com/mcp"
    }
  }
}
```

Cursor can then expose the SeenRelay tools to Agent when relevant. Tool approval and enterprise allowlists remain controlled by Cursor and your organization.

Official references:

- <https://cursor.com/docs/mcp>
- <https://cursor.com/docs/mcp/install-links>

## VS Code / GitHub Copilot

VS Code supports remote HTTP MCP servers in `mcp.json`.

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

For workspace configuration, use `.vscode/mcp.json`. VS Code also supports user-profile configuration and centrally managed enterprise policies.

On macOS/Linux shells, VS Code's documented `--add-mcp` CLI flow can add the same remote server directly:

```bash
code --add-mcp '{"name":"seenrelay","type":"http","url":"https://seenrelay.com/mcp"}'
```

Official references:

- <https://code.visualstudio.com/docs/agent-customization/mcp-servers>
- <https://code.visualstudio.com/docs/agents/reference/mcp-configuration>

## ChatGPT custom MCP apps

Where the user's plan and workspace policy permit custom remote MCP apps, configure a custom app with:

```text
MCP endpoint: https://seenrelay.com/mcp
```

Use the ChatGPT Apps creation flow, provide the remote MCP endpoint, scan the tools, and review the resulting permissions before enabling the app. Full MCP availability and administrative controls vary by plan and can change; consult the current OpenAI documentation rather than assuming universal availability.

Official reference: <https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt>

## REST clients and agent frameworks

Clients that do not use MCP and do not use a reference wrapper can integrate directly through the stable REST contract:

- OpenAPI: `https://seenrelay.com/openapi.json`
- CHECK: `POST https://seenrelay.com/v1/check`
- OBSERVE: `POST https://seenrelay.com/v1/observe`

See [`QUICKSTART.md`](QUICKSTART.md) for concrete requests and [`PROTOCOL.md`](PROTOCOL.md) for deterministic fact identity.

## Recommended first deployment

Do not immediately allow SeenRelay to suppress existing validation. Start in **shadow mode**:

- call CHECK;
- record the result;
- still perform the existing validation;
- OBSERVE the independently obtained result;
- measure potential avoided work, latency and cost.

Only enable bounded reuse after the measured results and your risk policy justify it. The bounded sequence is documented in [`QUICKSTART.md`](QUICKSTART.md).

## Security note

Connecting any MCP server expands an agent's tool surface. Vendoring a client wrapper adds application code to the validation path. Review the server, endpoint, wrapper source, permissions and semantics before enabling either route. SeenRelay's public source is available in this repository, and its production surface is exercised by CI plus an isolated Preview Release Gate before promotion.
