# Why Not

Ideas already considered and deliberately rejected or narrowed:

1. **General shared agent knowledge hive** — too close to existing shared-memory/knowledge systems and far broader than the freshness primitive.
2. **Semantic preflight / Knowledge SYN** — semantic pub-sub, routing and fingerprinting prior art is dense.
3. **Page-level ink / semantic ETag** — page validators and semantic-change monitoring already exist. SeenRelay tracks source-backed facts instead.
4. **Truth oracle** — not the product; introduces stronger epistemic and liability claims that observations cannot justify.
5. **On-demand VERIFY** — would turn SeenRelay into a search/research service and create variable external costs.
6. **Human-facing SaaS suite as the product** — rejected. Humans are not the primary protocol consumer. The Control Room is intentionally a small human-only operational/security surface; it does not create a third domain operation or turn SeenRelay into a dashboard product.
7. **LLM canonicalization in the critical path** — expensive, nondeterministic and risks false fact merges.
8. **Fake/minimal A2A endpoint** — rejected. Discovery metadata must not claim a protocol interface that is not genuinely implemented. A2A 1.0 is monitored, but MCP/OpenAPI are the correct current surfaces.
9. **Blind protocol auto-upgrade** — rejected. A release tagged “new” can contain semantic or security changes that are wrong for SeenRelay. Maintenance automation may discover and prepare candidates, but production changes still require the full compatibility/security/E2E gates and explicit release approval.
10. **Synthetic marketing metrics** — rejected. The public site may expose privacy-safe aggregate operational data, but must not invent customers, savings, independence, truth confidence or validation avoided.
11. **Blind secret rotation during custody transfer** — rejected. `PRIVACY_SALT` is continuity-sensitive, and blind Hive signing rotation breaks active leases. Handoff uses make-before-break verification grace for rotatable credentials instead.
