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

<section class="section split decision">
<div><div class="eyebrow">COLD START</div><h2>Useful before broad network coverage exists.</h2><p><b>1. Empty network:</b> CHECK returns UNKNOWN and the existing validation continues.</p><p><b>2. First observation:</b> after normal source validation, the caller sends OBSERVE.</p><p><b>3. Later callers:</b> subsequent agents can see the recent observation before repeating the same validation.</p><p><b>4. Broader coverage:</b> external observations add more reusable freshness without changing the integration.</p></div>
<div class="proof-grid"><article><b>Shadow first</b><span>Call CHECK while initially keeping every existing validation.</span></article><article><b>Measure directly</b><span>Record status distribution, latency and downstream operations actually skipped.</span></article><article><b>Conservative outcomes</b><span>UNKNOWN, STALE and CONTESTED mean continue with the validation you already planned.</span></article><article><b>Caller policy</b><span>SAME_OBSERVED and CHANGED_OBSERVED are evidence; your application decides what they permit.</span></article></div>
</section>

<section class="section final"><div><div class="eyebrow">IMPLEMENT</div><h2>Copy the complete examples and fact-identity rules.</h2></div><div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay/blob/main/docs/QUICKSTART.md">Open Quickstart</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/PROTOCOL.md">Protocol</a></div></section>
</main>
<footer><span>SeenRelay</span><span>Observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · CHECK · OBSERVE</span></footer>
</body>
</html>`;
}
