import { getRuntimeControls, type RuntimeControls } from './admin-db.js';

let cached: { value: RuntimeControls; expiresAt: number } | null = null;
const CACHE_MS = 2000;

export function invalidateRuntimeControlCache(): void { cached = null; }

export async function runtimeControls(): Promise<RuntimeControls> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await getRuntimeControls();
  cached = { value, expiresAt: now + CACHE_MS };
  return value;
}

export interface RuntimePolicy {
  allowed: boolean;
  reason?: 'runtime_disabled';
  rewardsEnabled: boolean;
  capacityMultiplier: number;
  refillMultiplier: number;
  mode: RuntimeControls['mode'];
}

export async function runtimePolicy(operation: 'check'|'observe'): Promise<RuntimePolicy> {
  const c = await runtimeControls();
  let allowed = operation === 'check' ? c.checks_enabled : c.observes_enabled;
  let rewardsEnabled = c.rewards_enabled;
  let capacityMultiplier = c.capacity_multiplier;
  let refillMultiplier = c.refill_multiplier;

  if (c.mode === 'SHIELD') {
    capacityMultiplier = Math.min(capacityMultiplier, 0.25);
    refillMultiplier = Math.min(refillMultiplier, 0.25);
    rewardsEnabled = false;
  } else if (c.mode === 'READ_ONLY') {
    allowed = operation === 'check' && c.checks_enabled;
    rewardsEnabled = false;
  } else if (c.mode === 'FREEZE') {
    allowed = false;
    rewardsEnabled = false;
    capacityMultiplier = 0;
    refillMultiplier = 0;
  }

  return { allowed, ...(allowed ? {} : { reason: 'runtime_disabled' as const }), rewardsEnabled, capacityMultiplier, refillMultiplier, mode: c.mode };
}
