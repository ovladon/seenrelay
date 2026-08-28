import { SeenRelayZeroState, freshResult } from './zero-state.js';

function nonEmptyText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function nonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return value;
}

function emptyTelemetry() {
  return { calls: 0, protectedCalls: 0, passthroughCalls: 0, ambiguousMatches: 0 };
}

export function exactToolAdapter(options) {
  if (!options || !Array.isArray(options.toolNames) || options.toolNames.length === 0) {
    throw new TypeError('toolNames must be a non-empty array');
  }
  const names = new Set(options.toolNames.map((name, index) => nonEmptyText(name, `toolNames[${index}]`)));
  const maxAgeMs = nonNegativeFinite(options.maxAgeMs ?? 30_000, 'maxAgeMs');
  return Object.freeze({
    name: options.name?.trim() || `exact:${[...names].sort().join(',')}`,
    matches(call) {
      return Boolean(call && typeof call === 'object' && typeof call.name === 'string' && names.has(call.name));
    },
    coordinate(call) {
      return { protocol: 'tool-call-v1', name: call.name, arguments: call.arguments ?? {} };
    },
    maxAgeMs,
    relay: options.relay,
    prepare: options.prepare,
    normalizeResult: options.normalizeResult
  });
}

export class SeenRelayAuto {
  constructor(options = {}) {
    this.edge = options.edge ?? new SeenRelayZeroState(options.edgeOptions);
    this.adapters = Object.freeze([...(options.adapters ?? [])]);
    this.metrics = emptyTelemetry();
    for (const [index, adapter] of this.adapters.entries()) {
      if (!adapter || typeof adapter.matches !== 'function' || typeof adapter.coordinate !== 'function') {
        throw new TypeError(`adapters[${index}] must provide matches() and coordinate()`);
      }
    }
  }

  getTelemetry() {
    return Object.freeze({ ...this.metrics, edge: this.edge.getTelemetry() });
  }

  resetTelemetry() {
    this.metrics = emptyTelemetry();
    this.edge.resetTelemetry();
  }

  wrap(execute) {
    if (typeof execute !== 'function') throw new TypeError('execute must be a function');
    return async (call) => {
      this.metrics.calls += 1;
      const matches = this.adapters.filter((adapter) => adapter.matches(call));
      if (matches.length === 0) {
        this.metrics.passthroughCalls += 1;
        return execute(call);
      }
      if (matches.length > 1) {
        this.metrics.ambiguousMatches += 1;
        throw new Error(`SeenRelay auto adapter ambiguity: ${matches.map((adapter) => adapter.name ?? 'unnamed').join(', ')}`);
      }
      this.metrics.protectedCalls += 1;
      const adapter = matches[0];
      const relay = typeof adapter.relay === 'function' ? adapter.relay(call) : adapter.relay;
      const outcome = await this.edge.guard({
        coordinate: adapter.coordinate(call),
        maxAgeMs: adapter.maxAgeMs,
        ...(relay ? { relay } : {}),
        validate: async (context) => {
          const prepared = typeof adapter.prepare === 'function'
            ? await adapter.prepare(call, context)
            : call;
          const result = await execute(prepared);
          if (typeof adapter.normalizeResult === 'function') return adapter.normalizeResult(result, prepared, context);
          return result;
        }
      });
      return outcome.value;
    };
  }
}

export function protectToolDispatcher(execute, options = {}) {
  const auto = new SeenRelayAuto(options);
  return Object.freeze({ execute: auto.wrap(execute), auto });
}

export function jsonHttpToolAdapter(options) {
  const base = exactToolAdapter(options);
  if (typeof options.urlFromCall !== 'function') throw new TypeError('urlFromCall must be a function');
  const headerField = options.headerField ?? 'headers';
  return Object.freeze({
    ...base,
    async prepare(call, context) {
      const prepared = options.prepare ? await options.prepare(call, context) : { ...call, arguments: { ...(call.arguments ?? {}) } };
      const args = { ...(prepared.arguments ?? {}) };
      const current = args[headerField];
      if (current !== undefined && (!current || typeof current !== 'object' || Array.isArray(current))) {
        throw new TypeError(`${headerField} must be an object when present`);
      }
      args[headerField] = { ...(current ?? {}), ...context.conditionalHeaders };
      return { ...prepared, arguments: args };
    },
    coordinate(call) {
      return {
        protocol: 'http-read-v1',
        tool: call.name,
        url: options.urlFromCall(call),
        arguments: options.identityFromCall ? options.identityFromCall(call) : call.arguments ?? {}
      };
    },
    normalizeResult(result, call, context) {
      if (options.normalizeResult) return options.normalizeResult(result, call, context);
      const validator = options.sourceValidatorFromResult?.(result, call);
      return freshResult(result, validator);
    }
  });
}
