import fs from 'node:fs/promises';
import { analyzeFleetTrace, fleetTraceSchemaVersion } from './fleet-trace-census-lib.mjs';

const HASH_RE = /^sha256:[0-9a-f]{64}$/i;
const REQUIRED_POLICY_ATTRS = [
  'seenrelay.side_effect_class',
  'seenrelay.exact_single_answer_shareable',
  'seenrelay.independent_samples_required'
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function otlpValue(value) {
  if (!isObject(value)) return value;
  if ('stringValue' in value) return value.stringValue;
  if ('boolValue' in value) return value.boolValue;
  if ('intValue' in value) {
    const n = Number(value.intValue);
    return Number.isSafeInteger(n) ? n : String(value.intValue);
  }
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('bytesValue' in value) return value.bytesValue;
  if (value.arrayValue?.values) return value.arrayValue.values.map(otlpValue);
  if (value.kvlistValue?.values) return attributesObject(value.kvlistValue.values);
  return undefined;
}

function attributesObject(attributes) {
  const out = {};
  for (const item of Array.isArray(attributes) ? attributes : []) {
    if (!item || typeof item.key !== 'string') continue;
    out[item.key] = otlpValue(item.value);
  }
  return out;
}

function parseMs(nano, field) {
  if (nano === undefined || nano === null || nano === '') {
    throw new Error(`${field} missing`);
  }
  let value;
  try {
    value = BigInt(nano);
  } catch {
    throw new Error(`${field} must be an integer nanosecond timestamp`);
  }
  if (value < 0n) throw new Error(`${field} must be non-negative`);
  const ms = value / 1_000_000n;
  if (ms > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${field} exceeds safe millisecond range`);
  }
  return Number(ms);
}

function explicitBoolean(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function explicitNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function statusIsError(status) {
  const code = status?.code;
  return code === 2 || code === 'STATUS_CODE_ERROR' || code === 'ERROR';
}

function workerIdFor(resourceAttrs, spanAttrs, resourceIndex) {
  const explicit = spanAttrs['seenrelay.worker_id'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const instance = resourceAttrs['service.instance.id'];
  if (typeof instance === 'string' && instance.trim()) return `service-instance:${instance.trim()}`;

  const host = resourceAttrs['host.id'] ?? resourceAttrs['host.name'];
  const pid = resourceAttrs['process.pid'];
  if (host !== undefined || pid !== undefined) {
    return `host-process:${String(host ?? 'unknown')}:${String(pid ?? 'unknown')}`;
  }

  return `otel-resource:${resourceIndex}`;
}

function flattenOtlpSpans(document) {
  if (!isObject(document)) throw new Error('OTLP input must be a JSON object');

  const resourceSpans = Array.isArray(document.resourceSpans)
    ? document.resourceSpans
    : Array.isArray(document.resource_spans)
      ? document.resource_spans
      : null;

  if (!resourceSpans) {
    throw new Error('OTLP input must contain resourceSpans');
  }

  const rows = [];
  resourceSpans.forEach((resourceSpan, resourceIndex) => {
    const resourceAttrs = attributesObject(resourceSpan?.resource?.attributes);
    const scopeSpans = Array.isArray(resourceSpan?.scopeSpans)
      ? resourceSpan.scopeSpans
      : Array.isArray(resourceSpan?.scope_spans)
        ? resourceSpan.scope_spans
        : [];

    scopeSpans.forEach((scopeSpan) => {
      const spans = Array.isArray(scopeSpan?.spans) ? scopeSpan.spans : [];
      for (const span of spans) rows.push({ span, resourceAttrs, resourceIndex });
    });
  });
  return rows;
}

export function analyzeOtelFleetTrace(document) {
  const rows = flattenOtlpSpans(document);
  const events = [];
  const stats = {
    input_spans: rows.length,
    spans_with_seenrelay_coordinate: 0,
    spans_with_complete_seenrelay_policy: 0,
    spans_admitted_to_census: 0,
    spans_skipped_missing_coordinate: 0,
    spans_skipped_missing_policy: 0,
    spans_skipped_invalid_coordinate: 0,
    spans_without_explicit_success: 0
  };

  rows.forEach(({ span, resourceAttrs, resourceIndex }, index) => {
    const attrs = attributesObject(span?.attributes);
    const coordinateHash = attrs['seenrelay.coordinate_hash'];

    if (coordinateHash === undefined) {
      stats.spans_skipped_missing_coordinate += 1;
      return;
    }
    stats.spans_with_seenrelay_coordinate += 1;

    if (typeof coordinateHash !== 'string' || !HASH_RE.test(coordinateHash)) {
      stats.spans_skipped_invalid_coordinate += 1;
      return;
    }

    const missingPolicy = REQUIRED_POLICY_ATTRS.some((key) => attrs[key] === undefined);
    if (missingPolicy) {
      stats.spans_skipped_missing_policy += 1;
      return;
    }
    stats.spans_with_complete_seenrelay_policy += 1;

    const exact = explicitBoolean(attrs['seenrelay.exact_single_answer_shareable']);
    const independent = explicitBoolean(attrs['seenrelay.independent_samples_required']);
    const nativeCache = attrs['seenrelay.native_exact_cache_zero_cost'] === undefined
      ? false
      : explicitBoolean(attrs['seenrelay.native_exact_cache_zero_cost']);

    if (exact === undefined || independent === undefined || nativeCache === undefined) {
      stats.spans_skipped_missing_policy += 1;
      return;
    }

    const explicitOutcome = attrs['seenrelay.outcome'];
    const outcome = explicitOutcome === 'success' || explicitOutcome === 'error' || explicitOutcome === 'unknown'
      ? explicitOutcome
      : statusIsError(span?.status)
        ? 'error'
        : 'unknown';
    if (outcome !== 'success') stats.spans_without_explicit_success += 1;

    const startedAtMs = parseMs(
      span.startTimeUnixNano ?? span.start_time_unix_nano,
      `span ${index + 1} startTimeUnixNano`
    );
    const endedAtMs = parseMs(
      span.endTimeUnixNano ?? span.end_time_unix_nano,
      `span ${index + 1} endTimeUnixNano`
    );
    if (endedAtMs <= startedAtMs) {
      throw new Error(`span ${index + 1}: end time must be after start time`);
    }

    const marginalCostUsd = explicitNumber(attrs['seenrelay.marginal_cost_usd']);
    const providerUnits = explicitNumber(attrs['seenrelay.provider_units']);
    const costProvenance = attrs['seenrelay.cost_provenance'];
    const providerUnitLabel = attrs['seenrelay.provider_unit_label'];

    const event = {
      schema_version: fleetTraceSchemaVersion,
      call_id: typeof span.spanId === 'string' && span.spanId
        ? span.spanId
        : typeof span.span_id === 'string' && span.span_id
          ? span.span_id
          : `otel-span-${index + 1}`,
      worker_id: workerIdFor(resourceAttrs, attrs, resourceIndex),
      clock_domain: typeof attrs['seenrelay.clock_domain'] === 'string' && attrs['seenrelay.clock_domain'].trim()
        ? attrs['seenrelay.clock_domain'].trim()
        : 'otel-unix-epoch',
      coordinate_hash: coordinateHash,
      started_at_ms: startedAtMs,
      ended_at_ms: endedAtMs,
      side_effect_class: attrs['seenrelay.side_effect_class'],
      exact_single_answer_shareable: exact,
      independent_samples_required: independent,
      native_exact_cache_zero_cost: nativeCache,
      outcome
    };

    if (marginalCostUsd !== undefined && typeof costProvenance === 'string' && costProvenance.trim()) {
      event.marginal_cost_usd = marginalCostUsd;
      event.cost_provenance = costProvenance.trim();
    }
    if (
      providerUnits !== undefined &&
      typeof providerUnitLabel === 'string' && providerUnitLabel.trim() &&
      typeof costProvenance === 'string' && costProvenance.trim()
    ) {
      event.provider_units = providerUnits;
      event.provider_unit_label = providerUnitLabel.trim();
      event.cost_provenance = costProvenance.trim();
    }

    events.push(event);
    stats.spans_admitted_to_census += 1;
  });

  const census = analyzeFleetTrace(events);
  return {
    ...census,
    input_format: 'otlp-json',
    otel_adapter: {
      ...stats,
      privacy_boundary:
        'Only allowlisted seenrelay.* policy/economics attributes, span timing/identity, and opaque resource worker identity are mapped into the census. Raw GenAI arguments/results, prompts, URLs, headers, bodies and unrelated span attributes are not copied into the report.',
      admission_boundary:
        'OTel semantics alone never imply safe reuse. A span is admitted only when the producer supplies an opaque seenrelay.coordinate_hash and explicit SeenRelay policy attributes.'
    }
  };
}

export async function analyzeOtelFleetTraceFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid OTLP JSON: ${error.message}`);
  }
  return analyzeOtelFleetTrace(document);
}
