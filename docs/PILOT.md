# SeenRelay decision-maker pilot

This pilot is designed to answer one question with measured evidence:

> Does a low-cost SeenRelay CHECK reduce redundant downstream validation work enough to justify the integration, while preserving the organization's own risk policy?

SeenRelay reports observations, not universal truth. The pilot must not silently convert observational freshness into authority.

## 1. Choose a bounded workflow

Select one workflow where agents repeatedly revalidate structured, source-backed facts. Good candidates have:

- a stable source or API;
- deterministic fact identity;
- repeated checks across unrelated runs or agents;
- measurable browser/API/search/model/human cost;
- a risk policy that can define acceptable freshness windows.

Avoid starting with high-stakes decisions or ambiguous facts.

## 2. Baseline first

Before using SeenRelay, measure the current workflow for a representative period:

- number of revalidation operations;
- source/API/browser/search/model calls;
- human-review operations where applicable;
- median and tail latency;
- direct variable cost;
- failures and retries.

Do not estimate savings without a baseline.

## 3. Shadow mode

Insert CHECK immediately before the existing validation, but **do not skip anything yet**.

```text
existing task
   ↓
CHECK
   ↓
record SeenRelay status
   ↓
perform the same validation as before
   ↓
OBSERVE the independently obtained result
```

Shadow mode answers:

- how often SeenRelay has relevant recent observations;
- how often it returns UNKNOWN, STALE or CONTESTED;
- whether deterministic fact identity converges as intended;
- what work could potentially have been avoided;
- what latency CHECK itself adds.

## 4. Predefine reuse policy

Before allowing any validation to be skipped, define the consuming application's policy outside SeenRelay. For each approved fact class, specify:

- maximum acceptable observation age;
- which statuses can influence behavior;
- whether one or multiple independent observation buckets are required;
- whether the fact is eligible for reuse at all;
- what happens on UNKNOWN, STALE, CONTESTED or policy uncertainty.

SeenRelay does not decide these thresholds for the caller.

## 5. Bounded reuse

Enable reuse only for the approved fact classes and freshness windows. Keep an immediate rollback path to shadow mode.

Do not expand to additional fact classes merely because the service is available.

## 6. Measure net utility

Track at least:

- CHECK opportunities;
- status distribution;
- qualified reuse events;
- downstream operations actually avoided;
- latency saved;
- variable cost saved;
- SeenRelay request/operating cost;
- policy incidents or unexpected behavior;
- fact-identity corrections;
- operational effort required to maintain the integration.

A useful decision metric is:

```text
net measured value
= avoided downstream work
- SeenRelay integration and operating cost
- additional operational burden
```

Qualified reuse is evidence of network utility, not evidence that a fact is universally true.

## 7. Kill criteria

Stop or return to shadow mode if any of these occur:

- deterministic identity causes unacceptable false convergence between distinct facts;
- the consuming application's risk policy cannot safely define bounded reuse;
- CHECK latency/cost materially exceeds the downstream work it can avoid;
- observation coverage remains too low to produce meaningful avoided work in the chosen workflow;
- CONTESTED/STALE behavior makes the workflow operationally noisier than the baseline;
- operational complexity exceeds measured savings;
- provenance or privacy behavior violates the organization's requirements;
- no defensible net utility can be demonstrated after the pre-agreed pilot period.

Set quantitative thresholds before the pilot where your organization has enough baseline data. Do not choose thresholds after seeing the outcome.

## 8. Expand only on evidence

If the pilot succeeds, expand one dimension at a time:

1. more eligible facts in the same workflow;
2. more agents in the same fleet;
3. another workflow with similar risk characteristics;
4. only later, broader organizational use.

Keep CHECK and OBSERVE semantics unchanged. Do not add a local interpretation layer that turns SeenRelay into a truth oracle or general memory system.

## Rollback

The safest rollback is simple: stop using SeenRelay results to suppress existing validation. The underlying workflow should continue exactly as it did before integration. OBSERVE can also be disabled by the caller without affecting its primary task.

## Technical references

- Quickstart: [`QUICKSTART.md`](QUICKSTART.md)
- Client integrations: [`CLIENTS.md`](CLIENTS.md)
- Protocol and fact identity: [`PROTOCOL.md`](PROTOCOL.md)
- Production OpenAPI: <https://seenrelay.com/openapi.json>
- Production MCP endpoint: <https://seenrelay.com/mcp>
