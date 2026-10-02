export const companyFleetCaseStudy = {
  schema: 'seenrelay-company-fleet-case-study-v1',
  verified_at: '2026-10-02',
  evidence_type: 'first_party_real_operating_workload_plus_synthetic_external_client_rehearsal',
  customer_roi_claim: false,
  external_adoption_claim: false,
  net_customer_savings_claim: false,
  universal_savings_claim: false,
  workload: {
    department_agents: 8,
    tenant_identities: 2,
    first_party_tenants: 1,
    synthetic_external_client_tenants: 1,
    independent_role_analyses_preserved: 8
  },
  baseline: {
    provider_cost_usd: 0.16499684,
    billable_web_search_actions: 13,
    top_level_model_responses: 8
  },
  seenrelay: {
    provider_cost_usd: 0.05560972,
    billable_web_search_actions: 4,
    top_level_model_responses: 10,
    authoritative_shared_packets: 2,
    cross_tenant_reuse: false
  },
  result: {
    gross_provider_cost_avoided_usd: 0.10938712,
    gross_provider_cost_reduction_fraction: 0.662964939,
    semantic_contract_pass: true,
    tenant_isolation_pass: true
  },
  interpretation: {
    product_shape: 'shared evidence, independent reasoning',
    measured: 'gross operational provider cost for the paired first-party run',
    not_measured: 'monetized local coordination, engineering or integration overhead',
    claim: 'SeenRelay reduced repeated paid evidence collection while preserving eight independent role analyses in this bounded run.'
  },
  next_step: {
    command: 'npx seenrelay scan',
    rule: 'Start in shadow and keep SeenRelay only when your own normal workload proves positive safe economics.'
  }
} as const;

export function companyFleetCaseStudyDescriptor(origin: string) {
  return {
    ...companyFleetCaseStudy,
    canonical_url: `${origin}/case-studies/company-fleet`,
    machine_url: `${origin}/case-studies/company-fleet.json`,
    proof_atlas: `${origin}/proof`,
    quickstart: `${origin}/quickstart`
  };
}

export function companyFleetCaseStudyPage(origin: string): string {
  const x=companyFleetCaseStudy;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay first-party case study: eight agent roles kept independent reasoning while paid web-search actions fell from 13 to 4 and provider cost fell 66.30% for the measured run.">
<link rel="canonical" href="${origin}/case-studies/company-fleet">
<link rel="alternate" type="application/json" href="${origin}/case-studies/company-fleet.json" title="Machine-readable SeenRelay company fleet case study">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<meta property="og:type" content="article">
<meta property="og:title" content="8 agents, 66.30% lower provider cost — SeenRelay">
<meta property="og:description" content="Shared evidence, independent reasoning: 13 paid searches became 4 while all eight role analyses were preserved.">
<meta property="og:url" content="${origin}/case-studies/company-fleet">
<meta name="twitter:card" content="summary">
<title>8-agent operating case study — SeenRelay</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/#how">How it works</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav>
  <div class="rv-nav-actions"><a class="rv-button primary" href="/#start">Start locally</a></div>
</header>
<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">FIRST-PARTY OPERATING CASE STUDY · 2026-10-02</div>
  <h1>Eight agents kept thinking independently. They stopped paying to rediscover the same approved evidence.</h1>
  <p>SeenRelay coordinated one same-tenant evidence packet per organization, then every department still produced its own analysis. In this paired run, paid web-search actions fell from <b>13 to 4</b> and measured provider cost fell from <b>$0.16499684 to $0.05560972</b>.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/quickstart">Test your workload</a><a class="rv-button" href="/case-studies/company-fleet.json">Machine-readable savings record</a></div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-trust-note"><b>Currently free:</b> this savings record documents measured provider-cost reduction. It is not an invoice, bill, charge or payment receipt, and it creates no payment obligation.</div>
  <div class="rv-section-head"><div><div class="rv-eyebrow">THE RESULT</div><h2>Shared evidence. Independent reasoning.</h2></div><p>The saving came from repeated paid evidence collection, not from deleting agents or forcing a single answer.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">66.30%</span><h3>Gross provider-cost reduction</h3><p><b>$0.16499684 → $0.05560972</b><br>$0.10938712 gross provider cost avoided in the completed paired run.</p></article>
    <article class="rv-card"><span class="rv-number">13 → 4</span><h3>Paid web-search actions</h3><p>Baseline departments each collected current web evidence independently. The SeenRelay arm used one same-tenant shared packet per organization.</p></article>
    <article class="rv-card"><span class="rv-number">8 → 8</span><h3>Independent role analyses</h3><p>Competitive intelligence, research, adoption, product risk, platform engineering, FinOps, security and procurement reasoning remained separate.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">PAIRED DESIGN</div><h2>What changed — and what did not.</h2></div></div>
  <div class="rv-choice-grid">
    <article class="rv-choice"><header><b>Baseline</b><span>8 AGENTS</span></header><p>Each department independently collected current paid web evidence and then produced its role-specific analysis.</p><p><b>8 model Responses · 13 paid search actions · $0.16499684</b></p></article>
    <article class="rv-choice"><header><b>SeenRelay arm</b><span>8 AGENTS</span></header><p>Within each tenant, departments were allowed to rely on one current shared evidence packet. They then produced eight independent role analyses.</p><p><b>10 model Responses · 4 paid search actions · $0.05560972</b></p></article>
  </div>
  <div class="rv-trust-note"><b>Why model Responses increased:</b> the optimized path preserved all eight role analyses and added two packet-producing Responses. The economic win came from reducing repeated paid search work, not model-call count.</div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">BOUNDARIES</div><h2>What this result proves — and what it does not.</h2></div><p>Claim discipline matters more than a large percentage.</p></div>
  <div class="rv-stack">
    <article><h3>Proven for this run</h3><p>Real provider execution, published SeenRelay Zero-State client, one authoritative packet per tenant, distinct tenant coordinates, no cross-tenant reuse, frozen output contracts and positive gross provider-cost reduction.</p></article>
    <article><h3>First-party operating evidence</h3><p>SeenRelay OpsCo was real project work. Northstar AgentOps was an explicitly synthetic external-client rehearsal with real provider execution. It remains synthetic permanently for this evidence stream.</p></article>
    <article><h3>Not customer ROI</h3><p>This does not establish external customer adoption, independent demand, net customer savings or universal 66% savings. Local coordination, engineering and integration overhead were not monetized in the savings record.</p></article>
    <article><h3>Native-first still applies</h3><p>A customer workload must still beat cheaper local, source-native and provider-native controls. If normal traffic does not contain compatible expensive recurrence, SeenRelay should be removed.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-section-head"><div><div class="rv-eyebrow">WHY THIS SHAPE MATTERS</div><h2>Coordination does not require groupthink.</h2></div></div>
  <p>Multi-agent systems often benefit from different roles, prompts and decision criteria. Those differences do not automatically require every role to purchase the same current external evidence independently. SeenRelay targets the repeated read-only observation layer while preserving downstream reasoning diversity.</p>
  <p>The reusable pattern is therefore not “cache every agent answer.” It is: <b>share only the evidence that callers are explicitly allowed to share, then let every agent reason independently.</b></p>
</section>

<section class="rv-shell rv-final">
  <div><div class="rv-eyebrow">TEST YOUR OWN ECONOMICS</div><h2>Do not assume your workload has the same pattern.</h2><p>Start with the local prescreen, keep every authoritative call during shadow measurement, and leave stronger native controls enabled. SeenRelay belongs only on the narrow path that proves positive safe economics.</p><div class="rv-code"><pre>npx seenrelay scan</pre></div></div>
  <div class="rv-actions"><a class="rv-button primary" href="/quickstart">Quickstart</a><a class="rv-button" href="/proof">Full Proof Atlas</a></div>
</section>
</main>
<footer><span>First-party operating evidence · one synthetic tenant rehearsal · not customer ROI.</span><span><a href="/">SeenRelay</a> · <a href="/proof">Proof</a> · <a href="/case-studies/company-fleet.json">JSON</a></span></footer>
</body>
</html>`;
}
