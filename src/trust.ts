import { publicProductFacts } from './public-facts.generated.js';
import { siteFooterHtml } from './public-facts-view.js';

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function trustDescriptor(origin: string) {
  return {
    status: 'self_attested_verifiable_controls',
    claim_boundary: 'Technical controls and release evidence; not a third-party security certification.',
    third_party_security_audit: false,
    external_security_certification: false,
    client: {
      version: publicProductFacts.install.client_version,
      runtime_dependencies: publicProductFacts.install.runtime_dependencies,
      license: 'MIT',
      npm: publicProductFacts.install.npm_command,
      pypi: publicProductFacts.install.pypi_command,
      source: 'https://github.com/ovladon/seenrelay/tree/main/clients',
      failure_semantics: 'Relay-side failures fail open into the caller\'s original validation path.',
      adoption_default: 'shadow mode; no validation is skipped until caller policy explicitly allows reuse.'
    },
    service: {
      billing_enabled: false,
      current_api_fee_usd: 0,
      account_required: false,
      truth_oracle: false,
      source_browsing_or_verification: false,
      operations: ['CHECK', 'OBSERVE']
    },
    verification: {
      production_health: `${origin}/healthz`,
      machine_descriptor: `${origin}/service.json`,
      product_facts: `${origin}/product-facts.json`,
      repository: 'https://github.com/ovladon/seenrelay',
      branch_ruleset: 'https://github.com/ovladon/seenrelay/rules/21309307',
      security_policy: 'https://github.com/ovladon/seenrelay/blob/main/SECURITY.md',
      threat_model: 'https://github.com/ovladon/seenrelay/blob/main/docs/THREAT_MODEL.md',
      data_practices: `${origin}/data-practices`,
      release_model: 'Pull request -> required CI verify -> required isolated Preview Release Gate -> main -> Production.',
      required_merge_gates: ['pull_request', 'verify', 'preview-release-gate'],
      dependency_security: 'Required CI audits the complete locked npm dependency set at high severity. CodeQL runs as supplementary analysis. Pull-request dependency-delta review also runs when GitHub exposes its dependency-review API; platform unavailability is reported explicitly rather than presented as a successful delta review.',
      package_publication: 'Automated client publishing is configured for registry trusted publishing/OIDC. Verify provenance or attestations on the registry for the exact version you install.'
    },
    no_lock_in: {
      uninstall_behavior: 'Remove the wrapper/preflight and keep the original validation function.',
      data_export_required_to_leave: false,
      hidden_runtime_dependency: false,
      silent_billing: false
    },
    caveat: 'A verifiable process reduces risk; it does not prove the absence of vulnerabilities.'
  };
}

export function trustPage(origin: string): string {
  const trust = trustDescriptor(origin);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Verify SeenRelay's software supply chain, failure behavior, data practices and release controls before integrating it."><link rel="canonical" href="${esc(origin)}/trust"><title>SeenRelay Trust — Verify before you integrate</title><link rel="stylesheet" href="/site.css"></head><body>
<header class="nav"><a class="brand" href="/">SeenRelay<span class="pulse"></span></a><nav><a href="/">Home</a><a href="/quickstart">Quickstart</a><a href="/economics">Savings</a><a href="/data-practices">Data</a><a href="/trust.json">Machine JSON</a></nav></header>
<main>
<section class="hero compact"><div class="eyebrow">VERIFY BEFORE YOU TRUST</div><h1>Verify SeenRelay.</h1><p class="lead">SeenRelay sits in the validation path. Inspect the client, run shadow mode, keep the original validation, and verify the package, release and live deployment.</p><div class="cta"><a class="primary" href="https://github.com/ovladon/seenrelay">Inspect the source</a><a class="secondary" href="/trust.json">Machine-readable posture</a><a class="secondary" href="/data-practices">Data practices</a></div></section>
<section class="section decision"><div class="section-head"><div><div class="eyebrow">MINIMAL BLAST RADIUS</div><h2>Start with a removable wrapper.</h2></div><p>Trust should be earned after integration, not required before it.</p></div><div class="proof-grid"><article><b>Zero runtime dependencies</b><span>The public JavaScript/TypeScript and Python client libraries do not pull a dependency tree into your application.</span></article><article><b>Shadow mode first</b><span>CHECK can run while every original validation still executes. No reuse is required until your own evidence and policy justify it.</span></article><article><b>Fail open</b><span>If SeenRelay is unavailable, the wrapper falls back to the validation your application already intended to perform.</span></article><article><b>No lock-in path</b><span>Remove the preflight and keep the original validation function. Leaving does not require exporting SeenRelay-owned application state.</span></article></div></section>
<section class="section split"><div><div class="eyebrow">SOFTWARE SUPPLY CHAIN</div><h2>Verify the package and release.</h2><p>The client source is public and MIT-licensed. Automated package publishing is configured for registry Trusted Publishing/OIDC instead of long-lived publication tokens. Registry provenance or attestations should be checked for the exact version you install; a release process is evidence, not a substitute for reviewing the package.</p><p><b>Current client:</b> v${esc(trust.client.version)} · ${esc(trust.client.runtime_dependencies)} runtime dependencies.</p></div><div class="terminal"><pre>${esc(trust.client.npm)}

# or

${esc(trust.client.pypi)}

Production commit:
GET ${esc(origin)}/healthz</pre></div></section>
<section class="section decision"><div class="section-head"><div><div class="eyebrow">RELEASE BOUNDARY</div><h2>Production must match verified evidence.</h2></div><p>${esc(trust.verification.release_model)}</p></div><div class="proof-grid"><article><b>Required merge gates</b><span>The active main-branch ruleset requires a pull request, the <code>verify</code> check and the isolated <code>preview-release-gate</code>. Inspect the linked ruleset instead of trusting this sentence.</span></article><article><b>Dependency security</b><span>Required CI audits the complete locked npm dependency set at high severity. CodeQL provides additional analysis. GitHub dependency-delta review is attempted on pull requests when its API is available; an unavailable API is surfaced explicitly, not called a completed review.</span></article><article><b>Live commit</b><span><code>/healthz</code> exposes the Production deployment SHA so an integrator can compare what is live with the public repository.</span></article><article><b>Security reporting</b><span>Security-sensitive reports use the private vulnerability path described in <a href="https://github.com/ovladon/seenrelay/blob/main/SECURITY.md">SECURITY.md</a>, not public exploit disclosure.</span></article></div></section>
<section class="section split"><div><div class="eyebrow">SERVICE BOUNDARY</div><h2>Observations, not truth.</h2><p>The service does not browse the fact source or use an LLM to decide truth. <b>SAME_OBSERVED</b> is evidence that matching observations exist within the requested window; whether that evidence is reusable remains your policy decision.</p><p>Billing is disabled in the current deployment. Current public access is free and requires no account. The current client cannot silently create a charge on your behalf.</p></div><div class="proof-grid"><article><b>Exactly two operations</b><span>CHECK and OBSERVE.</span></article><article><b>No source credentials</b><span>Credential-bearing and signature-bearing source URLs are rejected from shared fact identity.</span></article><article><b>Bounded evidence</b><span>Observer proofs establish key possession/continuity, not truth or one-key-one-organization identity.</span></article><article><b>Emergency controls</b><span>Runtime modes can reduce capacity, stop new observations, or freeze CHECK/OBSERVE at the application layer.</span></article></div></section>
<section class="section decision"><div class="section-head"><div><div class="eyebrow">WHAT WE DO NOT CLAIM</div><h2>What is not certified.</h2></div></div><div class="trust-note"><b>No third-party security certification is claimed.</b> SeenRelay currently exposes self-attested, externally inspectable technical controls and public release evidence. A clean automated scan or provenance record does not prove that software is vulnerability-free. Evaluate it under your own risk model and begin in shadow mode.</div></section>
<section class="section final"><div><div class="eyebrow">VERIFY IT YOURSELF</div><h2>Inspect. Measure. Reuse only when policy allows.</h2></div><div class="cta"><a class="primary" href="/quickstart">Run a shadow pilot</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/SECURITY.md">Security policy</a><a class="secondary" href="https://github.com/ovladon/seenrelay/blob/main/docs/THREAT_MODEL.md">Threat model</a></div></section>
</main>${siteFooterHtml()}</body></html>`;
}
