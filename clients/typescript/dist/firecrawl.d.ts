import type { PrivateCodec, PrivateStore, RelayClientLike } from './zero-state.js';
import type { McpToolPolicy, ProtectedMcpClient } from './mcp-auto.js';

export interface FirecrawlScrapePolicyOptions {
  /** Caller-owned fallback freshness window used only when the Firecrawl call does not provide maxAge. Defaults to 0. */
  maxAgeMs?: number;
  /**
   * Allow automatic public SeenRelay evidence for public, credential-free URLs.
   * Defaults to false. When enabled, raw scrape content is never sent; only the source URL,
   * representation contract/hash and a deterministic result fingerprint are shared.
   */
  publicEvidence?: boolean;
}

export declare function publicFirecrawlSource(value: unknown): string | null;
export declare function firecrawlResultFingerprint(result: unknown): string;
export declare function firecrawlScrapePolicy(options?: FirecrawlScrapePolicyOptions): McpToolPolicy;

export interface ProtectFirecrawlMcpClientOptions extends FirecrawlScrapePolicyOptions {
  /** Optional explicit SeenRelay client. If omitted, the adapter creates the standard public client. */
  relayClient?: RelayClientLike;
  /** SeenRelay service base URL used only when relayClient is omitted. */
  baseUrl?: string;
  /** Optional client continuity hint used only when relayClient is omitted. */
  clientHint?: string;
  serverKey?: string;
  privateStore?: PrivateStore;
  privateCodec?: PrivateCodec;
  validatorRetentionMs?: number;
  privateValidatorRetentionMs?: number;
  scheduleObserve?: (task: () => Promise<void>) => void;
}

export declare function protectFirecrawlMcpClient<T extends object>(
  client: T,
  options?: ProtectFirecrawlMcpClientOptions
): ProtectedMcpClient<T>;
