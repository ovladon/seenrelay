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

function optionalNonNegativeFinite(value, label) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new TypeError(`${label} must be a non-negative finite number`);
  return n;
}

function normalizeCostInput(cost) {
  if (cost === undefined || cost === null) return null;
  if (typeof cost === 'number') {
    return Object.freeze({
      marginalCostUsd: optionalNonNegativeFinite(cost, 'cost'),
      provenance: 'caller_estimate',
      resolver: null
    });
  }
  if (typeof cost !== 'object') throw new TypeError('cost must be a number or object');
  const resolver = cost.resolveMarginalCostUsd;
  if (resolver !== undefined && typeof resolver !== 'function') {
    throw new TypeError('cost.resolveMarginalCostUsd must be a function');
  }
  const marginalCostUsd = optionalNonNegativeFinite(cost.marginalCostUsd, 'cost.marginalCostUsd');
  if (marginalCostUsd === null && typeof resolver !== 'function') {
    throw new TypeError('cost requires marginalCostUsd or resolveMarginalCostUsd()');
  }
  const provenance = typeof cost.provenance === 'string' && cost.provenance.trim()
    ? cost.provenance.trim()
    : 'caller_estimate';
  return Object.freeze({ marginalCostUsd, provenance, resolver: resolver ?? null });
}

async function resolveReceiptCost(costInput, value) {
  if (!costInput) return { marginalCostUsd: null, provenance: null, costResolution: 'not_provided' };
  if (costInput.resolver) {
    try {
      const resolved = optionalNonNegativeFinite(
        await costInput.resolver(value),
        'cost.resolveMarginalCostUsd() result'
      );
      return {
        marginalCostUsd: resolved,
        provenance: costInput.provenance,
        costResolution: resolved === null ? 'unknown' : 'resolved'
      };
    } catch {
      return {
        marginalCostUsd: null,
        provenance: costInput.provenance,
        costResolution: 'resolver_failed'
      };
    }
  }
  return {
    marginalCostUsd: costInput.marginalCostUsd,
    provenance: costInput.provenance,
    costResolution: costInput.marginalCostUsd === null ? 'unknown' : 'fixed'
  };
}

function buildSavingsReceipt({
  coordinateKey,
  path,
  role,
  executedAuthoritative,
  reusedFollower,
  marginalCostUsd,
  provenance,
  costResolution
}) {
  const avoidedExecutions = reusedFollower ? 1 : 0;
  const grossAvoidedCostUsd = avoidedExecutions === 1 && marginalCostUsd !== null
    ? marginalCostUsd
    : null;
  return Object.freeze({
    schema: 'seenrelay-fleet-savings-receipt-v0',
    coordinateHash: coordinateKey ?? null,
    path,
    role,
    executedAuthoritative: Boolean(executedAuthoritative),
    reusedFollower: Boolean(reusedFollower),
    avoidedExecutions,
    marginalCostUsd,
    costProvenance: provenance,
    costResolution,
    grossAvoidedCostUsd,
    createdAt: new Date().toISOString()
  });
}

async function emitReceipt(callback, receipt) {
  if (typeof callback !== 'function') return true;
  try {
    await callback(receipt);
    return true;
  } catch {
    return false;
  }
}

export function createFleetSavingsLedger() {
  const state = {
    receipts: 0,
    authoritativeExecutions: 0,
    followerReuses: 0,
    avoidedExecutions: 0,
    grossAvoidedCostUsd: 0,
    costedAvoidedExecutions: 0,
    uncostedAvoidedExecutions: 0,
    receiptPaths: Object.create(null),
    costProvenance: Object.create(null)
  };

  const record = (receipt) => {
    if (!receipt || receipt.schema !== 'seenrelay-fleet-savings-receipt-v0') {
      throw new TypeError('record() requires a SeenRelay fleet savings receipt');
    }
    state.receipts += 1;
    if (receipt.executedAuthoritative) state.authoritativeExecutions += 1;
    if (receipt.reusedFollower) state.followerReuses += 1;
    state.avoidedExecutions += Number(receipt.avoidedExecutions || 0);
    state.receiptPaths[receipt.path] = (state.receiptPaths[receipt.path] || 0) + 1;
    if (receipt.costProvenance) {
      state.costProvenance[receipt.costProvenance] =
        (state.costProvenance[receipt.costProvenance] || 0) + 1;
    }
    if (receipt.avoidedExecutions > 0) {
      if (receipt.grossAvoidedCostUsd === null) {
        state.uncostedAvoidedExecutions += receipt.avoidedExecutions;
      } else {
        state.costedAvoidedExecutions += receipt.avoidedExecutions;
        state.grossAvoidedCostUsd += receipt.grossAvoidedCostUsd;
      }
    }
  };

  const snapshot = () => Object.freeze({
    schema: 'seenrelay-fleet-savings-ledger-v0',
    receipts: state.receipts,
    authoritativeExecutions: state.authoritativeExecutions,
    followerReuses: state.followerReuses,
    avoidedExecutions: state.avoidedExecutions,
    grossAvoidedCostUsd: state.grossAvoidedCostUsd,
    costedAvoidedExecutions: state.costedAvoidedExecutions,
    uncostedAvoidedExecutions: state.uncostedAvoidedExecutions,
    receiptPaths: Object.freeze({ ...state.receiptPaths }),
    costProvenance: Object.freeze({ ...state.costProvenance })
  });

  return Object.freeze({ record, snapshot });
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
  const rawUrl = typeof options.url === 'string' ? options.url : '';
  let urlEnd = rawUrl.length;
  while (urlEnd > 0 && rawUrl.charCodeAt(urlEnd - 1) === 47) urlEnd -= 1;
  const url = rawUrl.slice(0, urlEnd);
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
      if (parsed?.generation === generation && parsed.state === 'C') {
        // A publish may complete atomically between our first GET(result) and GET(lock).
        // Re-read the result before treating the generation as missing.
        const completedResult = await command(['GET', result]);
        if (completedResult !== null && completedResult !== undefined) {
          return { status: 'completed', sealedResult: completedResult };
        }
        return { status: 'missing' };
      }
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
      oversizeResults: 0,
      avoidedExecutions: 0,
      grossAvoidedCostUsd: 0,
      costedAvoidedExecutions: 0,
      receiptFailures: 0
    };
  }

  getTelemetry() { return Object.freeze({ ...this.metrics }); }

  async #receipt({ options, coordinateKey = null, path, role, executedAuthoritative, reusedFollower, value }) {
    const costInput = normalizeCostInput(options.cost);
    const cost = await resolveReceiptCost(costInput, value);
    const receipt = buildSavingsReceipt({
      coordinateKey,
      path,
      role,
      executedAuthoritative,
      reusedFollower,
      marginalCostUsd: cost.marginalCostUsd,
      provenance: cost.provenance,
      costResolution: cost.costResolution
    });
    if (receipt.avoidedExecutions > 0) {
      this.metrics.avoidedExecutions += receipt.avoidedExecutions;
      if (receipt.grossAvoidedCostUsd !== null) {
        this.metrics.costedAvoidedExecutions += receipt.avoidedExecutions;
        this.metrics.grossAvoidedCostUsd += receipt.grossAvoidedCostUsd;
      }
    }
    if (!await emitReceipt(options.onReceipt, receipt)) this.metrics.receiptFailures += 1;
    return receipt;
  }

  async run(options = {}) {
    if (typeof options.execute !== 'function') throw new TypeError('execute must be a function');
    this.metrics.calls += 1;

    if (!explicitSingleAnswerPolicy(options.policy)) {
      this.metrics.policyPassthrough += 1;
      const value = await options.execute();
      await this.#receipt({
        options,
        path: 'policy_passthrough',
        role: 'passthrough',
        executedAuthoritative: true,
        reusedFollower: false,
        value
      });
      return value;
    }
    if (nativeZeroCostDominates(options.policy)) {
      this.metrics.nativeControlPassthrough += 1;
      const value = await options.execute();
      await this.#receipt({
        options,
        path: 'native_control_passthrough',
        role: 'passthrough',
        executedAuthoritative: true,
        reusedFollower: false,
        value
      });
      return value;
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
      const value = await options.execute();
      await this.#receipt({
        options, coordinateKey,
        path: 'fail_open_store_claim',
        role: 'fail_open',
        executedAuthoritative: true,
        reusedFollower: false,
        value
      });
      return value;
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
        await this.#receipt({
          options, coordinateKey,
          path: 'leader_codec_fail_local_result',
          role: 'leader',
          executedAuthoritative: true,
          reusedFollower: false,
          value
        });
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
        await this.#receipt({
          options, coordinateKey,
          path: 'leader_oversize_local_result',
          role: 'leader',
          executedAuthoritative: true,
          reusedFollower: false,
          value
        });
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
      await this.#receipt({
        options, coordinateKey,
        path: 'leader_execution',
        role: 'leader',
        executedAuthoritative: true,
        reusedFollower: false,
        value
      });
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
        const value = await options.execute();
        await this.#receipt({
          options, coordinateKey,
          path: 'fail_open_store_read',
          role: 'fail_open',
          executedAuthoritative: true,
          reusedFollower: false,
          value
        });
        return value;
      }

      if (state?.status === 'completed') {
        try {
          const value = await this.codec.open(state.sealedResult, context);
          this.metrics.followerReuses += 1;
          await this.#receipt({
            options, coordinateKey,
            path: 'follower_reuse',
            role: 'follower',
            executedAuthoritative: false,
            reusedFollower: true,
            value
          });
          return value;
        } catch {
          this.metrics.codecFailures += 1;
          this.metrics.failOpenExecutions += 1;
          const value = await options.execute();
          await this.#receipt({
            options, coordinateKey,
            path: 'fail_open_codec',
            role: 'fail_open',
            executedAuthoritative: true,
            reusedFollower: false,
            value
          });
          return value;
        }
      }

      if (!state || state.status === 'failed' || state.status === 'missing') {
        this.metrics.failOpenExecutions += 1;
        const value = await options.execute();
        await this.#receipt({
          options, coordinateKey,
          path: 'fail_open_missing_generation',
          role: 'fail_open',
          executedAuthoritative: true,
          reusedFollower: false,
          value
        });
        return value;
      }

      if (Number(state.expiresAtMs) <= this.now()) {
        this.metrics.followerTimeouts += 1;
        this.metrics.failOpenExecutions += 1;
        const value = await options.execute();
        await this.#receipt({
          options, coordinateKey,
          path: 'fail_open_lease_expired',
          role: 'fail_open',
          executedAuthoritative: true,
          reusedFollower: false,
          value
        });
        return value;
      }
      await sleep(this.pollMs);
    }

    this.metrics.followerTimeouts += 1;
    this.metrics.failOpenExecutions += 1;
    const value = await options.execute();
    await this.#receipt({
      options, coordinateKey,
      path: 'fail_open_wait_timeout',
      role: 'fail_open',
      executedAuthoritative: true,
      reusedFollower: false,
      value
    });
    return value;
  }
}
