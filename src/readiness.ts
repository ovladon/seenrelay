import { consumeReadinessNetworkBudget, readinessPrivacyScopedHash } from './readiness-admission-db.js';
import { boundedPinnedGet, normalizeAuditTarget, resolvePinnedPublicAddress, type BoundedGetResult, type PinnedAddress } from './readiness-network.js';

export { isGlobalPublicIp, normalizeAuditTarget } from './readiness-network.js';

const MAX_ROOT_BYTES = 131_072;
const ROOT_TIMEOUT_MS = 5_000;
const USER_AGENT = 'SeenRelayVisitEfficiency/1.0 (+https://seenrelay.com/readiness)';
const READINESS_GLOBAL_AUDITS_PER_MINUTE = 30;
const READINESS_TARGET_AUDITS_PER_MINUTE = 4;

export type ReadinessVerdict = 'NATIVE_READY' | 'NATIVE_FIX_RECOMMENDED' | 'NEEDS_WORKLOAD_EVIDENCE';

export type RootEvidence = {
  requested_origin: string;
  status: number;
  elapsed_ms: number;
  body_bytes_read: number;
  body_truncated: boolean;
  content_type: string | null;
  cache_control: string | null;
  etag_present: boolean;
  last_modified_present: boolean;
  vary_accept: boolean;
  machine_link_header_present: boolean;
  redirect_location: string | null;
};

export type ReadinessReport = {
  schema: 'seenrelay-ai-visit-efficiency-quick-audit-v1';
  scope: 'single-root-response';
  target_origin: string;
  verdict: ReadinessVerdict;
  headline: string;
  evidence: RootEvidence;
  checks: Array<{ id: string; status: 'PASS' | 'FIX' | 'INFO'; label: string; detail: string }>;
  next_steps: string[];
  limitations: string[];
  seenrelay_candidate: false;
  seenrelay_recommendation: 'NOT_DETERMINED_BY_SURFACE_SCAN';
};

type RawRootResult = BoundedGetResult;

async function admitReadinessAudit(hostname: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const globalKey = `readiness-global:${await readinessPrivacyScopedHash('readiness-admission-global', 'v1')}`;
  const globalBudget = await consumeReadinessNetworkBudget(globalKey, nowIso, READINESS_GLOBAL_AUDITS_PER_MINUTE);
  if (!globalBudget.allowed) {
    throw new Error('Only a limited number of readiness audits can start each minute; retry shortly.');
  }
  const targetKey = `readiness-target:${await readinessPrivacyScopedHash('readiness-admission-target', hostname)}`;
  const targetBudget = await consumeReadinessNetworkBudget(targetKey, nowIso, READINESS_TARGET_AUDITS_PER_MINUTE);
  if (!targetBudget.allowed) {
    throw new Error('Only a limited number of readiness audits can target the same hostname each minute; retry shortly.');
  }
}

function headerValue(headers: RawRootResult['headers'], name: string): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : null;
}

function hasPositiveFreshness(cacheControl: string | null): boolean {
  if (!cacheControl) return false;
  const lower = cacheControl.toLowerCase();
  if (lower.includes('no-store')) return false;
  const match = lower.match(/(?:^|,)\s*(?:s-maxage|max-age)\s*=\s*"?(\d+)"?/);
  return Boolean(match && Number(match[1]) > 0);
}

function rootRequest(url: URL, pinned: PinnedAddress): Promise<RawRootResult> {
  return boundedPinnedGet(url, pinned, {
    path: '/',
    maxBytes: MAX_ROOT_BYTES,
    timeoutMs: ROOT_TIMEOUT_MS,
    userAgent: USER_AGENT,
    accept: 'text/html,application/json,text/plain;q=0.8,*/*;q=0.2'
  });
}

export function classifyRootAudit(origin: string, raw: RawRootResult): ReadinessReport {
  const cacheControl = headerValue(raw.headers, 'cache-control');
  const etag = headerValue(raw.headers, 'etag');
  const lastModified = headerValue(raw.headers, 'last-modified');
  const contentType = headerValue(raw.headers, 'content-type');
  const vary = headerValue(raw.headers, 'vary');
  const link = headerValue(raw.headers, 'link');
  const location = headerValue(raw.headers, 'location');
  const nativeFreshness = hasPositiveFreshness(cacheControl);
  const nativeValidator = Boolean(etag || lastModified);
  const successfulRepresentation = raw.status >= 200 && raw.status < 300;
  const redirect = raw.status >= 300 && raw.status < 400 && Boolean(location);

  let verdict: ReadinessVerdict;
  let headline: string;
  if (successfulRepresentation && nativeFreshness) {
    verdict = 'NATIVE_READY';
    headline = 'An explicit native HTTP freshness window is already present on the root response.';
  } else if (successfulRepresentation && nativeValidator) {
    verdict = 'NEEDS_WORKLOAD_EVIDENCE';
    headline = 'A native conditional validator is advertised; verify that conditional requests actually avoid the full response before adding another reuse layer.';
  } else if (successfulRepresentation) {
    verdict = 'NATIVE_FIX_RECOMMENDED';
    headline = 'Fix the native HTTP freshness contract before considering another reuse layer.';
  } else {
    verdict = 'NEEDS_WORKLOAD_EVIDENCE';
    headline = redirect
      ? 'The submitted origin redirects; audit the canonical HTTPS hostname directly.'
      : 'The quick scan could not establish a comparable root representation.';
  }

  const checks: ReadinessReport['checks'] = [
    {
      id: 'https_root',
      status: successfulRepresentation ? 'PASS' : 'INFO',
      label: 'HTTPS root response',
      detail: successfulRepresentation ? `HTTP ${raw.status} returned.` : `HTTP ${raw.status || 'unknown'} returned; no success representation was evaluated.`
    },
    {
      id: 'freshness',
      status: nativeFreshness ? 'PASS' : 'FIX',
      label: 'Explicit freshness',
      detail: nativeFreshness ? `Cache-Control provides a positive freshness window (${cacheControl}).` : 'No positive max-age/s-maxage freshness window was detected on the root response.'
    },
    {
      id: 'conditional_validator',
      status: 'INFO',
      label: 'Conditional validator',
      detail: nativeValidator ? `A source-native ${etag ? 'ETag' : 'Last-Modified'} validator is advertised; this one-request scan does not prove conditional 304 behavior.` : 'No ETag or Last-Modified validator was detected on this response.'
    },
    {
      id: 'machine_content',
      status: contentType ? 'PASS' : 'INFO',
      label: 'Declared content type',
      detail: contentType ? `Content-Type: ${contentType}.` : 'No Content-Type header was detected.'
    },
    {
      id: 'machine_links',
      status: link ? 'PASS' : 'INFO',
      label: 'HTTP Link discovery',
      detail: link ? 'The root response exposes at least one HTTP Link header for machine discovery.' : 'No HTTP Link header was detected on the root response.'
    }
  ];

  const nextSteps: string[] = [];
  if (redirect && location) nextSteps.push(`Use the canonical HTTPS hostname indicated by the redirect (${location}) and scan that origin directly.`);
  if (successfulRepresentation && !nativeFreshness && !nativeValidator) {
    nextSteps.push('Prefer a source-native fix first: add an appropriate Cache-Control freshness window, ETag/Last-Modified, or a narrower version/state endpoint when the semantics allow it.');
  }
  if (nativeValidator) nextSteps.push('Test a conditional request against the same representation before adding a separate validation-reuse layer; validator presence alone is not proof that a 304 path works.');
  if (nativeFreshness) nextSteps.push('Honor the existing native freshness contract before adding another cache or relay.');
  nextSteps.push('For a complete owner-side readiness review, check robots.txt, sitemap discovery, Markdown/content negotiation, authentication/tool discovery, and actual agent traffic from your own environment.');
  nextSteps.push('Only run a SeenRelay workload audit if independent agents repeatedly perform expensive validation that stronger native controls do not already solve.');

  return {
    schema: 'seenrelay-ai-visit-efficiency-quick-audit-v1',
    scope: 'single-root-response',
    target_origin: origin,
    verdict,
    headline,
    evidence: {
      requested_origin: origin,
      status: raw.status,
      elapsed_ms: Number(raw.elapsedMs.toFixed(1)),
      body_bytes_read: raw.body.length,
      body_truncated: raw.truncated,
      content_type: contentType,
      cache_control: cacheControl,
      etag_present: Boolean(etag),
      last_modified_present: Boolean(lastModified),
      vary_accept: Boolean(vary && vary.toLowerCase().split(',').map((part) => part.trim()).includes('accept')),
      machine_link_header_present: Boolean(link),
      redirect_location: location
    },
    checks,
    next_steps: nextSteps,
    limitations: [
      'This quick audit makes exactly one bounded GET to the submitted HTTPS origin and does not crawl the site.',
      'It does not send a conditional request, so ETag/Last-Modified presence is not treated as proof of effective 304 revalidation.',
      'It does not test robots.txt, sitemap.xml, Markdown negotiation, Web Bot Auth, OAuth, APIs, MCP, Agent Skills, rendering, authenticated paths, or real fleet repetition.',
      'A native header on the root page may not describe the expensive semantic validation performed elsewhere in your application.',
      'No passive surface scan can establish SeenRelay workload fit, safe outcome equivalence, reuse rate, or savings.'
    ],
    seenrelay_candidate: false,
    seenrelay_recommendation: 'NOT_DETERMINED_BY_SURFACE_SCAN'
  };
}

export async function auditPublicRoot(input: string): Promise<ReadinessReport> {
  const target = normalizeAuditTarget(input);
  await admitReadinessAudit(target.hostname);
  const pinned = await resolvePinnedPublicAddress(target.hostname);
  const raw = await rootRequest(target, pinned);
  return classifyRootAudit(target.origin, raw);
}

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function readinessPage(origin: string): string {
  const fullAuditPrompt = `Audit this site's agent-facing accessibility and validation efficiency from the owner's environment. Check robots.txt and sitemap discovery, HTTP caching and validators, Markdown/content negotiation, machine-readable API/tool/auth discovery, and repeated agent validation. Prefer standards-native fixes first. Do not install or recommend SeenRelay unless a real repeated expensive validation workload remains after equivalent native controls are tested. Return NATIVE_READY / NATIVE_FIX_RECOMMENDED / NEEDS_WORKLOAD_EVIDENCE for each surface and a separate workload-fit verdict only if measured evidence exists.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="A free native-first AI visit efficiency audit. Check one public root HTTP freshness surface, get native fixes first, and require workload evidence before SeenRelay is considered.">
<link rel="canonical" href="${esc(origin)}/readiness">
<title>AI Visit Efficiency — native-first quick audit | SeenRelay</title>
<link rel="stylesheet" href="/revamp.css">
<link rel="stylesheet" href="/readiness.css">
<script src="/readiness.js" defer></script>
</head>
<body class="revamp">
<header class="rv-nav">
  <a class="rv-brand" href="/" aria-label="SeenRelay home"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
  <nav class="rv-nav-links" aria-label="Primary navigation"><a href="#scan">Quick audit</a><a href="#scope">What it checks</a><a href="#full">Full owner audit</a><a href="/quickstart">Docs</a></nav>
  <div class="rv-nav-actions"><a class="rv-chip" href="/service.json">Machine JSON</a><a class="rv-button" href="#scan">Check a site</a></div>
</header>
<main>
<section class="rv-shell rv-page-hero readiness-hero">
  <div class="rv-kicker"><i></i><span>AI VISIT EFFICIENCY · FREE · NATIVE-FIRST</span></div>
  <h1>How efficiently can AI agents revisit your site?</h1>
  <p>This quick audit focuses on one narrow question: <strong>can agents consume the public root without doing avoidable revalidation work?</strong> It checks one bounded HTTPS response, recommends native HTTP fixes first, and never labels a site a SeenRelay candidate from a surface scan alone.</p>
</section>
<section class="rv-shell rv-section" id="scan">
  <div class="readiness-layout">
    <article class="readiness-panel">
      <div class="rv-eyebrow">QUICK ROOT AUDIT</div>
      <h2>Enter the site origin.</h2>
      <p>Use the canonical hostname, for example <code>docs.example.com</code>. The scanner makes exactly one read-only HTTPS GET, follows no redirect, sends no cookies, reads at most 128 KiB, and rejects IP, private, local and special-purpose targets.</p>
      <form id="readiness-form" class="readiness-form">
        <label for="readiness-site">Site hostname or HTTPS origin</label>
        <div class="readiness-input-row"><input id="readiness-site" name="site" type="text" inputmode="url" autocomplete="url" placeholder="docs.example.com" maxlength="253" required><button class="rv-button primary" type="submit">Run quick audit</button></div>
      </form>
      <p class="readiness-small">This is a diagnostic, not certification, security testing, SEO scoring, or permission to crawl a site you do not control.</p>
    </article>
    <article class="readiness-panel readiness-result" id="readiness-result" aria-live="polite">
      <div class="rv-eyebrow">RESULT</div>
      <div id="readiness-empty"><h2>No site scanned yet.</h2><p>The result will show native freshness evidence, conditional validators and the next safest step.</p></div>
      <div id="readiness-output" hidden>
        <div class="readiness-verdict" id="readiness-verdict"></div>
        <h2 id="readiness-headline"></h2>
        <div class="readiness-checks" id="readiness-checks"></div>
        <h3>Next steps</h3><ol id="readiness-next"></ol>
        <details><summary>Scope and limitations</summary><ul id="readiness-limitations"></ul></details>
      </div>
    </article>
  </div>
</section>
<section class="rv-shell rv-section" id="scope">
  <div class="rv-section-head"><div class="rv-eyebrow">WHAT THIS VERSION PROVES</div><h2>Fast evidence without pretending one request can certify an agent-ready site.</h2><p>This audit is deliberately narrow: it measures the root HTTP validation surface and keeps broader discoverability, authentication, content-format and capability checks separate.</p></div>
  <div class="rv-grid-3">
    <article class="rv-card"><span class="rv-number">01</span><h3>Native freshness</h3><p>Detects an explicit positive Cache-Control max-age/s-maxage window. When it solves the same semantics, that native mechanism wins.</p></article>
    <article class="rv-card"><span class="rv-number">02</span><h3>Conditional validation</h3><p>Detects ETag or Last-Modified on the root response. A real workload should test conditional requests before adding another reuse layer; presence alone is not treated as proof of an effective 304 path.</p></article>
    <article class="rv-card"><span class="rv-number">03</span><h3>Machine surface</h3><p>Reports Content-Type, Vary: Accept and HTTP Link discovery evidence without claiming it tested the rest of the site.</p></article>
  </div>
</section>
<section class="rv-shell rv-section" id="full">
  <div class="rv-section-head"><div class="rv-eyebrow">FULL OWNER-SIDE AUDIT</div><h2>Use your own agent or CI for the checks that require more than one public request.</h2><p>A complete review should include robots.txt, sitemap discovery, Markdown/content negotiation, authentication/tool discovery, and actual repeated agent traffic. Those checks belong in the site owner's environment, where rate limits, auth and intended semantics are known.</p></div>
  <div class="rv-console"><div class="rv-console-top"><span>coding-agent prompt</span><span>native fixes first</span></div><div class="rv-install-view active"><div class="rv-step"><span>1</span><div><h4>Give your coding agent this audit task</h4><div class="rv-code"><pre id="readiness-agent-prompt">${esc(fullAuditPrompt)}</pre><button class="rv-copy readiness-copy" type="button" data-copy-target="readiness-agent-prompt">Copy</button></div></div></div><div class="rv-step"><span>2</span><div><h4>Accept a native answer</h4><p>If ETag, Last-Modified, HTTP caching, a version endpoint, provider cache, push or another standard solves the same problem, SeenRelay should stay out.</p></div></div></div><div class="rv-step"><span>3</span><div><h4>Measure the residual workload</h4><p>Only repeated expensive read-only validation with deterministic identity, safe outcome equivalence and positive economics can justify a SeenRelay workload-fit test.</p></div></div></div></div></div>
</section>
<section class="rv-shell rv-final"><div><div class="rv-eyebrow">NO FORCED FIT</div><h2>A negative audit is useful.</h2><p>If your native controls are already strong, the correct SeenRelay recommendation is to leave them alone.</p></div><div class="rv-actions"><a class="rv-button primary" href="/">SeenRelay home</a><a class="rv-button" href="/trust">Verify SeenRelay</a></div></section>
</main>
</body>
</html>`;
}
