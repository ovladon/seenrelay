import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('README starts with outcome-first self-serve flow and preserves behavior-safe proof', () => {
  const t = read('README.md');
  const outcome = t.indexOf('Decide when you actually need to look again');
  const scan = t.indexOf('npx seenrelay scan');
  const architecture = t.indexOf('SeenRelay is a provider-independent reuse layer');
  assert.ok(outcome >= 0 && scan > outcome && architecture > scan);
  assert.match(t, /## What SeenRelay is deciding/);
  assert.match(t, /I already know X/);
  assert.match(t, /Decide when you actually need to look again/);
  assert.match(t, /npx seenrelay scan/);
  assert.match(t, /stronger native control already wins/);
  assert.match(t, /starter-facts\.json/);
  assert.match(t, /## Fastest start: give SeenRelay to your coding agent/);
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

test('llms surface leads with measurement while preserving stable machine-contract markers', () => {
  const t = read('src/adoption.ts');
  const architecture = t.indexOf('SeenRelay is a provider-independent execution-reuse and revalidation layer below individual agent frameworks');
  const proof = t.indexOf('## First proof: measure without changing application behavior');
  assert.ok(architecture >= 0 && proof > architecture);
  assert.match(t, /## First proof: measure without changing application behavior/);
  assert.match(t, /USE \/ DO NOT USE \/ INSUFFICIENT EVIDENCE/);
  assert.match(t, /npx skills add \$\{origin\} --skill seenrelay --yes/);
  assert.match(t, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(t, /seenRelayAmbient\.getReport\(\)/);
  assert.match(t, /ambient_mcp_client\(raw_mcp_client\)/);
  assert.match(t, /get_report\(\)/);
  assert.match(t, /machinePublicFactsText\(origin\)/);
  assert.match(t, /Known-state decision boundary/);
  assert.match(t, /starter-facts\.json/);
  assert.match(t, /execution-reuse and revalidation layer below individual agent frameworks/);
  assert.match(t, /Shared CHECK is off by default/);
  assert.match(t, /provider-native cache when it solves the same semantics/);
  assert.match(t, /Shadow measurement method: https:\/\/github\.com\/ovladon\/seenrelay\/blob\/main\/docs\/SHADOW_AUDIT\.md/);
});
