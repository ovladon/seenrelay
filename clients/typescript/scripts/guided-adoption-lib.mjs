import { scanRepository } from './scan-lib.mjs';
import { buildAdoptionPlan } from './adoption-plan-lib.mjs';

export async function buildGuidedAdoption(rootPath) {
  const scan = await scanRepository(rootPath);
  const plan = buildAdoptionPlan(scan);
  const route = plan.machine_next_action ?? { action: 'STOP', instruction: 'Do not install SeenRelay solely to create activity.' };

  return {
    schema_version: 'seenrelay-guided-adoption-v1',
    generated_from: ['seenrelay-static-prescreen-v1', 'seenrelay-adoption-plan-v1'],
    authority: {
      modifies_project: false,
      contacts_seenrelay: false,
      uploads_source: false,
      enables_reuse: false,
      can_return_use_verdict: false,
      project_authority_required_before_code_changes: true
    },
    state: plan.adoption_state,
    decision: plan.decision,
    scan,
    plan,
    next_action: {
      ...route,
      trust: 'https://seenrelay.com/trust.json',
      agent_adoption: 'https://seenrelay.com/agent-adoption.json',
      proof: 'https://seenrelay.com/proof.json'
    },
    stop_conditions: [
      'no eligible candidate',
      'stronger local/source/provider-native control wins',
      'runtime recurrence is not established',
      'operation is mutating/destructive or otherwise unsafe to suppress'
    ],
    disclaimer: 'Guidance is local prescreen/adoption planning only. It does not authorize code changes, active reuse, suppression, or a SeenRelay USE verdict.'
  };
}

export function renderGuidedAdoption(result) {
  const lines = [
    'SeenRelay guided adoption',
    '=========================',
    `State: ${result.state}`,
    `Decision: ${result.decision}`,
    `Static status: ${result.scan.overall_status}`,
    `Candidate files: ${result.scan.candidate_files}`,
    '',
    `Next action: ${result.next_action.action}`,
  ];
  if (result.next_action.route_id) lines.push(`Route: ${result.next_action.route_id}`);
  if (result.next_action.file) lines.push(`Target: ${result.next_action.file}`);
  if (result.next_action.instruction) lines.push(`Instruction: ${result.next_action.instruction}`);
  lines.push('');
  lines.push('Trust: https://seenrelay.com/trust.json');
  lines.push('Agent contract: https://seenrelay.com/agent-adoption.json');
  lines.push('');
  lines.push(result.disclaimer);
  return `${lines.join('\n')}\n`;
}
