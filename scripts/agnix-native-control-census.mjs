#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const REPORT_SCHEMA = 'seenrelay-native-control-census-v1';
export const STATE_SCHEMA = 'seenrelay-agnix-native-state-v1';
const DEFAULT_DEFINITION = 'https://raw.githubusercontent.com/agent-sh/agnix/main/.github/tool-release-baselines.json';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function finiteMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export function selectStableRelease(releases, tagRegex = '') {
  if (!Array.isArray(releases)) return null;
  const matcher = tagRegex ? new RegExp(tagRegex) : null;
  return releases.find((item) => item && item.draft !== true && item.prerelease !== true &&
    typeof item.tag_name === 'string' && (!matcher || matcher.test(item.tag_name))) || null;
}

export function selectTag(tags, tagRegex = '') {
  if (!Array.isArray(tags)) return null;
  const matcher = tagRegex ? new RegExp(tagRegex) : null;
  const item = tags.find((entry) => entry && typeof entry.name === 'string' && (!matcher || matcher.test(entry.name)));
  return item?.name || null;
}

export function extractHtmlVersion(body, versionRegex) {
  if (typeof body !== 'string' || typeof versionRegex !== 'string' || !versionRegex) return null;
  const match = body.match(new RegExp(versionRegex));
  if (!match) return null;
  const raw = match[0];
  if (/^https?:\/\//i.test(raw)) {
    const parts = raw.replace(/\/+$/, '').split('/');
    return parts.at(-1) || null;
  }
  return raw;
}

export function classifyTool(tool) {
  if (tool?.github_repo) return 'github_repo';
  if (tool?.html_url && tool?.version_regex) return 'html_url';
  if (tool?.commit_repo && tool?.commit_path) return 'commit_path';
  return 'unsupported';
}

function freshState() {
  return {
    schema: STATE_SCHEMA,
    salt: crypto.randomBytes(32).toString('hex'),
    commissioned: false,
    sources: {},
    cumulative: {
      natural_runs: 0,
      logical_validations: 0,
      successful_validations: 0,
      failed_validations: 0,
      network_requests: 0,
      conditional_requests: 0,
      not_modified_304: 0,
      ok_200: 0
    }
  };
}

export function loadState(statePath) {
  if (!statePath || !fs.existsSync(statePath)) return freshState();
  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (parsed?.schema !== STATE_SCHEMA || typeof parsed.salt !== 'string' || !parsed.salt) {
    throw new Error('native-control census state has an unsupported schema');
  }
  parsed.sources ||= {};
  parsed.cumulative ||= freshState().cumulative;
  parsed.commissioned = parsed.commissioned === true;
  return parsed;
}

export function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`, 'utf8');
}

function stateKey(state, coordinate) {
  return sha256(`${state.salt}\u0000${coordinate}`);
}

function apiUrl(endpoint, params = null) {
  const url = new URL(`https://api.github.com/${endpoint.replace(/^\//, '')}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function requestHeaders(url, token, previous) {
  const headers = {
    'accept': 'application/vnd.github+json',
    'user-agent': 'seenrelay-native-control-census/1'
  };
  if (new URL(url).hostname === 'api.github.com' && token) headers.authorization = `Bearer ${token}`;
  if (previous?.etag) headers['if-none-match'] = previous.etag;
  else if (previous?.last_modified) headers['if-modified-since'] = previous.last_modified;
  return headers;
}

function emptyMetrics() {
  return {
    network_requests: 0,
    conditional_requests: 0,
    not_modified_304: 0,
    ok_200: 0,
    other_status: 0,
    validator_bearing_200: 0,
    validator_missing_200: 0,
    response_changed_200: 0,
    response_unchanged_200: 0,
    latencies_ms: []
  };
}

export function createRequester({ fetchImpl = fetch, token = '', state, metrics }) {
  return async function request(url) {
    const key = stateKey(state, `GET ${url}`);
    const previous = state.sources[key] || null;
    const headers = requestHeaders(url, token, previous);
    const conditional = Boolean(headers['if-none-match'] || headers['if-modified-since']);
    const started = performance.now();
    let response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers, redirect: 'follow' });
    } catch (error) {
      const elapsed = finiteMs(performance.now() - started);
      metrics.network_requests += 1;
      metrics.latencies_ms.push(elapsed);
      if (conditional) metrics.conditional_requests += 1;
      return { ok: false, status: 0, key, error: String(error), selectedVersion: null };
    }
    const elapsed = finiteMs(performance.now() - started);
    metrics.network_requests += 1;
    metrics.latencies_ms.push(elapsed);
    if (conditional) metrics.conditional_requests += 1;

    if (response.status === 304) {
      metrics.not_modified_304 += 1;
      if (!previous?.selected_version) {
        return { ok: false, status: 304, key, error: '304 without cached selected version', selectedVersion: null };
      }
      return {
        ok: true,
        status: 304,
        key,
        body: null,
        selectedVersion: previous.selected_version,
        unchanged: true
      };
    }

    if (response.status !== 200) {
      metrics.other_status += 1;
      return { ok: false, status: response.status, key, error: `HTTP ${response.status}`, selectedVersion: null };
    }

    metrics.ok_200 += 1;
    const body = await response.text();
    const bodyHash = sha256(body);
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');
    if (etag || lastModified) metrics.validator_bearing_200 += 1;
    else metrics.validator_missing_200 += 1;
    if (previous?.body_hash) {
      if (previous.body_hash === bodyHash) metrics.response_unchanged_200 += 1;
      else metrics.response_changed_200 += 1;
    }
    state.sources[key] = {
      body_hash: bodyHash,
      etag: etag || null,
      last_modified: lastModified || null,
      selected_version: null
    };
    return { ok: true, status: 200, key, body, selectedVersion: null, unchanged: previous?.body_hash === bodyHash };
  };
}

function retainSelectedVersion(state, key, version) {
  const entry = state.sources[key];
  if (entry) entry.selected_version = version;
}

async function githubRepoVersion(tool, request, state) {
  const tagRegex = typeof tool.release_tag_regex === 'string' ? tool.release_tag_regex : '';
  let primary;
  if (tagRegex) {
    primary = await request(apiUrl(`repos/${tool.github_repo}/releases`, { per_page: 100 }));
    if (primary.ok) {
      if (primary.status === 304) return primary.selectedVersion;
      try {
        const selected = selectStableRelease(JSON.parse(primary.body), tagRegex)?.tag_name || null;
        if (selected) {
          retainSelectedVersion(state, primary.key, selected);
          return selected;
        }
      } catch {
        return null;
      }
    }
  } else {
    primary = await request(apiUrl(`repos/${tool.github_repo}/releases/latest`));
    if (primary.ok) {
      if (primary.status === 304) return primary.selectedVersion;
      try {
        const selected = JSON.parse(primary.body)?.tag_name || null;
        if (typeof selected === 'string' && selected) {
          retainSelectedVersion(state, primary.key, selected);
          return selected;
        }
      } catch {
        return null;
      }
    }
  }

  const fallback = await request(apiUrl(`repos/${tool.github_repo}/tags`, { per_page: 100 }));
  if (!fallback.ok) return null;
  if (fallback.status === 304) return fallback.selectedVersion;
  try {
    const selected = selectTag(JSON.parse(fallback.body), tagRegex);
    if (selected) retainSelectedVersion(state, fallback.key, selected);
    return selected;
  } catch {
    return null;
  }
}

async function htmlVersion(tool, request, state) {
  const result = await request(tool.html_url);
  if (!result.ok) return null;
  if (result.status === 304) return result.selectedVersion;
  const selected = extractHtmlVersion(result.body, tool.version_regex);
  if (selected) retainSelectedVersion(state, result.key, selected);
  return selected;
}

async function commitPathVersion(tool, request, state) {
  const result = await request(apiUrl(`repos/${tool.commit_repo}/commits`, { path: tool.commit_path, per_page: 1 }));
  if (!result.ok) return null;
  if (result.status === 304) return result.selectedVersion;
  try {
    const sha = JSON.parse(result.body)?.[0]?.sha;
    const selected = typeof sha === 'string' && sha ? sha.slice(0, 12) : null;
    if (selected) retainSelectedVersion(state, result.key, selected);
    return selected;
  } catch {
    return null;
  }
}

export async function runCensus({ definition, state = freshState(), token = '', fetchImpl = fetch, requestedMode = 'commissioning' }) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition) || typeof definition.tools !== 'object') {
    throw new TypeError('Agnix definition must contain a tools object');
  }
  if (!['commissioning', 'natural'].includes(requestedMode)) throw new TypeError('requestedMode must be commissioning or natural');

  const effectiveMode = requestedMode === 'natural' && state.commissioned ? 'natural' : 'commissioning';
  const metrics = emptyMetrics();
  const request = createRequester({ fetchImpl, token, state, metrics });
  const sourceKinds = { github_repo: 0, html_url: 0, commit_path: 0, unsupported: 0 };
  let attempted = 0;
  let successful = 0;
  let failed = 0;
  let baselineMatches = 0;
  let baselineChanges = 0;

  const toolEntries = Object.entries(definition.tools).filter(([, tool]) => tool?.tracked === true);
  for (const [, tool] of toolEntries) {
    const kind = classifyTool(tool);
    sourceKinds[kind] += 1;
    attempted += 1;
    let version = null;
    if (kind === 'github_repo') version = await githubRepoVersion(tool, request, state);
    else if (kind === 'html_url') version = await htmlVersion(tool, request, state);
    else if (kind === 'commit_path') version = await commitPathVersion(tool, request, state);

    if (!version) {
      failed += 1;
      continue;
    }
    successful += 1;
    if (version === tool.last_known_version) baselineMatches += 1;
    else baselineChanges += 1;
  }

  const complete = attempted > 0 && failed === 0 && successful === attempted;
  if (complete && effectiveMode === 'commissioning') state.commissioned = true;
  if (complete && effectiveMode === 'natural') {
    state.cumulative.natural_runs += 1;
    state.cumulative.logical_validations += attempted;
    state.cumulative.successful_validations += successful;
    state.cumulative.failed_validations += failed;
    state.cumulative.network_requests += metrics.network_requests;
    state.cumulative.conditional_requests += metrics.conditional_requests;
    state.cumulative.not_modified_304 += metrics.not_modified_304;
    state.cumulative.ok_200 += metrics.ok_200;
  }

  const latencies = metrics.latencies_ms;
  const report = {
    schema: REPORT_SCHEMA,
    workload: 'agnix-tool-release-watch',
    evidence_class: 'pre-benchmark-native-control-census',
    benchmark_evidence: false,
    audit_verdict: null,
    hosted_operations: { check: 0, observe: 0 },
    requested_mode: requestedMode,
    effective_mode: effectiveMode,
    complete,
    definition: {
      schema_version: definition.version ?? null,
      tracked_tools: toolEntries.length,
      source_kinds: sourceKinds,
      fingerprint: `sha256:${sha256(JSON.stringify(definition))}`
    },
    logical_validations: {
      attempted,
      successful,
      failed,
      baseline_matches: baselineMatches,
      baseline_changes: baselineChanges,
      eligible_natural_calls_this_run: complete && effectiveMode === 'natural' ? attempted : 0
    },
    native_control: {
      network_requests: metrics.network_requests,
      conditional_requests: metrics.conditional_requests,
      not_modified_304: metrics.not_modified_304,
      ok_200: metrics.ok_200,
      other_status: metrics.other_status,
      validator_bearing_200: metrics.validator_bearing_200,
      validator_missing_200: metrics.validator_missing_200,
      response_changed_200: metrics.response_changed_200,
      response_unchanged_200: metrics.response_unchanged_200,
      conditional_304_rate: metrics.conditional_requests > 0 ? metrics.not_modified_304 / metrics.conditional_requests : null,
      latency_ms_total: latencies.reduce((sum, value) => sum + value, 0),
      latency_ms_p50: percentile(latencies, 0.5),
      latency_ms_p95: percentile(latencies, 0.95)
    },
    cumulative_natural: { ...state.cumulative },
    privacy: {
      raw_source_identities_exported: false,
      raw_versions_exported: false,
      raw_response_bodies_exported: false,
      state_keys_salted: true
    },
    interpretation: {
      savings_proven: false,
      shared_check_value_proven: false,
      automatic_reuse_authorized: false,
      public_claim_authorized: false,
      next_step: complete
        ? (effectiveMode === 'commissioning' ? 'RUN_NATURALLY_WITH_NATIVE_CONTROLS' : 'KEEP_ACCUMULATING_NATIVE_CONTROL_CENSUS')
        : 'FIX_FIDELITY_OR_SOURCE_FAILURES_BEFORE_COUNTING_ANY_CALLS'
    }
  };
  return { report, state };
}

async function fetchDefinition(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { 'user-agent': 'seenrelay-native-control-census/1' } });
  if (!response.ok) throw new Error(`failed to fetch Agnix workload definition: HTTP ${response.status}`);
  return response.json();
}

function parseArgs(argv) {
  const out = {
    state: '.seenrelay-research/agnix-native-state.json',
    output: 'agnix-native-control-census.json',
    mode: process.env.CENSUS_MODE || 'commissioning',
    definition: process.env.AGNIX_DEFINITION_URL || DEFAULT_DEFINITION
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--state' && value) { out.state = value; i += 1; }
    else if (arg === '--output' && value) { out.output = value; i += 1; }
    else if (arg === '--mode' && value) { out.mode = value; i += 1; }
    else if (arg === '--definition' && value) { out.definition = value; i += 1; }
    else throw new Error(`unknown or incomplete argument: ${arg}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const definition = await fetchDefinition(args.definition);
  const state = loadState(args.state);
  const { report, state: nextState } = await runCensus({
    definition,
    state,
    token: process.env.GITHUB_TOKEN || '',
    requestedMode: args.mode
  });
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (report.complete) saveState(args.state, nextState);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.complete) process.exitCode = 2;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
