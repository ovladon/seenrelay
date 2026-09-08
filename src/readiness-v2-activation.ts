import { consumeHiveMonthlyBudget } from './hive-admission-db.js';
import { privacyScopedHash } from './identity.js';
import { auditPublicAiReadinessV2, type ReadinessV2Audit } from './readiness-v2.js';

export const READINESS_V2_FREE_MONTHLY_HARD_CAP = 1_000;

export class ReadinessV2ActivationError extends Error {
  constructor(public readonly code: 'READINESS_V2_DISABLED' | 'READINESS_V2_MONTHLY_CAP', message: string) {
    super(message);
    this.name = 'ReadinessV2ActivationError';
  }
}

export function readinessV2ActivationState() {
  return {
    schema: 'seenrelay-readiness-v2-activation-v1' as const,
    enabled: process.env.READINESS_V2_ENABLED === 'true',
    mode: 'FREE_HARD_BOUNDED' as const,
    monthlyHardCap: READINESS_V2_FREE_MONTHLY_HARD_CAP,
    paidOverageAllowed: false as const
  };
}

export async function runActivatedReadinessV2(site: string): Promise<ReadinessV2Audit> {
  const state = readinessV2ActivationState();
  if (!state.enabled) {
    throw new ReadinessV2ActivationError('READINESS_V2_DISABLED', 'Extended readiness audit is not enabled in this deployment.');
  }
  const nowIso = new Date().toISOString();
  const budgetKey = `readiness-v2-free-month:${await privacyScopedHash('readiness-v2-free-month', 'v1')}`;
  const monthly = await consumeHiveMonthlyBudget(budgetKey, nowIso, READINESS_V2_FREE_MONTHLY_HARD_CAP);
  if (!monthly.allowed) {
    throw new ReadinessV2ActivationError('READINESS_V2_MONTHLY_CAP', 'Extended readiness audit monthly capacity is exhausted.');
  }
  return auditPublicAiReadinessV2(site);
}
