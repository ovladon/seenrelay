import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const fleet = read('src/fleet.ts');
const landing = read('src/landing.ts');
const quickstart = read('src/quickstart.ts');
const adoption = read('src/adoption.ts');
const auditGuide = read('docs/SHADOW_AUDIT.md');
const index = read('src/index.ts');
const skillSource = read('shared/agent-skill.mjs');
const skill = read('skills/seenrelay/SKILL.md');

test('fleet page exposes only current caller-owned fleet capability', () => {
  assert.match(fleet, /Reuse expensive read-only validation across your agent fleet/i);
  assert.match(fleet, /caller-owned/i);
  assert.match(fleet, /AES-256-GCM/);
  assert.match(fleet, /privateMaxAgeMs/);
  assert.match(fleet, /source-native/i);
  assert.match(fleet, /optional shared CHECK/i);
  assert.match(fleet, /not a hosted tenant claim|does not claim[^.]*private tenant store/i);
  assert.match(fleet, /original validation remains the fallback/i);
});

test('homepage makes safe measurement the primary activation path', () => {
  assert.match(landing, /Run the free shadow audit/i);
  assert.match(landing, /wasting time or provider spend on repeated validation/i);
  assert.match(landing, /authoritative calls stay on/i);
  assert.match(landing, /USE · DO NOT USE · INSUFFICIENT EVIDENCE/i);
  assert.match(landing, /Give it to your coding agent/i);
  assert.match(landing, /npx skills add/);
  assert.match(landing, /free today/i);
  assert.match(landing, /no account/i);
  assert.match(landing, /no API key/i);
  assert.match(auditGuide, /every authoritative validation stays enabled/i);
  assert.match(auditGuide, /active SeenRelay reuse stays disabled/i);
});

test('primary public and machine surfaces are fleet-first without universal claims', () => {
  assert.match(landing, /VALIDATION REUSE FOR AGENT FLEETS/i);
  assert.match(landing, /caller-owned private L1/i);
  assert.match(landing, /Keep SeenRelay only if the math wins/i);
  assert.match(quickstart, /FLEET PATH/);
  assert.match(quickstart, /privateStore: fleetStore/);
  assert.match(adoption, /provider-independent validation reuse layer for agent fleets/i);
  assert.match(adoption, /\/fleet/);
  assert.match(index, /app\.get\('\/fleet'/);

  for (const source of [fleet, landing, quickstart, adoption]) {
    assert.doesNotMatch(source, /(?:SeenRelay|we)\s+(?:guarantees?|promises?)\b/i);
    assert.doesNotMatch(source, /(?:offers?|provides?|delivers?|ensures?)\s+(?:a\s+)?universal\s+(?:hit rate|reuse|cache|solution)/i);
    assert.doesNotMatch(source, /(?:offers?|provides?|delivers?|ensures?)\s+guaranteed savings/i);
  }
});

test('Agent Skill stays byte-for-byte canonical and fleet-first', async () => {
  const { agentSkillMarkdown, SEENRELAY_SKILL_DESCRIPTION } = await import('../shared/agent-skill.mjs');
  assert.equal(skill, agentSkillMarkdown());
  assert.match(SEENRELAY_SKILL_DESCRIPTION, /agent fleets/i);
  assert.match(SEENRELAY_SKILL_DESCRIPTION, /private reuse before optional shared evidence/i);
  assert.match(skillSource, /operations: CHECK,OBSERVE/);
});

test('fleet positioning preserves the two-operation hosted boundary', () => {
  assert.match(fleet, /CHECK and OBSERVE remain the only hosted domain operations/i);
  assert.doesNotMatch(fleet, /hosted tenant (?:store|cache|isolation) is (?:available|implemented)/i);
});