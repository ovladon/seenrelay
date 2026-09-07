import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('README starts with the safe free audit and behavior-preserving proof', () => {
  const t = read('README.md');
  const audit = t.indexOf('Find out whether your agent fleet is wasting time or provider spend');
  const architecture = t.indexOf('SeenRelay is a provider-independent reuse layer');
  assert.ok(audit >= 0 && architecture > audit);
  assert.match(t, /## Fastest start: give the audit to your coding agent/);
  assert.match(t, /USE \/ DO NOT USE \/ INSUFFICIENT EVIDENCE/);
  assert.match(t, /preserve every authoritative call/);
  assert.match(t, /## Free shadow audit: measure without changing application behavior/);
  assert.match(t, /```bash\nnpm install seenrelay\n```/);
  assert.match(t, /```bash\npip install seenrelay\n```/);
  assert.match(t, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(t, /client\.seenRelayAmbient\.getReport\(\)/);
  assert.match(t, /ambient_mcp_client\(raw_mcp_client\)/);
  assert.match(t, /client\.get_report\(\)/);
  assert.match(t, /npx skills add https:\/\/seenrelay\.com --skill seenrelay --yes/);
  assert.match(t, /docs\/SHADOW_AUDIT\.md/);
  assert.match(t, /BEGIN GENERATED:PUBLIC-FACTS/);
  assert.doesNotMatch(t, /JavaScript\/TypeScript and Python 0\.2\.\d+ include/);
});

test('llms surface leads with measurement and preserves machine facts', () => {
  const t = read('src/adoption.ts');
  const audit = t.indexOf('determine whether repeated expensive read-only validation is worth reusing before any reuse is enabled');
  const architecture = t.indexOf('SeenRelay is a provider-independent validation reuse layer');
  assert.ok(audit >= 0 && architecture > audit);
  assert.match(t, /## Free shadow audit: measure before enabling reuse/);
  assert.match(t, /USE \/ DO NOT USE \/ INSUFFICIENT EVIDENCE/);
  assert.match(t, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(t, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(t, /seenRelayAmbient\.getReport\(\)/);
  assert.match(t, /ambient_mcp_client\(raw_mcp_client\)/);
  assert.match(t, /get_report\(\)/);
  assert.match(t, /machinePublicFactsText\(origin\)/);
  assert.match(t, /Shared CHECK is off by default/);
  assert.match(t, /provider-native cache when it solves the same semantics/);
  assert.match(t, /Free shadow audit: https:\/\/github\.com\/ovladon\/seenrelay\/blob\/main\/docs\/SHADOW_AUDIT\.md/);
});
