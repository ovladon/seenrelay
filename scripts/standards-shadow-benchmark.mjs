import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { SeenRelayClient, reuseKnownOnSameObserved } from '../clients/typescript/dist/seenrelay.js';
import { SeenRelayShadowProof } from '../clients/typescript/dist/shadow-proof.js';
import { evaluateHostileBenchmark } from './evaluate-hostile-benchmark.mjs';

const DEFAULT_ORIGIN = 'https://seenrelay.com';
const WORKLOAD_ID = 'standards-watch-daily-v1';
const MAX_AGE_SECONDS = 6 * 60 * 60;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseTrackedStandards(source) {
  const pick = (re, label) => {
    const match = source.match(re);
    if (!match?.[1]) throw new Error(`Unable to read ${label} from src/standards.ts`);
    return match[1];
  };
  return {
    mcp: pick(/mcp:\s*\{[\s\S]*?implemented:\s*'([^']+)'/, 'MCP revision'),
    mcp_sdk: pick(/sdk:\s*'@modelcontextprotocol\/server@([^']+)'/, 'MCP SDK'),
    a2a: pick(/a2a:\s*\{[\s\S]*?tracked:\s*'([^']+)'/, 'A2A revision'),
    otel: pick(/opentelemetry_semconv_tracked:\s*'([^']+)'/, 'OpenTelemetry semantic conventions')
  };
}

function hasSourceValidator(headers) {
  return Boolean(headers?.get?.('etag') || headers?.get?.('last-modified'));
}

async function readJson(response, label) {
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}

function sourceDefinitions(tracked, githubToken) {
  const githubHeaders = {
    accept: 'application/vnd.github+json',
    'user-agent': 'seenrelay-standards-shadow/1.0',
    ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {})
  };
  const npmHeaders = { accept: 'application/json', 'user-agent': 'seenrelay-standards-shadow/1.0' };

  return [
    {
      knownValue: tracked.mcp,
      fact: {
        subject: 'Latest MCP specification revision',
        predicate: 'version.latest',
        source: 'https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification?ref=main',
        locator: { scheme: 'source_key', value: 'latest-dated-specification-directory' }
      },
      async validate(fetchImpl) {
        const response = await fetchImpl(this.fact.source, { headers: githubHeaders, signal: AbortSignal.timeout(15_000) });
        const data = await readJson(response, 'MCP specification');
        const versions = data.map((entry) => entry?.name).filter((name) => /^20\d\d-\d\d-\d\d$/.test(name)).sort();
        if (!versions.length) throw new Error('MCP specification: no dated revisions found');
        return { value: versions.at(-1), sourceValidatorAvailable: hasSourceValidator(response.headers) };
      }
    },
    {
      knownValue: tracked.mcp_sdk,
      fact: {
        subject: 'Latest MCP TypeScript server SDK version',
        predicate: 'version.latest',
        source: 'https://registry.npmjs.org/%40modelcontextprotocol%2Fserver/latest',
        locator: { scheme: 'json_pointer', value: '/version' }
      },
      async validate(fetchImpl) {
        const response = await fetchImpl(this.fact.source, { headers: npmHeaders, signal: AbortSignal.timeout(15_000) });
        const data = await readJson(response, 'MCP server SDK');
        if (typeof data?.version !== 'string' || !data.version) throw new Error('MCP server SDK: version missing');
        return { value: data.version, sourceValidatorAvailable: hasSourceValidator(response.headers) };
      }
    },
    {
      knownValue: tracked.a2a,
      fact: {
        subject: 'Latest A2A specification release',
        predicate: 'version.latest',
        source: 'https://api.github.com/repos/a2aproject/A2A/releases/latest',
        locator: { scheme: 'source_key', value: 'normalized-latest-release-tag' }
      },
      async validate(fetchImpl) {
        const response = await fetchImpl(this.fact.source, { headers: githubHeaders, signal: AbortSignal.timeout(15_000) });
        const data = await readJson(response, 'A2A release');
        const value = typeof data?.tag_name === 'string' ? data.tag_name.replace(/^v/, '') : '';
        if (!value) throw new Error('A2A release: tag missing');
        return { value, sourceValidatorAvailable: hasSourceValidator(response.headers) };
      }
    },
    {
      knownValue: tracked.otel,
      fact: {
        subject: 'Latest OpenTelemetry semantic conventions release',
        predicate: 'version.latest',
        source: 'https://api.github.com/repos/open-telemetry/semantic-conventions/releases/latest',
        locator: { scheme: 'source_key', value: 'normalized-latest-release-tag' }
      },
      async validate(fetchImpl) {
        const response = await fetchImpl(this.fact.source, { headers: githubHeaders, signal: AbortSignal.timeout(15_000) });
        const data = await readJson(response, 'OpenTelemetry semantic conventions release');
        const value = typeof data?.tag_name === 'string' ? data.tag_name.replace(/^v/, '') : '';
        if (!value) throw new Error('OpenTelemetry semantic conventions release: tag missing');
        return { value, sourceValidatorAvailable: hasSourceValidator(response.headers) };
      }
    }
  ];
}

class CheckOnlyShadowClient {
  constructor({ baseUrl = DEFAULT_ORIGIN, fetchImpl = fetch } = {}) {
    this.relay = new SeenRelayClient({
      baseUrl,
      fetchImpl,
      clientHint: 'seenrelay-first-party-standards-shadow-v1'
    });
  }

  getTelemetry() { return this.relay.getTelemetry(); }
  resetTelemetry() { this.relay.resetTelemetry(); }

  async guardDetailed(options) {
    let check = null;
    let checkOk = false;
    let checkError;
    const checkStarted = nowMs();
    try {
      check = await this.relay.check(options.fact, options.knownValue, options.maxAgeSeconds);
      checkOk = true;
    } catch (error) {
      checkError = errorText(error);
    }
    const checkMs = Math.max(0, nowMs() - checkStarted);

    const validationStarted = nowMs();
    const value = await options.validate({ check, conditionalHeaders: Object.freeze({}) });
    const validationMs = Math.max(0, nowMs() - validationStarted);

    return {
      value,
      path: 'validated',
      check,
      relay: {
        checkOk,
        observeOk: null,
        observeDeferred: false,
        ...(checkError ? { checkError } : {})
      },
      timings: Object.freeze({ checkMs, validationMs, observeMs: 0 })
    };
  }
}

function incompleteReason(error) {
  const text = errorText(error);
  if (text.includes('source_native_conditional is available but was not measured')) return 'source_native_conditional_unmeasured';
  if (text.includes('provider_native_cache is available but was not measured')) return 'provider_native_cache_unmeasured';
  if (text.includes('local_cache is available but was not measured')) return 'local_cache_unmeasured';
  return 'evaluation_error';
}

export async function runStandardsShadowBenchmark({
  fetchImpl = fetch,
  origin = process.env.SEENRELAY_ORIGIN || DEFAULT_ORIGIN,
  githubToken = process.env.GITHUB_TOKEN || '',
  standardsSource,
  writeFiles = false
} = {}) {
  const source = standardsSource ?? await fs.readFile(new URL('../src/standards.ts', import.meta.url), 'utf8');
  const tracked = parseTrackedStandards(source);
  const definitions = sourceDefinitions(tracked, githubToken);
  const client = new CheckOnlyShadowClient({ baseUrl: origin, fetchImpl });
  const proof = new SeenRelayShadowProof(client, { benchmarkRecordLimit: 100 });
  let validatorAvailabilityCount = 0;

  for (const definition of definitions) {
    await proof.guard({
      fact: definition.fact,
      knownValue: definition.knownValue,
      maxAgeSeconds: MAX_AGE_SECONDS,
      validate: async () => {
        const validated = await definition.validate(fetchImpl);
        if (validated.sourceValidatorAvailable) validatorAvailabilityCount += 1;
        return validated.value;
      },
      benchmark: {
        reuse: reuseKnownOnSameObserved,
        baselineCost: 1,
        checkCost: 1,
        observeCost: 0,
        observeAfterBaseline: false
      }
    });
  }

  const controls = {
    local_cache: { available: false, measured: false },
    source_native_conditional: { available: validatorAvailabilityCount > 0, measured: false },
    provider_native_cache: { available: false, measured: false }
  };
  const input = proof.hostileBenchmarkInput({ workloadId: WORKLOAD_ID, controls, observeOffCriticalPath: true });

  let evaluation = null;
  let evaluationState = 'complete';
  let evaluationReason = null;
  try {
    evaluation = evaluateHostileBenchmark(input);
  } catch (error) {
    evaluationState = 'incomplete';
    evaluationReason = incompleteReason(error);
  }

  const summary = Object.freeze({
    schema_version: 1,
    workload_id: WORKLOAD_ID,
    first_party: true,
    external_adoption_evidence: false,
    source_count: definitions.length,
    source_native_validator_available_count: validatorAvailabilityCount,
    observe_requests_sent: client.getTelemetry().observeNetworkRequests,
    benchmark_records: input.records.length,
    evaluation_state: evaluationState,
    evaluation_reason: evaluationReason
  });

  if (summary.observe_requests_sent !== 0) throw new Error('standards shadow benchmark must never send OBSERVE');

  if (writeFiles) {
    await fs.writeFile('standards-shadow-benchmark.json', `${JSON.stringify(input, null, 2)}\n`);
    await fs.writeFile('standards-shadow-summary.json', `${JSON.stringify(summary, null, 2)}\n`);
    await fs.writeFile('standards-shadow-evaluation.json', `${JSON.stringify(evaluation, null, 2)}\n`);
  }

  return { input, summary, evaluation };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStandardsShadowBenchmark({ writeFiles: true })
    .then(({ summary, evaluation }) => {
      console.log(JSON.stringify({ event: 'standards_shadow_summary', ...summary }));
      if (evaluation) console.log(JSON.stringify({ event: 'standards_shadow_evaluation', decision: evaluation.decision, safety: evaluation.safety }));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
