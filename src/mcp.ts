import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { canonicalFact } from './canonical.js';
import { checkFact, observeFact } from './service.js';
import { config } from './config.js';
import { admitHive, finishHiveCheck, finishHiveObserve } from './hive.js';
import { assertRuntimeFactAllowed } from './runtime-guard.js';
import type { JsonValue as JsonValueType } from './types.js';

const JsonValue: z.ZodType<JsonValueType> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(JsonValue),
  z.record(z.string(), JsonValue)
]));
const FactLocator = z.object({ scheme: z.enum(['json_pointer', 'element_id', 'source_key']), value: z.string().min(1).max(1024) });
const FactDescriptor = z.object({
  subject: z.string().min(1).max(256).describe('Human-readable label; excluded from canonical fact identity.'),
  predicate: z.string().min(1).max(128).describe('Stable shared machine identifier; identity-bearing only when locator is absent.'),
  qualifiers: z.record(z.string(), JsonValue).optional(), source: z.string().url().max(2048),
  locator: FactLocator.optional().describe('Stable source-native locator. Prefer this when the source exposes one.')
});
const ObserverProof = z.object({ scheme: z.literal('ed25519-v1'), public_key: z.string().min(1).max(128), timestamp: z.string().min(1).max(64), nonce: z.string().min(1).max(128), signature: z.string().min(1).max(256) });
const CheckRequest = z.object({ fact: FactDescriptor, known_value: JsonValue, max_age_seconds: z.number().int().min(1).max(604800).optional() });
const ObserveRequest = z.object({
  fact: FactDescriptor, value: JsonValue, observed_at: z.string().optional(), observer_id: z.string().min(1).max(128).optional(), observer_proof: ObserverProof.optional(),
  evidence_fingerprint: z.string().min(1).max(256).optional(),
  source_validator: z.object({ kind: z.enum(['etag', 'last_modified', 'content_hash', 'other']), value: z.string().min(1).max(512) }).optional(),
  idempotency_key: z.string().min(1).max(128).optional()
});
function textResult(value: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value }; }

const handler = createMcpHandler(() => {
  const cfg = config();
  const server = new McpServer({ name: 'seenrelay', version: cfg.version });
  server.registerTool('check_fact', {
    title: 'Check Fact Freshness',
    description: 'Free-bootstrap CHECK for recently observed source-backed values. A frictionless Hive Lease controls abuse and rewards useful contributors; SeenRelay never browses or verifies externally.',
    inputSchema: CheckRequest,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async (args, ctx) => {
    // Keep MCP security/order semantics identical to REST: reject invalid/credential-bearing
    // fact descriptors before any lease creation, token consumption or Hive telemetry mutation.
    canonicalFact(args.fact);
    assertRuntimeFactAllowed(args.fact);
    const admission = await admitHive(ctx.http?.req, 'check');
    if (!admission.allowed) return textResult({ error: { code: admission.reason === 'runtime_disabled' ? 'SERVICE_CONTROLLED' : 'HIVE_RATE_LIMITED', detail: admission.reason === 'runtime_disabled' ? 'CHECK is temporarily disabled by the SeenRelay control plane.' : 'Free CHECK allowance is refilling.' }, hive: admission.state });
    const result = await checkFact(args);
    const finished = await finishHiveCheck(admission, result);
    return textResult({ ...result, hive: finished.state, useful_reuse_awards: finished.usefulReuseAwards });
  });

  server.registerTool('observe_fact', {
    title: 'Contribute Fact Observation',
    description: 'Deposit an independently obtained source-backed observation. OBSERVE is free; contribution score increases only if a different operational client later reuses the observation. Optional Ed25519 proof establishes key possession and continuity, not truth or real-world independence.',
    inputSchema: ObserveRequest,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async (args, ctx) => {
    canonicalFact(args.fact);
    assertRuntimeFactAllowed(args.fact);
    const request = ctx.http?.req;
    const admission = await admitHive(request, 'observe');
    if (!admission.allowed) return textResult({ error: { code: 'SERVICE_CONTROLLED', detail: 'OBSERVE is temporarily disabled by the SeenRelay control plane.' }, hive: admission.state });
    const result = await observeFact(request, args, admission.leaseId);
    const hive = await finishHiveObserve(admission, result.fact_key, result.accepted ? 'accepted' : 'deduplicated');
    return textResult({ ...result, hive });
  });
  return server;
});

export async function handleMcp(request: Request): Promise<Response> { return handler.fetch(request); }
