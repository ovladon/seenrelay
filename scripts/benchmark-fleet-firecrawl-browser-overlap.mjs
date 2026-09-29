import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  appendFile,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  SeenRelayFleetCoordinator,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec
} from '../clients/typescript/dist/fleet.js';
import { createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2';
const workerMode = process.argv.includes('--worker');
const rounds = Math.max(1, Math.min(5, Number(process.env.SEENRELAY_FLEET_BENCH_ROUNDS || 3)));
const workerCount = Math.max(2, Math.min(10, Number(process.env.SEENRELAY_FLEET_BENCH_WORKERS || 2)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createBenchmarkHttpFleetStore(url) {
  async function call(op, args) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, args })
    });
    const body = await response.json();
    if (!response.ok || body?.error) throw new Error(body?.error || `benchmark store HTTP ${response.status}`);
    return body.result;
  }
  return Object.freeze({
    tryClaim: (args) => call('tryClaim', args),
    read: (args) => call('read', args),
    publish: (args) => call('publish', args),
    fail: (args) => call('fail', args)
  });
}

async function startBenchmarkHttpFleetStoreServer() {
  const entries = new Map();
  const server = createServer(async (request, response) => {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const { op, args } = JSON.parse(raw || '{}');
      const key = `${args?.scopeHash}:${args?.coordinateKey}`;
      const now = Date.now();
      let entry = entries.get(key);
      let result;

      if (op === 'tryClaim') {
        if (!entry || entry.state !== 'pending' || entry.expiresAtMs <= now) {
          const generation = randomUUID();
          const expiresAtMs = now + Number(args.leaseMs);
          const pendingToken = `P|${generation}|${args.ownerId}|${expiresAtMs}`;
          entry = {
            state: 'pending',
            generation,
            ownerId: args.ownerId,
            expiresAtMs,
            pendingToken,
            sealedResult: null
          };
          entries.set(key, entry);
          result = { role: 'leader', generation, expiresAtMs, pendingToken };
        } else {
          result = {
            role: 'follower',
            generation: entry.generation,
            expiresAtMs: entry.expiresAtMs,
            pendingToken: entry.pendingToken
          };
        }
      } else if (op === 'read') {
        if (!entry || entry.generation !== args.generation) result = { status: 'missing' };
        else if (entry.state === 'completed') result = { status: 'completed', sealedResult: entry.sealedResult };
        else if (entry.state === 'failed') result = { status: 'failed' };
        else if (entry.expiresAtMs > now) result = { status: 'pending', expiresAtMs: entry.expiresAtMs };
        else result = { status: 'missing' };
      } else if (op === 'publish') {
        if (entry?.state === 'pending' && entry.pendingToken === args.pendingToken) {
          entry = { ...entry, state: 'completed', sealedResult: args.sealedResult };
          entries.set(key, entry);
          result = true;
        } else result = false;
      } else if (op === 'fail') {
        if (entry?.state === 'pending' && entry.pendingToken === args.pendingToken) {
          entries.set(key, { ...entry, state: 'failed' });
          result = true;
        } else result = false;
      } else {
        throw new Error(`unknown benchmark store operation: ${op}`);
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ result }));
    } catch {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'benchmark_store_internal_error' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function ms(start) {
  return Number((performance.now() - start).toFixed(3));
}

function median(values) {
  const xs = [...values].sort((a, b) => a - b);
  const middle = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[middle] : (xs[middle - 1] + xs[middle]) / 2;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} from ${url}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function scrapeIdOf(body) {
  return body?.metadata?.scrapeId
    || body?.data?.metadata?.scrapeId
    || body?.scrapeId
    || body?.data?.scrapeId
    || body?.id
    || body?.data?.id;
}

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function parseLayoutValue(body) {
  const candidates = [
    body?.result,
    body?.data?.result,
    body?.output,
    body?.data?.output,
    body?.stdout,
    body?.data?.stdout
  ];
  for (const candidate of candidates) {
    const raw = textOf(candidate).trim();
    if (!raw) continue;
    const marker = raw.match(/SEENRELAY_LAYOUT=(\{[^\n]+\})/);
    const json = marker?.[1] ?? raw;
    try {
      const parsed = JSON.parse(json);
      if (
        parsed
        && parsed.kind === 'browser-computed-layout-v1'
        && Number.isFinite(parsed.width)
        && Number.isFinite(parsed.height)
      ) return parsed;
    } catch {}
  }
  throw new Error(`Firecrawl interact response did not contain a layout value: ${JSON.stringify(body).slice(0, 1800)}`);
}

async function browserLayoutProbe(targetUrl) {
  const started = performance.now();
  let scrapeId;
  let stopBody = null;
  try {
    const scrape = await jsonRequest(`${FIRECRAWL_BASE}/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['markdown']
      })
    });
    scrapeId = scrapeIdOf(scrape);
    if (!scrapeId) {
      throw new Error(`Firecrawl scrape returned no scrapeId: ${JSON.stringify(scrape).slice(0, 1200)}`);
    }

    const code = [
      `await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded' });`,
      "const data = await page.evaluate(() => {",
      "  if (location.hostname !== 'example.com') throw new Error('unexpected host ' + location.hostname);",
      "  const el = document.documentElement;",
      "  const r = el.getBoundingClientRect();",
      "  const body = document.body;",
      "  return {",
      "    kind: 'browser-computed-layout-v1',",
      "    title: document.title,",
      "    hostname: location.hostname,",
      "    width: Math.round(r.width * 1000) / 1000,",
      "    height: Math.round(r.height * 1000) / 1000,",
      "    viewportWidth: window.innerWidth,",
      "    viewportHeight: window.innerHeight,",
      "    devicePixelRatio: window.devicePixelRatio,",
      "    bodyDisplay: body ? getComputedStyle(body).display : null",
      "  };",
      "});",
      "console.log('SEENRELAY_LAYOUT=' + JSON.stringify(data));",
      "JSON.stringify(data);"
    ].join('\n');

    const interacted = await jsonRequest(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        language: 'node',
        timeout: 60,
        code
      })
    });
    const value = parseLayoutValue(interacted);

    stopBody = await jsonRequest(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' }
    });

    const sessionDurationMs = Number(
      stopBody?.sessionDurationMs
      ?? stopBody?.data?.sessionDurationMs
      ?? 0
    );
    const reportedInteractCredits = Number(
      stopBody?.creditsBilled
      ?? stopBody?.data?.creditsBilled
      ?? NaN
    );
    const calculatedInteractCredits = sessionDurationMs > 0
      ? (sessionDurationMs / 60_000) * 2
      : null;
    const interactCredits = Number.isFinite(reportedInteractCredits)
      ? reportedInteractCredits
      : calculatedInteractCredits;

    return {
      value,
      provider: {
        scrapeCredits: 1,
        interactCredits: interactCredits == null ? null : Number(interactCredits.toFixed(6)),
        totalCredits: interactCredits == null ? null : Number((1 + interactCredits).toFixed(6)),
        sessionDurationMs: sessionDurationMs || null
      },
      providerMs: ms(started)
    };
  } finally {
    if (scrapeId && !stopBody) {
      try {
        await fetch(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' }
        });
      } catch {}
    }
  }
}

async function waitForStart(file) {
  while (true) {
    try {
      await stat(file);
      return;
    } catch {
      await sleep(10);
    }
  }
}

async function worker() {
  const root = process.env.FLEET_BENCH_ROOT;
  const phase = process.env.FLEET_BENCH_PHASE;
  const round = Number(process.env.FLEET_BENCH_ROUND);
  const targetUrl = process.env.FLEET_BENCH_TARGET_URL;
  const startFile = path.join(root, `start-${phase}-${round}`);
  await waitForStart(startFile);

  const started = performance.now();
  if (phase === 'baseline') {
    const probe = await browserLayoutProbe(targetUrl);
    await appendFile(
      path.join(root, 'provider-executions.jsonl'),
      `${JSON.stringify({ phase, round, pid: process.pid, ...probe.provider })}\n`
    );
    process.stdout.write(JSON.stringify({
      phase,
      round,
      callerMs: ms(started),
      probe
    }));
    return;
  }

  const rawStore = process.env.FLEET_BENCH_STORE_URL
    ? createBenchmarkHttpFleetStore(process.env.FLEET_BENCH_STORE_URL)
    : createRedisRestFleetStore({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
        prefix: process.env.FLEET_BENCH_REDIS_PREFIX,
        resultTtlMs: 30_000,
        completionGraceMs: 300,
        failureGraceMs: 200
      });
  const store = Object.fromEntries(
    ['tryClaim', 'read', 'publish', 'fail'].map((method) => [
      method,
      async (args) => {
        try {
          return await rawStore[method](args);
        } catch (error) {
          await appendFile(
            path.join(root, 'store-errors.jsonl'),
            `${JSON.stringify({
              phase,
              round,
              pid: process.pid,
              method,
              message: error instanceof Error ? error.message : String(error),
              cause: error instanceof Error && error.cause ? {
                name: error.cause.name ?? null,
                message: error.cause.message ?? String(error.cause),
                code: error.cause.code ?? null,
                errno: error.cause.errno ?? null,
                syscall: error.cause.syscall ?? null,
                hostname: error.cause.hostname ?? null
              } : null
            })}\n`
          );
          throw error;
        }
      }
    ])
  );
  const codec = fleetCodecFromPrivateCodec(
    createAesGcmPrivateCodec(Buffer.from(process.env.FLEET_BENCH_KEY_HEX, 'hex'))
  );
  const coordinator = new SeenRelayFleetCoordinator({
    store,
    codec,
    scopeKey: 'firecrawl-browser-layout-benchmark-v1',
    pollMs: 20,
    leaseMs: 30_000,
    maxWaitMs: 30_000
  });

  const coordinate = {
    provider: 'firecrawl',
    operation: 'scrape-interact-browser-computed-layout',
    targetUrl,
    probe: 'documentElement-computed-layout-v1',
    round
  };
  const execute = phase === 'coord-preflight'
    ? async () => {
        await sleep(750);
        return { preflight: true, coordinate };
      }
    : async () => {
        const authoritative = await browserLayoutProbe(targetUrl);
        await appendFile(
          path.join(root, 'provider-executions.jsonl'),
          `${JSON.stringify({ phase, round, pid: process.pid, ...authoritative.provider })}\n`
        );
        return authoritative;
      };

  const probe = await coordinator.run({
    coordinate,
    policy: {
      sideEffectClass: 'read_only',
      exactSingleAnswerShareable: true,
      independentSamplesRequired: false
    },
    execute
  });

  process.stdout.write(JSON.stringify({
    phase,
    round,
    callerMs: ms(started),
    probe,
    telemetry: coordinator.getTelemetry()
  }));
}

async function launchWorker({ root, phase, round, targetUrl, keyHex, redisPrefix, storeUrl }) {
  const script = new URL(import.meta.url).pathname;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--worker'], {
      env: {
        ...process.env,
        FLEET_BENCH_ROOT: root,
        FLEET_BENCH_PHASE: phase,
        FLEET_BENCH_ROUND: String(round),
        FLEET_BENCH_TARGET_URL: targetUrl,
        FLEET_BENCH_KEY_HEX: keyHex,
        FLEET_BENCH_REDIS_PREFIX: redisPrefix,
        FLEET_BENCH_STORE_URL: storeUrl || ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited ${code}: ${stderr}`));
      else {
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(new Error(`invalid worker JSON: ${stdout}\n${stderr}\n${error}`));
        }
      }
    });
  });
}

async function runGroup({ root, phase, round, runKey, keyHex, redisPrefix, storeUrl }) {
  const targetUrl = `https://example.com/?seenrelay_internal_benchmark=fleet-browser-layout-${runKey}-${round}`;
  const workers = Array.from({ length: workerCount }, () =>
    launchWorker({ root, phase, round, targetUrl, keyHex, redisPrefix, storeUrl })
  );
  await sleep(300);
  await writeFile(path.join(root, `start-${phase}-${round}`), 'go');
  return Promise.all(workers);
}

function stableValueKey(result) {
  return JSON.stringify(result?.probe?.value ?? null);
}

async function parent() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('UPSTASH_REDIS_REST_URL/TOKEN required');
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'seenrelay-fleet-browser-bench-'));
  const keyHex = randomBytes(32).toString('hex');
  const runKey = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
    : `local-${Date.now()}`;
  const redisPrefix = `seenrelay:bench:fleet-browser:${randomUUID()}`;
  const benchmarkStore = await startBenchmarkHttpFleetStoreServer();
  const baseline = [];
  const active = [];

  try {
    const preflight = await runGroup({
      root,
      phase: 'coord-preflight',
      round: 0,
      runKey,
      keyHex,
      redisPrefix,
      storeUrl: benchmarkStore.url
    });
    const preflightLeaders = preflight.reduce((sum, x) => sum + Number(x.telemetry?.leaderExecutions || 0), 0);
    const preflightFollowers = preflight.reduce((sum, x) => sum + Number(x.telemetry?.followerReuses || 0), 0);
    const preflightFailOpen = preflight.reduce((sum, x) => sum + Number(x.telemetry?.failOpenExecutions || 0), 0);
    let storeErrors = [];
    try {
      storeErrors = (await readFile(path.join(root, 'store-errors.jsonl'), 'utf8'))
        .trim()
        .split(/\n+/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {}

    const coordinationPreflight = {
      workers: workerCount,
      leader_executions: preflightLeaders,
      follower_reuses: preflightFollowers,
      fail_open_executions: preflightFailOpen,
      store_errors: storeErrors,
      pass: preflightLeaders === 1 && preflightFollowers === workerCount - 1 && preflightFailOpen === 0
    };

    if (process.env.SEENRELAY_FLEET_BENCH_DIAGNOSTIC_ONLY === '1') {
      await sleep(15_000);
      let delayedDirectPing;
      try {
        const pingResponse = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(['PING'])
        });
        const pingText = await pingResponse.text();
        delayedDirectPing = {
          ok: pingResponse.ok,
          status: pingResponse.status,
          body: pingText.slice(0, 200)
        };
      } catch (error) {
        delayedDirectPing = {
          ok: false,
          status: null,
          error: error instanceof Error ? error.message : String(error),
          cause: error instanceof Error && error.cause ? {
            message: error.cause.message ?? String(error.cause),
            code: error.cause.code ?? null,
            errno: error.cause.errno ?? null,
            syscall: error.cause.syscall ?? null,
            hostname: error.cause.hostname ?? null
          } : null
        };
      }
      const delayed = await runGroup({
        root,
        phase: 'coord-delayed-preflight',
        round: 1,
        runKey,
        keyHex,
        redisPrefix,
        storeUrl: benchmarkStore.url
      });
      const delayedLeaders = delayed.reduce((sum, x) => sum + Number(x.telemetry?.leaderExecutions || 0), 0);
      const delayedFollowers = delayed.reduce((sum, x) => sum + Number(x.telemetry?.followerReuses || 0), 0);
      const delayedFailOpen = delayed.reduce((sum, x) => sum + Number(x.telemetry?.failOpenExecutions || 0), 0);
      let delayedStoreErrors = [];
      try {
        delayedStoreErrors = (await readFile(path.join(root, 'store-errors.jsonl'), 'utf8'))
          .trim()
          .split(/\n+/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      } catch {}
      const delayedPreflight = {
        workers: workerCount,
        leader_executions: delayedLeaders,
        follower_reuses: delayedFollowers,
        fail_open_executions: delayedFailOpen,
        store_errors: delayedStoreErrors,
        pass: delayedLeaders === 1 && delayedFollowers === workerCount - 1 && delayedFailOpen === 0
      };
      const diagnostic = {
        schema_version: 'seenrelay-fleet-browser-coordination-diagnostic-v1',
        captured_at: new Date().toISOString(),
        provider_calls_executed: 0,
        delay_ms: 15_000,
        delayed_direct_ping: delayedDirectPing,
        coordination_preflight: coordinationPreflight,
        delayed_coordination_preflight: delayedPreflight
      };
      await writeFile('fleet-firecrawl-browser-overlap-benchmark.json', JSON.stringify(diagnostic, null, 2));
      process.stdout.write(`${JSON.stringify(diagnostic, null, 2)}\n`);
      if (!coordinationPreflight.pass || !delayedPreflight.pass) process.exitCode = 1;
      return;
    }

    if (!coordinationPreflight.pass) {
      throw new Error(`benchmark coordination preflight failed: ${JSON.stringify(coordinationPreflight)}`);
    }

    for (let round = 1; round <= rounds; round += 1) {
      baseline.push(await runGroup({ root, phase: 'baseline', round, runKey, keyHex, redisPrefix, storeUrl: benchmarkStore.url }));
    }
    for (let round = 1; round <= rounds; round += 1) {
      active.push(await runGroup({ root, phase: 'active', round, runKey, keyHex, redisPrefix, storeUrl: benchmarkStore.url }));
    }

    const executionLines = (await readFile(path.join(root, 'provider-executions.jsonl'), 'utf8'))
      .trim()
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const baselineExecutions = executionLines.filter((x) => x.phase === 'baseline');
    const activeExecutions = executionLines.filter((x) => x.phase === 'active');
    const flatBaseline = baseline.flat();
    const flatActive = active.flat();

    const allKeys = [...flatBaseline, ...flatActive].map(stableValueKey);
    const stableLayout = allKeys.length > 0 && allKeys.every((key) => key === allKeys[0]);

    const telemetryFields = [
      'calls',
      'policyPassthrough',
      'nativeControlPassthrough',
      'leaderClaims',
      'leaderExecutions',
      'followerJoins',
      'followerReuses',
      'failOpenExecutions',
      'storeFailures',
      'coordinateFailures',
      'codecFailures',
      'followerTimeouts',
      'oversizeResults',
      'avoidedExecutions',
      'receiptFailures'
    ];
    const activeTelemetryTotals = Object.fromEntries(
      telemetryFields.map((field) => [
        field,
        flatActive.reduce((sum, x) => sum + Number(x.telemetry?.[field] || 0), 0)
      ])
    );
    const leaders = activeTelemetryTotals.leaderExecutions;
    const followers = activeTelemetryTotals.followerReuses;
    const avoidedExecutions = activeTelemetryTotals.avoidedExecutions;

    const sumCredits = (items) => {
      const values = items.map((x) => x.totalCredits).filter(Number.isFinite);
      return values.length === items.length
        ? Number(values.reduce((a, b) => a + b, 0).toFixed(6))
        : null;
    };
    const baselineCredits = sumCredits(baselineExecutions);
    const activeCredits = sumCredits(activeExecutions);
    const actualCreditDelta = Number.isFinite(baselineCredits) && Number.isFinite(activeCredits)
      ? Number((baselineCredits - activeCredits).toFixed(6))
      : null;
    const baselineMeanCredits = Number.isFinite(baselineCredits) && baselineExecutions.length
      ? baselineCredits / baselineExecutions.length
      : null;
    const normalizedAvoidedCredits = Number.isFinite(baselineMeanCredits)
      ? Number((baselineMeanCredits * avoidedExecutions).toFixed(6))
      : null;

    const report = {
      schema_version: 'seenrelay-external-inflight-replay-v1',
      captured_at: new Date().toISOString(),
      evidence_level: 'controlled_external_failure_pattern_replay',
      failure_pattern_source: 'https://github.com/langchain-ai/langgraph/issues/7417',
      failure_pattern_note: 'The external issue reports identical tool arguments re-dispatched while the first tool call is still running. This benchmark simulates that dispatch timing; it is not a LangGraph Cloud trace and is not an independent customer ROI claim.',
      natural_customer_roi: false,
      provider: {
        name: 'Firecrawl',
        path: 'scrape + interact(code) + stop',
        provider_native_cache_left_enabled: true,
        explicit_max_age_override: false,
        browser_fact: 'computed H1 layout and viewport',
        ordinary_source_fetch_equivalent: false,
        local_browser_is_competing_control: true
      },
      rounds,
      workers_per_round: workerCount,
      baseline: {
        provider_executions: baselineExecutions.length,
        total_provider_credits: baselineCredits,
        caller_latency_ms_median: Number(median(flatBaseline.map((x) => x.callerMs)).toFixed(3))
      },
      seenrelay_active: {
        provider_executions: activeExecutions.length,
        leader_executions: leaders,
        follower_reuses: followers,
        avoided_executions: avoidedExecutions,
        total_provider_credits: activeCredits,
        caller_latency_ms_median: Number(median(flatActive.map((x) => x.callerMs)).toFixed(3)),
        telemetry_totals: activeTelemetryTotals
      },
      economics: {
        measured_credit_delta_baseline_minus_active: actualCreditDelta,
        normalized_credits_avoided_at_baseline_mean: normalizedAvoidedCredits,
        dollar_savings_claim: null,
        net_savings_claim: null,
        note: 'Credits are measured provider units. No dollar or net-savings claim is made because account plan, included credits, local-browser alternatives and coordination-store cost are workload-specific.'
      },
      safety: {
        browser_result_stable_across_authoritative_samples: stableLayout,
        mutation_calls_suppressed: 0,
        independent_samples_collapsed: 0
      }
    };

    report.kill_criteria = {
      baseline_executions_equal_workers_per_round: baselineExecutions.length === rounds * workerCount,
      active_executions_equal_one_per_round: activeExecutions.length === rounds,
      active_roles_equal_one_leader_rest_followers_per_round:
        leaders === rounds && followers === rounds * (workerCount - 1),
      avoided_executions_equal_followers_per_round: avoidedExecutions === rounds * (workerCount - 1),
      authoritative_browser_value_stable: stableLayout,
      provider_credits_lower_when_measurable: actualCreditDelta == null ? null : actualCreditDelta > 0
    };
    report.mechanism_result = Object.entries(report.kill_criteria)
      .filter(([, value]) => value !== null)
      .every(([, value]) => value === true)
      ? 'PASS'
      : 'FAIL';

    await writeFile('fleet-firecrawl-browser-overlap-benchmark.json', JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (report.mechanism_result !== 'PASS') process.exitCode = 1;
  } finally {
    await benchmarkStore.close();
    await rm(root, { recursive: true, force: true });
  }
}

if (workerMode) await worker();
else await parent();
