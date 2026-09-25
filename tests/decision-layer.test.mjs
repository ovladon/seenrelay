import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('known-state decision layer is explicit without adding a protocol operation', () => {
  const landing = read('src', 'landing.ts');
  const service = read('src', 'public.ts');
  const index = read('src', 'index.ts');
  const decision = read('docs', 'DECISION_LAYER.md');

  assert.match(landing, /need to look again/i);
  assert.match(landing, /known-state revalidation/i);
  assert.match(landing, /authoritative source remains available/i);
  assert.match(service, /known external state needs fresh authoritative validation/i);
  assert.match(service, /starter_facts:/);
  assert.match(index, /app\.get\('\/starter-facts'/);
  assert.match(index, /app\.get\('\/starter-facts\.json'/);
  assert.match(decision, /exactly two domain operations: \*\*CHECK\*\* and \*\*OBSERVE\*\*/);
  assert.doesNotMatch(`${landing}\n${service}\n${decision}`, /third domain operation|truth oracle|guaranteed savings/i);
});

test('starter fact catalog publishes deterministic identity only', () => {
  const source = read('src', 'starter-facts.ts');
  const ids = [...source.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
  const facts = ids.filter((id) => id !== 'seenrelay-starter-facts-v1');

  assert.equal(facts.length, 15);
  assert.equal(new Set(facts).size, 15);
  assert.match(source, /values_included: false/);
  assert.match(source, /freshness_policy_included: false/);
  assert.match(source, /automatic_reuse_authorized: false/);
  assert.match(source, /truth_claim: false/);
  assert.match(source, /These descriptors only reduce fact-identity fragmentation/);
  assert.doesNotMatch(source, /observed_value|current_value|recommended_ttl|max_age_seconds:\s*\d+/i);
});

test('starter facts stay aligned with the bounded first-party public source set', () => {
  const source = read('src', 'starter-facts.ts');
  for (const id of [
    'github-status-indicator',
    'github-status-description',
    'node-latest-version',
    'pypi-openai-version',
    'pypi-anthropic-version',
    'pypi-mcp-version',
    'pypi-langchain-version',
    'pypi-llama-index-version',
    'pypi-crewai-version',
    'pypi-browser-use-version',
    'npm-openai-version',
    'npm-anthropic-sdk-version',
    'npm-mcp-sdk-version',
    'npm-vercel-ai-version',
    'npm-google-genai-version'
  ]) {
    assert.match(source, new RegExp(id.replaceAll('-', '\\-')));
  }
});
