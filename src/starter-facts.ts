import { siteFooterHtml } from './public-facts-view.js';

export const starterFacts = Object.freeze([
  {
    id: 'github-status-indicator',
    category: 'service_status',
    fact: {
      subject: 'GitHub overall status indicator',
      predicate: 'status.indicator',
      source: 'https://www.githubstatus.com/api/v2/status.json',
      locator: { scheme: 'json_pointer', value: '/status/indicator' }
    }
  },
  {
    id: 'github-status-description',
    category: 'service_status',
    fact: {
      subject: 'GitHub overall status description',
      predicate: 'status.description',
      source: 'https://www.githubstatus.com/api/v2/status.json',
      locator: { scheme: 'json_pointer', value: '/status/description' }
    }
  },
  {
    id: 'node-latest-version',
    category: 'runtime_version',
    fact: {
      subject: 'Latest Node.js release version',
      predicate: 'version.latest',
      source: 'https://nodejs.org/dist/index.json',
      locator: { scheme: 'json_pointer', value: '/0/version' }
    }
  },
  {
    id: 'pypi-openai-version',
    category: 'package_version',
    fact: {
      subject: 'Latest openai Python package version',
      predicate: 'version.latest',
      source: 'https://pypi.org/pypi/openai/json',
      locator: { scheme: 'json_pointer', value: '/info/version' }
    }
  },
  {
    id: 'pypi-anthropic-version',
    category: 'package_version',
    fact: {
      subject: 'Latest anthropic Python package version',
      predicate: 'version.latest',
      source: 'https://pypi.org/pypi/anthropic/json',
      locator: { scheme: 'json_pointer', value: '/info/version' }
    }
  },
  {
    id: 'pypi-mcp-version',
    category: 'package_version',
    fact: {
      subject: 'Latest mcp Python package version',
      predicate: 'version.latest',
      source: 'https://pypi.org/pypi/mcp/json',
      locator: { scheme: 'json_pointer', value: '/info/version' }
    }
  },
  {
    id: 'pypi-langchain-version',
    category: 'package_version',
    fact: {
      subject: 'Latest langchain Python package version',
      predicate: 'version.latest',
      source: 'https://pypi.org/pypi/langchain/json',
      locator: { scheme: 'json_pointer', value: '/info/version' }
    }
  },
  {
    id: 'pypi-llama-index-version',
    category: 'package_version',
    fact: {
      subject: 'Latest llama-index Python package version',
      predicate: 'version.latest',
      source: 'https://pypi.org/pypi/llama-index/json',
      locator: { scheme: 'json_pointer', value: '/info/version' }
    }
  },
  {
    id: 'pypi-crewai-version',
    category: 'package_version',
    fact: {
      subject: 'Latest crewai Python package version',
      predicate: 'version.latest',
      source: 'https://pypi.org/pypi/crewai/json',
      locator: { scheme: 'json_pointer', value: '/info/version' }
    }
  },
  {
    id: 'pypi-browser-use-version',
    category: 'package_version',
    fact: {
      subject: 'Latest browser-use Python package version',
      predicate: 'version.latest',
      source: 'https://pypi.org/pypi/browser-use/json',
      locator: { scheme: 'json_pointer', value: '/info/version' }
    }
  },
  {
    id: 'npm-openai-version',
    category: 'package_version',
    fact: {
      subject: 'Latest openai npm package version',
      predicate: 'version.latest',
      source: 'https://registry.npmjs.org/openai/latest',
      locator: { scheme: 'json_pointer', value: '/version' }
    }
  },
  {
    id: 'npm-anthropic-sdk-version',
    category: 'package_version',
    fact: {
      subject: 'Latest Anthropic npm SDK version',
      predicate: 'version.latest',
      source: 'https://registry.npmjs.org/@anthropic-ai%2Fsdk/latest',
      locator: { scheme: 'json_pointer', value: '/version' }
    }
  },
  {
    id: 'npm-mcp-sdk-version',
    category: 'package_version',
    fact: {
      subject: 'Latest Model Context Protocol npm SDK version',
      predicate: 'version.latest',
      source: 'https://registry.npmjs.org/@modelcontextprotocol%2Fsdk/latest',
      locator: { scheme: 'json_pointer', value: '/version' }
    }
  },
  {
    id: 'npm-vercel-ai-version',
    category: 'package_version',
    fact: {
      subject: 'Latest Vercel AI SDK npm version',
      predicate: 'version.latest',
      source: 'https://registry.npmjs.org/ai/latest',
      locator: { scheme: 'json_pointer', value: '/version' }
    }
  },
  {
    id: 'npm-google-genai-version',
    category: 'package_version',
    fact: {
      subject: 'Latest Google GenAI npm version',
      predicate: 'version.latest',
      source: 'https://registry.npmjs.org/@google%2Fgenai/latest',
      locator: { scheme: 'json_pointer', value: '/version' }
    }
  }
]);

export function starterFactsDescriptor(origin: string) {
  return {
    schema: 'seenrelay-starter-facts-v1',
    purpose: 'Canonical source-backed fact descriptors that callers may use when they already know a value and want to ask whether compatible recent observations exist.',
    semantics: {
      values_included: false,
      freshness_policy_included: false,
      automatic_reuse_authorized: false,
      truth_claim: false,
      note: 'The caller supplies its known value and max-age policy to CHECK. These descriptors only reduce fact-identity fragmentation.'
    },
    check_endpoint: `${origin}/v1/check`,
    protocol_docs: 'https://github.com/ovladon/seenrelay/blob/main/docs/PROTOCOL.md',
    facts: starterFacts
  };
}

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function starterFactsPage(origin: string): string {
  const cards = starterFacts.map((entry) => `<article class="rv-card"><span class="rv-number">${esc(entry.category)}</span><h3>${esc(entry.fact.subject)}</h3><p><code>${esc(entry.id)}</code></p><p><b>Predicate:</b> <code>${esc(entry.fact.predicate)}</code><br><b>Locator:</b> <code>${esc(entry.fact.locator.value)}</code></p><a href="${esc(entry.fact.source)}">Authoritative source →</a></article>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Canonical source-backed SeenRelay fact descriptors for known-state revalidation.">
<link rel="canonical" href="${origin}/starter-facts">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>SeenRelay — Starter facts</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/quickstart">Quickstart</a><a href="/clients">Integrations</a><a href="/trust">Trust</a></nav>
  <div class="rv-nav-actions"><a class="rv-button" href="/starter-facts.json">Machine JSON</a></div>
</header>
<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">KNOWN-STATE REVALIDATION</div>
  <h1>Describe the same public fact the same way.</h1>
  <p>SeenRelay CHECK is useful when your application already knows a value and needs to decide whether another authoritative validation is worth doing now. These canonical descriptors reduce accidental fragmentation for a small set of public source-backed facts that SeenRelay already supports with bounded first-party observations.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/starter-facts.json">Open machine-readable catalog</a><a class="rv-button" href="/quickstart">Use CHECK safely</a></div>
</section>
<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">BOUNDARY</div><h2>This is identity metadata, not a cache of answers.</h2><p>The catalog publishes no observed values, no recommended TTL and no reuse authorization. Your caller supplies the known value and its own freshness policy. SeenRelay can then report compatible recent evidence; the authoritative source remains the fallback.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>You already know X</h3><p>Keep the value your application previously obtained from the authoritative source.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>CHECK recent evidence</h3><p>Use the canonical source, predicate and locator plus your explicit max-age policy.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Validate when needed</h3><p>Unknown, stale, contested or policy-rejected evidence falls through to the source. Fresh independent validation may OBSERVE afterward.</p></article>
  </div>
</section>
<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">STARTER CATALOG</div><h2>${starterFacts.length} canonical public facts.</h2><p>These facts are intentionally narrow. The public protocol remains generic CHECK + OBSERVE; this catalog only gives independent integrations a common deterministic description for these source-backed coordinates.</p></div>
  <div class="rv-grid-3">${cards}</div>
</section>
<section class="rv-shell rv-final"><div><div class="rv-eyebrow">DO NOT GUESS</div><h2>Need another shared fact?</h2><p>Use the Fact Coordinate Kit only when a stable authoritative source and source-native locator exist. Prefer fragmentation to false convergence.</p></div><div class="rv-actions"><a class="rv-button" href="https://github.com/ovladon/seenrelay/blob/main/docs/FACT_COORDINATE_KIT.md">Fact Coordinate Kit</a><a class="rv-button" href="/trust">Trust boundary</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
