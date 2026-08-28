# SeenRelay clients 0.2.0

Release tag: `clients-v0.2.0`

Client 0.2.0 is published on the public npm and PyPI registries. This release does not change the hosted SeenRelay service, database schema, Hive rules, billing state, MCP protocol surface, CHECK semantics or OBSERVE semantics.

## JavaScript / TypeScript

Version 0.2.0 adds a provider-independent local-first path for repeated read-only validation workflows:

- `seenrelay/zero-state` provides in-flight coalescing, explicit-TTL L0 reuse, source-native ETag / Last-Modified validation, optional encrypted caller-owned L1 storage and optional shared relay acceleration;
- `seenrelay/auto` provides a generic tool-dispatch adapter layer;
- `seenrelay/mcp-auto` provides bind-once MCP `callTool()` interception for explicitly allowlisted tool names;
- shared CHECK is off by default in Zero-State and is not placed on the hot path merely because SeenRelay is installed;
- completed-result TTL defaults to `0`; arbitrary freshness is never invented;
- successful results whose freshness cannot be established may be returned without being cached or contributed;
- source observation time is preserved when supplied instead of being reset to receipt time;
- intermediary cache reuse is not re-labeled as a new independent OBSERVE;
- private L1 values remain caller-owned and are not automatically sent to the public relay;
- provider-specific integrations are optional subpath adapters and cannot be imported by the provider-independent core.

The classic `SeenRelayClient` and `SeenRelayShadowProof` APIs remain available for conservative CHECK-first measurement and explicit bounded-reuse policies.

## Python

The Python package version is synchronized at 0.2.0 for the existing coupled release pipeline. Python behavior remains shadow-first in this release. JavaScript / TypeScript Zero-State parity is not claimed for Python 0.2.0.

## Optional provider adapters

Provider adapters are integrations, not dependencies of SeenRelay Core. The included Firecrawl adapter is an optional example/integration:

- the core client does not import Firecrawl code;
- no Firecrawl runtime dependency is added;
- public relay evidence is opt-in;
- provider cache hits can support local reuse but do not become new independent OBSERVE contributions.

Deleting the provider adapter does not remove L0, L1, source-native conditional validation, generic tool adapters, MCP binding or CHECK/OBSERVE support.

## Safety invariants

- exactly two SeenRelay domain operations remain: CHECK and OBSERVE;
- no browser, search, crawler or LLM truth function is added;
- caller validation remains the fallback when local/private/source-native/shared evidence cannot justify reuse;
- relay/store failures remain fail-open to the application's validation path;
- unlisted MCP tools pass through unchanged;
- generic core does not infer read-only safety from tool names, descriptions or untrusted annotations;
- raw private values are not required by the public relay;
- billing remains controlled by the hosted service and is not changed by this client release.

## Release verification

The release candidate passed the repository's required gate set. Package Validation clean-installed the built npm tarball and imported the classic client plus `shadow-proof`, `zero-state`, `auto`, `mcp-auto` and the optional provider-adapter subpath. The Python wheel was built, checked and installed in a clean environment.

PyPI 0.2.0 was published through trusted publishing. npm 0.2.0 was published after configuring the package's GitHub Actions OIDC Trusted Publisher for `ovladon/seenrelay` and `publish-clients.yml`. Public install facts are promoted to 0.2.0 only after successful registry publication and package verification.
