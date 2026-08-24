import { config } from './config.js';

export function operationalReadiness() {
  const cfg = config();
  return {
    state: 'OPERATING' as const,
    gates: {
      payments_disabled: !cfg.paymentsEnabled,
      payment_provider_none: cfg.paymentProvider === 'none',
      reproducible_build: true,
      preview_production_isolation: true,
      runtime_controls_available: true,
      incident_playbooks_available: true,
      standards_watch_configured: true
    },
    invariant: 'Operational changes require explicit release gates; billing remains disabled in this deployment.'
  };
}

export function custodyTransferReadiness() {
  return {
    model: 'transferable_managed_infrastructure',
    application_assets: {
      source_repository: 'GitHub repository',
      deployment: 'Vercel project and domain configuration',
      state: 'Neon Postgres',
      domain: 'seenrelay.com',
      build: 'package-lock.json + npm ci',
      control_plane: 'SeenRelay Control Room'
    },
    transfer_sequence: [
      'establish receiving administrative identities',
      'grant receiving access before revoking existing access',
      'transfer repository/project/domain/database custody using provider-supported mechanisms',
      'transfer continuity secrets through an agreed secure channel',
      'rotate rotatable administrative credentials using make-before-break transition keys',
      'verify Preview and Production gates under receiving custody',
      'remove prior access only after operational acceptance'
    ],
    continuity_notes: {
      privacy_salt: 'Continuity-sensitive. Do not rotate blindly; use a versioned migration if rotation is ever required.',
      hive_signing_secret: 'Supports make-before-break rotation with a verification-only previous key.',
      admin_secret: 'Supports make-before-break rotation with a temporary previous authentication key.'
    },
    custody_checks: [
      'GitHub repository administrative access',
      'Vercel project/domain access and spend controls',
      'Neon project/database access and backups',
      'domain registrar and DNS access',
      'current secret inventory and rotation status'
    ],
    operations_export: '/admin/api/operations-export'
  };
}
