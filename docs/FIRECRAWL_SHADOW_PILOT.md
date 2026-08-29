# Firecrawl shadow economics pilot

This pilot measures whether a Firecrawl workload has enough repeated validation to justify an optional SeenRelay CHECK after the workload's existing non-shared controls are considered.

It is measurement tooling. It does not enable automatic reuse.

## What the pilot does

For an eligible public `firecrawl_scrape` call with a positive `maxAge`:

1. Firecrawl remains authoritative and the original call always runs.
2. The provider result is returned without waiting for SeenRelay measurement work.
3. If the pilot retained a prior result for the exact public URL and representation options, it runs a counterfactual CHECK using the prior result fingerprint.
4. It compares a hypothetical `SAME_OBSERVED` reuse with the authoritative Firecrawl result that already completed.
5. Only a result classified as independently obtained by the Firecrawl adapter may OBSERVE.
6. A Firecrawl provider-cache hit is never relabeled as an independent OBSERVE.

The CHECK is intentionally performed after the provider response and before the current result's OBSERVE. This preserves the provider call as ground truth, keeps measurement off the caller's response path, and prevents the current observation from manufacturing its own CHECK hit.

## Why Firecrawl is a useful hostile workload

Firecrawl already has provider-native caching through `maxAge`, so SeenRelay must be evaluated against that behavior rather than against forced fresh scraping.

The provider's own cache remains inside the measured baseline. The pilot records `cacheState` when available and never asks callers to disable Firecrawl caching for a favorable comparison.

Cost is expressed in Firecrawl provider-credit units, not currency. `metadata.creditsUsed` is used when the provider exposes it. If the response does not expose a credit value, the pilot marks the cost record unknown instead of inventing one. A caller that has an independently justified provider-credit fallback may supply `provider_credit_fallback_units` during evaluation; otherwise cost evaluation is rejected as incomplete.

Fixed subscription economics, included credits, auto-reload thresholds and the caller's actual monetary value per credit remain caller-specific and must be analyzed separately. A provider-credit result is not automatically an invoice-savings result.

## Usage

The verified JavaScript / TypeScript client 0.2.5 provides the MCP helper through `seenrelay/firecrawl-shadow` and the direct JavaScript SDK helper through `seenrelay/firecrawl-sdk-shadow`.

```js
import { createFirecrawlShadowPilot } from 'seenrelay/firecrawl-shadow';

const measured = createFirecrawlShadowPilot(existingFirecrawlMcpClient, {
  // Optional. Defaults to the public SeenRelay service.
  baseUrl: 'https://seenrelay.com'
});

// Existing application code continues to call Firecrawl normally.
await measured.callTool({
  name: 'firecrawl_scrape',
  arguments: {
    url: 'https://example.com/public-page',
    formats: ['markdown'],
    maxAge: 60_000
  }
});

// At a deliberate measurement boundary:
await measured.seenRelayFirecrawlShadowPilot.flush();
console.log(measured.seenRelayFirecrawlShadowPilot.report());
```

The pilot accepts only the same public/suppressible Firecrawl scrape class as the existing Firecrawl adapter. Private hosts, authentication-bearing URLs and other excluded operations remain outside public evidence.


### Direct JavaScript SDK form

```js
import { createFirecrawlSdkShadowPilot } from 'seenrelay/firecrawl-sdk-shadow';

const measured = createFirecrawlSdkShadowPilot(existingFirecrawlSdkClient, {
  maxAgeMs: 60_000
});

const result = await measured.scrape('https://example.com/public-page', {
  formats: ['markdown']
});

await measured.seenRelayFirecrawlSdkShadowPilot.flush();
console.log(measured.seenRelayFirecrawlSdkShadowPilot.report());
```

The adapter also supports legacy SDK clients exposing `scrapeUrl(url, options)`. The original SDK method always runs with the caller's original argument list and its raw result is returned unchanged. `maxAgeMs` belongs only to SeenRelay measurement policy and is not injected into the Firecrawl request. The SDK result is converted to an MCP-like envelope only inside the measurement bridge so the established Firecrawl shadow logic can be reused without creating a second semantics implementation. A measurement serialization failure after a successful Firecrawl response fails open to that response and does not become an application error.

## Hostile benchmark evaluation

Before evaluation, explicitly declare whether a qualifying local cache or source-native conditional path exists and whether it was measured:

```js
const evaluation = measured.seenRelayFirecrawlShadowPilot.evaluate({
  workload_id: 'opaque-workload-id',
  local_cache: { available: false, measured: false },
  source_native_conditional: { available: false, measured: false }
});
```

The evaluation method uses the same hostile benchmark implementation exported through `seenrelay/economics` and used by repository CI. It reports evidence only; it never enables reuse.

Do not declare a control unavailable merely because the pilot does not implement it. `baseline_definition` remains `best_existing_non_shared_path`.

If one or more provider responses do not expose `creditsUsed`, a cost evaluation requires an explicit fallback in the same Firecrawl provider-credit unit:

```js
const evaluation = measured.seenRelayFirecrawlShadowPilot.evaluate({
  workload_id: 'opaque-workload-id',
  local_cache: { available: false, measured: false },
  source_native_conditional: { available: false, measured: false },
  provider_credit_fallback_units: 1
});
```

Only use such a fallback when the consuming workload's actual Firecrawl billing/credit contract justifies it. Do not use it for self-hosted or otherwise non-credit deployments merely because public cloud documentation describes a standard credit cost.

The provider-native Firecrawl cache is always declared available and measured because the actual Firecrawl call, including its own cache behavior, is the authoritative baseline for every retained pilot record.

## Interpretation

A favorable credit result means only that, for the measured workload, policy-accepted hypothetical reuse would have avoided some Firecrawl provider calls while matching the authoritative results in the sample.

A favorable latency result requires CHECK latency to beat the measured Firecrawl baseline after the observed reuse rate is included. Provider-cache hits may be faster than SeenRelay even when SeenRelay has positive provider-credit value.

One hypothetical reuse mismatch fails the safety decision. A CHECK result that cannot be compared is incomplete rather than safe.

A sparse workload is allowed to fail. If no prior value exists, the pilot does not issue CHECK. If retained values exist but shared evidence produces no usable reuse, the resulting measurements should keep shared CHECK out of that path.

The pilot does not prove external adoption, universal Firecrawl savings, or a safe global reuse rate. Natural workload ownership and external-vs-first-party classification must be established separately from the benchmark output.
