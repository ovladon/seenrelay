import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const REPORT_SCHEMA = 'seenrelay-langfuse-opportunity-census-v1';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRows(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Langfuse export is empty');

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (isObject(parsed) && Array.isArray(parsed.data)) return parsed.data;
    if (isObject(parsed)) return [parsed];
  } catch {
    // Fall through to JSONL.
  }

  return trimmed.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`line ${index + 1}: invalid JSON: ${error.message}`);
    }
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
  return out;
}

function canonicalInput(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      return stableValue(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }
  return stableValue(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function timestampMs(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function finiteNonNegative(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function toolType(row) {
  const type = row?.type;
  return typeof type === 'string' ? type.toUpperCase() : '';
}

function rowField(row, camel, snake) {
  return row?.[camel] ?? row?.[snake];
}

function normalizeToolObservation(row, index) {
  if (!isObject(row) || toolType(row) !== 'TOOL') return null;

  const toolName = rowField(row, 'name', 'name');
  if (typeof toolName !== 'string' || !toolName.trim()) {
    return { skipped: 'missing_tool_name' };
  }

  const input = rowField(row, 'input', 'input');
  if (input === undefined || input === null) {
    return { skipped: 'missing_input' };
  }

  const start = timestampMs(rowField(row, 'startTime', 'start_time'));
  if (start === null) return { skipped: 'missing_or_invalid_start_time' };

  const endRaw = rowField(row, 'endTime', 'end_time');
  const end = endRaw === undefined || endRaw === null ? null : timestampMs(endRaw);
  if (endRaw !== undefined && endRaw !== null && (end === null || end < start)) {
    return { skipped: 'invalid_end_time' };
  }

  const traceIdRaw = rowField(row, 'traceId', 'trace_id');
  const traceId = typeof traceIdRaw === 'string' && traceIdRaw.trim()
    ? traceIdRaw.trim()
    : `unknown-trace-${index + 1}`;

  const idRaw = row?.id;
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : `observation-${index + 1}`;

  const canonical = JSON.stringify({
    tool: toolName.trim(),
    input: canonicalInput(input)
  });
  const coordinate = sha256(canonical);

  const totalCost = finiteNonNegative(rowField(row, 'totalCost', 'total_cost'));

  return {
    id,
    traceId,
    toolName: toolName.trim(),
    coordinate,
    start,
    end,
    totalCost
  };
}

function roundUsd(value) {
  return Number(value.toFixed(12));
}

export function analyzeLangfuseObservations(rows) {
  if (!Array.isArray(rows)) throw new Error('Langfuse observations must be an array');

  const stats = {
    input_rows: rows.length,
    tool_observations: 0,
    admitted_tool_observations: 0,
    skipped_missing_tool_name: 0,
    skipped_missing_input: 0,
    skipped_missing_or_invalid_start_time: 0,
    skipped_invalid_end_time: 0
  };

  const observations = [];
  rows.forEach((row, index) => {
    if (!isObject(row) || toolType(row) !== 'TOOL') return;
    stats.tool_observations += 1;
    const normalized = normalizeToolObservation(row, index);
    if (normalized?.skipped) {
      stats[`skipped_${normalized.skipped}`] += 1;
      return;
    }
    observations.push(normalized);
    stats.admitted_tool_observations += 1;
  });

  const groups = new Map();
  for (const observation of observations) {
    const existing = groups.get(observation.coordinate);
    if (existing) existing.push(observation);
    else groups.set(observation.coordinate, [observation]);
  }

  let exactRepeats = 0;
  let sameTraceExactRepeats = 0;
  let crossTraceCoordinates = 0;
  let inflightOverlaps = 0;
  let costedObservations = 0;
  let recordedToolCostUsd = 0;
  let recordedExactRepeatCostUsd = 0;
  let recordedInflightRepeatCostUsd = 0;
  const candidates = [];

  for (const [coordinate, group] of groups) {
    const sorted = [...group].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const repeats = Math.max(0, sorted.length - 1);
    exactRepeats += repeats;

    const traceCounts = new Map();
    for (const item of sorted) traceCounts.set(item.traceId, (traceCounts.get(item.traceId) ?? 0) + 1);
    const sameTraceRepeats = [...traceCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    sameTraceExactRepeats += sameTraceRepeats;
    if (traceCounts.size > 1 && sorted.length > 1) crossTraceCoordinates += 1;

    let activeLeader = null;
    let groupOverlaps = 0;
    for (const item of sorted) {
      if (
        activeLeader &&
        activeLeader.end !== null &&
        item.start < activeLeader.end
      ) {
        groupOverlaps += 1;
        inflightOverlaps += 1;
        if (item.totalCost !== null) recordedInflightRepeatCostUsd += item.totalCost;
      } else {
        activeLeader = item;
      }
    }

    for (const item of sorted) {
      if (item.totalCost !== null) {
        costedObservations += 1;
        recordedToolCostUsd += item.totalCost;
      }
    }
    for (const item of sorted.slice(1)) {
      if (item.totalCost !== null) recordedExactRepeatCostUsd += item.totalCost;
    }

    if (repeats > 0) {
      const groupCost = sorted.reduce((sum, item) => sum + (item.totalCost ?? 0), 0);
      const repeatCost = sorted.slice(1).reduce((sum, item) => sum + (item.totalCost ?? 0), 0);
      candidates.push({
        candidate_id: `sha256:${coordinate.slice(0, 16)}`,
        tool_name: sorted[0].toolName,
        observations: sorted.length,
        trace_count: traceCounts.size,
        exact_repeat_starts: repeats,
        same_trace_exact_repeat_starts: sameTraceRepeats,
        exact_inflight_overlap_starts: groupOverlaps,
        costed_observations: sorted.filter((item) => item.totalCost !== null).length,
        recorded_total_cost_usd: roundUsd(groupCost),
        recorded_exact_repeat_cost_usd: roundUsd(repeatCost)
      });
    }
  }

  candidates.sort((a, b) =>
    b.exact_inflight_overlap_starts - a.exact_inflight_overlap_starts ||
    b.exact_repeat_starts - a.exact_repeat_starts ||
    b.recorded_exact_repeat_cost_usd - a.recorded_exact_repeat_cost_usd ||
    a.candidate_id.localeCompare(b.candidate_id)
  );

  return {
    schema_version: REPORT_SCHEMA,
    input_format: 'langfuse-observations-export',
    ...stats,
    unique_exact_tool_coordinates: groups.size,
    coordinates_with_exact_repeats: candidates.length,
    exact_repeat_starts: exactRepeats,
    same_trace_exact_repeat_starts: sameTraceExactRepeats,
    coordinates_seen_across_multiple_traces: crossTraceCoordinates,
    exact_inflight_overlap_starts: inflightOverlaps,
    costed_tool_observations: costedObservations,
    cost_coverage_fraction: observations.length ? costedObservations / observations.length : 0,
    recorded_tool_cost_usd: roundUsd(recordedToolCostUsd),
    recorded_cost_on_exact_repeat_starts_usd: roundUsd(recordedExactRepeatCostUsd),
    recorded_cost_on_inflight_repeat_starts_usd: roundUsd(recordedInflightRepeatCostUsd),
    candidate_status: candidates.length ? 'NEEDS_POLICY_REVIEW' : 'NO_EXACT_REPEAT_CANDIDATES',
    policy_review_required: true,
    result_compatibility_proven: false,
    executor_identity_available: false,
    actual_avoided_executions: null,
    actual_net_savings_usd: null,
    candidates: candidates.slice(0, 50),
    privacy_boundary:
      'Raw Langfuse tool inputs are canonicalized and hashed locally. The report does not include raw tool inputs or outputs. Tool names remain visible in the local report so a developer can identify the candidate.',
    cost_boundary:
      'Langfuse totalCost is reported only when present on TOOL observations. It may omit external tool/provider charges. Recorded repeat cost is spend associated with repeated observations, not proven avoidable spend.',
    safety_boundary:
      'Exact recurrence alone does not establish that a tool is read-only, exact-shareable, fresh enough, or free of a stronger native control. This census never authorizes reuse. Review candidate policy, instrument executor identity, then run shadow measurement before active coordination.'
  };
}

export async function analyzeLangfuseObservationsFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return analyzeLangfuseObservations(parseRows(text));
}

export function renderLangfuseCensusReport(report) {
  const pct = (value) => `${(value * 100).toFixed(2)}%`;
  const lines = [
    'SeenRelay Langfuse opportunity census',
    '=====================================',
    `Input rows: ${report.input_rows}`,
    `TOOL observations: ${report.tool_observations}`,
    `Admitted TOOL observations: ${report.admitted_tool_observations}`,
    `Exact repeat starts: ${report.exact_repeat_starts}`,
    `Exact in-flight overlap starts: ${report.exact_inflight_overlap_starts}`,
    `Coordinates seen across multiple traces: ${report.coordinates_seen_across_multiple_traces}`,
    `Cost coverage: ${pct(report.cost_coverage_fraction)}`,
    `Recorded cost on exact repeat starts: $${report.recorded_cost_on_exact_repeat_starts_usd.toFixed(6)}`,
    `Candidate status: ${report.candidate_status}`,
    '',
    report.safety_boundary,
    report.cost_boundary
  ];
  return `${lines.join('\n')}\n`;
}
