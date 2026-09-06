import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SCREEN_SCHEMA = 'seenrelay-browser-overlap-screen-v1';
export const TOOL_NAME = 'WebFetch';

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

function toolUseBlocks(event) {
  const content = event?.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((block) => block && typeof block === 'object' && block.type === 'tool_use');
}

export function extractWebFetchCallsFromEvent(event, { session, lineNumber } = {}) {
  const calls = [];
  for (const block of toolUseBlocks(event)) {
    if (block.name !== TOOL_NAME) continue;
    const input = block.input && typeof block.input === 'object' ? block.input : {};
    calls.push({
      session: String(session ?? ''),
      line_number: Number.isInteger(lineNumber) ? lineNumber : 0,
      timestamp: typeof event?.timestamp === 'string' ? event.timestamp : null,
      raw_url: input.url,
      raw_prompt: input.prompt
    });
  }
  return calls;
}

export function parseTraceText(text, { session = 'session' } = {}) {
  if (typeof text !== 'string') throw new TypeError('trace text must be a string');
  const calls = [];
  let invalidJsonLines = 0;
  const lines = text.split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      invalidJsonLines += 1;
      continue;
    }
    calls.push(...extractWebFetchCallsFromEvent(event, { session, lineNumber: index + 1 }));
  }
  return Object.freeze({ calls: Object.freeze(calls), invalid_json_lines: invalidJsonLines });
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
  return a.line_number - b.line_number;
}

function percent(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(6));
}

export function classifyOverlap({ eligibleCalls, crossSessionExactReusePercent }) {
  if (eligibleCalls < 100) return 'INSUFFICIENT_EXTERNAL_SAMPLE';
  if (crossSessionExactReusePercent < 5) return 'LOW_EXACT_OVERLAP_SIGNAL';
  if (crossSessionExactReusePercent < 20) return 'WEAK_EXACT_OVERLAP_SIGNAL';
  return 'STRONG_EXACT_OVERLAP_SIGNAL';
}

export function screenBrowserOverlap(parsedSessions, {
  sourceRevision = 'unspecified',
  sourceDataset = 'trace-commons/agent-traces'
} = {}) {
  if (!Array.isArray(parsedSessions)) throw new TypeError('parsedSessions must be an array');

  const rejection = {
    missing_url: 0,
    invalid_url: 0,
    non_http_url: 0,
    missing_prompt: 0
  };
  const allCalls = [];
  let invalidJsonLines = 0;

  for (const parsed of parsedSessions) {
    if (!parsed || !Array.isArray(parsed.calls)) throw new TypeError('parsed session must contain calls');
    invalidJsonLines += Number(parsed.invalid_json_lines || 0);
    allCalls.push(...parsed.calls);
  }

  const eligible = [];
  for (const call of allCalls) {
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
      line_number: call.line_number,
      timestamp: call.timestamp,
      exact_key: sha256(stableJson({ url: url.value, prompt })),
      url_key: sha256(url.value)
    });
  }

  eligible.sort(compareCalls);

  const exactSessions = new Map();
  const urlSessions = new Map();
  let crossSessionExactReuseOpportunities = 0;
  let crossSessionUrlReuseOpportunities = 0;

  for (const call of eligible) {
    const priorExactSessions = exactSessions.get(call.exact_key) || new Set();
    if ([...priorExactSessions].some((session) => session !== call.session)) {
      crossSessionExactReuseOpportunities += 1;
    }
    priorExactSessions.add(call.session);
    exactSessions.set(call.exact_key, priorExactSessions);

    const priorUrlSessions = urlSessions.get(call.url_key) || new Set();
    if ([...priorUrlSessions].some((session) => session !== call.session)) {
      crossSessionUrlReuseOpportunities += 1;
    }
    priorUrlSessions.add(call.session);
    urlSessions.set(call.url_key, priorUrlSessions);
  }

  const exactKeysSpanningSessions = [...exactSessions.values()].filter((sessions) => sessions.size > 1).length;
  const urlKeysSpanningSessions = [...urlSessions.values()].filter((sessions) => sessions.size > 1).length;
  const exactRepeatCallsAnySession = Math.max(0, eligible.length - exactSessions.size);
  const crossSessionExactReusePercent = percent(crossSessionExactReuseOpportunities, eligible.length);
  const crossSessionUrlReusePercent = percent(crossSessionUrlReuseOpportunities, eligible.length);

  return Object.freeze({
    schema: SCREEN_SCHEMA,
    source_dataset: sourceDataset,
    source_revision: sourceRevision,
    tool_name: TOOL_NAME,
    source_sessions: parsedSessions.length,
    invalid_json_lines: invalidJsonLines,
    webfetch_calls_seen: allCalls.length,
    eligible_http_webfetch_calls: eligible.length,
    rejected_calls: Object.freeze(rejection),
    unique_exact_operation_keys: exactSessions.size,
    exact_repeat_calls_any_session: exactRepeatCallsAnySession,
    exact_keys_spanning_sessions: exactKeysSpanningSessions,
    cross_session_exact_reuse_opportunities: crossSessionExactReuseOpportunities,
    cross_session_exact_reuse_percent: crossSessionExactReusePercent,
    unique_url_keys: urlSessions.size,
    url_keys_spanning_sessions: urlKeysSpanningSessions,
    cross_session_url_reuse_opportunities: crossSessionUrlReuseOpportunities,
    cross_session_url_reuse_percent: crossSessionUrlReusePercent,
    classification: classifyOverlap({ eligibleCalls: eligible.length, crossSessionExactReusePercent }),
    interpretation: Object.freeze({
      exact_overlap_is_lower_bound_only: true,
      different_session_is_independence_proxy_only: true,
      observer_independence_proven: false,
      natural_workload_class_pass_authorized: false,
      seenrelay_reuse_authorized: false
    }),
    privacy: Object.freeze({
      raw_urls_retained: false,
      raw_prompts_retained: false,
      raw_results_retained: false,
      session_ids_retained: false,
      per_key_hashes_retained: false
    })
  });
}

export function screenDirectory(inputDir, options = {}) {
  const entries = fs.readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => entry.name)
    .sort();
  const parsed = entries.map((name) => parseTraceText(fs.readFileSync(path.join(inputDir, name), 'utf8'), { session: name }));
  return screenBrowserOverlap(parsed, options);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input-dir') args.inputDir = argv[++index];
    else if (token === '--source-revision') args.sourceRevision = argv[++index];
    else if (token === '--source-dataset') args.sourceDataset = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else throw new Error(`unknown argument: ${token}`);
  }
  if (!args.inputDir) throw new Error('--input-dir is required');
  if (!args.sourceRevision) throw new Error('--source-revision is required');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = screenDirectory(args.inputDir, {
    sourceRevision: args.sourceRevision,
    sourceDataset: args.sourceDataset || 'trace-commons/agent-traces'
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) fs.writeFileSync(args.output, json);
  else process.stdout.write(json);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
