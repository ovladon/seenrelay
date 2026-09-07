import { canonicalFactKey } from './canonical.js';
import type { FactDescriptor } from './types.js';

/**
 * Controlled Production CHECK workload used by the scheduled standards shadow benchmark.
 * These identities are duplicated here intentionally so adoption classification can identify
 * historical CHECK-only leases without relying on user-controlled client hints or source markers.
 * Keep them aligned with scripts/standards-shadow-benchmark.mjs.
 */
export const STANDARDS_SHADOW_FACTS = Object.freeze([
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

export async function standardsShadowFactKeys(): Promise<string[]> {
  return Promise.all(STANDARDS_SHADOW_FACTS.map(async (fact) => (await canonicalFactKey(fact)).factKey));
}
