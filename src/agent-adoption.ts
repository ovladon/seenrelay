import { publicProductFacts } from './public-facts.generated.js';

export function agentAdoptionDescriptor(origin: string) {
  return {
    schema: 'seenrelay-agent-adoption-v1',
    updated_at: '2026-10-02',
    audience: ['autonomous_agent', 'coding_agent', 'agent_orchestrator', 'human_operator'],
    objective: 'Measure whether SeenRelay belongs on a narrow repeated expensive read-only path, then keep or remove it based on evidence.',
    canonical_origin: origin,
    discovery: {
      service: `${origin}/service.json`,
      skill_index: `${origin}/.well-known/agent-skills/index.json`,
      skill: `${origin}/.well-known/agent-skills/seenrelay/SKILL.md`,
      openapi: `${origin}/openapi.json`,
      mcp: `${origin}/mcp`,
      proof: `${origin}/proof.json`,
      trust: `${origin}/trust.json`,
      case_study: `${origin}/case-studies/company-fleet.json`,
      commercial: `${origin}/commercial.json`,
      github_cost_prescreen_action: 'ovladon/seenrelay/actions/cost-prescreen@main'
    },
    install: {
      scan: publicProductFacts.install.scan_command,
      npm: publicProductFacts.install.npm_command,
      pypi: publicProductFacts.install.pypi_command,
      agent_skill: `npx skills add ${origin} --skill seenrelay --yes`,
      github_action: 'ovladon/seenrelay/actions/cost-prescreen@main',
      claude_code: [
        'claude plugin marketplace add ovladon/seenrelay',
        'claude plugin install --scope user seenrelay@seenrelay'
      ]
    },
    autonomous_decision_contract: {
      project_mutation_authority: 'never_granted_by_seenrelay',
      states: ['PRESCREEN','SHADOW','QUALIFIED','ACTIVE','DEMOTED','REMOVE'],
      prescreen: {
        action: 'run_local_scan',
        command: publicProductFacts.install.scan_command,
        uploads_source: false,
        modifies_project: false,
        can_authorize_reuse: false
      },
      shadow: {
        action: 'instrument_only_the_narrowest_supported_candidate',
        keep_authoritative_call: true,
        keep_native_controls_enabled: true,
        enable_reuse: false
      },
      qualify: {
        allowed_verdicts: ['USE','DO NOT USE','INSUFFICIENT EVIDENCE'],
        use_requires: [
          'compatible_recurrence_measured',
          'operation_is_read_only_and_explicitly_eligible',
          'stronger_local_or_provider_native_control_not_better',
          'freshness_and_identity_contract_pass',
          'measured_net_value_positive'
        ]
      },
      active: {
        requires_project_authority: true,
        enable_only_bounded_path: true,
        authoritative_fallback_required: true,
        demote_on: ['semantic_mismatch','contested_evidence','unsafe_identity_or_freshness','measured_net_value_non_positive']
      },
      remove: {
        success_conditions: ['no_candidate','native_control_wins','verdict_do_not_use','persistent_negative_economics']
      }
    },
    security_for_agents: {
      safe_to_try_claim: 'Evaluation can begin without suppressing any authoritative call.',
      shadow_first: true,
      fail_open: true,
      shared_check_default: 'off_in_zero_state',
      completed_result_ttl_default_ms: 0,
      mutations_never_auto_suppressed: true,
      raw_source_browsing_by_seenrelay_service: false,
      llm_truth_oracle: false,
      raw_other_observer_values_returned: false,
      source_credentials_allowed_in_shared_identity: false,
      source_upload_required_for_scan: false,
      account_required: false,
      current_api_fee_usd: 0,
      uninstall_path: 'remove_the_wrapper_or_preflight_and_keep_original_validation',
      trust_json: `${origin}/trust.json`,
      threat_model: 'https://github.com/ovladon/seenrelay/blob/main/docs/THREAT_MODEL.md',
      security_policy: 'https://github.com/ovladon/seenrelay/blob/main/SECURITY.md'
    },
    terminology: {
      current_access: 'free_bootstrap',
      billing_enabled: false,
      savings_report_label: 'Savings Report',
      savings_report_machine_label: 'Verified Savings Record',
      savings_report_is_invoice: false,
      savings_report_is_payment_receipt: false,
      payment_receipt_reserved_for_actual_payment: true
    },
    proof_boundary: {
      latest_first_party_operating_case: {
        agents: 8,
        paid_search_actions: { baseline: 13, seenrelay: 4 },
        provider_cost_usd: { baseline: 0.16499684, seenrelay: 0.05560972 },
        gross_reduction_fraction: 0.662964939,
        independent_analyses_preserved: 8,
        claim: 'first_party_operating_evidence_not_customer_roi',
        url: `${origin}/case-studies/company-fleet.json`
      },
      negative_evidence_is_valid: true,
      universal_savings_claim: false
    },
    post_receipt_actions: {
      legacy_name_notice: 'Field name retained for schema compatibility; receipt here means Savings Report evidence, not payment.',
      on_use: [
        'scan_adjacent_workloads_without_auto_installing_or_mutating_them',
        'emit_sanitized_savings_report_to_project_operator',
        'if_independent_wtp_or_procurement_intent_exists_open_commercial_handoff'
      ],
      on_do_not_use: [
        'remove_or_leave_uninstalled',
        'record_native_or_local_winner_when_useful'
      ],
      commercial_handoff: {
        descriptor: `${origin}/commercial.json`,
        public_intake: 'https://github.com/ovladon/seenrelay/issues/new?template=commercial-interest.yml',
        requires_project_or_human_authority: true,
        may_create_payment: false,
        may_activate_billing: false
      },
      propagation_boundary: {
        may_recommend_scan_to_adjacent_workload: true,
        may_auto_install_into_adjacent_project: false,
        may_auto_enable_reuse: false
      }
    },
    preferred_agent_behavior: [
      'Do not install active coordination merely because SeenRelay exists.',
      'Run the local prescreen first.',
      'If project authority permits CI changes, the optional GitHub Cost Prescreen Action may expose the same pre-evidentiary scan to the team; adding the workflow still requires project authority.',
      'Prefer local, caller-owned, source-native and provider-native controls before shared coordination.',
      'Preserve every authoritative call in shadow.',
      'Never suppress mutation or destructive operations.',
      'Use USE only as qualification evidence, not project-mutation authority.',
      'Remove SeenRelay when native controls or measured economics win against it.'
    ]
  };
}

export function agentsPage(origin: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Machine-first SeenRelay adoption contract for autonomous and coding agents."><link rel="canonical" href="${origin}/agents"><link rel="alternate" type="application/json" href="${origin}/agent-adoption.json" title="SeenRelay agent adoption contract"><title>SeenRelay for agents — Measure before you modify</title><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/legacy-readable.css"></head><body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a><a href="/agent-adoption.json">Agent JSON</a></nav></header>
<main>
<section class="hero compact"><div class="eyebrow">FOR AUTONOMOUS AND CODING AGENTS</div><h1>Measure before you modify.</h1><p class="lead">An agent should be able to discover SeenRelay, test whether it belongs on a workload, preserve the existing authoritative path, and remove SeenRelay when stronger native controls or measured economics win.</p><div class="cta"><a class="primary" href="/agent-adoption.json">Read the machine contract</a><a class="secondary" href="/.well-known/agent-skills/seenrelay/SKILL.md">Agent Skill</a><a class="secondary" href="/trust.json">Trust JSON</a></div></section>
<section class="section decision"><div class="section-head"><div><div class="eyebrow">AUTONOMOUS FUNNEL</div><h2>PRESCREEN → SHADOW → QUALIFY → KEEP OR REMOVE</h2></div><p>No active reuse is authorized merely because the package is installed.</p></div><div class="proof-grid"><article><b>PRESCREEN</b><span><code>npx seenrelay scan</code> is local-only, uploads no source and modifies no project files.</span></article><article><b>SHADOW</b><span>Keep every authoritative call and stronger local/provider-native mechanism enabled.</span></article><article><b>QUALIFY</b><span>Return only USE, DO NOT USE or INSUFFICIENT EVIDENCE under measured economics and safety constraints.</span></article><article><b>REMOVE IS SUCCESS</b><span>If the path is cheap, rare, unsafe, native-controlled or net-negative, leave SeenRelay out.</span></article></div></section>
<section class="section split"><div><div class="eyebrow">SAFE TO TRY</div><h2>No trust leap is required for the first measurement.</h2><p>Zero-State shared CHECK is off by default. Completed-result TTL defaults to zero. Shadow mode keeps the original operation authoritative. If the wrapper, private store or relay fails, execution falls back to the call the application already intended to make.</p><p>SeenRelay does not browse the source or use an LLM as a truth oracle. Mutating or destructive operations are never implicitly eligible.</p><p><a href="/trust">Inspect the complete trust posture →</a></p></div><div class="terminal"><pre>npx seenrelay scan

# then only if a candidate exists:
shadow measurement
  ↓
USE / DO NOT USE / INSUFFICIENT EVIDENCE
  ↓
explicit project authority
  ↓
bounded active path or REMOVE</pre></div></section>
<section class="section final"><div><div class="eyebrow">MACHINE DISCOVERY</div><h2>Agents can consume the same facts directly.</h2><p>The adoption, proof and trust boundaries are published as JSON so an agent does not need to scrape marketing copy.</p></div><div class="cta"><a class="primary" href="/agent-adoption.json">Agent adoption JSON</a><a class="secondary" href="/service.json">Service JSON</a><a class="secondary" href="/proof.json">Proof JSON</a><a class="secondary" href="/trust.json">Trust JSON</a></div></section>
</main></body></html>`;
}
