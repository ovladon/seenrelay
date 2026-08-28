import type { SeenRelayZeroState, ZeroStateOptions } from './zero-state.js';

export interface McpToolPolicy {
  maxAgeMs?: number;
  relay?: unknown | ((params: any, rest: unknown[]) => unknown);
  coordinate?: (params: any, rest: unknown[]) => unknown;
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
  edge: unknown;
}

export type ProtectedMcpClient<T extends object> = T & {
  readonly seenRelayZeroState: {
    readonly edge: SeenRelayZeroState;
    getTelemetry(): Readonly<SeenRelayMcpTelemetry>;
  };
};

export declare function protectMcpClient<T extends object>(client: T, options?: ProtectMcpClientOptions): ProtectedMcpClient<T>;
