import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, appendFile, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  SeenRelayFleetCoordinator,
  createRedisRestFleetStore,
  fleetCodecFromPrivateCodec
} from '../clients/typescript/dist/fleet.js';
import { createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

const workerMode = process.argv.includes('--worker');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function worker() {
  const root = process.env.FLEET_REMOTE_TEST_ROOT;
  const startFile = path.join(root, 'start');
  while (true) {
    try { await stat(startFile); break; }
    catch { await sleep(5); }
  }

  const store = createRedisRestFleetStore({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    prefix: process.env.FLEET_REMOTE_PREFIX,
    resultTtlMs: 30_000,
    completionGraceMs: 300,
    failureGraceMs: 200
  });
  const codec = fleetCodecFromPrivateCodec(
    createAesGcmPrivateCodec(Buffer.from(process.env.FLEET_REMOTE_KEY_HEX, 'hex'))
  );
  const coordinator = new SeenRelayFleetCoordinator({
    store,
    codec,
    scopeKey: 'remote-fleet-scope',
    pollMs: 20,
    leaseMs: 10_000,
    maxWaitMs: 10_000
  });

  const value = await coordinator.run({
    coordinate: {
      provider: 'remote-test',
      operation: 'expensive-read',
      model: 'none',
      input: { id: 20260928 }
    },
    policy: {
      sideEffectClass: 'read_only',
      exactSingleAnswerShareable: true,
      independentSamplesRequired: false
    },
    execute: async () => {
      await appendFile(path.join(root, 'upstream.log'), `${process.pid}\n`);
      await sleep(900);
      return { authoritative: true, value: 42 };
    }
  });

  process.stdout.write(JSON.stringify({ value, telemetry: coordinator.getTelemetry() }));
}

async function parent() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL/TOKEN required');

  const root = await mkdtemp(path.join(os.tmpdir(), 'seenrelay-remote-fleet-'));
  const keyHex = randomBytes(32).toString('hex');
  const prefix = `seenrelay:test:${randomUUID()}`;
  const script = new URL(import.meta.url).pathname;

  function launch() {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, '--worker'], {
        env: {
          ...process.env,
          FLEET_REMOTE_TEST_ROOT: root,
          FLEET_REMOTE_KEY_HEX: keyHex,
          FLEET_REMOTE_PREFIX: prefix
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
        else resolve(JSON.parse(stdout));
      });
    });
  }

  const a = launch();
  const b = launch();
  await sleep(250);
  await writeFile(path.join(root, 'start'), 'go');

  const [ra, rb] = await Promise.all([a, b]);
  const lines = (await readFile(path.join(root, 'upstream.log'), 'utf8')).trim().split(/\n+/).filter(Boolean);

  if (lines.length !== 1) throw new Error(`expected one upstream execution, got ${lines.length}`);
  if (ra.value?.value !== 42 || rb.value?.value !== 42) throw new Error('workers did not receive the same authoritative result');
  const leaders = ra.telemetry.leaderExecutions + rb.telemetry.leaderExecutions;
  const followers = ra.telemetry.followerReuses + rb.telemetry.followerReuses;
  if (leaders !== 1 || followers !== 1) throw new Error(`unexpected roles leaders=${leaders} followers=${followers}`);

  await rm(root, { recursive: true, force: true });
  process.stdout.write(JSON.stringify({
    schema: 'seenrelay-fleet-remote-store-proof-v0',
    workers: 2,
    upstream_executions: 1,
    leader_executions: leaders,
    follower_reuses: followers,
    remote_store: 'redis-rest',
    result: 'PASS'
  }) + '\n');
}

if (workerMode) await worker();
else await parent();
