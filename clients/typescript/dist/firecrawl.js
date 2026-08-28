import { sha256JsonFingerprint } from './zero-state.js';
import { protectMcpClient } from './mcp-auto.js';

const AUTH_QUERY_NAMES = new Set([
  'access_token', 'id_token', 'auth_token', 'authorization', 'api_key', 'apikey',
  'oauth_token', 'oauth_signature', 'awsaccesskeyid', 'signature'
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

export function firecrawlScrapePolicy(options = {}) {
  const publicEvidence = options.publicEvidence ?? true;
  const fallbackMaxAgeMs = Number.isFinite(options.maxAgeMs) && options.maxAgeMs >= 0 ? options.maxAgeMs : 0;
  return Object.freeze({
    eligible: (params) => scrapeIsSafeToSuppress(params),
    maxAgeMs: (params) => declaredMaxAgeMs(params, fallbackMaxAgeMs),
    privateMaxAgeMs: (params) => declaredMaxAgeMs(params, fallbackMaxAgeMs),
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
          subject: 'Firecrawl exact-URL scrape result fingerprint',
          predicate: 'document.scrape.result.sha256',
          source,
          qualifiers: {
            adapter: 'firecrawl-scrape-v1',
            options_sha256: optionsHash
          }
        },
        contribute: true,
        evidenceValue: sha256JsonFingerprint,
        reuseRetained: (check) => check?.status === 'SAME_OBSERVED'
      };
    }
  });
}

export function protectFirecrawlMcpClient(client, options = {}) {
  const relayClient = options.relayClient;
  if (!relayClient || typeof relayClient.check !== 'function' || typeof relayClient.observe !== 'function') {
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
