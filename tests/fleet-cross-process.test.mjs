import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  SeenRelayFleetCoordinator,
  fleetCodecFromPrivateCodec
} from '../clients/typescript/dist/fleet.js';
import { createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

const workerMode = process.argv.includes('--fleet-worker');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FileFleetStore {
  constructor(root) { this.root = root; }
  base(scopeHash, coordinateKey) {
    return path.join(this.root, `${scopeHash.replace(/[^a-zA-Z0-9_-]/g, '_')}--${coordinateKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  }
  lockDir(scopeHash, coordinateKey) { return this.base(scopeHash, coordinateKey) + '.lock'; }
  resultFile(scopeHash, coordinateKey, generation) { return this.base(scopeHash, coordinateKey) + `.${generation}.result`; }

  async tryClaim({ scopeHash, coordinateKey, ownerId, leaseMs }) {
    const lockDir = this.lockDir(scopeHash, coordinateKey);
    const generation = randomUUID();
    const expiresAtMs = Date.now() + leaseMs;
    try {
      await mkdir(lockDir);
      await writeFile(path.join(lockDir, 'meta.json'), JSON.stringify({ generation, ownerId, expiresAtMs }));
      return { role: 'leader', generation, expiresAtMs };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      for (let i = 0; i < 50; i += 1) {
        try {
          const meta = JSON.parse(await readFile(path.join(lockDir, 'meta.json'), 'utf8'));
          return { role: 'follower', generation: meta.generation, expiresAtMs: meta.expiresAtMs };
        } catch {
          await sleep(2);
        }
      }
      throw new Error('lock metadata unavailable');
    }
  }

  async read({ scopeHash, coordinateKey, generation }) {
    const resultFile = this.resultFile(scopeHash, coordinateKey, generation);
    try {
      return { status: 'completed', sealedResult: await readFile(resultFile, 'utf8') };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const lockDir = this.lockDir(scopeHash, coordinateKey);
    try {
      const meta = JSON.parse(await readFile(path.join(lockDir, 'meta.json'), 'utf8'));
      if (meta.generation !== generation) return { status: 'missing' };
      if (meta.expiresAtMs <= Date.now()) return { status: 'missing' };
      return { status: 'pending', expiresAtMs: meta.expiresAtMs };
    } catch (error) {
      if (error?.code === 'ENOENT') return { status: 'missing' };
      throw error;
    }
  }

  async publish({ scopeHash, coordinateKey, generation, ownerId, sealedResult }) {
    const lockDir = this.lockDir(scopeHash, coordinateKey);
    let meta;
    try { meta = JSON.parse(await readFile(path.join(lockDir, 'meta.json'), 'utf8')); }
    catch { return false; }
    if (meta.generation !== generation || meta.ownerId !== ownerId) return false;
    await writeFile(this.resultFile(scopeHash, coordinateKey, generation), sealedResult);
    await rm(lockDir, { recursive: true, force: true });
    return true;
  }

  async fail({ scopeHash, coordinateKey, generation, ownerId }) {
    const lockDir = this.lockDir(scopeHash, coordinateKey);
    try {
      const meta = JSON.parse(await readFile(path.join(lockDir, 'meta.json'), 'utf8'));
      if (meta.generation !== generation || meta.ownerId !== ownerId) return false;
    } catch { return false; }
    await rm(lockDir, { recursive: true, force: true });
    return true;
  }
}

async function runWorker() {
  const root = process.env.FLEET_TEST_ROOT;
  const keyHex = process.env.FLEET_TEST_KEY_HEX;
  const startFile = path.join(root, 'start');
  while (true) {
    try { await stat(startFile); break; }
    catch { await sleep(2); }
  }

  const store = new FileFleetStore(root);
  const privateCodec = createAesGcmPrivateCodec(Buffer.from(keyHex, 'hex'));
  const coordinator = new SeenRelayFleetCoordinator({
    store,
    codec: fleetCodecFromPrivateCodec(privateCodec),
    scopeKey: 'cross-process-fleet',
    pollMs: 5,
    leaseMs: 5_000,
    maxWaitMs: 5_000
  });

  const value = await coordinator.run({
    coordinate: { provider: 'test', operation: 'expensive', args: { id: 7 } },
    policy: {
      sideEffectClass: 'read_only',
      exactSingleAnswerShareable: true,
      independentSamplesRequired: false
    },
    execute: async () => {
      await appendFile(path.join(root, 'upstream.log'), `${process.pid}\n`);
      await sleep(600);
      return { answer: 42 };
    }
  });

  process.stdout.write(JSON.stringify({ value, telemetry: coordinator.getTelemetry() }));
}

if (workerMode) {
  await runWorker();
} else {
  test('two separate Node processes share one authoritative in-flight execution', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seenrelay-fleet-cross-process-'));
    const keyHex = randomBytes(32).toString('hex');
    const workerPath = new URL(import.meta.url).pathname;

    const launch = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [workerPath, '--fleet-worker'], {
        env: { ...process.env, FLEET_TEST_ROOT: root, FLEET_TEST_KEY_HEX: keyHex },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('exit', (code) => code === 0
        ? resolve(JSON.parse(stdout))
        : reject(new Error(`worker exited ${code}: ${stderr}`)));
    });

    const a = launch();
    const b = launch();
    await sleep(150);
    await writeFile(path.join(root, 'start'), 'go');

    const [ra, rb] = await Promise.all([a, b]);
    const upstreamLines = (await readFile(path.join(root, 'upstream.log'), 'utf8')).trim().split(/\n+/).filter(Boolean);

    assert.deepEqual(ra.value, { answer: 42 });
    assert.deepEqual(rb.value, { answer: 42 });
    assert.equal(upstreamLines.length, 1);
    assert.equal(ra.telemetry.leaderExecutions + rb.telemetry.leaderExecutions, 1);
    assert.equal(ra.telemetry.followerReuses + rb.telemetry.followerReuses, 1);

    await rm(root, { recursive: true, force: true });
  });
}
