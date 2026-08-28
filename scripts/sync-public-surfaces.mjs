import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const writeMode = process.argv.includes('--write');
const enforceFreshness = process.argv.includes('--enforce-freshness');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function readJson(rel) {
  return JSON.parse(read(rel));
}
function fail(message) {
  throw new Error(message);
}
function parsePyprojectVersion(text) {
  const project = text.match(/\[project\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? '';
  const match = project.match(/^version\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
}
function parseServiceVersion(text) {
  return text.match(/SERVICE_RELEASE\s*=\s*'([^']+)'/)?.[1] ?? null;
}
function parseStableSemver(value, name) {
  if (typeof value !== 'string') fail(`${name} is missing`);
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) fail(`${name} must be a stable X.Y.Z version, got ${value}`);
  return match.slice(1).map(Number);
}
function compareStableSemver(a, b) {
  const left = parseStableSemver(a, 'left version');
  const right = parseStableSemver(b, 'right version');
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}
function markerBlock(name, body) {
  return `<!-- BEGIN GENERATED:${name} -->\n${body.trim()}\n<!-- END GENERATED:${name} -->`;
}
function replaceOrInsert(text, name, body, anchor) {
  const block = markerBlock(name, body);
  const begin = `<!-- BEGIN GENERATED:${name} -->`;
  const end = `<!-- END GENERATED:${name} -->`;
  const start = text.indexOf(begin);
  const finish = text.indexOf(end);
  if (start >= 0 || finish >= 0) {
    if (start < 0 || finish < 0 || finish < start) fail(`Malformed ${name} markers`);
    return text.slice(0, start) + block + text.slice(finish + end.length);
  }
  const at = text.indexOf(anchor);
  if (at < 0) fail(`Anchor not found for ${name}: ${anchor}`);
  const insertion = at + anchor.length;
  return text.slice(0, insertion) + `\n\n${block}` + text.slice(insertion);
}
function renderInstallSummary(facts) {
  const b = facts.verified_benchmarks.find((x) => x.id === 'firecrawl-json-extraction-2026-08-26');
  return [
    `**Install:** \`${facts.install.npm_command}\` · \`${facts.install.pypi_command}\` · client v${facts.install.client_version} · currently free · no account/API key.`,
    '',
    `**Measured first-party smoke result:** Firecrawl JSON extraction, n=${b.samples}: ${b.provider_calls_avoided}/${b.samples} eligible provider calls avoided, ${b.provider_credits_avoided} credits avoided, median ${b.fresh_baseline_median_ms} ms fresh / ${b.provider_cached_baseline_median_ms} ms provider-cached → ${b.reuse_median_ms} ms SeenRelay bounded reuse. This is a small first-party benchmark, not a promised reuse rate.`,
  ].join('\n');
}
function renderQuickstartSummary(facts) {
  return [
    `Install the public client first:`,
    '',
    '```bash',
    `# JavaScript / TypeScript`,
    facts.install.npm_command,
    '',
    '# Python',
    facts.install.pypi_command,
    '```',
    '',
    `Client v${facts.install.client_version} was clean-install verified from both public registries on ${facts.install.registry_install_verified_at.slice(0, 10)}. JavaScript/TypeScript 0.2.0 supports provider-independent local-first Zero-State; Python remains shadow-first in this release. Reuse remains caller policy.`,
  ].join('\n');
}
function renderVerifiedResults(facts) {
  const rows = facts.verified_benchmarks.map((b) => {
    const m = b.matrix;
    if (!m) fail(`Benchmark ${b.id} is missing normalized matrix evidence`);
    return `| ${m.surface} · ${m.configuration} | ${m.evidence_level}, n=${b.samples} | ${m.fit} | ${m.cost_outcome} | ${m.latency_outcome} | ${m.provider_calls_avoided}/${b.samples} calls; ${m.provider_units_avoided} ${m.provider_unit_label} | ${m.baseline_median_ms} ms | ${b.reuse_median_ms} ms | ${b.freshness_window_seconds}s |`;
  }).join('\n');
  return `# Verified results\n\nGenerated from public/product-facts.json. Do not edit measured claims here by hand.\n\n| Surface / configuration | Evidence | Fit | Cost | Latency | Provider work avoided | Baseline median | SeenRelay reuse median | Caller freshness window |\n| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |\n${rows}\n\n## Interpretation\n\nRows are verification-gated measurements, not universal performance promises. A caller must measure its own workload in shadow mode and set its own freshness/reuse policy. The website shows the latest verified result per configuration while this document retains the published benchmark records.\n\nEvidence:\n${facts.verified_benchmarks.map((b) => `- ${b.id}: ${b.evidence_url} (${b.artifact_digest})\n  - ${b.caveat}`).join('\n')}\n`;
}
const sourceFacts = readJson('public/product-facts.json');
const releaseVersion = read('clients/RELEASE_VERSION').trim();
const npmVersion = readJson('clients/typescript/package.json').version;
const pyVersion = parsePyprojectVersion(read('clients/python/pyproject.toml'));
const serviceVersion = parseServiceVersion(read('src/version.ts'));
const publicClientVersion = sourceFacts.install?.client_version;

if (!releaseVersion) fail('clients/RELEASE_VERSION is empty');
parseStableSemver(releaseVersion, 'RELEASE_VERSION');
if (npmVersion !== releaseVersion) fail(`npm client version ${npmVersion} != RELEASE_VERSION ${releaseVersion}`);
if (pyVersion !== releaseVersion) fail(`PyPI client version ${pyVersion} != RELEASE_VERSION ${releaseVersion}`);
parseStableSemver(publicClientVersion, 'public client version');
if (compareStableSemver(publicClientVersion, releaseVersion) > 0) {
  fail(`public client version ${publicClientVersion} is newer than RELEASE_VERSION ${releaseVersion}`);
}
if (!sourceFacts.install?.registry_install_verified_at) fail('public registry verification timestamp is missing');
if (!sourceFacts.install?.verification) fail('public registry verification description is missing');
if (!serviceVersion) fail('Could not parse SERVICE_RELEASE');

// public/product-facts.json is the authority for what is already verified in public registries.
// RELEASE_VERSION and the package manifests may be newer while a release candidate is staged.
// Do not promote install.client_version until the new registry artifacts have been clean-install verified.
const facts = {
  ...sourceFacts,
  service_release: serviceVersion,
};

if (enforceFreshness) {
  const checked = Date.parse(`${facts.pricing_snapshots.checked_at}T00:00:00Z`);
  const ageDays = (Date.now() - checked) / 86_400_000;
  if (!Number.isFinite(checked) || ageDays > facts.pricing_snapshots.max_age_days) {
    fail(`Public pricing snapshots are stale: checked_at=${facts.pricing_snapshots.checked_at}, max_age_days=${facts.pricing_snapshots.max_age_days}`);
  }
}

const generatedTs = `// AUTO-GENERATED by scripts/sync-public-surfaces.mjs from public/product-facts.json and release manifests.\n// Do not edit this file by hand.\nexport const publicProductFacts = ${JSON.stringify(facts, null, 2)} as const;\n`;

const outputs = new Map();
outputs.set('src/public-facts.generated.ts', generatedTs);
outputs.set('docs/VERIFIED_RESULTS.md', renderVerifiedResults(facts));

const readme = replaceOrInsert(
  read('README.md'),
  'PUBLIC-FACTS',
  renderInstallSummary(facts),
  '# SeenRelay',
);
outputs.set('README.md', readme);

const clients = replaceOrInsert(
  read('clients/README.md'),
  'PUBLIC-FACTS',
  renderInstallSummary(facts),
  '# SeenRelay deterministic client wrappers',
);
outputs.set('clients/README.md', clients);

const quickstart = replaceOrInsert(
  read('docs/QUICKSTART.md'),
  'PUBLIC-INSTALL',
  renderQuickstartSummary(facts),
  '# SeenRelay Quickstart',
);
outputs.set('docs/QUICKSTART.md', quickstart);

let drift = false;
for (const [rel, expected] of outputs) {
  const absolute = path.join(root, rel);
  const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  if (current === expected) continue;
  drift = true;
  if (writeMode) {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, expected);
    console.log(`updated ${rel}`);
  } else {
    console.error(`public surface drift: ${rel}`);
  }
}

if (drift && !writeMode) {
  console.error('Run: node scripts/sync-public-surfaces.mjs --write');
  process.exit(1);
}

console.log(`Public facts synchronized: service ${serviceVersion}, source clients ${releaseVersion}, public verified clients ${publicClientVersion}, benchmark facts ${facts.verified_benchmarks.length}.`);
