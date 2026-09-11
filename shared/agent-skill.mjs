export const SEENRELAY_SKILL_DESCRIPTION = "Find repeated expensive read-only checks in AI agent workloads and measure whether reuse is worthwhile. Start in shadow mode; preserve authoritative and stronger native controls.";

export function agentSkillMarkdown(){
return `---
name: seenrelay
description: ${SEENRELAY_SKILL_DESCRIPTION}
license: SEE LICENSE IN REPOSITORY
compatibility: Requires a project that can call HTTP/MCP or use the SeenRelay TypeScript/Python client; never use this skill to suppress mutating or destructive operations.
metadata:
  homepage: https://seenrelay.com
  service: https://seenrelay.com/service.json
  operations: CHECK,OBSERVE
---

# SeenRelay integration skill

Use this skill first to determine whether SeenRelay belongs on a repeated expensive read-only validation path. Start with measurement, preserve every authoritative call and stronger native validator, and do not enable reuse merely because exact repeats exist.

## Start from current machine facts

Before changing code, read https://seenrelay.com/service.json and https://seenrelay.com/llms.txt. Treat those current machine surfaces as authoritative for published client versions, profile IDs, protocol status and install commands. This skill intentionally avoids hard-coding a client version.

## Route to the narrowest supported Ambient adapter

Inspect the project's manifests, imports and existing tool boundary before editing code. Do not guess the framework from a directory name and do not replace its native tool lifecycle.

After installing the current published SeenRelay client, prefer the package's local machine-readable integration catalog when exported (\`getAmbientIntegrationCatalog()\` in JavaScript/TypeScript or \`ambient_integration_catalog()\` in Python). It performs no discovery network call. Then inspect the actual Ambient exports and use the narrowest adapter that the installed package exposes:
- generic JavaScript/TypeScript MCP client with \`callTool(...)\`: \`ambientMcpClient(...)\` from \`seenrelay/ambient\`;
- OpenAI Agents JavaScript MCP server: \`ambientOpenAIAgentsMcpServer(...)\`;
- Vercel AI SDK MCP tool set: \`ambientAiSdkMcpTools(...)\`;
- LangChain JavaScript MCP hooks: \`ambientLangChainMcpHooks(...)\` when exported by the installed client;
- generic Python MCP-style client with \`call_tool(...)\`: \`ambient_mcp_client(...)\` from \`seenrelay_ambient\`;
- OpenAI Agents Python MCP server: \`ambient_openai_agents_mcp_server(...)\`;
- LangChain Python \`MultiServerMCPClient\`: \`ambient_langchain_mcp_client(...)\` when exported by the installed client;
- PydanticAI toolset/MCP toolset: \`ambient_pydantic_ai_toolset(...)\` when exported by the installed client.

If the matching framework adapter is not exported by the installed client, do not copy a private/example implementation, do not write a transport interceptor, and do not emulate another framework's adapter. Use a supported generic Ambient boundary only when its call signature and semantics genuinely match; otherwise leave the path unchanged.

Do not invent an integration for Google ADK, Microsoft Agent Framework, CrewAI or another unlisted framework merely because it has tool callbacks. A future supported adapter must preserve the framework's effective arguments, result lifecycle and context partitioning without user-dependent middleware ordering.

Ambient starts as measurement, not authorization. Keep the original authoritative call enabled. Do not turn candidate tools into active reuse merely because exact repeats were observed.

## Choose the measurement lane explicitly

Use **local/Ambient shadow** first when the goal is to find exact repetition and stronger local or source-native controls. This lane can remain entirely local and may produce no hosted SeenRelay activity; that is expected and must not be treated as failed integration.

Use **shared-evidence shadow** only when the candidate has a stable source-native fact descriptor, the value is eligible to share under caller policy, and measuring shared evidence is actually relevant. Use the classic client without a \`reuse\` policy, or \`SeenRelayShadowProof\` / the Python equivalent. In this lane SeenRelay may CHECK the caller-known value, but the original authoritative validation still runs. Only after a genuinely fresh independent result may the client OBSERVE it best-effort. A CHECK result never authorizes skipping validation in shadow mode.

Do not manufacture a shared fact identity merely to exercise the relay. If the workload cannot support a deterministic shareable fact descriptor, stay on local/Ambient measurement. If shared-evidence shadow produces too little eligible repetition or no economic advantage over stronger existing controls, report that result and leave shared reuse disabled.

## Return a comparable first audit

After measurement, always return a short human-readable decision plus a machine-readable object with \`schema_version: "seenrelay-shadow-audit-v1"\`. Use the fields defined by \`docs/schemas/shadow-audit-report.schema.json\` in the SeenRelay repository: workload identity, protected-call count, exact-repeat count, stronger native-control measurements, shared-CHECK outcomes when measured, hypothetical-reuse mismatches, baseline units, SeenRelay overhead/economics, safety state, reasons and verdict.

The only verdicts are **USE / DO NOT USE / INSUFFICIENT EVIDENCE**. A negative verdict is a successful audit when stronger native controls already win, repetition is too low, the operation is unsafe to suppress, equivalence fails or economics are negative.

Do not invent data to make the report look complete. Use \`null\` for an unmeasured comparable quantity, zero only for a measured zero, and \`INSUFFICIENT EVIDENCE\` when the sample or comparison is inadequate. Keep raw values, credentials, private fact identities and source payloads out of the machine report. Return the JSON inline unless the caller explicitly requests a persistent \`seenrelay-audit.json\` artifact or the project already has a suitable generated-report convention.

## Assess readiness before modifying code

Use the SDK's local readiness planner when available:
- TypeScript/JavaScript: \`assessIntegrationReadiness(...)\`
- Python: \`assess_integration_readiness(...)\`

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
`;
}

async function sha256Text(text){const bytes=new TextEncoder().encode(text);const d=await crypto.subtle.digest('SHA-256',bytes);return `sha256:${[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}`;}
export async function agentSkillIndex(origin){const text=agentSkillMarkdown();return {$schema:'https://schemas.agentskills.io/discovery/0.2.0/schema.json',skills:[{name:'seenrelay',type:'skill-md',description:SEENRELAY_SKILL_DESCRIPTION,url:`${origin}/.well-known/agent-skills/seenrelay/SKILL.md`,digest:await sha256Text(text)}]};}
