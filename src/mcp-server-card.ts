import { SERVICE_RELEASE } from './version.js';

/**
 * Public, advisory MCP pre-connection metadata (SEP-2127 Server Card).
 * No tools, prompts, resources, credentials, private endpoints, or reuse grants.
 * The reverse-DNS name matches the Official MCP Registry identity; the live
 * MCP initialize response remains authoritative for runtime serverInfo.
 */
export function mcpServerCard() {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: 'io.github.ovladon/seenrelay',
    title: 'SeenRelay',
    description: 'Avoid redundant expensive validation. CHECK recent evidence; OBSERVE fresh independent results.',
    version: SERVICE_RELEASE,
    websiteUrl: 'https://seenrelay.com',
    repository: {
      source: 'github',
      url: 'https://github.com/ovladon/seenrelay'
    },
    remotes: [{
      type: 'streamable-http',
      url: 'https://seenrelay.com/mcp'
    }]
  };
}
