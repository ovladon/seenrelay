import type { SeenRelayZeroState, ZeroStateOptions, ValidationContext } from './zero-state.js';

export type McpFreshnessWindow = number | ((params: any, rest: unknown[]) => number | undefined);

export interface McpToolPolicy {
  maxAgeMs?: McpFreshnessWindow;
  privateMaxAgeMs?: McpFreshnessWindow;
  relay?: unknown | ((params: any, rest: unknown[]) => unknown);
  coordinate?: (params: any, rest: unknown[]) => unknown;
  eligible?: (params: any, rest: unknown[]) => boolean;
  /** Provider-independent result classifier. Return freshResult/notModifiedResult/uncacheableResult when the raw MCP result needs explicit freshness semantics. */
  normalizeResult?: (result: any, params: any, rest: unknown[], context: ValidationContext) => unknown | Promise<unknown>;
}

export interface ProtectMcpClientOptions {
  serverKey?: string;
  edge?: SeenRelayZeroState;
  edgeOptions?: ZeroStateOptions;
  tools?: Record<string, McpToolPolicy>;
}

export interface SeenRelayMcpTelemetry {
  callToolCalls: number;
  protectedCalls: number;
  passthroughCalls: number;
  optionPassthroughCalls: number;
  ineligiblePassthroughCalls: number;
  edge: unknown;
}

export type ProtectedMcpClient<T extends object> = T & {
  readonly seenRelayZeroState: {
    readonly edge: SeenRelayZeroState;
    getTelemetry(): Readonly<SeenRelayMcpTelemetry>;
  };
};

export declare function protectMcpClient<T extends object>(client: T, options?: ProtectMcpClientOptions): ProtectedMcpClient<T>;
