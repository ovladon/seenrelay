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

test('fleet page exposes shadow-first distributed measurement before active coordination', () => {
  assert.match(fleet, /Measure duplicate expensive work before you suppress a single call/i);
  assert.match(fleet, /SeenRelayFleetShadowMeter/);
  assert.match(fleet, /callsWithIdenticalInflightPredecessor/);
  assert.match(fleet, /overlappedFollowerObservedCostUsd/);
  assert.match(fleet, /not a savings claim/i);
  assert.match(fleet, /every authoritative operation still runs/i);
  assert.match(fleet, /SeenRelayFleetCoordinator/);
  assert.match(fleet, /createRedisRestFleetStore/);
  assert.match(fleet, /createFleetSavingsLedger/);
  assert.match(fleet, /avoidedExecutions.*only on actual follower reuse/i);
  assert.match(fleet, /In-flight coordination is not temporal caching/i);
  assert.match(fleet, /privateMaxAgeMs/);
  assert.match(fleet, /zero-cost exact response cache/i);
  assert.match(fleet, /fail open/i);
  assert.match(fleet, /CHECK and OBSERVE remain the only hosted SeenRelay domain operations/i);
});

test('homepage makes self-serve local adoption primary without duplicating agent docs', () => {
  assert.match(landing, /Stop paying twice for the same read-only work/i);
  assert.match(landing, /Start locally/i);
  assert.match(landing, /Shadow measurement keeps the original authoritative call/i);
  assert.match(landing, /USE \/ DO NOT USE \/ INSUFFICIENT EVIDENCE/i);
  assert.match(landing, /no API key/i);
  assert.doesNotMatch(landing, /npx skills add|OPTIONAL PROTOCOL DEMO|live-check-form/i);
  assert.match(auditGuide, /every authoritative validation stays enabled/i);
  assert.match(auditGuide, /active SeenRelay reuse stays disabled/i);
});

test('primary public surfaces describe fleet value without universal savings claims', () => {
  assert.match(landing, /Optimize execution, not just tokens/i);
  assert.match(landing, /Controlled proof is not customer savings/i);
  assert.match(quickstart, /FLEET PATH/);
  assert.match(quickstart, /seenrelay\/fleet/);
  assert.match(quickstart, /SeenRelayFleetShadowMeter/);
  assert.match(quickstart, /NO SUPPRESSION/);
  assert.match(quickstart, /SeenRelayFleetCoordinator/);
  assert.match(quickstart, /createFleetSavingsLedger/);
  assert.match(quickstart, /Only actual follower reuse counts as an avoided execution/i);
  assert.match(adoption, /provider-independent execution-reuse and revalidation layer below individual agent frameworks/i);
  assert.match(adoption, /\/fleet/);
  assert.match(index, /app\.get\('\/fleet'/);
  for (const source of [fleet, landing, quickstart, adoption]) {
    assert.doesNotMatch(source, /(?:SeenRelay|we)\s+(?:guarantees?|promises?)\b/i);
    assert.doesNotMatch(source, /guaranteed savings/i);
  }
});

test('technical fleet surfaces expose local trace census without forcing trace detail onto the homepage', () => {
  for (const source of [fleet, quickstart]) {
    assert.match(source, /trace-census/);
  }
  assert.doesNotMatch(landing, /trace-census/);
  assert.match(fleet, /HAVE FLEET TRACES\? · LOCAL-ONLY CENSUS/);
  assert.match(fleet, /does not contact SeenRelay/i);
  assert.match(fleet, /successful_leader_overlap_opportunities/);
  assert.match(fleet, /gross_potential_avoided_cost_usd/);
  assert.match(fleet, /Actual avoided executions remain unknown at this stage/i);
  assert.match(fleet, /Net savings additionally require measured coordination\/store overhead/i);
  assert.match(quickstart, /EXISTING FLEET TRACES · LOCAL-ONLY/);
  assert.match(quickstart, /actual_avoided_executions/);
  assert.match(quickstart, /actual_net_savings_usd/);
  for (const source of [fleet, quickstart]) {
    assert.doesNotMatch(source, /trace-census[^\n]{0,240}(?:proves?|guarantees?)\s+(?:savings|ROI)/i);
  }
});

test('Agent Skill stays byte-for-byte canonical and fleet-first', async () => {
  const { agentSkillMarkdown, SEENRELAY_SKILL_DESCRIPTION } = await import('../shared/agent-skill.mjs');
  assert.equal(skill, agentSkillMarkdown());
  assert.match(SEENRELAY_SKILL_DESCRIPTION, /agent fleets/i);
  assert.match(SEENRELAY_SKILL_DESCRIPTION, /private reuse before optional shared evidence/i);
  assert.match(skill, /SeenRelayFleetShadowMeter/);
  assert.match(skill, /observed overlap cost is incurred measurement rather than avoided savings/i);
  assert.match(skillSource, /operations: CHECK,OBSERVE/);
});

test('fleet positioning preserves the two-operation hosted boundary', () => {
  assert.match(fleet, /CHECK and OBSERVE remain the only hosted SeenRelay domain operations/i);
  assert.match(fleet, /caller-owned/i);
  assert.doesNotMatch(fleet, /hosted tenant (?:store|cache|isolation) is (?:available|implemented)/i);
});
