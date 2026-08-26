import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(root, rel), text);
const replaceExact = (text, from, to, label) => {
  if (!text.includes(from)) throw new Error(`Expected ${label} text not found`);
  return text.replace(from, to);
};

// Canonical public facts: persist only measured evidence from the successful bounded run.
const factsPath = 'public/product-facts.json';
const facts = JSON.parse(read(factsPath));
const browser = {
  id: 'firecrawl-browser-interaction-2026-08-26',
  status: 'first_party_smoke',
  verified_at: '2026-08-26T11:50:57.487Z',
  provider: 'Firecrawl',
  workload: 'fixed-URL browser interaction using scrape + interact(code) + stop',
  samples: 3,
  freshness_window_seconds: 3600,
  baseline_provider_calls: 3,
  baseline_median_ms: 4385.018,
  reuse_provider_calls: 0,
  reuse_median_ms: 661.372,
  provider_calls_avoided: 3,
  provider_credits_avoided: 9,
  latency_improvement_percent: 84.9,
  provider_credit_model: 'Each measured direct validation used 1 scrape credit plus 2 Firecrawl-reported interact credits in this run.',
  economic_result: 'lower provider-credit consumption on every eligible reuse in this run',
  latency_result: 'lower median latency than the full browser-validation path in this run',
  evidence_url: 'https://github.com/ovladon/seenrelay/actions/runs/32965390611',
  artifact_digest: 'sha256:51ebee97e40dee759a49d3171e03fc7c5f7cf344411fbd7dede6c941640d3df3',
  caveat: 'First-party smoke benchmark, n=3, on one intentionally repeated source-backed fact. It demonstrates the mechanics and measured savings when eligible reuse exists; it does not establish a natural-world reuse rate or a universal browser-workload speedup.'
};
facts.verified_benchmarks = facts.verified_benchmarks.filter((b) => b.id !== browser.id).concat(browser);
const browserUpdate = {
  date: '2026-08-26',
  title: 'Measured browser-interaction savings',
  summary: 'In a first-party n=3 Firecrawl browser-interaction smoke benchmark, bounded reuse avoided 3/3 equivalent provider calls, 9 reported provider credits, and reduced median validation latency from 4.385 s to 0.661 s.'
};
facts.latest_verified_updates = facts.latest_verified_updates.filter((u) => u.title !== browserUpdate.title);
facts.latest_verified_updates.splice(2, 0, browserUpdate);
facts.updated_at = '2026-08-26T11:50:57Z';
write(factsPath, `${JSON.stringify(facts, null, 2)}\n`);

// Shared human-facing renderers.
let view = read('src/public-facts-view.ts');
if (!view.includes('export function verifiedWorkloadMapHtml')) {
  const marker = '\nexport function machinePublicFactsText(origin: string): string {';
  if (!view.includes(marker)) throw new Error('public-facts-view insertion marker missing');
  const addition = `
export function verifiedWorkloadMapHtml(): string {
  const byId = new Map(publicProductFacts.verified_benchmarks.map((item) => [item.id, item]));
  const jsonExtraction = byId.get('firecrawl-json-extraction-2026-08-26');
  const browser = byId.get('firecrawl-browser-interaction-2026-08-26');
  const basic = byId.get('firecrawl-basic-scrape-2026-08-26');
  if (!jsonExtraction || !browser || !basic) return '';

  return \`<section class="section decision" id="workload-map">
<div class="section-head"><div><div class="eyebrow">WHERE THE ECONOMICS HAVE HELD UP SO FAR</div><h2>Use the evidence, not a generic promise.</h2></div><p>These are small first-party smoke benchmarks on intentionally repeated source-backed facts. They show what happened when eligible reuse existed; they do not predict how often your own fleet will produce reusable matches.</p></div>
<div class="proof-grid">
<article><b>Structured JSON extraction · cost ↓ latency ↓</b><span>\${esc(jsonExtraction.provider_calls_avoided)}/\${esc(jsonExtraction.samples)} equivalent provider calls and \${esc(jsonExtraction.provider_credits_avoided)} credits avoided; median \${esc(jsonExtraction.fresh_baseline_median_ms)} ms fresh → \${esc(jsonExtraction.reuse_median_ms)} ms SeenRelay reuse.</span></article>
<article><b>Browser interaction · cost ↓ latency ↓</b><span>\${esc(browser.provider_calls_avoided)}/\${esc(browser.samples)} equivalent provider calls and \${esc(browser.provider_credits_avoided)} reported credits avoided; median \${esc(browser.baseline_median_ms)} ms full browser validation → \${esc(browser.reuse_median_ms)} ms SeenRelay reuse.</span></article>
<article><b>Basic cached scrape · cost ↓ latency ↑</b><span>\${esc(basic.baseline_provider_calls - basic.reuse_provider_calls)}/\${esc(basic.samples)} equivalent provider calls and \${esc(basic.provider_credits_avoided)} credits avoided, but the provider cache was faster (\${esc(basic.baseline_median_ms)} ms vs \${esc(basic.reuse_median_ms)} ms).</span></article>
<article><b>Cheap one-off fetch · poor fit</b><span>Do not add a network preflight where the operation is already cheap and unlikely to repeat. The Economics Lab keeps this negative control deliberately.</span></article>
</div>
<div class="trust-note"><a href="/economics">See the measurement rules, evidence and break-even logic →</a></div>
</section>\`;
}

export function siteFooterHtml(): string {
  const currentYear = new Date().getUTCFullYear();
  const copyrightYears = currentYear > 2026 ? \`2026–\${currentYear}\` : '2026';
  return \`<footer><span>© \${copyrightYears} SeenRelay. All rights reserved.</span><span>Recent observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · <a href="https://github.com/ovladon/seenrelay/blob/main/clients/LICENSE">Client libraries: MIT License</a> · CHECK · OBSERVE</span></footer>\`;
}
`;
  view = view.replace(marker, `\n${addition}${marker}`);
}
view = replaceExact(
  view,
  "  const negative = f.verified_benchmarks.find((item) => item.id === 'firecrawl-basic-scrape-2026-08-26');\n  const benchmark = b && 'provider_calls_avoided' in b",
  "  const negative = f.verified_benchmarks.find((item) => item.id === 'firecrawl-basic-scrape-2026-08-26');\n  const browser = f.verified_benchmarks.find((item) => item.id === 'firecrawl-browser-interaction-2026-08-26');\n  const benchmark = b && 'provider_calls_avoided' in b",
  'machine benchmark lookup',
);
view = replaceExact(
  view,
  "  const counterexample = negative\n    ? `- Counterexample: basic Firecrawl scrape reuse avoided credits but was slower than the provider cache (${negative.baseline_median_ms} ms baseline vs ${negative.reuse_median_ms} ms SeenRelay). Do not use SeenRelay for cheap/fast work when the preflight cannot win.`\n    : '';",
  "  const browserResult = browser && 'provider_calls_avoided' in browser\n    ? `- First-party Firecrawl browser-interaction smoke benchmark (n=${browser.samples}, ${browser.freshness_window_seconds}s caller freshness window): ${browser.provider_calls_avoided}/${browser.samples} equivalent provider calls avoided, ${browser.provider_credits_avoided} reported provider credits avoided, median ${browser.baseline_median_ms} ms full browser validation -> ${browser.reuse_median_ms} ms bounded reuse. This is not a promised natural-world reuse rate.`\n    : '';\n  const counterexample = negative\n    ? `- Counterexample: basic Firecrawl scrape reuse avoided credits but was slower than the provider cache (${negative.baseline_median_ms} ms baseline vs ${negative.reuse_median_ms} ms SeenRelay). Do not use SeenRelay for cheap/fast work when the preflight cannot win.`\n    : '';",
  'machine browser result',
);
view = replaceExact(view, '${benchmark}\\n${counterexample}', '${benchmark}\\n${browserResult}\\n${counterexample}', 'machine result output');
write('src/public-facts-view.ts', view);

// Human pages consume the same workload map/footer components.
let pub = read('src/public.ts');
pub = replaceExact(pub,
  "import { latestVerifiedHtml, productFactsForOrigin, publicInstallHtml, verifiedBenchmarkHtml } from './public-facts-view.js';",
  "import { latestVerifiedHtml, productFactsForOrigin, publicInstallHtml, siteFooterHtml, verifiedBenchmarkHtml, verifiedWorkloadMapHtml } from './public-facts-view.js';",
  'public import',
);
pub = replaceExact(pub, '${verifiedBenchmarkHtml()}\n${latestVerifiedHtml()}', '${verifiedBenchmarkHtml()}\n${verifiedWorkloadMapHtml()}\n${latestVerifiedHtml()}', 'workload map placement');
pub = pub.replace('<footer><span>SeenRelay</span><span>Recent observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · CHECK · OBSERVE</span></footer>', '${siteFooterHtml()}');
write('src/public.ts', pub);

const pages = [
  ['src/quickstart.ts', "import { publicInstallHtml } from './public-facts-view.js';", "import { publicInstallHtml, siteFooterHtml } from './public-facts-view.js';"],
  ['src/adoption.ts', "import { machinePublicFactsText, publicInstallHtml } from './public-facts-view.js';", "import { machinePublicFactsText, publicInstallHtml, siteFooterHtml } from './public-facts-view.js';"],
  ['src/economics.ts', "import { verifiedBenchmarkHtml } from './public-facts-view.js';", "import { siteFooterHtml, verifiedBenchmarkHtml } from './public-facts-view.js';"],
];
for (const [file, oldImport, newImport] of pages) {
  let text = replaceExact(read(file), oldImport, newImport, `${file} import`);
  text = text.replace(/<footer><span>SeenRelay<\/span><span>(?:Recent observations|Observations), not universal truth\.<\/span><span><a href="\/data-practices">Data practices<\/a> · CHECK · OBSERVE<\/span><\/footer>/, '${siteFooterHtml()}');
  if (!text.includes('${siteFooterHtml()}')) throw new Error(`${file} footer replacement failed`);
  write(file, text);
}

// Generated results know how to render the browser row.
let sync = read('scripts/sync-public-surfaces.mjs');
sync = replaceExact(sync,
  "    if (b.id.includes('json-extraction')) {\n      return `| ${b.provider} JSON structured extraction | first-party smoke, n=${b.samples} | ${b.provider_calls_avoided}/${b.samples} provider calls avoided; ${b.provider_credits_avoided} credits avoided | ${b.fresh_baseline_median_ms} ms fresh; ${b.provider_cached_baseline_median_ms} ms provider-cached | ${b.reuse_median_ms} ms | ${b.freshness_window_seconds}s |`;\n    }\n    return `| ${b.provider} basic scrape | first-party smoke, n=${b.samples} | ${b.baseline_provider_calls - b.reuse_provider_calls}/${b.samples} provider calls avoided; ${b.provider_credits_avoided} credits avoided | ${b.baseline_median_ms} ms | ${b.reuse_median_ms} ms | ${b.freshness_window_seconds}s |`;",
  "    if (b.id.includes('json-extraction')) {\n      return `| ${b.provider} JSON structured extraction | first-party smoke, n=${b.samples} | ${b.provider_calls_avoided}/${b.samples} provider calls avoided; ${b.provider_credits_avoided} credits avoided | ${b.fresh_baseline_median_ms} ms fresh; ${b.provider_cached_baseline_median_ms} ms provider-cached | ${b.reuse_median_ms} ms | ${b.freshness_window_seconds}s |`;\n    }\n    if (b.id.includes('browser-interaction')) {\n      return `| ${b.provider} browser interaction | first-party smoke, n=${b.samples} | ${b.provider_calls_avoided}/${b.samples} provider calls avoided; ${b.provider_credits_avoided} credits avoided | ${b.baseline_median_ms} ms | ${b.reuse_median_ms} ms | ${b.freshness_window_seconds}s |`;\n    }\n    return `| ${b.provider} basic scrape | first-party smoke, n=${b.samples} | ${b.baseline_provider_calls - b.reuse_provider_calls}/${b.samples} provider calls avoided; ${b.provider_credits_avoided} credits avoided | ${b.baseline_median_ms} ms | ${b.reuse_median_ms} ms | ${b.freshness_window_seconds}s |`;",
  'verified results renderer',
);
sync = replaceExact(sync,
  'The basic scrape benchmark demonstrated lower provider-credit consumption but worse latency than a Firecrawl cache hit. The JSON structured-extraction benchmark demonstrated both lower provider-credit consumption and lower median latency in this small first-party run. Neither benchmark establishes a universal reuse rate. A caller must measure its own workload in shadow mode and set its own freshness/reuse policy.',
  'The basic scrape benchmark demonstrated lower provider-credit consumption but worse latency than a Firecrawl cache hit. The JSON structured-extraction and browser-interaction benchmarks demonstrated both lower provider-credit consumption and lower median latency in these small first-party runs. None of these benchmarks establishes a universal reuse rate. A caller must measure its own workload in shadow mode and set its own freshness/reuse policy.',
  'verified interpretation',
);
write('scripts/sync-public-surfaces.mjs', sync);

// Regression coverage.
let pf = read('tests/public-facts-sync.test.mjs');
pf = replaceExact(pf,
  "  assert.ok(facts.verified_benchmarks.some(b=>b.id==='firecrawl-json-extraction-2026-08-26'));",
  "  assert.ok(facts.verified_benchmarks.some(b=>b.id==='firecrawl-json-extraction-2026-08-26'));\n  assert.ok(facts.verified_benchmarks.some(b=>b.id==='firecrawl-browser-interaction-2026-08-26'));",
  'public facts browser assertion',
);
pf = replaceExact(pf,
  '  assert.match(pub,/publicInstallHtml\\(\\)/); assert.match(pub,/verifiedBenchmarkHtml\\(\\)/); assert.match(pub,/latestVerifiedHtml\\(\\)/);',
  '  assert.match(pub,/publicInstallHtml\\(\\)/); assert.match(pub,/verifiedBenchmarkHtml\\(\\)/); assert.match(pub,/verifiedWorkloadMapHtml\\(\\)/); assert.match(pub,/latestVerifiedHtml\\(\\)/);',
  'public map assertion',
);
write('tests/public-facts-sync.test.mjs', pf);

let ep = read('tests/economics-positioning.test.mjs');
ep = replaceExact(ep,
  '  assert.equal(jsonBenchmark.samples, 3);',
  "  assert.equal(jsonBenchmark.samples, 3);\n  const browserBenchmark = facts.verified_benchmarks.find((b) => b.id === 'firecrawl-browser-interaction-2026-08-26');\n  assert.ok(browserBenchmark);\n  assert.equal(browserBenchmark.provider_calls_avoided, 3);\n  assert.equal(browserBenchmark.provider_credits_avoided, 9);\n  assert.equal(browserBenchmark.reuse_provider_calls, 0);\n  assert.equal(browserBenchmark.samples, 3);",
  'economics browser assertion',
);
ep = replaceExact(ep,
  '  assert.match(publicView, /Counterexample matters/);',
  '  assert.match(publicView, /Counterexample matters/);\n  assert.match(publicView, /WHERE THE ECONOMICS HAVE HELD UP SO FAR/);\n  assert.match(publicView, /Browser interaction · cost ↓ latency ↓/);',
  'map copy assertion',
);
write('tests/economics-positioning.test.mjs', ep);

write('tests/site-footer.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('human pages share one accurate legal footer', () => {
  const view = read('src', 'public-facts-view.ts');
  assert.match(view, /export function siteFooterHtml/);
  assert.match(view, /© \\${copyrightYears} SeenRelay\\. All rights reserved\\./);
  assert.match(view, /Client libraries: MIT License/);
  assert.match(view, /currentYear > 2026 \\? \\`2026–\\${currentYear}\\` : '2026'/);

  for (const file of ['public.ts', 'quickstart.ts', 'adoption.ts', 'economics.ts']) {
    const text = read('src', file);
    assert.match(text, /siteFooterHtml\\(\\)/);
    assert.doesNotMatch(text, /<footer>/);
  }
});
`);

console.log('Staged canonical browser workload result, workload map, and shared footer.');
