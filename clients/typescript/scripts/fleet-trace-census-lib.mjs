import fs from 'node:fs/promises';

const EVENT_SCHEMA = 'seenrelay-fleet-trace-event-v1';
const REPORT_SCHEMA = 'seenrelay-fleet-trace-census-v1';
const HASH_RE = /^sha256:[0-9a-f]{64}$/i;
const ELIGIBLE_SIDE_EFFECT_CLASSES = new Set(['read_only', 'idempotent_read']);
const SIDE_EFFECT_CLASSES = new Set(['read_only', 'idempotent_read', 'mutation', 'unknown']);
const OUTCOMES = new Set(['success', 'error', 'unknown']);
const FORBIDDEN_RAW_KEYS = new Set([
  'prompt', 'input', 'args', 'arguments', 'messages', 'url', 'source', 'source_url',
  'headers', 'body', 'result', 'output', 'response', 'token', 'api_key', 'apikey'
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function requiredString(value, field, index) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`event ${index}: ${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseJsonOrJsonl(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('trace is empty');

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (isObject(parsed) && Array.isArray(parsed.calls)) return parsed.calls;
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

function assertSanitized(event, index) {
  for (const key of Object.keys(event)) {
    if (FORBIDDEN_RAW_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `event ${index}: raw field "${key}" is not allowed; export an opaque coordinate_hash instead`
      );
    }
  }
}

function normalizeEvent(event, index) {
  if (!isObject(event)) throw new Error(`event ${index}: expected an object`);
  assertSanitized(event, index);

  if (event.schema_version !== EVENT_SCHEMA) {
    throw new Error(`event ${index}: schema_version must be ${EVENT_SCHEMA}`);
  }

  const callId = requiredString(event.call_id, 'call_id', index);
  const workerId = requiredString(event.worker_id, 'worker_id', index);
  const clockDomain = requiredString(event.clock_domain, 'clock_domain', index);
  const sideEffectClass = requiredString(event.side_effect_class, 'side_effect_class', index);
  if (!SIDE_EFFECT_CLASSES.has(sideEffectClass)) {
    throw new Error(`event ${index}: unsupported side_effect_class "${sideEffectClass}"`);
  }
  if (typeof event.exact_single_answer_shareable !== 'boolean') {
    throw new Error(`event ${index}: exact_single_answer_shareable must be boolean`);
  }
  if (typeof event.independent_samples_required !== 'boolean') {
    throw new Error(`event ${index}: independent_samples_required must be boolean`);
  }
  if (event.native_exact_cache_zero_cost !== undefined && typeof event.native_exact_cache_zero_cost !== 'boolean') {
    throw new Error(`event ${index}: native_exact_cache_zero_cost must be boolean when supplied`);
  }

  if (!Number.isSafeInteger(event.started_at_ms) || event.started_at_ms < 0) {
    throw new Error(`event ${index}: started_at_ms must be a non-negative safe integer`);
  }
  if (!Number.isSafeInteger(event.ended_at_ms) || event.ended_at_ms <= event.started_at_ms) {
    throw new Error(`event ${index}: ended_at_ms must be a safe integer greater than started_at_ms`);
  }

  const outcome = requiredString(event.outcome, 'outcome', index);
  if (!OUTCOMES.has(outcome)) throw new Error(`event ${index}: unsupported outcome "${outcome}"`);

  const policyEligible =
    ELIGIBLE_SIDE_EFFECT_CLASSES.has(sideEffectClass) &&
    event.exact_single_answer_shareable === true &&
    event.independent_samples_required === false;
  const nativeDominated = event.native_exact_cache_zero_cost === true;
  const eligible = policyEligible && !nativeDominated;

  let coordinateHash = null;
  if (eligible) {
    coordinateHash = requiredString(event.coordinate_hash, 'coordinate_hash', index);
    if (!HASH_RE.test(coordinateHash)) {
      throw new Error(`event ${index}: coordinate_hash must be sha256:<64 hex chars>`);
    }
  } else if (event.coordinate_hash !== undefined && event.coordinate_hash !== null) {
    coordinateHash = requiredString(event.coordinate_hash, 'coordinate_hash', index);
    if (!HASH_RE.test(coordinateHash)) {
      throw new Error(`event ${index}: coordinate_hash must be sha256:<64 hex chars> when supplied`);
    }
  }

  let marginalCostUsd = null;
  if (event.marginal_cost_usd !== undefined && event.marginal_cost_usd !== null) {
    if (!finiteNonNegative(event.marginal_cost_usd)) {
      throw new Error(`event ${index}: marginal_cost_usd must be finite and non-negative`);
    }
    marginalCostUsd = event.marginal_cost_usd;
    requiredString(event.cost_provenance, 'cost_provenance', index);
  }

  let providerUnits = null;
  let providerUnitLabel = null;
  if (event.provider_units !== undefined && event.provider_units !== null) {
    if (!finiteNonNegative(event.provider_units)) {
      throw new Error(`event ${index}: provider_units must be finite and non-negative`);
    }
    providerUnits = event.provider_units;
    providerUnitLabel = requiredString(event.provider_unit_label, 'provider_unit_label', index);
    requiredString(event.cost_provenance, 'cost_provenance', index);
  }

  return {
    callId,
    workerId,
    clockDomain,
    sideEffectClass,
    exactSingleAnswerShareable: event.exact_single_answer_shareable,
    independentSamplesRequired: event.independent_samples_required,
    nativeDominated,
    eligible,
    coordinateHash,
    startedAtMs: event.started_at_ms,
    endedAtMs: event.ended_at_ms,
    outcome,
    marginalCostUsd,
    providerUnits,
    providerUnitLabel,
    costProvenance: event.cost_provenance ?? null
  };
}

function addUnit(target, label, amount) {
  if (amount === null || label === null) return;
  target[label] = (target[label] ?? 0) + amount;
}

export function analyzeFleetTrace(events) {
  if (!Array.isArray(events)) throw new Error('events must be an array');
  const normalized = events.map((event, i) => normalizeEvent(event, i + 1));

  const eligible = normalized.filter((event) => event.eligible);
  const ineligible = normalized.filter((event) => !event.eligible);
  const nativeDominated = normalized.filter((event) => event.nativeDominated);
  const policyIneligible = normalized.filter((event) => !event.nativeDominated && !event.eligible);

  const sorted = [...eligible].sort((a, b) =>
    a.startedAtMs - b.startedAtMs ||
    a.endedAtMs - b.endedAtMs ||
    a.callId.localeCompare(b.callId)
  );

  const activeLeader = new Map();
  const overlaps = [];
  const successfulLeaderOpportunities = [];
  let leaderStarts = 0;

  for (const event of sorted) {
    const key = `${event.clockDomain}\u0000${event.coordinateHash}`;
    const leader = activeLeader.get(key);

    if (leader && event.startedAtMs < leader.endedAtMs) {
      const record = {
        follower: event,
        leader,
        crossWorker: event.workerId !== leader.workerId
      };
      overlaps.push(record);
      if (leader.outcome === 'success') successfulLeaderOpportunities.push(record);
      continue;
    }

    activeLeader.set(key, event);
    leaderStarts += 1;
  }

  const knownEligibleCost = eligible.filter((e) => e.marginalCostUsd !== null);
  const knownOpportunityCost = successfulLeaderOpportunities.filter(
    ({ follower }) => follower.marginalCostUsd !== null
  );
  const baselineKnownCostUsd = knownEligibleCost.reduce((sum, event) => sum + event.marginalCostUsd, 0);
  const grossPotentialAvoidedCostUsd = knownOpportunityCost.reduce(
    (sum, { follower }) => sum + follower.marginalCostUsd,
    0
  );

  const baselineProviderUnits = {};
  const potentialAvoidedProviderUnits = {};
  for (const event of eligible) addUnit(baselineProviderUnits, event.providerUnitLabel, event.providerUnits);
  for (const { follower } of successfulLeaderOpportunities) {
    addUnit(potentialAvoidedProviderUnits, follower.providerUnitLabel, follower.providerUnits);
  }

  const uniqueCoordinates = new Set(eligible.map((event) => event.coordinateHash)).size;
  const clockDomains = [...new Set(normalized.map((event) => event.clockDomain))].sort();
  const workerIds = [...new Set(normalized.map((event) => event.workerId))];

  return {
    schema_version: REPORT_SCHEMA,
    input_events: normalized.length,
    workers: workerIds.length,
    clock_domains: clockDomains,
    unique_eligible_coordinates: uniqueCoordinates,
    policy_ineligible_events: policyIneligible.length,
    native_control_dominated_events: nativeDominated.length,
    eligible_events: eligible.length,
    leader_starts_under_exact_singleflight_model: leaderStarts,
    observed_exact_overlap_starts: overlaps.length,
    observed_exact_overlap_fraction: eligible.length ? overlaps.length / eligible.length : 0,
    cross_worker_overlap_starts: overlaps.filter((record) => record.crossWorker).length,
    successful_leader_overlap_opportunities: successfulLeaderOpportunities.length,
    cross_worker_successful_leader_overlap_opportunities:
      successfulLeaderOpportunities.filter((record) => record.crossWorker).length,
    eligible_costed_events: knownEligibleCost.length,
    potential_avoided_costed_events: knownOpportunityCost.length,
    cost_coverage_fraction: eligible.length ? knownEligibleCost.length / eligible.length : 0,
    baseline_known_cost_usd: baselineKnownCostUsd,
    gross_potential_avoided_cost_usd: grossPotentialAvoidedCostUsd,
    modeled_post_coordination_known_cost_usd:
      Math.max(0, baselineKnownCostUsd - grossPotentialAvoidedCostUsd),
    baseline_provider_units_by_label: baselineProviderUnits,
    potential_avoided_provider_units_by_label: potentialAvoidedProviderUnits,
    actual_avoided_executions: null,
    actual_net_savings_usd: null,
    result_compatibility_proven: false,
    disclaimer:
      'Trace census only. Overlap and gross potential are pre-activation opportunity evidence, not actual savings. Actual avoided executions require active follower reuse receipts; net savings also require measured coordination overhead and the best existing native/local control.'
  };
}

export async function analyzeFleetTraceFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return analyzeFleetTrace(parseJsonOrJsonl(text));
}

export function renderFleetTraceReport(report) {
  const pct = (value) => `${(value * 100).toFixed(2)}%`;
  const lines = [
    'SeenRelay fleet trace census',
    '============================',
    `Input events: ${report.input_events}`,
    `Workers: ${report.workers}`,
    `Eligible exact-shareable reads: ${report.eligible_events}`,
    `Native-control dominated: ${report.native_control_dominated_events}`,
    `Policy-ineligible: ${report.policy_ineligible_events}`,
    `Exact in-flight overlap starts: ${report.observed_exact_overlap_starts} (${pct(report.observed_exact_overlap_fraction)})`,
    `Cross-worker overlap starts: ${report.cross_worker_overlap_starts}`,
    `Successful-leader overlap opportunities: ${report.successful_leader_overlap_opportunities}`,
    `Gross potential avoided cost with explicit USD provenance: $${report.gross_potential_avoided_cost_usd.toFixed(6)}`,
    '',
    report.disclaimer
  ];
  return `${lines.join('\n')}\n`;
}

export const fleetTraceSchemaVersion = EVENT_SCHEMA;
