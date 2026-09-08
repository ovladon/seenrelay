# Readiness v2 boundary

Readiness v2 is a bounded public-surface diagnostic. It is not a crawler, certification, security scan, or workload-fit decision.

The executor uses exactly six fixed same-origin HTTPS GET probes: `/`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/.well-known/agent-card.json`, and `/openapi.json`. It sends no cookies or authentication, follows no redirects, performs no retries, mutates nothing, and reads at most 768 KiB in total.

The submitted value supplies only the HTTPS origin. Callers cannot add probe paths. DNS is resolved and pinned once for the audit, and all returned addresses must be public before any probe starts.

A valid OpenAPI or A2A surface is evidence of a machine contract, not proof that the advertised capability behaves correctly. MCP, agent instruction files, and payment surfaces are optional and are not universal readiness requirements.

Surface evidence cannot establish SeenRelay workload fit. SeenRelay remains a candidate only after owner-side evidence shows repeated expensive read-only validation that stronger native controls do not already solve.

The existing `/readiness/audit` v1 contract remains separate and backward compatible. The versioned `/readiness/audit/v2` route is activation-gated: requesting activation alone is insufficient, explicit operating-cost coverage is also required, and a compile-time monthly hard ceiling remains in force.
