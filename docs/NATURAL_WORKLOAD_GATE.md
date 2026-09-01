# Natural workload admission gate

This gate tests whether shared CHECK adds incremental value after the best qualifying non-shared optimization has already been measured. It is designed to return negative results honestly.

## Required evidence

Evaluate three independently defined natural workloads. Repetition must arise from the workload distribution; do not manufacture repeated facts merely to create CHECK hits.

Each preliminary workload screen should contain at least 100 protected calls. This is a screening floor, not a statistical-confidence claim.

For every workload:

1. `sample_type` is `natural_workload`;
2. baseline is `best_existing_non_shared_path`;
3. every available local cache is measured;
4. every available source-native conditional path is measured;
5. every available provider-native cache/cache-only path is measured;
6. shadow validation remains authoritative;
7. every policy-accepted hypothetical reuse is compared with that authoritative result;
8. raw fact identities, sources and values are excluded from exported benchmark records.

The existing `SeenRelayShadowProof.hostileBenchmarkInput(...)` collector and hostile evaluator implement these boundaries.

## Three workload classes

Select natural workloads from three distinct classes rather than three variants of one fixed fact:

- structured API/source-backed reads with stable machine locators;
- browser/extraction-backed public reads where provider-native cache is measured when available;
- fleet/tool validations where independent workers naturally re-check the same read-only state and do not share a better authoritative cache.

A workload may be rejected before collection if it has an equivalent authoritative shared cache or mandatory live validation on every request.

## Decision

A workload is an incremental-value candidate only when there is no unsafe hypothetical reuse, comparison evidence is complete, and the prospective shared path beats the best measured baseline on both marginal cost and latency for that workload.

A safe workload that has no reuse opportunities or loses on economics is a valid negative result.

If all three completed natural workloads are negative, do not broaden public claims or enable shared CHECK by default. Re-evaluate the shared-hive thesis and keep the local/private/source-native path as the stronger product surface unless new evidence justifies another test.

No benchmark evaluator enables reuse automatically.
