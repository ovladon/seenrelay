import type { PrivateCodec, PrivateStore, RelayClientLike } from './zero-state.js';
import type { McpToolPolicy, ProtectedMcpClient } from './mcp-auto.js';

export interface FirecrawlScrapePolicyOptions {
  /** Fallback freshness window used only when the Firecrawl call does not provide maxAge. Defaults to 0. */
  maxAgeMs?: number;
  /** Share public-source URL + representation hash + result fingerprint with SeenRelay. Defaults to true for this explicit adapter. */
  publicEvidence?: boolean;
}

export declare function publicFirecrawlSource(value: unknown): string | null;
export declare function firecrawlScrapePolicy(options?: FirecrawlScrapePolicyOptions): McpToolPolicy;

export interface ProtectFirecrawlMcpClientOptions extends FirecrawlScrapePolicyOptions {
  relayClient: RelayClientLike;
  serverKey?: string;
  privateStore?: PrivateStore;
  privateCodec?: PrivateCodec;
  validatorRetentionMs?: number;
  privateValidatorRetentionMs?: number;
  scheduleObserve?: (task: () => Promise<void>) => void;
}

export declare function protectFirecrawlMcpClient<T extends object>(
  client: T,
  options: ProtectFirecrawlMcpClientOptions
): ProtectedMcpClient<T>;
