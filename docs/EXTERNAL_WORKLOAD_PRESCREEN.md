# External workload pre-screen

This document freezes external workload candidates **before** natural-workload evidence collection. It is a research pre-screen, not benchmark evidence, not a production claim, and not evidence that shared CHECK is useful for any project named below.

The canonical evidence rules remain in [`NATURAL_WORKLOAD_GATE.md`](./NATURAL_WORKLOAD_GATE.md). A completed natural-workload screen still requires at least 100 protected calls, `sample_type: natural_workload`, the best measured non-shared baseline, authoritative shadow validation, and the existing hostile evaluator. Static repository inspection never counts toward that floor.

## Pre-screen states

- `COLLECT` — the candidate survives static eligibility checks and is worth a falsification-first natural-workload collection. This does **not** predict `USE`.
- `REJECT_BEFORE_COLLECTION` — a stronger local/private/source-native path is already evident, or the workload requires fresh authoritative validation on every request.
- `INSUFFICIENT_EVIDENCE` — the path is plausible, but shareability, freshness, recurrence, or the best-native comparison is not yet defined well enough to collect honestly.
- `FUTURE_NOT_DEPLOYED` — the interesting path is proposed or unmerged rather than a live workload.

A candidate can move only when new evidence changes one of those conditions. Negative results are retained rather than removed from this file.

## Frozen candidate set — 2026-09-12

| Workload class | External workload | Pre-screen state | Why | Best non-shared control that must win first | Evidence snapshot |
| --- | --- | --- | --- | --- | --- |
| `structured_source_reads` | T3 Code — GitHub pull-request reads | `REJECT_BEFORE_COLLECTION` | Redundant host reads were real, but the project addressed them with a summary RPC, server-side reuse/single-flight, persisted recent-read cache across restarts, and write-through mutation updates. Shared reuse is not justified without separate cross-install recurrence evidence. | Current local/server cache and persisted read cache | [`pingdotgg/t3code#9176`](https://github.com/pingdotgg/t3code/pull/9176), [`#11007`](https://github.com/pingdotgg/t3code/pull/11007), [`#11117`](https://github.com/pingdotgg/t3code/pull/11117) |
| `structured_source_reads` | Agnix — Claude release watcher | `COLLECT` | An independent project repeatedly reads public Claude release metadata and keeps a local baseline, but does not make the remote poll disappear. This is useful mainly as a hostile test of whether SeenRelay loses to GitHub-native conditional requests. | Authenticated GitHub conditional GET using `ETag` / `If-None-Match`, plus the existing local release baseline | [`agent-sh/agnix#1511`](https://github.com/agent-sh/agnix/issues/1511), [`tool-release-watch.yml`](https://github.com/agent-sh/agnix/blob/main/.github/workflows/tool-release-watch.yml), [`check-tool-releases.sh`](https://github.com/agent-sh/agnix/blob/main/scripts/check-tool-releases.sh) |
| `browser_extraction_reads` | claude-seo — repeated page rendering across SEO subagents | `REJECT_BEFORE_COLLECTION` | Several subagents can render the same URL, but they belong to one audit/orchestration boundary. Request-scoped artifact reuse or in-flight dedupe is cheaper and more authoritative than shared reuse. | Request-scoped rendered-page artifact cache / in-flight dedupe | [`AgriciDaniel/claude-seo`](https://github.com/AgriciDaniel/claude-seo) |
| `browser_extraction_reads` | groktocrawl — repeated scrape across stages | `REJECT_BEFORE_COLLECTION` | The repeated scrape occurs inside one pipeline. The appropriate optimization is to acquire a source artifact once and pass it through the stages. | Request-scoped source artifact reuse with bounded concurrency | [`groktopus/groktocrawl#623`](https://github.com/groktopus/groktocrawl/issues/623) |
| `browser_extraction_reads` | steam-inventory-tracker — nightly Firecrawl inventory/price reads | `REJECT_BEFORE_COLLECTION` | The nightly snapshot explicitly requires fresh reads and disables provider caching. Reusing an older shared observation would change the workload semantics unless freshness equivalence is independently demonstrated. | Fresh authoritative extraction; provider cache is intentionally disabled for this path | [`ericvalcik/steam-inventory-tracker#3`](https://github.com/ericvalcik/steam-inventory-tracker/issues/3) |
| `fleet_tool_validations` | Letta Code — Claude runtime/watch probes | `INSUFFICIENT_EVIDENCE` | The watcher performs expensive repeated package/runtime probes, but the evidence boundary mixes globally reproducible package/CLI state with authenticated observations that may depend on account, configuration, or backend state. Those must be separated before shared reuse can be evaluated safely. | Immutable-version package cache for global probes; caller-owned validation for account/backend-dependent probes | [`letta-ai/letta-code`](https://github.com/letta-ai/letta-code), [`claude-agent-watch.yml`](https://github.com/letta-ai/letta-code/blob/main/.github/workflows/claude-agent-watch.yml), [`runtime-probe.ts`](https://github.com/letta-ai/letta-code/blob/main/scripts/claude-watch/runtime-probe.ts) |
| `fleet_tool_validations` | Klangschalen organization GitHub Action runtime audit | `COLLECT` | This is a live daily fleet audit of public read-only action metadata. It already memoizes each `owner/repo/path@ref` within a scan, so within-run duplication is removed. Remaining recurrence is across runs and across independent auditors of the same public action refs. | Persistent per-URL `ETag` / `If-None-Match` conditional GET, plus immutable caching for full-SHA refs | [`org_action_runtime_audit.py@06fea06`](https://github.com/Klangschalen/.github/blob/06fea06db31586b8c09c02fb2518b64b56ccb20c/scripts/org_action_runtime_audit.py), [`org-action-runtime-audit.yml@06fea06`](https://github.com/Klangschalen/.github/blob/06fea06db31586b8c09c02fb2518b64b56ccb20c/.github/workflows/org-action-runtime-audit.yml) |
| `fleet_tool_validations` | feed-mcp — GitHub Action Node 24 audit | `INSUFFICIENT_EVIDENCE` | This independently validates the same class of external `action.yml` metadata and memoizes within one process, demonstrating cross-project recurrence. It is currently a user-invoked migration skill rather than a clearly recurring production workload, so it supports recurrence but does not yet qualify as the natural workload itself. | In-process memoization, then persistent conditional GET if repeated over time | [`audit.py@f5ceb21`](https://github.com/richardwooding/feed-mcp/blob/f5ceb21d2176cf0bd247e67fb1df9b96b0870771/.claude/skills/gh-actions-node24-migration/scripts/audit.py) |
| `fleet_tool_validations` | Higress — repeated `server/discover` path | `FUTURE_NOT_DEPLOYED` | The no-coalescing discovery path is interesting, but the implementation under evaluation is still an open PR. Proposed behavior is not a natural deployed workload. | Re-evaluate only after merge and deployment; measure native coalescing/cache first | [`alibaba/higress#4685`](https://github.com/alibaba/higress/pull/4685) |

## Collection plans frozen before measurement

### A. `structured_source_reads`: Agnix release watcher

This is deliberately an expected-hard case for SeenRelay rather than an expected win.

Collection unit: one naturally scheduled release-metadata validation. The fact identity must be stable and opaque; exported evidence must not contain repository names, release values, URLs, or tokens.

Before shared CHECK is compared, measure the same workload with:

1. the current local baseline state;
2. authenticated conditional GitHub requests with a persisted `ETag` and `If-None-Match`;
3. any provider-native cache already present in the execution environment.

A `304 Not Modified` is still an authoritative source-native validation and remains the baseline if it is the best non-shared path. Do not count commissioning or collector-debug runs toward the 100-call floor.

Kill criterion: if conditional GET is equal or better on either marginal cost or latency, or natural exact recurrence is too sparse, classify the completed workload `DO NOT USE` rather than changing the workload.

### B. `fleet_tool_validations`: Klangschalen action-manifest audit

Collection unit: one naturally occurring validation of one unique external `owner/repo/path@ref` manifest during the daily fleet audit. The existing within-scan memoization remains enabled.

Separate immutable and mutable identities before collection:

- full 40-character SHA refs: persistent local immutable cache is the default baseline; shared CHECK should normally have no role;
- mutable tag/branch refs: persist the source `ETag` and perform authenticated conditional GET before evaluating shared CHECK.

The workload must preserve the actual distribution of unique action refs. Do not duplicate popular refs to manufacture CHECK hits. Cross-organization recurrence may be studied only from independently occurring validations, never from synthetic fan-out.

Kill criterion: if persistent local caching for immutable refs plus source-native conditional GET for mutable refs removes the incremental cost/latency opportunity, classify the workload `DO NOT USE`.

## Browser-extraction gap

No `browser_extraction_reads` candidate in this pre-screen currently survives the local/native/freshness filter. That is a result, not a slot to fill artificially.

Do not start a three-workload natural gate until one independently defined browser/extraction workload survives pre-screening. In particular, do not weaken freshness requirements, disable a provider cache merely to create reuse, split one orchestration into fake independent callers, or manufacture repeated URLs.

## Evidence boundary

GitHub documents authenticated conditional requests as a native polling optimization: most REST endpoints return an `ETag`; an unchanged authorized request can return `304 Not Modified`, and that response does not count against the primary rate limit. For the GitHub-backed candidates above, that path must be measured before SeenRelay can claim incremental value: <https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests>.

This pre-screen does not modify runtime behavior, enable reuse, create benchmark records, or change the three-way audit verdict contract. The only admissible evidence remains evidence accepted by the existing natural-workload gate and hostile evaluator.
