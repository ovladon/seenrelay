import type { SeenRelayClient } from './seenrelay.js';

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

export declare class SeenRelayShadowProof {
  constructor(client: SeenRelayClient);
  reset(): void;
  snapshot(): ShadowProofSnapshot;
  guard<T>(options: {
    fact: Record<string, unknown>;
    knownValue: T;
    validate: (context: { check: Record<string, unknown> | null; conditionalHeaders: Readonly<Record<string, string>> }) => T | Promise<T>;
    maxAgeSeconds?: number;
    observation?: (value: T, context: { check: Record<string, unknown> | null; conditionalHeaders: Readonly<Record<string, string>> }) => unknown | Promise<unknown>;
  }): Promise<T>;
  report(input?: ShadowEconomicsInput): ShadowEconomicsReport;
}
