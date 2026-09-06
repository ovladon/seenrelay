import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  fleetEvidenceEligibility,
  runFleetWrapperShadow,
  runTargetSuite
} from './fleet-wrapper-shadow.mjs';

export const NON_NATURAL_BRANCH_PREFIXES = Object.freeze([
  'research/',
  'verify/',
  'diagnostic/',
  'benchmark/',
  'experiment/',
  'edge/'
]);

function readPullRequestDraft(eventPath = process.env.GITHUB_EVENT_PATH || '') {
  if (!eventPath) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    return typeof payload?.pull_request?.draft === 'boolean' ? payload.pull_request.draft : null;
  } catch {
    return null;
  }
}

export function naturalFleetEligibility({
  eventName = process.env.GITHUB_EVENT_NAME || '',
  branchName = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '',
  pullRequestDraft = eventName === 'pull_request' ? readPullRequestDraft() : false
} = {}) {
  const base = fleetEvidenceEligibility({ eventName, branchName });
  if (!base.eligible) return base;

  if (pullRequestDraft === null) {
    return Object.freeze({ eligible: false, reason: 'pull_request_metadata_unavailable' });
  }
  if (pullRequestDraft === true) {
    return Object.freeze({ eligible: false, reason: 'draft_pull_request' });
  }
  if (NON_NATURAL_BRANCH_PREFIXES.some((prefix) => branchName.startsWith(prefix))) {
    return Object.freeze({ eligible: false, reason: 'non_natural_branch' });
  }
  return Object.freeze({ eligible: true, reason: null });
}

export async function runNaturalFleetWrapper(options = {}) {
  const eligibility = options.eligibility || naturalFleetEligibility();
  if (!eligibility.eligible) {
    const value = await (options.validate || runTargetSuite)();
    if (value !== 'pass') throw new Error('fleet wrapper authoritative validation did not return pass');
    process.stdout.write(`${JSON.stringify({
      event: 'fleet_wrapper_shadow_excluded',
      evidence_eligible: false,
      exclusion_reason: eligibility.reason
    })}\n`);
    return Object.freeze({ excluded: true, eligibility });
  }

  return runFleetWrapperShadow({ ...options, eligibility, writeFiles: options.writeFiles ?? true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runNaturalFleetWrapper();
}
