import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const seo = fs.readFileSync(new URL('../src/seo-pages.ts', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const adoption = fs.readFileSync(new URL('../src/adoption.ts', import.meta.url), 'utf8');
const integrations = fs.readFileSync(new URL('../src/integrations.ts', import.meta.url), 'utf8');
const substrate = fs.readFileSync(new URL('../src/substrate.ts', import.meta.url), 'utf8');

test('AI agent cost optimization page targets the category without universal savings claims', () => {
  assert.match(seo, /AI Agent Cost Optimization — SeenRelay/);
  assert.match(seo, /AI AGENT COST OPTIMIZATION/);
  assert.match(seo, /Cut the tool work your agents pay for twice/);
  assert.match(seo, /Optimize execution, not just tokens/);
  assert.match(seo, /18 → 9/);
  assert.match(seo, /5 → 1/);
  assert.match(seo, /Native caches, request coalescing and provider controls stay first/);
  assert.doesNotMatch(seo, /guaranteed savings|always cheaper|save \d+%/i);
});

test('duplicate tool call page targets exact deduplication while keeping safety boundaries explicit', () => {
  assert.match(seo, /Duplicate Tool Calls and Tool Call Deduplication — SeenRelay/);
  assert.match(seo, /DUPLICATE TOOL CALLS · TOOL CALL DEDUPLICATION/);
  assert.match(seo, /same exact read-only tool call/i);
  assert.match(seo, /Tool name alone is not enough/);
  assert.match(seo, /Mutations, control actions and independent-sample requirements/);
  assert.match(seo, /Local memoization is not always enough/);
  assert.match(seo, /Natural recurrence decides whether deduplication is worth it/);
});

test('focused SEO pages are routable and discoverable without bloating the homepage', () => {
  assert.match(index, /app\.get\('\/ai-agent-cost-optimization'/);
  assert.match(index, /app\.get\('\/duplicate-tool-calls'/);
  assert.match(adoption, /path: '\/ai-agent-cost-optimization'/);
  assert.match(adoption, /path: '\/duplicate-tool-calls'/);
  assert.match(adoption, /AI agent cost optimization: \$\{origin\}\/ai-agent-cost-optimization/);
  assert.match(adoption, /Duplicate tool calls \/ tool call deduplication: \$\{origin\}\/duplicate-tool-calls/);
  assert.match(substrate, /href="\/ai-agent-cost-optimization"/);
  assert.match(substrate, /href="\/duplicate-tool-calls"/);
});

test('integration page exposes high-intent agent integration language in metadata', () => {
  assert.match(integrations, /SeenRelay AI Agent Integrations/);
  assert.match(integrations, /MCP, Claude Code, OpenTelemetry, JavaScript and Python/);
  assert.match(integrations, /AI agent integrations for MCP, Claude Code/);
});
