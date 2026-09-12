import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  REPORT_SCHEMA,
  classifyTool,
  extractHtmlVersion,
  loadState,
  runCensus,
  selectStableRelease,
  selectTag
} from '../scripts/agnix-native-control-census.mjs';

function definition(tool) {
  return { version: 'test', tools: { sample: { tracked: true, ...tool } } };
}

function tempState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seenrelay-agnix-census-'));
  return loadState(path.join(dir, 'missing.json'));
}

test('source classifiers reproduce the upstream release-watch shapes', () => {
  assert.equal(classifyTool({ github_repo: 'owner/repo' }), 'github_repo');
  assert.equal(classifyTool({ html_url: 'https://example.test/releases', version_regex: '[0-9.]+' }), 'html_url');
  assert.equal(classifyTool({ commit_repo: 'owner/repo', commit_path: 'spec.md' }), 'commit_path');
  assert.equal(classifyTool({}), 'unsupported');

  assert.equal(selectStableRelease([
    { tag_name: 'v2-beta', prerelease: true },
    { tag_name: 'v1.2.3', draft: false, prerelease: false }
  ], '^v\\d+\\.\\d+\\.\\d+$')?.tag_name, 'v1.2.3');
  assert.equal(selectTag([{ name: 'other' }, { name: 'v3.0.0' }], '^v'), 'v3.0.0');
  assert.equal(extractHtmlVersion('latest=2.21.0', '[0-9]+\\.[0-9]+\\.[0-9]+'), '2.21.0');
});

test('first complete run commissions native state and does not count natural evidence', async () => {
  const state = tempState();
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, headers: options.headers });
    return new Response(JSON.stringify({ tag_name: 'v1.2.3' }), {
      status: 200,
      headers: { etag: '"abc"', 'content-type': 'application/json' }
    });
  };

  const { report, state: next } = await runCensus({
    definition: definition({ github_repo: 'example/project', last_known_version: 'v1.2.3' }),
    state,
    fetchImpl,
    requestedMode: 'natural'
  });

  assert.equal(report.schema, REPORT_SCHEMA);
  assert.equal(report.requested_mode, 'natural');
  assert.equal(report.effective_mode, 'commissioning');
  assert.equal(report.complete, true);
  assert.equal(report.logical_validations.eligible_natural_calls_this_run, 0);
  assert.equal(report.cumulative_natural.logical_validations, 0);
  assert.equal(report.hosted_operations.check, 0);
  assert.equal(report.hosted_operations.observe, 0);
  assert.equal(next.commissioned, true);
  assert.equal(seen.length, 1);
});

test('later natural run sends ETag and counts a source-native 304', async () => {
  const state = tempState();
  let phase = 0;
  const fetchImpl = async (_url, options) => {
    phase += 1;
    if (phase === 1) {
      return new Response(JSON.stringify({ tag_name: 'v1.2.3' }), {
        status: 200,
        headers: { etag: '"abc"', 'content-type': 'application/json' }
      });
    }
    assert.equal(options.headers['if-none-match'], '"abc"');
    return new Response(null, { status: 304, headers: { etag: '"abc"' } });
  };

  const workload = definition({ github_repo: 'example/project', last_known_version: 'v1.2.3' });
  const first = await runCensus({ definition: workload, state, fetchImpl, requestedMode: 'commissioning' });
  const second = await runCensus({ definition: workload, state: first.state, fetchImpl, requestedMode: 'natural' });

  assert.equal(second.report.effective_mode, 'natural');
  assert.equal(second.report.complete, true);
  assert.equal(second.report.logical_validations.eligible_natural_calls_this_run, 1);
  assert.equal(second.report.native_control.conditional_requests, 1);
  assert.equal(second.report.native_control.not_modified_304, 1);
  assert.equal(second.report.native_control.conditional_304_rate, 1);
  assert.equal(second.report.cumulative_natural.logical_validations, 1);
});

test('public report exports aggregates rather than source identities or values', async () => {
  const state = tempState();
  const sourceIdentity = 'private-looking-owner/private-looking-repo';
  const sourceValue = 'v9.8.7-sensitive-looking';
  const fetchImpl = async () => new Response(JSON.stringify({ tag_name: sourceValue }), {
    status: 200,
    headers: { etag: '"opaque"' }
  });

  const { report, state: next } = await runCensus({
    definition: definition({ github_repo: sourceIdentity, last_known_version: sourceValue }),
    state,
    fetchImpl,
    requestedMode: 'commissioning'
  });

  const exported = JSON.stringify(report);
  assert.doesNotMatch(exported, /private-looking-owner/);
  assert.doesNotMatch(exported, /v9\.8\.7-sensitive-looking/);
  assert.equal(report.benchmark_evidence, false);
  assert.equal(report.audit_verdict, null);
  assert.equal(report.interpretation.shared_check_value_proven, false);

  const persisted = JSON.stringify(next);
  assert.doesNotMatch(persisted, /private-looking-owner/);
  assert.match(persisted, /v9\.8\.7-sensitive-looking/); // minimal parsed state is local/cache-only, never exported
});

test('unsupported tracked sources fail closed instead of shrinking the workload', async () => {
  const { report } = await runCensus({
    definition: definition({ last_known_version: 'x' }),
    state: tempState(),
    fetchImpl: async () => { throw new Error('network must not be reached'); },
    requestedMode: 'commissioning'
  });
  assert.equal(report.complete, false);
  assert.equal(report.logical_validations.attempted, 1);
  assert.equal(report.logical_validations.failed, 1);
  assert.equal(report.logical_validations.eligible_natural_calls_this_run, 0);
  assert.equal(report.interpretation.next_step, 'FIX_FIDELITY_OR_SOURCE_FAILURES_BEFORE_COUNTING_ANY_CALLS');
});

test('census implementation contains no hosted SeenRelay calls', () => {
  const source = fs.readFileSync('scripts/agnix-native-control-census.mjs', 'utf8');
  assert.doesNotMatch(source, /\/v1\/(check|observe)/i);
  assert.doesNotMatch(source, /SeenRelayClient|SeenRelayShadowProof/);
});

test('only the fixed schedule can restore or advance longitudinal native-control state', () => {
  const workflow = fs.readFileSync('.github/workflows/agnix-native-control-census.yml', 'utf8');

  assert.match(workflow, /cron: '25 7 \* \* \*'/);
  assert.match(workflow, /- name: Restore scheduled native-control state\n\s+if: github\.event_name == 'schedule'/);
  assert.match(workflow, /- name: Save scheduled native-control state\n\s+if: success\(\) && github\.event_name == 'schedule'/);
  assert.match(workflow, /seenrelay-agnix-scheduled-v2-main-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /restore-keys: \|\n\s+seenrelay-agnix-scheduled-v2-main-/);
  assert.doesNotMatch(workflow, /seenrelay-agnix-native-main-/);
  assert.doesNotMatch(workflow, /github\.event_name != 'pull_request'/);

  assert.match(workflow, /mode=commissioning\n\s+if \[ "\$\{\{ github\.event_name \}\}" = "schedule" \]; then\n\s+mode=natural/);
  assert.doesNotMatch(workflow, /inputs\.mode/);
  assert.match(workflow, /CENSUS_MODE: \$\{\{ steps\.mode\.outputs\.mode \}\}/);
  assert.match(workflow, /v2 intentionally discards the earlier cache namespace/);
  assert.match(workflow, /Only the fixed daily schedule may restore or advance scheduled state/);
  assert.doesNotMatch(workflow, /SEENRELAY_API_KEY|\/v1\/(check|observe)/i);
});