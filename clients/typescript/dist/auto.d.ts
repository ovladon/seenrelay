import type { SeenRelayZeroState, ZeroStateOptions, ValidationContext, SourceValidator } from './zero-state.js';

export interface ToolCall {
  name: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AutoAdapter<TCall = ToolCall, TResult = unknown> {
  name?: string;
  matches(call: TCall): boolean;
  coordinate(call: TCall): unknown;
  maxAgeMs?: number;
  relay?: unknown | ((call: TCall) => unknown);
  prepare?: (call: TCall, context: ValidationContext) => TCall | Promise<TCall>;
  normalizeResult?: (result: TResult, call: TCall, context: ValidationContext) => unknown;
}

export interface ExactToolAdapterOptions<TCall = ToolCall, TResult = unknown> {
  name?: string;
  toolNames: string[];
  maxAgeMs?: number;
  relay?: unknown | ((call: TCall) => unknown);
  prepare?: (call: TCall, context: ValidationContext) => TCall | Promise<TCall>;
  normalizeResult?: (result: TResult, call: TCall, context: ValidationContext) => unknown;
}

export declare function exactToolAdapter<TCall = ToolCall, TResult = unknown>(options: ExactToolAdapterOptions<TCall, TResult>): AutoAdapter<TCall, TResult>;

export interface JsonHttpToolAdapterOptions<TCall = ToolCall, TResult = unknown> extends ExactToolAdapterOptions<TCall, TResult> {
  urlFromCall(call: TCall): string;
  identityFromCall?: (call: TCall) => unknown;
  headerField?: string;
  sourceValidatorFromResult?: (result: TResult, call: TCall) => SourceValidator | undefined;
}

export declare function jsonHttpToolAdapter<TCall = ToolCall, TResult = unknown>(options: JsonHttpToolAdapterOptions<TCall, TResult>): AutoAdapter<TCall, TResult>;

export interface SeenRelayAutoOptions {
  edge?: SeenRelayZeroState;
  edgeOptions?: ZeroStateOptions;
  adapters?: AutoAdapter[];
}

export declare class SeenRelayAuto {
  constructor(options?: SeenRelayAutoOptions);
  getTelemetry(): Readonly<Record<string, unknown>>;
  resetTelemetry(): void;
  wrap<TCall = ToolCall, TResult = unknown>(execute: (call: TCall) => Promise<TResult> | TResult): (call: TCall) => Promise<TResult>;
}

export declare function protectToolDispatcher<TCall = ToolCall, TResult = unknown>(
  execute: (call: TCall) => Promise<TResult> | TResult,
  options?: SeenRelayAutoOptions
): { readonly execute: (call: TCall) => Promise<TResult>; readonly auto: SeenRelayAuto };
