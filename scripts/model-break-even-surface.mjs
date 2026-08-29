import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function nonNegative(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return n;
}

function positive(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new TypeError(`${name} must be a positive finite number`);
  return n;
}

function fraction(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new TypeError(`${name} must be between 0 and 1`);
  return n;
}

function numericArray(value, name, parser) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${name} must be a non-empty array`);
  return value.map((entry, index) => parser(entry, `${name}[${index}]`));
}

function thresholdState(threshold) {
  if (threshold === null) return 'no_strict_saving_possible';
  if (threshold >= 1) return 'not_strictly_feasible';
  return 'feasible';
}

function outcome(candidate, baseline) {
  if (candidate < baseline) return 'better';
  if (candidate > baseline) return 'worse';
  return 'equal';
}

function round(value) {
  return Number(value.toFixed(6));
}

export function modelBreakEvenSurface(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('surface input must be an object');
  if (input.schema_version !== 1) throw new TypeError('schema_version must be 1');

  const checkLatencyMs = numericArray(input.check_latency_ms, 'check_latency_ms', nonNegative);
  const validationLatencyMs = numericArray(input.validation_latency_ms, 'validation_latency_ms', positive);
  const observeLatencyMs = nonNegative(input.observe_latency_ms, 'observe_latency_ms');
  const observeEligibleFraction = fraction(input.observe_eligible_fraction, 'observe_eligible_fraction');
  if (typeof input.observe_off_critical_path !== 'boolean') {
    throw new TypeError('observe_off_critical_path must be boolean');
  }
  const observeOffCriticalPath = input.observe_off_critical_path;
  const reuseRates = numericArray(input.reuse_rates, 'reuse_rates', fraction);

  const cost = input.cost;
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) throw new TypeError('cost must be an object');
  const checkCost = nonNegative(cost.check_units, 'cost.check_units');
  const observeCost = nonNegative(cost.observe_units, 'cost.observe_units');
  const validationCosts = numericArray(cost.validation_units, 'cost.validation_units', nonNegative);

  const latencyThresholds = [];
  const latencySurface = [];
  for (const checkMs of checkLatencyMs) {
    for (const validationMs of validationLatencyMs) {
      const effectiveObserveMs = observeOffCriticalPath ? 0 : observeEligibleFraction * observeLatencyMs;
      const threshold = (checkMs + effectiveObserveMs) / (validationMs + effectiveObserveMs);
      latencyThresholds.push({
        check_ms: checkMs,
        validation_ms: validationMs,
        break_even_reuse_rate_exclusive: round(threshold),
        state: thresholdState(threshold)
      });

      for (const reuseRate of reuseRates) {
        const observeProbability = (1 - reuseRate) * observeEligibleFraction;
        const candidateMs = checkMs + (1 - reuseRate) * validationMs
          + (observeOffCriticalPath ? 0 : observeProbability * observeLatencyMs);
        latencySurface.push({
          check_ms: checkMs,
          validation_ms: validationMs,
          reuse_rate: reuseRate,
          baseline_ms: validationMs,
          prospective_ms: round(candidateMs),
          delta_ms: round(candidateMs - validationMs),
          outcome: outcome(candidateMs, validationMs)
        });
      }
    }
  }

  const costThresholds = [];
  const costSurface = [];
  for (const validationCost of validationCosts) {
    const numerator = checkCost + observeEligibleFraction * observeCost;
    const denominator = validationCost + observeEligibleFraction * observeCost;
    const threshold = denominator === 0 ? null : numerator / denominator;
    costThresholds.push({
      validation_units: validationCost,
      break_even_reuse_rate_exclusive: threshold === null ? null : round(threshold),
      state: thresholdState(threshold)
    });

    for (const reuseRate of reuseRates) {
      const observeProbability = (1 - reuseRate) * observeEligibleFraction;
      const candidateUnits = checkCost + (1 - reuseRate) * validationCost + observeProbability * observeCost;
      costSurface.push({
        validation_units: validationCost,
        reuse_rate: reuseRate,
        baseline_units: validationCost,
        prospective_units: round(candidateUnits),
        delta_units: round(candidateUnits - validationCost),
        outcome: outcome(candidateUnits, validationCost)
      });
    }
  }

  const sparseLatency = latencySurface.filter((row) => row.reuse_rate === 0);
  const sparseCost = costSurface.filter((row) => row.reuse_rate === 0);

  return Object.freeze({
    schema_version: 1,
    model_version: 1,
    evidence_scope: 'scenario_analysis_not_workload_proof',
    assumptions: {
      policy_accepted_reuse_rate_is_exogenous: true,
      authoritative_validation_runs_on_every_non_reuse: true,
      observe_eligible_fraction: observeEligibleFraction,
      observe_off_critical_path: observeOffCriticalPath,
      conditional_or_provider_cache_savings_must_already_be_reflected_in_validation_inputs: true
    },
    latency: {
      thresholds: latencyThresholds,
      surface: latencySurface
    },
    cost: {
      check_units: checkCost,
      observe_units: observeCost,
      thresholds: costThresholds,
      surface: costSurface
    },
    sparse_hive: {
      reuse_rate: 0,
      latency: sparseLatency,
      cost: sparseCost
    }
  });
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/model-break-even-surface.mjs <surface.json>');
    process.exitCode = 2;
    return;
  }
  const input = JSON.parse(fs.readFileSync(path, 'utf8'));
  process.stdout.write(`${JSON.stringify(modelBreakEvenSurface(input), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
