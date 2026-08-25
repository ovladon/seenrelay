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
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/">Home</a><a href="/openapi.json">OpenAPI</a><a href="/service.json">Machine JSON</a><a href="/data-practices">Data</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">INTEGRATION QUICKSTART</div>
<h1>Add one cheap question before expensive revalidation.</h1>
<p class="lead">Keep your existing source-validation policy. CHECK first. Reuse only when your policy permits it. If you validate independently anyway, OBSERVE the result for the next agent.</p>
<div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay/blob/main/docs/QUICKSTART.md">Full quickstart</a><a class="secondary" href="/openapi.json">REST / OpenAPI</a><a class="secondary" href="/mcp">MCP endpoint</a></div>
<div class="contract"><span>Registry</span><b>io.github.ovladon/seenrelay</b><span>No account · no API key · bootstrap billing off</span></div>
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

<section class="section split decision">
<div><div class="eyebrow">PILOT</div><h2>Four stages, measurable exit criteria.</h2><p><b>1. Baseline:</b> measure repeated browser, API, search, model, human-review, latency and cost.</p><p><b>2. Shadow:</b> call CHECK but keep every existing validation.</p><p><b>3. Bounded reuse:</b> allow reuse only for approved fact classes and freshness windows.</p><p><b>4. Measure:</b> qualified reuse, avoided work, latency/cost saved and policy incidents.</p></div>
<div class="proof-grid"><article><b>Expand when</b><span>Measured avoided downstream work exceeds integration and operating cost.</span></article><article><b>Stop when</b><span>False convergence, policy risk or operational complexity outweighs savings.</span></article><article><b>Conservative outcomes</b><span>UNKNOWN, STALE and CONTESTED mean continue with the validation you already planned.</span></article><article><b>No truth oracle</b><span>SAME_OBSERVED and CHANGED_OBSERVED are observations; your application decides what they permit.</span></article></div>
</section>

<section class="section final"><div><div class="eyebrow">IMPLEMENT</div><h2>Copy the complete examples and fact-identity rules.</h2></div><div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay/blob/main/docs/QUICKSTART.md">Open Quickstart</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/PROTOCOL.md">Protocol</a></div></section>
</main>
<footer><span>SeenRelay</span><span>Observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · CHECK · OBSERVE</span></footer>
</body>
</html>`;
}
