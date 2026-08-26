import type { SeenRelayClient } from './seenrelay.js';

export interface ShadowProofSnapshot {
  readonly calls: number;
  readonly checksWithoutUsableResponse: number;
  readonly conditionalHintsSeen: number;
  readonly validationMsTotal: number;
  readonly validationMsAverage: number;
  readonly sameObservedValidationMs: number;
  readonly statuses: Readonly<Record<'SAME_OBSERVED' | 'CHANGED_OBSERVED' | 'CONTESTED' | 'STALE' | 'UNKNOWN', number>>;
}

export interface ShadowEconomicsInput {
  avoidedValidationCost?: number;
  checkRequestCost?: number;
  observeRequestCost?: number;
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
