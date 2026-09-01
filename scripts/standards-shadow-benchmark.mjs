import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { SeenRelayClient, reuseKnownOnSameObserved } from '../clients/typescript/dist/seenrelay.js';
import { SeenRelayShadowProof } from '../clients/typescript/dist/shadow-proof.js';
import { evaluateHostileBenchmark } from './evaluate-hostile-benchmark.mjs';

const DEFAULT_ORIGIN = 'https://seenrelay.com';
const WORKLOAD_ID = 'standards-watch-daily-v1';
const WORKLOAD_CLASS = 'structured_source_reads';
const MAX_AGE_SECONDS = 6 * 60 * 60;
const MAX_LEDGER_RECORDS = 1000;
const RECORD_KEYS = Object.freeze([
  'check_status', 'policy_reusable', 'reuse_would_match_validation', 'observe_after_baseline',
  'baseline_ms', 'baseline_cost', 'check_ms', 'observe_ms', 'check_cost', 'observe_cost'
]);

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function valueFingerprint(value) {
  const stable = (input) => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new TypeError('non-finite number');
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) return `[${input.map(stable).join(',')}]`;
    if (typeof input === 'object') {
      const keys = Object.keys(input).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(input[key])}`).join(',')}}`;
    }
    throw new TypeError('value is not JSON-serializable');
  };
  return createHash('sha256').update(stable(value)).digest('hex');
}

function safeHeaderValue(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\r\n]/.test(value)
    ? value
    : null;
}

function sourceValidator(headers) {
  const etag = safeHeaderValue(headers?.get?.('etag'));
  if (etag) return { kind: 'etag', value: etag };
  const lastModified = safeHeaderValue(headers?.get?.('last-modified'));
  if (lastModified) return { kind: 'last_modified', value: lastModified };
  return null;
}

function conditionalHeaders(stateEntry) {
  const validator = stateEntry?.validator;
  if (!validator || !safeHeaderValue(validator.value)) return {};
  if (validator.kind === 'etag') return { 'if-none-match': validator.value };
  if (validator.kind === 'last_modified') return { 'if-modified-since': validator.value };
  return {};
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
      stateKey: 'mcp',
      knownValue: tracked.mcp,
      baseHeaders: githubHeaders,
      fact: {
        subject: 'Latest MCP specification revision',
        predicate: 'version.latest',
        source: 'https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/contents/docs/specification?ref=main',
        locator: { scheme: 'source_key', value: 'latest-dated-specification-directory' }
      },
      async parse(response) {
        const data = await readJson(response, 'MCP specification');
        const versions = data.map((entry) => entry?.name).filter((name) => /^20\d\d-\d\d-\d\d$/.test(name)).sort();
        if (!versions.length) throw new Error('MCP specification: no dated revisions found');
        return versions.at(-1);
      }
    },
    {
      stateKey: 'mcp_sdk',
      knownValue: tracked.mcp_sdk,
      baseHeaders: npmHeaders,
      fact: {
        subject: 'Latest MCP TypeScript server SDK version',
        predicate: 'version.latest',
        source: 'https://registry.npmjs.org/%40modelcontextprotocol%2Fserver/latest',
        locator: { scheme: 'json_pointer', value: '/version' }
      },
      async parse(response) {
        const data = await readJson(response, 'MCP server SDK');
        if (typeof data?.version !== 'string' || !data.version) throw new Error('MCP server SDK: version missing');
        return data.version;
      }
    },
    {
      stateKey: 'a2a',
      knownValue: tracked.a2a,
      baseHeaders: githubHeaders,
      fact: {
        subject: 'Latest A2A specification release',
        predicate: 'version.latest',
        source: 'https://api.github.com/repos/a2aproject/A2A/releases/latest',
        locator: { scheme: 'source_key', value: 'normalized-latest-release-tag' }
      },
      async parse(response) {
        const data = await readJson(response, 'A2A release');
        const value = typeof data?.tag_name === 'string' ? data.tag_name.replace(/^v/, '') : '';
        if (!value) throw new Error('A2A release: tag missing');
        return value;
      }
    },
    {
      stateKey: 'otel',
      knownValue: tracked.otel,
      baseHeaders: githubHeaders,
      fact: {
        subject: 'Latest OpenTelemetry semantic conventions release',
        predicate: 'version.latest',
        source: 'https://api.github.com/repos/open-telemetry/semantic-conventions/releases/latest',
        locator: { scheme: 'source_key', value: 'normalized-latest-release-tag' }
      },
      async parse(response) {
        const data = await readJson(response, 'OpenTelemetry semantic conventions release');
        const value = typeof data?.tag_name === 'string' ? data.tag_name.replace(/^v/, '') : '';
        if (!value) throw new Error('OpenTelemetry semantic conventions release: tag missing');
        return value;
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

function sanitizedRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('ledger record must be an object');
  const keys = Object.keys(record).sort();
  if (keys.length !== RECORD_KEYS.length || !RECORD_KEYS.every((key) => keys.includes(key))) {
    throw new TypeError('ledger record contains non-sanitized fields');
  }
  return Object.fromEntries(RECORD_KEYS.map((key) => [key, record[key]]));
}

function priorLedgerRecords(previousLedger) {
  if (!previousLedger) return [];
  if (previousLedger.workload_id !== WORKLOAD_ID || previousLedger.workload_class !== WORKLOAD_CLASS) {
    throw new TypeError('previous ledger belongs to another workload');
  }
  if (!Array.isArray(previousLedger.records)) throw new TypeError('previous ledger records must be an array');
  return previousLedger.records.map(sanitizedRecord);
}

function priorCounter(previousLedger, key) {
  const value = previousLedger?.control_evidence?.[key];
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

async function readJsonFile(path) {
  if (!path) return null;
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function validPriorState(previousState) {
  if (!previousState || typeof previousState !== 'object' || Array.isArray(previousState)) return {};
  if (previousState.schema_version !== 1 || previousState.workload_id !== WORKLOAD_ID) return {};
  const entries = previousState.entries;
  return entries && typeof entries === 'object' && !Array.isArray(entries) ? entries : {};
}

export async function runStandardsShadowBenchmark({
  fetchImpl = fetch,
  origin = process.env.SEENRELAY_ORIGIN || DEFAULT_ORIGIN,
  githubToken = process.env.GITHUB_TOKEN || '',
  standardsSource,
  previousState = null,
  previousLedger = null,
  writeFiles = false
} = {}) {
  const source = standardsSource ?? await fs.readFile(new URL('../src/standards.ts', import.meta.url), 'utf8');
  const tracked = parseTrackedStandards(source);
  const definitions = sourceDefinitions(tracked, githubToken);
  const client = new CheckOnlyShadowClient({ baseUrl: origin, fetchImpl });
  const proof = new SeenRelayShadowProof(client, { benchmarkRecordLimit: 100 });
  const priorEntries = validPriorState(previousState);
  const nextEntries = {};
  let validatorAvailabilityCount = 0;
  let conditionalAttemptCount = 0;
  let conditional304Count = 0;

  for (const definition of definitions) {
    await proof.guard({
      fact: definition.fact,
      knownValue: definition.knownValue,
      maxAgeSeconds: MAX_AGE_SECONDS,
      validate: async () => {
        const prior = priorEntries[definition.stateKey];
        const conditional = conditionalHeaders(prior);
        const attempted = Object.keys(conditional).length > 0;
        if (attempted) conditionalAttemptCount += 1;

        const response = await fetchImpl(definition.fact.source, {
          headers: { ...definition.baseHeaders, ...conditional },
          signal: AbortSignal.timeout(15_000)
        });
        const validator = sourceValidator(response.headers) ?? prior?.validator ?? null;
        if (validator) validatorAvailabilityCount += 1;

        if (response.status === 304) {
          if (!attempted || typeof prior?.value_fingerprint !== 'string') {
            throw new Error(`${definition.stateKey}: invalid 304 without retained validator state`);
          }
          conditional304Count += 1;
          nextEntries[definition.stateKey] = { validator, value_fingerprint: prior.value_fingerprint };
          return prior.value_fingerprint === valueFingerprint(definition.knownValue)
            ? definition.knownValue
            : { seenrelay_shadow_prior_value_fingerprint: prior.value_fingerprint };
        }

        const value = await definition.parse(response);
        nextEntries[definition.stateKey] = {
          validator,
          value_fingerprint: valueFingerprint(value)
        };
        return value;
      },
      benchmark: {
        reuse: reuseKnownOnSameObserved,
        baselineCost: 0,
        checkCost: 0,
        observeCost: 0,
        observeAfterBaseline: false
      }
    });
  }

  const priorRecords = priorLedgerRecords(previousLedger);
  const currentControls = {
    local_cache: { available: false, measured: false },
    source_native_conditional: {
      available: validatorAvailabilityCount > 0 || priorCounter(previousLedger, 'validator_available_calls') > 0,
      measured: conditionalAttemptCount > 0 || priorCounter(previousLedger, 'conditional_attempts') > 0
    },
    provider_native_cache: { available: false, measured: false }
  };
  const currentInput = proof.hostileBenchmarkInput({
    workloadId: WORKLOAD_ID,
    controls: currentControls,
    observeOffCriticalPath: true
  });
  const records = [...priorRecords, ...currentInput.records.map(sanitizedRecord)].slice(-MAX_LEDGER_RECORDS);
  const controlEvidence = {
    validator_available_calls: priorCounter(previousLedger, 'validator_available_calls') + validatorAvailabilityCount,
    conditional_attempts: priorCounter(previousLedger, 'conditional_attempts') + conditionalAttemptCount,
    conditional_304_confirmations: priorCounter(previousLedger, 'conditional_304_confirmations') + conditional304Count
  };
  const cumulativeControls = {
    local_cache: { available: false, measured: false },
    source_native_conditional: {
      available: controlEvidence.validator_available_calls > 0,
      measured: controlEvidence.conditional_attempts > 0
    },
    provider_native_cache: { available: false, measured: false }
  };
  const input = Object.freeze({
    schema_version: 2,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    sample_type: 'natural_workload',
    baseline_definition: 'best_existing_non_shared_path',
    controls: cumulativeControls,
    observe_off_critical_path: true,
    records: Object.freeze(records)
  });

  let evaluation = null;
  let evaluationState = 'complete';
  let evaluationReason = null;
  try {
    evaluation = evaluateHostileBenchmark(input);
  } catch (error) {
    evaluationState = 'incomplete';
    evaluationReason = incompleteReason(error);
  }

  const state = Object.freeze({
    schema_version: 1,
    workload_id: WORKLOAD_ID,
    entries: nextEntries,
    raw_values_retained: false,
    sources_retained: false
  });
  const ledger = Object.freeze({
    schema_version: 1,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    natural_schedule: 'daily',
    records,
    control_evidence: controlEvidence,
    raw_values_retained: false,
    fact_identity_retained: false,
    sources_retained: false,
    timestamps_retained: false
  });
  const summary = Object.freeze({
    schema_version: 2,
    workload_id: WORKLOAD_ID,
    workload_class: WORKLOAD_CLASS,
    first_party: true,
    external_adoption_evidence: false,
    source_count: definitions.length,
    source_native_validator_available_count: validatorAvailabilityCount,
    source_native_conditional_attempt_count: conditionalAttemptCount,
    source_native_conditional_304_count: conditional304Count,
    observe_requests_sent: client.getTelemetry().observeNetworkRequests,
    current_run_benchmark_records: currentInput.records.length,
    cumulative_benchmark_records: records.length,
    preliminary_sample_floor_met: records.length >= 100,
    evaluation_state: evaluationState,
    evaluation_reason: evaluationReason
  });

  if (summary.observe_requests_sent !== 0) throw new Error('standards shadow benchmark must never send OBSERVE');

  if (writeFiles) {
    await fs.writeFile('standards-shadow-benchmark.json', `${JSON.stringify(input, null, 2)}\n`);
    await fs.writeFile('standards-shadow-summary.json', `${JSON.stringify(summary, null, 2)}\n`);
    await fs.writeFile('standards-shadow-evaluation.json', `${JSON.stringify(evaluation, null, 2)}\n`);
    await fs.writeFile('standards-shadow-state.json', `${JSON.stringify(state, null, 2)}\n`);
    await fs.writeFile('standards-shadow-ledger.json', `${JSON.stringify(ledger, null, 2)}\n`);
  }

  return { input, summary, evaluation, state, ledger };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Promise.all([
    readJsonFile(process.env.STANDARDS_SHADOW_PREVIOUS_STATE),
    readJsonFile(process.env.STANDARDS_SHADOW_PREVIOUS_LEDGER)
  ])
    .then(([previousState, previousLedger]) => runStandardsShadowBenchmark({
      previousState,
      previousLedger,
      writeFiles: true
    }))
    .then(({ summary, evaluation }) => {
      console.log(JSON.stringify({ event: 'standards_shadow_summary', ...summary }));
      if (evaluation) console.log(JSON.stringify({ event: 'standards_shadow_evaluation', decision: evaluation.decision, safety: evaluation.safety }));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
