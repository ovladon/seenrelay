import { createHash, createHmac } from 'node:crypto';

const SHA = /^sha256:[0-9a-f]{64}$/;
const USAGE_KEYS = ['inputTokens', 'outputTokens', 'totalTokens'];

function stable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite value');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  throw new TypeError('unsupported value');
}
function fingerprint(value) {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}
function requireSha(value, name) {
  if (typeof value !== 'string' || !SHA.test(value)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);
  return value;
}
function keyBytes(value) {
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    if (bytes.length < 32) throw new TypeError('coordinateKey must contain at least 32 bytes');
    return bytes;
  }
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    if (bytes.length < 32) throw new TypeError('coordinateKey must contain at least 32 bytes');
    return bytes;
  }
  throw new TypeError('coordinateKey must be string or Uint8Array');
}
function hmac(key, domain, value) {
  return `hmac-sha256:${createHmac('sha256', key).update(domain).update('\0').update(stable(value)).digest('hex')}`;
}
function optionalString(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value) throw new TypeError(`${name} must be non-empty string when present`);
  return value;
}
function numericOrNull(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be finite non-negative number when present`);
  return value;
}
function parseJsonl(rawJsonl) {
  if (typeof rawJsonl !== 'string' || !rawJsonl.trim()) throw new TypeError('rawJsonl must be non-empty string');
  const events = [];
  const lines = rawJsonl.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const text = lines[lineIndex].trim();
    if (!text) continue;
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      throw new TypeError(`rawJsonl line ${lineIndex + 1} is not valid JSON`);
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError(`rawJsonl line ${lineIndex + 1} must be a JSON object`);
    events.push({ lineIndex: lineIndex + 1, event });
  }
  if (!events.length) throw new TypeError('rawJsonl contains no events');
  return events;
}

/**
 * Converts mcp-use-evals harness JSONL into privacy-minimized structural evidence.
 *
 * Important: exact repeated operation signatures are observations only. The exporter
 * does NOT infer mutability, idempotence, freshness, eliminability, or same-outcome.
 * Raw tool names, call ids, inputs, outputs, prompts, text deltas, diagnostics and
 * provider metadata are not retained. Coordinates use HMAC-SHA256 with a caller-held
 * key that is never returned by this function.
 */
export function exportMcpUseEvalsStructuralTrace(rawJsonl, options = {}) {
  const coordinateKey = keyBytes(options.coordinateKey);
  const attemptCoordinate = requireSha(options.attemptCoordinate, 'attemptCoordinate');
  const sourceEvidenceFingerprint = requireSha(options.sourceEvidenceFingerprint, 'sourceEvidenceFingerprint');
  const events = parseJsonl(rawJsonl);

  const structuralEvents = [];
  const operationCounts = new Map();
  const callIdsSeen = new Set();
  const terminalCallIds = new Set();
  let toolCalls = 0;
  let toolResults = 0;
  let toolErrors = 0;
  let finalResultCount = 0;
  let orphanTerminalEvents = 0;
  let structuralSequenceIndex = 0;
  let durationMs = null;
  let turns = null;
  const usage = Object.fromEntries(USAGE_KEYS.map((key) => [key, null]));
  const inputTokenDetails = { noCacheTokens: null, cacheReadTokens: null, cacheWriteTokens: null };

  for (let sequenceIndex = 0; sequenceIndex < events.length; sequenceIndex += 1) {
    const { event } = events[sequenceIndex];
    const type = event.type;
    if (type === 'tool-call') {
      if (typeof event.toolName !== 'string' || !event.toolName) throw new TypeError(`tool-call event ${sequenceIndex} missing toolName`);
      const rawCallId = optionalString(event.toolCallId, `tool-call event ${sequenceIndex}.toolCallId`);
      const callIdCoordinate = rawCallId === null ? null : hmac(coordinateKey, 'call-id', rawCallId);
      if (callIdCoordinate !== null) {
        if (callIdsSeen.has(callIdCoordinate)) throw new TypeError('duplicate raw toolCallId observed');
        callIdsSeen.add(callIdCoordinate);
      }
      const toolNameCoordinate = hmac(coordinateKey, 'tool-name', event.toolName);
      const operationCoordinate = hmac(coordinateKey, 'operation', { toolName: event.toolName, input: event.input ?? null });
      operationCounts.set(operationCoordinate, (operationCounts.get(operationCoordinate) ?? 0) + 1);
      toolCalls += 1;
      structuralEvents.push(Object.freeze({
        sequence_index: structuralSequenceIndex++,
        event_type: 'tool-call',
        call_id_coordinate: callIdCoordinate,
        tool_name_coordinate: toolNameCoordinate,
        operation_coordinate: operationCoordinate,
        input_present: event.input !== undefined,
        effect_classification: 'unknown_not_inferred',
        eliminability_inferred: false,
      }));
      continue;
    }

    if (type === 'tool-result' || type === 'tool-error') {
      const rawCallId = optionalString(event.toolCallId, `${type} event ${sequenceIndex}.toolCallId`);
      const callIdCoordinate = rawCallId === null ? null : hmac(coordinateKey, 'call-id', rawCallId);
      if (callIdCoordinate !== null) {
        terminalCallIds.add(callIdCoordinate);
        if (!callIdsSeen.has(callIdCoordinate)) orphanTerminalEvents += 1;
      } else {
        orphanTerminalEvents += 1;
      }
      const rawToolName = optionalString(event.toolName, `${type} event ${sequenceIndex}.toolName`);
      const toolNameCoordinate = rawToolName === null ? null : hmac(coordinateKey, 'tool-name', rawToolName);
      if (type === 'tool-result') toolResults += 1;
      else toolErrors += 1;
      structuralEvents.push(Object.freeze({
        sequence_index: structuralSequenceIndex++,
        event_type: type,
        call_id_coordinate: callIdCoordinate,
        tool_name_coordinate: toolNameCoordinate,
        output_retained: false,
      }));
      continue;
    }

    if (type === 'result') {
      finalResultCount += 1;
      durationMs = numericOrNull(event.duration_ms, `result event ${sequenceIndex}.duration_ms`);
      turns = numericOrNull(event.num_turns, `result event ${sequenceIndex}.num_turns`);
      if (turns !== null && !Number.isInteger(turns)) throw new TypeError('result num_turns must be integer when present');
      if (event.total_usage !== undefined && event.total_usage !== null) {
        if (!event.total_usage || typeof event.total_usage !== 'object' || Array.isArray(event.total_usage)) throw new TypeError('result total_usage must be object when present');
        for (const key of USAGE_KEYS) usage[key] = numericOrNull(event.total_usage[key], `result total_usage.${key}`);
        const details = event.total_usage.inputTokenDetails;
        if (details !== undefined && details !== null) {
          if (!details || typeof details !== 'object' || Array.isArray(details)) throw new TypeError('result total_usage.inputTokenDetails must be object when present');
          for (const key of Object.keys(inputTokenDetails)) inputTokenDetails[key] = numericOrNull(details[key], `result total_usage.inputTokenDetails.${key}`);
        }
      }
    }
  }

  if (finalResultCount !== 1) throw new TypeError('structural trace requires exactly one final result event');

  const duplicateGroups = [...operationCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([operationCoordinate, count]) => Object.freeze({ operation_coordinate: operationCoordinate, occurrences: count }));
  const repeatedOperationCalls = duplicateGroups.reduce((sum, group) => sum + (group.occurrences - 1), 0);
  const unmatchedToolCalls = [...callIdsSeen].filter((id) => !terminalCallIds.has(id)).length;

  const envelope = {
    schema: 'seenrelay-mcp-use-evals-structural-trace-v1',
    evidence_class: 'privacy_safe_external_structural_trace',
    attempt_coordinate: attemptCoordinate,
    source_evidence_fingerprint: sourceEvidenceFingerprint,
    coordinate_scheme: 'hmac-sha256-v1',
    coordinate_key_retained: false,
    structural_events: structuralEvents,
    counts: Object.freeze({
      tool_calls: toolCalls,
      tool_results: toolResults,
      tool_errors: toolErrors,
      unmatched_tool_calls: unmatchedToolCalls,
      orphan_terminal_events: orphanTerminalEvents,
      exact_duplicate_operation_groups: duplicateGroups.length,
      repeated_operation_calls: repeatedOperationCalls,
    }),
    duplicate_operation_groups: Object.freeze(duplicateGroups),
    final_result_work: Object.freeze({
      duration_ms: durationMs,
      turns,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      no_cache_input_tokens: inputTokenDetails.noCacheTokens,
      cache_read_input_tokens: inputTokenDetails.cacheReadTokens,
      cache_write_input_tokens: inputTokenDetails.cacheWriteTokens,
    }),
    raw_tool_names_retained: false,
    raw_call_ids_retained: false,
    raw_inputs_retained: false,
    raw_outputs_retained: false,
    prompts_retained: false,
    text_content_retained: false,
    diagnostics_retained: false,
    provider_metadata_retained: false,
    effect_classification_inferred: false,
    mutability_inferred: false,
    freshness_inferred: false,
    eliminability_inferred: false,
    same_outcome_proven: false,
    candidate_headroom_proven: false,
    optimizer_authorized: false,
    production_change_authorized: false,
  };
  return Object.freeze({ ...envelope, proof_fingerprint: fingerprint(envelope) });
}
