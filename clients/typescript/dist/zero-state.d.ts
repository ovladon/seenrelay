export type RelayMode = 'off' | 'sample' | 'always';

export interface SourceValidator {
  etag?: string;
  lastModified?: string;
}

export interface ValidationContext<T = unknown> {
  conditionalHeaders: Readonly<Record<string, string>>;
  priorValue?: T;
  priorSourceValidator?: SourceValidator;
}

export interface FreshResult<T> {
  readonly __seenrelay_zero_state_result_v1: 'fresh';
  readonly value: T;
  readonly sourceValidator?: SourceValidator;
}

export interface NotModifiedResult {
  readonly __seenrelay_zero_state_result_v1: 'not-modified';
  readonly sourceValidator?: SourceValidator;
}

export declare function freshResult<T>(value: T, validator?: SourceValidator): FreshResult<T>;
export declare function notModifiedResult(validator?: SourceValidator): NotModifiedResult;
export declare function sourceValidatorFromResponse(response: { headers?: { get(name: string): string | null } }): SourceValidator | undefined;

export interface PrivateStore {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, sealedValue: string): void | Promise<void>;
}

export interface PrivateCodec {
  seal(entry: unknown, coordinateKey: string): string | Promise<string>;
  open(sealedValue: string, coordinateKey: string): unknown | Promise<unknown>;
}

export declare function createAesGcmPrivateCodec(keyMaterial: Uint8Array): PrivateCodec;

export interface RelayClientLike {
  check(fact: unknown, knownValue: unknown, maxAgeSeconds?: number): Promise<any>;
  observe(fact: unknown, value: unknown, metadata?: unknown): Promise<any>;
}

export interface ZeroStateRelayOptions<T = unknown> {
  mode?: RelayMode;
  sampleRate?: number;
  fact: unknown;
  knownValue?: T;
  maxAgeSeconds?: number;
  contribute?: boolean;
  reuse?: (check: any, knownValue: T) => { reuse: boolean; value?: T };
}

export interface ZeroStateGuardOptions<T = unknown> {
  coordinate: unknown;
  maxAgeMs?: number;
  privateMaxAgeMs?: number;
  validate(context: ValidationContext<T>): Promise<T | FreshResult<T> | NotModifiedResult> | T | FreshResult<T> | NotModifiedResult;
  relay?: ZeroStateRelayOptions<T>;
}

export interface ZeroStateOptions {
  localMaxAgeMs?: number;
  validatorRetentionMs?: number;
  privateMaxAgeMs?: number;
  privateValidatorRetentionMs?: number;
  privateStore?: PrivateStore;
  privateCodec?: PrivateCodec;
  maxEntries?: number;
  relayMode?: RelayMode;
  relaySampleRate?: number;
  relayClient?: RelayClientLike;
  scheduleObserve?: (task: () => Promise<void>) => void;
  observeDelivery?: 'scheduled-only' | 'blocking';
  now?: () => number;
  random?: () => number;
}

export interface ZeroStateTelemetry {
  guardCalls: number;
  inflightCoalesced: number;
  localFreshHits: number;
  localUncacheableValues: number;
  privateReads: number;
  privateReadHits: number;
  privateFreshHits: number;
  privateWrites: number;
  privateReadFailures: number;
  privateWriteFailures: number;
  sourceConditionalAttempts: number;
  sourceNotModifiedHits: number;
  validationCalls: number;
  relayCheckCalls: number;
  relayCheckReuseHits: number;
  relayObserveScheduled: number;
  relayObserveScheduleFailures: number;
  relayObserveBlocking: number;
  relayObserveSkippedNoScheduler: number;
  relayObserveFailures: number;
  cacheEntries: number;
  inflightEntries: number;
}

export declare class SeenRelayZeroState {
  constructor(options?: ZeroStateOptions);
  getTelemetry(): Readonly<ZeroStateTelemetry>;
  resetTelemetry(): void;
  clearLocal(): void;
  protect<T>(options: ZeroStateGuardOptions<T>): () => Promise<any>;
  guard<T>(options: ZeroStateGuardOptions<T>): Promise<any>;
}

export interface ConditionalFetchValidatorOptions<T = unknown> {
  url: string | URL;
  init?: RequestInit;
  fetchImpl?: typeof fetch;
  decode?: (response: Response) => Promise<T> | T;
}

export declare function createConditionalFetchValidator<T = unknown>(options: ConditionalFetchValidatorOptions<T>): (context: ValidationContext<T>) => Promise<FreshResult<T | null> | NotModifiedResult>;
