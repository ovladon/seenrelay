import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function hasRequiredInputIdentity(task) {
  return Boolean(
    task && typeof task === 'object' && !Array.isArray(task) &&
    Array.isArray(task.sites) && task.sites.length > 0 && task.sites.every((site) => typeof site === 'string' && site.trim()) &&
    normalizeText(task.intent) &&
    Number.isInteger(task.intent_template_id) &&
    normalizeText(task.intent_template) &&
    task.instantiation_dict && typeof task.instantiation_dict === 'object' && !Array.isArray(task.instantiation_dict)
  );
}

export function isDeterministicRetrievalTask(task) {
  if (!task || typeof task !== 'object' || !Array.isArray(task.eval)) return false;
  return task.eval.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.evaluator !== 'AgentResponseEvaluator') return false;
    const expected = entry.expected;
    if (!expected || typeof expected !== 'object') return false;
    return expected.task_type === 'retrieve' && expected.status === 'SUCCESS';
  });
}

export function buildStructuredSurface(task) {
  return stableJson({
    sites: task.sites,
    intent_template_id: task.intent_template_id,
    intent_template: normalizeText(task.intent_template),
    instantiation_dict: task.instantiation_dict
  });
}

export function diagnoseGeometry(records, source = {}) {
  if (!Array.isArray(records)) throw new TypeError('dataset root must be an array');

  let parseableRecords = 0;
  let retrievalTasks = 0;
  let retrievalWithIdentity = 0;
  let retrievalWithDistinctSurfaces = 0;

  for (const task of records) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) continue;
    parseableRecords += 1;
    if (!isDeterministicRetrievalTask(task)) continue;
    retrievalTasks += 1;
    if (!hasRequiredInputIdentity(task)) continue;
    retrievalWithIdentity += 1;
    const surfaceA = normalizeText(task.intent);
    const surfaceB = buildStructuredSurface(task);
    if (surfaceA !== surfaceB) retrievalWithDistinctSurfaces += 1;
  }

  return {
    schema: 'seenrelay-private289-geometry-report-v1',
    source: {
      repository: source.repository ?? null,
      revision: source.revision ?? null,
      dataset_sha256: source.datasetSha256 ?? null,
      dataset_bytes: source.datasetBytes ?? null
    },
    records_seen: records.length,
    parseable_records: parseableRecords,
    retrieval_tasks: retrievalTasks,
    retrieval_tasks_with_required_input_identity_fields: retrievalWithIdentity,
    retrieval_tasks_with_distinct_surface_a_and_surface_b: retrievalWithDistinctSurfaces,
    methodology: {
      evaluator_fields_read: ['evaluator', 'expected.task_type', 'expected.status'],
      retrieved_data_property_read: false,
      retrieved_data_contents_inspected: false,
      eval_expected_used_to_construct_identity: false,
      task_id_used_to_construct_identity: false,
      llm_used: false,
      embeddings_used: false,
      fuzzy_matching_used: false,
      result_is_geometry_only: true,
      private285_pass_authorized: false
    },
    privacy: {
      aggregate_counts_only: true,
      raw_intents_retained: false,
      structured_surfaces_retained: false,
      task_ids_retained: false,
      retrieved_data_retained: false,
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
  const actualSha = crypto.createHash('sha256').update(raw).digest('hex');
  const expectedSha = args['source-sha256'];
  const expectedBytes = Number(args['source-bytes']);
  if (expectedSha && actualSha !== expectedSha) throw new Error(`source sha mismatch: ${actualSha}`);
  if (Number.isFinite(expectedBytes) && raw.length !== expectedBytes) throw new Error(`source byte mismatch: ${raw.length}`);
  const records = JSON.parse(raw.toString('utf8'));
  const report = diagnoseGeometry(records, {
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
