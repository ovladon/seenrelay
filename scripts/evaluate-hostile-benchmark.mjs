import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const STATUSES = new Set(['SAME_OBSERVED', 'CHANGED_OBSERVED', 'CONTESTED', 'STALE', 'UNKNOWN']);
const CONTROL_NAMES = ['local_cache', 'source_native_conditional', 'provider_native_cache'];

function nonNegative(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return n;
}

function percentile(values, q) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function compare(candidate, baseline) {
  if (candidate < baseline) return 'better';
  if (candidate > baseline) return 'worse';
  return 'equal';
}

export function evaluateHostileBenchmark(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('benchmark input must be an object');
  if (input.schema_version !== 1) throw new TypeError('schema_version must be 1');
  if (!['natural_workload', 'fixed_fact_smoke'].includes(input.sample_type)) {
    throw new TypeError('sample_type must be natural_workload or fixed_fact_smoke');
  }
  if (input.baseline_definition !== 'best_existing_non_shared_path') {
    throw new TypeError('baseline_definition must be best_existing_non_shared_path');
  }

  const controls = input.controls;
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) throw new TypeError('controls must be an object');
  for (const name of CONTROL_NAMES) {
    const control = controls[name];
    if (!control || typeof control.available !== 'boolean' || typeof control.measured !== 'boolean') {
      throw new TypeError(`controls.${name} must declare available and measured booleans`);
    }
    if (control.available && !control.measured) {
      throw new Error(`hostile benchmark incomplete: ${name} is available but was not measured`);
    }
  }

  if (!Array.isArray(input.records) || input.records.length === 0) throw new TypeError('records must be a non-empty array');
  const observeOffCriticalPath = input.observe_off_critical_path === true;

  const baselineLatency = [];
  const prospectiveLatency = [];
  const baselineCost = [];
  const prospectiveCost = [];
  const statusCounts = Object.fromEntries([...STATUSES].map((status) => [status, 0]));
  let policyAcceptedReuses = 0;
  let unsafeHypotheticalReuses = 0;
  let prospectiveObserveRequests = 0;

  input.records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError(`records[${index}] must be an object`);
    if (!STATUSES.has(record.check_status)) throw new TypeError(`records[${index}].check_status is invalid`);
    if (typeof record.policy_reusable !== 'boolean') throw new TypeError(`records[${index}].policy_reusable must be boolean`);
    if (typeof record.observe_after_baseline !== 'boolean') throw new TypeError(`records[${index}].observe_after_baseline must be boolean`);
    if (record.policy_reusable && record.check_status !== 'SAME_OBSERVED') {
      throw new Error(`records[${index}] cannot be policy_reusable unless CHECK is SAME_OBSERVED`);
    }
    if (record.policy_reusable && typeof record.reuse_would_match_validation !== 'boolean') {
      throw new TypeError(`records[${index}].reuse_would_match_validation must be boolean for policy-reusable records`);
    }

    const baseMs = nonNegative(record.baseline_ms, `records[${index}].baseline_ms`);
    const baseCost = nonNegative(record.baseline_cost, `records[${index}].baseline_cost`);
    const checkMs = nonNegative(record.check_ms, `records[${index}].check_ms`);
    const observeMs = nonNegative(record.observe_ms, `records[${index}].observe_ms`);
    const checkCost = nonNegative(record.check_cost, `records[${index}].check_cost`);
    const observeCost = nonNegative(record.observe_cost, `records[${index}].observe_cost`);

    const reuse = record.check_status === 'SAME_OBSERVED' && record.policy_reusable;
    const observe = !reuse && record.observe_after_baseline;
    statusCounts[record.check_status] += 1;
    if (reuse) {
      policyAcceptedReuses += 1;
      if (!record.reuse_would_match_validation) unsafeHypotheticalReuses += 1;
    }
    if (observe) prospectiveObserveRequests += 1;

    baselineLatency.push(baseMs);
    baselineCost.push(baseCost);
    prospectiveLatency.push(checkMs + (reuse ? 0 : baseMs) + (observe && !observeOffCriticalPath ? observeMs : 0));
    prospectiveCost.push(checkCost + (reuse ? 0 : baseCost) + (observe ? observeCost : 0));
  });

  const baselineLatencyTotal = sum(baselineLatency);
  const prospectiveLatencyTotal = sum(prospectiveLatency);
  const baselineCostTotal = sum(baselineCost);
  const prospectiveCostTotal = sum(prospectiveCost);
  const calls = input.records.length;
  const safetyPass = unsafeHypotheticalReuses === 0;
  const positiveOnLatency = prospectiveLatencyTotal < baselineLatencyTotal;
  const positiveOnCost = prospectiveCostTotal < baselineCostTotal;

  return Object.freeze({
    schema_version: 1,
    workload_id: typeof input.workload_id === 'string' ? input.workload_id : null,
    sample_type: input.sample_type,
    evidence_scope: input.sample_type === 'natural_workload' ? 'workload_evidence' : 'mechanics_only',
    baseline_definition: input.baseline_definition,
    controls,
    observe_off_critical_path: observeOffCriticalPath,
    calls,
    status_counts: statusCounts,
    policy_accepted_reuses: policyAcceptedReuses,
    policy_accepted_reuse_rate: policyAcceptedReuses / calls,
    unsafe_hypothetical_reuses: unsafeHypotheticalReuses,
    prospective_observe_requests: prospectiveObserveRequests,
    safety: {
      authoritative_shadow_validation_required: true,
      unsafe_hypothetical_reuses: unsafeHypotheticalReuses,
      pass: safetyPass
    },
    latency: {
      baseline_total_ms: baselineLatencyTotal,
      prospective_total_ms: prospectiveLatencyTotal,
      delta_ms: prospectiveLatencyTotal - baselineLatencyTotal,
      outcome: compare(prospectiveLatencyTotal, baselineLatencyTotal),
      improvement_percent: baselineLatencyTotal > 0 ? ((baselineLatencyTotal - prospectiveLatencyTotal) / baselineLatencyTotal) * 100 : null,
      baseline_p50_ms: percentile(baselineLatency, 0.5),
      baseline_p95_ms: percentile(baselineLatency, 0.95),
      prospective_p50_ms: percentile(prospectiveLatency, 0.5),
      prospective_p95_ms: percentile(prospectiveLatency, 0.95)
    },
    cost: {
      baseline_total_units: baselineCostTotal,
      prospective_total_units: prospectiveCostTotal,
      delta_units: prospectiveCostTotal - baselineCostTotal,
      outcome: compare(prospectiveCostTotal, baselineCostTotal),
      improvement_percent: baselineCostTotal > 0 ? ((baselineCostTotal - prospectiveCostTotal) / baselineCostTotal) * 100 : null
    },
    decision: {
      safety_pass: safetyPass,
      positive_on_latency: positiveOnLatency,
      positive_on_cost: positiveOnCost,
      beats_baseline_on_both: safetyPass && positiveOnLatency && positiveOnCost,
      automatic_reuse_enabled_by_evaluator: false
    }
  });
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/evaluate-hostile-benchmark.mjs <benchmark.json>');
    process.exitCode = 2;
    return;
  }
  const input = JSON.parse(fs.readFileSync(path, 'utf8'));
  process.stdout.write(`${JSON.stringify(evaluateHostileBenchmark(input), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
