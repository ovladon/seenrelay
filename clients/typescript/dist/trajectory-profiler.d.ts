export type TrajectorySampleType = 'natural_workload' | 'replayed' | 'commissioning' | 'synthetic';
export type TrajectoryOperationKind = 'model' | 'tool' | 'retrieval' | 'rerank' | 'embedding' | 'browser' | 'network' | 'memory' | 'destination' | 'storage' | 'other';
export type ProvenAlternativeTier = 'retrospective_only' | 'safely_predictable' | 'capturable_now';

export interface TrajectoryWork {
  costUnits?: number;
  monetaryUsd?: number;
  wallMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  retrievalUnits?: number;
  rerankUnits?: number;
  embeddingUnits?: number;
  toolCalls?: number;
  apiRequests?: number;
  browserMs?: number;
  networkRequests?: number;
  networkBytes?: number;
  destinationComputeMs?: number;
  storageOps?: number;
  retryCount?: number;
}

export interface StartTrajectoryInput {
  /** Opaque metadata identifier; raw/private content must not be encoded here. */
  trajectoryId: string;
  /** Opaque metadata identifier; raw/private content must not be encoded here. */
  workloadId?: string;
  sampleType: TrajectorySampleType;
  baselineDefinition?: 'best_native_stack';
  /** Identifies the caller's explicit normalization/pricing policy for comparable costUnits. */
  costUnitPolicyId?: string;
  startedAtMs?: number;
}

export interface RecordOperationInput {
  trajectoryId: string;
  /** Opaque metadata identifier; raw/private content must not be encoded here. */
  operationId: string;
  parentOperationId?: string;
  kind: TrajectoryOperationKind;
  /** Opaque deterministic SHA-256 coordinate; raw prompts/arguments are not accepted by this module. */
  coordinateFingerprint?: string;
  status?: 'ok' | 'error';
  work?: TrajectoryWork;
  startedAtMs?: number;
  endedAtMs?: number;
}

export interface MeasureOperationInput extends Omit<RecordOperationInput, 'status' | 'startedAtMs' | 'endedAtMs'> {
  /** Optional extractor used only after the authoritative call completes. Its failures never alter the call result. */
  workFromResult?: (result: unknown) => TrajectoryWork | null | undefined;
}

export interface ProvenAlternativeInput {
  trajectoryId: string;
  operationId: string;
  /** Opaque metadata identifier; raw/private content must not be encoded here. */
  alternativeId: string;
  tier: ProvenAlternativeTier;
  /** Must be explicitly true; the profiler never infers semantic or causal equivalence. */
  sameAcceptedOutcome: true;
  /** Short opaque proof-class identifier, not proof text or customer content. */
  proofKind: string;
  proofFingerprint: string;
  /** Required when tier is safely_predictable or capturable_now. Identifies the prospective decision rule tested against the trajectory. */
  predictionPolicyFingerprint?: string;
  /** Required when tier is capturable_now. Identifies the currently implementable mechanism including its constraints. */
  captureMechanismFingerprint?: string;
  replacementWork?: TrajectoryWork;
  decisionOverheadCostUnits?: number;
}

export interface FinishTrajectoryInput {
  trajectoryId: string;
  outcome: {
    completed: boolean;
    correct: boolean;
    safetyAcceptable: boolean;
  };
  /** Evidence for completed/correct/safe outcome. Without it, headroom is not research-admissible. */
  outcomeEvidenceFingerprint?: string;
  endedAtMs?: number;
}

export interface ShadowTrajectoryProfilerOptions {
  now?: () => number;
}

export declare class ShadowTrajectoryProfiler {
  constructor(options?: ShadowTrajectoryProfilerOptions);
  startTrajectory(input: StartTrajectoryInput): string;
  recordOperation(input: RecordOperationInput): Readonly<Record<string, unknown>>;
  recordProvenAlternative(input: ProvenAlternativeInput): Readonly<Record<string, unknown>>;
  finishTrajectory(input: FinishTrajectoryInput): Readonly<Record<string, unknown>>;
  measureOperation<T>(input: MeasureOperationInput, fn: () => T | Promise<T>): Promise<T>;
  getReport(trajectoryId: string): Readonly<Record<string, unknown>>;
}

export declare function createShadowTrajectoryProfiler(options?: ShadowTrajectoryProfilerOptions): ShadowTrajectoryProfiler;
