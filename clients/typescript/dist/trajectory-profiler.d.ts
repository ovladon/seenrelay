export type TrajectorySampleType = 'natural_workload' | 'replayed' | 'commissioning' | 'synthetic';
export type TrajectoryOperationKind = 'model' | 'tool' | 'retrieval' | 'rerank' | 'embedding' | 'browser' | 'network' | 'memory' | 'destination' | 'storage' | 'other';
export type ProvenAlternativeTier = 'retrospective_only' | 'safely_predictable' | 'capturable_now';

/** Additive resource/work counters only. Wall-clock latency is represented by operation intervals and trajectory elapsed time. */
export interface TrajectoryWork {
  costUnits?: number;
  monetaryUsd?: number;
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
  trajectoryId: string;
  workloadId?: string;
  sampleType: TrajectorySampleType;
  baselineDefinition?: 'best_native_stack';
  /** SHA-256 evidence for the concrete best-native baseline configuration used. */
  baselineEvidenceFingerprint?: string;
  /** Identifier for the caller-defined normalization/pricing policy behind costUnits. */
  costUnitPolicyId?: string;
  /** SHA-256 fingerprint of the concrete normalization/pricing policy. */
  costUnitPolicyFingerprint?: string;
  startedAtMs?: number;
}

export interface RecordOperationInput {
  trajectoryId: string;
  operationId: string;
  parentOperationId?: string;
  kind: TrajectoryOperationKind;
  coordinateFingerprint?: string;
  status?: 'ok' | 'error';
  work?: TrajectoryWork;
  startedAtMs?: number;
  endedAtMs?: number;
}

export interface MeasureOperationInput extends Omit<RecordOperationInput, 'status' | 'startedAtMs' | 'endedAtMs'> {
  /** Runs only after the authoritative result exists; extractor failure never alters that result. */
  workFromResult?: (result: unknown) => TrajectoryWork | null | undefined;
}

export interface ProvenAlternativeInput {
  trajectoryId: string;
  operationId: string;
  alternativeId: string;
  tier: ProvenAlternativeTier;
  sameAcceptedOutcome: true;
  proofKind: string;
  proofFingerprint: string;
  predictionPolicyFingerprint?: string;
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
