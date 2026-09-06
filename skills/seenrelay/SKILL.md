---
name: seenrelay
description: Integrate SeenRelay into repeated expensive read-only validation across agent fleets. Start in shadow mode, preserve stronger local/source-native controls, and prefer caller-owned private reuse before optional shared evidence.
license: SEE LICENSE IN REPOSITORY
compatibility: Requires a project that can call HTTP/MCP or use the SeenRelay TypeScript/Python client; never use this skill to suppress mutating or destructive operations.
metadata:
  homepage: https://seenrelay.com
  service: https://seenrelay.com/service.json
  operations: CHECK,OBSERVE
---

# SeenRelay integration skill

Use this skill to add SeenRelay as one small distributed-observation primitive. Do not redesign an application around SeenRelay and do not replace a stronger native validator.

## Start from current machine facts

Before changing code, read https://seenrelay.com/service.json and https://seenrelay.com/llms.txt. Treat those current machine surfaces as authoritative for published client versions, profile IDs, protocol status and install commands. This skill intentionally avoids hard-coding a client version.

## Route to the narrowest supported Ambient adapter

Inspect the project's manifests, imports and existing tool boundary before editing code. Do not guess the framework from a directory name and do not replace its native tool lifecycle.

After installing the current published SeenRelay client, prefer the package's local machine-readable integration catalog when exported (`getAmbientIntegrationCatalog()` in JavaScript/TypeScript or `ambient_integration_catalog()` in Python). It performs no discovery network call. Then inspect the actual Ambient exports and use the narrowest adapter that the installed package exposes:
- generic JavaScript/TypeScript MCP client with `callTool(...)`: `ambientMcpClient(...)` from `seenrelay/ambient`;
- OpenAI Agents JavaScript MCP server: `ambientOpenAIAgentsMcpServer(...)`;
- Vercel AI SDK MCP tool set: `ambientAiSdkMcpTools(...)`;
- LangChain JavaScript MCP hooks: `ambientLangChainMcpHooks(...)` when exported by the installed client;
- generic Python MCP-style client with `call_tool(...)`: `ambient_mcp_client(...)` from `seenrelay_ambient`;
- OpenAI Agents Python MCP server: `ambient_openai_agents_mcp_server(...)`;
- LangChain Python `MultiServerMCPClient`: `ambient_langchain_mcp_client(...)` when exported by the installed client;
- PydanticAI toolset/MCP toolset: `ambient_pydantic_ai_toolset(...)` when exported by the installed client.

If the matching framework adapter is not exported by the installed client, do not copy a private/example implementation, do not write a transport interceptor, and do not emulate another framework's adapter. Use a supported generic Ambient boundary only when its call signature and semantics genuinely match; otherwise leave the path unchanged.

Do not invent an integration for Google ADK, Microsoft Agent Framework, CrewAI or another unlisted framework merely because it has tool callbacks. A future supported adapter must preserve the framework's effective arguments, result lifecycle and context partitioning without user-dependent middleware ordering.

Ambient starts as measurement, not authorization. Keep the original authoritative call enabled. Do not turn candidate tools into active reuse merely because exact repeats were observed.

## Assess readiness before modifying code

Use the SDK's local readiness planner when available:
- TypeScript/JavaScript: `assessIntegrationReadiness(...)`
- Python: `assess_integration_readiness(...)`

Supply explicit facts about the call path: operation kind, authoritative fallback, deterministic fact identity, stronger native validator, share eligibility, retained caller value and whether a fresh independent observation exists. The planner is conservative and never authorizes reuse, sharing, truth, or suppression of mutations. Human/caller policy remains authoritative.

## Decide whether SeenRelay belongs on the path

For an eligible read-only validation, prefer this order:
1. exact local/in-flight reuse;
2. caller-owned private reuse;
3. source-native validation such as ETag / Last-Modified or a stronger authoritative mechanism;
4. optional SeenRelay CHECK when compatible observation evidence can help;
5. original authoritative validation;
6. OBSERVE only after a fresh independent observation.

If a cheaper or stronger local/source-native mechanism answers the same question, keep SeenRelay out of the way.

## What CHECK means

CHECK compares a caller-known value with recent observations for the same deterministic fact and context identity. It may return evidence consistent with the same value, a changed value, conflicting values, or no usable recent evidence.

CHECK is not a truth verdict and does not return another caller's raw result. Reuse always means reusing the caller's own retained result under caller policy.

## What OBSERVE means

OBSERVE is only for a value obtained from a fresh independent observation during the caller's normal work. Never relabel a provider cache hit, private cache hit, SeenRelay reuse, or another observer's result as a fresh independent OBSERVE.

Do not submit credentials, secrets, private keys, signed URLs, unnecessary sensitive personal data, or identifiers that local share policy does not explicitly allow.

## One primitive, multiple local profiles

Prefer the SDK's local capability catalog instead of inventing profile semantics. Current machine facts may expose profiles for MCP discovery/tool surfaces, runtime state, A2A Agent Cards, registry-to-live corroboration and pinned OpenTelemetry GenAI tool-definition metadata.

Profiles describe what was observed. They do not add hosted operations, authorize reuse, certify truth or prove distinct real-world actors.

## Integration behavior

When modifying an existing project:
- find and preserve the existing authoritative validation path first;
- preserve its arguments and raw result;
- make SeenRelay failure fail open to that existing path;
- keep shared CHECK optional unless explicit policy enables it;
- preserve local/private/source-native mechanisms ahead of shared CHECK;
- use deterministic fact and context identities;
- keep legitimate tenant/auth/client/protocol differences in context so they do not become false conflicts;
- treat Ed25519 proof as key possession/continuity only, not legal identity or actor independence;
- do not add a third SeenRelay domain operation;
- do not add hidden telemetry merely to count adoption.

## Verify the integration

At minimum test:
- first user / empty shared network still receives local or fleet value;
- stronger native path wins when it answers the same question;
- mutating/destructive operations are never suppressed;
- relay failure falls back to authoritative validation;
- reused/cache results never become independent OBSERVE;
- legitimate context differences do not create false conflict;
- conflicting same-context observations block automatic reuse;
- no raw result or sensitive payload is sent unless explicitly allowed.
