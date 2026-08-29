import type { FirecrawlShadowPilotControl, FirecrawlShadowPilotOptions } from './firecrawl-shadow.js';

export type FirecrawlSdkShadowPilotOptions = FirecrawlShadowPilotOptions;

export interface FirecrawlSdkLikeClient {
  scrape?(url: string, options?: Record<string, unknown>): Promise<unknown>;
  scrapeUrl?(url: string, options?: Record<string, unknown>): Promise<unknown>;
}

export type FirecrawlSdkShadowBoundClient<T extends object> = T & {
  readonly seenRelayFirecrawlSdkShadowPilot: FirecrawlShadowPilotControl;
};

/**
 * Measure counterfactual SeenRelay reuse around direct Firecrawl JavaScript SDK scrape calls.
 * The original SDK method always runs with its original arguments and its raw result is returned
 * unchanged. This helper never enables active reuse.
 */
export declare function createFirecrawlSdkShadowPilot<T extends object>(
  client: T,
  options?: FirecrawlSdkShadowPilotOptions
): FirecrawlSdkShadowBoundClient<T>;
