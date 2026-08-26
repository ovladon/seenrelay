import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const recipe = fs.readFileSync(
  new URL('../contrib/vercel-ai-sdk-deterministic-freshness-preflight.mdx', import.meta.url),
  'utf8',
);

test('Vercel AI SDK recipe keeps SeenRelay deterministic inside tool execute', () => {
  assert.match(recipe, /import \{ tool \} from 'ai'/);
  assert.match(recipe, /inputSchema:/);
  assert.match(recipe, /execute: async/);
  assert.match(recipe, /relay\.guardDetailed\(/);
  assert.match(recipe, /validate: async/);
  assert.match(recipe, /reuseKnownOnSameObserved/);
  assert.match(recipe, /shadow mode/i);
  assert.match(recipe, /fail-open/i);

  // SeenRelay must not be presented as a second model-selected tool.
  assert.doesNotMatch(recipe, /tools\s*:\s*\{[^}]*seenrelay/is);
  assert.doesNotMatch(recipe, /seenRelay\s*:\s*tool\(/i);

  const executeIndex = recipe.indexOf('execute: async');
  const guardIndex = recipe.indexOf('relay.guardDetailed(');
  const providerIndex = recipe.indexOf('validate: async');
  assert.ok(executeIndex >= 0 && guardIndex > executeIndex);
  assert.ok(providerIndex > guardIndex);
});
