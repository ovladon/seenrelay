import { performance } from 'node:perf_hooks';

import { SeenRelayClient } from '../clients/typescript/dist/seenrelay.js';
import { firecrawlResultFingerprint, firecrawlScrapePolicy } from '../clients/typescript/dist/firecrawl.js';
import { evaluateHostileBenchmark } from './evaluate-hostile-benchmark.mjs';

function nowMs() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function nonNegativeFinite(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return n;
}

function positiveInteger(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new TypeError(`${name} must be a positive integer`);
  return n;
}

function control(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must declare available and measured booleans`);
  }
  if (typeof value.available !== 'boolean' || typeof value.measured !== 'boolean') {
    throw new TypeError(`${name} must declare available and measured booleans`);
  }
  return Object.freeze({ available: value.available, measured: value.measured });
}

function parseFirecrawlMcpResult(result) {
  if (!result || typeof result !== 'object' || result.isError === true || !Array.isArray(result.content)) return null;
  const textItems = result.content.filter((item) => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string');
  if (textItems.length !== 1) return null;
  let parsed;
  try { parsed = JSON.parse(textItems[0].text); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.success === false) return null;
  const document = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : parsed;
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null;
  const metadata = document.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
    ? document.metadata
    : {};
  return { document, metadata };
}

function providerCredits(result) {
  const parsed = parseFirecrawlMcpResult(result);
  const credits = Number(parsed?.metadata?.creditsUsed);
  return Number.isFinite(credits) && credits >= 0 ? credits : null;
}

function providerCacheState(result) {
  const state = parseFirecrawlMcpResult(result)?.metadata?.cacheState;
  return state === 'hit' || state === 'miss' ? state : 'unknown';
}

function safeFingerprint(result) {
  try { return firecrawlResultFingerprint(result); } catch { return null; }
}

function stableRelayKey(relay) {
  return JSON.stringify({
    subject: relay.fact.subject,
    predicate: relay.fact.predicate,
    source: relay.fact.source,
    qualifiers: relay.fact.qualifiers ?? null
  });
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export class FirecrawlShadowPilot {
  constructor(client, options = {}) {
    if (!client || typeof client !== 'object' || typeof client.callTool !== 'function') {
      throw new TypeError('client must provide callTool()');
    }
    this.client = client;
    this.originalCallTool = client.callTool.bind(client);
    this.relayClient = options.relayClient ?? new SeenRelayClient({
      baseUrl: options.baseUrl,
      clientHint: options.clientHint ?? 'seenrelay-firecrawl-shadow-pilot'
    });
    if (typeof this.relayClient.check !== 'function' || typeof this.relayClient.observe !== 'function') {
      throw new TypeError('relayClient must provide check() and observe()');
    }
    this.policy = firecrawlScrapePolicy({ publicEvidence: true, maxAgeMs: options.maxAgeMs });
    this.maxRecords = positiveInteger(options.maxRecords ?? 1000, 'maxRecords');
    this.retained = new Map();
    this.records = [];
    this.pending = Promise.resolve();
    this.metrics = {
      call_tool_calls: 0,
      eligible_calls: 0,
      ineligible_calls: 0,
      prior_value_calls: 0,
      check_calls: 0,
      check_failures: 0,
      same_observed: 0,
      hypothetical_matches: 0,
      hypothetical_mismatches: 0,
      provider_cache_hits: 0,
      provider_cache_misses: 0,
      provider_cache_unknown: 0,
      provider_credit_unknown_calls: 0,
      independent_observations: 0,
      observe_calls: 0,
      observe_failures: 0,
      overflowed_records: 0
    };
  }

  bind() {
    const pilot = this;
    return new Proxy(this.client, {
      get(target, property, receiver) {
        if (property === 'callTool') return pilot.callTool.bind(pilot);
        if (property === 'seenRelayFirecrawlShadowPilot') {
          return Object.freeze({
            flush: () => pilot.flush(),
            report: () => pilot.report(),
            hostileBenchmarkInput: (options) => pilot.hostileBenchmarkInput(options),
            evaluate: (options) => pilot.evaluate(options)
          });
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }

  async callTool(params, ...rest) {
    this.metrics.call_tool_calls += 1;
    if (rest.length > 0 || params?.name !== 'firecrawl_scrape' || !this.policy.eligible(params, rest)) {
      this.metrics.ineligible_calls += 1;
      return this.originalCallTool(params, ...rest);
    }

    const relay = this.policy.relay(params, rest);
    if (!relay?.fact || !Number.isFinite(relay.maxAgeSeconds) || relay.maxAgeSeconds <= 0) {
      this.metrics.ineligible_calls += 1;
      return this.originalCallTool(params, ...rest);
    }

    this.metrics.eligible_calls += 1;
    const key = stableRelayKey(relay);
    const prior = this.retained.get(key) ?? null;
    if (prior) this.metrics.prior_value_calls += 1;

    const providerStarted = nowMs();
    const result = await this.originalCallTool(params, ...rest);
    const providerMs = Math.max(0, nowMs() - providerStarted);
    const fingerprint = safeFingerprint(result);
    const normalized = this.policy.normalizeResult(result, params, rest, Object.freeze({}));
    const independentlyObtained = normalized?.independentlyObtained === true;
    const observedAtMs = Number.isFinite(normalized?.observedAtMs) ? normalized.observedAtMs : Date.now();
    const cacheState = providerCacheState(result);
    const credits = providerCredits(result);

    if (cacheState === 'hit') this.metrics.provider_cache_hits += 1;
    else if (cacheState === 'miss') this.metrics.provider_cache_misses += 1;
    else this.metrics.provider_cache_unknown += 1;
    if (credits === null) this.metrics.provider_credit_unknown_calls += 1;

    if (fingerprint) this.retained.set(key, Object.freeze({ fingerprint }));

    const measurement = async () => {
      let checkStatus = null;
      let checkMs = 0;
      let checkError = null;
      let policyReusable = false;
      let reuseWouldMatchValidation = null;

      if (prior?.fingerprint) {
        this.metrics.check_calls += 1;
        const checkStarted = nowMs();
        try {
          const check = await this.relayClient.check(relay.fact, prior.fingerprint, relay.maxAgeSeconds);
          checkMs = Math.max(0, nowMs() - checkStarted);
          checkStatus = typeof check?.status === 'string' ? check.status : null;
          if (checkStatus === 'SAME_OBSERVED') {
            this.metrics.same_observed += 1;
            policyReusable = true;
            reuseWouldMatchValidation = fingerprint === null ? null : fingerprint === prior.fingerprint;
            if (reuseWouldMatchValidation === true) this.metrics.hypothetical_matches += 1;
            if (reuseWouldMatchValidation === false) this.metrics.hypothetical_mismatches += 1;
          }
        } catch (error) {
          checkMs = Math.max(0, nowMs() - checkStarted);
          checkError = errorText(error);
          this.metrics.check_failures += 1;
        }
      }

      if (independentlyObtained && fingerprint) {
        this.metrics.independent_observations += 1;
        this.metrics.observe_calls += 1;
        try {
          await this.relayClient.observe(relay.fact, fingerprint, {
            observedAt: new Date(observedAtMs).toISOString()
          });
        } catch {
          this.metrics.observe_failures += 1;
        }
      }

      const record = Object.freeze({
        check_status: checkStatus,
        policy_reusable: policyReusable,
        reuse_would_match_validation: policyReusable ? reuseWouldMatchValidation : null,
        observe_after_baseline: independentlyObtained && Boolean(fingerprint),
        baseline_ms: nonNegativeFinite(providerMs, 'baseline_ms'),
        baseline_cost: credits,
        check_ms: nonNegativeFinite(checkMs, 'check_ms'),
        provider_cache_state: cacheState,
        prior_value_available: Boolean(prior?.fingerprint),
        ...(checkError ? { check_error: checkError } : {})
      });

      if (this.records.length < this.maxRecords) this.records.push(record);
      else this.metrics.overflowed_records += 1;
    };

    // Measurement starts only after the authoritative provider call. CHECK therefore cannot delay
    // or suppress the caller's result, and the current call is OBSERVEd only after its own
    // counterfactual pre-validation CHECK has finished.
    this.pending = this.pending.then(measurement, measurement);
    return result;
  }

  async flush() {
    await this.pending;
  }

  report() {
    const knownCreditRecords = this.records.filter((record) => record.baseline_cost !== null);
    const credits = knownCreditRecords.reduce((sum, record) => sum + record.baseline_cost, 0);
    const reusable = this.records.filter((record) => record.policy_reusable).length;
    const comparable = this.records.filter((record) => record.policy_reusable && record.reuse_would_match_validation !== null).length;
    return Object.freeze({
      schema_version: 1,
      pilot: 'firecrawl-shadow-economics-v1',
      behavior: 'authoritative_provider_call_never_suppressed',
      records: this.records.length,
      provider_credit_records: knownCreditRecords.length,
      provider_credit_unknown_records: this.records.length - knownCreditRecords.length,
      provider_credit_evidence_complete: knownCreditRecords.length === this.records.length,
      provider_credit_units_measured: credits,
      policy_reusable_calls: reusable,
      policy_reusable_rate: this.records.length ? reusable / this.records.length : 0,
      comparable_hypothetical_reuses: comparable,
      metrics: Object.freeze({ ...this.metrics })
    });
  }

  hostileBenchmarkInput(options = {}) {
    if (this.metrics.overflowed_records > 0) throw new Error('pilot evidence incomplete: record limit overflowed');
    if (this.records.length === 0) throw new Error('pilot evidence incomplete: no records');
    const localCache = control(options.local_cache, 'local_cache');
    const sourceNative = control(options.source_native_conditional, 'source_native_conditional');
    const fallbackProvided = options.provider_credit_fallback_units !== undefined;
    const fallback = fallbackProvided
      ? nonNegativeFinite(options.provider_credit_fallback_units, 'provider_credit_fallback_units')
      : null;
    if (this.records.some((record) => record.baseline_cost === null) && fallback === null) {
      throw new Error('pilot cost evidence incomplete: provider credits missing; declare provider_credit_fallback_units in the same provider-credit unit or do not make a cost claim');
    }

    return Object.freeze({
      schema_version: 2,
      workload_id: typeof options.workload_id === 'string' && options.workload_id.trim()
        ? options.workload_id.trim()
        : 'firecrawl-shadow-pilot',
      sample_type: 'natural_workload',
      baseline_definition: 'best_existing_non_shared_path',
      observe_off_critical_path: true,
      controls: {
        local_cache: localCache,
        source_native_conditional: sourceNative,
        // The actual Firecrawl call remains authoritative, so provider-native cache behavior is
        // already included in every measured latency and provider-credit record.
        provider_native_cache: { available: true, measured: true }
      },
      records: this.records.map((record) => Object.freeze({
        check_status: record.check_status,
        policy_reusable: record.policy_reusable,
        reuse_would_match_validation: record.reuse_would_match_validation,
        observe_after_baseline: record.observe_after_baseline,
        baseline_ms: record.baseline_ms,
        baseline_cost: record.baseline_cost ?? fallback,
        check_ms: record.check_ms,
        observe_ms: 0,
        // These are Firecrawl provider-credit units. SeenRelay network/compute overhead is assessed
        // in the latency dimension unless the caller supplies a separate consistent cost model.
        check_cost: 0,
        observe_cost: 0
      }))
    });
  }

  evaluate(options = {}) {
    return evaluateHostileBenchmark(this.hostileBenchmarkInput(options));
  }
}

export function createFirecrawlShadowPilot(client, options = {}) {
  return new FirecrawlShadowPilot(client, options).bind();
}
