import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

export function economicsPage(origin: string): string {
  const prices = publicProductFacts.pricing_snapshots;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Measure whether repeated read-only agent validation costs enough, repeats enough and stays stable enough for SeenRelay to produce net savings.">
<link rel="canonical" href="${origin}/economics">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay economics — prove savings on your workload">
<meta property="og:description" content="Shadow the real workload first. Count recurrence, authoritative validation cost, stronger native controls and SeenRelay overhead before enabling reuse.">
<meta property="og:url" content="${origin}/economics">
<title>SeenRelay — Workload economics</title>
<link rel="stylesheet" href="/site.css">
<link rel="stylesheet" href="/legacy-readable.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/fleet">Product</a><a href="/quickstart">Quickstart</a><a href="/clients">Integrations</a><a href="/trust">Trust</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">MEASURED COST AVOIDANCE</div>
<h1>Prove the savings before you enable reuse.</h1>
<p class="lead">SeenRelay targets one narrow economic problem: agents repeatedly paying money, latency or constrained capacity to validate the same deterministic read-only state. Shadow mode keeps every authoritative call enabled while you measure whether a cheaper safe path exists.</p>
<div class="cta"><a class="primary" href="/quickstart">Run the shadow audit</a><a class="secondary" href="/fleet">See the runtime</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/ECONOMICS_LAB.md">Economics Lab</a></div>
<div class="contract"><span>SeenRelay API fee today</span><b>$0</b><span>Do not enable reuse unless measured net economics are positive</span></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">THE DECISION EQUATION</div><h2>Reuse rate alone is not enough.</h2><p>Let <b>N</b> be protected validations, <b>C</b> the marginal cost of a full authoritative validation, <b>r</b> the measured fraction that policy can safely reuse, and <b>H</b> the per-call overhead of the cheaper path. Count provider spend, latency and constrained capacity only when they matter to the workload.</p></div>
<div class="terminal"><pre>baseline cost ≈ N × C

reuse-path cost ≈ N × H + N × (1 - r) × C

net avoided cost ≈ N × r × C - N × H

Use SeenRelay only when:
  measured net avoided cost > integration + operating cost
  AND outcome equivalence remains acceptable.</pre></div>
</section>

<section class="section decision">
<div class="section-head"><div><div class="eyebrow">WHERE THE MATH CAN WIN</div><h2>Protect expensive repeated validation, not cheap requests.</h2></div><p>The best candidate is deterministic, read-only, recurrent and materially more expensive than the validation shortcut. Local, source-native and provider-native mechanisms get credit before SeenRelay.</p></div>
<div class="proof-grid"><article><b>Browser / portal validation</b><span>Headless sessions, proxy time, rendering or multi-step navigation that repeatedly establishes the same bounded state.</span></article><article><b>Metered extraction</b><span>Commercial scraping, parsing or structured extraction where each repeated validation consumes credits or capacity.</span></article><article><b>Paid search / rate-limited APIs</b><span>Repeated source-backed checks with a real per-call or opportunity cost.</span></article><article><b>Multi-step validation</b><span>Fetch → render → parse → model chains where one safe reusable result can prevent downstream work.</span></article></div>
<div class="trust-note"><b>Outside the target:</b> cheap one-off requests, mutations, low-repeat workloads, or any path already solved by an equivalent authoritative cache or source-native validator.</div>
</section>

<section class="section split decision">
<div><div class="eyebrow">NO NETWORK EFFECT REQUIRED</div><h2>The first savings can stay entirely inside one customer's fleet.</h2><p>The current local-first order is exact in-flight reuse → caller-owned encrypted private L1 → source-native confirmation → optional shared CHECK → original validation. A customer does not need other SeenRelay users before local/private/source-native savings can exist.</p><p>The public relay is an optional evidence layer, not the economic foundation of the first deployment.</p></div>
<div class="proof-grid"><article><b>Local / in-flight</b><span>Coalesce the same eligible work already happening at once.</span></article><article><b>Private L1</b><span>Reuse caller-owned encrypted state across workers or restarts under explicit freshness policy.</span></article><article><b>Source-native</b><span>Prefer ETag, Last-Modified or a stronger authoritative version mechanism when available.</span></article><article><b>Fallback</b><span>If evidence is insufficient, perform the original validation normally.</span></article></div>
</section>

<section class="section decision">
<div class="section-head"><div><div class="eyebrow">ILLUSTRATIVE COST INPUTS</div><h2>Use your invoice, not a public benchmark.</h2></div><p>Public provider prices below were checked ${prices.checked_at}. They are merely arithmetic inputs. The only evidence that matters for deployment is the customer's own measured workload.</p></div>
<div class="proof-grid"><article><b>OpenAI Web Search</b><span>$${prices.openai_web_search.price_usd_per_1000_calls} / 1,000 calls in the stored pricing snapshot. Search-content token effects are separate.</span></article><article><b>Firecrawl basic scrape</b><span>${prices.firecrawl.basic_scrape_credits_per_page} credit per page in the stored snapshot.</span></article><article><b>Firecrawl JSON extraction</b><span>${prices.firecrawl.json_extraction_total_credits_per_page} credits per full extraction in the stored snapshot.</span></article><article><b>Fixed-tier counterexample</b><span>Firecrawl Standard snapshot: $${prices.firecrawl.standard_plan_usd_per_month_billed_yearly}/month billed yearly for ${prices.firecrawl.standard_plan_credits_per_month.toLocaleString()} credits. Avoided usage changes an invoice only when it changes tier, overage or required capacity.</span></article></div>
<div class="trust-note">Pricing can change and negotiated rates differ. Production economics should use the customer's actual provider bill and observed latency/capacity constraints.</div>
</section>

<section class="section split decision">
<div><div class="eyebrow">SHADOW FIRST</div><h2>Measure one validation path before touching policy.</h2><p>The deterministic clients can sit around an existing validation without suppressing it. During the measurement window, the original call remains authoritative and the report records recurrence and prospective economics.</p><p>Only an explicit caller policy can later authorize bounded reuse.</p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>JavaScript / TypeScript</b></div><pre>const validatePrice = relay.protectValidation({
  fact,
  validate: ({ conditionalHeaders }) =&gt;
    expensiveValidation(conditionalHeaders)
});

const value = await validatePrice(knownValue);</pre></div>
</section>

<section class="section final"><div><div class="eyebrow">THE COMMERCIAL RULE</div><h2>If the workload does not save more than the layer costs, do not deploy the layer.</h2><p>The first useful outcome of SeenRelay can be a negative one: it prevents a team from adding complexity where native controls or sparse recurrence already make the economics bad.</p></div><div class="cta"><a class="primary" href="/quickstart">Measure a workload</a><a class="secondary" href="/fleet">Product details</a></div></section>
</main>
${siteFooterHtml()}
</body>
</html>`;
}
