import type { FactDescriptor, FactLocator, JsonValue } from './types.js';

const MAX_SUBJECT = 256;
const MAX_PREDICATE = 128;
const MAX_SOURCE = 2048;
const MAX_LOCATOR = 1024;
const MAX_QUALIFIER_KEYS = 24;
const MAX_VALUE_DEPTH = 5;
const MAX_ARRAY_ITEMS = 64;
const MAX_STRING_VALUE = 2048;

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi'
]);
const AUTH_PARAMS = new Set([
  'access_token', 'id_token', 'auth_token', 'authorization', 'api_key', 'apikey',
  'oauth_token', 'oauth_signature', 'awsaccesskeyid', 'signature'
]);

export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}

function assertUnicodeScalarString(value: string, field: string): void {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new ValidationError(`${field} contains an unpaired Unicode surrogate`);
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new ValidationError(`${field} contains an unpaired Unicode surrogate`);
    }
  }
}

function cleanText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  assertUnicodeScalarString(value, field);
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized) throw new ValidationError(`${field} must not be empty`);
  if (normalized.length > max) throw new ValidationError(`${field} is too long`);
  return normalized;
}

function lexicalCompare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

export function normalizeSubject(value: unknown): string { return cleanText(value, 'fact.subject', MAX_SUBJECT); }

export function normalizePredicate(value: unknown): string {
  const p = cleanText(value, 'fact.predicate', MAX_PREDICATE).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:/-]*$/.test(p)) {
    throw new ValidationError('fact.predicate must be a stable shared machine identifier such as price.current');
  }
  return p;
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}
function isAuthParam(name: string): boolean {
  const lower = name.toLowerCase();
  return AUTH_PARAMS.has(lower) || lower.startsWith('x-amz-') || lower.startsWith('x-goog-');
}

export function normalizeSource(value: unknown): string {
  const raw = cleanText(value, 'fact.source', MAX_SOURCE);
  let url: URL;
  try { url = new URL(raw); } catch { throw new ValidationError('fact.source must be an absolute http(s) URL'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ValidationError('fact.source must use http or https');
  if (url.username || url.password) throw new ValidationError('fact.source must not contain URL userinfo credentials');

  const params = [...url.searchParams.entries()];
  if (params.some(([name]) => isAuthParam(name))) {
    throw new ValidationError('fact.source must not contain authentication or signature query parameters; submit a stable credential-free source URL');
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
  const retained = params
    .filter(([name]) => !isTrackingParam(name))
    .sort(([ak, av], [bk, bv]) => lexicalCompare(ak, bk) || lexicalCompare(av, bv));
  url.search = '';
  for (const [name, val] of retained) url.searchParams.append(name, val);
  const normalized = url.toString();
  if (normalized.length > MAX_SOURCE) throw new ValidationError('fact.source is too long after canonicalization');
  return normalized;
}

function assertJson(value: unknown, depth = 0): asserts value is JsonValue {
  if (depth > MAX_VALUE_DEPTH) throw new ValidationError('JSON value is nested too deeply');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new ValidationError('JSON numbers must be finite'); return; }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_VALUE) throw new ValidationError('JSON string value is too long');
    assertUnicodeScalarString(value, 'JSON string value'); return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new ValidationError('JSON array has too many items');
    for (const item of value) assertJson(item, depth + 1); return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_QUALIFIER_KEYS * 4) throw new ValidationError('JSON object has too many keys');
    for (const [key, item] of entries) {
      if (!key || key.length > 128) throw new ValidationError('JSON object key is invalid');
      assertUnicodeScalarString(key, 'JSON object key'); assertJson(item, depth + 1);
    }
    return;
  }
  throw new ValidationError('Value must be valid JSON');
}

function stable(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]!);
    return out;
  }
  return value;
}

/** Deterministic JSON serialization for cross-language hashing and the SeenRelay proof contract. */
export function stableJson(value: unknown): string { assertJson(value); return JSON.stringify(stable(value)); }

function normalizeQualifiers(value: Record<string, JsonValue> | undefined): Record<string, JsonValue> {
  const input = value || {};
  if (Object.keys(input).length > MAX_QUALIFIER_KEYS) throw new ValidationError('fact.qualifiers has too many keys');
  const out: Record<string, JsonValue> = {};
  for (const [rawKey, val] of Object.entries(input)) {
    const key = cleanText(rawKey, 'fact.qualifiers key', 128).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(out, key)) throw new ValidationError(`fact.qualifiers contains colliding normalized key: ${key}`);
    assertJson(val); out[key] = val;
  }
  return out;
}

export function normalizeLocator(value: FactLocator | undefined): FactLocator | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw new ValidationError('fact.locator must be an object');
  if (!['json_pointer', 'element_id', 'source_key'].includes(value.scheme)) throw new ValidationError('fact.locator.scheme must be json_pointer, element_id, or source_key');
  if (typeof value.value !== 'string') throw new ValidationError('fact.locator.value must be a string');
  assertUnicodeScalarString(value.value, 'fact.locator.value');
  if (!value.value || value.value.length > MAX_LOCATOR) throw new ValidationError('fact.locator.value must be 1..1024 characters');
  if (value.scheme === 'json_pointer' && !value.value.startsWith('/')) throw new ValidationError('json_pointer locator values must start with /');
  return { scheme: value.scheme, value: value.value };
}

export function canonicalFact(fact: FactDescriptor) {
  if (!fact || typeof fact !== 'object') throw new ValidationError('fact is required');
  const subject = normalizeSubject(fact.subject);
  const predicate = normalizePredicate(fact.predicate);
  const qualifiers = normalizeQualifiers(fact.qualifiers);
  const qualifiersJson = stableJson(qualifiers);
  const sourceUrl = normalizeSource(fact.source);
  const locator = normalizeLocator(fact.locator);

  const discriminator = locator
    ? `locator:${stableJson(locator as unknown as JsonValue)}`
    : `predicate:${predicate}`;
  const identityBasis = locator ? 'source_locator' : 'predicate';
  const identityVersion = 'seenrelay-fact-v3';
  const canonical = `${identityVersion}\n${sourceUrl}\n${discriminator}\n${qualifiersJson}`;
  return { subject, predicate, qualifiersJson, sourceUrl, locator, canonical, identityVersion, identityBasis };
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function canonicalFactKey(fact: FactDescriptor) {
  const c = canonicalFact(fact);
  return { factKey: await sha256Hex(c.canonical), ...c };
}
export async function valueIdentity(value: unknown) {
  const valueJson = stableJson(value);
  return { valueJson, valueHash: await sha256Hex(valueJson) };
}
