export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export interface FactLocator {
    scheme: 'json_pointer' | 'element_id' | 'source_key';
    value: string;
}
export interface FactDescriptor {
    subject: string;
    predicate: string;
    source: string;
    qualifiers?: Record<string, JsonValue>;
    locator?: FactLocator;
}
export type CheckStatus = 'SAME_OBSERVED' | 'CHANGED_OBSERVED' | 'CONTESTED' | 'STALE' | 'UNKNOWN';
export interface SourceValidator {
    kind: 'etag' | 'last_modified' | 'content_hash' | 'other';
    value: string;
}
export interface CheckResult {
    status: CheckStatus;
    fact_key?: string;
    latest_observed_value?: JsonValue;
    source_validator?: SourceValidator;
    source_validator_assurance?: 'observer_supplied_unverified';
    conditional_request_hint?: {
        request_header: string;
        header_value: string;
    };
    next_step?: string;
    [key: string]: unknown;
}
export type ReuseDecision<T> = {
    reuse: true;
    value: T;
} | {
    reuse: false;
};
export interface ValidationContext {
    check: CheckResult | null;
    /** Safe subset derived from SeenRelay's conditional_request_hint. */
    conditionalHeaders: Readonly<Record<string, string>>;
}
export interface ObservationMetadata {
    observedAt?: string;
    observerId?: string;
    evidenceFingerprint?: string;
    sourceValidator?: SourceValidator;
    idempotencyKey?: string;
}
export interface GuardOptions<T> {
    fact: FactDescriptor;
    knownValue: T;
    validate: (context: ValidationContext) => Promise<T> | T;
    /**
     * Local risk policy. Omit it to stay in shadow/validate-always mode.
     * SeenRelay never decides that evidence is safe enough to reuse.
     */
    reuse?: (check: CheckResult, knownValue: T) => ReuseDecision<T>;
    maxAgeSeconds?: number;
    observation?: (value: T, context: ValidationContext) => Promise<ObservationMetadata | undefined> | ObservationMetadata | undefined;
}
export interface GuardDetailedResult<T> {
    value: T;
    path: 'reused' | 'validated';
    check: CheckResult | null;
    relay: {
        checkOk: boolean;
        observeOk: boolean | null;
        checkError?: string;
        observeError?: string;
    };
}
export interface SeenRelayTelemetry {
    guardCalls: number;
    checkCalls: number;
    checkSuccesses: number;
    checkFailures: number;
    checkTimeouts: number;
    checkNetworkRequests: number;
    checkCoalesced: number;
    checkNetworkLatencyMsTotal: number;
    checkNetworkLatencyMsMax: number;
    checkNetworkLatencyMsAverage: number;
    reuseHits: number;
    validationCalls: number;
    conditionalHintValidations: number;
    observeAttempts: number;
    observeSuccesses: number;
    observeFailures: number;
    observeTimeouts: number;
    observeNetworkRequests: number;
    observeNetworkLatencyMsTotal: number;
    observeNetworkLatencyMsMax: number;
    observeNetworkLatencyMsAverage: number;
}
export interface ReuseEconomicsInput {
    /** Cost of one full validation in any consistent unit: USD, credits, tokens, etc. */
    avoidedValidationCost: number;
    /** Optional direct cost of one SeenRelay CHECK request in the same unit. */
    checkRequestCost?: number;
    /** Optional direct cost of one SeenRelay OBSERVE request in the same unit. */
    observeRequestCost?: number;
}
export interface ReuseEconomicsEstimate {
    grossAvoidedValidationCost: number;
    relayRequestCost: number;
    netEstimatedSavings: number;
    /** Conditional-request savings are application-specific and intentionally excluded. */
    excludesConditionalRequestSavings: true;
}
export interface SeenRelayClientOptions {
    baseUrl?: string;
    /** Optional self-asserted client hint; not an identity proof. */
    clientHint?: string;
    initialLease?: string;
    onLease?: (lease: string) => void;
    checkTimeoutMs?: number;
    observeTimeoutMs?: number;
    /** Coalesce only request-equivalent CHECKs that overlap in time. No result cache is retained. */
    coalesceChecks?: boolean;
    fetchImpl?: typeof fetch;
}
export declare function reuseKnownOnSameObserved<T>(check: CheckResult, knownValue: T): ReuseDecision<T>;
export declare class SeenRelayClient {
    private readonly baseUrl;
    private readonly clientHint?;
    private readonly onLease?;
    private readonly checkTimeoutMs;
    private readonly observeTimeoutMs;
    private readonly coalesceChecks;
    private readonly fetchImpl;
    private readonly inflightChecks;
    private metrics;
    private lease?;
    constructor(options?: SeenRelayClientOptions);
    getLease(): string | undefined;
    setLease(lease: string | undefined): void;
    getTelemetry(): Readonly<SeenRelayTelemetry>;
    resetTelemetry(): void;
    estimateReuseEconomics(input: ReuseEconomicsInput): ReuseEconomicsEstimate;
    guard<T>(options: GuardOptions<T>): Promise<T>;
    guardDetailed<T>(options: GuardOptions<T>): Promise<GuardDetailedResult<T>>;
    private commonHeaders;
    private updateLease;
    private post;
    private checkCoalescingKey;
    private check;
    private checkNetwork;
    private observe;
}
