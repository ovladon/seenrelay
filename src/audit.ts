import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function auditPage(origin: string): string {
  const version = esc(publicProductFacts.install.client_version);
  const skillCommand = `npx skills add ${origin} --skill seenrelay --yes`;
  const agentPrompt = 'Run a SeenRelay shadow audit on this project. Find repeated expensive read-only validations, preserve every authoritative call, keep stronger local/source/provider-native controls ahead of SeenRelay, do not enable active reuse, and report: exact workload identity, protected-call count, exact repeats, native-control hits, SAME_OBSERVED/UNKNOWN/other CHECK outcomes where measured, mismatches, authoritative baseline latency/cost, prospective SeenRelay latency/cost, and a final USE / DO NOT USE / INSUFFICIENT EVIDENCE verdict. Do not expose raw values, credentials, private fact identities or sensitive payloads.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Measure whether an agent fleet is repeating expensive read-only validation without disabling the authoritative calls. Free, no account and no API key.">
<link rel="canonical" href="${origin}/audit">
<title>SeenRelay — Free validation waste audit</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/revamp-factual.css">
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links"><a href="/">Home</a><a href="/audit">Free audit</a><a href="/fleet">Fleet</a><a href="/quickstart">Quickstart</a><a href="/trust">Trust</a></nav>
  <div class="rv-nav-actions"><a class="rv-chip" href="/service.json">Machine JSON</a><a class="rv-button" href="#start">Run the audit</a></div>
</header>
<main>
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">FREE SHADOW AUDIT · CLIENT ${version}</div>
  <h1>Find out whether your agent fleet is paying twice for the same validation.</h1>
  <p>SeenRelay can measure repeated expensive read-only validation while every original authoritative call still runs. No account, API key or active reuse is required. If a native cache, ETag, provider cache or other stronger path already solves the workload more cheaply, the correct result is to leave SeenRelay out.</p>
  <div class="rv-proofline" aria-label="Audit guarantees"><span>authoritative calls stay on</span><span>active reuse off</span><span>local report</span><span>free</span><span>no account</span><span>no API key</span></div>
  <div class="rv-actions"><a class="rv-button primary" href="#start">Audit one workload</a><a class="rv-button" href="/economics">How the economics are judged</a></div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">WHAT THE AUDIT ANSWERS</div><h2>One question: is there objective validation waste worth removing?</h2><p>The audit is deliberately allowed to return a negative result. It measures the workload before any suppression is authorized.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">01</span><h3>Does the exact work repeat?</h3><p>Count deterministic repeated read-only validations across the real workload instead of assuming a hit rate from a benchmark.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Does a native path already win?</h3><p>Check local state, source-native validators and provider-native caching first. SeenRelay does not claim work those mechanisms already avoid.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Would reuse be safe and cheaper?</h3><p>Keep authoritative validation running, compare the hypothetical result, and only consider a bounded reuse path when safety and net economics both hold.</p></article>
  </div>
</section>

<section class="rv-shell rv-section" id="start">
  <div class="rv-section-head"><div class="rv-eyebrow">START IN MINUTES</div><h2>Use a coding agent or wrap one supported tool boundary.</h2><p>Do not instrument an entire application first. Pick one expensive repeated read-only validation path and run the workload normally.</p></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>Coding agent</b><span>LOWEST FRICTION</span></header><div class="rv-code"><pre>${esc(skillCommand)}</pre></div><div class="rv-code"><pre>${esc(agentPrompt)}</pre></div><p>The skill must preserve the existing authoritative path and may conclude that SeenRelay is not useful for the workload.</p></article>
    <article class="rv-choice"><header><b>Existing MCP-style client</b><span>SHADOW ONLY</span></header><div class="rv-code"><pre>npm install seenrelay

import { ambientMcpClient } from 'seenrelay/ambient';
const client = ambientMcpClient(rawMcpClient);

// run the existing workload normally
console.log(client.seenRelayAmbient.getReport());</pre></div><div class="rv-code"><pre>pip install seenrelay

from seenrelay_ambient import ambient_mcp_client
client = ambient_mcp_client(raw_mcp_client)

# run the existing workload normally
print(client.get_report())</pre></div></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">REPORT CONTRACT</div><h2>A useful audit ends with a decision, not a dashboard.</h2><p>For a candidate workload, retain only the evidence necessary to decide whether the optimization belongs there. Raw private values are not required for the public relay.</p></div>
  <div class="rv-contract-list">
    <article><b>Workload and sample</b><span>Exact eligible workload identity, protected-call count and exact-repeat count.</span></article>
    <article><b>Best-native control</b><span>How often local/source/provider-native mechanisms already avoid the same authoritative work.</span></article>
    <article><b>Safety</b><span>Hypothetical reuse agreement/mismatch evidence while the authoritative result still runs.</span></article>
    <article><b>Economics</b><span>Measured authoritative baseline versus prospective SeenRelay overhead/cost under the same semantics.</span></article>
    <article><b>Verdict</b><span>USE, DO NOT USE or INSUFFICIENT EVIDENCE for that workload. No universal hit-rate claim.</span></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div class="rv-eyebrow">WHEN TO STOP</div><h2>A negative result is a successful audit.</h2><p>Leave SeenRelay out when exact repetition is sparse, the operation is cheap, a stronger native mechanism already answers the same question, freshness policy requires a live validation every time, or hypothetical reuse does not match the authoritative outcome.</p></div>
  <div class="rv-actions"><a class="rv-button" href="/fleet">If the audit is positive: fleet deployment</a><a class="rv-button quiet" href="/data-practices">Data practices →</a></div>
</section>

<section class="rv-shell rv-final"><div><div class="rv-eyebrow">NO NETWORK EFFECT REQUIRED</div><h2>Measure first. Keep only what earns its place.</h2><p>Caller-owned local/private reuse and source-native confirmation can create value before shared CHECK has useful coverage. Shared evidence remains optional.</p></div><div class="rv-actions"><a class="rv-button primary" href="#start">Run the free audit</a><a class="rv-button" href="/quickstart">Full quickstart</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
