# SeenRelay client integrations

Canonical remote MCP endpoint: `https://seenrelay.com/mcp`

Official MCP Registry identifier: `io.github.ovladon/seenrelay`

SeenRelay exposes exactly two domain operations through MCP: `check_fact` and `observe_fact`. Treat it as freshness infrastructure, not as a browser, search engine, fact checker, truth oracle, or shared general memory.

The integration policy is simple:

1. call `check_fact` before source-backed revalidation work that might be redundant;
2. if the result is not reusable under your own policy, perform the validation you already intended to perform;
3. call `observe_fact` only after your agent independently obtained the result for its own task.

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

Clients that do not use MCP can integrate directly through the stable REST contract:

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

Only enable bounded reuse after the measured results and your risk policy justify it. See [`PILOT.md`](PILOT.md).

## Security note

Connecting any MCP server expands an agent's tool surface. Review the server, endpoint, permissions and tool semantics before enabling it. SeenRelay's public source is available in this repository, and its production surface is exercised by CI plus an isolated Preview Release Gate before promotion.
