import type { ShadowTrajectoryProfiler } from './trajectory-profiler.js';

export interface OtlpTrajectoryImportOptions {
  trajectoryId?: string;
  workloadId?: string;
  sampleType?: 'natural_workload' | 'replayed' | 'commissioning' | 'synthetic';
  baselineEvidenceFingerprint?: string;
  costUnitPolicyId?: string;
  costUnitPolicyFingerprint?: string;
}

export interface OtlpTrajectoryImportReport {
  schema: 'seenrelay-otel-trajectory-import-v1';
  imported: boolean;
  trajectory_id: string | null;
  imported_spans: number;
  invalid_spans: number;
  ignored_content_attributes: number;
  duplicate_usage_suppressed: number;
  exact_duplicate_usage_suppressed: number;
  ambiguous_ancestor_usage_suppressed: number;
  aggregate_usage_is_lower_bound: boolean;
  raw_ids_retained: false;
  raw_content_retained: false;
  cost_units_created: false;
  trajectory_finished: false;
  readonly [key: string]: unknown;
}

export declare function importOtlpTrajectory(
  profiler: ShadowTrajectoryProfiler,
  input: unknown,
  options?: OtlpTrajectoryImportOptions
): Readonly<OtlpTrajectoryImportReport>;
