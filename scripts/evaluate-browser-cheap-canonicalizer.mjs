import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  buildStructuredSurface,
  hasRequiredInputIdentity,
  isDeterministicRetrievalTask,
  normalizeText
} from './diagnose-browser-request-representation-geometry.mjs';

const PLACEHOLDER = /{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g;
const REMAINING_PLACEHOLDER = /{{\s*[A-Za-z_][A-Za-z0-9_]*\s*}}/;

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function renderFrozenTemplate(template, instantiation) {
  const normalizedTemplate = normalizeText(template);
  if (!normalizedTemplate) return { ok: false, reason: 'empty_template', rendered: null };
  if (!instantiation || typeof instantiation !== 'object' || Array.isArray(instantiation)) {
    return { ok: false, reason: 'invalid_instantiation_dict', rendered: null };
  }

  let failure = null;
  let replacementCount = 0;
  const rendered = normalizedTemplate.replace(PLACEHOLDER, (_match, identifier) => {
    if (!Object.prototype.hasOwnProperty.call(instantiation, identifier)) {
      failure = failure ?? 'missing_placeholder_value';
      return _match;
    }
    const value = instantiation[identifier];
    const type = typeof value;
    if (value === null || !['string', 'number', 'boolean'].includes(type)) {
      failure = failure ?? 'unsupported_placeholder_value_type';
      return _match;
    }
    replacementCount += 1;
    return String(value);
  });

  if (failure) return { ok: false, reason: failure, rendered: null };
  if (REMAINING_PLACEHOLDER.test(rendered)) {
    return { ok: false, reason: 'unresolved_placeholder', rendered: null };
  }
  return { ok: true, reason: null, rendered: normalizeText(rendered), replacement_count: replacementCount };
}

export function classifyCanonicalizer(hitTasks) {
  return hitTasks >= 100
    ? 'CHEAP_CANONICALIZER_PARITY_EXISTS_ON_CONTROLLED_SUBSET'
    : 'INSUFFICIENT_CONTROLLED_CANONICALIZER_SAMPLE';
}

function pct(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(6)) : 0;
}

export function evaluateCheapCanonicalizer(records, source = {}) {
  if (!Array.isArray(records)) throw new TypeError('dataset root must be an array');

  let lockedRetrievalTasks = 0;
  let rendererAttemptedTasks = 0;
  let rendererFullyResolvedTasks = 0;
  let exactRoundtripTasks = 0;
  let exactPayloadCacheMissTasks = 0;
  let cheapCanonicalizerHitTasks = 0;
  const rendererFailures = {};

  for (const task of records) {
    if (!isDeterministicRetrievalTask(task) || !hasRequiredInputIdentity(task)) continue;
    lockedRetrievalTasks += 1;

    const surfaceA = normalizeText(task.intent);
    const surfaceB = buildStructuredSurface(task);
    const exactPayloadAKey = sha256(`text\0${surfaceA}`);
    const exactPayloadBKey = sha256(`json\0${surfaceB}`);
    if (exactPayloadAKey !== exactPayloadBKey) exactPayloadCacheMissTasks += 1;

    rendererAttemptedTasks += 1;
    const rendered = renderFrozenTemplate(task.intent_template, task.instantiation_dict);
    if (!rendered.ok) {
      rendererFailures[rendered.reason] = (rendererFailures[rendered.reason] ?? 0) + 1;
      continue;
    }
    rendererFullyResolvedTasks += 1;

    const renderedText = normalizeText(rendered.rendered);
    if (renderedText === surfaceA) exactRoundtripTasks += 1;

    const canonicalAKey = sha256(surfaceA);
    const canonicalBKey = sha256(renderedText);
    if (canonicalAKey === canonicalBKey) cheapCanonicalizerHitTasks += 1;
  }

  return {
    schema: 'seenrelay-private290-cheap-canonicalizer-report-v1',
    source: {
      repository: source.repository ?? null,
      revision: source.revision ?? null,
      dataset_sha256: source.datasetSha256 ?? null,
      dataset_bytes: source.datasetBytes ?? null
    },
    locked_retrieval_tasks: lockedRetrievalTasks,
    renderer_attempted_tasks: rendererAttemptedTasks,
    renderer_fully_resolved_tasks: rendererFullyResolvedTasks,
    renderer_failures: Object.fromEntries(Object.entries(rendererFailures).sort(([a], [b]) => a.localeCompare(b))),
    exact_roundtrip_tasks: exactRoundtripTasks,
    exact_roundtrip_percent_of_locked: pct(exactRoundtripTasks, lockedRetrievalTasks),
    exact_payload_cache_miss_tasks: exactPayloadCacheMissTasks,
    exact_payload_cache_miss_percent_of_locked: pct(exactPayloadCacheMissTasks, lockedRetrievalTasks),
    cheap_canonicalizer_hit_tasks: cheapCanonicalizerHitTasks,
    cheap_canonicalizer_hit_percent_of_locked: pct(cheapCanonicalizerHitTasks, lockedRetrievalTasks),
    cheap_canonicalizer_hit_percent_of_fully_resolved: pct(cheapCanonicalizerHitTasks, rendererFullyResolvedTasks),
    classification: classifyCanonicalizer(cheapCanonicalizerHitTasks),
    methodology: {
      placeholder_regex: '{{ optional_whitespace identifier optional_whitespace }}',
      accepted_placeholder_value_types: ['string', 'number', 'boolean'],
      all_placeholders_must_resolve: true,
      remaining_placeholder_is_failure: true,
      normalization: 'CRLF/CR to LF plus trim only',
      case_folding: false,
      punctuation_normalization: false,
      whitespace_collapse: false,
      retrieved_data_property_read: false,
      retrieved_data_contents_inspected: false,
      evaluator_answer_used_to_construct_identity: false,
      task_id_used_to_construct_identity: false,
      llm_used: false,
      embeddings_used: false,
      fuzzy_matching_used: false,
      result_is_controlled_falsification_only: true,
      result_is_natural_prevalence: false,
      private285_pass_authorized: false,
      seenrelay_specific_advantage_proven: false
    },
    privacy: {
      aggregate_counts_only: true,
      raw_intents_retained: false,
      rendered_intents_retained: false,
      instantiation_values_retained: false,
      retrieved_data_retained: false,
      task_ids_retained: false,
      per_task_hashes_retained: false
    }
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key ?? '<end>'}`);
    args[key.slice(2)] = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input || !args.output) throw new Error('--input and --output are required');
  const raw = fs.readFileSync(args.input);
  const actualSha = sha256(raw);
  const expectedSha = args['source-sha256'];
  const expectedBytes = Number(args['source-bytes']);
  if (expectedSha && actualSha !== expectedSha) throw new Error(`source sha mismatch: ${actualSha}`);
  if (Number.isFinite(expectedBytes) && raw.length !== expectedBytes) throw new Error(`source byte mismatch: ${raw.length}`);
  const records = JSON.parse(raw.toString('utf8'));
  const report = evaluateCheapCanonicalizer(records, {
    repository: args['source-repository'],
    revision: args['source-revision'],
    datasetSha256: actualSha,
    datasetBytes: raw.length
  });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
