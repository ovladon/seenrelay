import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DIAGNOSTIC_SCHEMA = 'seenrelay-private287a-contract-variation-report-v1';

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  return normalized.length > 0 ? normalized : null;
}

export function taskRecords(document) {
  if (Array.isArray(document)) return document;
  if (document && typeof document === 'object') {
    for (const key of ['tasks', 'records', 'data']) {
      if (Array.isArray(document[key])) return document[key];
    }
  }
  throw new TypeError('tasks.json must be an array or contain a tasks/records/data array');
}

function normalize(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const taskId = normalizeText(record.task_id);
  const baseTaskId = normalizeText(record.base_task_id);
  const personaPolicy = normalizeText(record.persona_policy);
  const surfaceRequest = normalizeText(record.surface_request);
  if (!taskId || !baseTaskId || !personaPolicy || !surfaceRequest) return null;
  return { taskId, baseTaskId, personaPolicy, surfaceRequest };
}

export function diagnoseVariation(document, { sourceRevision, sourceSha256, sourceBytes } = {}) {
  const records = taskRecords(document);
  const valid = records.map(normalize).filter(Boolean);
  const groups = new Map();
  for (const row of valid) {
    const group = groups.get(row.baseTaskId) || [];
    group.push(row);
    groups.set(row.baseTaskId, group);
  }

  let baseTasksWithMultipleContracts = 0;
  let baseTasksWithMultiplePersonaPolicies = 0;
  let baseTasksWithMultipleSurfaceRequests = 0;
  let baseTasksWithBothPolicyAndSurfaceVariation = 0;
  let sameBaseDifferentTaskPairs = 0;
  let sameBaseDifferentPolicyPairs = 0;
  let sameBaseDifferentSurfaceRequestPairs = 0;
  let sameBaseDifferentPolicyAndSurfaceRequestPairs = 0;

  for (const group of groups.values()) {
    if (group.length > 1) baseTasksWithMultipleContracts += 1;
    const policyCount = new Set(group.map((row) => row.personaPolicy)).size;
    const requestCount = new Set(group.map((row) => row.surfaceRequest)).size;
    if (policyCount > 1) baseTasksWithMultiplePersonaPolicies += 1;
    if (requestCount > 1) baseTasksWithMultipleSurfaceRequests += 1;
    if (policyCount > 1 && requestCount > 1) baseTasksWithBothPolicyAndSurfaceVariation += 1;

    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (a.taskId === b.taskId) continue;
        sameBaseDifferentTaskPairs += 1;
        const policyDiff = a.personaPolicy !== b.personaPolicy;
        const requestDiff = a.surfaceRequest !== b.surfaceRequest;
        if (policyDiff) sameBaseDifferentPolicyPairs += 1;
        if (requestDiff) sameBaseDifferentSurfaceRequestPairs += 1;
        if (policyDiff && requestDiff) sameBaseDifferentPolicyAndSurfaceRequestPairs += 1;
      }
    }
  }

  return Object.freeze({
    schema: DIAGNOSTIC_SCHEMA,
    source: Object.freeze({
      dataset: 'WebRider/WebRider',
      revision: sourceRevision || null,
      tasks_sha256: sourceSha256 || null,
      tasks_bytes: Number.isInteger(sourceBytes) && sourceBytes >= 0 ? sourceBytes : null
    }),
    records_seen: records.length,
    records_with_required_variation_fields: valid.length,
    base_tasks: groups.size,
    base_tasks_with_multiple_contracts: baseTasksWithMultipleContracts,
    base_tasks_with_multiple_persona_policies: baseTasksWithMultiplePersonaPolicies,
    base_tasks_with_multiple_surface_requests: baseTasksWithMultipleSurfaceRequests,
    base_tasks_with_both_policy_and_surface_variation: baseTasksWithBothPolicyAndSurfaceVariation,
    same_base_different_task_pairs: sameBaseDifferentTaskPairs,
    same_base_different_policy_pairs: sameBaseDifferentPolicyPairs,
    same_base_different_surface_request_pairs: sameBaseDifferentSurfaceRequestPairs,
    same_base_different_policy_and_surface_request_pairs: sameBaseDifferentPolicyAndSurfaceRequestPairs,
    boundaries: Object.freeze({
      evidence_identity_evaluated: false,
      evidence_similarity_evaluated: false,
      semantic_matching_used: false,
      posthoc_explanatory_only: true,
      private287_reclassified: false,
      private285_pass_authorized: false,
      seenrelay_reuse_authorized: false
    }),
    privacy: Object.freeze({
      aggregate_counts_only: true,
      raw_contract_content_retained: false,
      identifiers_retained: false
    })
  });
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') args.input = argv[++index];
    else if (token === '--source-revision') args.sourceRevision = argv[++index];
    else if (token === '--source-sha256') args.sourceSha256 = argv[++index];
    else if (token === '--source-bytes') args.sourceBytes = Number(argv[++index]);
    else if (token === '--output') args.output = argv[++index];
    else throw new Error(`unknown argument: ${token}`);
  }
  if (!args.input) throw new Error('--input is required');
  if (!args.sourceRevision) throw new Error('--source-revision is required');
  if (!args.sourceSha256) throw new Error('--source-sha256 is required');
  if (!Number.isInteger(args.sourceBytes) || args.sourceBytes < 0) throw new Error('--source-bytes must be a non-negative integer');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const document = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const report = diagnoseVariation(document, {
    sourceRevision: args.sourceRevision,
    sourceSha256: args.sourceSha256,
    sourceBytes: args.sourceBytes
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
