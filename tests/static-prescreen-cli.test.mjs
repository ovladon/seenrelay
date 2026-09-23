import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanText } from '../clients/typescript/scripts/scan-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

test('Claude Code plugin manifest reuses the existing skill without automatic MCP attachment', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'seenrelay');
  assert.equal(manifest.displayName, 'SeenRelay');
  assert.match(manifest.description, /repeated expensive read-only validation/i);
  assert.equal(Object.hasOwn(manifest, 'version'), false, 'Claude community plugin should follow source commit SHA updates');
  assert.equal(Object.hasOwn(manifest, 'mcpServers'), false);
  assert.equal(fs.existsSync(path.join(root, 'skills', 'seenrelay', 'SKILL.md')), true);
});

test('static prescreen marks scheduled metered search as shadow-measurement candidate', () => {
  const result = scanText(`
    import { tavily } from '@tavily/core';
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
    export async function scheduled() {
      return client.search("latest agent infrastructure releases");
    }
  `, 'jobs/daily-search.ts');
  assert.equal(result.status, 'CANDIDATE_FOR_SHADOW_MEASUREMENT');
  assert.equal(result.recurrence_signal, true);
  assert.equal(result.stable_literal_or_source_identity_visible, true);
  assert.equal(result.provider_signals.some((x) => x.id === 'tavily'), true);
});

test('static prescreen keeps stronger cache/native controls ahead of SeenRelay', () => {
  const result = scanText(`
    import { TavilyClient } from 'tavily';
    const redis = createRedis();
    async function scheduled() {
      const cached = await redis.get('daily-query');
      return cached ?? new TavilyClient().search("latest AI news");
    }
  `, 'cron/research.py');
  assert.equal(result.status, 'NATIVE_CONTROL_FIRST');
  assert.equal(result.stronger_controls_detected.some((x) => x.id === 'local_cache'), true);
});

test('static prescreen cannot infer natural recurrence from a provider import alone', () => {
  const result = scanText(`
    import Exa from 'exa-js';
    export async function search(q) { return new Exa(process.env.EXA_API_KEY).search(q); }
  `, 'src/search.ts');
  assert.equal(result.status, 'NEEDS_RUNTIME_EVIDENCE');
});

test('npm package declares the local CLI entry point', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'clients', 'typescript', 'package.json'), 'utf8'));
  assert.equal(pkg.bin?.seenrelay, './scripts/seenrelay-cli.mjs');
});
