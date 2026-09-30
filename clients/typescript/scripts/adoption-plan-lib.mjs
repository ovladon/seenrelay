const ROUTES = [
  { test: /MCP client/i, id: 'mcp_ambient', mode: 'SHADOW', docs: '/clients#instrument', hint: 'Wrap the existing MCP client with the SeenRelay Ambient adapter and keep every authoritative call enabled.' },
  { test: /OpenAI Agents/i, id: 'openai_agents_ambient', mode: 'SHADOW', docs: '/clients#instrument', hint: 'Wrap the framework-owned MCP surface with the SeenRelay Ambient adapter; do not enable reuse from the static plan.' },
  { test: /Vercel AI SDK/i, id: 'vercel_ai_sdk_ambient', mode: 'SHADOW', docs: '/clients#instrument', hint: 'Wrap the AI SDK MCP tools with the SeenRelay Ambient adapter and collect runtime evidence.' },
  { test: /LangChain/i, id: 'langchain_ambient', mode: 'SHADOW', docs: '/clients#instrument', hint: 'Use the LangChain Ambient hooks/client wrapper and preserve the original tool path.' },
  { test: /PydanticAI/i, id: 'pydantic_ai_ambient', mode: 'SHADOW', docs: '/clients#instrument', hint: 'Use the PydanticAI Ambient toolset wrapper and preserve the original tool path.' }
];

function unique(values) {
  return [...new Set(values)];
}

function routeForCandidate(candidate) {
  for (const label of candidate.supported_integration_signals ?? []) {
    const route = ROUTES.find((item) => item.test.test(label));
    if (route) return route;
  }
  return {
    id: 'generic_execution_boundary',
    mode: 'SHADOW',
    docs: '/clients#instrument',
    hint: 'Instrument the narrowest reviewed read-only execution boundary in shadow mode. Exact identity and freshness remain caller-owned.'
  };
}

function actionForStatus(status) {
  if (status === 'CANDIDATE_FOR_SHADOW_MEASUREMENT') {
    return {
      adoption_state: 'PRESCREEN',
      decision: 'INSTRUMENT_SHADOW_ONLY',
      install_policy: 'ALLOWED_FOR_MEASUREMENT_ONLY',
      runtime_goal: 'Collect natural recurrence, cost, native-control and agreement evidence while every authoritative call still runs.'
    };
  }
  if (status === 'NATIVE_CONTROL_FIRST') {
    return {
      adoption_state: 'PRESCREEN',
      decision: 'MEASURE_NATIVE_FIRST',
      install_policy: 'DEFER_SEENRELAY_PROTECTION',
      runtime_goal: 'Measure the detected source/provider/local control first; proceed only if material residual repeated work remains.'
    };
  }
  if (status === 'NEEDS_RUNTIME_EVIDENCE') {
    return {
      adoption_state: 'PRESCREEN',
      decision: 'COLLECT_RUNTIME_EVIDENCE',
      install_policy: 'DO_NOT_ENABLE_PROTECTION',
      runtime_goal: 'Confirm natural recurrence before adding a reuse layer.'
    };
  }
  return {
    adoption_state: 'REMOVE',
    decision: 'DO_NOT_INSTALL',
    install_policy: 'NO_SEENRELAY_CHANGE',
    runtime_goal: 'Leave SeenRelay out unless future workload evidence changes the fit.'
  };
}

export function buildAdoptionPlan(scanReport) {
  if (!scanReport || scanReport.schema_version !== 'seenrelay-static-prescreen-v1') {
    throw new TypeError('buildAdoptionPlan requires a seenrelay-static-prescreen-v1 report');
  }

  const base = actionForStatus(scanReport.overall_status);
  const candidates = (scanReport.candidates ?? []).map((candidate) => {
    const route = routeForCandidate(candidate);
    return {
      file: candidate.file,
      status: candidate.status,
      provider_ids: unique((candidate.provider_signals ?? []).map((item) => item.id)),
      stronger_control_ids: unique((candidate.stronger_controls_detected ?? []).map((item) => item.id)),
      integration_signals: unique(candidate.supported_integration_signals ?? []),
      route,
      next_step: candidate.next_step
    };
  });

  const preferred = candidates.find((item) => item.status === 'CANDIDATE_FOR_SHADOW_MEASUREMENT')
    ?? candidates.find((item) => item.status === 'NATIVE_CONTROL_FIRST')
    ?? candidates.find((item) => item.status === 'NEEDS_RUNTIME_EVIDENCE')
    ?? null;

  return {
    schema_version: 'seenrelay-adoption-plan-v1',
    source_schema_version: scanReport.schema_version,
    authority: {
      modifies_project: false,
      contacts_seenrelay: false,
      enables_reuse: false,
      can_return_use_verdict: false,
      human_or_project_authority_required_before_code_changes: true
    },
    ...base,
    project: {
      files_scanned: scanReport.files_scanned,
      candidate_files: scanReport.candidate_files,
      static_status: scanReport.overall_status
    },
    preferred_route: preferred?.route ?? null,
    candidates,
    machine_next_action: preferred
      ? {
          action: base.decision,
          file: preferred.file,
          route_id: preferred.route.id,
          docs: preferred.route.docs,
          instruction: preferred.status === 'CANDIDATE_FOR_SHADOW_MEASUREMENT'
            ? preferred.route.hint
            : preferred.next_step
        }
      : {
          action: 'STOP',
          instruction: 'Do not install SeenRelay solely to create activity.'
        },
    disclaimer: 'This is a non-mutating adoption plan derived from static evidence. It cannot authorize reuse, suppression, or a SeenRelay USE verdict.'
  };
}

export function renderAdoptionPlan(plan) {
  const lines = [
    'SeenRelay adoption plan',
    '=======================',
    `Decision: ${plan.decision}`,
    `Static status: ${plan.project.static_status}`,
    `Project changes: ${plan.authority.modifies_project ? 'yes' : 'no'}`,
    `Contacts SeenRelay: ${plan.authority.contacts_seenrelay ? 'yes' : 'no'}`,
    ''
  ];
  if (plan.machine_next_action?.file) {
    lines.push(`Target: ${plan.machine_next_action.file}`);
    lines.push(`Route: ${plan.machine_next_action.route_id}`);
    lines.push(`Next: ${plan.machine_next_action.instruction}`);
  } else {
    lines.push(`Next: ${plan.machine_next_action.instruction}`);
  }
  lines.push('');
  lines.push(plan.disclaimer);
  return `${lines.join('\n')}\n`;
}
