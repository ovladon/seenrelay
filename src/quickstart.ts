import { publicInstallHtml, siteFooterHtml } from './public-facts-view.js';

export function quickstartPage(origin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Integrate SeenRelay into an AI-agent workflow without replacing the workflow's existing validation policy.">
<title>SeenRelay Quickstart</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/">Home</a><a href="/clients">Clients</a><a href="/openapi.json">OpenAPI</a><a href="/service.json">Machine JSON</a><a href="/data-practices">Data</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">INTEGRATION QUICKSTART</div>
<h1>Put one cheap CHECK in front of an expensive validation.</h1>
<p class="lead">Best targets are repeated paid search, scraping, browser/extraction, rate-limited APIs and multi-step validation across an agent fleet. Start in shadow mode, measure the savings opportunity, then reuse only where your policy permits it.</p>
<div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay/blob/main/docs/QUICKSTART.md">Full quickstart</a><a class="secondary" href="/economics">Cost examples</a><a class="secondary" href="/clients">Deterministic clients</a><a class="secondary" href="/openapi.json">REST / OpenAPI</a><a class="secondary" href="/mcp">MCP endpoint</a></div>
<div class="contract"><span>Registry</span><b>io.github.ovladon/seenrelay</b><span>No account · no API key · currently free</span></div>
</section>

<section class="section split">
<div><div class="eyebrow">THE PATTERN</div><h2>Do not replace your safety policy.</h2><p>A safe first deployment is shadow mode: call CHECK before existing validations, record what it would have changed, but skip nothing. Promote only after measured results justify bounded reuse.</p><div class="flow"><span>goal</span><i>→</i><span>CHECK</span><i>→</i><span>reuse or validate</span><i>→</i><span>OBSERVE</span></div></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>MCP remote</b></div><pre>${origin}/mcp

Registry identifier:
io.github.ovladon/seenrelay

Operations:
check_fact   ✓
observe_fact ✓</pre></div>
</section>

${publicInstallHtml()}

<section class="section split decision">
<div><div class="eyebrow">DETERMINISTIC CALL PATH</div><h2>Bind once. One protected call for every later revalidation.</h2><p>MCP remains the standard discovery interface. For application code, the JavaScript and Python clients can bind SeenRelay around one existing fixed-fact validation. The first configuration names the fact and existing validator; every later call supplies only the value already known.</p><p>Relay timeout, 429, malformed output, or outage fails open into the original validation path. Shadow mode remains the default; skipping validation requires an explicit caller policy.</p></div>
<div class="proof-grid"><article><b>JavaScript / TypeScript</b><span><code>protectValidation(...)</code> binds one fixed-fact validator.</span></article><article><b>Python</b><span><code>protect_validation(...)</code> does the same with the standard library only.</span></article><article><b>Conditional hints</b><span>Safe ETag / Last-Modified hints can reach the existing validation without being trusted automatically.</span></article><article><b>Measure locally</b><span>In-process counters can quantify actual reuse and request overhead.</span></article></div>
<div class="terminal"><pre>const validatePrice = relay.protectValidation({
  fact,
  validate: ({ conditionalHeaders }) =&gt;
    expensiveValidation(conditionalHeaders)
});

// every later validation:
const value = await validatePrice(knownValue);</pre></div>
<div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay/tree/main/clients">Open clients</a><a class="secondary" href="/economics">See fleet economics</a><a class="secondary" href="/clients">Integration options</a></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">COLD START</div><h2>Useful before broad network coverage exists.</h2><p><b>1. Empty network:</b> CHECK returns UNKNOWN and the existing validation continues.</p><p><b>2. First observation:</b> after normal source validation, the caller sends OBSERVE.</p><p><b>3. Later callers:</b> subsequent agents can see the recent observation before repeating the same validation.</p><p><b>4. Broader coverage:</b> external observations add more reusable freshness without changing the integration.</p></div>
<div class="proof-grid"><article><b>Shadow first</b><span>Call CHECK while initially keeping every existing validation.</span></article><article><b>Measure directly</b><span>Record status distribution, latency and downstream operations actually skipped.</span></article><article><b>Conservative outcomes</b><span>UNKNOWN, STALE and CONTESTED mean continue with the validation you already planned.</span></article><article><b>Caller policy</b><span>SAME_OBSERVED and CHANGED_OBSERVED are evidence; your application decides what they permit.</span></article></div>
</section>

<section class="section final"><div><div class="eyebrow">IMPLEMENT</div><h2>Copy the complete examples and fact-identity rules.</h2></div><div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay/blob/main/docs/QUICKSTART.md">Open Quickstart</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/PROTOCOL.md">Protocol</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
