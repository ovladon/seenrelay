# External OptiQ web-search repeat census — 2026-09-29

This document preserves a negative external trace result. It is retained because the purpose of the SeenRelay evidence program is to find where repeated validation actually exists, not to manufacture a favorable workload.

## Source

- Dataset: `mlx-community/optiq-lab-traces`
- License: CC BY 4.0
- Exact revision: `f0e247006971ebf7d844a4f3ce59f4544aa46f56`
- Parsed session files: 866
- Modes: 261 chat, 605 deep research
- Evidence class: external public trace characterization
- SeenRelay benchmark run: https://github.com/ovladon/seenrelay/actions/runs/36565607647
- Artifact SHA256: `335ba1bf729b1ad4b2f6d653b45d56fbfc35654c04156c7b5625aaeedc26767b`

The census makes no provider calls. It reads the public trace records and extracts recorded `web_search` tool arguments.

## Frozen comparison

Queries are compared in two ways only:

1. exact string equality;
2. deterministic lexical normalization: Unicode NFKC, lowercase and whitespace collapse.

No embeddings, semantic similarity, fuzzy matching or query rewriting are used.

URL-mode `web_search` calls are compared by exact URL string.

## Result

The 866-session corpus contains 641 recorded `web_search` tool calls:

| Recorded operation | Calls | Within-session repeat result |
| --- | ---: | --- |
| Search query | 437 | 0 exact extra calls; 0 normalized extra calls |
| URL fetch | 204 | 2 exact extra calls across 2 sessions |
| All `web_search` calls | 641 | no same-assistant-message exact duplicates |

The two within-session URL repeats were sequential cross-message repeats, not simultaneous same-message fan-out.

Across the entire corpus, only three exact query strings recur in more than one session:

- `current federal funds rate target range Federal Reserve`
- `current gold price per ounce today`
- `USD to JPY exchange rate today`

Two exact URLs recur across different sessions. Cross-session recurrence is descriptive only: the trace does not establish a shared freshness/trust boundary between those sessions.

## Economics

No dollar-savings claim is possible here.

The source workload's `web_search` path uses DuckDuckGo without an API key, and the trace does not expose a marginal paid-search price. Therefore:

- observed paid provider cost: **unknown / null**
- dollar savings: **null**
- net savings: **null**

## Decision

For exact repeated search-query suppression, this corpus is a **negative candidate**: 437 recorded query calls produced zero within-session exact or conservatively normalized repeats.

The two repeated URL fetches are too sparse to justify an additional coordination layer from this evidence alone. If they occur in one executor process, local single-flight/cache is the first control. The trace has no executor/process identity and therefore does not prove distributed fleet overlap.

This result does not say that web-search workloads in general lack repetition. It says that this independently published, pinned 866-session OptiQ corpus does not provide the natural recurrence needed to advance SeenRelay for this workload.

## Claim ceiling

This result is not:

- a SeenRelay customer workload;
- a customer ROI measurement;
- an active SeenRelay coordination test;
- evidence that cross-session results are fresh-equivalent or shareable;
- evidence that a distributed relay beats local/native controls.

A future web-search candidate must bring a different natural workload with materially higher exact recurrence, explicit marginal cost or constrained capacity, and a clear executor/freshness identity.