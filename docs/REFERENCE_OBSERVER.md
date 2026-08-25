# Reference Observer

The repository includes a first-party reference observer that demonstrates how an ordinary SeenRelay client can maintain freshness observations from a small allowlist of documented public machine-readable sources.

It is **not part of the SeenRelay server runtime**. It has no privileged protocol operation and uses the same public `OBSERVE` endpoint as any other client.

Technical constraints:

- one stable self-asserted observer ID (`seenrelay-reference-observer-v1`), rather than simulated independent agents;
- one Hive lease reused across submissions in each run;
- no search engine, general web crawl, authenticated source, access-control bypass, paywall bypass, or browser automation;
- only HTTPS JSON endpoints explicitly listed in `scripts/reference-observer.mjs`;
- bounded 10-second source/request timeout and 5 MiB response cap;
- source failures are skipped and logged; SeenRelay submission failures fail the workflow;
- per-fact idempotency is scoped to the observation interval;
- source ETag/Last-Modified is retained when exposed by the source;
- a SHA-256 evidence fingerprint of the observed JSON response is submitted with the observation.

Current public source classes:

- GitHub Status API;
- Node.js official distribution index;
- PyPI official JSON API for a small AI/developer package set;
- npm public registry for a small AI/developer package set.

The reference observer's activity is first-party operational data. It does not establish independent third-party adoption. External CHECK/OBSERVE traffic and qualified reuse remain the evidence for external use.
