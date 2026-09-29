# SeenRelay commercial pilot pipeline

Updated: 2026-09-29

Purpose: convert public evidence of repeated expensive read-only execution into measured pilots without spamming maintainers or recommending SeenRelay where a simpler native control wins.

## Classification

- **PILOT** — public evidence plausibly matches SeenRelay's exact read-only cross-worker / cross-process problem and a measured pilot could add information.
- **NATIVE_CONTROL_FIRST** — the reported problem is real, but a simpler local/framework/provider-native control is already the better first remedy.
- **NO_FIT / NEGATIVE** — natural recurrence, economics or safety do not justify advancing the workload.
- **PATTERN_SOURCE_ONLY** — useful external evidence for reproducing a failure shape, but not a customer/prospect claim.

## Outreach rules

1. Never comment merely to advertise SeenRelay.
2. Lead with a technically useful discriminator or measurement.
3. State when local single-flight, cache, batching, device-native state or another native control should win.
4. Never claim a customer saving from controlled first-party evidence.
5. Do not repeat outreach on the same issue unless a maintainer responds or new evidence materially changes the recommendation.
6. Prefer a sanitized trace / free shadow audit over asking maintainers to install active coordination.
7. One public issue = one accountable SeenRelay contact record.

## Active pipeline

| Target | Public evidence | Classification | SeenRelay status | Outreach |
| --- | --- | --- | --- | --- |
| different-ai/openwork #3814 | 100+ duplicate `browser_eval` executions in rapid parallel bursts; issue explicitly proposes 100 identical submissions -> 1 real execution + 99 joins | **PILOT** | Strongest current public lead. Key unresolved discriminator is whether duplicate starts cross executor/process boundaries. | Contacted once with native-single-flight-first diagnostic and bounded 18->9 Firecrawl evidence. Do not post again without response/new evidence. |
| NousResearch/hermes-agent #2918 | repeated web search/extract calls | **NATIVE_CONTROL_FIRST** | Hermes merged tool-local cache: 20-minute TTL; in-process single-flight for search; disk cache across processes for extract. SeenRelay should stay out unless residual exact cross-process work is later demonstrated. | No SeenRelay outreach needed. |
| kirodotdev/KiroCrew #14237 | 1,387 `HEAD /api/file-read` records for 297 paths; bursts 16-119; many repeats and failures | **NATIVE_CONTROL_FIRST** | Maintainers confirmed four local probe sites; existing module-level cache/in-flight dedupe can absorb most of the waste, plus input filtering/batching. | No SeenRelay pitch. Re-evaluate only if a paid/remote residual remains after local fix. |
| mlx-community / OptiQ public trace corpus | 866 sessions; 437 search-query calls with 0 within-session exact or conservative-normalized repeats; only 2 extra exact URL repeats across 204 fetches | **NO_FIT / NEGATIVE** | Natural trace census does not establish a SeenRelay savings candidate. | No outreach. Preserve as falsification evidence. |
| langchain-ai/langgraph #7417 | externally reported cross-worker duplicate/retry failure shape used to design a bounded Firecrawl reproduction | **PATTERN_SOURCE_ONLY** | Useful mechanics source; not an independent customer trace and thread is crowded with framework pitches. | No additional outreach. |
| manaflow-ai/cmux #13325 | explicit programme to remove repeated work from Cloud/build fleet; native shared reads and exact compiled-product reuse already being implemented | **NATIVE_CONTROL_FIRST** | Good market evidence that repeated work is valuable, but current programme already owns the relevant native controls. | No pitch unless a residual cross-service paid-call gap is documented. |
| firecrawl/firecrawl #3552 | ~900 credits consumed across 15 failed SPA agent runs with zero useful output | **NO_FIT / PROVIDER-INTERNAL** | Serious cost pain, but the waste is inside one Firecrawl agent execution. Caller-boundary SeenRelay cannot claim to suppress Firecrawl's internal navigation/model steps. | No pitch. Use as market evidence for agent cost pain only. |
| apify/n8n-nodes-apify #48 | one n8n execution with 3 items produced 9 separately billed Actor runs because non-idempotent POST start was retried | **NO_FIT / MUTATION** | Direct billed-duplicate pain, but actor-run creation is non-idempotent state creation. Generic result sharing/suppression is unsafe; idempotency/retry semantics belong in the native integration. | No pitch. |
| browserbase/stagehand #2239 | filesystem cache cannot share actions across distributed instances/CI, causing redundant LLM calls and increased costs | **NATIVE_CONTROL_FIRST** | Strong cross-instance cost signal, but Stagehand already has a cache architecture and the open proposal is a native distributed Valkey backend. | No pitch unless residual paid read-only work remains after native distributed cache. |

## Current commercial target

The first paid pilot should satisfy all of:

- expensive or capacity-constrained provider work;
- exact deterministic read-only identity;
- natural overlap in real traffic;
- overlap crosses a boundary not already solved by request-local memoization;
- no equivalent native/source/provider cache already dominates;
- owner can provide sanitized traces or run the free audit;
- actual follower reuse can be metered after activation.

Best current candidate: **OpenWork #3814**, pending evidence that the duplicate execution crosses a process/executor boundary.

## Partner lane

A second path to revenue is observability products that already detect repeated tool calls but do not safely coordinate execution. A useful partner must satisfy:

- already owns agent traces / cost attribution;
- can identify same-tool + same-arguments or equivalent execution signatures;
- does not already provide distributed exact in-flight coalescing with safety policy;
- benefits commercially from helping customers reduce downstream provider spend.

Potential public-market examples to investigate before outreach: The Context Company, PageBolt/Custodia-style agent cost audit tooling, and broader agent observability vendors. Partnership claim must remain: **they detect; SeenRelay can measure and coordinate eligible exact residual work** — never imply an existing integration without agreement.

## Next search lane

Search only for public issues containing at least two of:

- duplicate / repeated exact tool, browser, search, extraction or validation calls;
- provider credits / paid API / rate limit / concurrency ceiling;
- multiple workers/processes/agents;
- explicit same-call or same-key identity;
- absence of an already adequate native single-flight/cache.

Reject local UI polling, cheap one-off HTTP, mutation-heavy calls and issues whose maintainers already implemented the correct native cache.
