import { tool } from 'ai';
import { z } from 'zod';
import { SeenRelayClient, reuseKnownOnSameObserved } from '../clients/typescript/dist/seenrelay.js';

// Application state owns the known value. The model does not decide whether CHECK runs.
const knownPrices = new Map([['123', 17]]);
let providerCalls = 0;

// Compatibility example: return reusable evidence so the expensive provider is not called.
const relay = new SeenRelayClient({
  fetchImpl: async (url) => {
    if (String(url).endsWith('/v1/check')) {
      return new Response(JSON.stringify({
        status: 'SAME_OBSERVED',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).endsWith('/v1/observe')) {
      return new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  },
});

async function paidPriceProvider(itemId) {
  providerCalls += 1;
  return itemId === '123' ? 18 : 0;
}

export const currentPriceTool = tool({
  description: 'Get the current price for an item from the configured provider.',
  inputSchema: z.object({
    itemId: z.string(),
  }),
  execute: async ({ itemId }) => {
    const knownValue = knownPrices.get(itemId);
    if (knownValue === undefined) {
      throw new Error('The application has no known value to revalidate for this item.');
    }

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
      validate: async () => paidPriceProvider(itemId),
    });

    knownPrices.set(itemId, result.value);
    return {
      price: result.value,
      validationPath: result.path,
    };
  },
});

// This direct execution is only a compatibility probe. In an application,
// AI SDK invokes execute after the model selects the tool.
const output = await currentPriceTool.execute({ itemId: '123' }, {});

if (output.price !== 17 || output.validationPath !== 'reused' || providerCalls !== 0) {
  throw new Error('AI SDK paid-tool preflight invariant failed');
}

console.log(JSON.stringify({ output, providerCalls }, null, 2));
