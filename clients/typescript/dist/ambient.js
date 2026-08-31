import { canonicalEvidenceFingerprintV1 } from './canonical-evidence.js';
import { protectMcpClient } from './mcp-auto.js';

let ambientBindingSequence = 0;

function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}
function positiveInteger(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new TypeError(`${name} must be a positive integer`);
  return n;
}
function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
function emptyToolMetrics() {
  return { calls: 0, measured: 0, first: 0, repeats: 0, unchanged: 0, changed: 0, refused: 0, avoidableMsUpperBound: 0 };
}
function frozenToolMetric(name, metric) {
  return Object.freeze({
    tool: name,
    calls: metric.calls,
    measured_calls: metric.measured,
    first_observations: metric.first,
    exact_repeat_validations: metric.repeats,
    exact_unchanged_repeats: metric.unchanged,
    exact_changed_repeats: metric.changed,
    refused_measurements: metric.refused,
    exact_repeat_rate: metric.measured ? metric.repeats / metric.measured : 0,
    exact_unchanged_repeat_rate: metric.measured ? metric.unchanged / metric.measured : 0,
    upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead: metric.avoidableMsUpperBound
  });
}

/**
 * Ambient MCP wrapper.
 *
 * Default behavior is local shadow measurement only for tools that are not in
 * `tools`. Raw arguments/results are never retained; only canonical SHA-256
 * fingerprints and aggregate counters are kept in memory. No shadow network
 * call is performed. Tools explicitly present in `tools` use the existing
 * protectMcpClient() guard path and are excluded from shadow savings metrics.
 */
export function ambientMcpClient(client, options = {}) {
  if (!client || typeof client !== 'object' || typeof client.callTool !== 'function') {
    throw new TypeError('client must provide callTool()');
  }
  const serverKey = text(options.serverKey ?? `ambient-mcp-${++ambientBindingSequence}`, 'serverKey');
  const maxCoordinates = positiveInteger(options.maxCoordinates ?? 1000, 'maxCoordinates');
  const activeTools = options.tools ?? {};
  if (!activeTools || typeof activeTools !== 'object' || Array.isArray(activeTools)) {
    throw new TypeError('tools must be an object keyed by exact MCP tool name');
  }
  const activeNames = new Set(Object.keys(activeTools).map(name => text(name, 'tool name')));
  const guarded = protectMcpClient(client, { ...options, serverKey, tools: activeTools });
  const original = guarded.callTool.bind(guarded);
  const fingerprints = new Map();
  const perTool = new Map();
  const totals = {
    calls: 0,
    shadowCalls: 0,
    activePolicyCalls: 0,
    first: 0,
    repeats: 0,
    unchanged: 0,
    changed: 0,
    refused: 0,
    failures: 0,
    authoritativeMs: 0,
    avoidableMsUpperBound: 0
  };

  function toolMetric(name) {
    let metric = perTool.get(name);
    if (!metric) {
      metric = emptyToolMetrics();
      perTool.set(name, metric);
    }
    return metric;
  }
  function touch(key, value) {
    if (fingerprints.has(key)) fingerprints.delete(key);
    fingerprints.set(key, value);
    while (fingerprints.size > maxCoordinates) fingerprints.delete(fingerprints.keys().next().value);
  }
  function refuse(name) {
    totals.refused += 1;
    toolMetric(name).refused += 1;
  }

  async function callTool(params, ...rest) {
    totals.calls += 1;
    const rawName = params && typeof params === 'object' ? params.name : undefined;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : '<invalid-tool-name>';
    const metric = toolMetric(name);
    metric.calls += 1;

    if (activeNames.has(name)) {
      totals.activePolicyCalls += 1;
      return original(params, ...rest);
    }

    totals.shadowCalls += 1;
    const started = nowMs();
    let result;
    try {
      result = await original(params, ...rest);
    } catch (error) {
      totals.failures += 1;
      throw error;
    }
    const elapsed = Math.max(0, nowMs() - started);
    totals.authoritativeMs += elapsed;

    // Unknown framework options may affect semantics. Preserve behavior and
    // refuse measurement rather than guessing equivalence.
    if (rest.length > 0 || name === '<invalid-tool-name>') {
      refuse(name);
      return result;
    }

    try {
      const coordinate = {
        protocol: 'mcp-tools-call-exact-v1',
        server: serverKey,
        name,
        arguments: params?.arguments ?? {}
      };
      const coordinateFingerprint = canonicalEvidenceFingerprintV1(coordinate);
      const resultFingerprint = canonicalEvidenceFingerprintV1(result);
      metric.measured += 1;
      const previous = fingerprints.get(coordinateFingerprint);
      if (previous === undefined) {
        totals.first += 1;
        metric.first += 1;
        touch(coordinateFingerprint, resultFingerprint);
        return result;
      }
      totals.repeats += 1;
      metric.repeats += 1;
      if (previous === resultFingerprint) {
        totals.unchanged += 1;
        metric.unchanged += 1;
        totals.avoidableMsUpperBound += elapsed;
        metric.avoidableMsUpperBound += elapsed;
      } else {
        totals.changed += 1;
        metric.changed += 1;
      }
      touch(coordinateFingerprint, resultFingerprint);
    } catch {
      refuse(name);
    }
    return result;
  }

  const proxy = new Proxy(guarded, {
    get(target, property, receiver) {
      if (property === 'callTool') return callTool;
      if (property === 'seenRelayAmbient') {
        return Object.freeze({
          schema: 'seenrelay-ambient-mcp-v0',
          mode: 'shadow-by-default-active-by-explicit-tool',
          serverKey,
          network_calls_from_shadow: 0,
          shared_check_from_shadow: false,
          observe_from_shadow: false,
          raw_arguments_retained: false,
          raw_results_retained: false,
          active_tools: Object.freeze([...activeNames].sort()),
          getReport() {
            const tools = [...perTool.entries()]
              .map(([name, metric]) => frozenToolMetric(name, metric))
              .sort((a, b) => b.exact_unchanged_repeats - a.exact_unchanged_repeats || a.tool.localeCompare(b.tool));
            return Object.freeze({
              schema: 'seenrelay-ambient-mcp-report-v0',
              server_key: serverKey,
              calls: totals.calls,
              shadow_calls: totals.shadowCalls,
              active_policy_calls: totals.activePolicyCalls,
              authoritative_failures: totals.failures,
              measured_shadow_calls: tools.reduce((n, x) => n + x.measured_calls, 0),
              exact_repeat_validations: totals.repeats,
              exact_unchanged_repeats: totals.unchanged,
              exact_changed_repeats: totals.changed,
              refused_measurements: totals.refused,
              authoritative_shadow_ms_total: totals.authoritativeMs,
              upper_bound_avoidable_calls_before_native_and_check_overhead: totals.unchanged,
              upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead: totals.avoidableMsUpperBound,
              candidate_tools: Object.freeze(tools.filter(x => x.exact_unchanged_repeats > 0)),
              tools: Object.freeze(tools),
              interpretation: Object.freeze({
                savings_proven: false,
                native_controls_measured: false,
                relay_check_overhead_measured: false,
                automatic_reuse_authorized: false,
                public_claim_authorized: false,
                exact_repetition_only: true,
                next_step: totals.unchanged > 0 ? 'REVIEW_CANDIDATE_TOOLS_AGAINST_NATIVE_CONTROLS' : 'KEEP_RUNNING_NATURALLY'
              })
            });
          },
          getTelemetry() {
            return Object.freeze({ ambient: { ...totals }, guard: guarded.seenRelayZeroState.getTelemetry() });
          }
        });
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  return proxy;
}

/**
 * Drop-in adapter for OpenAI Agents JS MCP server objects.
 * Default mode remains local shadow only. Exact tools may opt into the existing
 * protectMcpClient() guard via `tools`; `callToolResult` can be configured
 * independently via `callToolResultTools` because its result shape may differ.
 */
export function ambientOpenAIAgentsMcpServer(server, options = {}) {
  if (!server || typeof server !== 'object' || typeof server.callTool !== 'function') {
    throw new TypeError('server must provide callTool()');
  }
  const serverKey = text(options.serverKey ?? server.name ?? `openai-agents-mcp-${++ambientBindingSequence}`, 'serverKey');
  const originalCallTool = server.callTool.bind(server);
  const callFacade = {
    async callTool(params, ...rest) {
      return originalCallTool(params.name, params.arguments ?? null, ...rest);
    }
  };
  const callAmbient = ambientMcpClient(callFacade, {
    serverKey,
    maxCoordinates: options.maxCoordinates,
    tools: options.tools ?? {},
    ...(options.edge ? { edge: options.edge } : {}),
    ...(options.edgeOptions ? { edgeOptions: options.edgeOptions } : {})
  });

  let resultAmbient;
  if (typeof server.callToolResult === 'function') {
    const originalCallToolResult = server.callToolResult.bind(server);
    const resultFacade = {
      async callTool(params, ...rest) {
        return originalCallToolResult(params.name, params.arguments ?? null, ...rest);
      }
    };
    resultAmbient = ambientMcpClient(resultFacade, {
      serverKey: `${serverKey}#callToolResult`,
      maxCoordinates: options.maxCoordinates,
      tools: options.callToolResultTools ?? {},
      ...(options.edge ? { edge: options.edge } : {}),
      ...(options.edgeOptions ? { edgeOptions: options.edgeOptions } : {})
    });
  }

  return new Proxy(server, {
    get(target, property, receiver) {
      if (property === 'callTool') {
        return async (toolName, args, ...rest) => callAmbient.callTool({ name: toolName, arguments: args ?? null }, ...rest);
      }
      if (property === 'callToolResult' && resultAmbient) {
        return async (toolName, args, ...rest) => resultAmbient.callTool({ name: toolName, arguments: args ?? null }, ...rest);
      }
      if (property === 'seenRelayAmbient') {
        return Object.freeze({
          schema: 'seenrelay-ambient-openai-agents-js-mcp-v0',
          framework: '@openai/agents',
          boundary: 'completed-call',
          serverKey,
          getReport: () => Object.freeze({
            schema: 'seenrelay-ambient-openai-agents-js-report-v0',
            callTool: callAmbient.seenRelayAmbient.getReport(),
            ...(resultAmbient ? { callToolResult: resultAmbient.seenRelayAmbient.getReport() } : {})
          }),
          getTelemetry: () => Object.freeze({
            callTool: callAmbient.seenRelayAmbient.getTelemetry(),
            ...(resultAmbient ? { callToolResult: resultAmbient.seenRelayAmbient.getTelemetry() } : {})
          })
        });
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

/**
 * Drop-in local-shadow adapter for tool objects returned by an AI SDK MCP client.
 * It never enables active reuse because the AI SDK execution-options surface is
 * framework-owned. Unknown or present execution options are preserved exactly
 * and conservatively excluded from equivalence measurement by ambientMcpClient.
 */
export function ambientAiSdkMcpTools(toolSet, options = {}) {
  if (!toolSet || typeof toolSet !== 'object' || Array.isArray(toolSet)) throw new TypeError('toolSet must be an object');
  const serverKey = text(options.serverKey ?? `ai-sdk-mcp-${++ambientBindingSequence}`, 'serverKey');
  const wrapped = {};
  const ambients = new Map();
  for (const [name, tool] of Object.entries(toolSet)) {
    if (!tool || typeof tool !== 'object' || typeof tool.execute !== 'function') {
      wrapped[name] = tool;
      continue;
    }
    const original = tool.execute.bind(tool);
    const facade = { async callTool(params, ...rest) { return original(params.arguments, ...rest); } };
    const ambient = ambientMcpClient(facade, { serverKey: `${serverKey}:${name}`, maxCoordinates: options.maxCoordinates, tools: {} });
    ambients.set(name, ambient);
    wrapped[name] = new Proxy(tool, {
      get(target, property, receiver) {
        if (property === 'execute') return async (input, ...rest) => ambient.callTool({ name, arguments: input }, ...rest);
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }
  return Object.freeze({
    tools: Object.freeze(wrapped),
    seenRelayAmbient: Object.freeze({
      schema: 'seenrelay-ambient-ai-sdk-mcp-tools-v0',
      framework: 'ai-sdk',
      boundary: 'tool.execute',
      serverKey,
      active_reuse_enabled: false,
      getReport() {
        return Object.freeze({
          schema: 'seenrelay-ambient-ai-sdk-mcp-tools-report-v0',
          tools: Object.freeze(Object.fromEntries([...ambients.entries()].map(([name, ambient]) => [name, ambient.seenRelayAmbient.getReport()])))
        });
      }
    })
  });
}
