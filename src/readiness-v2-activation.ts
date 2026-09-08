import { consumeHiveMonthlyBudget } from './hive-admission-db.js';
import { privacyScopedHash } from './identity.js';
import { normalizeAuditTarget } from './readiness-network.js';
import { auditPublicAiReadinessV2, type ReadinessV2Audit } from './readiness-v2.js';

export const READINESS_V2_FREE_MONTHLY_HARD_CAP = 1_000;

export class ReadinessV2ActivationError extends Error {
  constructor(public readonly code: 'READINESS_V2_DISABLED' | 'READINESS_V2_COST_COVERAGE_REQUIRED' | 'READINESS_V2_MONTHLY_CAP', message: string) {
    super(message);
    this.name = 'ReadinessV2ActivationError';
  }
}

export function readinessV2ActivationState() {
  const requestedEnabled = process.env.READINESS_V2_ENABLED === 'true';
  const costCovered = process.env.READINESS_V2_COST_COVERED === 'true';
  return {
    schema: 'seenrelay-readiness-v2-activation-v1' as const,
    requestedEnabled,
    costCovered,
    enabled: requestedEnabled && costCovered,
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
    throw new ReadinessV2ActivationError('READINESS_V2_COST_COVERAGE_REQUIRED', 'Extended readiness audit cannot run until its operating cost is explicitly covered.');
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
