function emptyTelemetry() {
    return {
        guardCalls: 0,
        checkCalls: 0,
        checkSuccesses: 0,
        checkFailures: 0,
        checkTimeouts: 0,
        checkNetworkRequests: 0,
        checkCoalesced: 0,
        checkNetworkLatencyMsTotal: 0,
        checkNetworkLatencyMsMax: 0,
        reuseHits: 0,
        validationCalls: 0,
        conditionalHintValidations: 0,
        observeAttempts: 0,
        observeScheduled: 0,
        observeScheduleFailures: 0,
        observeSuccesses: 0,
        observeFailures: 0,
        observeTimeouts: 0,
        observeNetworkRequests: 0,
        observeNetworkLatencyMsTotal: 0,
        observeNetworkLatencyMsMax: 0
    };
}
function isCheckStatus(value) {
    return typeof value === 'string' && [
        'SAME_OBSERVED', 'CHANGED_OBSERVED', 'CONTESTED', 'STALE', 'UNKNOWN'
    ].includes(value);
}
function safeConditionalHeaders(check) {
    const hint = check?.conditional_request_hint;
    if (!hint || typeof hint !== 'object')
        return {};
    const name = hint.request_header;
    const value = hint.header_value;
    if (name !== 'If-None-Match' && name !== 'If-Modified-Since')
        return {};
    if (typeof value !== 'string' || value.length === 0 || /[\r\n]/.test(value))
        return {};
    return { [name]: value };
}
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
function isAbortError(error) {
    return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}
function monotonicNowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
}
function stableJson(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new TypeError('non-finite number');
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    if (typeof value === 'object') {
        const record = value;
        const keys = Object.keys(record).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
    }
    throw new TypeError('value is not JSON-serializable');
}
function cloneCheck(check) {
    return JSON.parse(JSON.stringify(check));
}
function positiveFinite(value, name) {
    if (!Number.isFinite(value) || value <= 0)
        throw new TypeError(`${name} must be a positive finite number`);
    return value;
}
export function reuseKnownOnSameObserved(check, knownValue) {
    return check.status === 'SAME_OBSERVED'
        ? { reuse: true, value: knownValue }
        : { reuse: false };
}
export class SeenRelayClient {
    baseUrl;
    clientHint;
    onLease;
    checkTimeoutMs;
    observeTimeoutMs;
    coalesceChecks;
    scheduleObserve;
    onDeferredObserveError;
    fetchImpl;
    inflightChecks = new Map();
    metrics = emptyTelemetry();
    lease;
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl ?? 'https://seenrelay.com').replace(/\/$/, '');
        this.clientHint = options.clientHint?.trim() || undefined;
        this.lease = options.initialLease?.trim() || undefined;
        this.onLease = options.onLease;
        this.checkTimeoutMs = positiveFinite(options.checkTimeoutMs ?? 1000, 'checkTimeoutMs');
        this.observeTimeoutMs = positiveFinite(options.observeTimeoutMs ?? 750, 'observeTimeoutMs');
        this.coalesceChecks = options.coalesceChecks ?? true;
        this.scheduleObserve = options.scheduleObserve;
        this.onDeferredObserveError = options.onDeferredObserveError;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }
    getLease() { return this.lease; }
    setLease(lease) { this.lease = lease?.trim() || undefined; }
    getTelemetry() {
        const m = this.metrics;
        return Object.freeze({
            ...m,
            checkNetworkLatencyMsAverage: m.checkNetworkRequests > 0 ? m.checkNetworkLatencyMsTotal / m.checkNetworkRequests : 0,
            observeNetworkLatencyMsAverage: m.observeNetworkRequests > 0 ? m.observeNetworkLatencyMsTotal / m.observeNetworkRequests : 0
        });
    }
    resetTelemetry() { this.metrics = emptyTelemetry(); }
    estimateReuseEconomics(input) {
        const avoided = positiveFinite(input.avoidedValidationCost, 'avoidedValidationCost');
        const checkCost = input.checkRequestCost ?? 0;
        const observeCost = input.observeRequestCost ?? 0;
        if (!Number.isFinite(checkCost) || checkCost < 0) throw new TypeError('checkRequestCost must be a non-negative finite number');
        if (!Number.isFinite(observeCost) || observeCost < 0) throw new TypeError('observeRequestCost must be a non-negative finite number');
        const m = this.metrics;
        const gross = m.reuseHits * avoided;
        const relay = m.checkNetworkRequests * checkCost + m.observeNetworkRequests * observeCost;
        return { grossAvoidedValidationCost: gross, relayRequestCost: relay, netEstimatedSavings: gross - relay, excludesConditionalRequestSavings: true };
    }
    async guard(options) { return (await this.guardDetailed(options)).value; }
    async guardDetailed(options) {
        this.metrics.guardCalls += 1;
        let check = null;
        let checkOk = false;
        let checkError;
        this.metrics.checkCalls += 1;
        try {
            check = await this.check(options.fact, options.knownValue, options.maxAgeSeconds);
            checkOk = true;
            this.metrics.checkSuccesses += 1;
        } catch (error) {
            this.metrics.checkFailures += 1;
            if (isAbortError(error)) this.metrics.checkTimeouts += 1;
            checkError = errorText(error);
        }
        if (check && options.reuse) {
            const decision = options.reuse(check, options.knownValue);
            if (decision.reuse) {
                this.metrics.reuseHits += 1;
                return { value: decision.value, path: 'reused', check, relay: { checkOk, observeOk: null, observeDeferred: false, ...(checkError ? { checkError } : {}) } };
            }
        }
        const conditionalHeaders = Object.freeze(safeConditionalHeaders(check));
        const context = { check, conditionalHeaders };
        this.metrics.validationCalls += 1;
        if (Object.keys(conditionalHeaders).length > 0) this.metrics.conditionalHintValidations += 1;
        const value = await options.validate(context);
        let observeOk = null;
        let observeError;
        let observeDeferred = false;
        this.metrics.observeAttempts += 1;
        const performObserve = async (deferred) => {
            try {
                const metadata = options.observation ? await options.observation(value, context) : undefined;
                await this.observe(options.fact, value, metadata);
                this.metrics.observeSuccesses += 1;
                return { ok: true };
            } catch (error) {
                this.metrics.observeFailures += 1;
                if (isAbortError(error)) this.metrics.observeTimeouts += 1;
                if (deferred) {
                    try { this.onDeferredObserveError?.(error); } catch { /* caller callback must not affect validation */ }
                }
                return { ok: false, error: errorText(error) };
            }
        };
        if (this.scheduleObserve) {
            observeDeferred = true;
            try {
                this.scheduleObserve(async () => { await performObserve(true); });
                this.metrics.observeScheduled += 1;
            } catch (error) {
                this.metrics.observeScheduleFailures += 1;
                observeOk = false;
                observeError = errorText(error);
            }
        } else {
            const outcome = await performObserve(false);
            observeOk = outcome.ok;
            observeError = outcome.error;
        }
        return { value, path: 'validated', check, relay: { checkOk, observeOk, observeDeferred, ...(checkError ? { checkError } : {}), ...(observeError ? { observeError } : {}) } };
    }
    commonHeaders() {
        return { 'content-type': 'application/json', ...(this.lease ? { 'x-seenrelay-lease': this.lease } : {}), ...(this.clientHint ? { 'x-seenrelay-client': this.clientHint } : {}) };
    }
    updateLease(response, body) {
        const fromHeader = response.headers.get('x-seenrelay-lease')?.trim();
        const record = body && typeof body === 'object' ? body : undefined;
        const hive = record?.hive && typeof record.hive === 'object' ? record.hive : undefined;
        const fromBody = typeof hive?.lease === 'string' ? hive.lease.trim() : undefined;
        const next = fromHeader || fromBody;
        if (!next || next === this.lease) return;
        this.lease = next;
        this.onLease?.(next);
    }
    async post(path, payload, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, { method: 'POST', headers: this.commonHeaders(), body: JSON.stringify(payload), signal: controller.signal });
            let body;
            try { body = await response.json(); }
            catch { throw new Error(`SeenRelay ${path} returned non-JSON response (${response.status})`); }
            this.updateLease(response, body);
            if (!response.ok) throw new Error(`SeenRelay ${path} returned HTTP ${response.status}`);
            return body;
        } finally { clearTimeout(timer); }
    }
    checkCoalescingKey(fact, knownValue, maxAgeSeconds) {
        if (!this.coalesceChecks) return null;
        try { return stableJson({ fact, known_value: knownValue, ...(maxAgeSeconds !== undefined ? { max_age_seconds: maxAgeSeconds } : {}) }); }
        catch { return null; }
    }
    async check(fact, knownValue, maxAgeSeconds) {
        const key = this.checkCoalescingKey(fact, knownValue, maxAgeSeconds);
        if (key) {
            const existing = this.inflightChecks.get(key);
            if (existing) { this.metrics.checkCoalesced += 1; return cloneCheck(await existing); }
        }
        const promise = this.checkNetwork(fact, knownValue, maxAgeSeconds);
        if (key) this.inflightChecks.set(key, promise);
        try { return cloneCheck(await promise); }
        finally { if (key && this.inflightChecks.get(key) === promise) this.inflightChecks.delete(key); }
    }
    async checkNetwork(fact, knownValue, maxAgeSeconds) {
        this.metrics.checkNetworkRequests += 1;
        const started = monotonicNowMs();
        try {
            const body = await this.post('/v1/check', { fact, known_value: knownValue, ...(maxAgeSeconds !== undefined ? { max_age_seconds: maxAgeSeconds } : {}) }, this.checkTimeoutMs);
            if (!body || typeof body !== 'object') throw new Error('SeenRelay CHECK response is not an object');
            const check = body;
            if (!isCheckStatus(check.status)) throw new Error('SeenRelay CHECK response has an invalid status');
            return check;
        } finally {
            const elapsed = Math.max(0, monotonicNowMs() - started);
            this.metrics.checkNetworkLatencyMsTotal += elapsed;
            this.metrics.checkNetworkLatencyMsMax = Math.max(this.metrics.checkNetworkLatencyMsMax, elapsed);
        }
    }
    async observe(fact, value, metadata) {
        const sourceValidator = metadata?.sourceValidator;
        if (sourceValidator && /[\r\n]/.test(sourceValidator.value)) throw new Error('sourceValidator.value must not contain CR or LF');
        this.metrics.observeNetworkRequests += 1;
        const started = monotonicNowMs();
        try {
            await this.post('/v1/observe', {
                fact, value,
                observed_at: metadata?.observedAt ?? new Date().toISOString(),
                idempotency_key: metadata?.idempotencyKey ?? crypto.randomUUID(),
                ...(metadata?.observerId ? { observer_id: metadata.observerId } : {}),
                ...(metadata?.evidenceFingerprint ? { evidence_fingerprint: metadata.evidenceFingerprint } : {}),
                ...(sourceValidator ? { source_validator: sourceValidator } : {})
            }, this.observeTimeoutMs);
        } finally {
            const elapsed = Math.max(0, monotonicNowMs() - started);
            this.metrics.observeNetworkLatencyMsTotal += elapsed;
            this.metrics.observeNetworkLatencyMsMax = Math.max(this.metrics.observeNetworkLatencyMsMax, elapsed);
        }
    }
}
