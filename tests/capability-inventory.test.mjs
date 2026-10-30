import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateInventory, compareToBaseline } from '../scripts/verify-capability-inventory.mjs';

const inventory = JSON.parse(fs.readFileSync(new URL('../docs/capability-inventory.v1.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

test('implemented capability inventory has unique, real, passing structural sentinels', () => {
  assert.equal(inventory.schema, 'seenrelay-public-capability-inventory-v1');
  assert.ok(inventory.capabilities.length >= 25);
  assert.deepEqual(validateInventory(inventory), []);
});

test('missing public route marker creates a reproducible regression', () => {
  const changed = clone(inventory);
  const cap = changed.capabilities.find((c) => c.id === 'protocol.check');
  cap.checks[0].contains = 'THIS_ROUTE_SHOULD_NOT_EXIST';
  assert.match(validateInventory(changed).join('\n'), /protocol\.check: marker absent/);
});

test('no capability is silently removed or release-critical requirement downgraded', () => {
  const changed = clone(inventory);
  changed.capabilities = changed.capabilities.filter((c) => c.id !== 'protocol.observe');
  assert.match(compareToBaseline(inventory, changed).join('\n'), /silently removed: protocol\.observe/);
  const lowered = clone(inventory);
  lowered.capabilities.find((c) => c.id === 'protocol.check').criticality = 'supported';
  assert.match(compareToBaseline(inventory, lowered).join('\n'), /silently downgraded: protocol\.check/);
});

test('deliberate retirement must retain the ID and an auditable replacement', () => {
  const changed = clone(inventory);
  const cap = changed.capabilities.find((c) => c.id === 'machine.agent_skill');
  cap.status = 'retired';
  delete cap.checks;
  assert.match(validateInventory(changed).join('\n'), /retirement missing replacement\/record/);
});

test('a checked capability cannot lose all structural coverage', () => {
  const changed = clone(inventory);
  changed.capabilities.find((c) => c.id === 'site.human_agent_entry').checks = [];
  assert.match(validateInventory(changed).join('\n'), /lacks structural checks/);
});
