import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  SeenRelayFleetCoordinator,
  createFleetSavingsLedger,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec
} from '../clients/typescript/dist/fleet.js';
import { createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

const workerMode = process.argv.includes('--coordinated-worker');
const QLDPC_COMMIT = '4570f9422c9c9c2782679e1f8015aadf34220655';
const CANDIDATE = 'codes/330-66-12.json';
const SEED = '571640213';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safePythonEnv(extra) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    PYTHONUNBUFFERED: '1',
    PYTHONNOUSERSITE: '1',
    ...extra
  };
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
}

async function waitForFile(file, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await stat(file); return; } catch {}
    await sleep(10);
  }
  throw new Error(`timed out waiting for ${file}`);
}

function launchPython({ root, cacheRoot, gateLog, readyFile = null, startFile = null }) {
  const helper = path.resolve('scripts/qldpc-validate-worker.py');
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN || 'python', [helper], {
      env: safePythonEnv({
        QLDPC_ROOT: process.env.QLDPC_ROOT,
        QLDPC_CANDIDATE: CANDIDATE,
        QLDPC_CACHE_ROOT: cacheRoot,
        QLDPC_GATE_LOG: gateLog,
        QLDPC_SEED: SEED,
        QLDPC_READY_FILE: readyFile || undefined,
        QLDPC_START_FILE: startFile || undefined,
        TMPDIR: root
      }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`qldpc worker exited ${code}: ${stderr.slice(-4000)}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      try {
        resolve(JSON.parse(lines.at(-1)));
      } catch (error) {
        reject(new Error(`qldpc worker returned non-JSON stdout: ${stdout.slice(-4000)}; ${error.message}`));
      }
    });
  });
}

async function countLines(file) {
  try {
    return (await readFile(file, 'utf8')).trim().split(/\r?\n/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function runColdNativeRace(root) {
  const cacheRoot = path.join(root, 'baseline-cache');
  const gateLog = path.join(root, 'baseline-gates.log');
  const startFile = path.join(root, 'baseline-start');
  const readyA = path.join(root, 'baseline-ready-a');
  const readyB = path.join(root, 'baseline-ready-b');

  const a = launchPython({ root, cacheRoot, gateLog, readyFile: readyA, startFile });
  const b = launchPython({ root, cacheRoot, gateLog, readyFile: readyB, startFile });
  await Promise.all([waitForFile(readyA), waitForFile(readyB)]);

  const t0 = Date.now();
  await writeFile(startFile, 'go\n');
  const results = await Promise.all([a, b]);
  const wallMs = Date.now() - t0;
  const gateExecutions = await countLines(gateLog);

  if (gateExecutions !== 2) {
    throw new Error(`cold native-cache race did not reproduce: expected 2 gate executions, got ${gateExecutions}`);
  }
  if (results.some((r) => r.reused !== false)) {
    throw new Error(`expected both simultaneous cold calls to miss native cache: ${JSON.stringify(results)}`);
  }

  const warm = await launchPython({ root, cacheRoot, gateLog });
  const afterWarmGateExecutions = await countLines(gateLog);
  if (!warm.reused || afterWarmGateExecutions !== 2) {
    throw new Error(`native warm cache did not dominate after first completion: ${JSON.stringify(warm)} gates=${afterWarmGateExecutions}`);
  }

  return {
    workers: 2,
    simultaneous_cold_cache_misses: true,
    authoritative_gate_executions: gateExecutions,
    wall_ms: wallMs,
    total_worker_cpu_ms: Number(results.reduce((sum, r) => sum + r.cpu_ms, 0).toFixed(3)),
    worker_elapsed_ms: results.map((r) => r.elapsed_ms),
    worker_cpu_ms: results.map((r) => r.cpu_ms),
    native_warm_cache: {
      reused: warm.reused,
      elapsed_ms: warm.elapsed_ms,
      cpu_ms: warm.cpu_ms,
      additional_gate_executions: afterWarmGateExecutions - gateExecutions
    }
  };
}

async function coordinatedWorker() {
  const root = process.env.BENCH_ROOT;
  const readyFile = process.env.BENCH_READY_FILE;
  const startFile = process.env.BENCH_START_FILE;
  await writeFile(readyFile, 'ready\n');
  await waitForFile(startFile);

  const store = createRedisRestFleetStore({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    prefix: process.env.BENCH_REDIS_PREFIX,
    resultTtlMs: 60_000,
    completionGraceMs: 500,
    failureGraceMs: 500
  });
  const codec = fleetCodecFromPrivateCodec(
    createAesGcmPrivateCodec(Buffer.from(process.env.BENCH_KEY_HEX, 'hex'))
  );
  const coordinator = new SeenRelayFleetCoordinator({
    store,
    codec,
    scopeKey: 'external-qldpc-verdict-race',
    pollMs: 25,
    leaseMs: 60_000,
    maxWaitMs: 90_000
  });
  const ledger = createFleetSavingsLedger();

  const value = await coordinator.run({
    coordinate: {
      external_repository: 'unitaryfoundation/qldpc-challenge',
      external_commit: QLDPC_COMMIT,
      operation: 'research.kit.coordination.validate_cached',
      candidate: CANDIDATE,
      seed: Number(SEED),
      refute: true
    },
    policy: {
      sideEffectClass: 'read_only',
      exactSingleAnswerShareable: true,
      independentSamplesRequired: false
    },
    execute: () => launchPython({
      root,
      cacheRoot: process.env.BENCH_ACTIVE_CACHE,
      gateLog: process.env.BENCH_ACTIVE_GATE_LOG
    }),
    onReceipt: ledger.record
  });

  process.stdout.write(JSON.stringify({
    value,
    telemetry: coordinator.getTelemetry(),
    ledger: ledger.snapshot()
  }));
}

function launchCoordinatedJsWorker({ root, readyFile, startFile, cacheRoot, gateLog, prefix, keyHex }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, '--coordinated-worker'], {
      env: {
        ...process.env,
        BENCH_ROOT: root,
        BENCH_READY_FILE: readyFile,
        BENCH_START_FILE: startFile,
        BENCH_ACTIVE_CACHE: cacheRoot,
        BENCH_ACTIVE_GATE_LOG: gateLog,
        BENCH_REDIS_PREFIX: prefix,
        BENCH_KEY_HEX: keyHex
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`coordinated worker exited ${code}: ${stderr.slice(-4000)}`));
      else {
        try { resolve(JSON.parse(stdout)); }
        catch (error) { reject(new Error(`bad coordinated JSON: ${stdout.slice(-4000)}; ${error.message}`)); }
      }
    });
  });
}

async function runSeenRelayCoordination(root) {
  const cacheRoot = path.join(root, 'active-cache');
  const gateLog = path.join(root, 'active-gates.log');
  const startFile = path.join(root, 'active-start');
  const readyA = path.join(root, 'active-ready-a');
  const readyB = path.join(root, 'active-ready-b');
  const prefix = `seenrelay:qldpc-bench:${randomUUID()}`;
  const keyHex = randomBytes(32).toString('hex');

  const a = launchCoordinatedJsWorker({ root, readyFile: readyA, startFile, cacheRoot, gateLog, prefix, keyHex });
  const b = launchCoordinatedJsWorker({ root, readyFile: readyB, startFile, cacheRoot, gateLog, prefix, keyHex });
  await Promise.all([waitForFile(readyA), waitForFile(readyB)]);

  const t0 = Date.now();
  await writeFile(startFile, 'go\n');
  const results = await Promise.all([a, b]);
  const wallMs = Date.now() - t0;
  const gateExecutions = await countLines(gateLog);

  const leaders = results.reduce((sum, r) => sum + r.telemetry.leaderExecutions, 0);
  const followers = results.reduce((sum, r) => sum + r.telemetry.followerReuses, 0);
  const avoided = results.reduce((sum, r) => sum + r.ledger.avoidedExecutions, 0);
  if (gateExecutions !== 1 || leaders !== 1 || followers !== 1 || avoided !== 1) {
    throw new Error(`unexpected active coordination result gates=${gateExecutions} leaders=${leaders} followers=${followers} avoided=${avoided} results=${JSON.stringify(results)}`);
  }
  if (results[0].value.verdict_sha256 !== results[1].value.verdict_sha256) {
    throw new Error('coordinated workers did not receive the same sealed qldpc verdict');
  }

  const leader = results.find((r) => r.telemetry.leaderExecutions === 1);
  return {
    workers: 2,
    authoritative_gate_executions: gateExecutions,
    leader_executions: leaders,
    follower_reuses: followers,
    actual_avoided_executions: avoided,
    wall_ms: wallMs,
    authoritative_worker_cpu_ms: leader?.value?.cpu_ms ?? null,
    verdict_sha256: results[0].value.verdict_sha256
  };
}

async function parent() {
  if (!process.env.QLDPC_ROOT) throw new Error('QLDPC_ROOT is required');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('temporary Redis REST credentials are required');
  }

  const actualCommit = execFileSync('git', ['-C', process.env.QLDPC_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actualCommit !== QLDPC_COMMIT) {
    throw new Error(`external commit mismatch: expected ${QLDPC_COMMIT}, got ${actualCommit}`);
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'seenrelay-qldpc-benchmark-'));
  try {
    const baseline = await runColdNativeRace(root);
    const active = await runSeenRelayCoordination(root);

    const executionReductionPct =
      100 * (baseline.authoritative_gate_executions - active.authoritative_gate_executions) /
      baseline.authoritative_gate_executions;
    const measuredCpuOpportunityMs = active.authoritative_worker_cpu_ms === null
      ? null
      : Math.max(0, baseline.total_worker_cpu_ms - active.authoritative_worker_cpu_ms);

    const report = {
      schema_version: 'seenrelay-external-workload-reproduction-v1',
      evidence_class: 'external_workload_reproduction',
      natural_customer_traffic: false,
      external_repository: 'unitaryfoundation/qldpc-challenge',
      external_commit: QLDPC_COMMIT,
      external_issue: 2314,
      operation: 'research.kit.coordination.validate_cached',
      candidate: CANDIDATE,
      fixed_seed_for_reproducibility: Number(SEED),
      documented_native_semantics:
        'qldpc VerdictCache intentionally reuses one completed deep-confirmation verdict for identical candidate content while validator and board state are unchanged',
      baseline_native_cold_race: baseline,
      best_existing_native_warm_path: baseline.native_warm_cache,
      seenrelay_active_coordination: active,
      measured_authoritative_execution_reduction_percent: Number(executionReductionPct.toFixed(2)),
      measured_cpu_opportunity_ms: measuredCpuOpportunityMs === null ? null : Number(measuredCpuOpportunityMs.toFixed(3)),
      actual_avoided_executions: active.actual_avoided_executions,
      actual_net_savings_usd: null,
      verdict:
        active.actual_avoided_executions > 0 ? 'MECHANISM_WIN_ON_COLD_OVERLAP_REPRODUCTION' : 'NO_WIN',
      caveat:
        'This reproduces the external project\'s documented same-candidate confirmation race under a controlled simultaneous cold-cache start. It is not natural customer traffic and does not establish a customer ROI percentage. Once the qldpc native verdict cache is warm, that native path wins and SeenRelay should not replace it.'
    };

    process.stdout.write(JSON.stringify(report) + '\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (workerMode) await coordinatedWorker();
else await parent();
