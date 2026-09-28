import { randomUUID } from 'node:crypto';
import { sha256JsonFingerprint } from './zero-state.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function positiveFinite(value, fallback, label) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new TypeError(`${label} must be a positive finite number`);
  return n;
}

function opaqueScopeHash(scopeKey) {
  if (typeof scopeKey !== 'string' || scopeKey.length < 8) {
    throw new TypeError('scopeKey must be an opaque fleet/tenant scope string of at least 8 characters');
  }
  return sha256JsonFingerprint({ scope: scopeKey });
}

function explicitSingleAnswerPolicy(policy) {
  if (!policy || (policy.sideEffectClass !== 'read_only' && policy.sideEffectClass !== 'idempotent_read')) return false;
  if (policy.exactSingleAnswerShareable !== true) return false;
  if (policy.independentSamplesRequired === true) return false;
  return true;
}

function nativeZeroCostDominates(policy) {
  return policy?.nativeControl?.exactResponseCache === true &&
    policy?.nativeControl?.cacheHitMarginalCostZero === true;
}

function aadKey(scopeHash, coordinateKey, generation) {
  return `seenrelay-fleet-v0:${sha256JsonFingerprint({ scopeHash, coordinateKey, generation })}`;
}

function sealedBytes(value) {
  if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
  if (value instanceof Uint8Array) return value.byteLength;
  throw new TypeError('fleet codec seal() must return a string or Uint8Array');
}

export function fleetCodecFromPrivateCodec(privateCodec) {
  if (!privateCodec || typeof privateCodec.seal !== 'function' || typeof privateCodec.open !== 'function') {
    throw new TypeError('privateCodec must provide seal() and open()');
  }
  return Object.freeze({
    seal(value, context) {
      return privateCodec.seal(value, aadKey(context.scopeHash, context.coordinateKey, context.generation));
    },
    open(sealedValue, context) {
      return privateCodec.open(sealedValue, aadKey(context.scopeHash, context.coordinateKey, context.generation));
    }
  });
}

export class InMemoryFleetCoordinationStore {
  constructor(options = {}) {
    this.now = options.now ?? (() => Date.now());
    this.locks = new Map();
    this.results = new Map();
  }

  #key(scopeHash, coordinateKey) { return `${scopeHash}|${coordinateKey}`; }
  #resultKey(scopeHash, coordinateKey, generation) { return `${scopeHash}|${coordinateKey}|${generation}`; }

  async tryClaim({ scopeHash, coordinateKey, ownerId, leaseMs }) {
    const key = this.#key(scopeHash, coordinateKey);
    const now = this.now();
    const current = this.locks.get(key);
    if (!current || current.expiresAtMs <= now || current.status === 'completed' || current.status === 'failed') {
      const generation = randomUUID();
      const expiresAtMs = now + leaseMs;
      this.locks.set(key, { status: 'pending', generation, ownerId, expiresAtMs });
      return { role: 'leader', generation, expiresAtMs };
    }
    return { role: 'follower', generation: current.generation, expiresAtMs: current.expiresAtMs };
  }

  async read({ scopeHash, coordinateKey, generation }) {
    const result = this.results.get(this.#resultKey(scopeHash, coordinateKey, generation));
    if (result !== undefined) return { status: 'completed', sealedResult: result };
    const row = this.locks.get(this.#key(scopeHash, coordinateKey));
    if (!row || row.generation !== generation) return { status: 'missing' };
    if (row.status === 'failed') return { status: 'failed' };
    if (row.status === 'completed') return { status: 'missing' };
    if (row.expiresAtMs <= this.now()) return { status: 'missing' };
    return { status: 'pending', expiresAtMs: row.expiresAtMs };
  }

  async publish({ scopeHash, coordinateKey, generation, ownerId, sealedResult }) {
    const key = this.#key(scopeHash, coordinateKey);
    const row = this.locks.get(key);
    if (!row || row.status !== 'pending' || row.generation !== generation || row.ownerId !== ownerId) return false;
    this.results.set(this.#resultKey(scopeHash, coordinateKey, generation), sealedResult);
    this.locks.set(key, { ...row, status: 'completed' });
    return true;
  }

  async fail({ scopeHash, coordinateKey, generation, ownerId }) {
    const key = this.#key(scopeHash, coordinateKey);
    const row = this.locks.get(key);
    if (!row || row.status !== 'pending' || row.generation !== generation || row.ownerId !== ownerId) return false;
    this.locks.set(key, { ...row, status: 'failed', expiresAtMs: this.now() });
    return true;
  }
}

const CLAIM_LUA = `
local current = redis.call('GET', KEYS[1])
if (not current) or string.sub(current,1,2) == 'C|' or string.sub(current,1,2) == 'F|' then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return {1, ARGV[1]}
end
return {0, current}
`;

const PUBLISH_LUA = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
redis.call('SET', KEYS[1], ARGV[4], 'PX', ARGV[5])
return 1
`;

const FAIL_LUA = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1
`;

function tokenParts(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('|');
  if (parts.length !== 4) return null;
  const expiresAtMs = Number(parts[3]);
  if (!Number.isFinite(expiresAtMs)) return null;
  return { state: parts[0], generation: parts[1], ownerId: parts[2], expiresAtMs };
}

export function createRedisRestFleetStore(options = {}) {
  const url = typeof options.url === 'string' ? options.url.replace(/\/+$/, '') : '';
  const token = options.token;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const prefix = options.prefix ?? 'seenrelay:fleet:v0';
  const resultTtlMs = positiveFinite(options.resultTtlMs, 60_000, 'resultTtlMs');
  const completionGraceMs = positiveFinite(options.completionGraceMs, 500, 'completionGraceMs');
  const failureGraceMs = positiveFinite(options.failureGraceMs, 250, 'failureGraceMs');
  const now = options.now ?? (() => Date.now());

  if (!url) throw new TypeError('Redis REST url is required');
  if (typeof token !== 'string' || !token) throw new TypeError('Redis REST token is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  async function command(args) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(args)
    });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`Redis REST returned non-JSON HTTP ${response.status}`); }
    if (!response.ok) throw new Error(`Redis REST HTTP ${response.status}`);
    if (payload?.error) throw new Error(`Redis REST error: ${payload.error}`);
    return payload?.result;
  }

  function keys(scopeHash, coordinateKey, generation) {
    const base = `${prefix}:${scopeHash}:${coordinateKey}`;
    return {
      lock: `${base}:lock`,
      result: generation ? `${base}:result:${generation}` : null
    };
  }

  return Object.freeze({
    async tryClaim({ scopeHash, coordinateKey, ownerId, leaseMs }) {
      const generation = randomUUID();
      const expiresAtMs = now() + leaseMs;
      const pendingToken = `P|${generation}|${ownerId}|${expiresAtMs}`;
      const { lock } = keys(scopeHash, coordinateKey);
      const result = await command(['EVAL', CLAIM_LUA, '1', lock, pendingToken, String(Math.ceil(leaseMs))]);
      if (!Array.isArray(result) || result.length < 2) throw new Error('Redis REST claim returned an invalid response');
      if (Number(result[0]) === 1) return { role: 'leader', generation, expiresAtMs, pendingToken };
      const existing = tokenParts(result[1]);
      if (!existing || existing.state !== 'P') throw new Error('Redis REST claim returned an invalid pending token');
      return {
        role: 'follower',
        generation: existing.generation,
        expiresAtMs: existing.expiresAtMs,
        pendingToken: result[1]
      };
    },

    async read({ scopeHash, coordinateKey, generation, pendingToken }) {
      const { lock, result } = keys(scopeHash, coordinateKey, generation);
      const sealedResult = await command(['GET', result]);
      if (sealedResult !== null && sealedResult !== undefined) return { status: 'completed', sealedResult };
      const current = await command(['GET', lock]);
      if (current === pendingToken) {
        const parsed = tokenParts(current);
        if (parsed && parsed.expiresAtMs > now()) return { status: 'pending', expiresAtMs: parsed.expiresAtMs };
      }
      const parsed = tokenParts(current);
      if (parsed?.generation === generation && parsed.state === 'F') return { status: 'failed' };
      return { status: 'missing' };
    },

    async publish({ scopeHash, coordinateKey, generation, ownerId, pendingToken, sealedResult }) {
      if (typeof sealedResult !== 'string') throw new TypeError('Redis REST fleet store requires codec seal() to return a string');
      const { lock, result } = keys(scopeHash, coordinateKey, generation);
      const completedToken = `C|${generation}|${ownerId}|${now() + completionGraceMs}`;
      const published = await command([
        'EVAL', PUBLISH_LUA, '2', lock, result, pendingToken, sealedResult,
        String(Math.ceil(resultTtlMs)), completedToken, String(Math.ceil(completionGraceMs))
      ]);
      return Number(published) === 1;
    },

    async fail({ scopeHash, coordinateKey, generation, ownerId, pendingToken }) {
      const { lock } = keys(scopeHash, coordinateKey, generation);
      const failedToken = `F|${generation}|${ownerId}|${now() + failureGraceMs}`;
      const failed = await command([
        'EVAL', FAIL_LUA, '1', lock, pendingToken, failedToken, String(Math.ceil(failureGraceMs))
      ]);
      return Number(failed) === 1;
    }
  });
}

export class SeenRelayFleetCoordinator {
  constructor(options = {}) {
    if (!options.store || !['tryClaim', 'read', 'publish', 'fail'].every((name) => typeof options.store[name] === 'function')) {
      throw new TypeError('store must provide tryClaim(), read(), publish(), and fail()');
    }
    if (!options.codec || typeof options.codec.seal !== 'function' || typeof options.codec.open !== 'function') {
      throw new TypeError('codec must provide seal() and open()');
    }
    this.scopeKey = options.scopeKey;
    this.scopeHash = opaqueScopeHash(options.scopeKey);
    this.store = options.store;
    this.codec = options.codec;
    this.ownerId = options.ownerId ?? randomUUID();
    this.leaseMs = positiveFinite(options.leaseMs, 60_000, 'leaseMs');
    this.pollMs = positiveFinite(options.pollMs, 25, 'pollMs');
    this.maxWaitMs = positiveFinite(options.maxWaitMs, this.leaseMs, 'maxWaitMs');
    this.maxSealedBytes = positiveFinite(options.maxSealedBytes, 262_144, 'maxSealedBytes');
    this.now = options.now ?? (() => Date.now());
    this.metrics = {
      calls: 0,
      policyPassthrough: 0,
      nativeControlPassthrough: 0,
      leaderClaims: 0,
      leaderExecutions: 0,
      followerJoins: 0,
      followerReuses: 0,
      failOpenExecutions: 0,
      storeFailures: 0,
      codecFailures: 0,
      followerTimeouts: 0,
      oversizeResults: 0
    };
  }

  getTelemetry() { return Object.freeze({ ...this.metrics }); }

  async run(options = {}) {
    if (typeof options.execute !== 'function') throw new TypeError('execute must be a function');
    this.metrics.calls += 1;

    if (!explicitSingleAnswerPolicy(options.policy)) {
      this.metrics.policyPassthrough += 1;
      return options.execute();
    }
    if (nativeZeroCostDominates(options.policy)) {
      this.metrics.nativeControlPassthrough += 1;
      return options.execute();
    }

    const coordinateKey = sha256JsonFingerprint({ fleetCoordinateV0: options.coordinate });
    let claim;
    try {
      claim = await this.store.tryClaim({
        scopeHash: this.scopeHash,
        coordinateKey,
        ownerId: this.ownerId,
        leaseMs: this.leaseMs
      });
    } catch {
      this.metrics.storeFailures += 1;
      this.metrics.failOpenExecutions += 1;
      return options.execute();
    }

    if (claim.role === 'leader') {
      this.metrics.leaderClaims += 1;
      this.metrics.leaderExecutions += 1;
      let value;
      try {
        value = await options.execute();
      } catch (error) {
        try {
          await this.store.fail({
            scopeHash: this.scopeHash,
            coordinateKey,
            generation: claim.generation,
            ownerId: this.ownerId,
            pendingToken: claim.pendingToken
          });
        } catch { this.metrics.storeFailures += 1; }
        throw error;
      }

      let sealedResult;
      const context = { scopeHash: this.scopeHash, coordinateKey, generation: claim.generation };
      try {
        sealedResult = await this.codec.seal(value, context);
      } catch {
        this.metrics.codecFailures += 1;
        try {
          await this.store.fail({
            scopeHash: this.scopeHash,
            coordinateKey,
            generation: claim.generation,
            ownerId: this.ownerId,
            pendingToken: claim.pendingToken
          });
        } catch { this.metrics.storeFailures += 1; }
        return value;
      }

      if (sealedBytes(sealedResult) > this.maxSealedBytes) {
        this.metrics.oversizeResults += 1;
        try {
          await this.store.fail({
            scopeHash: this.scopeHash,
            coordinateKey,
            generation: claim.generation,
            ownerId: this.ownerId,
            pendingToken: claim.pendingToken
          });
        } catch { this.metrics.storeFailures += 1; }
        return value;
      }

      try {
        const published = await this.store.publish({
          scopeHash: this.scopeHash,
          coordinateKey,
          generation: claim.generation,
          ownerId: this.ownerId,
          pendingToken: claim.pendingToken,
          sealedResult
        });
        if (!published) this.metrics.storeFailures += 1;
      } catch { this.metrics.storeFailures += 1; }
      return value;
    }

    this.metrics.followerJoins += 1;
    const startedAt = this.now();
    const context = { scopeHash: this.scopeHash, coordinateKey, generation: claim.generation };
    while (this.now() - startedAt < this.maxWaitMs) {
      let state;
      try {
        state = await this.store.read({
          scopeHash: this.scopeHash,
          coordinateKey,
          generation: claim.generation,
          pendingToken: claim.pendingToken
        });
      } catch {
        this.metrics.storeFailures += 1;
        this.metrics.failOpenExecutions += 1;
        return options.execute();
      }

      if (state?.status === 'completed') {
        try {
          const value = await this.codec.open(state.sealedResult, context);
          this.metrics.followerReuses += 1;
          return value;
        } catch {
          this.metrics.codecFailures += 1;
          this.metrics.failOpenExecutions += 1;
          return options.execute();
        }
      }

      if (!state || state.status === 'failed' || state.status === 'missing') {
        this.metrics.failOpenExecutions += 1;
        return options.execute();
      }

      if (Number(state.expiresAtMs) <= this.now()) {
        this.metrics.followerTimeouts += 1;
        this.metrics.failOpenExecutions += 1;
        return options.execute();
      }
      await sleep(this.pollMs);
    }

    this.metrics.followerTimeouts += 1;
    this.metrics.failOpenExecutions += 1;
    return options.execute();
  }
}
