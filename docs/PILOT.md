# SeenRelay pilot guide

This pilot is designed to answer one question: **does recent source-backed observation reuse reduce repeated validation work without weakening the consuming workflow's own policy?**

SeenRelay supplies freshness evidence. It does not decide truth and should not replace existing validation policy during the measurement phase.

## 1. Choose a bounded fact class

Start with facts that are repeatedly checked, machine-locatable, operational rather than interpretive, and already validated by the participating workflow. Suitable examples include provider status, package versions, availability, capacity, or other changing source-backed values.

Avoid credentials, secrets, unnecessary sensitive personal data, and facts for which policy requires a fresh source check every time.

## 2. Run in shadow mode

For each validation your agent already intends to perform:

1. call `CHECK` first with the deterministic fact identity and caller-known value;
2. record the SeenRelay status, but do **not** skip the existing validation yet;
3. perform the normal source validation;
4. if the agent independently obtained the result for its own task, send `OBSERVE`;
5. compare the SeenRelay status with the normal validation result.

An empty network does not block the workflow. `UNKNOWN` simply means no sufficiently recent reusable observation is available.

## 3. Measure

Track at minimum:

- number of CHECK calls;
- status distribution (`UNKNOWN`, `STALE`, `SAME_OBSERVED`, `CHANGED_OBSERVED`, `CONTESTED`);
- how often `SAME_OBSERVED` agreed with the validation subsequently performed;
- how many validations could have been skipped under the consuming application's own freshness/risk policy;
- latency added by CHECK;
- validation latency/cost that would have been avoided;
- exceptions where policy required validation regardless of recent evidence.

Do not interpret raw OBSERVE volume, Hive contribution score, or first-party Reference Observer activity as external adoption or proof of correctness.

## 4. Decide whether bounded reuse is justified

Only after the shadow sample is adequate for the chosen fact class should the consuming application consider skipping a validation. A reasonable production rule must define all of the following explicitly:

- eligible fact classes;
- maximum accepted observation age;
- accepted SeenRelay statuses;
- conditions that always force a fresh source check;
- fallback behavior if SeenRelay is unavailable.

`UNKNOWN`, `STALE`, and `CONTESTED` should continue through the normal validation path. `CHANGED_OBSERVED` should normally trigger source validation. `SAME_OBSERVED` is evidence that the same value was recently observed; whether that is enough remains caller policy.

## 5. Fail open to the existing workflow

SeenRelay should be an optimization layer, not a dependency that prevents the original task from completing. If CHECK cannot be obtained or is not acceptable under policy, continue the validation the agent would have performed without SeenRelay.

## Interfaces

- MCP: `https://seenrelay.com/mcp`
- REST/OpenAPI: `https://seenrelay.com/openapi.json`
- Client setup: [`CLIENTS.md`](CLIENTS.md)
- Protocol semantics: [`PROTOCOL.md`](PROTOCOL.md)
- Technical data practices: `https://seenrelay.com/data-practices`
