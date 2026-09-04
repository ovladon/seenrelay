import { createHash } from 'node:crypto';

const EXPECTED_COMMIT = 'e655f0ad26c02f47e4625cb48617ccff0a437696';
const EXPECTED_GRADER = '2.1.0';
const SHA = /^sha256:[0-9a-f]{64}$/;

function stable(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('non-finite value');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  throw new TypeError('unsupported value');
}
function fp(v) { return `sha256:${createHash('sha256').update(stable(v)).digest('hex')}`; }
function requireSha(v, name) { if (typeof v !== 'string' || !SHA.test(v)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`); return v; }
function nullableMetric(v, name) { if (v === null) return null; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new TypeError(`${name} invalid`); return v; }
function median(xs) { if (!xs.length) return null; const a=[...xs].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }

/**
 * Imports an external mcp-use-evals run.json into privacy-minimized task evidence.
 * Raw task ids, prompts, transcript/memo paths, workspaces and errors are never retained.
 * Correctness and work remain separate; missing work metrics remain unknown.
 */
export function importMcpUseEvalsNeutralRun(run, options = {}) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new TypeError('run must be object');
  if (options.repositoryCommit !== EXPECTED_COMMIT) throw new TypeError('repository commit does not match preregistered cohort');
  const sourceEvidenceFingerprint = requireSha(options.sourceEvidenceFingerprint, 'sourceEvidenceFingerprint');
  if (!run.manifest || typeof run.manifest !== 'object' || Array.isArray(run.manifest)) throw new TypeError('run.manifest required');
  if (run.manifest.graderVersion !== EXPECTED_GRADER) throw new TypeError('graderVersion drifted from preregistered cohort');
  if (typeof run.batchId !== 'string' || !run.batchId) throw new TypeError('run.batchId required for private attempt pairing');
  if (!Array.isArray(run.trials) || run.trials.length === 0) throw new TypeError('non-empty trials required');

  let invalidInfra = 0, unscored = 0, eligible = 0, passed = 0, failed = 0;
  const passingWork = { durationMs: [], turns: [], tokensIn: [], tokensOut: [], toolCalls: [], costUsd: [] };
  const eligibleWorkTotals = { durationMs: 0, turns: 0, tokensIn: 0, tokensOut: 0, toolCalls: 0, costUsd: 0 };
  const knownCounts = { durationMs: 0, turns: 0, tokensIn: 0, tokensOut: 0, toolCalls: 0, costUsd: 0 };
  const sanitizedTrials = [];

  for (let i = 0; i < run.trials.length; i += 1) {
    const t = run.trials[i];
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new TypeError(`trials[${i}] must be object`);
    if (typeof t.valid !== 'boolean') throw new TypeError(`trials[${i}].valid invalid`);
    if (!t.grade || typeof t.grade !== 'object' || Array.isArray(t.grade)) throw new TypeError(`trials[${i}].grade required`);
    if (typeof t.grade.contractPass !== 'boolean' || typeof t.grade.scoredForPassRate !== 'boolean') throw new TypeError(`trials[${i}].grade contract invalid`);

    if (!t.valid) { invalidInfra++; continue; }
    if (!t.grade.scoredForPassRate) { unscored++; continue; }

    eligible++;
    if (t.grade.contractPass) passed++; else failed++;
    if (typeof t.task !== 'string' || !t.task || typeof t.promptHash !== 'string' || !t.promptHash) throw new TypeError(`trials[${i}] task identity required for private pairing`);
    const taskCoordinate = fp({ task: t.task, prompt_hash: t.promptHash });
    const implementationCoordinate = fp({ repository_commit: EXPECTED_COMMIT, grader_version: EXPECTED_GRADER, sdk_version: t.sdkVersion ?? null });
    const runtimeCoordinate = fp({ agent_runner: run.agentRunner ?? null, agent_model: run.agentModel ?? null, variant: t.variant ?? null });
    if (!Number.isInteger(t.trial) || t.trial < 0) throw new TypeError(`trials[${i}].trial invalid`);
    const attemptCoordinate = fp({ task_coordinate: taskCoordinate, implementation_coordinate: implementationCoordinate, runtime_coordinate: runtimeCoordinate, batch_id: run.batchId, trial: t.trial });
    const perf = t.perf;
    if (!perf || typeof perf !== 'object' || Array.isArray(perf)) throw new TypeError(`trials[${i}].perf required`);
    const work = {};
    for (const key of Object.keys(passingWork)) {
      const v = nullableMetric(perf[key], `trials[${i}].perf.${key}`);
      const normalizedKey = ({durationMs:'duration_ms',turns:'turns',tokensIn:'tokens_in',tokensOut:'tokens_out',toolCalls:'tool_calls',costUsd:'cost_usd'})[key];
      work[normalizedKey] = v;
      if (v !== null) { knownCounts[key]++; eligibleWorkTotals[key] += v; }
      if (t.grade.contractPass && v !== null) passingWork[key].push(v);
    }
    sanitizedTrials.push(Object.freeze({ attempt_coordinate: attemptCoordinate, task_coordinate: taskCoordinate, implementation_coordinate: implementationCoordinate, runtime_coordinate: runtimeCoordinate, accepted_outcome: t.grade.contractPass, work: Object.freeze(work) }));
  }
  if (!eligible) throw new TypeError('no valid scored trials available');

  const proofEnvelope = {
    schema: 'seenrelay-mcp-use-evals-neutral-run-v1',
    repository_commit: EXPECTED_COMMIT,
    grader_version: EXPECTED_GRADER,
    source_evidence_fingerprint: sourceEvidenceFingerprint,
    eligible_trials: eligible,
    passed_trials: passed,
    failed_trials: failed,
    invalid_infrastructure_trials: invalidInfra,
    unscored_trials: unscored,
    sanitized_trials: sanitizedTrials,
    normalized_attempts: sanitizedTrials,
  };

  return Object.freeze({
    ...proofEnvelope,
    evidence_class: 'external_neutral_task_replay',
    counts_as_natural_evidence: false,
    counts_as_external_adoption: false,
    accepted_outcome_evaluator: 'external_deterministic_functional_contract',
    correctness_pass_rate: passed / eligible,
    work_per_correct_completion: Object.freeze({
      duration_ms: passed > 0 && knownCounts.durationMs === eligible ? eligibleWorkTotals.durationMs / passed : null,
      turns: passed > 0 && knownCounts.turns === eligible ? eligibleWorkTotals.turns / passed : null,
      tokens_in: passed > 0 && knownCounts.tokensIn === eligible ? eligibleWorkTotals.tokensIn / passed : null,
      tokens_out: passed > 0 && knownCounts.tokensOut === eligible ? eligibleWorkTotals.tokensOut / passed : null,
      tool_calls: passed > 0 && knownCounts.toolCalls === eligible ? eligibleWorkTotals.toolCalls / passed : null,
      cost_usd: passed > 0 && knownCounts.costUsd === eligible ? eligibleWorkTotals.costUsd / passed : null,
    }),
    work_on_correct_tasks: Object.freeze({
      median_duration_ms: median(passingWork.durationMs),
      median_turns: median(passingWork.turns),
      median_tokens_in: median(passingWork.tokensIn),
      median_tokens_out: median(passingWork.tokensOut),
      median_tool_calls: median(passingWork.toolCalls),
      median_cost_usd: median(passingWork.costUsd),
    }),
    known_metric_counts: Object.freeze(knownCounts),
    task_pairing_coordinate: 'sha256(task,promptHash)',
    implementation_pairing_coordinate: 'sha256(repositoryCommit,graderVersion,sdkVersion)',
    raw_task_ids_retained: false,
    prompt_hashes_retained: false,
    transcripts_retained: false,
    memo_paths_retained: false,
    workspace_snapshots_retained: false,
    errors_retained: false,
    optimizer_authorized: false,
    proof_fingerprint: fp(proofEnvelope),
  });
}
