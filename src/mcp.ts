import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { canonicalFact } from './canonical.js';
import { checkFact, observeFact } from './service.js';
import { config } from './config.js';
import { admitHive, finishHiveCheck, finishHiveObserve } from './hive.js';
import { assertRuntimeFactAllowed } from './runtime-guard.js';
import { classifyMcpDiscoveryRequest, recordMcpDiscoveryEvents } from './discovery.js';
import type { JsonValue as JsonValueType } from './types.js';
import { boundedRequest } from './http.js';

const JsonValue: z.ZodType<JsonValueType> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(JsonValue),
  z.record(z.string(), JsonValue)
]));
const FactLocator = z.object({
  scheme: z.enum(['json_pointer', 'element_id', 'source_key']).describe('Source-native locator type: RFC 6901-style JSON pointer, stable HTML element id, or stable source-native key.'),
  value: z.string().min(1).max(1024).describe('Source-native locator value. json_pointer values must begin with /; locator bytes are otherwise preserved.')
});
const FactDescriptor = z.object({
  subject: z.string().min(1).max(256).describe('Human-readable label; excluded from canonical fact identity.'),
  predicate: z.string().min(1).max(128).describe('Stable shared machine identifier; identity-bearing only when locator is absent.'),
  qualifiers: z.record(z.string(), JsonValue).optional().describe('Identity-bearing semantic qualifiers. Include only fields needed to distinguish otherwise identical source-backed facts.'),
  source: z.string().url().max(2048).describe('Stable credential-free absolute HTTP(S) source URL. Tracking parameters are removed; authentication or signature query parameters are rejected.'),
  locator: FactLocator.optional().describe('Stable source-native locator. Prefer this when the source exposes one.')
});
const ObserverProof = z.object({
  scheme: z.literal('ed25519-v1').describe('Observer proof contract version.'),
  public_key: z.string().min(1).max(128).describe('Raw 32-byte Ed25519 public key encoded as unpadded base64url.'),
  timestamp: z.string().min(1).max(64).describe('ISO-8601 signing time; it must fall within the configured proof-skew window.'),
  nonce: z.string().min(1).max(128).describe('16..64 random bytes encoded as unpadded base64url.'),
  signature: z.string().min(1).max(256).describe('Raw 64-byte Ed25519 signature encoded as unpadded base64url.')
});
const CheckRequest = z.object({
  fact: FactDescriptor.describe('Source-backed fact coordinate whose recent shared evidence should be checked.'),
  known_value: JsonValue.describe('Caller-known value to compare with recent observations. Mutable observed content is excluded from fact identity.'),
  max_age_seconds: z.number().int().min(1).max(604800).optional().describe('Maximum age, in seconds, of shared observations the caller is willing to consider. Omit to use the service default.')
});
const ObserveRequest = z.object({
  fact: FactDescriptor.describe('Source-backed fact coordinate for the independently obtained observation.'),
  value: JsonValue.describe('Value independently obtained by the caller. Mutable observed content is excluded from fact identity.'),
  observed_at: z.string().optional().describe('ISO-8601 time when the caller obtained the observation. Omit to use server receipt time.'),
  observer_id: z.string().min(1).max(128).optional().describe('Optional self-asserted continuity label. It is unverified unless accompanied by observer_proof.'),
  observer_proof: ObserverProof.optional().describe('Optional Ed25519 proof of key possession, continuity and payload integrity; not proof of truth or real-world independence.'),
  evidence_fingerprint: z.string().min(1).max(256).optional().describe('Optional caller-supplied fingerprint of the independently obtained evidence. SeenRelay stores it as provenance metadata and does not verify it against the source.'),
  source_validator: z.object({
    kind: z.enum(['etag', 'last_modified', 'content_hash', 'other']).describe('Type of observer-supplied source-validator metadata.'),
    value: z.string().min(1).max(512).regex(/^[^\r\n]+$/, 'source_validator.value must not contain CR or LF').describe('Observer-supplied validator value. Stored and returned only as a hint; SeenRelay does not verify it against the source.')
  }).optional().describe('Optional source-validator metadata from the independent validation. The caller decides whether a returned hint is sufficient for source confirmation.'),
  idempotency_key: z.string().min(1).max(128).optional().describe('Caller-chosen retry key for the same OBSERVE operation. Reusing it deduplicates an idempotent retry.')
});

const ToolErrorOutput = z.object({
  code: z.string().describe('Stable machine-readable service/admission error code.'),
  detail: z.string().describe('Human-readable error detail. A tool error is not evidence that the source value is unchanged.')
}).passthrough();

const CheckOutput = z.object({
  status: z.enum(['SAME_OBSERVED', 'CHANGED_OBSERVED', 'CONTESTED', 'STALE', 'UNKNOWN']).optional().describe('Decision status when CHECK succeeds. Only SAME_OBSERVED can be considered for reuse, and only under caller policy. CHANGED_OBSERVED, CONTESTED, STALE and UNKNOWN require normal authoritative validation before any OBSERVE.'),
  fact_key: z.string().optional().describe('Canonical SeenRelay fact identity for this coordinate.'),
  next_step: z.literal('VALIDATE_THEN_OBSERVE').optional().describe('Explicit cold/stale-path instruction: validate the authoritative source normally, then OBSERVE the independently obtained result.'),
  error: ToolErrorOutput.optional().describe('Present instead of a decision status when CHECK cannot be admitted or is controlled.'),
  hive: JsonValue.optional().describe('Current bounded Hive admission/lease state.'),
  useful_reuse_awards: z.number().int().min(0).optional().describe('Qualified reuse awards attributable to this CHECK under SeenRelay telemetry rules; not a truth or independence score.')
}).passthrough().describe('CHECK result. Exactly one of a decision status or an error is expected; additional evidence fields may be present.');

const ObserveOutput = z.object({
  accepted: z.boolean().optional().describe('True when a new independently obtained observation was stored. Omitted when OBSERVE cannot be admitted.'),
  deduplicated: z.boolean().optional().describe('True when an idempotent/recent duplicate was recognized and no new observation row was needed.'),
  fact_key: z.string().optional().describe('Canonical SeenRelay fact identity for this coordinate.'),
  future_check_eligible: z.boolean().optional().describe('Whether the accepted or deduplicated observation is eligible to support later CHECKs under normal freshness rules.'),
  reason: z.string().optional().describe('Deduplication reason when accepted=false and deduplicated=true.'),
  error: ToolErrorOutput.optional().describe('Present when OBSERVE cannot be admitted or is controlled. This is not a statement about source truth.'),
  hive: JsonValue.optional().describe('Current bounded Hive admission/lease state.')
}).passthrough().describe('OBSERVE result. accepted=true means a new observation was stored; deduplicated=true means the retry/recent duplicate was recognized.');

function textResult(value: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value }; }

const handler = createMcpHandler(() => {
  const cfg = config();
  const server = new McpServer(
    { name: 'seenrelay', version: cfg.version },
    {
      instructions: 'Use check_fact only before repeating a paid or slow read-only source-backed validation when the caller already has a known value. SAME_OBSERVED is recent shared evidence, not universal truth, and may be reused only if caller policy permits. CHANGED_OBSERVED, CONTESTED, STALE, UNKNOWN, or any CHECK error require normal authoritative validation. After independently validating the source, use observe_fact with the obtained value. Never turn hearsay or another SeenRelay result into an independent OBSERVE.'
    }
  );
  server.registerTool('check_fact', {
    title: 'Check Fact Freshness',
    description: 'Cost preflight before repeated paid or slow source-backed validation, especially across an agent fleet. Returns SAME_OBSERVED, CHANGED_OBSERVED, CONTESTED, STALE or UNKNOWN. Only SAME_OBSERVED can be considered for caller-policy-gated reuse; every other status requires normal authoritative validation before OBSERVE. SeenRelay never browses or verifies externally.',
    inputSchema: CheckRequest,
    outputSchema: CheckOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async (args, ctx) => {
    // Keep MCP security/order semantics identical to REST: reject invalid/credential-bearing
    // fact descriptors before any lease creation, token consumption or Hive telemetry mutation.
    canonicalFact(args.fact);
    assertRuntimeFactAllowed(args.fact);
    const admission = await admitHive(ctx.http?.req, 'check');
    if (!admission.allowed) {
      const controlled = admission.reason === 'runtime_disabled';
      const admissionLimited = admission.reason === 'admission_limited';
      return textResult({ error: {
        code: controlled ? 'SERVICE_CONTROLLED' : admissionLimited ? 'HIVE_ADMISSION_LIMITED' : 'HIVE_RATE_LIMITED',
        detail: controlled ? 'CHECK is temporarily disabled by the SeenRelay control plane.' : admissionLimited ? 'New free Hive leases from this network are temporarily limited. Reuse an existing lease or retry shortly.' : 'Free CHECK allowance is refilling.'
      }, hive: admission.state });
    }
    const result = await checkFact(args);
    const finished = await finishHiveCheck(admission, result);
    return textResult({ ...result, hive: finished.state, useful_reuse_awards: finished.usefulReuseAwards });
  });

  server.registerTool('observe_fact', {
    title: 'Contribute Fact Observation',
    description: 'After independently performing a source-backed validation, deposit the observed result for later CHECKs. Returns accepted=true when a new observation is stored or deduplicated=true for a recognized retry/recent duplicate. Never OBSERVE hearsay. Optional Ed25519 proof establishes key possession and continuity, not truth or real-world independence.',
    inputSchema: ObserveRequest,
    outputSchema: ObserveOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async (args, ctx) => {
    canonicalFact(args.fact);
    assertRuntimeFactAllowed(args.fact);
    const request = ctx.http?.req;
    const admission = await admitHive(request, 'observe');
    if (!admission.allowed) return textResult({ error: {
      code: admission.reason === 'runtime_disabled' ? 'SERVICE_CONTROLLED' : 'HIVE_ADMISSION_LIMITED',
      detail: admission.reason === 'runtime_disabled' ? 'OBSERVE is temporarily disabled by the SeenRelay control plane.' : 'New free Hive leases from this network are temporarily limited. Reuse an existing lease or retry shortly.'
    }, hive: admission.state });
    const result = await observeFact(request, args, admission.leaseId);
    const hive = await finishHiveObserve(admission, result.fact_key, result.accepted ? 'accepted' : 'deduplicated');
    return textResult({ ...result, hive });
  });
  return server;
});

export async function handleMcp(request: Request): Promise<Response> {
  const bounded = await boundedRequest(request, config().maxBodyBytes);
  if ('response' in bounded) return bounded.response;
  const safeRequest = bounded.request;
  const discoveryEvents = classifyMcpDiscoveryRequest(safeRequest);
  const response = await handler.fetch(safeRequest);
  if (response.status < 500) {
    try {
      const events = await discoveryEvents;
      if (events.length) await recordMcpDiscoveryEvents(events);
    } catch (error) {
      console.error(JSON.stringify({ event: 'mcp_discovery_metric_error', error: error instanceof Error ? error.message : 'unknown' }));
    }
  }
  return response;
}
