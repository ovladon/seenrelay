import type { HostileBenchmarkEvaluation, HostileBenchmarkInput } from './economics.js';
import type { SeenRelayClient } from './seenrelay.js';

export interface FirecrawlMcpClient {
  callTool(params: Record<string, unknown>, ...rest: unknown[]): Promise<unknown>;
}

export interface FirecrawlShadowPilotOptions {
  relayClient?: Pick<SeenRelayClient, 'check' | 'observe'>;
  baseUrl?: string;
  clientHint?: string;
  maxAgeMs?: number;
  maxRecords?: number;
}

export interface FirecrawlShadowEvaluationOptions {
  workload_id?: string;
  local_cache: { available: boolean; measured: boolean };
  source_native_conditional: { available: boolean; measured: boolean };
  /** Required only when one or more provider responses omit a usable creditsUsed value. */
  provider_credit_fallback_units?: number;
}

export interface FirecrawlShadowReport {
  readonly schema_version: 1;
  readonly pilot: 'firecrawl-shadow-economics-v1';
  readonly behavior: 'authoritative_provider_call_never_suppressed';
  readonly records: number;
  readonly provider_credit_records: number;
  readonly provider_credit_unknown_records: number;
  readonly provider_credit_evidence_complete: boolean;
  readonly provider_credit_units_measured: number;
  readonly policy_reusable_calls: number;
  readonly policy_reusable_rate: number;
  readonly comparable_hypothetical_reuses: number;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface FirecrawlShadowPilotControl {
  flush(): Promise<void>;
  report(): FirecrawlShadowReport;
  hostileBenchmarkInput(options: FirecrawlShadowEvaluationOptions): Readonly<HostileBenchmarkInput>;
  evaluate(options: FirecrawlShadowEvaluationOptions): Readonly<HostileBenchmarkEvaluation>;
}

export type FirecrawlShadowBoundClient<T extends FirecrawlMcpClient> = T & {
  readonly seenRelayFirecrawlShadowPilot: FirecrawlShadowPilotControl;
};

/**
 * Measure counterfactual SeenRelay reuse around eligible public Firecrawl scrape calls.
 * The authoritative Firecrawl call always runs; this helper never enables active reuse.
 */
export declare class FirecrawlShadowPilot {
  constructor(client: FirecrawlMcpClient, options?: FirecrawlShadowPilotOptions);
  bind<T extends FirecrawlMcpClient>(): FirecrawlShadowBoundClient<T>;
  callTool(params: Record<string, unknown>, ...rest: unknown[]): Promise<unknown>;
  flush(): Promise<void>;
  report(): FirecrawlShadowReport;
  hostileBenchmarkInput(options: FirecrawlShadowEvaluationOptions): Readonly<HostileBenchmarkInput>;
  evaluate(options: FirecrawlShadowEvaluationOptions): Readonly<HostileBenchmarkEvaluation>;
}

export declare function createFirecrawlShadowPilot<T extends FirecrawlMcpClient>(
  client: T,
  options?: FirecrawlShadowPilotOptions
): FirecrawlShadowBoundClient<T>;
