import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NON_NATURAL_BRANCH_PREFIXES,
  naturalFleetEligibility,
  runNaturalFleetWrapper
} from '../scripts/run-fleet-wrapper-natural.mjs';

test('natural fleet evidence is fail-closed before ordinary non-draft pull requests', () => {
  assert.deepEqual(naturalFleetEligibility({ eventName: 'push', branchName: 'main', pullRequestDraft: false }), {
    eligible: false,
    reason: 'non_pull_request_event'
  });
  assert.deepEqual(naturalFleetEligibility({ eventName: 'pull_request', branchName: 'feature/work', pullRequestDraft: null }), {
    eligible: false,
    reason: 'pull_request_metadata_unavailable'
  });
  assert.deepEqual(naturalFleetEligibility({ eventName: 'pull_request', branchName: 'feature/work', pullRequestDraft: true }), {
    eligible: false,
    reason: 'draft_pull_request'
  });
  assert.deepEqual(naturalFleetEligibility({ eventName: 'pull_request', branchName: 'feature/work', pullRequestDraft: false }), {
    eligible: true,
    reason: null
  });
});

test('research and experiment branch families cannot become natural fleet evidence', () => {
  assert.deepEqual(NON_NATURAL_BRANCH_PREFIXES, [
    'research/', 'verify/', 'diagnostic/', 'benchmark/', 'experiment/', 'edge/'
  ]);
  for (const prefix of NON_NATURAL_BRANCH_PREFIXES) {
    assert.deepEqual(naturalFleetEligibility({
      eventName: 'pull_request',
      branchName: `${prefix}candidate`,
      pullRequestDraft: false
    }), {
      eligible: false,
      reason: 'non_natural_branch'
    });
  }
});

test('excluded fleet runs still execute authoritative validation exactly once without collector network work', async () => {
  let validations = 0;
  const result = await runNaturalFleetWrapper({
    eligibility: { eligible: false, reason: 'non_natural_branch' },
    validate: async () => {
      validations += 1;
      return 'pass';
    },
    fetchImpl: async () => assert.fail('excluded wrapper must not invoke collector networking')
  });

  assert.equal(validations, 1);
  assert.equal(result.excluded, true);
  assert.deepEqual(result.eligibility, { eligible: false, reason: 'non_natural_branch' });
});
