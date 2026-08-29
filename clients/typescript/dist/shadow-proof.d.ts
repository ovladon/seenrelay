import type { CheckResult, ReuseDecision, SeenRelayClient } from './seenrelay.js';

export type ShadowSafetyEvidence = 'no_opportunities' | 'pass' | 'fail' | 'incomplete';

export interface ShadowProofSnapshot {
  readonly calls: number;
  readonly checksWithoutUsableResponse: number;
  readonly conditionalHintsSeen: number;
  readonly validationMsTotal: number;
  readonly validationMsAverage: number;
  readonly sameObservedValidationMs: number;
  /** SAME_OBSERVED calls whose known JSON value matched the authoritative validation result. */
  readonly sameObservedMatchesValidation: number;
  /** SAME_OBSERVED calls whose known JSON value disagreed with the authoritative validation result. */
  readonly sameObservedMismatchesValidation: number;
  /** SAME_OBSERVED calls that could not be compared as deterministic JSON values. */
  readonly sameObservedComparisonUnavailable: number;
  readonly sameObservedComparable: number;
  readonly sameObservedAgreementRate: number | null;
  readonly safetyEvidence: ShadowSafetyEvidence;
  /** True only with at least one SAME_OBSERVED opportunity and no mismatch/unavailable comparison. */
  readonly safetyPass: boolean | null;
  readonly statuses: Readonly<Record<'SAME_OBSERVED' | 'CHANGED_OBSERVED' | 'CONTESTED' | 'STALE' | 'UNKNOWN', number>>;
}

export interface ShadowEconomicsInput {
  avoidedValidationCost?: number;
  checkRequestCost?: number;
  observeRequestCost?: number;
  /** Set true only when the caller's scheduler actually keeps OBSERVE off the response critical path. */
  observeOffCriticalPath?: boolean;
}

export interface ShadowEconomicsReport {
  readonly mode: 'shadow-proof';
  readonly calls: number;
  readonly statusCounts: ShadowProofSnapshot['statuses'];
  readonly observedSameRate: number;
  readonly conditionalHintsSeen: number;
  readonly validationMsAverage: number;
  readonly checkNetworkLatencyMsAverage: number;
  readonly observeNetworkLatencyMsAverage: number;
  readonly potentialValidationCallsAvoided: number;
  readonly grossPotentialSavings: number;
  readonly prospectiveRelayRequestCost: number;
  readonly netPotentialSavings: number;
  readonly sameObservedValidationMs: number;
  readonly sameObservedMatchesValidation: number;
  readonly sameObservedMismatchesValidation: number;
  readonly sameObservedComparisonUnavailable: number;
  readonly sameObservedComparable: number;
  readonly sameObservedAgreementRate: number | null;
  readonly safetyEvidence: ShadowSafetyEvidence;
  readonly safetyPass: boolean | null;
  /** Populated only when the observed SAME_OBSERVED set passes strict shadow agreement. */
  readonly safetyAdjustedGrossPotentialSavings: number | null;
  /** Populated only when the observed SAME_OBSERVED set passes strict shadow agreement. */
  readonly safetyAdjustedNetPotentialSavings: number | null;
  readonly prospectiveRelayLatencyMs: number;
  readonly potentialNetTimeSavedMs: number;
  readonly breakEvenReuseRateByTime: number | null;
  readonly breakEvenReuseRateByCost: number | null;
  readonly assumptions: Readonly<{
    directReuseOnly: true;
    conditionalRequestSavingsExcluded: true;
    activeModeWouldNotObserveDirectReuseHits: true;
    callerSuppliedCostUnits: true;
    noSavingsClaimWhenSameObservedIsZero: true;
    authoritativeValidationAlwaysRuns: true;
    rawValuesRetainedByShadowProof: false;
    observeOffCriticalPath: boolean;
  }>;
}

export interface ShadowProofOptions {
  /** Maximum sanitized per-call records retained for a hostile natural-workload export. Overflow invalidates the export instead of silently truncating evidence. */
  benchmarkRecordLimit?: number;
}

export interface ShadowBenchmarkCall<T> {
  /** Simulated caller policy. It is evaluated only after the authoritative validation and can never suppress that validation. */
  reuse?: (check: CheckResult, knownValue: T) => ReuseDecision<T>;
  /** Whether an active non-reuse path would contribute an OBSERVE after this baseline validation. */
  observeAfterBaseline?: boolean;
  /** Caller-measured cost of the best existing non-shared validation path, in any consistent unit. */
  baselineCost?: number;
  /** Caller-assigned cost of one CHECK request in the same unit. */
  checkCost?: number;
  /** Caller-assigned cost of one OBSERVE request in the same unit. */
  observeCost?: number;
}

export interface NaturalWorkloadControls {
  local_cache: { available: boolean; measured: boolean };
  source_native_conditional: { available: boolean; measured: boolean };
  provider_native_cache: { available: boolean; measured: boolean };
}

export interface NaturalWorkloadBenchmarkRecord {
  readonly check_status: 'SAME_OBSERVED' | 'CHANGED_OBSERVED' | 'CONTESTED' | 'STALE' | 'UNKNOWN' | null;
  readonly policy_reusable: boolean;
  /** null means comparison was unavailable or the record was not policy-reusable. */
  readonly reuse_would_match_validation: boolean | null;
  readonly observe_after_baseline: boolean;
  readonly baseline_ms: number;
  readonly baseline_cost: number;
  readonly check_ms: number;
  readonly observe_ms: number;
  readonly check_cost: number;
  readonly observe_cost: number;
}

export interface NaturalWorkloadBenchmarkInputV2 {
  readonly schema_version: 2;
  readonly workload_id: string | null;
  readonly sample_type: 'natural_workload';
  readonly baseline_definition: 'best_existing_non_shared_path';
  readonly controls: Readonly<NaturalWorkloadControls>;
  readonly observe_off_critical_path: boolean;
  readonly records: readonly Readonly<NaturalWorkloadBenchmarkRecord>[];
}

export interface NaturalWorkloadBenchmarkSnapshot {
  readonly recordsRetained: number;
  readonly recordsDropped: number;
  readonly recordLimit: number;
  readonly invalidReasons: readonly string[];
  readonly rawValuesRetained: false;
  readonly factIdentityRetained: false;
  readonly timestampsRetained: false;
}

export declare class SeenRelayShadowProof {
  constructor(client: SeenRelayClient, options?: ShadowProofOptions);
  reset(): void;
  snapshot(): ShadowProofSnapshot;
  benchmarkSnapshot(): NaturalWorkloadBenchmarkSnapshot;
  guard<T>(options: {
    fact: Record<string, unknown>;
    knownValue: T;
    validate: (context: { check: Record<string, unknown> | null; conditionalHeaders: Readonly<Record<string, string>> }) => T | Promise<T>;
    maxAgeSeconds?: number;
    observation?: (value: T, context: { check: Record<string, unknown> | null; conditionalHeaders: Readonly<Record<string, string>> }) => unknown | Promise<unknown>;
    /** Optional sanitized hostile-benchmark record. This never enables reuse. */
    benchmark?: ShadowBenchmarkCall<T>;
  }): Promise<T>;
  hostileBenchmarkInput(input: {
    workloadId?: string | null;
    controls: NaturalWorkloadControls;
    observeOffCriticalPath?: boolean;
  }): NaturalWorkloadBenchmarkInputV2;
  report(input?: ShadowEconomicsInput): ShadowEconomicsReport;
}
