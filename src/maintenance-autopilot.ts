export type MaintenanceAutopilotState = 'HEALTHY' | 'WATCH' | 'DEGRADED';
export type MaintenanceSeverity = 'info' | 'warning' | 'critical';

export interface MaintenanceRecommendation {
  id: string;
  severity: MaintenanceSeverity;
  category: 'telemetry' | 'security' | 'operations' | 'adoption' | 'release';
  message: string;
  automatic_action: 'none' | 'housekeeping';
}

export interface MaintenanceAutopilotInput {
  controls: {
    mode?: unknown;
    checks_enabled?: unknown;
    observes_enabled?: unknown;
    rewards_enabled?: unknown;
  };
  operational_summary: Record<string, unknown>;
  adoption: {
    status?: unknown;
    summary?: Record<string, unknown>;
  };
  safety: {
    billing_enabled?: unknown;
    admin_secret_configured?: unknown;
    privacy_salt_configured?: unknown;
    hive_signing_secret_dedicated?: unknown;
    internal_telemetry_classifier_configured?: unknown;
    maintenance_cron_configured?: unknown;
    provider_spend_cap_verified_by_app?: unknown;
  };
  credential_rotation?: {
    transition_active?: unknown;
  };
}

function n(value: unknown): number {
  const parsed=Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function recommendation(
  id: string,
  severity: MaintenanceSeverity,
  category: MaintenanceRecommendation['category'],
  message: string,
  automatic_action: MaintenanceRecommendation['automatic_action']='none'
): MaintenanceRecommendation {
  return { id, severity, category, message, automatic_action };
}

export function evaluateMaintenanceAutopilot(input: MaintenanceAutopilotInput) {
  const recommendations: MaintenanceRecommendation[]=[];
  const adoptionSummary=input.adoption?.summary || {};
  const externalLeases=n(adoptionSummary.leases_external);
  const externalRepeat=n(adoptionSummary.leases_external_repeat);
  const externalBidirectional=n(adoptionSummary.leases_external_bidirectional);
  const externalReuseConsumers=n(adoptionSummary.leases_external_reuse_consumers);
  const checks=n(input.operational_summary.checks_month);
  const unknown=n(input.operational_summary.unknown_month);
  const globalUnknownRate=checks ? unknown/checks : 0;

  if (input.adoption?.status !== 'ok') {
    recommendations.push(recommendation(
      'restore-adoption-classification', 'warning', 'telemetry',
      'Hosted adoption classification is unavailable. Withhold external-adoption conclusions until classification is restored.'
    ));
  }
  if (!input.safety?.admin_secret_configured) {
    recommendations.push(recommendation('configure-admin-secret','critical','security','Administrative control authentication is not fully configured.'));
  }
  if (!input.safety?.privacy_salt_configured) {
    recommendations.push(recommendation('configure-privacy-salt','critical','security','Privacy-scoped operational identifiers are not fully configured.'));
  }
  if (!input.safety?.hive_signing_secret_dedicated) {
    recommendations.push(recommendation('dedicate-hive-signing-secret','critical','security','Hive lease signing is not using the dedicated signing-secret posture.'));
  }
  if (!input.safety?.internal_telemetry_classifier_configured) {
    recommendations.push(recommendation(
      'configure-first-party-classifier','warning','telemetry',
      'Server-verified first-party telemetry classification is not configured; unmarked manual/operator probes can remain ambiguous.'
    ));
  }
  if (!input.safety?.maintenance_cron_configured) {
    recommendations.push(recommendation(
      'configure-maintenance-cron','warning','operations',
      'The scheduled maintenance cycle is not authenticated/configured; Control Room evaluation remains available but automatic housekeeping is inactive.'
    ));
  }
  if (input.safety?.billing_enabled) {
    recommendations.push(recommendation('billing-unexpectedly-enabled','critical','release','Billing is enabled in a deployment whose current operating policy expects billing to remain disabled.'));
  }
  if (input.credential_rotation?.transition_active) {
    recommendations.push(recommendation('complete-credential-rotation','warning','security','A make-before-break credential rotation is still in its transition window.'));
  }
  if (String(input.controls?.mode || 'NORMAL') !== 'NORMAL') {
    recommendations.push(recommendation('review-non-normal-mode','warning','operations','Runtime controls are in a non-NORMAL incident mode; keep the restriction until the triggering condition is explicitly cleared.'));
  }
  if (checks >= 100 && globalUnknownRate >= 0.75) {
    recommendations.push(recommendation(
      'review-high-global-unknown','warning','operations',
      'Global CHECK traffic has a high UNKNOWN share. Treat this as a workload/coverage signal only; do not auto-enable reuse or seed synthetic traffic in response.'
    ));
  }

  // Retention cleanup is the only Production-mutating action this evaluator authorizes automatically.
  recommendations.push(recommendation(
    'retention-housekeeping','info','operations',
    'Run retention housekeeping using the configured lease, reuse-event, and observation retention windows.',
    'housekeeping'
  ));

  const critical=recommendations.some(x=>x.severity==='critical');
  const warning=recommendations.some(x=>x.severity==='warning');
  const state:MaintenanceAutopilotState=critical || input.adoption?.status !== 'ok' ? 'DEGRADED' : warning ? 'WATCH' : 'HEALTHY';

  return {
    version:'maintenance-autopilot-v1' as const,
    state,
    release_policy:'discover -> isolate -> implement candidate -> verify -> explicit release' as const,
    automatic_mutation_policy:{
      allowed:['retention-housekeeping'],
      forbidden:['merge-to-main','enable-billing','change-fact-identity','change-privacy-semantics','add-domain-operation','auto-enable-reuse','change-runtime-incident-mode']
    },
    signals:{
      external_protocol_leases:externalLeases,
      external_repeat_leases:externalRepeat,
      external_bidirectional_leases:externalBidirectional,
      external_reuse_consumers:externalReuseConsumers,
      global_checks_month:checks,
      global_unknown_rate:globalUnknownRate
    },
    recommendations
  };
}
