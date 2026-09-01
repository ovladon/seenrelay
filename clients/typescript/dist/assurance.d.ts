export interface SharedEvidencePolicyOptions {
  minObserverKeys?: number;
  minCryptographicObserverKeys?: number;
  minReuseIndependenceBuckets?: number;
  /** Optional stricter caller window in seconds, in addition to CHECK's own max-age window. */
  maxAgeSeconds?: number;
}
export interface SharedEvidenceAssessment {
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly evidence?: Readonly<{ observer_keys: number; cryptographic_observer_keys: number; reuse_independence_buckets: number; age_seconds: number | null; check_max_age_seconds: number | null; }>;
  readonly policy?: Readonly<Required<Omit<SharedEvidencePolicyOptions, 'maxAgeSeconds'>> & { maxAgeSeconds?: number }>;
  readonly caveat: string;
}
/** Assess shared evidence under caller-selected thresholds. This is not a truth or real-world independence score. */
export declare function assessSharedCheckEvidence(check: any, options?: SharedEvidencePolicyOptions): SharedEvidenceAssessment;
/** Explicit opt-in multi-signal helper for Zero-State reuseRetained. Its three signal thresholds cannot be set below 2. */
export declare function createMultiSignalRetainedReusePolicy<T = unknown>(options?: SharedEvidencePolicyOptions): (check: any, retainedValue: T, evidenceValue: unknown) => boolean;
export declare const sharedEvidenceCaveat: string;
