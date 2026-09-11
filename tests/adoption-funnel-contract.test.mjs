import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const json = (...parts) => JSON.parse(read(...parts));

const verdicts = new Set(['USE', 'DO NOT USE', 'INSUFFICIENT EVIDENCE']);

test('mutable discovery manifests use customer-problem language and stay aligned', () => {
  const plugin = json('plugin.json');
  const gemini = json('gemini-extension.json');
  const registry = json('registry', 'server.json');

  assert.match(plugin.description, /repeated expensive read-only checks/i);
  assert.equal(gemini.description, plugin.description);
  assert.equal(gemini.mcpServers.seenrelay.description, plugin.description);

  // Official MCP Registry metadata is immutable per published version, so 0.3.10 may retain its
  // previously published description until the next genuine service release.
  assert.equal(registry.version, plugin.version);
  assert.ok(registry.description.length <= 100);
});

test('shadow audit schema and reference result preserve falsifiable measurement semantics', () => {
  const schema = json('docs', 'schemas', 'shadow-audit-report.schema.json');
  const example = json('examples', 'shadow-audit-report.example.json');

  assert.equal(schema.properties.schema_version.const, 'seenrelay-shadow-audit-v1');
  assert.deepEqual(new Set(schema.$defs.verdict.enum), verdicts);
  assert.equal(schema.$defs.safety.properties.authoritative_fallback_preserved.const, true);
  assert.equal(schema.$defs.safety.properties.active_reuse_enabled.const, false);
  assert.equal(schema.$defs.nullableNonNegativeNumber.minimum, 0);

  assert.equal(example.schema_version, 'seenrelay-shadow-audit-v1');
  assert.equal(example.mode, 'shadow');
  assert.ok(verdicts.has(example.verdict));
  assert.ok(example.workloads.length > 0);
  assert.ok(Object.values(example.privacy).every((value) => value === false));

  for (const workload of example.workloads) {
    assert.ok(verdicts.has(workload.verdict));
    assert.ok(workload.exact_repeat_count <= workload.protected_call_count);
    assert.ok(workload.equivalence.mismatches <= workload.equivalence.compared);
    assert.equal(
      workload.shared_check.same_observed + workload.shared_check.unknown + workload.shared_check.other,
      workload.shared_check.checks
    );
    assert.equal(workload.safety.authoritative_fallback_preserved, true);
    assert.equal(workload.safety.active_reuse_enabled, false);
  }
});

test('Agent Skill first-use contract is synchronized and does not authorize reuse', () => {
  const source = read('shared', 'agent-skill.mjs');
  const canonical = read('skills', 'seenrelay', 'SKILL.md');
  const mirrors = [
    read('.agents', 'skills', 'seenrelay', 'SKILL.md'),
    read('.claude', 'skills', 'seenrelay', 'SKILL.md'),
    read('.github', 'skills', 'seenrelay', 'SKILL.md')
  ];

  for (const mirror of mirrors) assert.equal(mirror, canonical);
  assert.match(source, /seenrelay-shadow-audit-v1/);
  assert.match(canonical, /USE \/ DO NOT USE \/ INSUFFICIENT EVIDENCE/);
  assert.match(canonical, /Do not invent data/i);
  assert.match(canonical, /active reuse/i);
});

test('Developer path advances from Ambient screening to a deterministic falsifiable verdict', () => {
  const landing = read('src', 'landing.ts');
  const quickstart = read('src', 'quickstart.ts');
  const economicsLab = read('docs', 'ECONOMICS_LAB.md');

  assert.match(landing, /href="\/quickstart#evaluate"/);
  assert.match(quickstart, /id="evaluate"/);
  assert.match(quickstart, /Ambient finds repetition\. Shadow Proof decides whether SeenRelay has earned a place\./);
  assert.match(quickstart, /SeenRelayShadowProof/);
  assert.match(quickstart, /hostileBenchmarkInput/);
  assert.match(quickstart, /hostile_benchmark_input/);
  assert.match(quickstart, /evaluateHostileBenchmark/);
  assert.match(quickstart, /evaluate_hostile_benchmark/);
  assert.match(quickstart, /classifyHostileBenchmarkVerdict/);
  assert.match(quickstart, /classify_hostile_benchmark_verdict/);
  assert.match(quickstart, /<h3>USE<\/h3>/);
  assert.match(quickstart, /<h3>DO NOT USE<\/h3>/);
  assert.match(quickstart, /<h3>INSUFFICIENT EVIDENCE<\/h3>/);
  assert.match(quickstart, /100-call floor is an operational gate, not a universal statistical-significance claim/);
  assert.match(quickstart, /Both the evaluator and verdict classifier leave automatic reuse disabled/);
  assert.match(economicsLab, /JavaScript \/ TypeScript and Python Shadow Proof implementations/);
  assert.match(economicsLab, /Python follows the same fail-closed evidence contract/);
  assert.doesNotMatch(economicsLab, /Python continues to support shadow measurement but does not claim parity/i);
});

test('adoption automation verifies the exact public path and external discovery surfaces', () => {
  const gate = read('.github', 'workflows', 'production-adoption-gate.yml');
  const radarWorkflow = read('.github', 'workflows', 'distribution-radar.yml');
  const radar = read('scripts', 'distribution-radar.mjs');

  assert.match(gate, /npx skills add https:\/\/seenrelay\.com --skill seenrelay --yes/);
  assert.match(gate, /npm_config_yes=true/);
  assert.match(gate, /deployment_sha == \$sha/);
  assert.match(gate, /billing_enabled == false/);
  assert.match(gate, /npm install .*seenrelay@\$VERSION/);
  assert.match(gate, /seenrelay==\$VERSION/);
  for (const homepageAsset of ['public/revamp.js', 'public/revamp.css', 'public/revamp-factual.css', 'public/sota.css', 'public/funnel.css']) {
    assert.match(gate, new RegExp(homepageAsset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(gate, /src\/quickstart\.ts/);
  assert.match(gate, /rv-console rv-funnel-console/);
  assert.match(gate, /rv-console-body/);
  assert.match(gate, /developer-audit/);
  assert.match(gate, /href="\/quickstart#evaluate"/);
  assert.match(gate, /Integrate directly with the client\./);
  assert.match(gate, /Install the npm or PyPI client/);
  assert.match(gate, /SeenRelayShadowProof/);
  assert.match(gate, /evaluateHostileBenchmark/);
  assert.match(gate, /evaluate_hostile_benchmark/);

  assert.match(radarWorkflow, /schedule:/);
  assert.match(radarWorkflow, /issues: write/);
  assert.match(radar, /registry\.modelcontextprotocol\.io/);
  assert.match(radar, /glama\.ai\/mcp\/connectors\/io\.github\.ovladon\/seenrelay/);
  assert.match(radar, /agent-plugins\.directory\/ovladon\/seenrelay/);
  assert.match(radar, /registry\.npmjs\.org\/seenrelay/);
  assert.match(radar, /pypi\.org\/pypi\/seenrelay/);
});