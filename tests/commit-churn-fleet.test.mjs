import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  SeenRelayFleetCoordinator,
  InMemoryFleetCoordinationStore,
  fleetCodecFromPrivateCodec
} from '../clients/typescript/dist/fleet.js';
import { createAesGcmPrivateCodec } from '../clients/typescript/dist/zero-state.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = source => createHash('sha256').update(source).digest('hex');
const policy = {
  sideEffectClass: 'read_only',
  exactSingleAnswerShareable: true,
  independentSamplesRequired: false
};
const git = (dir, ...args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
}).trim();

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'seenrelay-commit-review-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'SeenRelay CI Fixture');
  git(dir, 'config', 'user.email', 'ci-fixture@example.invalid');
  return dir;
}
function commit(dir, n) {
  writeFileSync(join(dir, 'target.mjs'), 'export const calculate = (x) => x * ' + n + ';\n');
  git(dir, 'add', 'target.mjs');
  git(dir, 'commit', '-qm', 'Fixture change ' + n);
  return git(dir, 'rev-parse', 'HEAD');
}
function coordinate(revision) {
  return {
    repository: 'isolated-local-fixture',
    gitCommit: revision,
    operation: 'node-syntax-check',
    command: 'node --check target.mjs',
    runtimeVersion: process.version,
    relevantEnvironment: 'same-CI-runner'
  };
}
function makeCheck(dir, revision, counters) {
  return async () => {
    counters.calls += 1;
    await sleep(35); // Bounded synthetic work duration; no LLM or paid API.
    const source = git(dir, 'show', revision + ':target.mjs');
    const path = join(dir, 'immutable-check-' + revision.slice(0, 12) + '.mjs');
    writeFileSync(path, source + '\n');
    execFileSync(process.execPath, ['--check', path], { cwd: dir, stdio: 'pipe' });
    return { revision, contentDigest: digest(source) };
  };
}
function coordinators(count) {
  const store = new InMemoryFleetCoordinationStore();
  const sealedCodec = fleetCodecFromPrivateCodec(createAesGcmPrivateCodec(randomBytes(32)));
  return Array.from({ length: count }, () => new SeenRelayFleetCoordinator({
    store, codec: sealedCodec, scopeKey: 'same-private-ci-fixture', pollMs: 2
  }));
}
function nativeSingleFlight() {
  const pending = new Map();
  return (key, perform) => {
    if (!pending.has(key)) {
      const promise = Promise.resolve().then(perform);
      pending.set(key, promise);
      promise.finally(() => { if (pending.get(key) === promise) pending.delete(key); });
    }
    return pending.get(key);
  };
}

test('real git fix invalidates exact shareability; SeenRelay equals same-process native single-flight in saved executions', async () => {
  const dir = makeRepo();
  try {
    const revisionA = commit(dir, 2);
    const revisionB = commit(dir, 3);
    assert.notEqual(revisionA, revisionB);
    const workers = coordinators(4);
    const native = nativeSingleFlight();
    const baseline = { calls: 0 };
    const bestNative = { calls: 0 };
    const relay = { calls: 0 };
    let snapshotA = null;
    for (const [i, rev] of [revisionA, revisionB].entries()) {
      const plain = await Promise.all(workers.map(() => makeCheck(dir, rev, baseline)()));
      const locallyCoordinated = await Promise.all(workers.map(() =>
        native(rev, makeCheck(dir, rev, bestNative))));
      const fleet = await Promise.all(workers.map(c =>
        c.run({ coordinate: coordinate(rev), policy, execute: makeCheck(dir, rev, relay) })));
      for (const result of [...plain, ...locallyCoordinated, ...fleet]) {
        assert.equal(result.revision, rev);
        assert.equal(result.contentDigest, plain[0].contentDigest);
      }
      if (i === 0) snapshotA = plain[0].contentDigest;
      else assert.notEqual(plain[0].contentDigest, snapshotA,
        'a changed commit cannot inherit the prior source result');
    }
    const reuse = workers.reduce((n, c) => n + c.getTelemetry().followerReuses, 0);
    assert.deepEqual([baseline.calls, bestNative.calls, relay.calls, reuse], [8, 2, 2, 6]);
    console.log('CODE_REVIEW_CHANGE_TEST ' + JSON.stringify({
      scope: 'controlled_git_fixture_not_real_llm_agents',
      two_commits: true, agents_per_commit: 4,
      baseline_authoritative_checks: baseline.calls,
      best_native_single_flight_checks: bestNative.calls,
      seenrelay_fleet_checks: relay.calls,
      seenrelay_inflight_follower_reuses: reuse,
      changed_commit_forced_fresh_execution: true,
      incremental_savings_over_same_process_native: 0
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('high commit churn and independent review requirements eliminate eligible fleet reuse', async () => {
  const dir = makeRepo();
  try {
    const revisions = Array.from({ length: 5 }, (_, i) => commit(dir, i + 10));
    const workers = coordinators(5);
    const churn = { calls: 0 };
    const results = await Promise.all(workers.map((c, i) => c.run({
      coordinate: coordinate(revisions[i]),
      policy,
      execute: makeCheck(dir, revisions[i], churn)
    })));
    assert.equal(churn.calls, 5);
    assert.equal(new Set(results.map(x => x.contentDigest)).size, 5);
    assert.equal(workers.reduce((n, c) => n + c.getTelemetry().followerReuses, 0), 0);
    const independent = { calls: 0 };
    const independentResults = await Promise.all(workers.map(c => c.run({
      coordinate: coordinate(revisions[4]),
      policy: { ...policy, independentSamplesRequired: true },
      execute: makeCheck(dir, revisions[4], independent)
    })));
    assert.equal(independent.calls, 5);
    assert.equal(independentResults.length, 5);
    console.log('CODE_REVIEW_CHURN_TEST ' + JSON.stringify({
      scope: 'controlled_git_fixture_not_real_llm_agents',
      distinct_commits: 5,
      independent_reviews_per_commit: 5,
      distinct_commit_checks_executed: churn.calls,
      distinct_commit_reuses: 0,
      independent_review_checks_executed: independent.calls,
      incremental_savings_vs_no_coordination: 0,
      dollar_net_savings: null
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
