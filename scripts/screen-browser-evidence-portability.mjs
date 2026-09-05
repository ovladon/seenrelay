import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const REPORT_SCHEMA = 'seenrelay-private287-browser-evidence-portability-report-v1';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError('unsupported JSON value');
}

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  return normalized.length > 0 ? normalized : null;
}

function evidenceNonempty(value) {
  if (value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

export function parseEvidence(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return { ok: false, reason: 'empty_evidence' };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'invalid_evidence_json' };
    }
  }
  if (!evidenceNonempty(parsed)) return { ok: false, reason: 'empty_evidence' };
  try {
    const canonical = stableJson(parsed);
    return { ok: true, key: sha256(canonical) };
  } catch {
    return { ok: false, reason: 'invalid_evidence_json' };
  }
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

export function normalizeContract(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'invalid_record' };
  const taskId = normalizeText(record.task_id);
  if (!taskId) return { ok: false, reason: 'missing_task_id' };
  const baseTaskId = normalizeText(record.base_task_id);
  if (!baseTaskId) return { ok: false, reason: 'missing_base_task_id' };
  const personaPolicy = normalizeText(record.persona_policy);
  if (!personaPolicy) return { ok: false, reason: 'missing_persona_policy' };
  const surfaceRequest = normalizeText(record.surface_request);
  if (!surfaceRequest) return { ok: false, reason: 'missing_surface_request' };
  const evidence = parseEvidence(record.evidence_to_collect_json);
  if (!evidence.ok) return evidence;
  return {
    ok: true,
    value: Object.freeze({
      task_id: taskId,
      base_task_id: baseTaskId,
      persona_policy: personaPolicy,
      surface_request: surfaceRequest,
      evidence_key: evidence.key
    })
  };
}

function pairEligible(a, b) {
  return a.base_task_id === b.base_task_id &&
    a.task_id !== b.task_id &&
    a.persona_policy !== b.persona_policy &&
    a.surface_request !== b.surface_request;
}

function percent(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(6));
}

export function classifyPortability({ eligiblePairs, identicalPairPercent }) {
  if (eligiblePairs < 100) return 'INSUFFICIENT_CONTROLLED_SAMPLE';
  if (identicalPairPercent < 5) return 'LOW_CONTROLLED_PORTABILITY';
  if (identicalPairPercent < 20) return 'LIMITED_CONTROLLED_PORTABILITY';
  return 'MATERIAL_CONTROLLED_PORTABILITY';
}

function increment(counter, key) {
  counter[key] = (counter[key] || 0) + 1;
}

export function evaluatePortability(document, {
  sourceRevision,
  sourceSha256,
  sourceBytes
} = {}) {
  const records = taskRecords(document);
  const rejected = {};
  const contracts = [];
  for (const record of records) {
    const normalized = normalizeContract(record);
    if (!normalized.ok) {
      increment(rejected, normalized.reason);
      continue;
    }
    contracts.push(normalized.value);
  }

  const groups = new Map();
  for (const contract of contracts) {
    const group = groups.get(contract.base_task_id) || [];
    group.push(contract);
    groups.set(contract.base_task_id, group);
  }

  let baseTasksWithEligiblePair = 0;
  let baseTasksWithPortableEvidence = 0;
  let eligiblePairs = 0;
  let identicalEvidencePairs = 0;
  let contractsWithPriorCrossPolicyCrossRequestCandidate = 0;
  let contractReuseOpportunities = 0;

  for (const group of groups.values()) {
    let groupEligiblePairs = 0;
    let groupIdenticalPairs = 0;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (!pairEligible(a, b)) continue;
        groupEligiblePairs += 1;
        eligiblePairs += 1;
        if (a.evidence_key === b.evidence_key) {
          groupIdenticalPairs += 1;
          identicalEvidencePairs += 1;
        }
      }
    }
    if (groupEligiblePairs > 0) baseTasksWithEligiblePair += 1;
    if (groupIdenticalPairs > 0) baseTasksWithPortableEvidence += 1;

    const ordered = [...group].sort((a, b) => a.task_id.localeCompare(b.task_id));
    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      const priorCandidates = ordered.slice(0, index).filter((prior) => pairEligible(prior, current));
      if (priorCandidates.length === 0) continue;
      contractsWithPriorCrossPolicyCrossRequestCandidate += 1;
      if (priorCandidates.some((prior) => prior.evidence_key === current.evidence_key)) {
        contractReuseOpportunities += 1;
      }
    }
  }

  const identicalEvidencePairPercent = percent(identicalEvidencePairs, eligiblePairs);
  const baseTaskPortabilityPercent = percent(baseTasksWithPortableEvidence, baseTasksWithEligiblePair);
  const contractReuseOpportunityPercent = percent(
    contractReuseOpportunities,
    contractsWithPriorCrossPolicyCrossRequestCandidate
  );

  return Object.freeze({
    schema: REPORT_SCHEMA,
    source: Object.freeze({
      dataset: 'WebRider/WebRider',
      revision: sourceRevision || null,
      tasks_sha256: sourceSha256 || null,
      tasks_bytes: Number.isInteger(sourceBytes) && sourceBytes >= 0 ? sourceBytes : null
    }),
    records_seen: records.length,
    eligible_contracts: contracts.length,
    rejected_records: Object.freeze(Object.fromEntries(Object.entries(rejected).sort(([a], [b]) => a.localeCompare(b)))),
    base_task_ids_with_eligible_contracts: groups.size,
    base_tasks_with_eligible_pair: baseTasksWithEligiblePair,
    eligible_cross_policy_cross_request_pairs: eligiblePairs,
    identical_evidence_pairs: identicalEvidencePairs,
    identical_evidence_pair_percent: identicalEvidencePairPercent,
    base_tasks_with_portable_evidence: baseTasksWithPortableEvidence,
    base_task_portability_percent: baseTaskPortabilityPercent,
    eligible_contracts_with_prior_cross_policy_cross_request_candidate: contractsWithPriorCrossPolicyCrossRequestCandidate,
    contract_reuse_opportunities: contractReuseOpportunities,
    contract_reuse_opportunity_percent: contractReuseOpportunityPercent,
    classification: classifyPortability({ eligiblePairs, identicalPairPercent: identicalEvidencePairPercent }),
    methodology: Object.freeze({
      evidence_structural_identity_only: true,
      object_key_order_ignored: true,
      array_order_preserved: true,
      semantic_matching_used: false,
      benchmark_repetition_constructed: true,
      result_is_natural_prevalence: false,
      result_authorizes_private285_pass: false,
      result_authorizes_seenrelay_reuse: false
    }),
    privacy: Object.freeze({
      surface_requests_retained: false,
      evidence_text_retained: false,
      persona_profiles_retained: false,
      task_ids_retained: false,
      base_task_ids_retained: false,
      per_key_hashes_retained: false,
      aggregate_counts_only: true
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
  const report = evaluatePortability(document, {
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
