# Controlled experiment: commit-changing multi-worker code checks (2026-10-27)

**Status:** Passed in GitHub CI. **Evidence:** [Actions CI run 40547533179](https://github.com/ovladon/seenrelay/actions/runs/40547533179), test source [`tests/commit-churn-fleet.test.mjs`](../tests/commit-churn-fleet.test.mjs).

## Question
If several workers check the same git commit and a fix changes the code, does SeenRelay retain an economic opportunity after revision-sensitive invalidation?

## Method
- Create a real, isolated temporary git repository with two successive code commits.
- Four in-process workers (separate `SeenRelayFleetCoordinator` instances, one in-memory coordination store) call actual `node --check` against a revision-pinned source snapshot.
- Compare uncoordinated execution, best-native **same-process in-flight single-flight**, and the existing SeenRelay fleet SDK under the same immutable commit identity.
- A second scenario checks five distinct git commits with no equivalent overlap, plus five independently required reviews of one commit.
- Every result-affecting input relevant to this fixture, especially the exact git SHA, check command and runtime version, belongs to the coordinate.
- The deterministic check delay is controlled and artificial to allow overlapping requests. No external LLM, model context, provider tokens, customer traffic or paid API was invoked.

## Observed counts (CI 2026-10-27)

| Case | Uncoordinated | Native local single-flight | SeenRelay | Qualifier |
| --- | ---: | ---: | ---: | --- |
| Four workers x two immutable commits | 8 checks | 2 checks | 2 checks | 6 SeenRelay follower reuses; changed commit forces fresh authoritative check |
| Five distinct commits, one worker each | 5 checks | not independently measured | 5 checks | No compatible in-flight repetition |
| Five independent reviews of one commit | 5 checks | not applicable: independent work | 5 checks | Policy requires independent samples; not shareable |

**Result:** In the same-process case, SeenRelay removes 6 duplicate executions versus no coordination, but demonstrates **zero incremental avoided checks over the stronger native single-flight**. With fast changes/unique commit identities, it removes zero checks. A completed result is not automatically a sequential cache entry.

## Economics and safety interpretation
- **This is not a verified customer Savings Report.** No real third-party agent workflow, Microsoft Agent Framework adapter, model inference, prompt-context cost, token usage, billed validation, or money saved was tested.
- No net USD saving or advantage over native controls is established. The additional overhead from SeenRelay must be included in any real buyer comparison.
- Build/test results are potentially shareable only when inputs are truly identical and checks are deterministic. Independent model reviews, security judgments and deliberately separate tests may require distinct executions, even at the same commit.
- For mixed versions, scope reusable evidence to exact source/tree digest **and** relevant test command, toolchain, config, environment and tenant state. If identity cannot be stated accurately, do not coordinate.
- Churn does not make the invalidation machinery itself automatically expensive; the hard economic problem is that safe invalidation reduces or eliminates eligible repetition. Avoidance is useful only if the marginal priced work actually avoided exceeds all coordination/invalidation/integration overhead **and** strongest native/local baseline.
- Run a genuine opt-in natural-workload shadow audit with explicit provider-unit cost provenance before making any real multi-agent coding savings claim.

**Verdict for this isolated fixture:** `DO NOT USE` in favor of same-process native single-flight; for high churn and independent judgments, `DO NOT USE`. External commercial workload remains `INSUFFICIENT EVIDENCE`.
