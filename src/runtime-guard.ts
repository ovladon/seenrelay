import { ValidationError } from './canonical.js';
import type { FactDescriptor } from './types.js';

const TEST_PATH = /^\/seenrelay-(?:e2e|e2e-advanced|mcp-e2e)(?:\/|$)/;

export function isReservedTestSource(source: string): boolean {
  try {
    const url = new URL(source);
    return url.hostname.toLowerCase() === 'example.com' && TEST_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Preview CI deliberately uses reserved example.com namespaces. Production rejects them before
 * Hive admission so a misrouted test cannot create leases, facts, observations or telemetry.
 */
export function assertRuntimeFactAllowed(fact: FactDescriptor): void {
  if (process.env.VERCEL_ENV === 'production' && isReservedTestSource(fact?.source || '')) {
    throw new ValidationError('Reserved SeenRelay test namespace is not accepted in production');
  }
}
