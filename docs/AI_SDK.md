# SeenRelay inside Vercel AI SDK tools

A model may decide whether a tool is relevant. It should not have to remember a separate freshness preflight step after making that decision.

For a paid or slow tool that revalidates a source-backed value the application already knows, place SeenRelay inside the tool's `execute` function. The AI SDK still handles tool selection normally; once the tool executes, `CHECK` runs deterministically before the expensive provider path.

This keeps the responsibilities separate:

- AI SDK decides which tool the model calls.
- Application code defines the fact identity and known value.
- SeenRelay reports recent observation evidence through `CHECK`.
- Caller policy decides whether that evidence is reusable.
- The original provider runs whenever validation is still required.
- `OBSERVE` follows only a successful independent validation.

## Pattern

The current AI SDK uses `tool({ inputSchema, execute })`. SeenRelay's compatibility workflow verifies this integration against the pinned `ai` package used by the example without adding AI SDK to the SeenRelay runtime package.

```js
import { tool } from 'ai';
import { z } from 'zod';
import {
  SeenRelayClient,
  reuseKnownOnSameObserved,
} from 'seenrelay';

const relay = new SeenRelayClient({ clientHint: 'my-agent-fleet' });

export const currentPrice = tool({
  description: 'Get the current price for an item.',
  inputSchema: z.object({ itemId: z.string() }),

  execute: async ({ itemId }) => {
    // Read this from application state, not from model instructions.
    const knownValue = await loadKnownPrice(itemId);

    const result = await relay.guardDetailed({
      fact: {
        subject: `Item ${itemId} price`,
        predicate: 'price.current',
        source: `https://merchant.example/item/${encodeURIComponent(itemId)}`,
        locator: { scheme: 'source_key', value: 'price' },
      },
      knownValue,
      maxAgeSeconds: 300,
      reuse: reuseKnownOnSameObserved,

      // Existing expensive provider path. SeenRelay does not replace it.
      validate: async () => callPaidPriceProvider(itemId),
    });

    return {
      price: result.value,
      validationPath: result.path,
    };
  },
});
```

If caller policy accepts `SAME_OBSERVED`, the provider function is never invoked. If evidence is unknown, stale, changed, contested, unavailable, or rejected by caller policy, the existing provider path runs normally.

## Why this is deterministic

SeenRelay is inside `execute`; it is not presented to the model as another optional tool. The model can choose whether it needs `currentPrice`, but it cannot choose a code path inside that tool that silently omits the configured preflight.

This pattern is useful for search, extraction, browser automation, rate-limited APIs and other tools where the application already has a specific source-backed value and is about to spend meaningful time or provider capacity checking it again.

It is not intended for open-ended research calls where there is no stable fact identity or known value to revalidate.

## Start in shadow mode

For a new integration, omit the `reuse` callback first. The tool will still run its original provider every time while SeenRelay measures CHECK outcomes. Once the application has enough evidence about reuse frequency, latency and policy safety, it can enable a bounded reuse function explicitly.

This is particularly important for agent tools: tool selection and freshness policy are separate decisions. The model may select the right tool, while application code remains responsible for deciding whether a previous observation is sufficiently recent for the current request.

## Failure behavior

SeenRelay failure remains fail-open to the original tool provider. Provider errors remain provider/application errors. Reuse does not emit a new independent OBSERVE. Successful independent validation may OBSERVE the result through the existing wrapper behavior.
