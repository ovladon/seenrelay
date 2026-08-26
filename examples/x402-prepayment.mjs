import { SeenRelayClient, reuseKnownOnSameObserved } from '../clients/typescript/dist/seenrelay.js';

// This example uses a local paid-call spy instead of a real wallet so it can run
// without funds or x402 credentials. Replace paidValidation() with your x402-paid
// fetch/tool call after configuring the official x402 client for your wallet/network.

let paymentAttempts = 0;

async function paidValidation() {
  paymentAttempts += 1;
  return 17;
}

const responses = [
  { status: 'UNKNOWN', next_step: 'VALIDATE_THEN_OBSERVE' },
  { status: 'SAME_OBSERVED', latest_observed_value: 17 },
];

const fetchImpl = async (url) => {
  if (String(url).endsWith('/v1/check')) {
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (String(url).endsWith('/v1/observe')) {
    return new Response(JSON.stringify({ accepted: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error(`Unexpected URL: ${url}`);
};

const relay = new SeenRelayClient({ fetchImpl });
const validatePrice = relay.protectValidation({
  fact: {
    subject: 'Example item price',
    predicate: 'price.current',
    source: 'https://merchant.example/item/123',
    locator: { scheme: 'source_key', value: 'price' },
  },
  validate: paidValidation,
  reuse: reuseKnownOnSameObserved,
  maxAgeSeconds: 300,
});

const first = await validatePrice(17);  // UNKNOWN -> paid validation -> OBSERVE
const second = await validatePrice(17); // SAME_OBSERVED -> reuse -> no paid call

console.log(JSON.stringify({ first, second, paymentAttempts }, null, 2));