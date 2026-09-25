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

test('minimal Claude community payload is exact, bounded, and synchronized', () => {
  const payloadRoot = path.join(root, 'integrations', 'claude', 'seenrelay');
  const canonicalManifest = fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8');
  const packagedManifest = fs.readFileSync(path.join(payloadRoot, '.claude-plugin', 'plugin.json'), 'utf8');
  const canonicalSkill = fs.readFileSync(path.join(root, 'skills', 'seenrelay', 'SKILL.md'), 'utf8');
  const packagedSkill = fs.readFileSync(path.join(payloadRoot, 'skills', 'seenrelay', 'SKILL.md'), 'utf8');
  const canonicalLicense = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  const packagedLicense = fs.readFileSync(path.join(payloadRoot, 'LICENSE'), 'utf8');

  assert.equal(packagedManifest, canonicalManifest);
  assert.equal(packagedSkill, canonicalSkill);
  assert.equal(packagedLicense, canonicalLicense);

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(path.relative(payloadRoot, full).split(path.sep).join('/'));
      else assert.fail(`unexpected non-file payload entry: ${full}`);
    }
  };
  walk(payloadRoot);
  files.sort();
  assert.deepEqual(files, [
    '.claude-plugin/plugin.json',
    'LICENSE',
    'skills/seenrelay/SKILL.md'
  ]);
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

test('static prescreen treats Firecrawl provider cache semantics as native-control-first', () => {
  const result = scanText(`
    import FirecrawlApp from '@mendable/firecrawl-js';
    const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
    export async function scheduled(url) {
      return firecrawl.scrapeUrl(url, { formats: ['extract'] });
    }
  `, 'cron/check-prices.ts');
  assert.equal(result.status, 'NATIVE_CONTROL_FIRST');
  assert.equal(result.stronger_controls_detected.some((x) => x.id === 'firecrawl_provider_cache'), true);
  assert.match(result.next_step, /native\/local control/i);
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


test('static prescreen treats MCP ttlMs/cacheScope as native-control-first', () => {
  const result = scanText(`
    import { Client } from '@modelcontextprotocol/sdk/client/index.js';
    const schedule = 'hourly';
    const toolMetadata = { ttlMs: 300000, cacheScope: 'public' };
    export async function scheduled(client) {
      return client.callTool({ name: 'read_status', arguments: { service: 'example' } });
    }
  `, 'jobs/mcp-status.ts');
  assert.equal(result.status, 'NATIVE_CONTROL_FIRST');
  assert.equal(result.stronger_controls_detected.some((x) => x.id === 'mcp_cache_freshness'), true);
});
