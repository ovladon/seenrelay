import type { McpToolPolicy, ProtectedMcpClient } from './mcp-auto.js';

export interface AmbientMcpOptions {
  serverKey?: string;
  maxCoordinates?: number;
  /** Exact tool names enabled for the existing active local-first guard path. Omitted tools remain local-shadow only. */
  tools?: Record<string, McpToolPolicy>;
  edge?: unknown;
  edgeOptions?: unknown;
}

export interface AmbientMcpToolReport {
  readonly tool: string;
  readonly calls: number;
  readonly measured_calls: number;
  readonly first_observations: number;
  readonly exact_repeat_validations: number;
  readonly exact_unchanged_repeats: number;
  readonly exact_changed_repeats: number;
  readonly refused_measurements: number;
  readonly exact_repeat_rate: number;
  readonly exact_unchanged_repeat_rate: number;
  readonly upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead: number;
}

export interface AmbientMcpReport {
  readonly schema: 'seenrelay-ambient-mcp-report-v0';
  readonly server_key: string;
  readonly calls: number;
  readonly shadow_calls: number;
  readonly active_policy_calls: number;
  readonly authoritative_failures: number;
  readonly measured_shadow_calls: number;
  readonly exact_repeat_validations: number;
  readonly exact_unchanged_repeats: number;
  readonly exact_changed_repeats: number;
  readonly refused_measurements: number;
  readonly authoritative_shadow_ms_total: number;
  readonly upper_bound_avoidable_calls_before_native_and_check_overhead: number;
  readonly upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead: number;
  readonly candidate_tools: readonly AmbientMcpToolReport[];
  readonly tools: readonly AmbientMcpToolReport[];
  readonly interpretation: Readonly<{
    savings_proven: false;
    native_controls_measured: false;
    relay_check_overhead_measured: false;
    automatic_reuse_authorized: false;
    public_claim_authorized: false;
    exact_repetition_only: true;
    next_step: string;
  }>;
}

export type AmbientMcpClient<T extends object> = ProtectedMcpClient<T> & {
  readonly seenRelayAmbient: {
    readonly schema: 'seenrelay-ambient-mcp-v0';
    readonly mode: 'shadow-by-default-active-by-explicit-tool';
    readonly serverKey: string;
    readonly network_calls_from_shadow: 0;
    readonly shared_check_from_shadow: false;
    readonly observe_from_shadow: false;
    readonly raw_arguments_retained: false;
    readonly raw_results_retained: false;
    readonly active_tools: readonly string[];
    getReport(): AmbientMcpReport;
    getTelemetry(): unknown;
  };
};

export declare function ambientMcpClient<T extends object>(client: T, options?: AmbientMcpOptions): AmbientMcpClient<T>;

export interface AmbientOpenAIAgentsOptions extends AmbientMcpOptions {
  /** Optional independent policies for callToolResult(), whose serializable result shape may differ from callTool(). */
  callToolResultTools?: Record<string, McpToolPolicy>;
}
export declare function ambientOpenAIAgentsMcpServer<T extends object>(server: T, options?: AmbientOpenAIAgentsOptions): T & {
  readonly seenRelayAmbient: {
    readonly schema: 'seenrelay-ambient-openai-agents-js-mcp-v0';
    readonly framework: '@openai/agents';
    readonly boundary: 'completed-call';
    readonly serverKey: string;
    getReport(): unknown;
    getTelemetry(): unknown;
  };
};

export interface AmbientAiSdkMcpToolsOptions { serverKey?: string; maxCoordinates?: number; }
export declare function ambientAiSdkMcpTools<T extends Record<string, any>>(toolSet: T, options?: AmbientAiSdkMcpToolsOptions): {
  readonly tools: T;
  readonly seenRelayAmbient: {
    readonly schema: 'seenrelay-ambient-ai-sdk-mcp-tools-v0';
    readonly framework: 'ai-sdk';
    readonly boundary: 'tool.execute';
    readonly serverKey: string;
    readonly active_reuse_enabled: false;
    getReport(): unknown;
  };
};
