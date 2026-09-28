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
  codecFailures: number;
  followerTimeouts: number;
  oversizeResults: number;
}

export declare class SeenRelayFleetCoordinator {
  constructor(options: SeenRelayFleetCoordinatorOptions);
  getTelemetry(): Readonly<FleetTelemetry>;
  run<T>(options: FleetRunOptions<T>): Promise<T>;
}
