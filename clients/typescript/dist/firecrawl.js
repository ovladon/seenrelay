import { SeenRelayClient } from './seenrelay.js';
import { freshResult, sha256JsonFingerprint, uncacheableResult } from './zero-state.js';
import { protectMcpClient } from './mcp-auto.js';

const AUTH_QUERY_NAMES = new Set([
  'access_token', 'id_token', 'auth_token', 'authorization', 'api_key', 'apikey',
  'oauth_token', 'oauth_signature', 'awsaccesskeyid', 'signature'
]);

const FIRECRAWL_OPERATIONAL_METADATA = new Set([
  'scrapeId',
  'cacheState',
  'cachedAt',
  'creditsUsed',
  'proxyUsed',
  'concurrencyLimited',
  'concurrencyQueueDurationMs'
]);

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((n) => n < 0 || n > 255)) return false;
  const [a, b] = octets;
  return a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (isPrivateIpv4(host)) return true;
  if (host.includes(':') && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:'))) return true;
  return false;
}

function hasAuthQuery(url) {
  for (const [name] of url.searchParams) {
    const lower = name.toLowerCase();
    if (AUTH_QUERY_NAMES.has(lower) || lower.startsWith('x-amz-') || lower.startsWith('x-goog-')) return true;
  }
  return false;
}

export function publicFirecrawlSource(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || hasAuthQuery(url) || isPrivateHostname(url.hostname)) return null;
  url.hash = '';
  return url.toString();
}

function scrapeArguments(params) {
  return params && typeof params === 'object' && params.arguments && typeof params.arguments === 'object'
    ? params.arguments
    : {};
}

function declaredMaxAgeMs(params, fallbackMs = 0) {
  const value = scrapeArguments(params).maxAge;
  return Number.isFinite(value) && value >= 0 ? value : fallbackMs;
}

function hasExplicitLiveFetch(params) {
  const args = scrapeArguments(params);
  return Object.prototype.hasOwnProperty.call(args, 'maxAge') && args.maxAge === 0;
}

function representationOptions(params) {
  const args = { ...scrapeArguments(params) };
  delete args.url;
  delete args.maxAge;
  return args;
}

function scrapeIsSafeToSuppress(params) {
  const args = scrapeArguments(params);
  if (typeof args.url !== 'string' || !args.url) return false;
  if (Array.isArray(args.actions) && args.actions.length > 0) return false;
  if (args.storeInCache === true) return false;
  if (args.zeroDataRetention === true) return false;
  if (args.profile !== undefined) return false;
  return true;
}

function relayWindowSeconds(params, fallbackMs) {
  const ms = declaredMaxAgeMs(params, fallbackMs);
  if (ms < 1000) return 0;
  return Math.min(604800, Math.floor(ms / 1000));
}

function parseFirecrawlMcpResult(result) {
  if (!result || typeof result !== 'object' || result.isError === true || !Array.isArray(result.content)) return null;
  const textItems = result.content.filter((item) => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string');
  if (textItems.length !== 1) return null;
  let parsed;
  try { parsed = JSON.parse(textItems[0].text); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.success === false) return null;
  const document = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : parsed;
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null;
  return { parsed, document };
}

function semanticDocumentProjection(document) {
  const projected = structuredClone(document);
  if (projected.metadata && typeof projected.metadata === 'object' && !Array.isArray(projected.metadata)) {
    for (const name of FIRECRAWL_OPERATIONAL_METADATA) delete projected.metadata[name];
  }
  delete projected.scrape_id;
  delete projected.scrapeId;
  return projected;
}

export function firecrawlResultFingerprint(result) {
  const parsed = parseFirecrawlMcpResult(result);
  if (!parsed) throw new TypeError('Firecrawl result is not a successful single-document JSON MCP result');
  return sha256JsonFingerprint(semanticDocumentProjection(parsed.document));
}

function firecrawlFreshResult(result, params, nowMs = Date.now()) {
  const parsed = parseFirecrawlMcpResult(result);
  if (!parsed) return uncacheableResult(result);
  const metadata = parsed.document.metadata && typeof parsed.document.metadata === 'object' && !Array.isArray(parsed.document.metadata)
    ? parsed.document.metadata
    : {};
  const cacheState = metadata.cacheState;

  if (cacheState === 'hit') {
    const observedAtMs = Date.parse(metadata.cachedAt);
    if (!Number.isFinite(observedAtMs)) return uncacheableResult(result);
    return freshResult(result, undefined, {
      observedAt: observedAtMs,
      independentlyObtained: false
    });
  }

  if (cacheState === 'miss' || (cacheState === undefined && hasExplicitLiveFetch(params))) {
    return freshResult(result, undefined, {
      observedAt: nowMs,
      independentlyObtained: true
    });
  }

  // A successful provider response without a defensible source-observation time is still returned
  // to the caller, but it cannot authorize local/private reuse or a new public OBSERVE.
  return uncacheableResult(result);
}

export function firecrawlScrapePolicy(options = {}) {
  const publicEvidence = options.publicEvidence ?? false;
  const fallbackMaxAgeMs = Number.isFinite(options.maxAgeMs) && options.maxAgeMs >= 0 ? options.maxAgeMs : 0;
  return Object.freeze({
    eligible: (params) => scrapeIsSafeToSuppress(params),
    maxAgeMs: (params) => declaredMaxAgeMs(params, fallbackMaxAgeMs),
    privateMaxAgeMs: (params) => declaredMaxAgeMs(params, fallbackMaxAgeMs),
    normalizeResult: (result, params) => firecrawlFreshResult(result, params),
    relay: (params) => {
      if (!publicEvidence) return undefined;
      const args = scrapeArguments(params);
      const source = publicFirecrawlSource(args.url);
      if (!source) return undefined;
      const maxAgeSeconds = relayWindowSeconds(params, fallbackMaxAgeMs);
      const optionsHash = sha256JsonFingerprint(representationOptions(params));
      return {
        mode: maxAgeSeconds > 0 ? 'always' : 'off',
        maxAgeSeconds: maxAgeSeconds > 0 ? maxAgeSeconds : undefined,
        fact: {
          subject: 'Exact-URL rendered document fingerprint',
          predicate: 'document.scrape.result.sha256',
          source,
          qualifiers: {
            representation_contract: 'firecrawl-scrape-v2',
            options_sha256: optionsHash
          }
        },
        contribute: true,
        evidenceValue: firecrawlResultFingerprint,
        reuseRetained: (check) => check?.status === 'SAME_OBSERVED'
      };
    }
  });
}

export function protectFirecrawlMcpClient(client, options = {}) {
  const relayClient = options.relayClient ?? new SeenRelayClient({
    baseUrl: options.baseUrl,
    clientHint: options.clientHint ?? 'seenrelay-firecrawl-adapter'
  });
  if (typeof relayClient.check !== 'function' || typeof relayClient.observe !== 'function') {
    throw new TypeError('relayClient must provide check() and observe()');
  }
  const scheduleObserve = options.scheduleObserve ?? ((task) => {
    queueMicrotask(() => { void task(); });
  });
  return protectMcpClient(client, {
    serverKey: options.serverKey ?? 'firecrawl',
    edgeOptions: {
      relayClient,
      relayMode: 'off',
      scheduleObserve,
      ...(options.privateStore ? { privateStore: options.privateStore } : {}),
      ...(options.privateCodec ? { privateCodec: options.privateCodec } : {}),
      ...(options.validatorRetentionMs !== undefined ? { validatorRetentionMs: options.validatorRetentionMs } : {}),
      ...(options.privateValidatorRetentionMs !== undefined ? { privateValidatorRetentionMs: options.privateValidatorRetentionMs } : {})
    },
    tools: {
      firecrawl_scrape: firecrawlScrapePolicy({
        publicEvidence: options.publicEvidence,
        maxAgeMs: options.maxAgeMs
      })
    }
  });
}
