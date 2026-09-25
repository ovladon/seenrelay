const DEFAULT_ORIGIN = 'https://seenrelay.com';

function normalizedOrigin(value) {
  const url = new URL(value || DEFAULT_ORIGIN);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('SeenRelay origin must use HTTPS (or localhost HTTP for development).');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function requirePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 604800) {
    throw new Error(`${name} must be an integer between 1 and 604800 seconds.`);
  }
  return parsed;
}

async function readJsonResponse(response, label) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} returned a non-JSON response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = body?.error?.detail || body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${detail}`);
  }
  return body;
}

export async function fetchStarterCatalog({ origin = DEFAULT_ORIGIN, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const base = normalizedOrigin(origin);
  const response = await fetchImpl(`${base}/starter-facts.json`, {
    headers: { accept: 'application/json' }
  });
  const catalog = await readJsonResponse(response, 'Starter fact catalog');
  if (catalog?.schema !== 'seenrelay-starter-facts-v1' || !Array.isArray(catalog?.facts)) {
    throw new Error('Starter fact catalog has an unsupported schema.');
  }
  return { origin: base, catalog };
}

export async function runStarterCheck({
  factId,
  knownValue,
  maxAgeSeconds,
  origin = DEFAULT_ORIGIN,
  fetchImpl = globalThis.fetch
}) {
  if (typeof factId !== 'string' || !factId.trim()) throw new Error('fact-id is required.');
  if (typeof knownValue !== 'string' || knownValue.length === 0) throw new Error('--known requires a non-empty value.');
  const maxAge = requirePositiveInteger(maxAgeSeconds, '--max-age');
  const { origin: base, catalog } = await fetchStarterCatalog({ origin, fetchImpl });
  const entry = catalog.facts.find((candidate) => candidate?.id === factId);
  if (!entry?.fact) {
    const available = catalog.facts.map((candidate) => candidate?.id).filter(Boolean).join(', ');
    throw new Error(`Unknown starter fact "${factId}". Available: ${available}`);
  }

  const response = await fetchImpl(`${base}/v1/check`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-seenrelay-client': 'seenrelay-cli-check-starter'
    },
    body: JSON.stringify({
      fact: entry.fact,
      known_value: knownValue,
      max_age_seconds: maxAge
    })
  });
  const check = await readJsonResponse(response, 'SeenRelay CHECK');
  return {
    schema: 'seenrelay-cli-starter-check-v1',
    fact_id: entry.id,
    category: entry.category,
    fact: entry.fact,
    known_value_echoed: false,
    max_age_seconds: maxAge,
    check,
    boundary: {
      evidence_not_truth: true,
      automatic_reuse_authorized: false,
      authoritative_fallback_preserved: true
    }
  };
}

export function renderStarterCheck(result) {
  const status = result?.check?.status || 'NO_STATUS';
  const lines = [
    'SeenRelay starter CHECK',
    '=======================',
    `Fact: ${result.fact_id}`,
    `Status: ${status}`,
    `Caller max age: ${result.max_age_seconds}s`
  ];
  if (Number.isFinite(result?.check?.age_seconds)) lines.push(`Evidence age: ${result.check.age_seconds}s`);
  if (Number.isFinite(result?.check?.observer_count)) lines.push(`Observer count: ${result.check.observer_count}`);

  const messages = {
    SAME_OBSERVED: 'Compatible recent observations match the value you supplied. This is evidence, not truth and not permission to skip validation.',
    CHANGED_OBSERVED: 'Recent evidence includes a different observed value. Validate the authoritative source before relying on the change.',
    CONTESTED: 'Recent observations disagree. Validate the authoritative source.',
    STALE: 'Known evidence is older than your caller-supplied freshness window. Validate the authoritative source if fresh state is required.',
    UNKNOWN: 'No usable recent evidence is available. Validate the authoritative source if fresh state is required.'
  };
  lines.push('');
  lines.push(messages[status] || 'No reusable decision status was returned.');
  lines.push('Authoritative fallback remains available. Active suppression requires separate workload proof and caller policy.');
  return `${lines.join('\n')}\n`;
}

export { DEFAULT_ORIGIN };
