import { publicProductFacts } from './public-facts.generated.js';
import { verifiedBenchmarkHtml } from './public-facts-view.js';

export function economicsPage(origin: string): string {
  const prices = publicProductFacts.pricing_snapshots;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Concrete fleet-level economics for using SeenRelay before repeated paid search, scraping, browser extraction and other expensive fact revalidation.">
<link rel="canonical" href="${origin}/economics">
<meta property="og:type" content="website">
<meta property="og:title" content="SeenRelay economics — pay once for validation work when evidence can be reused">
<meta property="og:description" content="Measure whether a cheap SeenRelay CHECK can avoid repeated paid validation across an agent fleet.">
<meta property="og:url" content="${origin}/economics">
<title>SeenRelay — Fleet economics</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/">Home</a><a href="/quickstart">Quickstart</a><a href="/clients">Clients</a><a href="/service.json">Machine JSON</a></nav></header>
<main>
<section class="hero">
<div class="eyebrow">FLEET-LEVEL COST AVOIDANCE</div>
<h1>Stop paying to revalidate the same fact across your agent fleet.</h1>
<p class="lead">Put a SeenRelay <b>CHECK</b> before repeated paid or slow validation. When recent matching evidence meets your policy, skip the expensive operation. Otherwise validate exactly as you do today, then <b>OBSERVE</b> the independently obtained result for the next run or agent.</p>
<div class="cta"><a class="primary" href="/quickstart">Add it to a validation path</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/ECONOMICS_LAB.md">Run Shadow Proof</a><a class="secondary" href="/clients">Client options</a></div>
<div class="contract"><span>SeenRelay API fee</span><b>Currently $0</b><span>Measure first · reuse remains caller policy</span></div>
</section>
${verifiedBenchmarkHtml()}

<section class="section decision">
<div class="section-head"><div><div class="eyebrow">USE IT WHERE THE MATH CAN WIN</div><h2>Best fit: validation work with a visible marginal cost.</h2></div><p>SeenRelay is a preflight, not a replacement for every fetch. The protected operation should cost meaningfully more than CHECK and should repeat across runs, workers or agents.</p></div>
<div class="proof-grid"><article><b>Paid web search</b><span>Search tool calls that are billed per request and repeat the same fact validation.</span></article><article><b>Metered scraping</b><span>Commercial scrape, proxy or fetch credits spent re-reading the same source-backed fact.</span></article><article><b>Browser / extraction</b><span>Headless browser, render or extraction work that can be skipped when policy accepts recent evidence.</span></article><article><b>Multi-step validation</b><span>Fetch → render → parse → model or other chains where one reusable observation can prevent the full downstream path.</span></article></div>
<div class="trust-note"><b>Poor fit:</b> a cheap one-off GET, a fact that almost never repeats, or a policy that requires authoritative live source confirmation on every call.</div>
</section>

<section class="section split">
<div><div class="eyebrow">THE FLEET FORMULA</div><h2>Aggregate repetition is the opportunity.</h2><p>Let <b>N</b> be protected validations, <b>C</b> the marginal cost of one full validation and <b>r</b> the measured share of calls whose recent matching evidence your policy would actually reuse.</p><p>When the provider charge is purely usage-based and SeenRelay's current API fee is zero, the first-order direct provider-spend model is:</p></div>
<div class="terminal"><pre>without SeenRelay ≈ N × C

with reusable evidence ≈ N × (1 - r) × C

gross provider spend avoided ≈ N × r × C

Then subtract your own CHECK network/compute overhead
and any fixed plan minimums.</pre></div>
</section>

<section class="section decision">
<div class="section-head"><div><div class="eyebrow">CONCRETE LIST-PRICE ARITHMETIC</div><h2>100,000 repeated validations · 30% measured reusable.</h2></div><p>Illustrative arithmetic using public provider prices checked ${prices.checked_at}. That 30% is an illustration, not a promised hit rate. Shadow Proof must measure your workload first.</p></div>
<div class="proof-grid"><article><b>OpenAI Web Search</b><span>$${prices.openai_web_search.price_usd_per_1000_calls} / 1,000 calls. Dollar savings remain illustrative until the caller measures its own reuse rate.</span></article><article><b>Firecrawl basic scrape</b><span>${prices.firecrawl.basic_scrape_credits_per_page} credit per page. The measured basic-scrape smoke test avoided provider credits but lost on latency versus Firecrawl's own cache.</span></article><article><b>Firecrawl JSON extraction</b><span>${prices.firecrawl.json_extraction_total_credits_per_page} credits per full extraction. In the measured n=3 smoke benchmark, 3 eligible reuses avoided 15 credits and cut median latency from 1.266 s fresh / 1.040 s provider-cached to 0.618 s.</span></article><article><b>Fixed-tier counterexample</b><span>Firecrawl Standard snapshot: $${prices.firecrawl.standard_plan_usd_per_month_billed_yearly}/month billed yearly for ${prices.firecrawl.standard_plan_credits_per_month.toLocaleString()} credits. Avoided credits lower the invoice only if they change tier, overage or required capacity.</span></article></div>
<div class="trust-note">Price sources are stored with verification dates in <a href="/product-facts.json">product-facts.json</a>. Provider pricing can change; use your invoice for production decisions. Examples exclude SeenRelay network/compute overhead, taxes, fixed plan minimums and unmeasured conditional-request savings.</div>
</section>

<section class="section split decision">
<div><div class="eyebrow">RIDICULOUSLY SMALL INTEGRATION</div><h2>Bind once. One line per revalidation after that.</h2><p>The deterministic clients bind SeenRelay around one existing fixed-fact validation. With no reuse policy they are automatically shadow mode: CHECK runs, your original validation still runs, and OBSERVE records the independent result.</p><p>After measurement, adding a caller-approved reuse policy can allow matching recent evidence to suppress the expensive validation.</p></div>
<div class="terminal"><div class="terminal-top"><span></span><span></span><span></span><b>JavaScript / TypeScript</b></div><pre>const validatePrice = relay.protectValidation({
  fact,
  validate: ({ conditionalHeaders }) =&gt;
    expensiveValidation(conditionalHeaders)
});

const value = await validatePrice(knownValue);</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">PYTHON</div><h2>The same bind-once pattern.</h2><p>The Python helper keeps the same semantics and uses only the standard library.</p></div>
<div class="terminal"><pre>from seenrelay_easy import protect_validation

validate_price = protect_validation(
    relay,
    fact=fact,
    validate=lambda ctx:
        expensive_validation(ctx.conditional_headers),
)

value = validate_price(known_value)</pre></div>
</section>

<section class="section split decision">
<div><div class="eyebrow">FOR AGENT FLEETS</div><h2>One agent's necessary validation can become another agent's avoided spend.</h2><p>A fleet does not need an external public network to start. The first run validates normally and OBSERVEs. Later runs in the same integration or fleet can CHECK that evidence. External observations expand coverage later.</p><p>The larger the fleet and the more duplicated the validation workload, the larger the aggregate opportunity — provided the measured reuse rate remains above your latency and cost break-even thresholds.</p></div>
<div class="proof-grid"><article><b>Agent A</b><span>CHECK → UNKNOWN → paid validation → OBSERVE.</span></article><article><b>Agent B</b><span>Same fact soon after → CHECK sees recent matching evidence.</span></article><article><b>Policy accepts</b><span>Skip the paid validation and reuse the already-known value.</span></article><article><b>Policy rejects</b><span>Validate normally. SeenRelay fails open and does not weaken the source policy.</span></article></div>
</section>

<section class="section final"><div><div class="eyebrow">PROVE IT ON YOUR BILL</div><h2>Run shadow mode first. Keep SeenRelay only where your own workload shows positive value.</h2></div><div class="cta"><a class="primary" href="/quickstart">Implement the preflight</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/ECONOMICS_LAB.md">Economics Lab</a></div></section>
</main>
<footer><span>SeenRelay</span><span>Recent observations, not universal truth.</span><span><a href="/data-practices">Data practices</a> · CHECK · OBSERVE</span></footer>
</body>
</html>`;
}
