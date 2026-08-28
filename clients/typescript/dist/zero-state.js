import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { serialize, deserialize } from 'node:v8';

const ZERO_STATE_RESULT = '__seenrelay_zero_state_result_v1';

function monotonicNowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function wallNowMs() { return Date.now(); }

function stableJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('coordinate contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError('coordinate must be JSON-serializable');
}

function opaqueCoordinateKey(value) {
  return `sha256:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}`;
}

function nonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function probability(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${name} must be between 0 and 1`);
  return value;
}

function cloneForCache(value) {
  try {
    return { ok: true, value: structuredClone(value) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function sourceValidator(input) {
  if (!input) return undefined;
  const etag = typeof input.etag === 'string' && input.etag && !/[\r\n]/.test(input.etag) ? input.etag : undefined;
  const lastModified = typeof input.lastModified === 'string' && input.lastModified && !/[\r\n]/.test(input.lastModified)
    ? input.lastModified
    : undefined;
  return etag || lastModified ? Object.freeze({ ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}) }) : undefined;
}

function conditionalHeaders(validator) {
  if (!validator) return Object.freeze({});
  if (validator.etag) return Object.freeze({ 'If-None-Match': validator.etag });
  if (validator.lastModified) return Object.freeze({ 'If-Modified-Since': validator.lastModified });
  return Object.freeze({});
}

function validPrivateEntry(value) {
  return Boolean(
    value && typeof value === 'object' &&
    Number.isFinite(value.confirmedAtMs) && value.confirmedAtMs >= 0 &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  );
}

function emptyTelemetry() {
  return {
    guardCalls: 0,
    inflightCoalesced: 0,
    localFreshHits: 0,
    localUncacheableValues: 0,
    privateReads: 0,
    privateReadHits: 0,
    privateFreshHits: 0,
    privateWrites: 0,
    privateReadFailures: 0,
    privateWriteFailures: 0,
    sourceConditionalAttempts: 0,
    sourceNotModifiedHits: 0,
    validationCalls: 0,
    relayCheckCalls: 0,
    relayCheckReuseHits: 0,
    relayObserveScheduled: 0,
    relayObserveScheduleFailures: 0,
    relayObserveBlocking: 0,
    relayObserveSkippedNoScheduler: 0,
    relayObserveFailures: 0
  };
}

export function freshResult(value, validator) {
  return Object.freeze({ [ZERO_STATE_RESULT]: 'fresh', value, sourceValidator: sourceValidator(validator) });
}

export function notModifiedResult(validator) {
  return Object.freeze({ [ZERO_STATE_RESULT]: 'not-modified', sourceValidator: sourceValidator(validator) });
}

function normalizeValidationResult(result) {
  if (result && typeof result === 'object' && result[ZERO_STATE_RESULT] === 'fresh') {
    return { kind: 'fresh', value: result.value, sourceValidator: sourceValidator(result.sourceValidator) };
  }
  if (result && typeof result === 'object' && result[ZERO_STATE_RESULT] === 'not-modified') {
    return { kind: 'not-modified', sourceValidator: sourceValidator(result.sourceValidator) };
  }
  return { kind: 'fresh', value: result, sourceValidator: undefined };
}

function isRelayMode(value) { return value === 'off' || value === 'sample' || value === 'always'; }

function safeObserveMetadata(validator) {
  if (!validator) return undefined;
  if (validator.etag) return { sourceValidator: { kind: 'etag', value: validator.etag } };
  if (validator.lastModified) return { sourceValidator: { kind: 'last_modified', value: validator.lastModified } };
  return undefined;
}

export function createAesGcmPrivateCodec(keyMaterial) {
  const key = Buffer.from(keyMaterial);
  if (key.byteLength !== 32) throw new TypeError('private codec key must be exactly 32 bytes');
  return Object.freeze({
    seal(entry, coordinateKey) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(coordinateKey, 'utf8'));
      const ciphertext = Buffer.concat([cipher.update(serialize(entry)), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `aes256gcm-v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
    },
    open(sealed, coordinateKey) {
      if (typeof sealed !== 'string') throw new TypeError('private store payload must be a string');
      const parts = sealed.split('.');
      if (parts.length !== 4 || parts[0] !== 'aes256gcm-v1') throw new Error('unsupported private store payload');
      const iv = Buffer.from(parts[1], 'base64url');
      const tag = Buffer.from(parts[2], 'base64url');
      const ciphertext = Buffer.from(parts[3], 'base64url');
      if (iv.byteLength !== 12 || tag.byteLength !== 16) throw new Error('invalid private store payload');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(coordinateKey, 'utf8'));
      decipher.setAuthTag(tag);
      return deserialize(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
    }
  });
}

export class SeenRelayZeroState {
  constructor(options = {}) {
    this.localMaxAgeMs = nonNegativeFinite(options.localMaxAgeMs ?? 0, 'localMaxAgeMs');
    this.validatorRetentionMs = nonNegativeFinite(options.validatorRetentionMs ?? 86_400_000, 'validatorRetentionMs');
    this.privateMaxAgeMs = nonNegativeFinite(options.privateMaxAgeMs ?? 0, 'privateMaxAgeMs');
    this.privateValidatorRetentionMs = nonNegativeFinite(
      options.privateValidatorRetentionMs ?? this.validatorRetentionMs,
      'privateValidatorRetentionMs'
    );
    this.maxEntries = positiveInteger(options.maxEntries ?? 1000, 'maxEntries');
    this.relayMode = options.relayMode ?? 'off';
    if (!isRelayMode(this.relayMode)) throw new TypeError('relayMode must be off, sample, or always');
    this.relaySampleRate = probability(options.relaySampleRate ?? 0, 'relaySampleRate');
    this.relayClient = options.relayClient;
    this.scheduleObserve = options.scheduleObserve;
    this.observeDelivery = options.observeDelivery ?? 'scheduled-only';
    if (this.observeDelivery !== 'scheduled-only' && this.observeDelivery !== 'blocking') {
      throw new TypeError('observeDelivery must be scheduled-only or blocking');
    }
    this.privateStore = options.privateStore;
    this.privateCodec = options.privateCodec;
    if (Boolean(this.privateStore) !== Boolean(this.privateCodec)) {
      throw new TypeError('privateStore and privateCodec must be configured together');
    }
    if (this.privateStore && (typeof this.privateStore.get !== 'function' || typeof this.privateStore.set !== 'function')) {
      throw new TypeError('privateStore must provide get() and set()');
    }
    if (this.privateCodec && (typeof this.privateCodec.seal !== 'function' || typeof this.privateCodec.open !== 'function')) {
      throw new TypeError('privateCodec must provide seal() and open()');
    }
    this.now = options.now ?? wallNowMs;
    this.random = options.random ?? Math.random;
    this.cache = new Map();
    this.inflight = new Map();
    this.metrics = emptyTelemetry();
  }

  getTelemetry() { return Object.freeze({ ...this.metrics, cacheEntries: this.cache.size, inflightEntries: this.inflight.size }); }
  resetTelemetry() { this.metrics = emptyTelemetry(); }
  clearLocal() { this.cache.clear(); }

  protect(options) {
    if (!options || typeof options.validate !== 'function') throw new TypeError('validate must be a function');
    return () => this.guard(options);
  }

  async guard(options) {
    if (!options || typeof options.validate !== 'function') throw new TypeError('validate must be a function');
    this.metrics.guardCalls += 1;
    const key = opaqueCoordinateKey(options.coordinate);
    const existing = this.inflight.get(key);
    if (existing) {
      this.metrics.inflightCoalesced += 1;
      return existing;
    }
    const task = this.#guardOne(key, options);
    this.inflight.set(key, task);
    try { return await task; }
    finally { if (this.inflight.get(key) === task) this.inflight.delete(key); }
  }

  #freshLocalEntry(key, maxAgeMs) {
    if (maxAgeMs <= 0) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.now() - entry.confirmedAtMs > maxAgeMs) return null;
    const clone = cloneForCache(entry.value);
    if (!clone.ok) return null;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return { entry, value: clone.value };
  }

  #retainedEntry(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    return this.now() - entry.confirmedAtMs <= this.validatorRetentionMs ? entry : null;
  }

  #remember(key, value, validator, maxAgeMs) {
    const normalizedValidator = sourceValidator(validator);
    if (!normalizedValidator && maxAgeMs <= 0) {
      this.cache.delete(key);
      return;
    }
    const clone = cloneForCache(value);
    if (!clone.ok) {
      this.metrics.localUncacheableValues += 1;
      this.cache.delete(key);
      return;
    }
    this.cache.delete(key);
    this.cache.set(key, { value: clone.value, sourceValidator: normalizedValidator, confirmedAtMs: this.now() });
    while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
  }

  async #readPrivate(key) {
    if (!this.privateStore) return null;
    this.metrics.privateReads += 1;
    try {
      const sealed = await this.privateStore.get(key);
      if (sealed == null) return null;
      const entry = await this.privateCodec.open(sealed, key);
      if (!validPrivateEntry(entry)) throw new Error('invalid private store entry');
      const clone = cloneForCache(entry.value);
      if (!clone.ok) throw new Error('private store value cannot be cloned');
      this.metrics.privateReadHits += 1;
      return {
        value: clone.value,
        sourceValidator: sourceValidator(entry.sourceValidator),
        confirmedAtMs: entry.confirmedAtMs
      };
    } catch {
      this.metrics.privateReadFailures += 1;
      return null;
    }
  }

  async #writePrivate(key, value, validator, privateMaxAgeMs) {
    if (!this.privateStore) return;
    const normalizedValidator = sourceValidator(validator);
    if (!normalizedValidator && privateMaxAgeMs <= 0) return;
    const clone = cloneForCache(value);
    if (!clone.ok) return;
    try {
      const sealed = await this.privateCodec.seal({
        value: clone.value,
        sourceValidator: normalizedValidator,
        confirmedAtMs: this.now()
      }, key);
      await this.privateStore.set(key, sealed);
      this.metrics.privateWrites += 1;
    } catch {
      this.metrics.privateWriteFailures += 1;
    }
  }

  #shouldRelayCheck(options) {
    const mode = options.relay?.mode ?? this.relayMode;
    if (!isRelayMode(mode)) throw new TypeError('relay.mode must be off, sample, or always');
    if (mode === 'off') return false;
    if (mode === 'always') return true;
    const rate = probability(options.relay?.sampleRate ?? this.relaySampleRate, 'relay.sampleRate');
    return rate > 0 && this.random() < rate;
  }

  async #maybeRelayReuse(options) {
    const relay = options.relay;
    if (!relay || !this.relayClient || !this.#shouldRelayCheck(options)) return null;
    if (!relay.fact || !Object.prototype.hasOwnProperty.call(relay, 'knownValue')) return null;
    this.metrics.relayCheckCalls += 1;
    try {
      const check = await this.relayClient.check(relay.fact, relay.knownValue, relay.maxAgeSeconds);
      if (typeof relay.reuse === 'function') {
        const decision = relay.reuse(check, relay.knownValue);
        if (decision?.reuse) {
          this.metrics.relayCheckReuseHits += 1;
          return { value: decision.value, path: 'relay_reuse', check };
        }
      }
      return { check };
    } catch {
      return { check: null };
    }
  }

  async #contribute(options, value, validator) {
    const relay = options.relay;
    if (!relay?.contribute || !relay.fact || !this.relayClient || typeof this.relayClient.observe !== 'function') return;
    const task = async () => {
      try { await this.relayClient.observe(relay.fact, value, safeObserveMetadata(validator)); }
      catch { this.metrics.relayObserveFailures += 1; }
    };
    if (this.scheduleObserve) {
      try {
        this.scheduleObserve(task);
        this.metrics.relayObserveScheduled += 1;
      } catch {
        this.metrics.relayObserveScheduleFailures += 1;
      }
      return;
    }
    if (this.observeDelivery === 'blocking') {
      this.metrics.relayObserveBlocking += 1;
      await task();
      return;
    }
    this.metrics.relayObserveSkippedNoScheduler += 1;
  }

  async #runValidator(key, options, retained, headers, maxAgeMs, privateMaxAgeMs, relayCheck = null) {
    const hasConditional = Object.keys(headers).length > 0;
    if (hasConditional) this.metrics.sourceConditionalAttempts += 1;
    this.metrics.validationCalls += 1;
    const started = monotonicNowMs();
    const raw = await options.validate(Object.freeze({ conditionalHeaders: headers, priorValue: retained?.value, priorSourceValidator: retained?.sourceValidator }));
    const elapsedMs = Math.max(0, monotonicNowMs() - started);
    const result = normalizeValidationResult(raw);

    if (result.kind === 'not-modified') {
      if (!retained) throw new Error('notModifiedResult requires a retained value');
      const clone = cloneForCache(retained.value);
      if (!clone.ok) throw new Error('retained value cannot be cloned');
      const nextValidator = result.sourceValidator ?? retained.sourceValidator;
      this.#remember(key, retained.value, nextValidator, maxAgeMs);
      await this.#writePrivate(key, retained.value, nextValidator, privateMaxAgeMs);
      this.metrics.sourceNotModifiedHits += 1;
      await this.#contribute(options, clone.value, nextValidator);
      return {
        value: clone.value,
        path: 'source_not_modified',
        validationMs: elapsedMs,
        relay: { check: relayCheck },
        source: { conditional: hasConditional, notModified: true }
      };
    }

    this.#remember(key, result.value, result.sourceValidator, maxAgeMs);
    await this.#writePrivate(key, result.value, result.sourceValidator, privateMaxAgeMs);
    await this.#contribute(options, result.value, result.sourceValidator);
    return {
      value: result.value,
      path: 'validated',
      validationMs: elapsedMs,
      relay: { check: relayCheck },
      source: { conditional: hasConditional, notModified: false }
    };
  }

  async #guardOne(key, options) {
    const maxAgeMs = nonNegativeFinite(options.maxAgeMs ?? this.localMaxAgeMs, 'maxAgeMs');
    const privateMaxAgeMs = nonNegativeFinite(options.privateMaxAgeMs ?? this.privateMaxAgeMs, 'privateMaxAgeMs');
    const local = this.#freshLocalEntry(key, maxAgeMs);
    if (local) {
      this.metrics.localFreshHits += 1;
      return { value: local.value, path: 'local_reuse', relay: { check: null }, source: { conditional: false, notModified: false } };
    }

    const localRetained = this.#retainedEntry(key);
    const privateEntry = await this.#readPrivate(key);
    if (privateEntry && privateMaxAgeMs > 0 && this.now() - privateEntry.confirmedAtMs <= privateMaxAgeMs) {
      this.metrics.privateFreshHits += 1;
      this.#remember(key, privateEntry.value, privateEntry.sourceValidator, maxAgeMs);
      return { value: privateEntry.value, path: 'private_reuse', relay: { check: null }, source: { conditional: false, notModified: false } };
    }

    const privateRetained = privateEntry && privateEntry.sourceValidator &&
      this.now() - privateEntry.confirmedAtMs <= this.privateValidatorRetentionMs
      ? privateEntry
      : null;
    const retained = !localRetained ? privateRetained
      : !privateRetained ? localRetained
        : localRetained.confirmedAtMs >= privateRetained.confirmedAtMs ? localRetained : privateRetained;
    const headers = conditionalHeaders(retained?.sourceValidator);
    if (Object.keys(headers).length > 0) {
      return this.#runValidator(key, options, retained, headers, maxAgeMs, privateMaxAgeMs, null);
    }

    const relayOutcome = await this.#maybeRelayReuse(options);
    if (relayOutcome?.path === 'relay_reuse') {
      return { value: relayOutcome.value, path: 'relay_reuse', relay: { check: relayOutcome.check }, source: { conditional: false, notModified: false } };
    }

    return this.#runValidator(key, options, retained, Object.freeze({}), maxAgeMs, privateMaxAgeMs, relayOutcome?.check ?? null);
  }
}

export function sourceValidatorFromResponse(response) {
  if (!response || !response.headers || typeof response.headers.get !== 'function') return undefined;
  return sourceValidator({ etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') });
}

export function createConditionalFetchValidator(options) {
  if (!options || !options.url) throw new TypeError('url is required');
  const fetchImpl = options.fetchImpl ?? fetch;
  const decode = options.decode ?? ((response) => response.json());
  const init = options.init ?? {};
  const method = String(init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') throw new TypeError('conditional fetch validator only supports GET or HEAD');
  return async ({ conditionalHeaders }) => {
    const headers = new Headers(init.headers ?? {});
    for (const [name, value] of Object.entries(conditionalHeaders ?? {})) headers.set(name, value);
    const response = await fetchImpl(options.url, { ...init, method, headers });
    const validator = sourceValidatorFromResponse(response);
    if (response.status === 304) return notModifiedResult(validator);
    if (!response.ok) throw new Error(`source validation returned HTTP ${response.status}`);
    const value = method === 'HEAD' ? null : await decode(response);
    return freshResult(value, validator);
  };
}
