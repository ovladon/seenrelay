import { consumeHiveMonthlyBudget } from './hive-admission-db.js';
import { privacyScopedHash } from './identity.js';
import { normalizeAuditTarget } from './readiness-network.js';
import { auditPublicAiReadinessV2, type ReadinessV2Audit } from './readiness-v2.js';

export const READINESS_V2_FREE_MONTHLY_HARD_CAP = 1_000;

type ReadinessV2ActivationBlocker =
  | 'ENABLE_NOT_REQUESTED'
  | 'COST_NOT_COVERED'
  | 'COST_COVERAGE_NOT_CURRENT'
  | 'PROVIDER_SPEND_BOUNDARY_NOT_CONFIRMED';

export class ReadinessV2ActivationError extends Error {
  constructor(public readonly code: 'READINESS_V2_DISABLED' | 'READINESS_V2_MONTHLY_CAP', message: string) {
    super(message);
    this.name = 'ReadinessV2ActivationError';
  }
}

function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function readinessV2ActivationState(now = new Date()) {
  const requestedEnabled = process.env.READINESS_V2_ENABLED === 'true';
  const costCovered = process.env.READINESS_V2_COST_COVERED === 'true';
  const costCoverageMonth = (process.env.READINESS_V2_COST_COVERAGE_MONTH || '').trim();
  const currentUtcMonth = utcMonth(now);
  const costCoverageCurrent = costCovered && costCoverageMonth === currentUtcMonth;
  // This is an operator attestation after checking the provider-side spend boundary. The app does not
  // claim that an environment variable independently verifies the provider configuration.
  const providerSpendBoundaryConfirmed = process.env.READINESS_V2_PROVIDER_SPEND_BOUNDARY_CONFIRMED === 'true';
  const activationBlockers: ReadinessV2ActivationBlocker[] = [];
  if (!requestedEnabled) activationBlockers.push('ENABLE_NOT_REQUESTED');
  if (!costCovered) activationBlockers.push('COST_NOT_COVERED');
  if (!costCoverageCurrent) activationBlockers.push('COST_COVERAGE_NOT_CURRENT');
  if (!providerSpendBoundaryConfirmed) activationBlockers.push('PROVIDER_SPEND_BOUNDARY_NOT_CONFIRMED');

  return {
    schema: 'seenrelay-readiness-v2-activation-v2' as const,
    requestedEnabled,
    costCovered,
    costCoverageMonth: costCoverageMonth || null,
    currentUtcMonth,
    costCoverageCurrent,
    providerSpendBoundaryConfirmed,
    activationBlockers,
    enabled: activationBlockers.length === 0,
    mode: 'FREE_HARD_BOUNDED' as const,
    monthlyHardCap: READINESS_V2_FREE_MONTHLY_HARD_CAP,
    paidOverageAllowed: false as const
  };
}

export async function runActivatedReadinessV2(site: string): Promise<ReadinessV2Audit> {
  const state = readinessV2ActivationState();
  if (!state.requestedEnabled) {
    throw new ReadinessV2ActivationError('READINESS_V2_DISABLED', 'Extended readiness audit is not enabled in this deployment.');
  }
  if (!state.costCovered) {
    throw new ReadinessV2ActivationError('READINESS_V2_DISABLED', 'Extended readiness audit remains disabled until its operating cost is explicitly covered.');
  }
  if (!state.costCoverageCurrent) {
    throw new ReadinessV2ActivationError('READINESS_V2_DISABLED', 'Extended readiness audit cost coverage must be re-established for the current UTC month.');
  }
  if (!state.providerSpendBoundaryConfirmed) {
    throw new ReadinessV2ActivationError('READINESS_V2_DISABLED', 'Extended readiness audit remains disabled until the provider-side spend boundary is operationally confirmed.');
  }

  // Reject syntactically unsafe targets before consuming scarce monthly capacity.
  normalizeAuditTarget(site);

  const nowIso = new Date().toISOString();
  const budgetKey = `readiness-v2-free-month:${await privacyScopedHash('readiness-v2-free-month', 'v1')}`;
  const monthly = await consumeHiveMonthlyBudget(budgetKey, nowIso, READINESS_V2_FREE_MONTHLY_HARD_CAP);
  if (!monthly.allowed) {
    throw new ReadinessV2ActivationError('READINESS_V2_MONTHLY_CAP', 'Extended readiness audit monthly capacity is exhausted.');
  }
  return auditPublicAiReadinessV2(site);
}
