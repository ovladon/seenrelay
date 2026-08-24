# Network Utility

SeenRelay's operating advantage is that it does not pay to discover facts. Agents contribute observations produced by work they were already doing.

For CHECK, target marginal work is one bounded database read/aggregation. OBSERVE is a bounded write path with deduplication.

The service must not introduce paid search, browser, LLM or verification calls into the fact-freshness path.

## Operational metric hierarchy

1. external machine integrations;
2. returning machine clients / retention;
3. CHECK volume by real external traffic;
4. **qualified reuse rate** = CHECKs that generated at least one qualifying cross-bucket contributor award / all CHECKs;
5. UNKNOWN rate and status distribution;
6. OBSERVE acceptance/deduplication rate;
7. latency, error rate and infrastructure cost per CHECK/OBSERVE/qualified-reuse event;
8. explicit client-reported avoided work or measured downstream savings, when available.

`qualified reuse` is directly observable. “Avoided revalidation” is an interpretation unless the client explicitly reports the skipped downstream action. Public metrics must never present inferred savings as measured savings.

A single CHECK may reward multiple contributors, but it counts as one qualified-reuse CHECK. Contributor awards and product-utility events are deliberately separate accounting concepts.

The central product question is whether repeated cross-agent reuse produces enough measurable operational utility to justify integration overhead.

Billing is disabled in the current deployment.
