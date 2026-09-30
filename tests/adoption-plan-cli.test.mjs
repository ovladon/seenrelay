import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdoptionPlan } from '../clients/typescript/scripts/adoption-plan-lib.mjs';

function report(overall_status, candidates=[]) {
  return {
    schema_version: 'seenrelay-static-prescreen-v1',
    files_scanned: 12,
    candidate_files: candidates.length,
    overall_status,
    candidates
  };
}

function candidate(status, extra={}) {
  return {
    file: 'src/worker.ts',
    status,
    provider_signals: [{id:'tavily',label:'Tavily'}],
    stronger_controls_detected: [],
    supported_integration_signals: [],
    next_step: 'measure it',
    ...extra
  };
}

test('no candidate produces a machine-readable stop decision', () => {
  const plan=buildAdoptionPlan(report('NO_ELIGIBLE_CANDIDATE_FOUND'));
  assert.equal(plan.schema_version,'seenrelay-adoption-plan-v1');
  assert.equal(plan.decision,'DO_NOT_INSTALL');
  assert.equal(plan.machine_next_action.action,'STOP');
  assert.equal(plan.authority.modifies_project,false);
  assert.equal(plan.authority.enables_reuse,false);
  assert.equal(plan.authority.can_return_use_verdict,false);
});

test('static candidate recommends shadow measurement only', () => {
  const plan=buildAdoptionPlan(report('CANDIDATE_FOR_SHADOW_MEASUREMENT',[
    candidate('CANDIDATE_FOR_SHADOW_MEASUREMENT',{
      supported_integration_signals:['MCP client']
    })
  ]));
  assert.equal(plan.decision,'INSTRUMENT_SHADOW_ONLY');
  assert.equal(plan.preferred_route.id,'mcp_ambient');
  assert.equal(plan.preferred_route.mode,'SHADOW');
  assert.equal(plan.machine_next_action.action,'INSTRUMENT_SHADOW_ONLY');
});

test('native control status never recommends SeenRelay protection', () => {
  const plan=buildAdoptionPlan(report('NATIVE_CONTROL_FIRST',[
    candidate('NATIVE_CONTROL_FIRST',{
      provider_signals:[{id:'firecrawl',label:'Firecrawl'}],
      stronger_controls_detected:[{id:'firecrawl_provider_cache',label:'Firecrawl cache'}]
    })
  ]));
  assert.equal(plan.decision,'MEASURE_NATIVE_FIRST');
  assert.equal(plan.install_policy,'DEFER_SEENRELAY_PROTECTION');
  assert.equal(plan.authority.enables_reuse,false);
});

test('runtime evidence status remains pre-activation', () => {
  const plan=buildAdoptionPlan(report('NEEDS_RUNTIME_EVIDENCE',[
    candidate('NEEDS_RUNTIME_EVIDENCE')
  ]));
  assert.equal(plan.decision,'COLLECT_RUNTIME_EVIDENCE');
  assert.equal(plan.install_policy,'DO_NOT_ENABLE_PROTECTION');
});

test('integration route is only a shadow instrumentation hint', () => {
  const plan=buildAdoptionPlan(report('CANDIDATE_FOR_SHADOW_MEASUREMENT',[
    candidate('CANDIDATE_FOR_SHADOW_MEASUREMENT',{
      supported_integration_signals:['Vercel AI SDK']
    })
  ]));
  assert.equal(plan.preferred_route.id,'vercel_ai_sdk_ambient');
  assert.match(plan.preferred_route.hint,/Ambient adapter/i);
  assert.equal(plan.authority.human_or_project_authority_required_before_code_changes,true);
});
