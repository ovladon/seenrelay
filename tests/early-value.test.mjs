import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('validator-assisted CHECK preserves the trust boundary and conditional revalidation hint', () => {
  const service = read('src/service.ts');
  const evidence = read('src/check-evidence.ts');
  const mcp = read('src/mcp.ts');
  assert.match(evidence, /ORDER BY o2\.observed_at DESC, o2\.received_at DESC/);
  assert.match(evidence, /source_validator_json/);
  assert.match(service, /source_validator_assurance:\s*'observer_supplied_unverified'/);
  assert.match(service, /If-None-Match/);
  assert.match(service, /If-Modified-Since/);
  assert.match(service, /must not contain CR or LF/);
  assert.match(mcp, /must not contain CR or LF/);
  assert.doesNotMatch(service, /source_validator_assurance:\s*'verified'/);
});

test('cold-start loop and same-integration reuse are release-gated without awarding qualified reuse', () => {
  const service = read('src/service.ts');
  const runGate = read('scripts/run-preview-release-gate.sh');
  const earlyGate = read('scripts/preview-early-value-gate.sh');
  assert.match(service, /next_step:\s*'VALIDATE_THEN_OBSERVE'/);
  assert.match(service, /accepted_observation_can_answer_later_checks:\s*true/);
  assert.match(service, /future_check_eligible:\s*true/);
  assert.match(runGate, /preview-early-value-gate\.sh/);
  assert.match(earlyGate, /expected SAME_OBSERVED/);
  assert.match(earlyGate, /same integration must not earn qualified cross-client reuse/);
});

test('OpenAPI release metadata is code-owned and documents observer-supplied validators', () => {
  const openapi = read('src/openapi.ts');
  assert.match(openapi, /SERVICE_RELEASE/);
  assert.match(openapi, /observer-supplied validator metadata/i);
  assert.match(openapi, /\^\[\^\\\\r\\\\n\]\+\$/);
});
