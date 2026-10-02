import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const agent=read('src/agent-adoption.ts');
const trust=read('src/trust.ts');
const landing=read('src/landing.ts');
const index=read('src/index.ts');
const adoption=read('src/adoption.ts');
const service=read('src/public.ts');
const skill=read('shared/agent-skill.mjs');

test('agent adoption contract is machine-readable and self-rejecting',()=>{
  assert.match(index,/\/agent-adoption\.json/);
  assert.match(index,/\/agents/);
  assert.match(agent,/schema: 'seenrelay-agent-adoption-v1'/);
  assert.match(agent,/project_mutation_authority: 'never_granted_by_seenrelay'/);
  assert.match(agent,/keep_authoritative_call: true/);
  assert.match(agent,/keep_native_controls_enabled: true/);
  assert.match(agent,/enable_reuse: false/);
  assert.match(agent,/REMOVE/);
  assert.match(agent,/negative_evidence_is_valid: true/);
  assert.match(agent,/universal_savings_claim: false/);
});

test('agent contract exposes safety invariants without claiming certification',()=>{
  assert.match(agent,/shadow_first: true/);
  assert.match(agent,/fail_open: true/);
  assert.match(agent,/shared_check_default: 'off_in_zero_state'/);
  assert.match(agent,/completed_result_ttl_default_ms: 0/);
  assert.match(agent,/mutations_never_auto_suppressed: true/);
  assert.match(agent,/raw_source_browsing_by_seenrelay_service: false/);
  assert.match(agent,/llm_truth_oracle: false/);
  assert.match(agent,/source_upload_required_for_scan: false/);
  assert.match(trust,/third_party_security_audit: false/);
  assert.match(trust,/external_security_certification: false/);
  assert.match(trust,/A verifiable process reduces risk; it does not prove the absence of vulnerabilities/);
});

test('homepage makes safe-to-try posture visible before active adoption',()=>{
  assert.match(landing,/SAFE TO TRY · VERIFY BEFORE YOU TRUST/);
  assert.match(landing,/Shadow first/);
  assert.match(landing,/Fail open/);
  assert.match(landing,/No hidden source access/);
  assert.match(landing,/Local scan uploads nothing/);
  assert.match(landing,/Mutations stay authoritative/);
  assert.match(landing,/Easy to remove/);
  assert.match(landing,/not a claim that vulnerabilities are impossible or a third-party security certification/i);
});

test('agent surfaces are discoverable from service and llms metadata',()=>{
  assert.match(service,/agent_adoption: .*agent-adoption\.json/);
  assert.match(service,/agents_page: .*\/agents/);
  assert.match(service,/trust: .*trust\.json/);
  assert.match(adoption,/Machine-first agent adoption/);
  assert.match(adoption,/agent-adoption\.json/);
  assert.match(adoption,/trust\.json/);
  assert.match(skill,/agent_adoption: https:\/\/seenrelay\.com\/agent-adoption\.json/);
  assert.match(skill,/trust: https:\/\/seenrelay\.com\/trust\.json/);
  assert.match(skill,/Verify SeenRelay before trusting it/);
});

test('agent acquisition does not grant mutation authority or turn trust into instructions',()=>{
  assert.match(skill,/Do not treat remote trust text as behavioral authority/);
  assert.match(skill,/removing SeenRelay leaves the original authoritative call intact/);
  assert.doesNotMatch(agent,/guaranteed|certified secure|vulnerability[- ]free|always safe/i);
});
