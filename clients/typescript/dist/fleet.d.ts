import type { PrivateCodec } from './zero-state.js';

export type FleetSideEffectClass = 'read_only' | 'idempotent_read' | 'mutation' | 'unknown';

export interface FleetNativeControl {
  exactResponseCache?: boolean;
  cacheHitMarginalCostZero?: boolean;
}

export interface FleetExecutionPolicy {
  sideEffectClass: FleetSideEffectClass;
  exactSingleAnswerShareable?: boolean;
  independentSamplesRequired?: boolean;
  nativeControl?: FleetNativeControl;
}

export interface FleetCostInput<T = unknown> {
  /** Fixed marginal cost estimate for one authoritative execution. */
  marginalCostUsd?: number;
  /** Explicit provenance label, e.g. provider_reported, provider_list_price, caller_measured, caller_estimate. */
  provenance?: string;
  /** Optional caller-owned resolver when marginal cost depends on the authoritative result. */
  resolveMarginalCostUsd?(value: T): number | null | undefined | Promise<number | null | undefined>;
}

export type FleetSavingsReceiptPath =
  | 'policy_passthrough'
  | 'native_control_passthrough'
  | 'fail_open_coordinate'
  | 'fail_open_store_claim'
  | 'leader_codec_fail_local_result'
  | 'leader_oversize_local_result'
  | 'leader_execution'
  | 'fail_open_store_read'
  | 'follower_reuse'
  | 'fail_open_codec'
  | 'fail_open_missing_generation'
  | 'fail_open_lease_expired'
  | 'fail_open_wait_timeout';

export interface FleetSavingsReceipt {
  schema: 'seenrelay-fleet-savings-receipt-v0';
  /** Opaque exact-coordinate hash; never the raw coordinate. */
  coordinateHash: string | null;
  path: FleetSavingsReceiptPath;
  role: 'leader' | 'follower' | 'passthrough' | 'fail_open';
  executedAuthoritative: boolean;
  reusedFollower: boolean;
  avoidedExecutions: number;
  marginalCostUsd: number | null;
  costProvenance: string | null;
  costResolution: 'not_provided' | 'unknown' | 'resolved' | 'fixed' | 'resolver_failed';
  grossAvoidedCostUsd: number | null;
  createdAt: string;
}

export interface FleetSavingsLedgerSnapshot {
  schema: 'seenrelay-fleet-savings-ledger-v0';
  receipts: number;
  authoritativeExecutions: number;
  followerReuses: number;
  avoidedExecutions: number;
  grossAvoidedCostUsd: number;
  costedAvoidedExecutions: number;
  uncostedAvoidedExecutions: number;
  receiptPaths: Readonly<Record<string, number>>;
  costProvenance: Readonly<Record<string, number>>;
}

export interface FleetSavingsLedger {
  record(receipt: FleetSavingsReceipt): void;
  snapshot(): Readonly<FleetSavingsLedgerSnapshot>;
}

export declare function createFleetSavingsLedger(): FleetSavingsLedger;

export interface FleetCodecContext {
  scopeHash: string;
  coordinateKey: string;
  generation: string;
}

export interface FleetCodec {
  seal(value: unknown, context: FleetCodecContext): string | Uint8Array | Promise<string | Uint8Array>;
  open(sealedValue: string | Uint8Array, context: FleetCodecContext): unknown | Promise<unknown>;
}

export interface FleetClaim {
  role: 'leader' | 'follower';
  generation: string;
  expiresAtMs: number;
  pendingToken?: string;
}

export type FleetReadState =
  | { status: 'pending'; expiresAtMs: number }
  | { status: 'completed'; sealedResult: string | Uint8Array }
  | { status: 'failed' | 'missing' };

export interface FleetCoordinationStore {
  tryClaim(input: {
    scopeHash: string;
    coordinateKey: string;
    ownerId: string;
    leaseMs: number;
  }): FleetClaim | Promise<FleetClaim>;

  read(input: {
    scopeHash: string;
    coordinateKey: string;
    generation: string;
    pendingToken?: string;
  }): FleetReadState | Promise<FleetReadState>;

  publish(input: {
    scopeHash: string;
    coordinateKey: string;
    generation: string;
    ownerId: string;
    pendingToken?: string;
    sealedResult: string | Uint8Array;
  }): boolean | Promise<boolean>;

  fail(input: {
    scopeHash: string;
    coordinateKey: string;
    generation: string;
    ownerId: string;
    pendingToken?: string;
  }): boolean | Promise<boolean>;
}

export interface InMemoryFleetCoordinationStoreOptions {
  now?: () => number;
}

export declare class InMemoryFleetCoordinationStore implements FleetCoordinationStore {
  constructor(options?: InMemoryFleetCoordinationStoreOptions);
  tryClaim(input: Parameters<FleetCoordinationStore['tryClaim']>[0]): Promise<FleetClaim>;
  read(input: Parameters<FleetCoordinationStore['read']>[0]): Promise<FleetReadState>;
  publish(input: Parameters<FleetCoordinationStore['publish']>[0]): Promise<boolean>;
  fail(input: Parameters<FleetCoordinationStore['fail']>[0]): Promise<boolean>;
}

export interface RedisRestFleetStoreOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
  prefix?: string;
  resultTtlMs?: number;
  completionGraceMs?: number;
  failureGraceMs?: number;
  now?: () => number;
}

export declare function createRedisRestFleetStore(options: RedisRestFleetStoreOptions): FleetCoordinationStore;

export interface SeenRelayFleetShadowMeterOptions {
  store: Pick<FleetCoordinationStore, 'tryClaim' | 'fail'>;
  /** Opaque caller-controlled fleet/tenant scope. Different scopes never classify each other as overlap. */
  scopeKey: string;
  ownerId?: string;
  /** Shadow lease horizon for one authoritative execution. */
  leaseMs?: number;
}

export interface FleetShadowMeasureOptions<T> {
  /** Exact caller-defined identity. Include every result-affecting qualifier. */
  coordinate: unknown;
  /** Measurement counts overlap only for explicitly single-answer-shareable read-only work. */
  policy: FleetExecutionPolicy;
  /** Original authoritative operation. Shadow measurement never suppresses it. */
  execute(): T | Promise<T>;
  /** Optional observed marginal cost. It is measurement metadata only. */
  cost?: number | FleetCostInput<T>;
}

export interface FleetShadowOverlapReport {
  schema: 'seenrelay-fleet-shadow-overlap-report-v0';
  mode: 'shadow';
  authoritativeSuppressionEnabled: false;
  calls: number;
  eligibleCalls: number;
  policyIneligibleCalls: number;
  nativeControlDominatedCalls: number;
  classifiedEligibleCalls: number;
  unclassifiedEligibleCalls: number;
  shadowLeaderStarts: number;
  callsWithIdenticalInflightPredecessor: number;
  classifiedOverlapStartFraction: number | null;
  authoritativeExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  storeFailures: number;
  coordinateFailures: number;
  leaseReleaseMisses: number;
  costResolutionFailures: number;
  costedExecutions: number;
  uncostedExecutions: number;
  /** Sum of caller-supplied/resolved costs actually incurred during shadow execution. */
  observedCostUsd: number;
  overlappedFollowerCostedExecutions: number;
  /** Observed cost incurred by calls that started while the same eligible coordinate already had a shadow leader. Not an avoided-savings claim. */
  overlappedFollowerObservedCostUsd: number;
  costProvenance: Readonly<Record<string, number>>;
}

export declare class SeenRelayFleetShadowMeter {
  constructor(options: SeenRelayFleetShadowMeterOptions);
  getReport(): Readonly<FleetShadowOverlapReport>;
  /** Always executes the authoritative operation and returns that call's own result. */
  measure<T>(options: FleetShadowMeasureOptions<T>): Promise<T>;
}

export interface FleetShadowCallWrapperOptions<TArgs extends unknown[] = unknown[], TResult = unknown> {
  /** Explicit semantic eligibility; plumbing is automatic but shareability is never inferred. */
  policy: FleetExecutionPolicy;
  /**
   * Optional exact coordinate builder. Defaults to the full argument list.
   * Throwing or returning a non-JSON-serializable value leaves the call unclassified but never suppresses it.
   */
  coordinateFromArgs?: (...args: TArgs) => unknown;
  /** Optional observed marginal cost metadata. It never authorizes coordination. */
  cost?: number | FleetCostInput<TResult>;
}

/**
 * Wrap one selected call in distributed shadow overlap measurement.
 * The original function always executes and its receiver context is preserved.
 */
export declare function wrapFleetShadowCall<TArgs extends unknown[], TResult>(
  meter: SeenRelayFleetShadowMeter,
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  options: FleetShadowCallWrapperOptions<TArgs, Awaited<TResult>>
): (...args: TArgs) => Promise<Awaited<TResult>>;

export declare function fleetCodecFromPrivateCodec(privateCodec: PrivateCodec): FleetCodec;

export interface SeenRelayFleetCoordinatorOptions {
  store: FleetCoordinationStore;
  codec: FleetCodec;
  /** Opaque caller-controlled fleet/tenant scope. Different scopes never coordinate. */
  scopeKey: string;
  ownerId?: string;
  leaseMs?: number;
  pollMs?: number;
  maxWaitMs?: number;
  maxSealedBytes?: number;
  now?: () => number;
}

export interface FleetRunOptions<T> {
  /** Exact caller-defined identity. Include every result-affecting qualifier. */
  coordinate: unknown;
  /** Active coordination requires explicit read-only + single-answer shareability. */
  policy: FleetExecutionPolicy;
  /** Original authoritative operation. It remains the fail-open fallback. */
  execute(): T | Promise<T>;
  /**
   * Optional marginal cost for one authoritative execution.
   * A bare number is treated as caller_estimate. Cost never authorizes coordination.
   */
  cost?: number | FleetCostInput<T>;
  /** Best-effort local callback. Receipt callback failures never change the operation result. */
  onReceipt?(receipt: FleetSavingsReceipt): void | Promise<void>;
}

export interface FleetTelemetry {
  calls: number;
  policyPassthrough: number;
  nativeControlPassthrough: number;
  leaderClaims: number;
  leaderExecutions: number;
  followerJoins: number;
  followerReuses: number;
  failOpenExecutions: number;
  storeFailures: number;
  coordinateFailures: number;
  codecFailures: number;
  followerTimeouts: number;
  oversizeResults: number;
  avoidedExecutions: number;
  grossAvoidedCostUsd: number;
  costedAvoidedExecutions: number;
  receiptFailures: number;
}

export declare class SeenRelayFleetCoordinator {
  constructor(options: SeenRelayFleetCoordinatorOptions);
  getTelemetry(): Readonly<FleetTelemetry>;
  run<T>(options: FleetRunOptions<T>): Promise<T>;
}
