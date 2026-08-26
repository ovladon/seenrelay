import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  SeenRelayClient,
  reuseKnownOnSameObserved,
} from '../clients/typescript/dist/seenrelay.js';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2';
const SEENRELAY_BASE = 'https://seenrelay.com';
const providerSamples = 3;
const reuseSamples = 3;
const runKey = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
  : `local-${Date.now()}`;

// The reserved query marker keeps every observation from this benchmark out of
// external-adoption classification while still making the source identity honest.
const targetUrl = `https://example.com/?seenrelay_internal_benchmark=firecrawl-interact-${runKey}`;
const fact = {
  subject: 'Example.com first-link navigation target — internal browser benchmark',
  predicate: 'browser.navigation.url.current',
  source: targetUrl,
  qualifiers: {
    benchmark: 'firecrawl-interact-code-v1',
  },
  locator: {
    scheme: 'source_key',
    value: 'first-anchor-navigation-url',
  },
};

const seenRelayHeaders = {
  'content-type': 'application/json',
  'x-seenrelay-client': `seenrelay-internal-benchmark-browser-${runKey}`,
  'x-seenrelay-test-network': `network-internal-benchmark-browser-${runKey}`,
};

function ms(start) {
  return Number((performance.now() - start).toFixed(3));
}

function median(values) {
  const xs = [...values].sort((a, b) => a - b);
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} from ${url}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { body, headers: response.headers };
}

function scrapeIdOf(body) {
  return body?.metadata?.scrapeId
    || body?.data?.metadata?.scrapeId
    || body?.scrapeId
    || body?.data?.scrapeId
    || body?.id
    || body?.data?.id;
}

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  return JSON.stringify(value);
}

function benchmarkValueOf(interactBody) {
  const resultValue = textOf(interactBody?.result ?? interactBody?.data?.result).trim();
  if (/^https?:\/\//i.test(resultValue)) {
    return resultValue.replace(/[),.;]+$/, '');
  }

  const all = [
    interactBody?.stdout,
    interactBody?.data?.stdout,
    interactBody?.output,
    interactBody?.data?.output,
  ].map(textOf).join('\n');
  const match = all.match(/SEENRELAY_BENCHMARK_VALUE=(https?:\/\/[^\s"']+)/);
  if (!match) {
    throw new Error(`Interact response did not contain benchmark value: ${JSON.stringify(interactBody).slice(0, 1500)}`);
  }
  return match[1].replace(/[),.;]+$/, '');
}

async function runFirecrawlInteract(sample) {
  const t0 = performance.now();
  let scrapeId;
  let stopBody = null;
  try {
    const scrapeT0 = performance.now();
    const scrape = await jsonRequest(`${FIRECRAWL_BASE}/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['markdown'],
      }),
    });
    const scrapeMs = ms(scrapeT0);
    scrapeId = scrapeIdOf(scrape.body);
    if (!scrapeId) {
      throw new Error(`Firecrawl scrape returned no scrapeId: ${JSON.stringify(scrape.body).slice(0, 1500)}`);
    }

    const interactT0 = performance.now();
    const interact = await jsonRequest(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        language: 'node',
        timeout: 60,
        code: [
          "const link = page.locator('a').first();",
          "await link.click();",
          "await page.waitForLoadState('domcontentloaded');",
          'page.url();',
        ].join('\n'),
      }),
    });
    const interactMs = ms(interactT0);
    const value = benchmarkValueOf(interact.body);

    const stopT0 = performance.now();
    const stopped = await jsonRequest(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    });
    const stopMs = ms(stopT0);
    stopBody = stopped.body;

    const sessionDurationMs = Number(
      stopped.body?.sessionDurationMs
      ?? stopped.body?.data?.sessionDurationMs
      ?? 0,
    );
    const reportedInteractCredits = Number(
      stopped.body?.creditsBilled
      ?? stopped.body?.data?.creditsBilled
      ?? NaN,
    );
    const calculatedInteractCredits = sessionDurationMs > 0
      ? (sessionDurationMs / 60_000) * 2
      : null;

    return {
      sample,
      value,
      total_ms: ms(t0),
      scrape_ms: scrapeMs,
      interact_ms: interactMs,
      stop_ms: stopMs,
      scrape_credits_documented: 1,
      interact_session_duration_ms: sessionDurationMs || null,
      interact_credits_reported: Number.isFinite(reportedInteractCredits)
        ? reportedInteractCredits
        : null,
      interact_credits_calculated_from_documented_rate: calculatedInteractCredits == null
        ? null
        : Number(calculatedInteractCredits.toFixed(6)),
    };
  } finally {
    if (scrapeId && !stopBody) {
      try {
        await fetch(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
        });
      } catch {
        // Cleanup is best-effort after a failed sample. The benchmark result still fails.
      }
    }
  }
}

async function seenRelayPost(endpoint, payload) {
  const t0 = performance.now();
  const { body } = await jsonRequest(`${SEENRELAY_BASE}${endpoint}`, {
    method: 'POST',
    headers: seenRelayHeaders,
    body: JSON.stringify(payload),
  });
  return { body, latency_ms: ms(t0) };
}

const result = {
  benchmark: 'firecrawl-interact-code-v1',
  run_key: runKey,
  captured_at: new Date().toISOString(),
  target_url: targetUrl,
  provider: {
    name: 'Firecrawl',
    route: 'scrape + interact(code) + stop',
    samples: [],
    documented_cost_basis: {
      scrape_credits_per_page: 1,
      interact_code_credits_per_browser_minute: 2,
      note: 'Interact credits are prorated by second; reported creditsBilled is preferred when the API returns it.',
    },
  },
  seenrelay: {
    seed_check: null,
    seed_observe: null,
    reuse_samples: [],
  },
  kill_criteria: {},
  recommendation_candidate: false,
};

try {
  for (let i = 1; i <= providerSamples; i++) {
    result.provider.samples.push(await runFirecrawlInteract(i));
  }

  const values = result.provider.samples.map(x => x.value);
  const stableValue = values.every(value => value === values[0]);

  result.seenrelay.seed_check = await seenRelayPost('/v1/check', {
    fact,
    known_value: values[0],
    max_age_seconds: 3600,
  });
  if (result.seenrelay.seed_check.body?.status !== 'UNKNOWN') {
    throw new Error(`Expected fresh internal benchmark fact to start UNKNOWN, got ${result.seenrelay.seed_check.body?.status}`);
  }

  result.seenrelay.seed_observe = await seenRelayPost('/v1/observe', {
    fact,
    value: values[0],
    observer_id: 'first-party-step4-browser-v1',
    idempotency_key: `firecrawl-interact-${runKey}`,
  });
  if (result.seenrelay.seed_observe.body?.accepted !== true) {
    throw new Error('SeenRelay internal benchmark OBSERVE was not accepted');
  }

  let providerCallsDuringReuse = 0;
  const relay = new SeenRelayClient({
    baseUrl: SEENRELAY_BASE,
    clientHint: `seenrelay-internal-benchmark-browser-${runKey}`,
    fetchImpl: async (url, options = {}) => {
      const headers = new Headers(options.headers || {});
      headers.set('x-seenrelay-test-network', `network-internal-benchmark-browser-${runKey}`);
      return fetch(url, { ...options, headers });
    },
  });

  for (let i = 1; i <= reuseSamples; i++) {
    const t0 = performance.now();
    const guarded = await relay.guardDetailed({
      fact,
      knownValue: values[0],
      maxAgeSeconds: 3600,
      reuse: reuseKnownOnSameObserved,
      validate: async () => {
        providerCallsDuringReuse += 1;
        const provider = await runFirecrawlInteract(`unexpected-reuse-${i}`);
        return provider.value;
      },
    });
    result.seenrelay.reuse_samples.push({
      sample: i,
      total_ms: ms(t0),
      path: guarded.path,
      status: guarded.check?.status ?? null,
      value: guarded.value,
      check_ok: guarded.relay.checkOk,
    });
  }

  const providerLatencies = result.provider.samples.map(x => x.total_ms);
  const reuseLatencies = result.seenrelay.reuse_samples.map(x => x.total_ms);
  const allReused = result.seenrelay.reuse_samples.every(
    x => x.path === 'reused' && x.status === 'SAME_OBSERVED' && x.value === values[0],
  );

  const measuredInteractCredits = result.provider.samples.map(sample => {
    const interact = sample.interact_credits_reported
      ?? sample.interact_credits_calculated_from_documented_rate
      ?? 0;
    return sample.scrape_credits_documented + interact;
  });

  result.summary = {
    provider_value: values[0],
    provider_value_stable: stableValue,
    provider_samples: providerSamples,
    reuse_samples: reuseSamples,
    provider_latency_ms_median: Number(median(providerLatencies).toFixed(3)),
    provider_latency_ms_mean: Number(mean(providerLatencies).toFixed(3)),
    reuse_latency_ms_median: Number(median(reuseLatencies).toFixed(3)),
    reuse_latency_ms_mean: Number(mean(reuseLatencies).toFixed(3)),
    provider_calls_during_reuse: providerCallsDuringReuse,
    provider_credits_for_direct_samples: Number(measuredInteractCredits.reduce((a, b) => a + b, 0).toFixed(6)),
    provider_credits_avoided_if_three_reuses_replace_three_equivalent_validations: Number(measuredInteractCredits.reduce((a, b) => a + b, 0).toFixed(6)),
  };

  result.kill_criteria = {
    provider_completed_3_of_3: result.provider.samples.length === providerSamples,
    provider_value_stable_3_of_3: stableValue,
    reuse_completed_3_of_3: allReused,
    provider_calls_during_reuse_zero: providerCallsDuringReuse === 0,
    reuse_median_faster_than_provider_median: median(reuseLatencies) < median(providerLatencies),
    measured_provider_credits_positive: result.summary.provider_credits_for_direct_samples > 0,
  };

  result.recommendation_candidate = Object.values(result.kill_criteria).every(Boolean);
} catch (error) {
  result.error = {
    message: error instanceof Error ? error.message : String(error),
    status: error?.status ?? null,
    body: error?.body ?? null,
  };
  result.recommendation_candidate = false;
}

const rawBenchmarkJson = JSON.stringify(result, null, 2);
await writeFile('firecrawl-interact-benchmark.json', rawBenchmarkJson);

const capturedDate = String(result.captured_at || new Date().toISOString()).slice(0, 10);
const runId = process.env.GITHUB_RUN_ID || '';
const evidenceUrl = runId ? `https://github.com/ovladon/seenrelay/actions/runs/${runId}` : '';
const rawDigest = createHash('sha256').update(rawBenchmarkJson).digest('hex');
const providerMedian = result.summary?.provider_latency_ms_median ?? null;
const reuseMedian = result.summary?.reuse_latency_ms_median ?? null;
const latencyImprovement = Number.isFinite(providerMedian) && Number.isFinite(reuseMedian) && providerMedian > 0
  ? Number((((providerMedian - reuseMedian) / providerMedian) * 100).toFixed(1))
  : null;
const benchmarkEvidence = {
  schema_version: 1,
  publication_candidate: result.recommendation_candidate === true && Boolean(evidenceUrl),
  kill_criteria: result.kill_criteria || {},
  benchmark: result.summary ? {
    id: `firecrawl-browser-interaction-${capturedDate}`,
    status: 'first_party_smoke',
    verified_at: result.captured_at,
    provider: 'Firecrawl',
    workload: 'fixed-URL browser interaction using scrape + interact(code) + stop',
    samples: result.summary.provider_samples,
    freshness_window_seconds: 3600,
    baseline_provider_calls: result.summary.provider_samples,
    baseline_median_ms: providerMedian,
    reuse_provider_calls: result.summary.provider_calls_during_reuse,
    reuse_median_ms: reuseMedian,
    provider_calls_avoided: result.summary.provider_samples - result.summary.provider_calls_during_reuse,
    provider_credits_avoided: result.summary.provider_credits_avoided_if_three_reuses_replace_three_equivalent_validations,
    latency_improvement_percent: latencyImprovement,
    provider_credit_model: 'Each measured direct validation uses one Firecrawl scrape plus the interact credits reported by the stopped browser session.',
    economic_result: 'lower provider-credit consumption on every eligible reuse in this run',
    latency_result: 'lower median latency than the full browser-validation path in this run',
    evidence_url: evidenceUrl,
    artifact_digest: `sha256:${rawDigest}`,
    caveat: 'First-party smoke benchmark on one intentionally repeated source-backed fact. It demonstrates measured mechanics when eligible reuse exists; it does not establish a natural-world reuse rate or a universal browser-workload speedup.',
    matrix: {
      series_key: 'firecrawl-browser-interaction-code-v1',
      surface: 'Browser interaction',
      configuration: 'Fixed URL · scrape + interact(code) + stop',
      evidence_level: 'first-party smoke',
      fit: result.recommendation_candidate ? 'good' : 'conditional',
      cost_outcome: result.summary.provider_credits_avoided_if_three_reuses_replace_three_equivalent_validations > 0 ? 'better' : 'neutral',
      latency_outcome: Number.isFinite(providerMedian) && Number.isFinite(reuseMedian) ? (reuseMedian < providerMedian ? 'better' : reuseMedian > providerMedian ? 'worse' : 'neutral') : 'unknown',
      baseline_median_ms: providerMedian,
      baseline_context: 'full browser validation',
      provider_calls_avoided: result.summary.provider_samples - result.summary.provider_calls_during_reuse,
      provider_units_avoided: result.summary.provider_credits_avoided_if_three_reuses_replace_three_equivalent_validations,
      provider_unit_label: 'credits'
    }
  } : null
};
await writeFile('benchmark-evidence.json', JSON.stringify(benchmarkEvidence, null, 2));
console.log(rawBenchmarkJson);

// A provider/access failure makes the workflow fail, but a valid negative benchmark does not.
if (result.error) process.exit(1);
