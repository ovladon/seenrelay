// Research-only: advisory change-impact classification, never active cache authorization.
const sha = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const name = s => typeof s === 'string' && s.length > 0;

export function classifyDeltaEvidence(previous, current) {
  const no = (reason, affected = []) => ({
    decision:'REVALIDATION_REQUIRED', reason, affected,
    auto_reuse_authorized:false, verified_customer_savings_usd:null
  });
  if (!previous || !current) return no('MISSING_SNAPSHOT');
  if (previous.schema !== 'seenrelay-commit-evidence-snapshot-v0' ||
      current.schema !== 'seenrelay-commit-evidence-current-v0') return no('INVALID_SCHEMA');
  if (!name(previous.scope) || previous.scope !== current.scope) return no('SCOPE_CHANGED_OR_MISSING');
  if (!name(previous.operation) || previous.operation !== current.operation) return no('OPERATION_CHANGED_OR_MISSING');
  if (!sha(previous.environment_digest) || previous.environment_digest !== current.environment_digest)
    return no('ENVIRONMENT_CHANGED_OR_MISSING');
  if (previous.proof?.authoritative_validated !== true ||
      previous.proof?.dependencies_complete !== true ||
      previous.proof?.artifact_present !== true || current.artifact_present !== true)
    return no('PROOF_OR_ARTIFACT_UNAVAILABLE');
  if (!sha(previous.proof.output_digest)) return no('OUTPUT_FINGERPRINT_UNKNOWN');
  if (previous.policy?.side_effect_class !== 'read_only' ||
      previous.policy?.exact_single_answer_shareable !== true ||
      previous.policy?.independent_samples_required !== false) return no('UNSAFE_OR_INDEPENDENT_WORK');
  if (!Array.isArray(previous.dependencies) || !previous.dependencies.length ||
      !Array.isArray(current.dependencies)) return no('DEPENDENCY_MANIFEST_MISSING');
  if (!Number.isSafeInteger(current.now_ms) || current.now_ms < 0) return no('CURRENT_TIME_UNKNOWN');
  const latest = new Map();
  for (const item of current.dependencies) {
    if (!name(item?.key) || !sha(item.fingerprint) || latest.has(item.key))
      return no('UNKNOWN_OR_DUPLICATE_CURRENT_DEPENDENCY');
    latest.set(item.key,item);
  }
  if (latest.size !== previous.dependencies.length) return no('DEPENDENCY_SET_CHANGED');
  const observed = new Set();
  const changed = [];
  for (const dep of previous.dependencies) {
    if (!name(dep?.key) || !sha(dep.fingerprint) || observed.has(dep.key))
      return no('INVALID_PRIOR_DEPENDENCY');
    observed.add(dep.key);
    const currentDep = latest.get(dep.key);
    if (!currentDep) return no('DEPENDENCY_SET_CHANGED');
    if (dep.kind === 'mutable_external') {
      // The caller must validate current external state; Delta cannot infer freshness.
      if (currentDep.source_verified !== true ||
          !Number.isSafeInteger(currentDep.valid_until_ms) ||
          current.now_ms >= currentDep.valid_until_ms)
        return no('EXTERNAL_STATE_NOT_AUTHORITATIVELY_FRESH',[dep.key]);
    } else if (dep.kind !== 'git_blob' && dep.kind !== 'tool_config') {
      return no('UNSUPPORTED_DEPENDENCY_KIND');
    }
    if (currentDep.fingerprint !== dep.fingerprint) changed.push(dep.key);
  }
  if (changed.length) return no('DEPENDENCY_FINGERPRINT_CHANGED',changed);
  return {
    decision:'REUSE_CANDIDATE_AFTER_NATIVE_CONTROLS',
    reason:'ALL_DECLARED_INPUTS_MATCH_WITH_REQUIRED_PROVENANCE',
    affected:[],
    auto_reuse_authorized:false,
    verified_customer_savings_usd:null
  };
}
