import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const facts=JSON.parse(read('public','product-facts.json'));
test('canonical public facts drive install and measured-result surfaces',()=>{
  assert.equal(facts.install.npm_command,'npm install seenrelay');
  assert.equal(facts.install.pypi_command,'pip install seenrelay');
  assert.ok(facts.verified_benchmarks.some(b=>b.id==='firecrawl-json-extraction-2026-08-26'));
  assert.ok(facts.verified_benchmarks.some(b=>b.id==='firecrawl-browser-interaction-2026-08-26'));
  for(const file of ['README.md','clients/README.md','docs/QUICKSTART.md']){
    const t=read(...file.split('/')); assert.match(t,/BEGIN GENERATED:/); assert.match(t,/npm install seenrelay/); assert.match(t,/pip install seenrelay/);
  }
});
test('runtime consumes canonical facts and exposes machine facts',()=>{
  const pub=read('src','public.ts'), ad=read('src','adoption.ts'), q=read('src','quickstart.ts'), landing=read('src','landing.ts'), integrations=read('src','integrations.ts'), e=read('src','economics.ts'), i=read('src','index.ts');
  assert.match(pub,/publicInstallHtml\(\)/); assert.match(pub,/verifiedBenchmarkHtml\(\)/); assert.match(pub,/verifiedWorkloadMapHtml\(\)/); assert.match(pub,/latestVerifiedHtml\(\)/);
  assert.match(ad,/machinePublicFactsText\(origin\)/);
  assert.match(q,/publicProductFacts\.install\.client_version/);
  assert.match(landing,/f\.install\.npm_command/); assert.match(landing,/f\.install\.pypi_command/);
  assert.match(integrations,/publicProductFacts\.install\.client_version/);
  assert.match(q,/siteFooterHtml\(\)/); assert.match(integrations,/siteFooterHtml\(\)/);
  assert.match(e,/verifiedBenchmarkHtml\(\)/); assert.match(i,/\/product-facts\.json/);
  assert.doesNotMatch(pub+ad+q+landing+integrations+e,/Firecrawl Pay As You Go/);
});
test('CI and daily monitor fail on drift or stale pricing',()=>{
  const pkg=JSON.parse(read('package.json')); assert.match(pkg.scripts.check,/public:sync:check/);
  const w=read('.github','workflows','public-facts-freshness.yml'); assert.match(w,/--enforce-freshness/); assert.match(w,/permissions:\n  contents: read/); assert.doesNotMatch(w,/contents: write/);
});
