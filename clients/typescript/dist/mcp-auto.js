import { SeenRelayZeroState } from './zero-state.js';

let bindingSequence = 0;

function nonEmptyText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function nonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return value;
}

function normalizeWindow(value, name) {
  if (typeof value === 'function') return value;
  return nonNegativeFinite(value ?? 0, name);
}

function resolveWindow(value, params, rest, name) {
  const resolved = typeof value === 'function' ? value(params, rest) : value;
  return nonNegativeFinite(resolved ?? 0, name);
}

function normalizePolicies(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('tools must be an object keyed by exact MCP tool name');
  const policies = new Map();
  for (const [rawName, rawPolicy] of Object.entries(input)) {
    const name = nonEmptyText(rawName, 'tool name');
    const policy = rawPolicy ?? {};
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new TypeError(`tools.${name} must be an object`);
    if (policy.coordinate !== undefined && typeof policy.coordinate !== 'function') {
      throw new TypeError(`tools.${name}.coordinate must be a function when provided`);
    }
    if (policy.eligible !== undefined && typeof policy.eligible !== 'function') {
      throw new TypeError(`tools.${name}.eligible must be a function when provided`);
    }
    if (policy.normalizeResult !== undefined && typeof policy.normalizeResult !== 'function') {
      throw new TypeError(`tools.${name}.normalizeResult must be a function when provided`);
    }
    policies.set(name, Object.freeze({
      maxAgeMs: normalizeWindow(policy.maxAgeMs, `tools.${name}.maxAgeMs`),
      privateMaxAgeMs: normalizeWindow(policy.privateMaxAgeMs, `tools.${name}.privateMaxAgeMs`),
      relay: policy.relay,
      coordinate: policy.coordinate,
      eligible: policy.eligible,
      normalizeResult: policy.normalizeResult
    }));
  }
  return policies;
}

export function protectMcpClient(client, options = {}) {
  if (!client || typeof client !== 'object' || typeof client.callTool !== 'function') {
    throw new TypeError('client must provide callTool()');
  }
  const policies = normalizePolicies(options.tools ?? {});
  const edge = options.edge ?? new SeenRelayZeroState(options.edgeOptions);
  const bindingId = options.serverKey?.trim() || `bound-client-${++bindingSequence}`;
  const originalCallTool = client.callTool.bind(client);
  const metrics = { callToolCalls: 0, protectedCalls: 0, passthroughCalls: 0, optionPassthroughCalls: 0, ineligiblePassthroughCalls: 0 };

  const protectedCallTool = async (params, ...rest) => {
    metrics.callToolCalls += 1;
    const name = params && typeof params === 'object' ? params.name : undefined;
    const policy = typeof name === 'string' ? policies.get(name) : undefined;
    if (!policy) {
      metrics.passthroughCalls += 1;
      return originalCallTool(params, ...rest);
    }
    if (rest.length > 0 && typeof policy.coordinate !== 'function') {
      metrics.passthroughCalls += 1;
      metrics.optionPassthroughCalls += 1;
      return originalCallTool(params, ...rest);
    }
    if (typeof policy.eligible === 'function' && !policy.eligible(params, rest)) {
      metrics.passthroughCalls += 1;
      metrics.ineligiblePassthroughCalls += 1;
      return originalCallTool(params, ...rest);
    }
    metrics.protectedCalls += 1;
    const relay = typeof policy.relay === 'function' ? policy.relay(params, rest) : policy.relay;
    const coordinate = typeof policy.coordinate === 'function'
      ? policy.coordinate(params, rest)
      : {
          protocol: 'mcp-tools-call-v1',
          server: bindingId,
          name,
          arguments: params.arguments ?? {}
        };
    const outcome = await edge.guard({
      coordinate,
      maxAgeMs: resolveWindow(policy.maxAgeMs, params, rest, `tools.${name}.maxAgeMs`),
      privateMaxAgeMs: resolveWindow(policy.privateMaxAgeMs, params, rest, `tools.${name}.privateMaxAgeMs`),
      ...(relay ? { relay } : {}),
      validate: async (context) => {
        const result = await originalCallTool(params, ...rest);
        return typeof policy.normalizeResult === 'function'
          ? policy.normalizeResult(result, params, rest, context)
          : result;
      }
    });
    return outcome.value;
  };

  const proxy = new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'callTool') return protectedCallTool;
      if (property === 'seenRelayZeroState') {
        return Object.freeze({
          edge,
          getTelemetry: () => Object.freeze({ ...metrics, edge: edge.getTelemetry() })
        });
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  return proxy;
}
