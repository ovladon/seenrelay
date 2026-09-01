import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { evaluateHostileBenchmark } from './evaluate-hostile-benchmark.mjs';

export const NATURAL_WORKLOAD_CLASSES = Object.freeze([
  'structured_source_reads',
  'browser_extraction_reads',
  'fleet_tool_validations',
]);

export function evaluateNaturalWorkloadSet(inputs, { minimumCalls = 100 } = {}) {
  if (!Array.isArray(inputs) || inputs.length !== 3) throw new TypeError('exactly three natural workload inputs are required');
  if (!Number.isInteger(minimumCalls) || minimumCalls < 1) throw new TypeError('minimumCalls must be a positive integer');

  const workloadIds = new Set();
  const workloadClasses = new Set();
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError(`inputs[${index}] must be an object`);
    if (input.sample_type !== 'natural_workload') throw new TypeError(`inputs[${index}] must use sample_type natural_workload`);
    if (typeof input.workload_id !== 'string' || !input.workload_id.trim()) throw new TypeError(`inputs[${index}].workload_id must be a non-empty string`);
    if (workloadIds.has(input.workload_id)) throw new TypeError(`duplicate natural workload_id: ${input.workload_id}`);
    workloadIds.add(input.workload_id);
    if (!NATURAL_WORKLOAD_CLASSES.includes(input.workload_class)) {
      throw new TypeError(`inputs[${index}].workload_class must be one of: ${NATURAL_WORKLOAD_CLASSES.join(', ')}`);
    }
    if (workloadClasses.has(input.workload_class)) throw new TypeError(`duplicate natural workload_class: ${input.workload_class}`);
    workloadClasses.add(input.workload_class);
  }

  const workloads = inputs.map((input) => {
    const report = evaluateHostileBenchmark(input);
    const sampleFloorMet = report.calls >= minimumCalls;
    const unsafe = report.unsafe_hypothetical_reuses > 0;
    const comparisonComplete = report.reuse_comparison_unavailable === 0;
    const evidenceComplete = sampleFloorMet && comparisonComplete;
    const positive = evidenceComplete && !unsafe && report.decision.beats_baseline_on_both === true;
    return Object.freeze({ workload_id: report.workload_id, workload_class: input.workload_class, calls: report.calls, sample_floor_met: sampleFloorMet, comparison_complete: comparisonComplete, unsafe_hypothetical_reuses: report.unsafe_hypothetical_reuses, safety_state: report.safety.state, latency_outcome: report.latency.outcome, cost_outcome: report.cost.outcome, incremental_value_candidate: positive });
  });
  const unsafeWorkloads = workloads.filter((w) => w.unsafe_hypothetical_reuses > 0).length;
  const completeWorkloads = workloads.filter((w) => w.sample_floor_met && w.comparison_complete).length;
  const positiveWorkloads = workloads.filter((w) => w.incremental_value_candidate).length;
  return Object.freeze({ schema_version: 2, required_workload_classes: NATURAL_WORKLOAD_CLASSES, minimum_calls_per_workload: minimumCalls, workloads: Object.freeze(workloads), complete_workloads: completeWorkloads, unsafe_workloads: unsafeWorkloads, positive_workloads: positiveWorkloads, evidence_complete: completeWorkloads === 3, shared_check_incremental_value_candidate: completeWorkloads === 3 && unsafeWorkloads === 0 && positiveWorkloads > 0, all_three_completed_negative: completeWorkloads === 3 && unsafeWorkloads === 0 && positiveWorkloads === 0, automatic_reuse_enabled_by_gate: false });
}

function main() {
  const paths = process.argv.slice(2);
  if (paths.length !== 3) { console.error('Usage: node scripts/evaluate-natural-workload-set.mjs <workload-a.json> <workload-b.json> <workload-c.json>'); process.exitCode = 2; return; }
  const inputs = paths.map((path) => JSON.parse(fs.readFileSync(path, 'utf8')));
  process.stdout.write(`${JSON.stringify(evaluateNaturalWorkloadSet(inputs), null, 2)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
