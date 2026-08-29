import fs from 'node:fs/promises';

const baselineRaw = process.env.SEENRELAY_BASELINE_URL?.trim() || 'https://seenrelay.com';
const candidateRaw = process.env.SEENRELAY_CANDIDATE_URL?.trim();
if (!candidateRaw) throw new Error('SEENRELAY_CANDIDATE_URL is required');

const baseline = new URL(baselineRaw);
const candidate = new URL(candidateRaw);
if (baseline.origin !== 'https://seenrelay.com') throw new Error('Baseline must be https://seenrelay.com');
if (candidate.protocol !== 'https:') throw new Error('Candidate must use https');
if (candidate.hostname === 'seenrelay.com' || candidate.hostname === 'www.seenrelay.com') {
  throw new Error('Candidate must be an isolated Preview deployment');
}

const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || '';
const samples = Number.parseInt(process.env.SEENRELAY_CHECK_SEMANTIC_PROBE_SAMPLES || '21', 10);
if (!Number.isSafeInteger(samples) || samples < 3 || samples > 30) {
  throw new Error('SEENRELAY_CHECK_SEMANTIC_PROBE_SAMPLES must be 3..30');
}
const runKey = `${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
const benchmarkMarker = `seenrelay_internal_benchmark=check-semantic-${encodeURIComponent(runKey)}`;

const fact = {
  subject: 'Controlled observed CHECK semantic latency probe',
  predicate: 'latency.semantic_probe',
  source: `https://seenrelay.com/benchmarks/check-semantic?${benchmarkMarker}`,
  locator: { scheme: 'source_key', value: `check-semantic-${runKey}` }
};
const knownValue = { state: 'stable', revision: 1 };

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(3));
}

function stats(values) {
  return {
    samples: values.length,
    p50_ms: percentile(values, 50),
    p95_ms: percentile(values, 95),
    min_ms: Number(Math.min(...values).toFixed(3)),
    max_ms: Number(Math.max(...values).toFixed(3)),
    mean_ms: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3))
  };
}

function headersFor(target, lease) {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-seenrelay-client': `seenrelay-internal-check-semantic-${runKey}`
  });
  if (lease) headers.set('x-seenrelay-lease', lease);
  if (target.kind === 'candidate' && bypassSecret) headers.set('x-vercel-protection-bypass', bypassSecret);
  if (target.kind === 'candidate') headers.set('x-seenrelay-test-network', `check-semantic-${runKey}`);
  return headers;
}

async function post(target, endpoint, payload, lease = '') {
  const started = performance.now();
  const response = await fetch(new URL(endpoint, target.url), {
    method: 'POST',
    headers: headersFor(target, lease),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  });
  const latencyMs = performance.now() - started;
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {
    throw new Error(`${target.kind} ${endpoint} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) throw new Error(`${target.kind} ${endpoint} HTTP ${response.status}: ${body?.error?.code || 'unknown'}`);
  return { body, latencyMs, lease: response.headers.get('x-seenrelay-lease') || lease };
}

async function waitForCandidateSha() {
  const expected = process.env.RELEASE_SHA?.trim();
  if (!expected) return;
  for (let attempt = 0; attempt < 60; attempt++) {
    const headers = new Headers();
    if (bypassSecret) headers.set('x-vercel-protection-bypass', bypassSecret);
    try {
      const response = await fetch(new URL('/healthz', candidate), { headers, signal: AbortSignal.timeout(10_000) });
      const body = await response.json();
      if (response.ok && body?.ok === true && body?.environment === 'preview' && body?.deployment_sha === expected) return;
    } catch {
      // Preview may not be ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Candidate Preview did not converge to RELEASE_SHA');
}

async function measure(target) {
  let lease = '';
  const checkPayload = { fact, known_value: knownValue, max_age_seconds: 300 };

  // Establish a stable lease outside the measured sample. The fact is unique per workflow run.
  const initial = await post(target, '/v1/check', checkPayload, lease);
  lease = initial.lease;
  if (initial.body?.status !== 'UNKNOWN') {
    throw new Error(`${target.kind} initial CHECK expected UNKNOWN, got ${initial.body?.status}`);
  }

  // Seed one controlled first-party observation. Setup latency is excluded from CHECK measurements.
  const observed = await post(target, '/v1/observe', {
    fact,
    value: knownValue,
    observed_at: new Date().toISOString(),
    observer_id: 'seenrelay-internal-check-semantic-v1',
    idempotency_key: `check-semantic/${runKey}/${target.kind}`
  }, lease);
  lease = observed.lease;
  if (observed.body?.accepted !== true && observed.body?.deduplicated !== true) {
    throw new Error(`${target.kind} benchmark setup OBSERVE was not accepted/deduplicated`);
  }

  // Warm query planning, connection and deployment effects after the fact exists.
  const warm = await post(target, '/v1/check', checkPayload, lease);
  lease = warm.lease;
  if (warm.body?.status !== 'SAME_OBSERVED') {
    throw new Error(`${target.kind} warm CHECK expected SAME_OBSERVED, got ${warm.body?.status}`);
  }

  const latencies = [];
  const statuses = {};
  for (let i = 0; i < samples; i++) {
    const result = await post(target, '/v1/check', checkPayload, lease);
    lease = result.lease;
    const status = String(result.body?.status || 'MISSING');
    statuses[status] = (statuses[status] || 0) + 1;
    if (status !== 'SAME_OBSERVED') {
      throw new Error(`${target.kind} sample CHECK expected SAME_OBSERVED, got ${status}`);
    }
    latencies.push(result.latencyMs);
  }

  return {
    ...stats(latencies),
    statuses,
    warmup_excluded: true,
    measured_operation: 'CHECK',
    measured_observe_requests: 0,
    setup_observe_requests: 1
  };
}

await waitForCandidateSha();
const baselineResult = await measure({ kind: 'baseline', url: baseline });
const candidateResult = await measure({ kind: 'candidate', url: candidate });
const result = {
  schema_version: 1,
  benchmark: 'seenrelay-check-semantic-comparison-v1',
  first_party: true,
  external_adoption_evidence: false,
  head_sha: process.env.RELEASE_SHA || null,
  samples_per_target: samples,
  baseline: baselineResult,
  candidate: candidateResult,
  delta: {
    p50_ms: Number((candidateResult.p50_ms - baselineResult.p50_ms).toFixed(3)),
    p95_ms: Number((candidateResult.p95_ms - baselineResult.p95_ms).toFixed(3)),
    mean_ms: Number((candidateResult.mean_ms - baselineResult.mean_ms).toFixed(3)),
    p50_percent: baselineResult.p50_ms > 0
      ? Number((((candidateResult.p50_ms - baselineResult.p50_ms) / baselineResult.p50_ms) * 100).toFixed(2))
      : null,
    p95_percent: baselineResult.p95_ms > 0
      ? Number((((candidateResult.p95_ms - baselineResult.p95_ms) / baselineResult.p95_ms) * 100).toFixed(2))
      : null,
    mean_percent: baselineResult.mean_ms > 0
      ? Number((((candidateResult.mean_ms - baselineResult.mean_ms) / baselineResult.mean_ms) * 100).toFixed(2))
      : null
  },
  caveat: 'First-party directional comparison across Production and isolated Preview. Setup OBSERVE requests are excluded. Environment variance means this is evidence for regression/improvement direction, not a universal latency claim.'
};
await fs.writeFile('check-semantic-probe.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ event: 'check_semantic_probe', ...result }));
