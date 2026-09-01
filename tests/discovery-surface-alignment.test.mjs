import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('README starts with factual definition and behavior-preserving first proof', () => {
  const t = read('README.md');
  assert.match(t, /SeenRelay is a reuse layer for repeated read-only validation\./);
  assert.match(t, /## First proof: measure without changing application behavior/);
  assert.match(t, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(t, /client\.seenRelayAmbient\.getReport\(\)/);
  assert.match(t, /ambient_mcp_client\(raw_mcp_client\)/);
  assert.match(t, /client\.get_report\(\)/);
  assert.match(t, /npx skills add https:\/\/seenrelay\.com --skill seenrelay --yes/);
  assert.doesNotMatch(t, /\*\*Avoid redundant expensive validation\.\*\*/);
  assert.match(t, /BEGIN GENERATED:PUBLIC-FACTS/);
});

test('llms surface leads with definition and first proof while preserving machine facts', () => {
  const t = read('src/adoption.ts');
  assert.match(t, /SeenRelay is a reuse layer for repeated read-only validation/);
  assert.match(t, /## First proof: measure without changing application behavior/);
  assert.match(t, /ambientMcpClient\(rawMcpClient\)/);
  assert.match(t, /seenRelayAmbient\.getReport\(\)/);
  assert.match(t, /ambient_mcp_client\(raw_mcp_client\)/);
  assert.match(t, /get_report\(\)/);
  assert.match(t, /machinePublicFactsText\(origin\)/);
  assert.doesNotMatch(t, /> Avoid redundant expensive validation/);
  assert.match(t, /Shared CHECK is off by default/);
});
