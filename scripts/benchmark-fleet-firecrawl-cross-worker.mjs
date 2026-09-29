import { spawn } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  SeenRelayFleetCoordinator,
  SeenRelayFleetShadowMeter,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec
} from '../clients/typescript/dist/fleet.js';
import { createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2';
const workerMode = process.argv.includes('--worker');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ms(start) {
  return Number((performance.now() - start).toFixed(3));
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text }; }
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

function interactValueOf(body) {
  const raw = body?.result ?? body?.data?.result;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw != null) return JSON.stringify(raw);

  const text = [body?.stdout, body?.data?.stdout, body?.output, body?.data?.output]
    .filter((value) => value != null)
    .map((value) => typeof value === 'string' ? value : JSON.stringify(value))
    .join('\n');
  const match = text.match(/SEENRELAY_FLEET_LAYOUT=(\\{[^\\n]+\\})/);
  if (!match) throw new Error(`Interact response did not contain layout value: ${JSON.stringify(body).slice(0, 1500)}`);
  return match[1];
}

async function runFirecrawlRenderedLayout(targetUrl) {
  const started = performance.now();
  let scrapeId;
  let stopBody = null;
  try {
    // Intentionally leave Firecrawl's provider-native cache enabled. This benchmark
    // must measure SeenRelay against the normal provider path, not manufacture a win
    // by disabling a stronger native control.
    const scrape = await jsonRequest(`${FIRECRAWL_BASE}/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, formats: ['markdown'] })
    });
    scrapeId = scrapeIdOf(scrape);
    if (!scrapeId) throw new Error(`Firecrawl scrape returned no scrapeId: ${JSON.stringify(scrape).slice(0, 1500)}`);

    const interact = await jsonRequest(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        language: 'node',
        timeout: 60,
        code: [
          "const box = await page.locator('h1').boundingBox();",
          "if (!box) throw new Error('missing h1 bounding box');",
          "const rounded = Object.fromEntries(Object.entries(box).map(([k,v]) => [k, Math.round(v * 1000) / 1000]));",
          "console.log('SEENRELAY_FLEET_LAYOUT=' + JSON.stringify(rounded));",
          'JSON.stringify(rounded);'
        ].join('\n')
      })
    });
    const value = interactValueOf(interact);

    stopBody = await jsonRequest(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' }
    });

    const sessionDurationMs = Number(stopBody?.sessionDurationMs ?? stopBody?.data?.sessionDurationMs ?? 0);
    const reportedInteractCredits = Number(stopBody?.creditsBilled ?? stopBody?.data?.creditsBilled ?? NaN);
    const interactCredits = Number.isFinite(reportedInteractCredits)
      ? reportedInteractCredits
      : sessionDurationMs > 0
        ? (sessionDurationMs / 60_000) * 2
        : 0;

    return {
      value,
      usage: {
        scrapeCredits: 1,
        interactCredits: Number(interactCredits.toFixed(6)),
        totalCredits: Number((1 + interactCredits).toFixed(6)),
        interactCreditsSource: Number.isFinite(reportedInteractCredits) ? 'provider_reported' : 'documented_rate_from_session_duration'
      },
      elapsedMs: ms(started)
    };
  } finally {
    if (scrapeId && !stopBody) {
      try {
        await fetch(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' }
        });
      } catch {
        // Best-effort cleanup after a failed sample. The benchmark still fails.
      }
    }
  }
}

async function waitForStart(root, phase) {
  const startFile = path.join(root, `start-${phase}`);
  while (true) {
    try { await stat(startFile); return; }
    catch { await sleep(5); }
  }
}

function makeStore(prefix) {
  return createRedisRestFleetStore({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    prefix,
    resultTtlMs: 30_000,
    completionGraceMs: 300,
    failureGraceMs: 200
  });
}

async function worker() {
  const root = process.env.FLEET_BENCH_ROOT;
  const phase = process.env.FLEET_BENCH_PHASE;
  const targetUrl = process.env.FLEET_BENCH_TARGET_URL;
  const prefix = process.env.FLEET_BENCH_PREFIX;
  if (!root || !phase || !targetUrl || !prefix) throw new Error('missing fleet benchmark worker environment');

  await waitForStart(root, phase);

  const coordinate = {
    provider: 'firecrawl',
    operation: 'scrape+interact.rendered-layout',
    targetUrl,
    browserFact: 'h1.boundingBox.rounded-3dp',
    providerCache: 'enabled'
  };
  const policy = {
    sideEffectClass: 'read_only',
    exactSingleAnswerShareable: true,
    independentSamplesRequired: false
  };

  const execute = async () => {
    await appendFile(path.join(root, `provider-${phase}.log`), `${process.pid}\n`);
    return runFirecrawlRenderedLayout(targetUrl);
  };

  const started = performance.now();
  if (phase === 'shadow') {
    const meter = new SeenRelayFleetShadowMeter({
      store: makeStore(`${prefix}:shadow`),
      scopeKey: 'first-party-firecrawl-rendered-layout'
    });
    const result = await meter.measure({ coordinate, policy, execute });
    process.stdout.write(JSON.stringify({ phase, result, report: meter.getReport(), totalMs: ms(started) }));
    return;
  }

  if (phase === 'active') {
    const codec = fleetCodecFromPrivateCodec(
      createAesGcmPrivateCodec(Buffer.from(process.env.FLEET_BENCH_KEY_HEX, 'hex'))
    );
    const receipts = [];
    const fleet = new SeenRelayFleetCoordinator({
      store: makeStore(`${prefix}:active`),
      codec,
      scopeKey: 'first-party-firecrawl-rendered-layout',
      pollMs: 20,
      leaseMs: 60_000,
      maxWaitMs: 60_000
    });
    const result = await fleet.run({
      coordinate,
      policy,
      execute,
      onReceipt: (receipt) => receipts.push(receipt)
    });
    process.stdout.write(JSON.stringify({ phase, result, telemetry: fleet.getTelemetry(), receipts, totalMs: ms(started) }));
    return;
  }

  throw new Error(`unknown phase ${phase}`);
}

async function countExecutions(file) {
  try {
    const text = await readFile(file, 'utf8');
    return text.trim().split(/\n+/).filter(Boolean).length;
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
}

async function parent() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('UPSTASH_REDIS_REST_URL/TOKEN required');
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'seenrelay-fleet-firecrawl-economics-'));
  const keyHex = randomBytes(32).toString('hex');
  const prefix = `seenrelay:bench:fleet-firecrawl:${randomUUID()}`;
  const runKey = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
    : `local-${Date.now()}`;
  const targetUrl = `https://example.com/?seenrelay_internal_benchmark=fleet-rendered-layout-${runKey}`;
  const script = new URL(import.meta.url).pathname;

  function launch(phase) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, '--worker'], {
        env: {
          ...process.env,
          FLEET_BENCH_ROOT: root,
          FLEET_BENCH_PHASE: phase,
          FLEET_BENCH_TARGET_URL: targetUrl,
          FLEET_BENCH_PREFIX: prefix,
          FLEET_BENCH_KEY_HEX: keyHex
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== 0) reject(new Error(`${phase} worker exited ${code}: ${stderr}`));
        else {
          try { resolve(JSON.parse(stdout)); }
          catch (error) { reject(new Error(`${phase} worker emitted invalid JSON: ${stdout}\n${stderr}\n${error}`)); }
        }
      });
    });
  }

  async function runPhase(phase) {
    const a = launch(phase);
    const b = launch(phase);
    await sleep(250);
    await writeFile(path.join(root, `start-${phase}`), 'go');
    return Promise.all([a, b]);
  }

  try {
    const shadow = await runPhase('shadow');
    const shadowExecutions = await countExecutions(path.join(root, 'provider-shadow.log'));
    const shadowOverlap = shadow.reduce((n, x) => n + Number(x.report?.callsWithIdenticalInflightPredecessor || 0), 0);
    const shadowValues = shadow.map((x) => x.result?.value);
    const shadowCredits = shadow.map((x) => Number(x.result?.usage?.totalCredits || 0));
    const shadowFollower = shadow.find((x) => Number(x.report?.callsWithIdenticalInflightPredecessor || 0) > 0);
    const observedDuplicateCredits = Number(shadowFollower?.result?.usage?.totalCredits || 0);

    if (shadowExecutions !== 2) throw new Error(`shadow must execute both authoritative calls; got ${shadowExecutions}`);
    if (shadowOverlap !== 1) throw new Error(`expected one exact in-flight overlap in shadow; got ${shadowOverlap}`);
    if (!shadowValues[0] || shadowValues[0] !== shadowValues[1]) {
      throw new Error(`shadow browser results were not exact-compatible: ${JSON.stringify(shadowValues)}`);
    }

    const active = await runPhase('active');
    const activeExecutions = await countExecutions(path.join(root, 'provider-active.log'));
    const leaders = active.reduce((n, x) => n + Number(x.telemetry?.leaderExecutions || 0), 0);
    const followers = active.reduce((n, x) => n + Number(x.telemetry?.followerReuses || 0), 0);
    const avoided = active.reduce((n, x) => n + Number(x.telemetry?.avoidedExecutions || 0), 0);
    const activeValues = active.map((x) => x.result?.value);
    const activeProviderCredits = active
      .filter((x) => Number(x.telemetry?.leaderExecutions || 0) > 0)
      .reduce((n, x) => n + Number(x.result?.usage?.totalCredits || 0), 0);

    if (activeExecutions !== 1) throw new Error(`active coordination expected one provider execution; got ${activeExecutions}`);
    if (leaders !== 1 || followers !== 1 || avoided !== 1) {
      throw new Error(`unexpected active roles leaders=${leaders} followers=${followers} avoided=${avoided}`);
    }
    if (!activeValues[0] || activeValues[0] !== activeValues[1]) {
      throw new Error(`active workers did not receive identical result: ${JSON.stringify(activeValues)}`);
    }
    if (activeValues[0] !== shadowValues[0]) {
      throw new Error(`rendered browser fact changed across phases: shadow=${shadowValues[0]} active=${activeValues[0]}`);
    }

    const result = {
      schema: 'seenrelay-fleet-firecrawl-cross-worker-economics-v0',
      evidenceClass: 'first_party_controlled_mechanics',
      capturedAt: new Date().toISOString(),
      workload: {
        provider: 'Firecrawl',
        workers: 2,
        operation: 'scrape + browser interact(code)',
        fact: 'rendered h1 bounding box rounded to 3 decimals',
        exactCoordinateIncludes: ['provider', 'operation', 'targetUrl', 'browserFact', 'providerCache'],
        sourceBytesEquivalent: false,
        sourceBytesEquivalentReason: 'The measured value is produced by browser layout; raw HTML alone does not contain the rendered bounding box.',
        providerNativeCache: 'enabled',
        localSingleFlightBaseline: 'not applicable across the two separate Node processes used here'
      },
      shadow: {
        authoritativeExecutions: shadowExecutions,
        exactInflightOverlapStarts: shadowOverlap,
        providerCreditsObserved: Number(shadowCredits.reduce((a, b) => a + b, 0).toFixed(6)),
        observedDuplicateProviderCredits: Number(observedDuplicateCredits.toFixed(6)),
        workerMs: shadow.map((x) => x.totalMs)
      },
      active: {
        authoritativeExecutions: activeExecutions,
        leaderExecutions: leaders,
        followerReuses: followers,
        avoidedExecutions: avoided,
        providerCreditsActuallyBilledOnLeaderPath: Number(activeProviderCredits.toFixed(6)),
        workerMs: active.map((x) => x.totalMs)
      },
      economics: {
        providerExecutionReductionPercentVsMeasuredShadow: Number(((1 - activeExecutions / shadowExecutions) * 100).toFixed(1)),
        avoidedExecutionsActual: avoided,
        observedShadowDuplicateProviderCredits: Number(observedDuplicateCredits.toFixed(6)),
        dollarSavingsClaim: null,
        dollarSavingsReason: 'Provider credits do not imply immediate invoice savings under fixed plans; a customer-specific marginal dollar cost is required.'
      },
      caveats: [
        'This is a controlled first-party collision benchmark, not a natural customer workload and not a customer ROI claim.',
        'The benchmark proves cross-process exact in-flight suppression mechanics and provider-unit opportunity only.',
        'A caller-owned distributed single-flight implementation with equivalent safety semantics is a valid alternative and should be compared in a customer deployment.',
        'Natural fleet ROI still requires the separate FLEET_OVERLAP_GATE evidence floor.'
      ],
      result: 'PASS'
    };

    await writeFile('fleet-firecrawl-cross-worker-economics.json', JSON.stringify(result, null, 2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (workerMode) await worker();
else await parent();
