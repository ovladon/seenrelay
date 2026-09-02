import { createHash } from 'node:crypto';

const CONTENT_ATTRIBUTE_PREFIXES = Object.freeze([
  'gen_ai.input.',
  'gen_ai.output.',
  'gen_ai.tool.call.',
  'gen_ai.tool.message.',
  'gen_ai.prompt.',
  'gen_ai.completion.'
]);

const CONTENT_ATTRIBUTE_KEYS = new Set([
  'gen_ai.input.messages',
  'gen_ai.output.messages',
  'gen_ai.tool.definitions',
  'mcp.resource.uri',
  'mcp.session.id'
]);

const USAGE_KEYS = Object.freeze({
  'gen_ai.usage.input_tokens': 'inputTokens',
  'gen_ai.usage.output_tokens': 'outputTokens',
  'gen_ai.usage.cache_read.input_tokens': 'cacheReadTokens',
  'gen_ai.usage.cache_creation.input_tokens': 'cacheWriteTokens'
});

const KNOWN_MCP_TOOL_METHODS = new Set(['tools/call']);
const KNOWN_MCP_RETRIEVAL_METHODS = new Set(['resources/read', 'resources/list', 'resources/templates/list', 'prompts/get', 'prompts/list']);

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function opaqueId(prefix, value) {
  return `${prefix}-${sha256(value)}`;
}

function fingerprint(parts) {
  const normalized = parts.filter(value => value !== undefined && value !== null && value !== '').map(String).join('\u001f');
  return normalized ? `sha256:${sha256(normalized)}` : undefined;
}

function asFiniteNonNegative(value) {
  if (typeof value === 'bigint') return value >= 0n ? Number(value) : undefined;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  return undefined;
}

function nanosToMillis(value) {
  try {
    if (typeof value === 'bigint') return Number(value / 1000000n);
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(BigInt(value) / 1000000n);
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value / 1e6;
  } catch {}
  return undefined;
}

function otlpValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (value.intValue !== undefined) return asFiniteNonNegative(value.intValue);
  if (value.doubleValue !== undefined) return asFiniteNonNegative(value.doubleValue);
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (typeof value.boolValue === 'boolean') return value.boolValue;
  return undefined;
}

function attributesMap(attributes) {
  const output = new Map();
  if (!Array.isArray(attributes)) return output;
  for (const attribute of attributes) {
    const key = typeof attribute?.key === 'string' ? attribute.key : null;
    if (!key || !attribute?.value) continue;
    const value = otlpValue(attribute.value);
    if (value !== undefined) output.set(key, value);
  }
  return output;
}

function isContentKey(key) {
  if (CONTENT_ATTRIBUTE_KEYS.has(key)) return true;
  return CONTENT_ATTRIBUTE_PREFIXES.some(prefix => key.startsWith(prefix)) && !key.startsWith('gen_ai.usage.');
}

function classify(attrs) {
  const genAiOperation = typeof attrs.get('gen_ai.operation.name') === 'string' ? attrs.get('gen_ai.operation.name') : undefined;
  if (genAiOperation === 'embeddings') return 'embedding';
  if (genAiOperation === 'execute_tool') return 'tool';
  if (genAiOperation) return 'model';

  const mcpMethod = typeof attrs.get('mcp.method.name') === 'string' ? attrs.get('mcp.method.name') : undefined;
  if (KNOWN_MCP_TOOL_METHODS.has(mcpMethod)) return 'tool';
  if (KNOWN_MCP_RETRIEVAL_METHODS.has(mcpMethod)) return 'retrieval';
  if (mcpMethod) return 'network';
  return 'other';
}

function operationCoordinate(attrs, kind) {
  return fingerprint([
    'otel-trajectory-coordinate-v1',
    kind,
    attrs.get('gen_ai.operation.name'),
    attrs.get('gen_ai.system'),
    attrs.get('gen_ai.request.model'),
    attrs.get('mcp.method.name'),
    attrs.get('rpc.system'),
    attrs.get('rpc.service'),
    attrs.get('rpc.method')
  ]);
}

function usageWork(attrs, kind) {
  const work = {};
  for (const [attributeKey, field] of Object.entries(USAGE_KEYS)) {
    const value = asFiniteNonNegative(attrs.get(attributeKey));
    if (value !== undefined) work[field] = value;
  }
  return work;
}

function usageSignature(work) {
  const usage = {};
  for (const field of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
    if (work[field] !== undefined) usage[field] = work[field];
  }
  return Object.keys(usage).length ? JSON.stringify(usage) : null;
}

function flattenOtlp(input) {
  const spans = [];
  if (Array.isArray(input?.resourceSpans)) {
    for (const resourceSpan of input.resourceSpans) {
      for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
        for (const span of scopeSpan?.spans ?? []) spans.push(span);
      }
    }
    return spans;
  }
  if (Array.isArray(input?.spans)) return input.spans;
  if (Array.isArray(input)) return input;
  throw new TypeError('OTLP input must contain resourceSpans, spans, or be an array of spans');
}

function statusOf(span) {
  const code = span?.status?.code;
  if (code === 2 || code === 'STATUS_CODE_ERROR' || code === 'ERROR') return 'error';
  return 'ok';
}

function contentAttributeCount(attributes) {
  if (!Array.isArray(attributes)) return 0;
  return attributes.reduce((count, attribute) => count + (typeof attribute?.key === 'string' && isContentKey(attribute.key) ? 1 : 0), 0);
}

function descendantsOf(spanId, children) {
  const out = [];
  const visited = new Set([spanId]);
  const stack = [...(children.get(spanId) ?? [])];
  while (stack.length) {
    const child = stack.pop();
    if (!child || visited.has(child.spanId)) continue;
    visited.add(child.spanId);
    out.push(child);
    for (const nested of children.get(child.spanId) ?? []) stack.push(nested);
  }
  return out;
}

/**
 * Import an OTLP/JSON trace into an existing ShadowTrajectoryProfiler.
 * This function is intentionally measurement-only. It never calls finishTrajectory,
 * never creates costUnits/monetaryUsd, never retains raw trace/span IDs or content,
 * and never infers task correctness, safety, or semantic equivalence.
 */
export function importOtlpTrajectory(profiler, input, options = {}) {
  if (!profiler || typeof profiler.startTrajectory !== 'function' || typeof profiler.recordOperation !== 'function') {
    throw new TypeError('profiler must implement startTrajectory and recordOperation');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');

  const rawSpans = flattenOtlp(input);
  const parsed = [];
  let invalidSpans = 0;
  let ignoredContentAttributes = 0;

  for (const span of rawSpans) {
    const traceId = typeof span?.traceId === 'string' && span.traceId ? span.traceId : null;
    const spanId = typeof span?.spanId === 'string' && span.spanId ? span.spanId : null;
    const startMs = nanosToMillis(span?.startTimeUnixNano);
    const endMs = nanosToMillis(span?.endTimeUnixNano);
    if (!traceId || !spanId || startMs === undefined || endMs === undefined || endMs < startMs) {
      invalidSpans += 1;
      continue;
    }
    const attrs = attributesMap(span.attributes);
    ignoredContentAttributes += contentAttributeCount(span.attributes);
    const kind = classify(attrs);
    parsed.push({
      traceId,
      spanId,
      parentSpanId: typeof span?.parentSpanId === 'string' && span.parentSpanId ? span.parentSpanId : null,
      startMs,
      endMs,
      status: statusOf(span),
      kind,
      coordinateFingerprint: operationCoordinate(attrs, kind),
      work: usageWork(attrs, kind)
    });
  }

  if (!parsed.length) {
    return Object.freeze({
      schema: 'seenrelay-otel-trajectory-import-v1',
      imported: false,
      trajectory_id: null,
      imported_spans: 0,
      invalid_spans: invalidSpans,
      ignored_content_attributes: ignoredContentAttributes,
      duplicate_usage_suppressed: 0,
      exact_duplicate_usage_suppressed: 0,
      ambiguous_ancestor_usage_suppressed: 0,
      aggregate_usage_is_lower_bound: false,
      raw_ids_retained: false,
      raw_content_retained: false,
      cost_units_created: false,
      trajectory_finished: false
    });
  }

  const traceIds = new Set(parsed.map(span => span.traceId));
  if (traceIds.size !== 1) throw new TypeError('importOtlpTrajectory requires exactly one trace per call');
  const spanIds = new Set();
  for (const span of parsed) {
    if (spanIds.has(span.spanId)) throw new TypeError('importOtlpTrajectory requires unique spanId values within a trace');
    spanIds.add(span.spanId);
  }
  const rawTraceId = parsed[0].traceId;
  const trajectoryId = options.trajectoryId ?? opaqueId('otel-trace', rawTraceId);
  const startedAtMs = Math.min(...parsed.map(span => span.startMs));
  const endedAtMs = Math.max(...parsed.map(span => span.endMs));

  profiler.startTrajectory({
    trajectoryId,
    workloadId: options.workloadId,
    sampleType: options.sampleType ?? 'replayed',
    baselineDefinition: 'best_native_stack',
    baselineEvidenceFingerprint: options.baselineEvidenceFingerprint,
    costUnitPolicyId: options.costUnitPolicyId,
    costUnitPolicyFingerprint: options.costUnitPolicyFingerprint,
    startedAtMs
  });

  const spanById = new Map(parsed.map(span => [span.spanId, span]));
  const children = new Map();
  for (const span of parsed) {
    if (!span.parentSpanId || !spanById.has(span.parentSpanId)) continue;
    const list = children.get(span.parentSpanId) ?? [];
    list.push(span);
    children.set(span.parentSpanId, list);
  }

  let exactDuplicateUsageSuppressed = 0;
  let ambiguousAncestorUsageSuppressed = 0;
  for (const span of parsed) {
    const signature = usageSignature(span.work);
    if (!signature) continue;
    const descendantUsage = descendantsOf(span.spanId, children)
      .map(child => usageSignature(child.work))
      .filter(Boolean);
    if (!descendantUsage.length) continue;
    const exact = descendantUsage.includes(signature);
    for (const field of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) delete span.work[field];
    if (exact) exactDuplicateUsageSuppressed += 1;
    else ambiguousAncestorUsageSuppressed += 1;
  }
  const duplicateUsageSuppressed = exactDuplicateUsageSuppressed + ambiguousAncestorUsageSuppressed;

  for (const span of parsed) {
    const parentKnown = span.parentSpanId && spanById.has(span.parentSpanId);
    profiler.recordOperation({
      trajectoryId,
      operationId: opaqueId('otel-span', span.spanId),
      parentOperationId: parentKnown ? opaqueId('otel-span', span.parentSpanId) : undefined,
      kind: span.kind,
      coordinateFingerprint: span.coordinateFingerprint,
      status: span.status,
      work: span.work,
      startedAtMs: span.startMs,
      endedAtMs: span.endMs
    });
  }

  return Object.freeze({
    schema: 'seenrelay-otel-trajectory-import-v1',
    imported: true,
    trajectory_id: trajectoryId,
    trace_fingerprint: `sha256:${sha256(rawTraceId)}`,
    imported_spans: parsed.length,
    invalid_spans: invalidSpans,
    ignored_content_attributes: ignoredContentAttributes,
    duplicate_usage_suppressed: duplicateUsageSuppressed,
    exact_duplicate_usage_suppressed: exactDuplicateUsageSuppressed,
    ambiguous_ancestor_usage_suppressed: ambiguousAncestorUsageSuppressed,
    aggregate_usage_is_lower_bound: ambiguousAncestorUsageSuppressed > 0,
    observed_start_ms: startedAtMs,
    observed_end_ms: endedAtMs,
    raw_ids_retained: false,
    raw_content_retained: false,
    cost_units_created: false,
    monetary_usd_created: false,
    trajectory_finished: false,
    interpretation: Object.freeze({
      correctness_inferred: false,
      safety_inferred: false,
      equivalence_inferred: false,
      source_span_names_retained: false,
      source_attributes_whitelist_only: true,
      usage_aggregation_policy: 'leaf-most-only',
      nested_wall_clock_durations_additive: false,
      next_step: 'CALL_FINISH_TRAJECTORY_ONLY_WITH_EXTERNAL_ACCEPTED_OUTCOME_EVIDENCE'
    })
  });
}
