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
function textResult(value: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value }; }

const handler = createMcpHandler(() => {
  const cfg = config();
  const server = new McpServer({ name: 'seenrelay', version: cfg.version });
  server.registerTool('check_fact', {
    title: 'Check Fact Freshness',
    description: 'Cost preflight before repeated paid or slow source-backed validation, especially across an agent fleet. Use before paid web search, metered scraping, browser/extraction, rate-limited APIs or multi-step validation when the caller already has a known value. If evidence is not reusable under caller policy, validate normally and OBSERVE for later runs. SeenRelay never browses or verifies externally.',
    inputSchema: CheckRequest,
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
    description: 'After the caller independently performs a source-backed validation, deposit the observed result so later runs or agents can avoid repeating the same paid or slow work when their policy permits. Never OBSERVE hearsay. Optional Ed25519 proof establishes key possession and continuity, not truth or real-world independence.',
    inputSchema: ObserveRequest,
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
