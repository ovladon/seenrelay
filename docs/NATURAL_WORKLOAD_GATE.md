# Natural workload admission gate

This gate tests whether shared CHECK adds incremental value after the best qualifying non-shared optimization has already been measured. It is designed to return negative results honestly.

Candidate admission and pre-screen rejection decisions are recorded in `docs/NATURAL_WORKLOAD_CANDIDATES.md`. A rejected candidate is not a substitute for a missing workload class unless new workload or control evidence changes the pre-screen result.

## Required evidence

Evaluate three independently defined natural workloads. Repetition must arise from the workload distribution; do not manufacture repeated facts merely to create CHECK hits.

Each preliminary workload screen should contain at least 100 protected calls. This is a screening floor, not a statistical-confidence claim.

Instrumentation and commissioning runs do not count toward that floor. Freeze the workload identity and collection rules before starting an evidence series; runs used to build, tune, reopen, debug, or verify the collector itself must be excluded from CHECK/OBSERVE evidence and from cumulative natural-workload counts.

For every workload:

1. `sample_type` is `natural_workload`;
2. `workload_id` is non-empty and unique within the three-workload set;
3. `workload_class` is one of the three exact classes below and appears exactly once in the set;
4. baseline is `best_existing_non_shared_path`;
5. every available local cache is measured;
6. every available source-native conditional path is measured;
7. every available provider-native cache/cache-only path is measured;
8. shadow validation remains authoritative;
9. every policy-accepted hypothetical reuse is compared with that authoritative result;
10. raw fact identities, sources and values are excluded from exported benchmark records.

The existing `SeenRelayShadowProof.hostileBenchmarkInput(...)` collector and hostile evaluator implement the evidence boundaries. `evaluateNaturalWorkloadSet(...)` additionally rejects duplicate workload IDs, duplicate classes, unknown classes, and sets that do not contain exactly three inputs.

## Three workload classes

Use exactly one independently defined workload from each class rather than three variants of one fixed fact:

- `structured_source_reads` — structured API/source-backed reads with stable machine locators;
- `browser_extraction_reads` — browser/extraction-backed public reads where provider-native cache is measured when available;
- `fleet_tool_validations` — fleet/tool validations where independent workers naturally re-check the same read-only state and do not share a better authoritative cache.

A workload may be rejected before collection if it has an equivalent authoritative shared cache or mandatory live validation on every request.

The class label is a methodological constraint, not evidence by itself. The workload distribution must still come from captured or faithfully replayed natural work rather than a sequence constructed to guarantee repeated facts.

If one required class has no admitted natural workload, the three-class admission set remains incomplete. Do not substitute another instance of an already represented class merely to complete the set.

## Decision

A workload is an incremental-value candidate only when there is no unsafe hypothetical reuse, comparison evidence is complete, and the prospective shared path beats the best measured baseline on both marginal cost and latency for that workload.

A safe workload that has no reuse opportunities or loses on economics is a valid negative result.

If all three completed natural workloads are negative, do not broaden public claims or enable shared CHECK by default. Re-evaluate the shared-hive thesis and keep the local/private/source-native path as the stronger product surface unless new evidence justifies another test.

No benchmark evaluator enables reuse automatically.
