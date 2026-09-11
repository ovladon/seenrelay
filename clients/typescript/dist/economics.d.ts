export type SeenRelayCheckStatus = 'SAME_OBSERVED' | 'CHANGED_OBSERVED' | 'CONTESTED' | 'STALE' | 'UNKNOWN';
export type BenchmarkOutcome = 'better' | 'worse' | 'equal';
export type BenchmarkSafetyState = 'no_opportunities' | 'fail' | 'incomplete' | 'pass';
export type ShadowAuditVerdict = 'USE' | 'DO NOT USE' | 'INSUFFICIENT EVIDENCE';

export interface BenchmarkControl {
  available: boolean;
  measured: boolean;
}

export interface HostileBenchmarkRecord {
  check_status: SeenRelayCheckStatus | null;
  policy_reusable: boolean;
  reuse_would_match_validation: boolean | null;
  observe_after_baseline: boolean;
  baseline_ms: number;
  baseline_cost: number;
  check_ms: number;
  observe_ms: number;
  check_cost: number;
  observe_cost: number;
}

export interface HostileBenchmarkInput {
  schema_version: 1 | 2;
  workload_id?: string | null;
  sample_type: 'natural_workload' | 'fixed_fact_smoke';
  baseline_definition: 'best_existing_non_shared_path';
  observe_off_critical_path?: boolean;
  controls: {
    local_cache: BenchmarkControl;
    source_native_conditional: BenchmarkControl;
    provider_native_cache: BenchmarkControl;
  };
  records: HostileBenchmarkRecord[];
}

export interface HostileBenchmarkEvaluation {
  readonly schema_version: 1 | 2;
  readonly evaluator_version: 2;
  readonly workload_id: string | null;
  readonly sample_type: 'natural_workload' | 'fixed_fact_smoke';
  readonly evidence_scope: 'workload_evidence' | 'mechanics_only';
  readonly baseline_definition: 'best_existing_non_shared_path';
  readonly controls: HostileBenchmarkInput['controls'];
  readonly observe_off_critical_path: boolean;
  readonly calls: number;
  readonly status_counts: Record<SeenRelayCheckStatus | 'CHECK_UNAVAILABLE', number>;
  readonly policy_accepted_reuses: number;
  readonly policy_accepted_reuse_rate: number;
  readonly unsafe_hypothetical_reuses: number;
  readonly reuse_comparison_unavailable: number;
  readonly prospective_observe_requests: number;
  readonly safety: {
    readonly authoritative_shadow_validation_required: true;
    readonly policy_reuse_opportunities: number;
    readonly unsafe_hypothetical_reuses: number;
    readonly comparison_unavailable: number;
    readonly state: BenchmarkSafetyState;
    readonly pass: boolean | null;
  };
  readonly latency: {
    readonly baseline_total_ms: number;
    readonly prospective_total_ms: number;
    readonly delta_ms: number;
    readonly outcome: BenchmarkOutcome;
    readonly improvement_percent: number | null;
    readonly baseline_p50_ms: number;
    readonly baseline_p95_ms: number;
    readonly prospective_p50_ms: number;
    readonly prospective_p95_ms: number;
  };
  readonly cost: {
    readonly baseline_total_units: number;
    readonly prospective_total_units: number;
    readonly delta_units: number;
    readonly outcome: BenchmarkOutcome;
    readonly improvement_percent: number | null;
  };
  readonly decision: {
    readonly safety_pass: boolean | null;
    readonly evidence_ready: boolean;
    readonly positive_on_latency: boolean;
    readonly positive_on_cost: boolean;
    readonly beats_baseline_on_both: boolean;
    readonly automatic_reuse_enabled_by_evaluator: false;
  };
}

export interface HostileBenchmarkVerdictOptions {
  minimumCalls?: number;
}

export interface HostileBenchmarkVerdict {
  readonly verdict: ShadowAuditVerdict;
  readonly reasons: readonly string[];
  readonly minimum_calls: number;
  readonly calls: number;
  readonly sample_floor_met: boolean;
  readonly comparison_complete: boolean;
  readonly controls_complete: boolean;
  readonly safety_state: BenchmarkSafetyState;
  readonly policy_accepted_reuses: number;
  readonly latency_outcome: BenchmarkOutcome | null;
  readonly cost_outcome: BenchmarkOutcome | null;
  readonly automatic_reuse_enabled: false;
}

/** Evaluate benchmark evidence without enabling reuse. */
export declare function evaluateHostileBenchmark(input: HostileBenchmarkInput): Readonly<HostileBenchmarkEvaluation>;

/** Classify one natural-workload evaluation into the public three-way audit verdict without enabling reuse. */
export declare function classifyHostileBenchmarkVerdict(
  evaluation: HostileBenchmarkEvaluation,
  options?: HostileBenchmarkVerdictOptions
): Readonly<HostileBenchmarkVerdict>;
