import { createHash } from 'node:crypto';

const EXPECTED_BROWSERGYM_COMMIT = '9e779f087de9a65668b6974d11f9ce9816026e96';
const EXPECTED_AGENTLAB_COMMIT = 'cbc35a9bc0facaf731bc858c5825edbe757c719f';
const SHA = /^sha256:[0-9a-f]{64}$/;

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
function bool(v, name) { if (typeof v !== 'boolean') throw new TypeError(`${name} invalid`); return v; }
function median(xs) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function collectTaskIdentity(record) {
  const taskName = record['env_args.task_name'];
  if (typeof taskName !== 'string' || !taskName) throw new TypeError('env_args.task_name required');
  const seed = record['env_args.task_seed'];
  if (seed !== null && seed !== undefined && (typeof seed !== 'number' || !Number.isFinite(seed))) throw new TypeError('env_args.task_seed invalid');
  const maxSteps = record['env_args.max_steps'];
  if (maxSteps !== null && maxSteps !== undefined && (typeof maxSteps !== 'number' || !Number.isFinite(maxSteps) || maxSteps < 0)) throw new TypeError('env_args.max_steps invalid');
  const taskKwargs = {};
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('env_args.task_kwargs.')) taskKwargs[key.slice('env_args.task_kwargs.'.length)] = value;
  }
  return { task_name: taskName, task_seed: seed ?? null, max_steps: maxSteps ?? null, task_kwargs: taskKwargs };
}

/**
 * Imports AgentLab ExpResult.get_exp_record()/summary_info evidence for a preregistered
 * BrowserGym WebArenaVerified run. Raw task text, action strings, screenshots, network
 * traces, model content, errors and stack traces are not retained.
 *
 * AgentLab does not reliably classify err_msg as agent-vs-environment failure at this
 * revision, so errored episodes are excluded as ambiguous rather than counted as failures.
 */
export function importBrowserGymWebArenaNeutralRecords(records, options = {}) {
  if (options.browserGymCommit !== EXPECTED_BROWSERGYM_COMMIT) throw new TypeError('BrowserGym commit does not match preregistered cohort');
  if (options.agentLabCommit !== EXPECTED_AGENTLAB_COMMIT) throw new TypeError('AgentLab commit does not match preregistered harness');
  const sourceEvidenceFingerprint = requireSha(options.sourceEvidenceFingerprint, 'sourceEvidenceFingerprint');
  const runtimeEvidenceFingerprint = requireSha(options.runtimeEvidenceFingerprint, 'runtimeEvidenceFingerprint');
  if (!Array.isArray(records) || records.length === 0) throw new TypeError('non-empty records required');

  const implementationCoordinate = fp({ browsergym_commit: EXPECTED_BROWSERGYM_COMMIT, agentlab_commit: EXPECTED_AGENTLAB_COMMIT });
  const sanitizedEpisodes = [];
  const correctWork = { agentSeconds: [], envSeconds: [], actions: [] };
  const eligibleTotals = { agentSeconds: 0, envSeconds: 0, actions: 0 };
  let ambiguousErrorsExcluded = 0;
  let incompleteExcluded = 0;
  let eligible = 0;
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new TypeError(`records[${i}] must be object`);
    const taskCoordinate = fp(collectTaskIdentity(r));
    if (typeof r.exp_id !== 'string' || !r.exp_id) throw new TypeError(`records[${i}].exp_id required for private attempt pairing`);
    const attemptCoordinate = fp({ task_coordinate: taskCoordinate, implementation_coordinate: implementationCoordinate, runtime_coordinate: runtimeEvidenceFingerprint, exp_id: r.exp_id });
    const err = r.err_msg;
    if (!(err === null || err === undefined || typeof err === 'string')) throw new TypeError(`records[${i}].err_msg invalid`);
    const terminated = bool(r.terminated, `records[${i}].terminated`);
    const truncated = bool(r.truncated, `records[${i}].truncated`);

    if (typeof err === 'string' && err.length) { ambiguousErrorsExcluded += 1; continue; }
    if (!terminated && !truncated) { incompleteExcluded += 1; continue; }

    const rawReward = metric(r.cum_raw_reward, `records[${i}].cum_raw_reward`);
    if (rawReward > 1) throw new TypeError(`records[${i}].cum_raw_reward outside full-success scale`);
    const nSteps = metric(r.n_steps, `records[${i}].n_steps`);
    if (!Number.isInteger(nSteps)) throw new TypeError(`records[${i}].n_steps must be integer`);
    const agentSeconds = metric(r['stats.cum_agent_elapsed'], `records[${i}].stats.cum_agent_elapsed`);
    const envSeconds = metric(r['stats.cum_step_elapsed'], `records[${i}].stats.cum_step_elapsed`);

    const acceptedOutcome = rawReward === 1 && terminated === true && truncated === false;
    eligible += 1;
    eligibleTotals.agentSeconds += agentSeconds;
    eligibleTotals.envSeconds += envSeconds;
    eligibleTotals.actions += nSteps;
    if (acceptedOutcome) {
      passed += 1;
      correctWork.agentSeconds.push(agentSeconds);
      correctWork.envSeconds.push(envSeconds);
      correctWork.actions.push(nSteps);
    } else failed += 1;

    sanitizedEpisodes.push(Object.freeze({
      attempt_coordinate: attemptCoordinate,
      task_coordinate: taskCoordinate,
      implementation_coordinate: implementationCoordinate,
      runtime_coordinate: runtimeEvidenceFingerprint,
      accepted_outcome: acceptedOutcome,
      evaluator_score: rawReward,
      work: Object.freeze({
        agent_elapsed_seconds: agentSeconds,
        environment_step_elapsed_seconds: envSeconds,
        browser_actions: nSteps,
        model_tokens: null,
        cost_usd: null,
        network_requests: null,
      }),
    }));
  }

  if (!eligible) throw new TypeError('no eligible completed browser episodes available');

  const proofEnvelope = {
    schema: 'seenrelay-browsergym-webarena-neutral-run-v1',
    browsergym_commit: EXPECTED_BROWSERGYM_COMMIT,
    agentlab_commit: EXPECTED_AGENTLAB_COMMIT,
    source_evidence_fingerprint: sourceEvidenceFingerprint,
    runtime_evidence_fingerprint: runtimeEvidenceFingerprint,
    implementation_coordinate: implementationCoordinate,
    eligible_episodes: eligible,
    passed_episodes: passed,
    failed_episodes: failed,
    ambiguous_error_episodes_excluded: ambiguousErrorsExcluded,
    incomplete_episodes_excluded: incompleteExcluded,
    sanitized_episodes: sanitizedEpisodes,
    normalized_attempts: sanitizedEpisodes,
  };

  return Object.freeze({
    ...proofEnvelope,
    evidence_class: 'external_neutral_task_replay',
    counts_as_natural_evidence: false,
    counts_as_external_adoption: false,
    accepted_outcome_evaluator: 'external_webarena_verified_programmatic_reward',
    correctness_pass_rate: passed / eligible,
    work_per_correct_completion: Object.freeze({
      agent_elapsed_seconds: passed > 0 ? eligibleTotals.agentSeconds / passed : null,
      environment_step_elapsed_seconds: passed > 0 ? eligibleTotals.envSeconds / passed : null,
      browser_actions: passed > 0 ? eligibleTotals.actions / passed : null,
      model_tokens: null,
      cost_usd: null,
      network_requests: null,
    }),
    work_on_correct_tasks: Object.freeze({
      median_agent_elapsed_seconds: median(correctWork.agentSeconds),
      median_environment_step_elapsed_seconds: median(correctWork.envSeconds),
      median_browser_actions: median(correctWork.actions),
      median_model_tokens: null,
      median_cost_usd: null,
      median_network_requests: null,
    }),
    error_classification_policy: 'agentlab_err_msg_ambiguous_excluded',
    raw_task_identity_retained: false,
    task_kwargs_retained: false,
    raw_actions_retained: false,
    screenshots_retained: false,
    network_traces_retained: false,
    model_content_retained: false,
    errors_retained: false,
    stack_traces_retained: false,
    optimizer_authorized: false,
    proof_fingerprint: fp(proofEnvelope),
  });
}
