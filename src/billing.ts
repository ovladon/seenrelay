import { config } from './config.js';
import type { HiveClass } from './types.js';

export interface BillingContext {
  hiveClass?: HiveClass;
  contributionScore?: number;
}

export interface BillingDecision {
  mode: 'free';
  priceUsdMicros: 0;
  reason: 'service_free' | 'contributor_entitlement';
  meterableUnits: number;
}

export function billingDecision(operation: 'check' | 'observe', context: BillingContext = {}): BillingDecision {
  return {
    mode: 'free',
    priceUsdMicros: 0,
    reason: context.hiveClass === 'contributor' ? 'contributor_entitlement' : 'service_free',
    meterableUnits: operation === 'check' ? 1 : 0
  };
}

/**
 * Safety invariant for this deployment: billing is not available.
 * Any configuration that attempts to enable it fails closed before request handling.
 */
export function assertBillingDisabled(): void {
  const cfg = config();
  if (cfg.paymentsEnabled || cfg.paymentProvider !== 'none') {
    throw new Error('Billing is disabled in this SeenRelay deployment.');
  }
}
