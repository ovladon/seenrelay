import { createHash } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError('value is not JSON-serializable');
}

export function canonicalizePrompt(prompt) {
  if (typeof prompt !== 'string') return null;
  const normalized = prompt.replace(/\r\n?/g, '\n').trim();
  return normalized.length > 0 ? normalized : null;
}

export function canonicalizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return { ok: false, reason: 'missing_url' };
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'non_http_url' };
  parsed.hash = '';
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  return { ok: true, value: parsed.toString() };
}

function timestampMs(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareCalls(a, b) {
  const aTime = timestampMs(a.timestamp);
  const bTime = timestampMs(b.timestamp);
  if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
  if (aTime !== null && bTime === null) return -1;
  if (aTime === null && bTime !== null) return 1;
  const sessionOrder = a.session.localeCompare(b.session);
  if (sessionOrder !== 0) return sessionOrder;
  if (a.turn_number !== b.turn_number) return a.turn_number - b.turn_number;
  return a.turn_id.localeCompare(b.turn_id);
}

function percent(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(6));
}

export function classifyOverlap(eligibleCalls, exactOpportunities) {
  if (!Number.isInteger(eligibleCalls) || eligibleCalls < 0) throw new TypeError('invalid eligibleCalls');
  if (!Number.isInteger(exactOpportunities) || exactOpportunities < 0 || exactOpportunities > eligibleCalls) {
    throw new TypeError('invalid exactOpportunities');
  }
  if (eligibleCalls < 100) return 'INSUFFICIENT_EXTERNAL_SAMPLE';
  if (exactOpportunities * 100 < eligibleCalls * 5) return 'LOW_EXACT_OVERLAP_SIGNAL';
  if (exactOpportunities * 100 < eligibleCalls * 20) return 'WEAK_EXACT_OVERLAP_SIGNAL';
  return 'STRONG_EXACT_OVERLAP_SIGNAL';
}

export function screenCalls(calls) {
  if (!Array.isArray(calls)) throw new TypeError('calls must be an array');
  const rejection = { missing_url: 0, invalid_url: 0, non_http_url: 0, missing_prompt: 0 };
  const eligible = [];
  const sourceSessions = new Set();

  for (const call of calls) {
    if (!call || typeof call !== 'object') throw new TypeError('invalid call');
    if (typeof call.session !== 'string' || call.session.length === 0) throw new TypeError('missing native session');
    if (!Number.isInteger(call.turn_number) || call.turn_number < 0) throw new TypeError('invalid turn number');
    if (typeof call.turn_id !== 'string' || call.turn_id.length === 0) throw new TypeError('invalid turn id');
    sourceSessions.add(call.session);
    const url = canonicalizeUrl(call.raw_url);
    if (!url.ok) {
      rejection[url.reason] += 1;
      continue;
    }
    const prompt = canonicalizePrompt(call.raw_prompt);
    if (!prompt) {
      rejection.missing_prompt += 1;
      continue;
    }
    eligible.push({
      session: call.session,
      timestamp: typeof call.timestamp === 'string' ? call.timestamp : null,
      turn_number: call.turn_number,
      turn_id: call.turn_id,
      exact_key: sha256(stableJson({ url: url.value, prompt })),
      url_key: sha256(url.value),
    });
  }

  eligible.sort(compareCalls);
  const exactSessions = new Map();
  const urlSessions = new Map();
  let exactOpportunities = 0;
  let urlOpportunities = 0;

  for (const call of eligible) {
    const priorExact = exactSessions.get(call.exact_key) || new Set();
    if ([...priorExact].some((session) => session !== call.session)) exactOpportunities += 1;
    priorExact.add(call.session);
    exactSessions.set(call.exact_key, priorExact);

    const priorUrl = urlSessions.get(call.url_key) || new Set();
    if ([...priorUrl].some((session) => session !== call.session)) urlOpportunities += 1;
    priorUrl.add(call.session);
    urlSessions.set(call.url_key, priorUrl);
  }

  const exactKeysSpanningSessions = [...exactSessions.values()].filter((sessions) => sessions.size > 1).length;
  const urlKeysSpanningSessions = [...urlSessions.values()].filter((sessions) => sessions.size > 1).length;

  return {
    schema: 'seenrelay-private302-swechat-overlap-core-v1',
    source_sessions_with_webfetch: sourceSessions.size,
    physical_webfetch_calls_seen: calls.length,
    eligible_http_webfetch_calls: eligible.length,
    rejected_calls: rejection,
    unique_exact_operation_keys: exactSessions.size,
    exact_repeat_calls_any_session: Math.max(0, eligible.length - exactSessions.size),
    exact_keys_spanning_sessions: exactKeysSpanningSessions,
    cross_session_exact_reuse_opportunities: exactOpportunities,
    cross_session_exact_reuse_percent: percent(exactOpportunities, eligible.length),
    unique_url_keys: urlSessions.size,
    url_keys_spanning_sessions: urlKeysSpanningSessions,
    cross_session_url_reuse_opportunities: urlOpportunities,
    cross_session_url_reuse_percent: percent(urlOpportunities, eligible.length),
    classification: classifyOverlap(eligible.length, exactOpportunities),
    ordering: {
      primary: 'timestamp_ascending_nonnull_first',
      tie_breakers: ['session_id', 'turn_number', 'turn_id'],
    },
    interpretation: {
      exact_overlap_is_lower_bound_only: true,
      different_native_session_is_independence_proxy_only: true,
      observer_independence_proven: false,
      natural_workload_class_pass_authorized: false,
      seenrelay_reuse_authorized: false,
    },
    privacy: {
      raw_urls_retained: false,
      raw_prompts_retained: false,
      session_ids_retained: false,
      turn_ids_retained: false,
      per_key_hashes_retained: false,
    },
  };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const parsed = JSON.parse(input);
  process.stdout.write(JSON.stringify(screenCalls(parsed)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
}
