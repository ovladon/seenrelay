import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';

const MAX_ROOT_BYTES = 131_072;
const ROOT_TIMEOUT_MS = 5_000;
const USER_AGENT = 'SeenRelayReadiness/1.0 (+https://seenrelay.com/readiness)';

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
  schema: 'seenrelay-agent-readiness-quick-audit-v1';
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

type PinnedAddress = { address: string; family: 4 | 6 };

type RawRootResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  truncated: boolean;
  elapsedMs: number;
};

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return values;
}

export function isGlobalPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const p = parseIpv4(address);
    if (!p) return false;
    const [a, b, c] = p;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a >= 224) return false;
    return true;
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value.startsWith('::ffff:')) {
      const mapped = value.slice('::ffff:'.length);
      return isGlobalPublicIp(mapped);
    }
    const first = value[0];
    if (first !== '2' && first !== '3') return false;
    if (value.startsWith('2001:db8:') || value === '2001:db8::') return false;
    return true;
  }
  return false;
}

export function normalizeAuditTarget(input: string): URL {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 253) throw new Error('Enter a hostname or HTTPS site origin.');
  const candidate = raw.includes('://') ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Enter a valid hostname or HTTPS site origin.');
  }
  if (url.protocol !== 'https:') throw new Error('Only HTTPS sites can be audited.');
  if (url.username || url.password) throw new Error('Credentials in the URL are not allowed.');
  if (url.port && url.port !== '443') throw new Error('Only the default HTTPS port is allowed.');
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('Enter the site origin only, without a path, query, or fragment.');
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Local or internal hostnames are not allowed.');
  }
  if (isIP(hostname)) throw new Error('Enter a public DNS hostname, not an IP address.');
  return new URL(`https://${hostname}/`);
}

async function resolvePinnedPublicAddress(hostname: string): Promise<PinnedAddress> {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  if (!answers.length) throw new Error('DNS returned no addresses for this hostname.');
  for (const answer of answers) {
    if (!isGlobalPublicIp(answer.address)) throw new Error('The hostname resolves to a non-public or special-purpose address.');
  }
  const preferred = answers.find((answer) => answer.family === 4) || answers.find((answer) => answer.family === 6);
  if (!preferred || (preferred.family !== 4 && preferred.family !== 6)) throw new Error('No supported public address was returned.');
  return { address: preferred.address, family: preferred.family };
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
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    const req = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: 443,
      family: pinned.family,
      path: '/',
      method: 'GET',
      servername: url.hostname,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/json,text/plain;q=0.8,*/*;q=0.2',
        'accept-encoding': 'identity',
        connection: 'close'
      },
      lookup: (_hostname, _options, callback) => {
        callback(null, pinned.address, pinned.family);
      }
    }, (response) => {
      response.on('data', (chunk: Buffer | string) => {
        if (truncated) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = MAX_ROOT_BYTES - size;
        if (buffer.length > remaining) {
          if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
          size = MAX_ROOT_BYTES;
          truncated = true;
          response.destroy();
          return;
        }
        chunks.push(buffer);
        size += buffer.length;
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
        truncated,
        elapsedMs: performance.now() - started
      }));
      response.on('close', () => {
        if (truncated) resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
          truncated: true,
          elapsedMs: performance.now() - started
        });
      });
    });
    req.setTimeout(ROOT_TIMEOUT_MS, () => req.destroy(new Error('The site did not respond within the audit timeout.')));
    req.on('error', reject);
    req.end();
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
      status: nativeValidator ? 'INFO' : 'INFO',
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
    schema: 'seenrelay-agent-readiness-quick-audit-v1',
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
  const fullAuditPrompt = `Audit this site's AI-agent readiness from the owner's environment. Check robots.txt and sitemap discovery, HTTP caching and validators, Markdown/content negotiation, machine-readable API/tool/auth discovery, and repeated agent validation. Prefer standards-native fixes first. Do not install or recommend SeenRelay unless a real repeated expensive validation workload remains after equivalent native controls are tested. Return NATIVE_READY / NATIVE_FIX_RECOMMENDED / NEEDS_WORKLOAD_EVIDENCE for each surface and a separate workload-fit verdict only if measured evidence exists.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="A free native-first quick audit for AI-agent website readiness. Check the root HTTP freshness surface, get native fixes first, and require workload evidence before SeenRelay is considered.">
<link rel="canonical" href="${esc(origin)}/readiness">
<title>AI Agent Readiness — native-first quick audit | SeenRelay</title>
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
  <div class="rv-kicker"><i></i><span>FREE · NATIVE-FIRST · NO ACCOUNT</span></div>
  <h1>How ready is your site for AI agents?</h1>
  <p>This quick audit focuses on a narrow question most readiness scores blur together: <strong>can agents consume the public root without doing avoidable revalidation work?</strong> It checks one bounded HTTPS response, recommends native HTTP fixes first, and never labels a site a SeenRelay candidate from a surface scan alone.</p>
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
  <div class="rv-section-head"><div class="rv-eyebrow">WHAT THIS VERSION PROVES</div><h2>Fast evidence without pretending one request can certify an agent-ready site.</h2><p>Cloudflare and other tools already cover broad agent readiness. This audit is deliberately narrower: it separates public-surface readiness from the much harder question of whether repeated validation is worth sharing.</p></div>
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
