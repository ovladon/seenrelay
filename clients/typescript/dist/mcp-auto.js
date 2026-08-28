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

function normalizePolicies(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('tools must be an object keyed by exact MCP tool name');
  const policies = new Map();
  for (const [rawName, rawPolicy] of Object.entries(input)) {
    const name = nonEmptyText(rawName, 'tool name');
    const policy = rawPolicy ?? {};
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new TypeError(`tools.${name} must be an object`);
    policies.set(name, Object.freeze({
      maxAgeMs: nonNegativeFinite(policy.maxAgeMs ?? 0, `tools.${name}.maxAgeMs`),
      relay: policy.relay,
      coordinate: policy.coordinate
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
  const metrics = { callToolCalls: 0, protectedCalls: 0, passthroughCalls: 0 };

  const protectedCallTool = async (params, ...rest) => {
    metrics.callToolCalls += 1;
    const name = params && typeof params === 'object' ? params.name : undefined;
    const policy = typeof name === 'string' ? policies.get(name) : undefined;
    if (!policy) {
      metrics.passthroughCalls += 1;
      return originalCallTool(params, ...rest);
    }
    metrics.protectedCalls += 1;
    const relay = typeof policy.relay === 'function' ? policy.relay(params) : policy.relay;
    const coordinate = typeof policy.coordinate === 'function'
      ? policy.coordinate(params)
      : {
          protocol: 'mcp-tools-call-v1',
          server: bindingId,
          name,
          arguments: params.arguments ?? {}
        };
    const outcome = await edge.guard({
      coordinate,
      maxAgeMs: policy.maxAgeMs,
      ...(relay ? { relay } : {}),
      validate: async () => originalCallTool(params, ...rest)
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
