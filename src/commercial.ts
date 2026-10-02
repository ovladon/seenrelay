import { siteFooterHtml } from './public-facts-view.js';

const supportIssueUrl = 'https://github.com/ovladon/seenrelay/issues/new?template=deployment-support.yml';
const commercialInterestUrl = 'https://github.com/ovladon/seenrelay/issues/new?template=commercial-interest.yml';

export function commercialDescriptor(origin: string) {
  return {
    schema: 'seenrelay-commercial-readiness-v1',
    updated_at: '2026-10-02',
    billing_enabled: false,
    purchase_available: false,
    commercial_activation_authorized: false,
    current_hosted_service_price_usd: 0,
    objective: 'Record independent willingness-to-pay or procurement intent only after measured workload evidence exists.',
    qualification: {
      evidence_first: true,
      acceptable_verdicts: ['USE','INSUFFICIENT EVIDENCE_WITH_PROCUREMENT_INTEREST'],
      prerequisites: [
        'normal_workload_measured',
        'stronger_native_controls_considered',
        'read_only_or_explicitly_eligible_operation',
        'positive_or_plausibly_material_net_value',
        'no_secrets_in_public_handoff'
      ]
    },
    handoff: {
      commercial_interest: commercialInterestUrl,
      deployment_support: supportIssueUrl,
      public_issue_warning: 'Do not include secrets, customer data, private URLs, proprietary prompts, tokens or confidential invoices.',
      binding_order: false,
      payment_obligation_created: false
    },
    future_automation_boundary: {
      may_expose_entitlement_after_lawful_activation: true,
      current_checkout_url: null,
      current_payment_provider: null,
      current_price_offer: null
    },
    discovery: {
      economics: `${origin}/economics`,
      agent_adoption: `${origin}/agent-adoption.json`,
      proof: `${origin}/proof.json`,
      trust: `${origin}/trust.json`
    }
  };
}

export function commercialPage(origin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Optional SeenRelay deployment support after local measurement shows a real workload candidate.">\n<meta name="robots" content="noindex,nofollow,noarchive">
<link rel="canonical" href="${origin}/commercial">
<meta name="theme-color" content="#080a0e">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml">
<title>SeenRelay — Optional deployment support</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/sota.css">
<link rel="stylesheet" href="/funnel.css">
</head>
<body class="revamp">
<a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav">
  <a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="/#how">How it works</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav>
  <details class="rv-mobile-nav"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="/#how">How it works</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/quickstart">Docs</a></nav></details>
</header>

<main id="main-content">
<section class="rv-shell rv-page-hero">
  <div class="rv-eyebrow">OPTIONAL DEPLOYMENT SUPPORT</div>
  <h1>Start self-serve. Ask for help only if useful.</h1>
  <p>SeenRelay is self-serve by default. Measure locally first; use this public support path only when a real workload candidate remains worth deeper engineering help.</p>
  <div class="rv-actions"><a class="rv-button primary" href="/#start">Start locally</a><a class="rv-button" href="${commercialInterestUrl}">Record commercial interest</a><a class="rv-button" href="${supportIssueUrl}">Deployment support</a><a class="rv-button" href="/commercial.json">Machine handoff</a></div>
  <p class="rv-small">The GitHub inquiry is public. Do not include secrets or customer data.</p>
</section>

<section class="rv-shell rv-section">
  <div class="rv-grid-3">
    <article class="rv-card accent"><span class="rv-number">01</span><h3>Measure first</h3><p>Use normal traffic and preserve the authoritative path.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Keep or remove</h3><p>Native controls, safety and net economics decide whether SeenRelay stays.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Ask only if needed</h3><p>Optional support can help with a bounded integration after evidence exists.</p></article>
  </div>
</section>

<section class="rv-shell rv-section">
  <div class="rv-trust-note"><b>Current billing boundary:</b> the hosted CHECK/OBSERVE service remains free during bootstrap and self-serve service billing is disabled. Commercial-interest intake records non-binding willingness-to-pay/procurement evidence only; it is not an order form, does not activate payment, and is not required to use SeenRelay.</div>
  <div class="rv-actions rv-actions-spaced"><a class="rv-button primary" href="/#start">Start locally</a><a class="rv-button" href="/economics">Economics method</a></div>
</section>
</main>
${siteFooterHtml()}
</body></html>`;
}
