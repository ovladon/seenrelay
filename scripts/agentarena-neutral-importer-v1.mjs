import { createHash } from 'node:crypto';

const EXPECTED_COMMIT = '8aa817633747ad650f39b3d2708e4c09e30106ce';
const SHA = /^sha256:[0-9a-f]{64}$/;
const FUNCTIONAL_JUDGE_TYPES = new Set([
  'command',
  'test-result',
  'file-exists',
  'file-contains',
  'json-value',
  'glob',
  'file-count',
  'snapshot',
  'json-schema',
  'patch-validation',
  'directory-exists',
  'regex-match',
  'compilation',
]);

function stable(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('non-finite value');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  throw new TypeError('unsupported value');
}
function fp(v) { return `sha256:${createHash('sha256').update(stable(v)).digest('hex')}`; }
function requireSha(v, name) {
  if (typeof v !== 'string' || !SHA.test(v)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);
  return v;
}
function metric(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new TypeError(`${name} invalid`);
  return v;
}
function nullableMetric(v, name) {
  if (v === null || v === undefined) return null;
  return metric(v, name);
}
function median(xs) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function isInfrastructureExcluded(result) {
  if (result.scoreExcluded === true) return true;
  if (result.status === 'cancelled') return true;
  if (result.preflight?.status !== 'ready') return true;
  if (result.failureCategory === 'task-pack' || result.failureCategory === 'environment' || result.failureCategory === 'cancelled') return true;
  return false;
}
function reliableTokenUsage(result) {
  if (result.tokenUsageReliable === false) return null;
  if (typeof result.dataQualityWarning === 'string' && result.dataQualityWarning.length) return null;
  if (Array.isArray(result.missingCriticalEvents) && result.missingCriticalEvents.length) return null;
  return nullableMetric(result.tokenUsage, 'result.tokenUsage');
}
function knownCost(result) {
  const quality = result.costQuality ?? (result.costKnown === true ? 'known' : 'unavailable');
  if (quality !== 'known' || result.costKnown !== true) return null;
  return nullableMetric(result.estimatedCostUsd, 'result.estimatedCostUsd');
}
function tokenBreakdown(result, trusted) {
  if (trusted === null || result.tokenUsageBreakdown === undefined) {
    return Object.freeze({ input_tokens: null, output_tokens: null, reasoning_tokens: null, cache_read_tokens: null, cache_write_tokens: null });
  }
  const b = result.tokenUsageBreakdown;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new TypeError('result.tokenUsageBreakdown invalid');
  return Object.freeze({
    input_tokens: metric(b.inputTokens, 'result.tokenUsageBreakdown.inputTokens'),
    output_tokens: metric(b.outputTokens, 'result.tokenUsageBreakdown.outputTokens'),
    reasoning_tokens: metric(b.reasoningTokens, 'result.tokenUsageBreakdown.reasoningTokens'),
    cache_read_tokens: metric(b.cacheReadTokens, 'result.tokenUsageBreakdown.cacheReadTokens'),
    cache_write_tokens: metric(b.cacheWriteTokens, 'result.tokenUsageBreakdown.cacheWriteTokens'),
  });
}

/**
 * Imports an AgentArena BenchmarkRun summary into privacy-minimized coding-task evidence.
 * It never treats compositeScore as correctness and never retains prompts, diffs, trace paths,
 * stdout/stderr, workspace paths, labels, commands, model names, provider ids, or raw judge ids.
 */
export function importAgentArenaNeutralRun(run, options = {}) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new TypeError('run must be object');
  if (options.repositoryCommit !== EXPECTED_COMMIT) throw new TypeError('repository commit does not match preregistered cohort');
  const sourceEvidenceFingerprint = requireSha(options.sourceEvidenceFingerprint, 'sourceEvidenceFingerprint');
  if (typeof run.runId !== 'string' || !run.runId) throw new TypeError('run.runId required for private attempt pairing');
  if (!run.fairComparison || typeof run.fairComparison !== 'object' || Array.isArray(run.fairComparison)) {
    throw new TypeError('run.fairComparison required for matched-task evidence');
  }
  const { taskIdentity, judgeIdentity, repoBaselineIdentity } = run.fairComparison;
  for (const [name, value] of Object.entries({ taskIdentity, judgeIdentity, repoBaselineIdentity })) {
    if (typeof value !== 'string' || !value) throw new TypeError(`run.fairComparison.${name} required`);
  }
  if (!Array.isArray(run.results) || run.results.length === 0) throw new TypeError('non-empty run.results required');

  const taskCoordinate = fp({ task_identity: taskIdentity, judge_identity: judgeIdentity, repo_baseline_identity: repoBaselineIdentity });
  const implementationCoordinate = fp({ repository_commit: EXPECTED_COMMIT });
  const sanitizedAttempts = [];
  const correctWork = { durationMs: [], tokens: [], costUsd: [], inputTokens: [], outputTokens: [], reasoningTokens: [], cacheReadTokens: [], cacheWriteTokens: [] };
  const eligibleTotals = { durationMs: 0, tokens: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const eligibleKnown = { tokens: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let excluded = 0;
  let eligible = 0;
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < run.results.length; i += 1) {
    const r = run.results[i];
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new TypeError(`results[${i}] must be object`);
    if (r.adapterKind !== 'external' || r.baseAgentId !== 'codex') continue;
    if (isInfrastructureExcluded(r)) { excluded += 1; continue; }
    if (!Array.isArray(r.judgeResults)) throw new TypeError(`results[${i}].judgeResults required`);

    const functional = r.judgeResults.filter((j) => j && typeof j === 'object' && FUNCTIONAL_JUDGE_TYPES.has(j.type));
    if (functional.length === 0) throw new TypeError(`results[${i}] lacks deterministic functional judge evidence`);
    for (const j of functional) if (typeof j.success !== 'boolean') throw new TypeError(`results[${i}] judge success invalid`);

    const allFunctionalPassed = functional.every((j) => j.success === true);
    const executionCompleted = r.executionStatus === 'completed';
    const validationPassed = r.validationStatus === 'passed';
    const acceptedOutcome = r.status === 'success' && executionCompleted && validationPassed && allFunctionalPassed;

    const runtimeCoordinate = fp({
      base_agent_id: r.baseAgentId,
      variant_id: typeof r.variantId === 'string' ? r.variantId : null,
      requested: {
        model: r.requestedConfig?.model ?? null,
        reasoning_effort: r.requestedConfig?.reasoningEffort ?? null,
        provider_profile_id: r.requestedConfig?.providerProfileId ?? null,
      },
      resolved: {
        effective_model: r.resolvedRuntime?.effectiveModel ?? null,
        effective_reasoning_effort: r.resolvedRuntime?.effectiveReasoningEffort ?? null,
        effective_agent_version: r.resolvedRuntime?.effectiveAgentVersion ?? null,
        verification: r.resolvedRuntime?.verification ?? null,
      },
    });

    const durationMs = metric(r.durationMs, `results[${i}].durationMs`);
    const tokens = reliableTokenUsage(r);
    const costUsd = knownCost(r);
    const breakdown = tokenBreakdown(r, tokens);
    const attemptCoordinate = fp({ task_coordinate: taskCoordinate, implementation_coordinate: implementationCoordinate, runtime_coordinate: runtimeCoordinate, run_id: run.runId, result_index: i });
    const work = Object.freeze({
      duration_ms: durationMs,
      tokens,
      cost_usd: costUsd,
      ...breakdown,
      tool_events: null,
    });

    eligible += 1;
    eligibleTotals.durationMs += durationMs;
    if (tokens !== null) { eligibleTotals.tokens += tokens; eligibleKnown.tokens += 1; }
    if (costUsd !== null) { eligibleTotals.costUsd += costUsd; eligibleKnown.costUsd += 1; }
    if (breakdown.input_tokens !== null) { eligibleTotals.inputTokens += breakdown.input_tokens; eligibleKnown.inputTokens += 1; }
    if (breakdown.output_tokens !== null) { eligibleTotals.outputTokens += breakdown.output_tokens; eligibleKnown.outputTokens += 1; }
    if (breakdown.reasoning_tokens !== null) { eligibleTotals.reasoningTokens += breakdown.reasoning_tokens; eligibleKnown.reasoningTokens += 1; }
    if (breakdown.cache_read_tokens !== null) { eligibleTotals.cacheReadTokens += breakdown.cache_read_tokens; eligibleKnown.cacheReadTokens += 1; }
    if (breakdown.cache_write_tokens !== null) { eligibleTotals.cacheWriteTokens += breakdown.cache_write_tokens; eligibleKnown.cacheWriteTokens += 1; }
    if (acceptedOutcome) {
      passed += 1;
      correctWork.durationMs.push(durationMs);
      if (tokens !== null) correctWork.tokens.push(tokens);
      if (costUsd !== null) correctWork.costUsd.push(costUsd);
      if (breakdown.input_tokens !== null) correctWork.inputTokens.push(breakdown.input_tokens);
      if (breakdown.output_tokens !== null) correctWork.outputTokens.push(breakdown.output_tokens);
      if (breakdown.reasoning_tokens !== null) correctWork.reasoningTokens.push(breakdown.reasoning_tokens);
      if (breakdown.cache_read_tokens !== null) correctWork.cacheReadTokens.push(breakdown.cache_read_tokens);
      if (breakdown.cache_write_tokens !== null) correctWork.cacheWriteTokens.push(breakdown.cache_write_tokens);
    } else failed += 1;

    sanitizedAttempts.push(Object.freeze({
      attempt_coordinate: attemptCoordinate,
      task_coordinate: taskCoordinate,
      implementation_coordinate: implementationCoordinate,
      runtime_coordinate: runtimeCoordinate,
      accepted_outcome: acceptedOutcome,
      functional_judges: functional.length,
      functional_judges_passed: functional.filter((j) => j.success).length,
      work,
    }));
  }

  if (!eligible) throw new TypeError('no eligible codex task attempts available');

  const proofEnvelope = {
    schema: 'seenrelay-agentarena-neutral-run-v1',
    repository_commit: EXPECTED_COMMIT,
    source_evidence_fingerprint: sourceEvidenceFingerprint,
    task_coordinate: taskCoordinate,
    implementation_coordinate: implementationCoordinate,
    eligible_attempts: eligible,
    passed_attempts: passed,
    failed_attempts: failed,
    infrastructure_excluded_attempts: excluded,
    sanitized_attempts: sanitizedAttempts,
    normalized_attempts: sanitizedAttempts,
  };

  return Object.freeze({
    ...proofEnvelope,
    evidence_class: 'external_neutral_task_replay',
    counts_as_natural_evidence: false,
    counts_as_external_adoption: false,
    accepted_outcome_evaluator: 'external_functional_judges_no_composite_score',
    correctness_pass_rate: passed / eligible,
    work_per_correct_completion: Object.freeze({
      duration_ms: passed > 0 ? eligibleTotals.durationMs / passed : null,
      tokens: passed > 0 && eligibleKnown.tokens === eligible ? eligibleTotals.tokens / passed : null,
      cost_usd: passed > 0 && eligibleKnown.costUsd === eligible ? eligibleTotals.costUsd / passed : null,
      input_tokens: passed > 0 && eligibleKnown.inputTokens === eligible ? eligibleTotals.inputTokens / passed : null,
      output_tokens: passed > 0 && eligibleKnown.outputTokens === eligible ? eligibleTotals.outputTokens / passed : null,
      reasoning_tokens: passed > 0 && eligibleKnown.reasoningTokens === eligible ? eligibleTotals.reasoningTokens / passed : null,
      cache_read_tokens: passed > 0 && eligibleKnown.cacheReadTokens === eligible ? eligibleTotals.cacheReadTokens / passed : null,
      cache_write_tokens: passed > 0 && eligibleKnown.cacheWriteTokens === eligible ? eligibleTotals.cacheWriteTokens / passed : null,
      tool_events: null,
    }),
    work_on_correct_tasks: Object.freeze({
      median_duration_ms: median(correctWork.durationMs),
      median_tokens: median(correctWork.tokens),
      median_cost_usd: median(correctWork.costUsd),
      median_input_tokens: median(correctWork.inputTokens),
      median_output_tokens: median(correctWork.outputTokens),
      median_reasoning_tokens: median(correctWork.reasoningTokens),
      median_cache_read_tokens: median(correctWork.cacheReadTokens),
      median_cache_write_tokens: median(correctWork.cacheWriteTokens),
      median_tool_events: null,
    }),
    composite_score_used_for_correctness: false,
    trace_usage_imported: false,
    raw_task_identity_retained: false,
    raw_judge_identity_retained: false,
    raw_repo_identity_retained: false,
    raw_model_identity_retained: false,
    prompts_retained: false,
    diffs_retained: false,
    traces_retained: false,
    stdout_stderr_retained: false,
    workspace_paths_retained: false,
    optimizer_authorized: false,
    proof_fingerprint: fp(proofEnvelope),
  });
}
