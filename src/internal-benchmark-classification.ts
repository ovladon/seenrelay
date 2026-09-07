import { canonicalFactKey } from './canonical.js';
import type { FactDescriptor } from './types.js';

export const STANDARDS_SHADOW_INTERNAL_QUALIFIERS = Object.freeze({
  seenrelay_internal_workload: 'standards-shadow-v1'
});

/** Last Production run known to use the legacy unqualified Standards Shadow identity. */
export const STANDARDS_SHADOW_LEGACY_CUTOFF = '2026-09-07T04:52:00.000Z';

const BASE_STANDARDS_SHADOW_FACTS = Object.freeze([
  {
    subject: 'Latest MCP specification revision',
    predicate: 'version.latest',
    source: 'https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification?ref=main',
    locator: { scheme: 'source_key', value: 'latest-dated-specification-directory' }
  },
  {
    subject: 'Latest MCP TypeScript server SDK version',
    predicate: 'version.latest',
    source: 'https://registry.npmjs.org/%40modelcontextprotocol%2Fserver/latest',
    locator: { scheme: 'json_pointer', value: '/version' }
  },
  {
    subject: 'Latest A2A specification release',
    predicate: 'version.latest',
    source: 'https://api.github.com/repos/a2aproject/A2A/releases/latest',
    locator: { scheme: 'source_key', value: 'normalized-latest-release-tag' }
  },
  {
    subject: 'Latest OpenTelemetry semantic conventions release',
    predicate: 'version.latest',
    source: 'https://api.github.com/repos/open-telemetry/semantic-conventions/releases/latest',
    locator: { scheme: 'source_key', value: 'normalized-latest-release-tag' }
  }
] satisfies FactDescriptor[]);

/**
 * Historical controlled CHECK identities. They are excluded only before the frozen cutoff so a
 * future external caller checking the same public standards is never hidden by fact identity alone.
 */
export const LEGACY_STANDARDS_SHADOW_FACTS = Object.freeze(
  BASE_STANDARDS_SHADOW_FACTS.map((fact) => Object.freeze({ ...fact }))
);

/**
 * Current controlled CHECK identities. The explicit internal-workload qualifier isolates scheduled
 * measurement from external evidence while preserving the exact authoritative source URL.
 */
export const STANDARDS_SHADOW_FACTS = Object.freeze(
  BASE_STANDARDS_SHADOW_FACTS.map((fact) => Object.freeze({
    ...fact,
    qualifiers: STANDARDS_SHADOW_INTERNAL_QUALIFIERS
  }))
);

async function factKeys(facts: readonly FactDescriptor[]): Promise<string[]> {
  return Promise.all(facts.map(async (fact) => (await canonicalFactKey(fact)).factKey));
}

export function standardsShadowFactKeys(): Promise<string[]> {
  return factKeys(STANDARDS_SHADOW_FACTS);
}

export function legacyStandardsShadowFactKeys(): Promise<string[]> {
  return factKeys(LEGACY_STANDARDS_SHADOW_FACTS);
}
